'use strict';

// Ejecutar con: node --test backend/tests/liveGiftsEndToEnd.test.js
//
// Prueba de punta a punta con el gestor REAL de TikTok Live (tiktokLiveManager) y el hub real de eventos: lo unico simulado es
// la conexion con TikTok (se "emiten" mensajes de regalo crudos, como los que entrega la libreria) y la base de datos.
// Comprueba que cada regalo que llega a la conexion sale por el canal que leen las paginas de los juegos.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const root = path.join(__dirname, '..', 'src');
function stubModule(resolved, exports) {
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ---- simulados: base de datos, logger y la libreria de TikTok ----
const silent = { info() {}, success() {}, warn() {}, error() {} };
stubModule(require.resolve(path.join(root, 'config', 'logger.js')), silent);
const fakePool = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} }),
};
stubModule(require.resolve(path.join(root, 'database', 'pool.js')), fakePool);

const connections = [];
class FakeConnection extends EventEmitter {
  constructor(uniqueId) { super(); this.uniqueId = uniqueId; this.roomId = 'room-1'; this.availableGifts = []; connections.push(this); }
  async connect() { return { roomId: 'room-1', roomInfo: {}, availableGifts: [] }; }
  async fetchAvailableGifts() { return []; }
  async disconnect() {}
}
const names = new Proxy({}, { get: (_target, key) => String(key) });
const connectorPath = require.resolve('tiktok-live-connector', { paths: [root] });
stubModule(connectorPath, { TikTokLiveConnection: FakeConnection, WebcastEvent: names, ControlEvent: names });

const manager = require(path.join(root, 'services', 'tiktokLiveManager.js'));
const { hub } = require(path.join(root, 'services', 'liveHub.js'));

// ---- ayudas ----
let nextUser = 1000;
async function openConnection(gameType) {
  const userId = nextUser++;
  await manager.connectGame({ gameType, uniqueId: `streamer${userId}`, userId });
  const connection = connections[connections.length - 1];
  const received = [];
  const listener = ({ eventName, payload }) => {
    if (eventName === 'gift' && payload.ownerKey === `user:${userId}:${gameType}`) received.push(payload);
  };
  hub.on('live-event', listener);
  return {
    userId,
    received,
    send: (raw) => connection.emit('GIFT', raw),
    close: () => hub.off('live-event', listener),
    units: () => received.reduce((sum, gift) => sum + gift.repeatCount, 0),
  };
}

let seq = 0;
function raw({ user = 'espectador', giftId = 1, name = 'Leon', count = 1, end = 1, combo = false, type = 2, groupId, msgId, createTime, coins = 29999 } = {}) {
  seq += 1;
  return {
    giftId,
    repeatCount: count,
    repeatEnd: end,
    groupId,
    common: { msgId: msgId === undefined ? `msg-${seq}` : msgId, createTime: createTime === undefined ? String(1_000_000 + seq) : createTime },
    user: { userId: user, uniqueId: user, nickname: user },
    giftDetails: { combo, giftType: type, giftName: name, diamondCount: coins },
  };
}

const GAMES = ['snake', 'race', 'dominance', 'app', 'boyvsgirl', 'kingdoms', 'shellgame', 'robloxfighters', 'gtarampa', 'overlay'];

