const pool = require('../database/pool');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');
const env = require('../config/env');

const GIFT_CACHE_CANDIDATES = [
  path.join(__dirname, '../../../gifts-cache.json'),
  path.join(process.cwd(), 'gifts-cache.json'),
  path.join(process.cwd(), 'backend', 'gifts-cache.json'),
];

let giftCachePromise = null;

async function loadGiftCache() {
  if (!giftCachePromise) {
    giftCachePromise = (async () => {
      let lastError = null;

      for (const candidatePath of GIFT_CACHE_CANDIDATES) {
        try {
          const content = await fs.readFile(candidatePath, 'utf-8');
          logger.success(`Gift cache loaded from ${candidatePath}`);
          return JSON.parse(content);
        } catch (error) {
          lastError = error;
          logger.warn(`Gift cache path unavailable: ${candidatePath}`);
        }
      }

      throw lastError || new Error('No se encontró gifts-cache.json');
    })().catch((error) => {
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
  try {
    const cached = await loadGiftCache();
    const gifts = Array.isArray(cached?.gifts) ? cached.gifts : [];

    return {
      gifts,
      total: gifts.length,
      source: 'file-cache',
      updated_at: null,
    };
  } catch (error) {
    logger.error('Gift catalog load failed, falling back to empty list', error);

    const fallback = { gifts: [], total: 0, source: 'fallback-empty', updated_at: null };

    return fallback;
  }
}

// Catalogo de regalos GUARDADO por usuario: se llena la primera vez que se
// conecta en vivo y consulta el catalogo, y desde entonces se sirve aunque
// no este conectado — asi el usuario solo necesita cargarlo una vez.
async function saveUserGiftCatalog(userId, gifts) {
  if (!userId || !Array.isArray(gifts) || gifts.length === 0) {
    return;
  }

  await pool.query(
    `INSERT INTO gift_catalog_cache (user_id, gifts, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       gifts = EXCLUDED.gifts,
       updated_at = NOW()`,
    [userId, JSON.stringify(gifts)],
  );
}

async function getUserGiftCatalog(userId) {
  if (!userId) {
    return null;
  }

  const result = await pool.query(
    'SELECT gifts, updated_at FROM gift_catalog_cache WHERE user_id = $1',
    [userId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

async function getStatus(userId = null) {
  try {
    const poolResult = await pool.query('SELECT 1 as ok');

    return {
      status: 'ok',
      backend: 'railway',
      database: poolResult.rowCount > 0 ? 'connected' : 'unknown',
      redis: env.REDIS_URL ? 'configured' : 'disabled',
      hasUser: Boolean(userId),
    };
  } catch (error) {
    logger.error('Status check database probe failed', error);

    return {
      status: 'degraded',
      backend: 'railway',
      database: 'error',
      redis: env.REDIS_URL ? 'configured' : 'disabled',
      hasUser: Boolean(userId),
      error: error.message,
    };
  }
}

module.exports = {
  saveTiktokConnection,
  getTiktokConnection,
  deleteTiktokConnection,
  getGiftCatalog,
  saveUserGiftCatalog,
  getUserGiftCatalog,
  getStatus,
};
