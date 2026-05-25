const { EventEmitter } = require('events');

const hub = new EventEmitter();
hub.setMaxListeners(100);

function emitLiveEvent(eventName, payload) {
  hub.emit('live-event', {
    eventName,
    payload,
  });
}

module.exports = {
  hub,
  emitLiveEvent,
};