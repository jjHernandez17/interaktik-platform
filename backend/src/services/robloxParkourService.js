// tiktokinteractik/backend/src/services/robloxParkourService.js
//
// Roblox Parkour: el streamer sube una torre de escaleras en Roblox y los
// regalos de TikTok lo empujan hacia arriba o hacia abajo. Aqui se convierten
// los regalos en filas de una cola ("poderes") que el script del juego de
// Roblox consulta por HTTP — mismo patron que robloxDanceService, pero con su
// propia vinculacion de cuenta, reglas y cola.

const pool = require('../database/pool');
const logger = require('../config/logger');
const { isSuperUserEmail } = require('../middleware/auth');

// 'subir' y 'bajar' son las dos acciones del Nyan Cat; 'puno_subir' y 'puno_bajar'
// hacen lo mismo con la animacion del Puño, 'goku_*' con la de Goku y 'capa_*' con la capa voladora y 'tung_*' con Tung Tung Sahur; 'super_salto' dura N segundos.
const VALID_POWERS = new Set(['subir', 'bajar', 'puno_subir', 'puno_bajar', 'goku_subir', 'goku_bajar', 'capa_subir', 'capa_bajar', 'tung_subir', 'tung_bajar', 'super_salto']);
const MIN_STAIRS = 1;
// Sin límite práctico: la torre tiene 500 escaleras, así que cualquier valor
// mayor simplemente lleva al jugador hasta la meta o hasta la isla. Estos tope
// solo evitan desbordar la columna INTEGER de PostgreSQL (máx. ~2.147 millones).
const MAX_STAIRS_PER_RULE = 1000000000;
const MAX_STAIRS_PER_QUEUE_ITEM = 2000000000;
const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 86400; // tope técnico: 24 h
const DEFAULT_DURATION_SECONDS = 10;

const giftRuleCache = new Map();

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function clampStairs(value) {
  const parsed = Math.round(Number(value) || 0);
  return Math.min(MAX_STAIRS_PER_RULE, Math.max(MIN_STAIRS, parsed));
}

function clampDuration(value) {
  const parsed = Math.round(Number(value) || DEFAULT_DURATION_SECONDS);
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, parsed));
}

function invalidateGiftRuleCache(userId) {
  giftRuleCache.delete(Number(userId));
}

async function getGiftRulesByGiftId(userId) {
  const cached = giftRuleCache.get(Number(userId));
  if (cached) return cached;

  const result = await pool.query(
    'SELECT gift_id, power, stairs, duration_seconds FROM roblox_parkour_gift_rules WHERE user_id = $1',
    [userId],
  );

  const byGiftId = new Map(result.rows.map((row) => [String(row.gift_id), row]));
  giftRuleCache.set(Number(userId), byGiftId);
  return byGiftId;
}

async function getOrCreateConfig(userId) {
  const existing = await pool.query(
    'SELECT roblox_user_id, roblox_username, created_at, updated_at FROM roblox_parkour_config WHERE user_id = $1',
    [userId],
  );
  if (existing.rowCount > 0) return existing.rows[0];

  const inserted = await pool.query(
    `INSERT INTO roblox_parkour_config (user_id)
     VALUES ($1)
     RETURNING roblox_user_id, roblox_username, created_at, updated_at`,
    [userId],
  );
  return inserted.rows[0];
}

