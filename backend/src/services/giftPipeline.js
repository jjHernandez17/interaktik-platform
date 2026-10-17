'use strict';

// Convierte los mensajes de regalo de TikTok en eventos "listos para aplicar" que reciben todos los juegos.
//
// TikTok manda un regalo como UNO O VARIOS mensajes y, a veces, repetidos:
//  - Regalo sin racha: un mensaje por envio.
//  - Regalo con racha (combo): un mensaje por cada toque (repeatCount sube 1, 2, 3...) y uno de cierre (repeatEnd = 1)
//    con el total. Cada mensaje suele llegar duplicado.
//
// REGALOS "DISCRETOS" (visto en los logs reales): hay regalos que TikTok marca con combo=true pero con giftType distinto de 1
// (por ejemplo Mishka Bear y Confetti, type=2). Para ellos cada regalo llega como un mensaje propio con msgId nuevo,
// count=1, repeatEnd=0, y todos los de una misma tanda comparten el MISMO groupId: el conteo NUNCA sube y no hay mensaje de
// cierre. Tratarlos como una racha acumulada (1 -> "nada nuevo") hacia que el segundo regalo seguido se descartara. Ahora
// cada mensaje nuevo suma sus unidades (y un cierre, si llegara, solo suma lo que falte del grupo).
//
// Un SEGUNDO regalo del mismo espectador y el mismo tipo, mandado justo despues del primero, llega con una racha propia:
// un mensaje nuevo (msgId distinto) cuyo conteo vuelve a empezar en 1 (o un cierre que llega cuando la racha anterior ya
// cerro). Antes eso se confundia con "nada nuevo" (conteo <= lo ya entregado) y se descartaba en silencio. Ahora, si el
// mensaje es nuevo (msgId que esa racha no habia visto) y no puede ser la continuacion de la racha actual, abre una racha
// aparte. Los reenvios reales llevan el MISMO msgId, asi que siguen sin contarse dos veces.
//
// Este modulo garantiza tres cosas que antes se perdian:
//  1. Un regalo SIN racha se entrega siempre, aunque su repeatEnd nunca sea 1 (antes lo esperaban y no llegaba nunca).
//  2. Un regalo CON racha se entrega siempre, incluso si TikTok no manda el mensaje de cierre (se entrega por inactividad).
//  3. Nada se cuenta dos veces: los duplicados y el cierre repetido no suman de mas.
//
// Cada evento entregado es un "trozo a aplicar": repeatCount = unidades NUEVAS (nunca el acumulado) y repeatEnd = true.
// Asi cualquier juego puede aplicar repeatCount completo sin calcular diferencias propias.
//
// Modos:
//  - 'final': una racha se entrega al recibir su cierre (o por inactividad). Un solo evento por racha, con el total.
//  - 'delta': cada toque de la racha se entrega al instante (con las unidades nuevas). Para juegos donde cada unidad
//             es independiente y conviene que el efecto se vea en el momento.

const IDLE_FLUSH_MS = 8000;
const STREAK_TTL_MS = 180000;
const SEEN_MSG_LIMIT = 800;

