// Recuerda que regalos mando cada espectador a cada streamer (y quien lo siguio durante el live) para que el
// "Lector de comentarios" pueda decidir a quien leer. Es un suscriptor pasivo del mismo hub de eventos que usa
// overlayAccumulator: no toca liveHub.js ni el flujo de regalos de los juegos.
//
// Solo mira la conexion de overlays (gameType 'overlay'); los regalos de prueba ('overlay-test') se ignoran para que
// "Enviar regalo de prueba" no deje espectadores falsos en el historial.

'use strict';

const { hub } = require('./liveHub');
const pool = require('../database/pool');
const logger = require('../config/logger');

const WATCHED_GAME_TYPE = 'overlay';
const OWNER_KEY_PATTERN = /^user:(\d+):/;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20000;
const FOLLOWED_MAX_PER_USER = 50000;
const KEEP_DAYS = 180;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;

const cache = new Map(); // "userId|usuario" -> { at, info }
const followedInLive = new Map(); // userId -> Set(usuario)

function normalizeId(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function keyFor(userId, uniqueId) {
  return `${Number(userId)}|${normalizeId(uniqueId)}`;
}

function extractUserId(ownerKey) {
  const match = OWNER_KEY_PATTERN.exec(String(ownerKey || ''));
  return match ? Number(match[1]) : null;
}

function emptyInfo() {
  return { gifts: [], maxGiftCoins: 0, followedLive: false };
}

function rememberInCache(key, info) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Se vacia la mitad mas vieja: simple y suficiente para un cache que se rellena solo
    let toDrop = Math.floor(CACHE_MAX_ENTRIES / 2);
    for (const oldKey of cache.keys()) {
      cache.delete(oldKey);
      toDrop -= 1;
      if (toDrop <= 0) break;
    }
  }
  cache.set(key, { at: Date.now(), info });
}

function infoFromRows(rows, followed) {
  const gifts = rows.map((row) => ({ name: String(row.gift_name), coins: Number(row.max_coins) || 0 }));
  return {
    gifts,
    maxGiftCoins: gifts.reduce((max, gift) => Math.max(max, gift.coins), 0),
    followedLive: Boolean(followed),
  };
}

function hasFollowed(userId, uniqueId) {
  const set = followedInLive.get(Number(userId));
  return Boolean(set && set.has(normalizeId(uniqueId)));
}

// Lo que se sabe de este espectador para este streamer. Nunca lanza: si la base falla, devuelve "sin datos".
async function getViewerInfo(userId, uniqueId) {
  const id = normalizeId(uniqueId);
  if (!userId || !id) return emptyInfo();

  const key = keyFor(userId, id);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.info, followedLive: hasFollowed(userId, id) };
  }

  try {
    const result = await pool.query(
      'SELECT gift_name, max_coins FROM viewer_gifts WHERE user_id = $1 AND tiktok_unique_id = $2',
      [userId, id],
    );
    const info = infoFromRows(result.rows, hasFollowed(userId, id));
    rememberInCache(key, info);
    return info;
  } catch (error) {
    logger.warn('[viewerTracker] No se pudo leer el historial de regalos del espectador', error);
    return emptyInfo();
  }
}

async function recordGift(userId, user, giftName, coins) {
  const id = normalizeId(user?.uniqueId);
  const name = String(giftName || '').trim().slice(0, 120);
  const amount = Math.max(0, Math.round(Number(coins) || 0));
  if (!userId || !id || !name) return;

  await pool.query(
    `INSERT INTO viewer_gifts (user_id, tiktok_unique_id, gift_name, max_coins, times, last_at)
     VALUES ($1, $2, $3, $4, 1, NOW())
     ON CONFLICT (user_id, tiktok_unique_id, gift_name) DO UPDATE SET
       max_coins = GREATEST(viewer_gifts.max_coins, EXCLUDED.max_coins),
       times = viewer_gifts.times + 1,
       last_at = NOW()`,
    [userId, id.slice(0, 120), name, amount],
  );

  // Si ya estaba en el cache, se actualiza ahi mismo para que el siguiente comentario ya lo vea
  const key = keyFor(userId, id);
  const cached = cache.get(key);
  if (cached) {
    const gifts = cached.info.gifts.filter((gift) => gift.name !== name);
    const previous = cached.info.gifts.find((gift) => gift.name === name);
    gifts.push({ name, coins: Math.max(previous ? previous.coins : 0, amount) });
    cache.set(key, {
      at: Date.now(),
      info: { ...cached.info, gifts, maxGiftCoins: gifts.reduce((max, gift) => Math.max(max, gift.coins), 0) },
    });
  }
}

function rememberFollow(userId, user) {
  const id = normalizeId(user?.uniqueId);
  if (!userId || !id) return;

  let set = followedInLive.get(userId);
  if (!set) {
    set = new Set();
    followedInLive.set(userId, set);
  }
  if (set.size < FOLLOWED_MAX_PER_USER) set.add(id);

  const cached = cache.get(keyFor(userId, id));
  if (cached) cached.info = { ...cached.info, followedLive: true };
}

function handleLiveEvent({ eventName, payload }) {
  if (!payload || payload.gameType !== WATCHED_GAME_TYPE) return;

  const userId = extractUserId(payload.ownerKey);
  if (!userId) return;

  if (eventName === 'gift') {
    // Un combo de regalos manda varios eventos; solo cuenta cuando termina (igual que el resto del sistema)
    if (!payload.repeatEnd) return;
    const coins = (Number(payload.diamondCount) || 0) * (Number(payload.repeatCount) || 1);
    recordGift(userId, payload.user, payload.giftName, coins).catch((error) => {
      logger.warn('[viewerTracker] No se pudo guardar un regalo en el historial', error);
    });
  } else if (eventName === 'follow') {
    rememberFollow(userId, payload.user);
  }
}

async function cleanup() {
  try {
    await pool.query(`DELETE FROM viewer_gifts WHERE last_at < NOW() - ($1::int * INTERVAL '1 day')`, [KEEP_DAYS]);
  } catch (error) {
    logger.warn('[viewerTracker] No se pudo limpiar el historial antiguo', error);
  }
}

let started = false;

function start() {
  if (started) return;
  started = true;

  hub.on('live-event', handleLiveEvent);
  cleanup();
  setInterval(cleanup, CLEANUP_EVERY_MS).unref();
  logger.info('[viewerTracker] Recordando regalos de espectadores para el lector de comentarios');
}

module.exports = {
  start,
  getViewerInfo,
  recordGift,
  rememberFollow,
  handleLiveEvent,
  normalizeId,
};