// Verifica el ID contra la API publica de Roblox (nombre real + que exista)
// y lo vincula a la cuenta de la plataforma.
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

  try {
    const result = await pool.query(
      `INSERT INTO roblox_parkour_config (user_id, roblox_user_id, roblox_username)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         roblox_user_id = EXCLUDED.roblox_user_id,
         roblox_username = EXCLUDED.roblox_username,
         updated_at = NOW()
       RETURNING roblox_user_id, roblox_username, created_at, updated_at`,
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

async function listGiftRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, power, stairs, duration_seconds, created_at
     FROM roblox_parkour_gift_rules
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows;
}

async function upsertGiftRule(userId, { giftId, giftName, giftImageUrl, power, stairs, durationSeconds }) {
  const cleanGiftId = String(giftId || '').trim().slice(0, 60);
  const cleanGiftName = String(giftName || '').trim().slice(0, 120);
  const cleanPower = String(power || 'subir').trim();

  if (!cleanGiftId || !cleanGiftName) throw badRequest('Debes seleccionar un regalo.');
  if (!VALID_POWERS.has(cleanPower)) throw badRequest('Poder no valido.');

  // Super salto: solo importa la duración. Nyan Cat, Puño, Goku, Capa y Tung Tung Sahur: solo importan las escaleras.
  const isSuperJump = cleanPower === 'super_salto';
  const ruleStairs = isSuperJump ? 1 : clampStairs(stairs);
  const ruleDuration = isSuperJump ? clampDuration(durationSeconds) : DEFAULT_DURATION_SECONDS;

  const result = await pool.query(
    `INSERT INTO roblox_parkour_gift_rules (user_id, gift_id, gift_name, gift_image_url, power, stairs, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET
       gift_name = EXCLUDED.gift_name,
       gift_image_url = EXCLUDED.gift_image_url,
       power = EXCLUDED.power,
       stairs = EXCLUDED.stairs,
       duration_seconds = EXCLUDED.duration_seconds,
       updated_at = NOW()
     RETURNING id, gift_id, gift_name, gift_image_url, power, stairs, duration_seconds, created_at`,
    [userId, cleanGiftId, cleanGiftName, giftImageUrl || null, cleanPower, ruleStairs, ruleDuration],
  );

  invalidateGiftRuleCache(userId);
  return result.rows[0];
}

async function deleteGiftRule(userId, ruleId) {
  await pool.query(
    'DELETE FROM roblox_parkour_gift_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId],
  );
  invalidateGiftRuleCache(userId);
}

async function enqueuePower(userId, { uniqueId, nickname, power, stairs, durationSeconds }) {
  await pool.query(
    `INSERT INTO roblox_parkour_power_queue (user_id, tiktok_unique_id, tiktok_nickname, power, stairs, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, String(uniqueId).slice(0, 120), String(nickname).slice(0, 120), power, stairs || 0, durationSeconds || 0],
  );
}

// tiktokLiveManager ya descarta los mensajes intermedios de un combo, asi que
// aqui llega UN evento por regalo (o uno final por combo, con repeatCount =
// total). Un combo de 5 rosas de "sube 3" empuja 15 escaleras en una sola
// animacion.
async function handleGift(userId, { giftId, repeatCount, user } = {}) {
  if (!giftId) return;

  const rulesByGiftId = await getGiftRulesByGiftId(userId);
  const rule = rulesByGiftId.get(String(giftId));
  if (!rule) return;

  const uniqueId = String(user?.uniqueId || '').trim() || 'espectador';
  const nickname = String(user?.nickname || uniqueId);
  const units = Math.max(1, Math.round(Number(repeatCount) || 1));

  if (rule.power === 'super_salto') {
    // Un combo suma tiempo: 5 regalos de 10 s = 50 s de super salto.
    const durationSeconds = Math.min(MAX_DURATION_SECONDS, Number(rule.duration_seconds) * units);
    await enqueuePower(userId, { uniqueId, nickname, power: rule.power, stairs: 0, durationSeconds });
    return;
  }

  const stairs = Math.min(MAX_STAIRS_PER_QUEUE_ITEM, Number(rule.stairs) * units);
  await enqueuePower(userId, { uniqueId, nickname, power: rule.power, stairs });
}

async function enqueueTestPower(userId, ruleId) {
  const ruleResult = await pool.query(
    'SELECT power, stairs, duration_seconds FROM roblox_parkour_gift_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId],
  );

  if (ruleResult.rowCount === 0) {
    const error = new Error('Regla no encontrada.');
    error.status = 404;
    throw error;
  }

  const rule = ruleResult.rows[0];
  await enqueuePower(userId, {
    uniqueId: 'test-user',
    nickname: 'Prueba',
    power: rule.power,
    stairs: rule.power === 'super_salto' ? 0 : rule.stairs,
    durationSeconds: rule.power === 'super_salto' ? rule.duration_seconds : 0,
  });
}

async function pollPowerQueue(userId, limit = 20) {
  const result = await pool.query(
    `UPDATE roblox_parkour_power_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM roblox_parkour_power_queue
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2
     )
     RETURNING id, tiktok_unique_id, tiktok_nickname, power, stairs, duration_seconds, created_at`,
    [userId, limit],
  );
  return result.rows;
}

// "Reiniciar juego" desde Roblox: descarta poderes pendientes. No toca la
// configuracion que el usuario definio (vinculacion y reglas).
async function resetGame(userId) {
  await pool.query('DELETE FROM roblox_parkour_power_queue WHERE user_id = $1', [userId]);
}

// Resuelve el ID de la cuenta de Roblox que abrio el juego a la cuenta de la
// plataforma vinculada, verificando que tenga acceso activo.
async function resolveLinkedUser(robloxUserId) {
  const numericId = Number(robloxUserId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { linked: false, hasAccess: false, userId: null };
  }

  const result = await pool.query(
    `SELECT rpc.user_id, au.email
     FROM roblox_parkour_config rpc
     JOIN app_users au ON au.id = rpc.user_id
     WHERE rpc.roblox_user_id = $1`,
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

module.exports = {
  VALID_POWERS,
  getOrCreateConfig,
  linkRobloxAccount,
  listGiftRules,
  upsertGiftRule,
  deleteGiftRule,
  handleGift,
  enqueueTestPower,
  pollPowerQueue,
  resetGame,
  resolveLinkedUser,
};
