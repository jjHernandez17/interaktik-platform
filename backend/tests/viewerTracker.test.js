'use strict';

// Ejecutar con: node --test backend/tests/viewerTracker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// Base de mentira: solo la tabla viewer_gifts
const rows = new Map(); // "user|id|regalo" -> { gift_name, max_coins, times }
let selects = 0;
let failSelect = false;
stubModule('config/logger.js', { info() {}, success() {}, warn() {}, error() {} });
stubModule('database/pool.js', {
  async query(sql, params) {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.startsWith('INSERT INTO viewer_gifts')) {
      const [userId, id, name, coins] = params;
      const key = `${userId}|${id}|${name}`;
      const existing = rows.get(key);
      if (existing) {
        existing.max_coins = Math.max(existing.max_coins, coins);
        existing.times += 1;
      } else {
        rows.set(key, { user: userId, id, gift_name: name, max_coins: coins, times: 1 });
      }
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('SELECT gift_name, max_coins FROM viewer_gifts')) {
      selects += 1;
      if (failSelect) throw new Error('base caida');
      const [userId, id] = params;
      const found = [...rows.values()].filter((row) => row.user === userId && row.id === id);
      return { rowCount: found.length, rows: found };
    }
    if (text.startsWith('DELETE FROM viewer_gifts')) return { rowCount: 0, rows: [] };
    throw new Error(`consulta no soportada: ${text}`);
  },
});

const tracker = require(path.join(root, 'services', 'viewerTracker.js'));
const gift = (over) => ({
  eventName: 'gift',
  payload: { gameType: 'overlay', ownerKey: 'user:5:overlay', repeatEnd: true, giftName: 'Quiéreme', diamondCount: 99, repeatCount: 1, user: { uniqueId: 'Ana_1' }, ...over },
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('un espectador sin historial no tiene regalos ni monedas', async () => {
  const info = await tracker.getViewerInfo(5, 'nadie');
  assert.deepEqual(info, { gifts: [], maxGiftCoins: 0, followedLive: false });
});

test('un regalo terminado se guarda con su nombre y su valor (quien lo mando, sin importar mayusculas ni @)', async () => {
  tracker.handleLiveEvent(gift());
  await flush();
  const info = await tracker.getViewerInfo(5, '@ana_1');
  assert.deepEqual(info.gifts, [{ name: 'Quiéreme', coins: 99 }]);
  assert.equal(info.maxGiftCoins, 99);
});

test('un combo cuenta solo al terminar y vale diamantes por repeticiones', async () => {
  tracker.handleLiveEvent(gift({ repeatEnd: false, giftName: 'Rosa', diamondCount: 1, repeatCount: 3, user: { uniqueId: 'luis' } }));
  await flush();
  assert.equal((await tracker.getViewerInfo(5, 'luis')).gifts.length, 0, 'un combo a medias no cuenta');

  tracker.handleLiveEvent(gift({ repeatEnd: true, giftName: 'Rosa', diamondCount: 1, repeatCount: 30, user: { uniqueId: 'luis' } }));
  await flush();
  const info = await tracker.getViewerInfo(5, 'luis');
  assert.deepEqual(info.gifts, [{ name: 'Rosa', coins: 30 }]);
});

test('guarda el regalo de mayor valor y actualiza el cache sin volver a consultar', async () => {
  tracker.handleLiveEvent(gift({ giftName: 'Rosa', diamondCount: 1, repeatCount: 1, user: { uniqueId: 'caro' } }));
  await flush();
  await tracker.getViewerInfo(5, 'caro'); // llena el cache
  const before = selects;

  tracker.handleLiveEvent(gift({ giftName: 'Universo', diamondCount: 34999, repeatCount: 1, user: { uniqueId: 'caro' } }));
  await flush();
  const info = await tracker.getViewerInfo(5, 'caro');
  assert.equal(selects, before, 'se resolvio desde el cache');
  assert.equal(info.maxGiftCoins, 34999);
  assert.deepEqual(info.gifts.map((g) => g.name).sort(), ['Rosa', 'Universo']);
});

test('los regalos de prueba, de otros juegos o sin dueno se ignoran', async () => {
  const before = rows.size;
  tracker.handleLiveEvent(gift({ gameType: 'overlay-test', user: { uniqueId: 'falso1' } }));
  tracker.handleLiveEvent(gift({ gameType: 'snake', user: { uniqueId: 'falso2' } }));
  tracker.handleLiveEvent(gift({ ownerKey: 'sin-formato', user: { uniqueId: 'falso3' } }));
  tracker.handleLiveEvent(gift({ giftName: '', user: { uniqueId: 'falso4' } }));
  await flush();
  assert.equal(rows.size, before);
});

test('cada streamer tiene su propio historial', async () => {
  tracker.handleLiveEvent(gift({ ownerKey: 'user:9:overlay', giftName: 'Quiéreme', user: { uniqueId: 'solo_del_9' } }));
  await flush();
  assert.equal((await tracker.getViewerInfo(9, 'solo_del_9')).gifts.length, 1);
  assert.equal((await tracker.getViewerInfo(5, 'solo_del_9')).gifts.length, 0);
});

test('seguir durante el live se recuerda', async () => {
  assert.equal((await tracker.getViewerInfo(5, 'seguidor')).followedLive, false);
  tracker.handleLiveEvent({ eventName: 'follow', payload: { gameType: 'overlay', ownerKey: 'user:5:overlay', user: { uniqueId: 'Seguidor' } } });
  assert.equal((await tracker.getViewerInfo(5, 'seguidor')).followedLive, true);
  assert.equal((await tracker.getViewerInfo(6, 'seguidor')).followedLive, false, 'solo para ese streamer');
});

test('si la base falla, el comentario no se pierde: se devuelve "sin datos"', async () => {
  failSelect = true;
  const info = await tracker.getViewerInfo(5, 'otra_persona');
  failSelect = false;
  assert.deepEqual(info, { gifts: [], maxGiftCoins: 0, followedLive: false });
});
