// tiktokinteractik/backend/src/services/robloxFightersService.js
//
// Pelea Callejera (Roblox): dos luchadores, uno por lado, pelean hasta quedarse sin vida. Los espectadores eligen un lado
// comentando su palabra (o se les asigna uno al mandar su primer regalo) y sus regalos activan poderes para ese lado.
// Aqui se convierten los regalos y comentarios de TikTok en filas de una cola que el juego de Roblox consulta por HTTP
// (mismo patron que robloxParkourService), y se guarda la configuracion de cada lado y el marcador de wins.
//
// Regla de oro de este juego: un regalo nunca se pierde. La cola entrega "al menos una vez": lo que el juego no confirma
// se vuelve a entregar, y el juego descarta lo que ya aplico por su id.

const pool = require('../database/pool');
const logger = require('../config/logger');
const { isSuperUserEmail } = require('../middleware/auth');

const SIDES = ['left', 'right'];
const STYLES = ['boxeador', 'karateka', 'luchador', 'ninja', 'taekwondo'];

// Poderes que puede activar un regalo. 'amount' = una cantidad (dano, vida, escudo, meteoros), 'duration' = segundos,
// 'style' = cambia el estilo de pelea. Un combo multiplica la cantidad o la duracion (con tope).
const POWERS = {
  golpe: { kind: 'amount', min: 1, max: 5000, def: 60 },
  hadouken: { kind: 'amount', min: 1, max: 5000, def: 90 },
  super: { kind: 'amount', min: 1, max: 10000, def: 300 },
  meteoros: { kind: 'amount', min: 1, max: 60, def: 6 },
  curar: { kind: 'amount', min: 1, max: 10000, def: 150 },
  escudo: { kind: 'amount', min: 1, max: 10000, def: 200 },
  furia: { kind: 'duration', min: 1, max: 120, def: 10 },
  velocidad: { kind: 'duration', min: 1, max: 120, def: 10 },
  congelar: { kind: 'duration', min: 1, max: 20, def: 3 },
  estilo: { kind: 'style' },
};

const DEFAULTS = {
  leftName: 'Rojo',
  rightName: 'Azul',
  leftColor: '#e63946',
  rightColor: '#3a86ff',
  leftStyle: 'karateka',
  rightStyle: 'ninja',
  winGoal: 5,
  roundSeconds: 90,
  maxHealth: 1000,
  aiLevel: 0,
};

const SETTINGS_CACHE_TTL_MS = 30000;
const VIEWER_CACHE_LIMIT = 5000;
const REDELIVER_AFTER_SECONDS = 20;
const QUEUE_MAX_AGE_MINUTES = 15; // lo que lleva mas tiempo sin entregarse se descarta (el juego no estaba abierto)
const VIEWER_FRESH_HOURS = 6; // solo cuentan como seguidores los espectadores activos en las ultimas horas

const settingsCache = new Map(); // userId -> { at, left, right } (palabras para elegir lado)
const viewerSideCache = new Map(); // userId -> Map(uniqueId -> side)

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- limpieza de datos ----------

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanName(value, fallback) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || fallback;
}

function cleanColor(value, fallback) {
  const color = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}

function cleanStyle(value, fallback) {
  const style = String(value ?? '').trim().toLowerCase();
  return STYLES.includes(style) ? style : fallback;
}

