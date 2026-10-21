// tiktokinteractik/backend/src/services/robloxF1Service.js
//
// Carrera de Formula 1 (Roblox): hasta 20 espectadores corren en una pista de 4 carriles. Se unen comentando una palabra
// (por defecto "!unirme") y sus regalos les dan turbo, un escudo o frenan a otros con aceite. Aqui se convierten los
// regalos y comentarios de TikTok en filas de una cola que el juego de Roblox consulta por HTTP (mismo patron que
// robloxFightersService) y se guarda la configuracion, las reglas y el marcador de victorias por espectador.
//
// Regla de oro: un regalo nunca se pierde. La cola entrega "al menos una vez": lo que el juego no confirma se vuelve a
// entregar y el juego descarta lo que ya aplico por su id.

const pool = require('../database/pool');
const logger = require('../config/logger');
const { isSuperUserEmail } = require('../middleware/auth');

const POWERS = ['turbo', 'slow', 'shield'];
const TARGETS = ['self', 'leader', 'last', 'random'];
const MIN_SECONDS = 1;
const MAX_SECONDS = 60;
const DEFAULT_SECONDS = { turbo: 8, slow: 6, shield: 10 };

const DEFAULT_KEYWORD = 'unirme';
const MIN_LAPS = 1;
const MAX_LAPS = 10;
const MIN_LOBBY = 10;
const MAX_LOBBY = 120;

const RULE_CACHE_TTL_MS = 30000;
const REDELIVER_AFTER_SECONDS = 20;
const QUEUE_MAX_AGE_MINUTES = 15; // lo que lleva mas tiempo sin entregarse se descarta (el juego no estaba abierto)
const JOIN_COOLDOWN_MS = 15000; // un mismo espectador no llena la cola de uniones repetidas
const JOIN_CACHE_LIMIT = 5000;
const MAX_UNITS_PER_GIFT = 30; // un combo de N regalos suma tiempo hasta este tope de unidades

const ruleCache = new Map(); // userId -> { at, byGiftId }
const settingsCache = new Map(); // userId -> { at, keyword }
const recentJoins = new Map(); // "userId|uniqueId" -> timestamp

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeKeyword(value) {
  const text = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  return text || DEFAULT_KEYWORD;
}

function foldComment(comment) {
  return String(comment || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[!¡\s.]+/g, ' ')
    .trim();
}

// Dos formas de unirse:
//   "1"                    -> corredor sin cuenta de Roblox (el juego le da una skin aleatoria)
//   "!unirme 123456789"    -> corredor con su skin de Roblox (la palabra y el "!" no distinguen mayusculas ni tildes)
// Devuelve { robloxUserId: number|null } o null si el comentario no es para unirse.
function parseJoin(comment, keyword) {
  const text = foldComment(comment);
  if (text === '1') return { robloxUserId: null };

  const match = new RegExp(`^${keyword} (\\d{1,15})$`).exec(text);
  if (match) {
    const robloxUserId = Number(match[1]);
    if (Number.isSafeInteger(robloxUserId) && robloxUserId > 0) return { robloxUserId };
  }
  return null;
}

function toSettings(row) {
  return {
    joinKeyword: row.join_keyword || DEFAULT_KEYWORD,
    laps: row.laps,
    lobbySeconds: row.lobby_seconds,
  };
}

function whoIs(user) {
  const uniqueId = String(user?.uniqueId || '').trim().replace(/^@/, '').slice(0, 120) || 'espectador';
  const nickname = String(user?.nickname || uniqueId).slice(0, 120);
  return { uniqueId, nickname };
}

// ---------- configuracion ----------

