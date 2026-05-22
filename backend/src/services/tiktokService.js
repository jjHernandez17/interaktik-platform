const pool = require('../database/pool');
const fs = require('fs').promises;
const path = require('path');

const GIFT_CACHE_PATH = path.join(__dirname, '../../../gifts-cache.json');
let giftCachePromise = null;

async function loadGiftCache() {
  if (!giftCachePromise) {
    giftCachePromise = fs.readFile(GIFT_CACHE_PATH, 'utf-8')
      .then((content) => JSON.parse(content))
      .catch((error) => {
        giftCachePromise = null;
        throw error;
      });
  }

  return giftCachePromise;
}

async function saveTiktokConnection(userId, gameType, tiktokUsername) {
  const username = String(tiktokUsername || '').trim().replace(/^@/, '').slice(0, 120);

  const result = await pool.query(
    `INSERT INTO user_tiktok_connections (user_id, game_type, tiktok_username, is_linked, linked_at, created_at, updated_at)
     VALUES ($1, $2, $3, true, NOW(), NOW(), NOW())
     ON CONFLICT (user_id, game_type)
     DO UPDATE SET tiktok_username = EXCLUDED.tiktok_username, is_linked = true, linked_at = NOW(), updated_at = NOW()
     RETURNING tiktok_username, is_linked, linked_at`,
    [userId, gameType, username],
  );

  return result.rows[0];
}

async function getTiktokConnection(userId, gameType) {
  const result = await pool.query(
    `SELECT tiktok_username, is_linked, linked_at FROM user_tiktok_connections
     WHERE user_id = $1 AND game_type = $2`,
    [userId, gameType],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

async function deleteTiktokConnection(userId, gameType) {
  await pool.query(
    `DELETE FROM user_tiktok_connections WHERE user_id = $1 AND game_type = $2`,
    [userId, gameType],
  );
}

async function getGiftCatalog() {
  const cached = await loadGiftCache();
  const gifts = Array.isArray(cached?.gifts) ? cached.gifts : [];

  return {
    gifts,
    total: gifts.length,
    source: 'file-cache',
    updated_at: null,
  };
}

async function getStatus(userId = null) {
  const poolResult = await pool.query('SELECT 1 as ok');

  return {
    status: 'ok',
    backend: 'railway',
    database: poolResult.rowCount > 0 ? 'connected' : 'unknown',
    hasUser: Boolean(userId),
  };
}

module.exports = {
  saveTiktokConnection,
  getTiktokConnection,
  deleteTiktokConnection,
  getGiftCatalog,
  getStatus,
};
