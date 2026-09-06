// tiktokinteractik/backend/src/services/robloxDanceService.js
//
// Convierte comentarios de TikTok Live ("join <usuarioDeRoblox>") en filas de
// una cola que un script de Roblox Studio va consumiendo por HTTP polling.
// Esto corre del lado del servidor (no en el navegador del streamer) porque
// el "cliente" real es el script de Roblox, que sigue funcionando aunque la
// pestaña del panel este cerrada.
//
// La identificacion del lado de Roblox usa el ID numerico de la cuenta de
// Roblox con la que la persona inicio sesion (Players.LocalPlayer.UserId),
// vinculado de antemano en el panel — sin API key ni secretos que copiar.

const pool = require('../database/pool');
const logger = require('../config/logger');
const { isSuperUserEmail } = require('../middleware/auth');

const configCache = new Map();

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function invalidateConfigCache(userId) {
  configCache.delete(Number(userId));
}

async function getJoinKeyword(userId) {
  const cached = configCache.get(Number(userId));
  if (cached) {
    return cached.joinKeyword;
  }

  const result = await pool.query(
    'SELECT join_keyword FROM roblox_dance_config WHERE user_id = $1',
    [userId],
  );

  const joinKeyword = result.rows[0]?.join_keyword || 'join';
  configCache.set(Number(userId), { joinKeyword });
  return joinKeyword;
}