async function getOrCreateConfig(userId) {
  const existing = await pool.query('SELECT * FROM roblox_f1_config WHERE user_id = $1', [userId]);
  if (existing.rowCount > 0) return existing.rows[0];

  await pool.query('INSERT INTO roblox_f1_config (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const created = await pool.query('SELECT * FROM roblox_f1_config WHERE user_id = $1', [userId]);
  return created.rows[0];
}

async function updateSettings(userId, { joinKeyword, laps, lobbySeconds } = {}) {
  await getOrCreateConfig(userId);
  const result = await pool.query(
    `UPDATE roblox_f1_config SET
       join_keyword = $2,
       laps = $3,
       lobby_seconds = $4,
       updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId, normalizeKeyword(joinKeyword), clampInt(laps, MIN_LAPS, MAX_LAPS, 3), clampInt(lobbySeconds, MIN_LOBBY, MAX_LOBBY, 30)],
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
    if (!response.ok) throw badRequest('No se encontro ninguna cuenta de Roblox con ese ID.');
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
      `UPDATE roblox_f1_config SET roblox_user_id = $2, roblox_username = $3, updated_at = NOW()
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

function invalidateRuleCache(userId) {
  ruleCache.delete(Number(userId));
}

async function getRulesByGiftId(userId) {
  const cached = ruleCache.get(Number(userId));
  if (cached && Date.now() - cached.at < RULE_CACHE_TTL_MS) return cached.byGiftId;

  const result = await pool.query(
    'SELECT gift_id, power, target, seconds FROM roblox_f1_gift_rules WHERE user_id = $1',
    [userId],
  );
  const byGiftId = new Map(result.rows.map((row) => [String(row.gift_id), row]));
  ruleCache.set(Number(userId), { at: Date.now(), byGiftId });
  return byGiftId;
}

async function listGiftRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, power, target, seconds, created_at
     FROM roblox_f1_gift_rules WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows;
}

async function upsertGiftRule(userId, { giftId, giftName, giftImageUrl, power, target, seconds } = {}) {
  const cleanGiftId = String(giftId || '').trim().slice(0, 60);
  const cleanGiftName = String(giftName || '').trim().slice(0, 120);
  const cleanPower = String(power || '').trim();
  const cleanTarget = String(target || 'self').trim();

  if (!cleanGiftId || !cleanGiftName) throw badRequest('Debes seleccionar un regalo.');
  if (!POWERS.includes(cleanPower)) throw badRequest('Poder no valido.');
  if (!TARGETS.includes(cleanTarget)) throw badRequest('Objetivo no valido.');

  // Un escudo o un turbo solo tienen sentido para quien manda el regalo; el aceite se manda a otro carro
  const finalTarget = cleanPower === 'slow' && cleanTarget === 'self' ? 'leader' : cleanTarget;

  const result = await pool.query(
    `INSERT INTO roblox_f1_gift_rules (user_id, gift_id, gift_name, gift_image_url, power, target, seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET
       gift_name = EXCLUDED.gift_name,
       gift_image_url = EXCLUDED.gift_image_url,
       power = EXCLUDED.power,
       target = EXCLUDED.target,
       seconds = EXCLUDED.seconds,
       updated_at = NOW()
     RETURNING id, gift_id, gift_name, gift_image_url, power, target, seconds, created_at`,
    [userId, cleanGiftId, cleanGiftName, giftImageUrl ? String(giftImageUrl).slice(0, 500) : null, cleanPower, finalTarget,
      clampInt(seconds, MIN_SECONDS, MAX_SECONDS, DEFAULT_SECONDS[cleanPower])],
  );
  invalidateRuleCache(userId);
  return result.rows[0];
}

async function deleteGiftRule(userId, ruleId) {
  await pool.query('DELETE FROM roblox_f1_gift_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
  invalidateRuleCache(userId);
}

// ---------- cola hacia el juego ----------

async function enqueue(userId, { kind, uniqueId, nickname, power = null, target = null, seconds = 0, robloxUserId = null }) {
  await pool.query(
    `INSERT INTO roblox_f1_queue (user_id, kind, tiktok_unique_id, tiktok_nickname, power, target, seconds, roblox_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, kind, String(uniqueId).slice(0, 120), String(nickname).slice(0, 120), power, target, seconds, robloxUserId],
  );
}

// tiktokLiveManager entrega UN evento por regalo (o uno por combo con repeatCount = total): un combo de 5 turbos de 8 s
// suma 40 s (con tope). El que manda el regalo entra solo a la carrera si todavia no estaba.
async function handleGift(userId, { giftId, repeatCount, user } = {}) {
  if (!giftId) return;

  const rules = await getRulesByGiftId(userId);
  const rule = rules.get(String(giftId));
  if (!rule) return;

  const who = whoIs(user);
  const units = clampInt(repeatCount, 1, MAX_UNITS_PER_GIFT, 1);
  const seconds = Math.min(MAX_SECONDS, Number(rule.seconds) * units);

  await enqueue(userId, { kind: 'power', uniqueId: who.uniqueId, nickname: who.nickname, power: rule.power, target: rule.target, seconds });
  logger.info(`[F1] regalo ${giftId} de @${who.uniqueId} -> ${rule.power}/${rule.target} ${seconds}s`);
}

async function getJoinKeyword(userId) {
  const key = Number(userId);
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.at < RULE_CACHE_TTL_MS) return cached.keyword;

  const row = await getOrCreateConfig(userId);
  const keyword = normalizeKeyword(row.join_keyword);
  settingsCache.set(key, { at: Date.now(), keyword });
  return keyword;
}

async function handleChatComment(userId, { comment, user } = {}) {
  if (!comment) return;

  const keyword = await getJoinKeyword(userId);
  const join = parseJoin(comment, keyword);
  if (!join) return;

  const who = whoIs(user);
  const key = `${Number(userId)}|${who.uniqueId.toLowerCase()}`;
  const last = recentJoins.get(key);
  if (last && Date.now() - last < JOIN_COOLDOWN_MS) return;

  if (recentJoins.size >= JOIN_CACHE_LIMIT) {
    const cutoff = Date.now() - JOIN_COOLDOWN_MS;
    for (const [oldKey, at] of recentJoins) {
      if (at < cutoff) recentJoins.delete(oldKey);
    }
    if (recentJoins.size >= JOIN_CACHE_LIMIT) recentJoins.clear();
  }
  recentJoins.set(key, Date.now());

  await enqueue(userId, { kind: 'join', uniqueId: who.uniqueId, nickname: who.nickname, robloxUserId: join.robloxUserId });
}

async function enqueueTestPower(userId, ruleId) {
  const result = await pool.query(
    'SELECT power, target, seconds FROM roblox_f1_gift_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId],
  );
  if (result.rowCount === 0) {
    const error = new Error('Regla no encontrada.');
    error.status = 404;
    throw error;
  }
  const rule = result.rows[0];
  // El de prueba entra como "Prueba" y se aplica al lider/al azar (no hay un carro "suyo")
  const target = rule.target === 'self' ? 'random' : rule.target;
  await enqueue(userId, { kind: 'power', uniqueId: 'test-user', nickname: 'Prueba', power: rule.power, target, seconds: rule.seconds });
}

async function enqueueTestJoin(userId) {
  const suffix = Math.floor(Math.random() * 900 + 100);
  await enqueue(userId, { kind: 'join', uniqueId: `prueba${suffix}`, nickname: `Prueba ${suffix}` });
}

function toQueueItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    uniqueId: row.tiktok_unique_id,
    nickname: row.tiktok_nickname,
    power: row.power,
    target: row.target,
    seconds: row.seconds,
    robloxUserId: row.roblox_user_id === null || row.roblox_user_id === undefined ? null : Number(row.roblox_user_id),
  };
}

// Entrega lo pendiente y lo que se entrego hace tiempo sin confirmarse. El juego confirma con ackQueue().
async function pollQueue(userId, limit = 40) {
  const result = await pool.query(
    `UPDATE roblox_f1_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM roblox_f1_queue
       WHERE user_id = $1
         AND created_at > NOW() - ($4::int * INTERVAL '1 minute')
         AND (status = 'pending' OR (status = 'sent' AND sent_at < NOW() - ($3::int * INTERVAL '1 second')))
       ORDER BY created_at ASC, id ASC
       LIMIT $2
     )
     RETURNING id, kind, power, target, seconds, roblox_user_id, tiktok_unique_id, tiktok_nickname`,
    [userId, clampInt(limit, 1, 100, 40), REDELIVER_AFTER_SECONDS, QUEUE_MAX_AGE_MINUTES],
  );

  if (Math.random() < 0.02) {
    pool.query("DELETE FROM roblox_f1_queue WHERE (status = 'done' AND done_at < NOW() - INTERVAL '1 day') OR created_at < NOW() - INTERVAL '2 days'").catch(() => {});
  }

  return result.rows.sort((a, b) => a.id - b.id).map(toQueueItem);
}

async function ackQueue(userId, ids) {
  const clean = (Array.isArray(ids) ? ids : []).map((id) => Math.round(Number(id))).filter((id) => Number.isInteger(id) && id > 0).slice(0, 200);
  if (clean.length === 0) return 0;

  const result = await pool.query(
    "UPDATE roblox_f1_queue SET status = 'done', done_at = NOW() WHERE user_id = $1 AND id = ANY($2::int[])",
    [userId, clean],
  );
  return result.rowCount;
}

// ---------- marcador ----------

async function getLeaderboard(userId, limit = 10) {
  const result = await pool.query(
    `SELECT tiktok_unique_id, tiktok_nickname, wins, podiums, races, best_time
     FROM roblox_f1_scores
     WHERE user_id = $1
     ORDER BY wins DESC, podiums DESC, races ASC, updated_at ASC
     LIMIT $2`,
    [userId, clampInt(limit, 1, 50, 10)],
  );
  return result.rows.map((row) => ({
    uniqueId: row.tiktok_unique_id,
    nickname: row.tiktok_nickname,
    wins: row.wins,
    podiums: row.podiums,
    races: row.races,
    bestTime: row.best_time === null ? null : Number(row.best_time),
  }));
}

// El juego avisa el resultado de cada carrera. raceId evita contarla dos veces si el aviso se repite.
async function reportRaceResult(userId, { raceId, results } = {}) {
  const list = Array.isArray(results) ? results.slice(0, 20) : [];
  if (list.length === 0) throw badRequest('Resultados vacios.');

  const cleanRaceId = raceId ? String(raceId).slice(0, 60) : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO roblox_f1_config (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    // Bloquea la fila para que dos avisos iguales y simultaneos no cuenten dos veces
    const config = await client.query('SELECT last_race_id FROM roblox_f1_config WHERE user_id = $1 FOR UPDATE', [userId]);
    if (cleanRaceId && config.rows[0].last_race_id === cleanRaceId) {
      await client.query('ROLLBACK');
      return { duplicate: true };
    }

    for (const entry of list) {
      const uniqueId = String(entry?.uniqueId || '').trim().replace(/^@/, '').slice(0, 120);
      const place = Math.round(Number(entry?.place));
      if (!uniqueId || !Number.isInteger(place) || place < 1 || place > 20) continue;
      const time = Number.isFinite(Number(entry?.time)) && Number(entry.time) > 0 ? Number(Number(entry.time).toFixed(1)) : null;

      await client.query(
        `INSERT INTO roblox_f1_scores (user_id, tiktok_unique_id, tiktok_nickname, wins, podiums, races, best_time)
         VALUES ($1, $2, $3, $4, $5, 1, $6)
         ON CONFLICT (user_id, tiktok_unique_id) DO UPDATE SET
           tiktok_nickname = EXCLUDED.tiktok_nickname,
           wins = roblox_f1_scores.wins + EXCLUDED.wins,
           podiums = roblox_f1_scores.podiums + EXCLUDED.podiums,
           races = roblox_f1_scores.races + 1,
           best_time = CASE
             WHEN EXCLUDED.best_time IS NULL THEN roblox_f1_scores.best_time
             WHEN roblox_f1_scores.best_time IS NULL THEN EXCLUDED.best_time
             ELSE LEAST(roblox_f1_scores.best_time, EXCLUDED.best_time) END,
           updated_at = NOW()`,
        [userId, uniqueId, String(entry?.name || uniqueId).slice(0, 120), place === 1 ? 1 : 0, place <= 3 ? 1 : 0, time],
      );
    }

    await client.query(
      'UPDATE roblox_f1_config SET races_played = races_played + 1, last_race_id = COALESCE($2, last_race_id), updated_at = NOW() WHERE user_id = $1',
      [userId, cleanRaceId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return { duplicate: false, leaderboard: await getLeaderboard(userId, 5) };
}

async function resetScore(userId) {
  await pool.query('DELETE FROM roblox_f1_scores WHERE user_id = $1', [userId]);
  await pool.query('UPDATE roblox_f1_config SET races_played = 0, last_race_id = NULL, updated_at = NOW() WHERE user_id = $1', [userId]);
}

// ---------- sesion del juego ----------

async function resolveLinkedUser(robloxUserId) {
  const numericId = Number(robloxUserId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { linked: false, hasAccess: false, userId: null };
  }

  const result = await pool.query(
    `SELECT c.user_id, au.email
     FROM roblox_f1_config c
     JOIN app_users au ON au.id = c.user_id
     WHERE c.roblox_user_id = $1`,
    [numericId],
  );
  if (result.rowCount === 0) return { linked: false, hasAccess: false, userId: null };

  const { user_id: userId, email } = result.rows[0];
  if (isSuperUserEmail(email)) return { linked: true, hasAccess: true, userId };

  const accessService = require('./accessService');
  return { linked: true, hasAccess: await accessService.hasActiveAccess(userId), userId };
}

async function getSessionPayload(userId) {
  const row = await getOrCreateConfig(userId);
  return { settings: toSettings(row), leaderboard: await getLeaderboard(userId, 5), racesPlayed: row.races_played };
}

module.exports = {
  POWERS,
  TARGETS,
  normalizeKeyword,
  parseJoin,
  toSettings,
  getOrCreateConfig,
  updateSettings,
  linkRobloxAccount,
  listGiftRules,
  upsertGiftRule,
  deleteGiftRule,
  handleGift,
  handleChatComment,
  enqueueTestPower,
  enqueueTestJoin,
  pollQueue,
  ackQueue,
  getLeaderboard,
  reportRaceResult,
  resetScore,
  resolveLinkedUser,
  getSessionPayload,
};
