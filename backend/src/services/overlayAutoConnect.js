// Vigilante en segundo plano: cada cierto tiempo revisa, para cada cuenta de
// TikTok que un streamer ya vinculo a sus overlays (gameType 'overlay'), si
// ya salio en vivo — y si es asi, conecta automaticamente sin que tenga que
// volver al panel a darle "Conectar" cada vez. No modifica tiktokLiveManager.js
// ni liveHub.js: solo llama a las funciones que ya existen (checkIsLive,
// connectGame, getConnectionState), igual que overlayAccumulator.js es un
// suscriptor mas del sistema de eventos.

const tiktokService = require('./tiktokService');
const tiktokLiveManager = require('./tiktokLiveManager');
const accessService = require('./accessService');
const logger = require('../config/logger');

const SWEEP_INTERVAL_MS = 45000;
const WATCHED_GAME_TYPE = 'overlay';

let sweeping = false;

async function checkAndConnect({ user_id: userId, tiktok_username: uniqueId }) {
  if (!uniqueId) return;

  const state = tiktokLiveManager.getConnectionState(WATCHED_GAME_TYPE, { userId });
  if (state.status === 'connected' || state.status === 'connecting') return;

  const hasAccess = await accessService.hasActiveAccess(userId).catch(() => false);
  if (!hasAccess) return;

  try {
    const isLive = await tiktokLiveManager.checkIsLive(uniqueId);
    if (!isLive) return;

    logger.success(`[OverlayAutoConnect] @${uniqueId} salio en vivo, conectando overlays automaticamente (userId=${userId})`);
    await tiktokLiveManager.connectGame({ gameType: WATCHED_GAME_TYPE, uniqueId, userId });
  } catch (error) {
    logger.warn(`[OverlayAutoConnect] No se pudo revisar/conectar @${uniqueId}`, error);
  }
}

async function sweepOnce() {
  const candidates = await tiktokService.getLinkedConnectionsByGameType(WATCHED_GAME_TYPE);
  await Promise.all(candidates.map((candidate) => checkAndConnect(candidate)));
}

function start() {
  setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    sweepOnce()
      .catch((error) => logger.warn('[OverlayAutoConnect] Error en la ronda de revision', error))
      .finally(() => {
        sweeping = false;
      });
  }, SWEEP_INTERVAL_MS);

  logger.info('[OverlayAutoConnect] Vigilancia automatica de lives para overlays en linea');
}

module.exports = { start };