function toPositiveInt(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isFlagTrue(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

// Un campo de identificacion vacio, "0" o ausente no identifica nada
function cleanId(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return text === '' || text === '0' ? '' : text;
}

// Datos que importan de un mensaje de regalo crudo de TikTok
function readGiftMessage(data) {
  const details = data?.giftDetails || {};
  const giftId = data?.giftId || details.giftId || details.id || '';
  const groupRaw = data?.groupId;
  const groupId = groupRaw && String(groupRaw) !== '0' ? String(groupRaw) : '';

  const msgId = cleanId(data?.common?.msgId) || cleanId(data?.msgId);
  const createTime = cleanId(data?.common?.createTime) || cleanId(data?.createTime);
  const orderId = cleanId(data?.orderId);

  // Tipo de regalo: 1 = regalo con racha acumulada. Combo marcado pero tipo conocido y distinto de 1 = regalo "discreto".
  const types = [details.giftType, data?.giftType].map(Number).filter(Number.isFinite);
  const isStreakType = types.includes(1);
  const comboFlag = details.combo === true;
  const discrete = comboFlag && types.length > 0 && !isStreakType;

  return {
    giftId: giftId ? String(giftId) : '',
    giftName: String(details.giftName || data?.giftName || ''),
    userKey: String(data?.user?.userId || data?.user?.uniqueId || ''),
    groupId,
    msgId,
    // Identidad del MENSAJE: el reenvio de un mensaje trae lo mismo (id, hora, pedido); dos regalos distintos que por algun
    // motivo compartan msgId se distinguen por la hora o el pedido. Con solo msgId (como en los datos de siempre) es igual que antes.
    uid: msgId || createTime || orderId ? [msgId, createTime, orderId].join('|') : '',
    count: toPositiveInt(data?.repeatCount || data?.giftCount, 1),
    ended: isFlagTrue(data?.repeatEnd),
    // Regalo con racha acumulada: giftType 1, o combo marcado cuando no se sabe el tipo
    streakable: !discrete && (comboFlag || isStreakType),
    // Combo marcado pero de otro tipo: cada mensaje es un regalo propio (ver arriba)
    discrete,
  };
}

function createGiftPipeline({
  mode = 'final',
  emit,
  log = () => {},
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof emit !== 'function') {
    throw new Error('createGiftPipeline necesita una funcion emit.');
  }

  const streaks = new Map();
  const discreteGroups = new Map(); // usuario|regalo|grupo -> { delivered, lastAt }
  const seenMsgIds = new Set();
  const seenOrder = [];

  function alreadySeen(msgId) {
    if (!msgId) return false;
    if (seenMsgIds.has(msgId)) return true;
    seenMsgIds.add(msgId);
    seenOrder.push(msgId);
    if (seenOrder.length > SEEN_MSG_LIMIT) {
      seenMsgIds.delete(seenOrder.shift());
    }
    return false;
  }

  function stopTimer(streak) {
    if (streak.timer) {
      clearTimer(streak.timer);
      streak.timer = null;
    }
  }

  // Entrega un trozo. Si la entrega falla se intenta una vez mas al instante; nunca se da por entregado algo que fallo.
  // Devuelve true si se entrego.
  function safeEmit(chunk, data, info) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        emit(chunk, data);
        return true;
      } catch (error) {
        log('error', { reason: 'entrega-fallida', attempt, message: error && error.message, ...info });
      }
    }
    return false;
  }

  function deliver(streak, units, reason) {
    if (units <= 0) return;
    streak.emitted += units;
    const chunk = {
      repeatCount: units,
      streakTotal: streak.emitted,
      reason,
      groupId: streak.groupId,
      streakable: true,
    };
    log('emit', { ...chunk, giftId: streak.giftId, user: streak.userKey });
    if (!safeEmit(chunk, streak.lastData, { giftId: streak.giftId, user: streak.userKey, units })) {
      // No se entrego: las unidades vuelven a quedar pendientes y se reintentan en un segundo (o con el siguiente mensaje)
      streak.emitted -= units;
      const retry = setTimer(() => {
        if (streak.timer === retry) streak.timer = null;
        deliver(streak, streak.lastCount - streak.emitted, 'retry');
      }, 1000);
      stopTimer(streak);
      streak.timer = retry;
      if (retry && typeof retry.unref === 'function') retry.unref();
    }
  }

  function flush(streak, reason) {
    stopTimer(streak);
    deliver(streak, streak.lastCount - streak.emitted, reason);
  }

  function prune(t) {
    for (const [key, group] of discreteGroups) {
      if (t - group.lastAt > STREAK_TTL_MS) discreteGroups.delete(key);
    }
    for (const [key, streak] of streaks) {
      if (t - streak.lastAt > STREAK_TTL_MS) {
        flush(streak, 'expired');
        streaks.delete(key);
      }
    }
  }

  function startStreak(key, raw, data, t, older = []) {
    const streak = {
      key,
      giftId: raw.giftId,
      userKey: raw.userKey,
      groupId: raw.groupId,
      emitted: 0,
      lastCount: 0,
      ended: false,
      lastAt: t,
      lastData: data,
      timer: null,
      msgIds: new Set(), // mensajes de esta racha ya vistos: un msgId nuevo = mensaje nuevo (no un reenvio)
      older, // rachas anteriores de este mismo espectador y regalo que ya se entregaron pero cuyo cierre aun no llega
    };
    streaks.set(key, streak);
    return streak;
  }

  function handle(data) {
    const t = now();
    prune(t);
    const raw = readGiftMessage(data);

    // ---- Regalo discreto (combo marcado, tipo distinto de 1): cada mensaje nuevo es un regalo; se entrega al instante
    if (raw.discrete) {
      // Solo un reenvio exacto del mismo mensaje se ignora (igual que en las rachas, el cierre puede compartir id)
      if (raw.uid && alreadySeen(`${raw.uid}|${raw.count}|${raw.ended ? 1 : 0}`)) {
        log('drop', { reason: 'duplicate-discrete-message', giftId: raw.giftId, user: raw.userKey });
        return { action: 'drop', reason: 'duplicate-message' };
      }

      const key = [raw.userKey, raw.giftId, raw.groupId].join('|');
      let group = discreteGroups.get(key);
      if (!group) {
        group = { delivered: 0, lastAt: t };
        discreteGroups.set(key, group);
      }
      group.lastAt = t;

      // Un mensaje normal trae sus propias unidades. Un cierre (si TikTok llegara a mandarlo) trae el total del grupo:
      // solo suma lo que todavia no se habia entregado.
      const units = raw.ended ? Math.max(0, raw.count - group.delivered) : raw.count;
      if (units <= 0) {
        log('noop', { reason: 'cierre-sin-unidades-nuevas', giftId: raw.giftId, user: raw.userKey, count: raw.count, delivered: group.delivered });
        return { action: 'noop', reason: 'end' };
      }

      group.delivered += units;
      const chunk = { repeatCount: units, streakTotal: group.delivered, reason: raw.ended ? 'end' : 'single', groupId: raw.groupId, streakable: false };
      log('emit', { ...chunk, giftId: raw.giftId, user: raw.userKey });
      if (!safeEmit(chunk, data, { giftId: raw.giftId, user: raw.userKey, units })) {
        // No se entrego: no cuenta como entregado y el mismo mensaje reenviado todavia puede entrar
        group.delivered -= units;
        seenMsgIds.delete(`${raw.uid}|${raw.count}|${raw.ended ? 1 : 0}`);
        return { action: 'error', reason: 'delivery-failed' };
      }
      return { action: 'emit', reason: raw.ended ? 'end' : 'single' };
    }

    // ---- Regalo sin racha: cada mensaje es un envio
    if (!raw.streakable) {
      if (alreadySeen(raw.uid)) {
        log('drop', { reason: 'duplicate-msgid', giftId: raw.giftId, user: raw.userKey });
        return { action: 'drop', reason: 'duplicate-msgid' };
      }
      const chunk = { repeatCount: raw.count, streakTotal: raw.count, reason: 'single', groupId: raw.groupId, streakable: false };
      log('emit', { ...chunk, giftId: raw.giftId, user: raw.userKey });
      const delivered = safeEmit(chunk, data, { giftId: raw.giftId, user: raw.userKey, units: raw.count });
      if (!delivered) {
        // Fallo dos veces: se olvida el id para que un reenvio del mismo mensaje todavia pueda entrar
        seenMsgIds.delete(raw.uid);
        return { action: 'error', reason: 'delivery-failed' };
      }
      return { action: 'emit', reason: 'single' };
    }

    // ---- Regalo con racha
    // Reenvio exacto del mismo mensaje (mismo id, mismo conteo, mismo estado): se ignora. Un cierre que comparta id con un
    // mensaje intermedio NO es un reenvio, porque cambia el conteo o el estado.
    if (raw.uid && alreadySeen(`${raw.uid}|${raw.count}|${raw.ended ? 1 : 0}`)) {
      log('drop', { reason: 'duplicate-streak-message', giftId: raw.giftId, user: raw.userKey });
      return { action: 'drop', reason: 'duplicate-streak-message' };
    }

    const key = [raw.userKey, raw.giftId, raw.groupId].join('|');
    let streak = streaks.get(key);
    let carriedOlder = [];

    // Una racha nueva con la misma clave: la anterior ya cerro, o la cuenta volvio a empezar sin groupId
    if (streak) {
      const isNewMessage = Boolean(raw.uid) && !streak.msgIds.has(raw.uid);

      const closedAndRestarted = streak.ended && !raw.ended;
      const countRestarted = !raw.groupId && !raw.ended && raw.count < streak.lastCount;
      // Segundo regalo mandado al instante: llega ya cerrado ({1, cierre}) cuando la racha anterior ya habia cerrado...
      const closedAfterClosed = streak.ended && raw.ended && streak.older.length === 0 && isNewMessage;
      // ...o llega abierto con el mismo conteo mientras la anterior todavia no cierra ({1} y otra vez {1}, sin groupId)
      const sameCountAgain = !raw.groupId && !raw.ended && !streak.ended && raw.count === streak.lastCount && isNewMessage;

      if (closedAndRestarted || countRestarted || closedAfterClosed || sameCountAgain) {
        // La racha que se reemplaza sigue esperando su cierre si todavia no lo recibio: ese cierre le toca a ella
        carriedOlder = streak.ended ? streak.older : streak.older.concat(streak);
        flush(streak, 'restart');
        streak = null;
      }
    }
    if (!streak) streak = startStreak(key, raw, data, t, carriedOlder);

    // Un cierre que llega mientras hay rachas anteriores esperando el suyo: se le asigna a la racha cuyo conteo coincide
    // (la actual, si coincide; si no, la anterior que coincida). Si ninguna coincide y la actual ya cerro, le toca a la
    // anterior mas antigua. Asi un cierre perdido de una racha nunca hace que el cierre de otra se cuente de mas.
    if (raw.ended && streak.older.length > 0) {
      const currentMatches = !streak.ended && streak.lastCount === raw.count;
      if (!currentMatches) {
        let index = streak.older.findIndex((waiting) => waiting.emitted === raw.count);
        if (index === -1 && streak.ended) index = 0;
        if (index !== -1) {
          const waiting = streak.older.splice(index, 1)[0];
          const before = waiting.emitted;
          deliver(waiting, raw.count - waiting.emitted, 'end');
          waiting.ended = true;
          streak.lastAt = t;
          if (raw.uid) streak.msgIds.add(raw.uid);
          return { action: waiting.emitted > before ? 'emit' : 'noop', reason: 'end-previous' };
        }
      }
    }

    streak.lastAt = t;
    streak.lastData = data;
    streak.lastCount = Math.max(streak.lastCount, raw.count);
    if (raw.uid) {
      streak.msgIds.add(raw.uid);
      if (streak.msgIds.size > 200) streak.msgIds.delete(streak.msgIds.values().next().value);
    }

    if (mode === 'delta') {
      const before = streak.emitted;
      deliver(streak, streak.lastCount - streak.emitted, raw.ended ? 'end' : 'tap');
      if (raw.ended) streak.ended = true;
      if (streak.emitted === before) log('noop', { reason: raw.ended ? 'end-sin-unidades-nuevas' : 'tap-sin-unidades-nuevas', giftId: raw.giftId, user: raw.userKey, count: raw.count, delivered: streak.emitted });
      return { action: streak.emitted > before ? 'emit' : 'noop', reason: raw.ended ? 'end' : 'tap' };
    }

    // modo 'final'
    if (raw.ended) {
      const before = streak.emitted;
      flush(streak, 'end');
      streak.ended = true;
      if (streak.emitted === before) log('noop', { reason: 'end-sin-unidades-nuevas', giftId: raw.giftId, user: raw.userKey, count: raw.count, delivered: streak.emitted });
      return { action: streak.emitted > before ? 'emit' : 'noop', reason: 'end' };
    }

    // racha en curso: se espera su cierre, con red de seguridad por si nunca llega
    stopTimer(streak);
    streak.timer = setTimer(() => {
      streak.timer = null;
      flush(streak, 'idle-flush');
    }, IDLE_FLUSH_MS);
    if (streak.timer && typeof streak.timer.unref === 'function') streak.timer.unref();
    return { action: 'wait', reason: 'streak-in-progress' };
  }

  // Al cerrar la conexion no se pierde nada de lo que estaba esperando su cierre
  function dispose() {
    for (const streak of streaks.values()) {
      flush(streak, 'disconnect');
    }
    streaks.clear();
  }

  return { handle, dispose, _streaks: streaks, _discreteGroups: discreteGroups };
}

module.exports = {
  createGiftPipeline,
  readGiftMessage,
  IDLE_FLUSH_MS,
};
