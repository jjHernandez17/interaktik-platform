const { EventEmitter } = require('events');
const logger = require('../config/logger');

const hub = new EventEmitter();
hub.setMaxListeners(100);

function emitLiveEvent(eventName, payload) {
  if (eventName === 'gift') {
    logger.info('[LIVEHUB] Emitiendo gift event:', {
      giftName: payload?.giftName,
      gameType: payload?.gameType,
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
};