// Escucha TODOS los eventos de regalo y de likes del sistema (el mismo hub
// que usa /events) y, para cada streamer que tenga overlays configurados,
// actualiza su barra de meta, su top de regaladores y su contador de likes
// de forma persistente en la base de datos. No modifica liveHub.js ni
// tiktokLiveManager.js — es un suscriptor mas, igual de "pasivo" que
// cualquier pestaña de /events, solo que vive todo el tiempo en el servidor
// en vez de abrirse/cerrarse por conexion SSE.

const { hub, emitLiveEvent } = require('./liveHub');
const overlayService = require('./overlayService');
const logger = require('../config/logger');

const OWNER_KEY_PATTERN = /^user:(\d+):/;

function extractUserId(ownerKey) {
  const match = OWNER_KEY_PATTERN.exec(String(ownerKey || ''));
  return match ? Number(match[1]) : null;
}

// Los botones "Enviar regalo/likes de prueba" (overlayRoutes.js) publican un
// evento gift/like real con gameType 'overlay-test' para que el streamer vea
// el efecto en su overlay real sin estar en vivo. Antes esto se acumulaba
// IGUAL que un regalo real — asi que probar el boton dejaba nombres falsos
// (Maria, Carlos, etc.) guardados para siempre en el ranking que ve la
// audiencia real. Ahora, para eventos de prueba, se calcula una vista previa
// (con computeRankedEntries) y se manda por el canal en vivo SIN guardarla:
// el overlay real reacciona igual, pero al recargar vuelve al dato real.
function isTestEvent(payload) {
  return payload?.gameType === 'overlay-test';
}

async function handleGiftEvent(payload) {
  if (!payload?.repeatEnd) return;

  const userId = extractUserId(payload.ownerKey);
  if (!userId) return;

  const diamondCount = Number(payload.diamondCount || 0) || 0;
  const repeatCount = Number(payload.repeatCount || 1) || 1;
  const coins = diamondCount * repeatCount;
  if (coins <= 0) return;

  if (isTestEvent(payload)) {
    try {
      const config = await overlayService.getOrCreateOverlayConfig(userId);
      emitLiveEvent('overlay-goal-update', {
        ownerKey: `user:${userId}:overlay-goal`,
        goalBar: { ...config.state.goalBar, currentCoins: config.state.goalBar.currentCoins + coins },
      });
      emitLiveEvent('overlay-gifters-update', {
        ownerKey: `user:${userId}:overlay-gifters`,
        topGifters: {
          ...config.state.topGifters,
          entries: overlayService.computeRankedEntries(
            config.state.topGifters.entries,
            config.state.topGifters.maxEntries,
            payload.user,
            coins,
            'coins',
          ),
        },
      });
    } catch (error) {
      logger.warn('No se pudo previsualizar el regalo de prueba', error);
    }
    return;
  }

  try {
    const updatedGoalBar = await overlayService.incrementGoalBarCoins(userId, coins);
    if (updatedGoalBar) {
      emitLiveEvent('overlay-goal-update', {
        ownerKey: `user:${userId}:overlay-goal`,
        goalBar: updatedGoalBar.state.goalBar,
      });
    }
  } catch (error) {
    logger.warn('No se pudo acumular monedas de la barra de meta', error);
  }

  try {
    const updatedGifters = await overlayService.incrementTopGifter(userId, payload.user, coins);
    if (updatedGifters) {
      emitLiveEvent('overlay-gifters-update', {
        ownerKey: `user:${userId}:overlay-gifters`,
        topGifters: updatedGifters.state.topGifters,
      });
    }
  } catch (error) {
    logger.warn('No se pudo acumular el top de regaladores', error);
  }
}

async function handleLikeEvent(payload) {
  const userId = extractUserId(payload?.ownerKey);
  if (!userId) return;

  const likes = Number(payload.likeCount || 0) || 0;
  if (likes <= 0) return;

  if (isTestEvent(payload)) {
    try {
      const config = await overlayService.getOrCreateOverlayConfig(userId);
      emitLiveEvent('overlay-likes-update', {
        ownerKey: `user:${userId}:overlay-likes`,
        likeCounter: { ...config.state.likeCounter, totalLikes: config.state.likeCounter.totalLikes + likes },
      });
      emitLiveEvent('overlay-likers-update', {
        ownerKey: `user:${userId}:overlay-likers`,
        topLikers: {
          ...config.state.topLikers,
          entries: overlayService.computeRankedEntries(
            config.state.topLikers.entries,
            config.state.topLikers.maxEntries,
            payload.user,
            likes,
            'likes',
          ),
        },
      });
    } catch (error) {
      logger.warn('No se pudo previsualizar los likes de prueba', error);
    }
    return;
  }

  try {
    const updated = await overlayService.incrementLikeCounter(userId, likes);
    if (updated) {
      emitLiveEvent('overlay-likes-update', {
        ownerKey: `user:${userId}:overlay-likes`,
        likeCounter: updated.state.likeCounter,
      });
    }
  } catch (error) {
    logger.warn('No se pudo acumular el contador de likes', error);
  }

  try {
    const updatedLikers = await overlayService.incrementTopLiker(userId, payload.user, likes);
    if (updatedLikers) {
      emitLiveEvent('overlay-likers-update', {
        ownerKey: `user:${userId}:overlay-likers`,
        topLikers: updatedLikers.state.topLikers,
      });
    }
  } catch (error) {
    logger.warn('No se pudo acumular el top de likes', error);
  }
}

async function handleLiveEvent({ eventName, payload }) {
  if (eventName === 'gift') {
    await handleGiftEvent(payload);
  } else if (eventName === 'like') {
    await handleLikeEvent(payload);
  }
}

function start() {
  hub.on('live-event', (event) => {
    handleLiveEvent(event).catch(() => {});
  });
  logger.info('[OverlayAccumulator] Acumuladores de progreso y top de regaladores en linea');
}

module.exports = { start };
