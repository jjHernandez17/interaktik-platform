// Resumen/estadisticas post-stream: escucha el mismo hub de eventos que
// overlayAccumulator.js, pero lleva un conteo INDEPENDIENTE en memoria por
// streamer (coleccionador aparte, no toca overlay_config para nada) desde
// que se conecta hasta que TikTok avisa que el live termino (evento
// streamEnd). En ese momento vuelca el resumen a la tabla stream_sessions y
// limpia la memoria para la proxima transmision. No modifica ni resetea los
// overlays en vivo (goal bar, top de regaladores, etc.) — esos siguen
// funcionando exactamente igual que antes.

const pool = require('../database/pool');
const { hub } = require('./liveHub');
const logger = require('../config/logger');

const OWNER_KEY_PATTERN = /^user:(\d+):/;
const MAX_TOP_ENTRIES = 5;

// userId -> { startedAt, tiktokUsername, coins, likes, newFollowers, gifters: Map, likers: Map }
const sessions = new Map();

function extractUserId(ownerKey) {
  const match = OWNER_KEY_PATTERN.exec(String(ownerKey || ''));
  return match ? Number(match[1]) : null;
}

function isTestEvent(payload) {
  return payload?.gameType === 'overlay-test';
}

function getOrInitSession(userId, tiktokUsername) {
  let session = sessions.get(userId);
  if (!session) {
    session = {
      startedAt: new Date(),
      tiktokUsername: tiktokUsername || null,
      coins: 0,
      likes: 0,
      newFollowers: 0,
      gifters: new Map(),
      likers: new Map(),
    };
    sessions.set(userId, session);
  } else if (tiktokUsername) {
    session.tiktokUsername = tiktokUsername;
  }
  return session;
}

function trackRankedUser(map, user, amountField, amount) {
  const key = String(user?.uniqueId || user?.nickname || '').trim() || 'anonimo';
  const existing = map.get(key);

  if (existing) {
    existing[amountField] += amount;
    existing.nickname = user?.nickname || existing.nickname;
    existing.avatar = user?.avatar || existing.avatar;
  } else {
    map.set(key, {
      uniqueId: key,
      nickname: user?.nickname || key,
      avatar: user?.avatar || null,
      [amountField]: amount,
    });
  }
}

function topEntries(map, amountField) {
  return Array.from(map.values())
    .sort((a, b) => b[amountField] - a[amountField])
    .slice(0, MAX_TOP_ENTRIES);
}

async function handleStatusEvent(payload) {
  if (payload?.status !== 'connected') return;

  const userId = extractUserId(payload.ownerKey);
  if (!userId) return;

  // Arranca (o reinicia si quedo algo viejo colgado) el conteo de esta
  // transmision apenas se conecta de verdad.
  sessions.delete(userId);
  getOrInitSession(userId, payload.uniqueId);
}

async function handleGiftEvent(payload) {
  if (isTestEvent(payload) || !payload?.repeatEnd) return;

  const userId = extractUserId(payload.ownerKey);
  if (!userId) return;

  const diamondCount = Number(payload.diamondCount || 0) || 0;
  const repeatCount = Number(payload.repeatCount || 1) || 1;
  const coins = diamondCount * repeatCount;
  if (coins <= 0) return;

  const session = getOrInitSession(userId);
  session.coins += coins;
  trackRankedUser(session.gifters, payload.user, 'coins', coins);
}

async function handleLikeEvent(payload) {
  if (isTestEvent(payload)) return;

  const userId = extractUserId(payload.ownerKey);
  if (!userId) return;

  const likes = Number(payload.likeCount || 0) || 0;
  if (likes <= 0) return;

  const session = getOrInitSession(userId);
  session.likes += likes;
  trackRankedUser(session.likers, payload.user, 'likes', likes);
}

async function handleFollowEvent(payload) {
  if (isTestEvent(payload)) return;

  const userId = extractUserId(payload.ownerKey);
  if (!userId) return;

  const session = getOrInitSession(userId);
  session.newFollowers += 1;
}

async function handleStreamEnd(payload) {
  const userId = extractUserId(payload?.ownerKey);
  if (!userId) return;

  const session = sessions.get(userId);
  sessions.delete(userId);
  if (!session) return;

  const hasActivity = session.coins > 0 || session.likes > 0 || session.newFollowers > 0;
  if (!hasActivity) return;

  try {
    await pool.query(
      `INSERT INTO stream_sessions
         (user_id, tiktok_username, started_at, total_coins, total_likes, new_followers, top_gifters, top_likers)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
      [
        userId,
        session.tiktokUsername || payload?.uniqueId || null,
        session.startedAt,
        session.coins,
        session.likes,
        session.newFollowers,
        JSON.stringify(topEntries(session.gifters, 'coins')),
        JSON.stringify(topEntries(session.likers, 'likes')),
      ],
    );
    logger.success(`[StreamStats] Resumen guardado para userId=${userId} (${session.coins} monedas, ${session.likes} likes, ${session.newFollowers} seguidores nuevos)`);
  } catch (error) {
    logger.warn('[StreamStats] No se pudo guardar el resumen de la transmision', error);
  }
}

async function handleLiveEvent({ eventName, payload }) {
  if (eventName === 'status') await handleStatusEvent(payload);
  else if (eventName === 'gift') await handleGiftEvent(payload);
  else if (eventName === 'like') await handleLikeEvent(payload);
  else if (eventName === 'follow') await handleFollowEvent(payload);
  else if (eventName === 'streamEnd') await handleStreamEnd(payload);
}

async function getSessions(userId, limit = 20) {
  const result = await pool.query(
    `SELECT id, tiktok_username, started_at, ended_at, total_coins, total_likes, new_followers, top_gifters, top_likers
     FROM stream_sessions
     WHERE user_id = $1
     ORDER BY ended_at DESC
     LIMIT $2`,
    [userId, Math.max(1, Math.min(100, Number(limit) || 20))],
  );

  return result.rows;
}

function start() {
  hub.on('live-event', (event) => {
    handleLiveEvent(event).catch(() => {});
  });
  logger.info('[StreamStats] Resumen post-stream en linea');
}

module.exports = { start, getSessions };