// Minusculas, sin acentos ni signos, espacios simples: "¡ROJO! 🔥" -> "rojo"
function normalizeComment(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

// El espectador elige lado comentando el nombre completo del lado o solo su primera letra, en mayusculas o minusculas,
// con o sin tildes: "Los Tigres", "los tigres", "LOS TIGRES!" o "l". La letra solo vale si no es tambien la inicial del otro
// lado (si las dos empiezan igual, hay que escribir el nombre completo).
function matchSide(comment, names) {
  const text = normalizeComment(comment);
  if (!text) return null;

  const left = normalizeComment(names.left);
  const right = normalizeComment(names.right);

  if (text === left) return 'left';
  if (text === right) return 'right';

  if (text.length === 1 && left[0] !== right[0]) {
    if (text === left[0]) return 'left';
    if (text === right[0]) return 'right';
  }
  return null;
}

// ---------- conversion fila <-> objeto ----------

function toSettings(row) {
  return {
    left: { name: row.left_name, color: row.left_color, style: row.left_style },
    right: { name: row.right_name, color: row.right_color, style: row.right_style },
    winGoal: row.win_goal,
    roundSeconds: row.round_seconds,
    maxHealth: row.max_health,
    aiLevel: row.ai_level,
  };
}

function toScore(row) {
  return {
    leftWins: row.left_wins,
    rightWins: row.right_wins,
    winGoal: row.win_goal,
    championsLeft: row.champions_left,
    championsRight: row.champions_right,
  };
}

// ---------- configuracion ----------

async function getOrCreateConfig(userId) {
  const existing = await pool.query('SELECT * FROM roblox_fighters_config WHERE user_id = $1', [userId]);
  if (existing.rowCount > 0) return existing.rows[0];

  const inserted = await pool.query(
    `INSERT INTO roblox_fighters_config (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = roblox_fighters_config.updated_at
     RETURNING *`,
    [userId],
  );
  return inserted.rows[0];
}

// Valida y junta lo que manda la pagina con lo que ya estaba guardado
function mergeSettings(currentRow, input) {
  const current = toSettings(currentRow);
  const next = {
    leftName: cleanName(input?.left?.name, current.left.name),
    rightName: cleanName(input?.right?.name, current.right.name),
    leftColor: cleanColor(input?.left?.color, current.left.color),
    rightColor: cleanColor(input?.right?.color, current.right.color),
    leftStyle: cleanStyle(input?.left?.style, current.left.style),
    rightStyle: cleanStyle(input?.right?.style, current.right.style),
    winGoal: clampInt(input?.winGoal, 1, 99, current.winGoal),
    roundSeconds: clampInt(input?.roundSeconds, 20, 180, current.roundSeconds),
    maxHealth: clampInt(input?.maxHealth, 200, 5000, current.maxHealth),
    aiLevel: clampInt(input?.aiLevel, 0, 3, current.aiLevel),
  };

  if (normalizeComment(next.leftName) === normalizeComment(next.rightName)) {
    throw badRequest('Los dos lados deben tener nombres distintos.');
  }
  return next;
}

async function updateSettings(userId, input) {
  const row = await getOrCreateConfig(userId);
  const next = mergeSettings(row, input);

  const result = await pool.query(
    `UPDATE roblox_fighters_config SET
       left_name = $2, right_name = $3, left_color = $4, right_color = $5, left_style = $6, right_style = $7,
       win_goal = $8, round_seconds = $9, max_health = $10, ai_level = $11,
       updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId, next.leftName, next.rightName, next.leftColor, next.rightColor, next.leftStyle, next.rightStyle,
      next.winGoal, next.roundSeconds, next.maxHealth, next.aiLevel],
  );

  settingsCache.delete(Number(userId));
  return result.rows[0];
}

// Verifica el ID contra la API publica de Roblox (nombre real + que exista) y lo vincula a la cuenta de la plataforma.
async function linkRobloxAccount(userId, robloxUserId) {
  const numericId = Number(robloxUserId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw badRequest('El ID de Roblox debe ser un numero valido.');
  }

  let robloxUsername;
  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${numericId}`);
    if (!response.ok) {
      throw badRequest('No se encontro ninguna cuenta de Roblox con ese ID.');
    }
    const data = await response.json();
    robloxUsername = String(data.name || '').slice(0, 60) || null;
  } catch (error) {
    if (error.status) throw error;
    logger.error('Error consultando la API de Roblox', error);
    const wrapped = new Error('No se pudo verificar el ID de Roblox. Intenta de nuevo.');
    wrapped.status = 502;
    throw wrapped;
  }

  await getOrCreateConfig(userId);
  try {
    const result = await pool.query(
      `UPDATE roblox_fighters_config SET roblox_user_id = $2, roblox_username = $3, updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, numericId, robloxUsername],
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      const wrapped = new Error('Esa cuenta de Roblox ya esta vinculada a otro usuario de la plataforma.');
      wrapped.status = 409;
      throw wrapped;
    }
    throw error;
  }
}

// ---------- reglas regalo -> poder ----------

async function listGiftRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, power, amount, duration_seconds, param, side, created_at
     FROM roblox_fighters_gift_rules
     WHERE user_id = $1
     ORDER BY created_at ASC, id ASC`,
    [userId],
  );
  return result.rows;
}

async function getGiftRulesByGiftId(userId) {
  const result = await pool.query(
    'SELECT gift_id, power, amount, duration_seconds, param, side FROM roblox_fighters_gift_rules WHERE user_id = $1',
    [userId],
  );
  return new Map(result.rows.map((row) => [String(row.gift_id), row]));
}

// Segun el tipo de poder, solo importa una de las tres cosas: cantidad, duracion o estilo
function normalizeRulePower({ power, amount, durationSeconds, param }) {
  const cleanPower = String(power ?? '').trim();
  const definition = POWERS[cleanPower];
  if (!definition) throw badRequest('Poder no valido.');

  if (definition.kind === 'amount') {
    return { power: cleanPower, amount: clampInt(amount, definition.min, definition.max, definition.def), durationSeconds: 0, param: null };
  }
  if (definition.kind === 'duration') {
    return { power: cleanPower, amount: 0, durationSeconds: clampInt(durationSeconds, definition.min, definition.max, definition.def), param: null };
  }

  const style = String(param ?? '').trim().toLowerCase();
  if (!STYLES.includes(style)) throw badRequest('Elige un estilo de pelea valido.');
  return { power: cleanPower, amount: 0, durationSeconds: 0, param: style };
}

async function upsertGiftRule(userId, { giftId, giftName, giftImageUrl, power, amount, durationSeconds, param }) {
  const cleanGiftId = String(giftId || '').trim().slice(0, 60);
  const cleanGiftName = String(giftName || '').trim().slice(0, 120);
  if (!cleanGiftId || !cleanGiftName) throw badRequest('Debes seleccionar un regalo.');

  // las reglas valen para los dos lados: el poder lo activa el lado que eligio el espectador
  const ruleSide = 'viewer';
  const rule = normalizeRulePower({ power, amount, durationSeconds, param });

  const result = await pool.query(
    `INSERT INTO roblox_fighters_gift_rules (user_id, gift_id, gift_name, gift_image_url, power, amount, duration_seconds, param, side)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET
       gift_name = EXCLUDED.gift_name,
       gift_image_url = EXCLUDED.gift_image_url,
       power = EXCLUDED.power,
       amount = EXCLUDED.amount,
       duration_seconds = EXCLUDED.duration_seconds,
       param = EXCLUDED.param,
       side = EXCLUDED.side,
       updated_at = NOW()
     RETURNING id, gift_id, gift_name, gift_image_url, power, amount, duration_seconds, param, side, created_at`,
    [userId, cleanGiftId, cleanGiftName, giftImageUrl || null, rule.power, rule.amount, rule.durationSeconds, rule.param, ruleSide],
  );
  return result.rows[0];
}

async function deleteGiftRule(userId, ruleId) {
  await pool.query('DELETE FROM roblox_fighters_gift_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
}

// ---------- espectadores y lados ----------

function viewerCacheFor(userId) {
  const key = Number(userId);
  let cache = viewerSideCache.get(key);
  if (!cache) {
    cache = new Map();
    viewerSideCache.set(key, cache);
  }
  return cache;
}

function rememberViewerSide(userId, uniqueId, side) {
  const cache = viewerCacheFor(userId);
  if (cache.size >= VIEWER_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(uniqueId, side);
}

async function getViewerSide(userId, uniqueId) {
  const cache = viewerCacheFor(userId);
  if (cache.has(uniqueId)) return cache.get(uniqueId);

  const result = await pool.query(
    'SELECT side FROM roblox_fighters_viewers WHERE user_id = $1 AND tiktok_unique_id = $2',
    [userId, uniqueId],
  );
  const side = result.rowCount > 0 ? result.rows[0].side : null;
  if (side) rememberViewerSide(userId, uniqueId, side);
  return side;
}

async function saveViewerSide(userId, uniqueId, nickname, side) {
  await pool.query(
    `INSERT INTO roblox_fighters_viewers (user_id, tiktok_unique_id, tiktok_nickname, side)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, tiktok_unique_id) DO UPDATE SET
       tiktok_nickname = EXCLUDED.tiktok_nickname,
       side = EXCLUDED.side,
       updated_at = NOW()`,
    [userId, uniqueId, nickname, side],
  );
  rememberViewerSide(userId, uniqueId, side);
}

async function getSupporterCounts(userId) {
  const result = await pool.query(
    `SELECT side, COUNT(*)::int AS total FROM roblox_fighters_viewers
     WHERE user_id = $1 AND updated_at > NOW() - ($2::int * INTERVAL '1 hour')
     GROUP BY side`,
    [userId, VIEWER_FRESH_HOURS],
  );
  const counts = { left: 0, right: 0 };
  for (const row of result.rows) {
    if (SIDES.includes(row.side)) counts[row.side] = Number(row.total) || 0;
  }
  return counts;
}

// ---------- cola ----------

// Un regalo es lo mas importante que pasa en vivo: si la base falla un instante, se reintenta antes de rendirse
async function enqueue(userId, item) {
  const values = [
    userId,
    item.kind,
    String(item.uniqueId).slice(0, 120),
    String(item.nickname).slice(0, 120),
    item.side,
    item.power || null,
    item.amount || 0,
    item.durationSeconds || 0,
    item.param || null,
  ];

  for (let attempt = 0; ; attempt += 1) {
    try {
      await pool.query(
        `INSERT INTO roblox_fighters_queue (user_id, kind, tiktok_unique_id, tiktok_nickname, side, power, amount, duration_seconds, param)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        values,
      );
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      logger.warn('[FIGHTERS] No se pudo guardar un evento en la cola, reintentando', error);
      await sleep(200 * (attempt + 1));
    }
  }
}

function whoIs(user) {
  const uniqueId = String(user?.uniqueId || '').trim() || 'espectador';
  return { uniqueId, nickname: String(user?.nickname || uniqueId) };
}

// Lado de un regalo: el que eligio el espectador; si todavia no eligio, se le asigna el lado con menos seguidores
// (asi la pelea queda pareja y el regalo nunca se pierde por no tener lado).
async function resolveGiftSide(userId, who) {
  const known = await getViewerSide(userId, who.uniqueId);
  if (known) return { side: known, joined: false };

  const counts = await getSupporterCounts(userId);
  let side;
  if (counts.left === counts.right) side = Math.random() < 0.5 ? 'left' : 'right';
  else side = counts.left < counts.right ? 'left' : 'right';

  await saveViewerSide(userId, who.uniqueId, who.nickname, side);
  return { side, joined: true };
}

// tiktokLiveManager entrega cada regalo ya normalizado: repeatCount = unidades nuevas de este evento.
async function handleGift(userId, { giftId, repeatCount, user } = {}) {
  if (!giftId) return;

  const rule = (await getGiftRulesByGiftId(userId)).get(String(giftId));
  if (!rule) return;

  const definition = POWERS[rule.power];
  if (!definition) return;

  const who = whoIs(user);
  const units = Math.max(1, Math.round(Number(repeatCount) || 1));
  const { side, joined } = await resolveGiftSide(userId, who);

  if (joined) {
    await enqueue(userId, { kind: 'join', uniqueId: who.uniqueId, nickname: who.nickname, side });
  }

  const item = { kind: 'power', uniqueId: who.uniqueId, nickname: who.nickname, side, power: rule.power };
  if (definition.kind === 'amount') {
    item.amount = Math.min(definition.max, Math.max(1, Number(rule.amount) * units));
  } else if (definition.kind === 'duration') {
    item.durationSeconds = Math.min(definition.max, Math.max(1, Number(rule.duration_seconds) * units));
  } else {
    item.param = rule.param;
  }

  await enqueue(userId, item);
  logger.info(`[FIGHTERS] regalo ${giftId} de @${who.uniqueId} -> ${rule.power} para ${side} (x${units})`);
}

async function getSideNames(userId) {
  const key = Number(userId);
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.at < SETTINGS_CACHE_TTL_MS) return cached;

  const row = await getOrCreateConfig(userId);
  const entry = { at: Date.now(), left: row.left_name, right: row.right_name };
  settingsCache.set(key, entry);
  return entry;
}

// Un comentario con el nombre de un lado (o su primera letra) hace que ese espectador apoye a ese lado
async function handleChatComment(userId, { comment, user } = {}) {
  if (!comment) return;

  const names = await getSideNames(userId);
  const side = matchSide(comment, names);
  if (!side) return;

  const who = whoIs(user);
  if (viewerCacheFor(userId).get(who.uniqueId) === side) return;

  await saveViewerSide(userId, who.uniqueId, who.nickname, side);
  await enqueue(userId, { kind: 'join', uniqueId: who.uniqueId, nickname: who.nickname, side });
}

// side: lado al que se manda el poder de prueba ('left' o 'right')
async function enqueueTestPower(userId, ruleId, side) {
  const result = await pool.query(
    'SELECT power, amount, duration_seconds, param FROM roblox_fighters_gift_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId],
  );

  if (result.rowCount === 0) {
    const error = new Error('Regla no encontrada.');
    error.status = 404;
    throw error;
  }

  const rule = result.rows[0];
  await enqueue(userId, {
    kind: 'power',
    uniqueId: 'test-user',
    nickname: 'Prueba',
    side: side === 'right' ? 'right' : 'left',
    power: rule.power,
    amount: rule.amount,
    durationSeconds: rule.duration_seconds,
    param: rule.param,
  });
}

function toQueueItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    side: row.side,
    power: row.power,
    amount: row.amount,
    duration: row.duration_seconds,
    param: row.param,
    uniqueId: row.tiktok_unique_id,
    nickname: row.tiktok_nickname,
  };
}

// Entrega lo pendiente y lo que se entrego hace tiempo sin confirmarse. El juego confirma con ackQueue().
async function pollQueue(userId, limit = 30) {
  const result = await pool.query(
    `UPDATE roblox_fighters_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM roblox_fighters_queue
       WHERE user_id = $1
         AND created_at > NOW() - ($4::int * INTERVAL '1 minute')
         AND (status = 'pending' OR (status = 'sent' AND sent_at < NOW() - ($3::int * INTERVAL '1 second')))
       ORDER BY created_at ASC, id ASC
       LIMIT $2
     )
     RETURNING id, kind, side, power, amount, duration_seconds, param, tiktok_unique_id, tiktok_nickname, created_at`,
    [userId, Math.max(1, Math.min(100, Number(limit) || 30)), REDELIVER_AFTER_SECONDS, QUEUE_MAX_AGE_MINUTES],
  );

  // De vez en cuando se borra lo ya confirmado hace mas de un dia
  if (Math.random() < 0.02) {
    pool.query("DELETE FROM roblox_fighters_queue WHERE (status = 'done' AND done_at < NOW() - INTERVAL '1 day') OR created_at < NOW() - INTERVAL '2 days'").catch(() => {});
  }

  return result.rows.sort((a, b) => a.id - b.id).map(toQueueItem);
}

async function ackQueue(userId, ids) {
  const clean = (Array.isArray(ids) ? ids : []).map((id) => Math.round(Number(id))).filter((id) => Number.isInteger(id) && id > 0).slice(0, 200);
  if (clean.length === 0) return 0;

  const result = await pool.query(
    "UPDATE roblox_fighters_queue SET status = 'done', done_at = NOW() WHERE user_id = $1 AND id = ANY($2::int[])",
    [userId, clean],
  );
  return result.rowCount;
}

// ---------- marcador ----------

async function getScore(userId) {
  return toScore(await getOrCreateConfig(userId));
}

// El juego avisa quien gano cada round. roundId evita contar dos veces el mismo round si el aviso se repite.
async function reportRoundResult(userId, { winner, roundId } = {}) {
  if (!['left', 'right', 'draw'].includes(winner)) throw badRequest('Ganador no valido.');

  const config = await getOrCreateConfig(userId);
  const cleanRoundId = roundId ? String(roundId).slice(0, 60) : null;

  if (cleanRoundId && config.last_round_id === cleanRoundId) {
    return { ...toScore(config), champion: null, duplicate: true };
  }

  const result = await pool.query(
    `UPDATE roblox_fighters_config SET
       left_wins = left_wins + $2,
       right_wins = right_wins + $3,
       last_round_id = COALESCE($4, last_round_id),
       updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId, winner === 'left' ? 1 : 0, winner === 'right' ? 1 : 0, cleanRoundId],
  );
  const row = result.rows[0];
  const score = toScore(row);

  const champion = row.left_wins >= row.win_goal ? 'left' : row.right_wins >= row.win_goal ? 'right' : null;
  if (!champion) return { ...score, champion: null, duplicate: false };

  // Alguien llego a la meta: se celebra con el marcador final y el siguiente campeonato empieza de cero
  const reset = await pool.query(
    `UPDATE roblox_fighters_config SET
       left_wins = 0, right_wins = 0,
       champions_left = champions_left + $2,
       champions_right = champions_right + $3,
       updated_at = NOW()
     WHERE user_id = $1
     RETURNING champions_left, champions_right`,
    [userId, champion === 'left' ? 1 : 0, champion === 'right' ? 1 : 0],
  );

  return {
    ...score,
    championsLeft: reset.rows[0].champions_left,
    championsRight: reset.rows[0].champions_right,
    champion,
    duplicate: false,
  };
}

async function resetScore(userId) {
  await getOrCreateConfig(userId);
  const result = await pool.query(
    `UPDATE roblox_fighters_config SET left_wins = 0, right_wins = 0, champions_left = 0, champions_right = 0, last_round_id = NULL, updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId],
  );
  return toScore(result.rows[0]);
}

// "Reiniciar juego" desde Roblox: descarta eventos pendientes y a quien eligio lado. No toca la configuracion ni las reglas.
async function resetGame(userId) {
  await pool.query('DELETE FROM roblox_fighters_queue WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM roblox_fighters_viewers WHERE user_id = $1', [userId]);
  viewerSideCache.delete(Number(userId));
}

// ---------- sesion del juego ----------

// Resuelve el ID de la cuenta de Roblox que abrio el juego a la cuenta de la plataforma vinculada, verificando acceso.
async function resolveLinkedUser(robloxUserId) {
  const numericId = Number(robloxUserId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { linked: false, hasAccess: false, userId: null };
  }

  const result = await pool.query(
    `SELECT rfc.user_id, au.email
     FROM roblox_fighters_config rfc
     JOIN app_users au ON au.id = rfc.user_id
     WHERE rfc.roblox_user_id = $1`,
    [numericId],
  );

  if (result.rowCount === 0) {
    return { linked: false, hasAccess: false, userId: null };
  }

  const { user_id: userId, email } = result.rows[0];

  if (isSuperUserEmail(email)) {
    return { linked: true, hasAccess: true, userId };
  }

  const accessService = require('./accessService');
  const hasAccess = await accessService.hasActiveAccess(userId);
  return { linked: true, hasAccess, userId };
}

// Lo que el juego necesita al arrancar y cada cierto tiempo: configuracion, marcador y cuantos apoyan a cada lado
async function getSessionPayload(userId) {
  const row = await getOrCreateConfig(userId);
  const supporters = await getSupporterCounts(userId);
  return { settings: toSettings(row), score: toScore(row), supporters };
}

module.exports = {
  SIDES,
  STYLES,
  POWERS,
  DEFAULTS,
  normalizeComment,
  matchSide,
  mergeSettings,
  normalizeRulePower,
  toSettings,
  toScore,
  getOrCreateConfig,
  updateSettings,
  linkRobloxAccount,
  listGiftRules,
  upsertGiftRule,
  deleteGiftRule,
  handleGift,
  handleChatComment,
  enqueueTestPower,
  pollQueue,
  ackQueue,
  getScore,
  reportRoundResult,
  resetScore,
  resetGame,
  resolveLinkedUser,
  getSessionPayload,
};
