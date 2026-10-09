const { EventEmitter } = require('events');
const logger = require('../config/logger');

const hub = new EventEmitter();
hub.setMaxListeners(100);

// Cada regalo lleva un eventId creciente y se guarda un rato en memoria. Si el canal de eventos de una pagina se corta
// unos segundos (red, proxy, reinicio de pestaña), al volver a conectar el navegador pide "lo que me falte desde el
// ultimo id que recibi" y el servidor se lo reenvia: un regalo ya no se pierde por un corte del canal.
const REPLAY_MAX_EVENTS = 300;
const REPLAY_MAX_AGE_MS = 15 * 60 * 1000;
const replayBuffers = new Map(); // ownerKey -> [{ id, eventName, payload, at }]
let lastEventId = 0;

function nextEventId() {
  // Basado en la hora para que siga creciendo aunque el servidor se reinicie
  lastEventId = Math.max(lastEventId + 1, Date.now() * 1000);
  return lastEventId;
}

function rememberForReplay(ownerKey, eventName, payload) {
  const now = Date.now();
  let buffer = replayBuffers.get(ownerKey);
  if (!buffer) {
    buffer = [];
    replayBuffers.set(ownerKey, buffer);
  }

  buffer.push({ id: payload.eventId, eventName, payload, at: now });
  while (buffer.length > REPLAY_MAX_EVENTS || (buffer.length && now - buffer[0].at > REPLAY_MAX_AGE_MS)) {
    buffer.shift();
  }
}

// Eventos guardados de esa conexion posteriores a afterId (del juego pedido)
function getReplayEvents(ownerKey, gameType, afterId) {
  const buffer = replayBuffers.get(ownerKey);
  const after = Number(afterId);
  if (!buffer || !Number.isFinite(after) || after <= 0) {
    return [];
  }

  const now = Date.now();
  return buffer.filter((item) => item.id > after && now - item.at <= REPLAY_MAX_AGE_MS && item.payload?.gameType === gameType);
}

function emitLiveEvent(eventName, payload) {
  if (eventName === 'gift' && payload && payload.ownerKey) {
    if (!payload.eventId) {
      payload.eventId = nextEventId();
    }
    rememberForReplay(payload.ownerKey, eventName, payload);
  }

  if (eventName === 'gift') {
    logger.info('[LIVEHUB] Emitiendo gift event:', {
      giftName: payload?.giftName,
      gameType: payload?.gameType,
      eventId: payload?.eventId,
      timestamp: payload?.timestamp,
    });
  }
  hub.emit('live-event', {
    eventName,
    payload,
  });
}

module.exports = {
  hub,
  emitLiveEvent,
  getReplayEvents,
};
