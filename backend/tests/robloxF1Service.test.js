'use strict';

// Ejecutar con: node --test backend/tests/robloxF1Service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// Base de mentira: solo lo que usan los comentarios y los regalos
const queue = [];
const rules = new Map();
let keyword = 'unirme';
stubModule('config/logger.js', { info() {}, success() {}, warn() {}, error() {} });
stubModule('middleware/auth.js', { isSuperUserEmail: () => false });
stubModule('database/pool.js', {
  async query(sql, params) {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT * FROM roblox_f1_config')) return { rowCount: 1, rows: [{ user_id: params[0], join_keyword: keyword, laps: 3, lobby_seconds: 30 }] };
    if (text.startsWith('SELECT gift_id, power, target, seconds FROM roblox_f1_gift_rules')) return { rowCount: rules.size, rows: [...rules.values()] };
    if (text.startsWith('INSERT INTO roblox_f1_queue')) {
      const [userId, kind, uniqueId, nickname, power, target, seconds, robloxUserId] = params;
      queue.push({ userId, kind, uniqueId, nickname, power, target, seconds, robloxUserId });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`consulta no soportada: ${text}`);
  },
});

const service = require(path.join(root, 'services', 'robloxF1Service.js'));
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('"1" une sin cuenta de Roblox; "!unirme <ID>" une con skin de Roblox', () => {
  for (const comment of ['1', ' 1 ', '1!', '1.']) {
    assert.deepEqual(service.parseJoin(comment, 'unirme'), { robloxUserId: null }, comment);
  }
  for (const [comment, id] of [['!unirme 123456789', 123456789], ['Unirme 42', 42], ['¡ÚNIRME!   987654321', 987654321]]) {
    assert.deepEqual(service.parseJoin(comment, 'unirme'), { robloxUserId: id }, comment);
  }
  for (const comment of ['!unirme', 'unirme', 'quiero unirme 123', '!unirme abc', '!unirme 12 34', '!unirme 0', '!unirme 1234567890123456', '11', '2', '', 'hola']) {
    assert.equal(service.parseJoin(comment, 'unirme'), null, comment);
  }
});

test('la palabra configurada se limpia y nunca queda vacia', () => {
  assert.equal(service.normalizeKeyword('¡Únete Ya!'), 'uneteya');
  assert.equal(service.normalizeKeyword('!!!'), 'unirme');
  assert.equal(service.normalizeKeyword(undefined), 'unirme');
});

test('los dos tipos de union se encolan; repetir enseguida no llena la cola', async () => {
  await service.handleChatComment(7, { comment: '1', user: { uniqueId: 'Ana', nickname: 'Ana P' } });
  await service.handleChatComment(7, { comment: '!unirme 555', user: { uniqueId: 'Ana', nickname: 'Ana P' } }); // repetido: se ignora
  await service.handleChatComment(7, { comment: '!unirme 777', user: { uniqueId: 'Luis', nickname: 'Luis' } });
  await service.handleChatComment(7, { comment: 'hola a todos', user: { uniqueId: 'pepe' } });
  await flush();
  assert.deepEqual(queue.map((item) => [item.uniqueId, item.kind, item.robloxUserId]), [['Ana', 'join', null], ['Luis', 'join', 777]]);
});

test('un regalo con regla encola su poder; un combo suma segundos con tope; sin regla no hace nada', async () => {
  rules.set('1', { gift_id: '1', power: 'turbo', target: 'self', seconds: 8 });
  queue.length = 0;

  await service.handleGift(7, { giftId: 1, repeatCount: 1, user: { uniqueId: 'bob', nickname: 'Bob' } });
  await service.handleGift(7, { giftId: 1, repeatCount: 5, user: { uniqueId: 'bob', nickname: 'Bob' } });
  await service.handleGift(7, { giftId: 1, repeatCount: 500, user: { uniqueId: 'bob', nickname: 'Bob' } });
  await service.handleGift(7, { giftId: 999, repeatCount: 1, user: { uniqueId: 'bob' } });

  assert.deepEqual(queue.map((item) => item.seconds), [8, 40, 60]);
  assert.ok(queue.every((item) => item.kind === 'power' && item.power === 'turbo' && item.target === 'self'));
});