async function handleChatComment(userId, { comment, user } = {}) {
  const text = String(comment || '');
  if (!text.trim()) {
    return;
  }

  const joinKeyword = await getJoinKeyword(userId);
  const pattern = new RegExp(`^\\s*${escapeRegExp(joinKeyword)}\\s+(\\S+)\\s*$`, 'i');
  const match = text.match(pattern);

  if (!match) {
    return;
  }

  const robloxUsername = match[1].slice(0, 60);
  const tiktokUniqueId = String(user?.uniqueId || '').slice(0, 120) || null;
  const tiktokNickname = String(user?.nickname || user?.uniqueId || 'Espectador').slice(0, 120);

  await pool.query(
    `INSERT INTO roblox_dance_queue (user_id, roblox_username, tiktok_nickname, tiktok_unique_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, robloxUsername, tiktokNickname, tiktokUniqueId],
  );
}

async function getOrCreateConfig(userId) {
  const existing = await pool.query(
    'SELECT join_keyword, roblox_username, roblox_user_id, created_at, updated_at FROM roblox_dance_config WHERE user_id = $1',
    [userId],
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const inserted = await pool.query(
    `INSERT INTO roblox_dance_config (user_id)
     VALUES ($1)
     RETURNING join_keyword, roblox_username, roblox_user_id, created_at, updated_at`,
    [userId],
  );

  return inserted.rows[0];
}

async function updateJoinKeyword(userId, joinKeyword) {
  const result = await pool.query(
    `INSERT INTO roblox_dance_config (user_id, join_keyword)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       join_keyword = EXCLUDED.join_keyword,
       updated_at = NOW()
     RETURNING join_keyword, roblox_username, roblox_user_id, created_at, updated_at`,
    [userId, joinKeyword],
  );

  invalidateConfigCache(userId);
  return result.rows[0];
}

// Verifica el ID de Roblox contra la API publica de Roblox (para obtener el
// nombre de usuario real y confirmar que la cuenta existe) y lo vincula.
async function linkRobloxAccount(userId, robloxUserId) {
  const numericId = Number(robloxUserId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    const error = new Error('El ID de Roblox debe ser un numero valido.');
    error.status = 400;
    throw error;
  }

  let robloxUsername;
  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${numericId}`);
    if (!response.ok) {
      const error = new Error('No se encontro ninguna cuenta de Roblox con ese ID.');
      error.status = 400;
      throw error;
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
      `INSERT INTO roblox_dance_config (user_id, roblox_user_id, roblox_username)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         roblox_user_id = EXCLUDED.roblox_user_id,
         roblox_username = EXCLUDED.roblox_username,
         updated_at = NOW()
       RETURNING join_keyword, roblox_username, roblox_user_id, created_at, updated_at`,
      [userId, numericId, robloxUsername],
    );

    invalidateConfigCache(userId);
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

async function enqueueTestSpawn(userId) {
  const configResult = await pool.query(
    'SELECT roblox_username FROM roblox_dance_config WHERE user_id = $1',
    [userId],
  );

  const robloxUsername = configResult.rows[0]?.roblox_username;
  if (!robloxUsername) {
    const error = new Error('Vincula tu ID de Roblox antes de probar.');
    error.status = 400;
    throw error;
  }

  await pool.query(
    `INSERT INTO roblox_dance_queue (user_id, roblox_username, tiktok_nickname, tiktok_unique_id)
     VALUES ($1, $2, 'Prueba', 'test-user')`,
    [userId, robloxUsername],
  );
}

const giftRuleCache = new Map();

async function getGiftRulesByGiftId(userId) {
  const cached = giftRuleCache.get(Number(userId));
  if (cached) {
    return cached;
  }

  const result = await pool.query(
    'SELECT gift_id, power, duration_seconds FROM roblox_dance_gift_rules WHERE user_id = $1',
    [userId],
  );

  const byGiftId = new Map(result.rows.map((row) => [String(row.gift_id), row]));
  giftRuleCache.set(Number(userId), byGiftId);
  return byGiftId;
}

function invalidateGiftRuleCache(userId) {
  giftRuleCache.delete(Number(userId));
}

// Solo se cuenta/activa al final de cada racha de regalo (repeatEnd=true)
// para no contar de mas los ticks intermedios de un mismo combo.
async function handleGift(userId, { repeatEnd, repeatCount, diamondCount, giftId, user } = {}) {
  if (!repeatEnd) {
    return;
  }

  const uniqueId = String(user?.uniqueId || '').trim();
  if (!uniqueId) {
    return;
  }

  const nickname = String(user?.nickname || uniqueId).slice(0, 120);
  const coins = Math.round(Number(diamondCount || 0) * Number(repeatCount || 1));

  if (coins > 0) {
    await pool.query(
      `INSERT INTO roblox_dance_gift_totals (user_id, tiktok_unique_id, tiktok_nickname, total_coins)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, tiktok_unique_id) DO UPDATE SET
         tiktok_nickname = EXCLUDED.tiktok_nickname,
         total_coins = roblox_dance_gift_totals.total_coins + EXCLUDED.total_coins,
         updated_at = NOW()`,
      [userId, uniqueId.slice(0, 120), nickname, coins],
    );
  }

  if (giftId) {
    const rulesByGiftId = await getGiftRulesByGiftId(userId);
    const rule = rulesByGiftId.get(String(giftId));

    if (rule) {
      await pool.query(
        `INSERT INTO roblox_dance_power_queue (user_id, tiktok_unique_id, tiktok_nickname, power, duration_seconds)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, uniqueId.slice(0, 120), nickname, rule.power, rule.duration_seconds],
      );
    }
  }
}

// "Reiniciar juego": limpia el estado efimero de una partida (cola de spawns
// pendientes, cola de poderes pendientes, y el total de monedas que alimenta
// la valla de lideres) sin tocar configuracion que el usuario definio a
// proposito (join keyword, vinculacion de Roblox, reglas de regalo->poder).
async function resetGame(userId) {
  await pool.query('DELETE FROM roblox_dance_queue WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM roblox_dance_power_queue WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM roblox_dance_gift_totals WHERE user_id = $1', [userId]);
}

async function getTopGifters(userId, limit = 4) {
  const result = await pool.query(
    `SELECT tiktok_nickname, total_coins
     FROM roblox_dance_gift_totals
     WHERE user_id = $1
     ORDER BY total_coins DESC
     LIMIT $2`,
    [userId, limit],
  );

  return result.rows;
}

async function pollQueue(userId, limit = 20) {
  const result = await pool.query(
    `UPDATE roblox_dance_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM roblox_dance_queue
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2
     )
     RETURNING id, roblox_username, tiktok_nickname, tiktok_unique_id, created_at`,
    [userId, limit],
  );

  return result.rows;
}

async function listGiftRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, power, duration_seconds, created_at
     FROM roblox_dance_gift_rules
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );

  return result.rows;
}

async function upsertGiftRule(userId, { giftId, giftName, giftImageUrl, power, durationSeconds }) {
  const cleanGiftId = String(giftId || '').trim().slice(0, 60);
  const cleanGiftName = String(giftName || '').trim().slice(0, 120);
  const cleanPower = String(power || 'fuego').trim().slice(0, 40);
  const cleanDuration = Math.min(60, Math.max(1, Math.round(Number(durationSeconds) || 5)));

  if (!cleanGiftId || !cleanGiftName) {
    const error = new Error('Debes seleccionar un regalo.');
    error.status = 400;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO roblox_dance_gift_rules (user_id, gift_id, gift_name, gift_image_url, power, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET
       gift_name = EXCLUDED.gift_name,
       gift_image_url = EXCLUDED.gift_image_url,
       power = EXCLUDED.power,
       duration_seconds = EXCLUDED.duration_seconds,
       updated_at = NOW()
     RETURNING id, gift_id, gift_name, gift_image_url, power, duration_seconds, created_at`,
    [userId, cleanGiftId, cleanGiftName, giftImageUrl || null, cleanPower, cleanDuration],
  );

  invalidateGiftRuleCache(userId);
  return result.rows[0];
}

async function deleteGiftRule(userId, ruleId) {
  await pool.query(
    'DELETE FROM roblox_dance_gift_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId],
  );
  invalidateGiftRuleCache(userId);
}

async function enqueueTestPower(userId, ruleId) {
  const ruleResult = await pool.query(
    'SELECT power, duration_seconds FROM roblox_dance_gift_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId],
  );

  if (ruleResult.rowCount === 0) {
    const error = new Error('Regla no encontrada.');
    error.status = 404;
    throw error;
  }

  const rule = ruleResult.rows[0];

  await pool.query(
    `INSERT INTO roblox_dance_power_queue (user_id, tiktok_unique_id, tiktok_nickname, power, duration_seconds)
     VALUES ($1, 'test-user', 'Prueba', $2, $3)`,
    [userId, rule.power, rule.duration_seconds],
  );
}

async function pollPowerQueue(userId, limit = 20) {
  const result = await pool.query(
    `UPDATE roblox_dance_power_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM roblox_dance_power_queue
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2
     )
     RETURNING id, tiktok_unique_id, tiktok_nickname, power, duration_seconds, created_at`,
    [userId, limit],
  );

  return result.rows;
}

// Resuelve un ID de cuenta de Roblox (el que trae la sesion real dentro del
// juego) a la cuenta de la plataforma vinculada, verificando acceso activo.
// Usado tanto por el chequeo de "Start" como por el poll de la cola — ambos
// llamados directamente por el script de Roblox, sin sesion de navegador.
async function resolveLinkedUser(robloxUserId) {
  const numericId = Number(robloxUserId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { linked: false, hasAccess: false, userId: null };
  }

  const result = await pool.query(
    `SELECT rdc.user_id, au.email
     FROM roblox_dance_config rdc
     JOIN app_users au ON au.id = rdc.user_id
     WHERE rdc.roblox_user_id = $1`,
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
  handleChatComment,
  handleGift,
  getOrCreateConfig,
  updateJoinKeyword,
  linkRobloxAccount,
  enqueueTestSpawn,
  pollQueue,
  resetGame,
  getTopGifters,
  listGiftRules,
  upsertGiftRule,
  deleteGiftRule,
  enqueueTestPower,
  pollPowerQueue,
  resolveLinkedUser,
  invalidateConfigCache,
};
