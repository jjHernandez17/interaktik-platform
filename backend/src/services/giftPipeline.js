'use strict';

// Convierte los mensajes de regalo de TikTok en eventos "listos para aplicar" que reciben todos los juegos.
//
// TikTok manda un regalo como UNO O VARIOS mensajes y, a veces, repetidos:
//  - Regalo sin racha: un mensaje por envio.
//  - Regalo con racha (combo): un mensaje por cada toque (repeatCount sube 1, 2, 3...) y uno de cierre (repeatEnd = 1)
//    con el total. Cada mensaje suele llegar duplicado.
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

// Datos que importan de un mensaje de regalo crudo de TikTok
function readGiftMessage(data) {
  const details = data?.giftDetails || {};
  const giftId = data?.giftId || details.giftId || details.id || '';
  const groupRaw = data?.groupId;
  const groupId = groupRaw && String(groupRaw) !== '0' ? String(groupRaw) : '';

  return {
    giftId: giftId ? String(giftId) : '',
    giftName: String(details.giftName || data?.giftName || ''),
    userKey: String(data?.user?.userId || data?.user?.uniqueId || ''),
    groupId,
    msgId: data?.common?.msgId || data?.msgId ? String(data?.common?.msgId || data?.msgId) : '',
    count: toPositiveInt(data?.repeatCount || data?.giftCount, 1),
    ended: isFlagTrue(data?.repeatEnd),
    // "combo" (el regalo admite racha) o giftType 1 (el tipo de regalo con racha segun TikTok)
    streakable: details.combo === true || Number(details.giftType) === 1 || Number(data?.giftType) === 1,
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
    emit(chunk, streak.lastData);
  }

  function flush(streak, reason) {
    stopTimer(streak);
    deliver(streak, streak.lastCount - streak.emitted, reason);
  }

  function prune(t) {
    for (const [key, streak] of streaks) {
      if (t - streak.lastAt > STREAK_TTL_MS) {
        flush(streak, 'expired');
        streaks.delete(key);
      }
    }
  }

  function startStreak(key, raw, data, t) {
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
    };
    streaks.set(key, streak);
    return streak;
  }

  function handle(data) {
    const t = now();
    prune(t);
    const raw = readGiftMessage(data);

    // ---- Regalo sin racha: cada mensaje es un envio
    if (!raw.streakable) {
      if (alreadySeen(raw.msgId)) {
        log('drop', { reason: 'duplicate-msgid', giftId: raw.giftId, user: raw.userKey });
        return { action: 'drop', reason: 'duplicate-msgid' };
      }
      const chunk = { repeatCount: raw.count, streakTotal: raw.count, reason: 'single', groupId: raw.groupId, streakable: false };
      log('emit', { ...chunk, giftId: raw.giftId, user: raw.userKey });
      emit(chunk, data);
      return { action: 'emit', reason: 'single' };
    }

    // ---- Regalo con racha
    // Reenvio exacto del mismo mensaje (mismo id, mismo conteo, mismo estado): se ignora. Un cierre que comparta id con un
    // mensaje intermedio NO es un reenvio, porque cambia el conteo o el estado.
    if (raw.msgId && alreadySeen(`${raw.msgId}|${raw.count}|${raw.ended ? 1 : 0}`)) {
      log('drop', { reason: 'duplicate-streak-message', giftId: raw.giftId, user: raw.userKey });
      return { action: 'drop', reason: 'duplicate-streak-message' };
    }

    const key = [raw.userKey, raw.giftId, raw.groupId].join('|');
    let streak = streaks.get(key);

    // Una racha nueva con la misma clave: la anterior ya cerro, o la cuenta volvio a empezar sin groupId
    if (streak) {
      const closedAndRestarted = streak.ended && !raw.ended;
      const countRestarted = !raw.groupId && !raw.ended && raw.count < streak.lastCount;
      if (closedAndRestarted || countRestarted) {
        flush(streak, 'restart');
        streak = null;
      }
    }
    if (!streak) streak = startStreak(key, raw, data, t);

    streak.lastAt = t;
    streak.lastData = data;
    streak.lastCount = Math.max(streak.lastCount, raw.count);

    if (mode === 'delta') {
      const before = streak.emitted;
      deliver(streak, streak.lastCount - streak.emitted, raw.ended ? 'end' : 'tap');
      if (raw.ended) streak.ended = true;
      return { action: streak.emitted > before ? 'emit' : 'noop', reason: raw.ended ? 'end' : 'tap' };
    }

    // modo 'final'
    if (raw.ended) {
      const before = streak.emitted;
      flush(streak, 'end');
      streak.ended = true;
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

  return { handle, dispose, _streaks: streaks };
}

module.exports = {
  createGiftPipeline,
  readGiftMessage,
  IDLE_FLUSH_MS,
};
