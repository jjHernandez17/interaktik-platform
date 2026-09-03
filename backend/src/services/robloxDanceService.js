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
  const tiktokNickname = String(user?.nickname || user?.uniqueId || 'Espectador').slice(0, 120);

  await pool.query(
    `INSERT INTO roblox_dance_queue (user_id, roblox_username, tiktok_nickname)
     VALUES ($1, $2, $3)`,
    [userId, robloxUsername, tiktokNickname],
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
    `INSERT INTO roblox_dance_queue (user_id, roblox_username, tiktok_nickname)
     VALUES ($1, $2, 'Prueba')`,
    [userId, robloxUsername],
  );
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
     RETURNING id, roblox_username, tiktok_nickname, created_at`,
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
  getOrCreateConfig,
  updateJoinKeyword,
  linkRobloxAccount,
  enqueueTestSpawn,
  pollQueue,
  resolveLinkedUser,
  invalidateConfigCache,
};