test('regalos de punta a punta', async (t) => {
  t.after(() => setTimeout(() => process.exit(process.exitCode || 0), 50).unref());

  for (const game of GAMES) {
    await t.test(`[${game}] dos regalos grandes seguidos, sin racha: llegan los dos con ids distintos`, async () => {
      const c = await openConnection(game);
      c.send(raw({}));
      c.send(raw({}));
      assert.equal(c.received.length, 2);
      assert.equal(new Set(c.received.map((g) => g.eventId)).size, 2, 'cada regalo con su id');
      assert.equal(c.units(), 2);
      assert.ok(c.received.every((g) => g.repeatEnd === true), 'ningun juego espera un cierre');
      c.close();
    });
  }

  for (const game of GAMES) {
    await t.test(`[${game}] dos regalos de racha mandados al instante (el 2do antes de que cierre el 1ro)`, async () => {
      const c = await openConnection(game);
      c.send(raw({ combo: true, type: 1, count: 1, end: 0, msgId: 'a1' }));
      c.send(raw({ combo: true, type: 1, count: 1, end: 0, msgId: 'b1' }));
      c.send(raw({ combo: true, type: 1, count: 1, end: 1, msgId: 'a2' }));
      c.send(raw({ combo: true, type: 1, count: 1, end: 1, msgId: 'b2' }));
      // Lo que aun espere su cierre se entrega al cerrar la conexion; recien despues se cuenta (asi tambien se detecta si sobra algo)
      await manager.disconnectGame(game, { userId: c.userId, byUser: true }).catch(() => {});
      c.close();
      assert.equal(c.units(), 2, `llegaron ${c.units()} de 2`);
    });
  }

  // Datos reales de los logs de Railway: combo=true y type=2, mismo grupo, count=1 en cada mensaje
  for (const game of GAMES) {
    await t.test(`[${game}] LOG REAL: Mishka Bear x2 seguidos (mismo grupo, count=1, msgId distinto) llegan los dos`, async () => {
      const c = await openConnection(game);
      c.send(raw({ user: 'b4zugg', giftId: 5582, name: 'Mishka Bear', combo: true, type: 2, count: 1, end: 0, groupId: '1792188666144', msgId: '7697391705763334930' }));
      c.send(raw({ user: 'b4zugg', giftId: 5582, name: 'Mishka Bear', combo: true, type: 2, count: 1, end: 0, groupId: '1792188666144', msgId: '7697391706963905286' }));
      assert.equal(c.units(), 2, `llegaron ${c.units()} de 2, sin esperar al cierre`);
      assert.equal(new Set(c.received.map((g) => g.eventId)).size, 2);
      c.close();
    });
  }

  // ---- likes: cada mensaje vale los likes de ESE mensaje; el total de la sala nunca se le suma a un espectador ----
  await t.test('[overlay] un mensaje de likes trae los likes de ese mensaje', async () => {
    const c = await openConnection('overlay');
    const likes = [];
    const listener = ({ eventName, payload }) => { if (eventName === 'like' && payload.ownerKey === `user:${c.userId}:overlay`) likes.push(payload.likeCount); };
    hub.on('live-event', listener);
    try {
      connections[connections.length - 1].emit('LIKE', { likeCount: 7, totalLikeCount: 98765, user: { uniqueId: 'ana', nickname: 'Ana' } });
      connections[connections.length - 1].emit('LIKE', { likeCount: 0, totalLikeCount: 98765, user: { uniqueId: 'ana', nickname: 'Ana' } });
      connections[connections.length - 1].emit('LIKE', { totalLikeCount: 98765, user: { uniqueId: 'ana', nickname: 'Ana' } });
      connections[connections.length - 1].emit('LIKE', { likeCount: 'abc', totalLikeCount: 98765, user: { uniqueId: 'ana', nickname: 'Ana' } });
      assert.deepEqual(likes, [7, 1, 1, 1], 'nunca se usa el total de la sala (98765)');
    } finally {
      hub.off('live-event', listener);
      c.close();
    }
  });

  await t.test('[snake] dos regalos que comparten msgId pero tienen otra hora llegan los dos', async () => {
    const c = await openConnection('snake');
    c.send(raw({ msgId: 'IGUAL', createTime: '5000' }));
    c.send(raw({ msgId: 'IGUAL', createTime: '5400' }));
    assert.equal(c.units(), 2);
    c.close();
  });

  await t.test('[snake] el mismo mensaje reenviado por TikTok cuenta una sola vez', async () => {
    const c = await openConnection('snake');
    const message = raw({ msgId: 'REENVIO', createTime: '7000' });
    c.send(message);
    c.send({ ...message });
    c.send({ ...message });
    assert.equal(c.units(), 1);
    c.close();
  });

  await t.test('[snake] diez regalos grandes seguidos de dos espectadores distintos llegan todos', async () => {
    const c = await openConnection('snake');
    for (let i = 0; i < 10; i += 1) c.send(raw({ user: i % 2 ? 'ana' : 'luis' }));
    assert.equal(c.units(), 10);
    assert.equal(new Set(c.received.map((g) => g.eventId)).size, 10);
    c.close();
  });

  await t.test('[snake] un oyente del hub que falla no deja sin regalo a la pagina del juego', async () => {
    const c = await openConnection('snake');
    const broken = () => { throw new Error('oyente roto'); };
    hub.prependListener('live-event', broken);
    try {
      c.send(raw({}));
      c.send(raw({}));
      assert.equal(c.units(), 2);
    } finally {
      hub.off('live-event', broken);
      c.close();
    }
  });

  await t.test('[snake] si Socket.IO falla, el regalo igual llega por el canal principal y no se duplica', async () => {
    const c = await openConnection('snake');
    global.io = { emit() { throw new Error('socket caido'); } };
    try {
      c.send(raw({}));
      c.send(raw({}));
      assert.equal(c.units(), 2);
    } finally {
      delete global.io;
      c.close();
    }
  });

  await t.test('[snake] un mensaje de regalo con datos raros igual se entrega', async () => {
    const c = await openConnection('snake');
    const weird = raw({});
    weird.user = { userId: 77, uniqueId: undefined, nickname: null };
    weird.giftDetails = { combo: false, giftType: 2, diamondCount: 50 };
    c.send(weird);
    assert.equal(c.units(), 1);
    c.close();
  });
});
