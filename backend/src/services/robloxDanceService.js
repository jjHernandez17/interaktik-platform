// tiktokinteractive/backend/src/services/robloxDanceService.js
//
// Convierte comentarios de TikTok Live ("join <usuarioDeRoblox>") en filas de
// una cola que un script de Roblox Studio va consumiendo por HTTP polling.
// Esto corre del lado del servidor (no en el navegador del streamer) porque
// el "cliente" real es el script de Roblox, que sigue funcionando aunque la
// pestaña del panel este cerrada.

const crypto = require('crypto');
const pool = require('../database/pool');
const logger = require('../config/logger');

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
    'SELECT join_keyword, roblox_username, api_key, created_at, updated_at FROM roblox_dance_config WHERE user_id = $1',
    [userId],
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const apiKey = crypto.randomBytes(24).toString('hex');
  const inserted = await pool.query(
    `INSERT INTO roblox_dance_config (user_id, api_key)
     VALUES ($1, $2)
     RETURNING join_keyword, roblox_username, api_key, created_at, updated_at`,
    [userId, apiKey],
  );

  return inserted.rows[0];
}

async function updateConfig(userId, { joinKeyword, robloxUsername }) {
  const result = await pool.query(
    `INSERT INTO roblox_dance_config (user_id, join_keyword, roblox_username, api_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       join_keyword = EXCLUDED.join_keyword,
       roblox_username = EXCLUDED.roblox_username,
       updated_at = NOW()
     RETURNING join_keyword, roblox_username, api_key, created_at, updated_at`,
    [userId, joinKeyword, robloxUsername || null, crypto.randomBytes(24).toString('hex')],
  );

  invalidateConfigCache(userId);
  return result.rows[0];
}

async function regenerateApiKey(userId) {
  const apiKey = crypto.randomBytes(24).toString('hex');
  const result = await pool.query(
    `UPDATE roblox_dance_config SET api_key = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING join_keyword, roblox_username, api_key, created_at, updated_at`,
    [apiKey, userId],
  );

  if (result.rowCount === 0) {
    throw new Error('Configura Roblox Dance antes de regenerar la API key.');
  }

  return result.rows[0];
}

async function enqueueTestSpawn(userId) {
  const configResult = await pool.query(
    'SELECT roblox_username FROM roblox_dance_config WHERE user_id = $1',
    [userId],
  );

  const robloxUsername = configResult.rows[0]?.roblox_username;
  if (!robloxUsername) {
    const error = new Error('Configura tu usuario de Roblox antes de probar.');
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

module.exports = {
  handleChatComment,
  getOrCreateConfig,
  updateConfig,
  regenerateApiKey,
  enqueueTestSpawn,
  pollQueue,
  invalidateConfigCache,
};
