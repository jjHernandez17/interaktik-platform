'use strict';

// Ejecutar con: node --test backend/tests/liveHub.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stubModule('config/logger.js', { info() {}, success() {}, warn() {}, error() {} });

const { hub, emitLiveEvent } = require(path.join(root, 'services', 'liveHub.js'));

test('un oyente que falla no impide que los demas reciban el regalo', () => {
  const received = [];
  const bad = () => { throw new Error('oyente roto'); };
  const good = ({ eventName, payload }) => received.push({ eventName, id: payload.eventId });

  hub.on('live-event', bad);
  hub.on('live-event', good);
  try {
    assert.doesNotThrow(() => emitLiveEvent('gift', { ownerKey: 'user:1:snake', gameType: 'snake', giftName: 'Leon' }));
    assert.equal(received.length, 1);
    assert.ok(received[0].id, 'el regalo lleva su id unico');
  } finally {
    hub.off('live-event', bad);
    hub.off('live-event', good);
  }
});

test('cada regalo recibe un id distinto, aunque salgan seguidos', () => {
  const ids = [];
  const listener = ({ payload }) => ids.push(payload.eventId);
  hub.on('live-event', listener);
  try {
    for (let i = 0; i < 50; i += 1) emitLiveEvent('gift', { ownerKey: 'user:1:snake', gameType: 'snake', giftName: `G${i}` });
  } finally {
    hub.off('live-event', listener);
  }
  assert.equal(new Set(ids).size, 50);
  for (let i = 1; i < ids.length; i += 1) assert.ok(ids[i] > ids[i - 1], 'los ids crecen');
});

test('los oyentes que se agregan y quitan durante un evento no rompen el reparto', () => {
  const calls = [];
  const second = () => calls.push('second');
  const first = () => { calls.push('first'); hub.off('live-event', first); hub.on('live-event', second); };
  hub.on('live-event', first);
  try {
    emitLiveEvent('status', { ownerKey: 'user:1:snake', gameType: 'snake' });
    emitLiveEvent('status', { ownerKey: 'user:1:snake', gameType: 'snake' });
  } finally {
    hub.off('live-event', first);
    hub.off('live-event', second);
  }
  assert.deepEqual(calls, ['first', 'second']);
});
