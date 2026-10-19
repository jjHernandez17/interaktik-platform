'use strict';

// Ejecutar con: node --test backend/tests/overlayRanking.test.js
//
// "Top Likes" y "Top Regaladores" de los overlays: el top tiene que reflejar lo que de verdad lleva cada espectador, incluidos
// los que llegan despues y no estaban todavia en la tabla. Usa una base de mentira (overlay_config + overlay_viewer_totals).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const KEY_COLUMNS = ['gift_alert_key', 'goal_bar_key', 'top_gifters_key', 'like_counter_key', 'top_likers_key', 'follow_alert_key', 'roulette_key', 'battle_key'];
let seq = 0;
const db = { configs: new Map(), totals: new Map() };

function freshState(maxEntries = 5) {
  return {
    topLikers: { enabled: true, title: 'Top Likes', maxEntries, entries: [] },
    topGifters: { enabled: true, title: 'Top Regaladores', maxEntries, entries: [] },
    battle: { scoreA: 0, scoreB: 0 },
  };
}

function reset(maxEntries = 5) {
  db.configs.clear();
  db.totals.clear();
  db.configs.set(1, { state: freshState(maxEntries) });
  db.configs.set(2, { state: freshState(maxEntries) });
}

function row(userId) {
  const config = db.configs.get(userId);
  return { ...Object.fromEntries(KEY_COLUMNS.map((column) => [column, `k-${column}`])), state: JSON.parse(JSON.stringify(config.state)), updated_at: new Date() };
}

function exec(sql, params = []) {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [], rowCount: 0 };

  if (text.startsWith('SELECT state FROM overlay_config WHERE user_id = $1 FOR UPDATE')) {
    const config = db.configs.get(params[0]);
    return config ? { rows: [{ state: JSON.parse(JSON.stringify(config.state)) }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (text.startsWith('SELECT state FROM overlay_config WHERE user_id = $1')) {
    const config = db.configs.get(params[0]);
    return config ? { rows: [{ state: JSON.parse(JSON.stringify(config.state)) }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (text.startsWith('UPDATE overlay_config SET state = $2::jsonb')) {
    db.configs.get(params[0]).state = JSON.parse(params[1]);
    return { rows: [row(params[0])], rowCount: 1 };
  }
  if (text.startsWith('INSERT INTO overlay_viewer_totals')) {
    const [userId, kind, key, nickname, avatar, total] = params;
    const id = `${userId}|${kind}|${key}`;
    const existing = db.totals.get(id);
    if (existing) {
      existing.total += total;
      if (nickname) existing.nickname = nickname;
      if (avatar) existing.avatar = avatar;
      existing.at = ++seq;
    } else {
      db.totals.set(id, { key, nickname, avatar, total, at: ++seq });
    }
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('SELECT viewer_key, nickname, avatar, total FROM overlay_viewer_totals')) {
    const [userId, kind, limit] = params;
    const rows = [...db.totals.entries()]
      .filter(([id]) => id.startsWith(`${userId}|${kind}|`))
      .map(([, value]) => value)
      .sort((a, b) => b.total - a.total || a.at - b.at || a.key.localeCompare(b.key))
      .slice(0, limit)
      .map((value) => ({ viewer_key: value.key, nickname: value.nickname, avatar: value.avatar, total: value.total }));
    return { rows, rowCount: rows.length };
  }
  if (text.startsWith('DELETE FROM overlay_viewer_totals WHERE user_id = $1 AND kind = $2')) {
    for (const id of [...db.totals.keys()]) if (id.startsWith(`${params[0]}|${params[1]}|`)) db.totals.delete(id);
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('SELECT ') && text.includes('FROM overlay_config WHERE user_id = $1')) {
    return db.configs.has(params[0]) ? { rows: [row(params[0])], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (text.startsWith('UPDATE overlay_config SET state = jsonb_set(')) {
    const config = db.configs.get(params[0]);
    const key = text.includes("'{topLikers}'") ? 'topLikers' : 'topGifters';
    config.state[key].entries = [];
    return { rows: [row(params[0])], rowCount: 1 };
  }
  throw new Error(`consulta no soportada por la base de mentira: ${text.slice(0, 110)}`);
}

stubModule('config/logger.js', { info() {}, success() {}, warn() {}, error() {} });
stubModule('database/pool.js', {
  query: async (sql, params) => exec(sql, params),
  connect: async () => ({ query: async (sql, params) => exec(sql, params), release() {} }),
});

const service = require(path.join(root, 'services', 'overlayService.js'));

const viewer = (id, nickname = id.toUpperCase()) => ({ uniqueId: id, nickname, avatar: `https://img/${id}.png` });
const topLikes = () => db.configs.get(1).state.topLikers.entries.map((entry) => `${entry.uniqueId}:${entry.likes}`);
const topCoins = () => db.configs.get(1).state.topGifters.entries.map((entry) => `${entry.uniqueId}:${entry.coins}`);

test('EL CASO REAL: los que llegan despues y llevan mas likes SI entran al top y desplazan a los que se quedaron quietos', async () => {
  reset();
  for (const [id, likes] of [['a', 120], ['b', 100], ['c', 90], ['d', 80], ['e', 70]]) await service.incrementTopLiker(1, viewer(id), likes);
  assert.deepEqual(topLikes(), ['a:120', 'b:100', 'c:90', 'd:80', 'e:70']);

  // dejan de dar likes y llegan otros, que dan muchos, en mensajes chicos (asi llegan los likes de verdad)
  for (let i = 0; i < 40; i += 1) {
    await service.incrementTopLiker(1, viewer('nuevo1'), 10);
    await service.incrementTopLiker(1, viewer('nuevo2'), 8);
  }
  assert.deepEqual(topLikes(), ['nuevo1:400', 'nuevo2:320', 'a:120', 'b:100', 'c:90']);
});

test('quien esta fuera del top va sumando y entra justo cuando supera al ultimo (ni antes ni despues)', async () => {
  reset();
  for (const [id, likes] of [['a', 50], ['b', 40], ['c', 30], ['d', 20], ['e', 10]]) await service.incrementTopLiker(1, viewer(id), likes);

  for (let i = 0; i < 9; i += 1) await service.incrementTopLiker(1, viewer('f'), 1); // 9 likes: todavia no alcanza a 'e'
  assert.ok(!topLikes().some((entry) => entry.startsWith('f:')));
  await service.incrementTopLiker(1, viewer('f'), 1); // 10: empata con 'e', que llego primero
  assert.ok(!topLikes().some((entry) => entry.startsWith('f:')), 'en empate queda arriba quien llego primero');
  await service.incrementTopLiker(1, viewer('f'), 1); // 11: ya supera a 'e'
  assert.deepEqual(topLikes(), ['a:50', 'b:40', 'c:30', 'd:20', 'f:11']);
});

test('un espectador que baja del top no pierde lo que acumulo: si vuelve a dar likes, sigue desde su total real', async () => {
  reset();
  for (const [id, likes] of [['a', 100], ['b', 90], ['c', 80], ['d', 70], ['e', 60]]) await service.incrementTopLiker(1, viewer(id), likes);
  await service.incrementTopLiker(1, viewer('x'), 200); // sube al primer lugar y saca a 'e'
  await service.incrementTopLiker(1, viewer('y'), 250);
  await service.incrementTopLiker(1, viewer('z'), 300);
  await service.incrementTopLiker(1, viewer('w'), 350);
  await service.incrementTopLiker(1, viewer('v'), 400);
  assert.ok(!topLikes().some((entry) => entry.startsWith('a:')), 'a quedo fuera');
  await service.incrementTopLiker(1, viewer('a'), 5); // vuelve: su total real es 105, no 5
  const a = db.totals.get('1|likes|a');
  assert.equal(a.total, 105);
});

test('las mismas reglas valen para el Top Regaladores (monedas)', async () => {
  reset();
  for (const [id, coins] of [['a', 500], ['b', 400], ['c', 300], ['d', 200], ['e', 100]]) await service.incrementTopGifter(1, viewer(id), coins);
  for (let i = 0; i < 30; i += 1) await service.incrementTopGifter(1, viewer('tardio'), 30); // 900 monedas en regalitos
  assert.deepEqual(topCoins(), ['tardio:900', 'a:500', 'b:400', 'c:300', 'd:200']);
});

test('cada streamer tiene su propio ranking y el de likes no se mezcla con el de monedas', async () => {
  reset();
  await service.incrementTopLiker(1, viewer('a'), 10);
  await service.incrementTopGifter(1, viewer('a'), 99);
  await service.incrementTopLiker(2, viewer('a'), 7);
  assert.equal(db.totals.get('1|likes|a').total, 10);
  assert.equal(db.totals.get('1|coins|a').total, 99);
  assert.equal(db.totals.get('2|likes|a').total, 7);
  assert.deepEqual(db.configs.get(2).state.topLikers.entries.map((e) => e.likes), [7], 'el streamer 2 solo ve lo suyo');
  assert.deepEqual(topLikes(), ['a:10'], 'el streamer 1 no recibe los likes del 2');
});

test('el nombre y la foto se actualizan si cambian, y no se pierden si un mensaje no los trae', async () => {
  reset();
  await service.incrementTopLiker(1, { uniqueId: 'ana', nickname: 'Ana', avatar: 'https://img/viejo.png' }, 5);
  await service.incrementTopLiker(1, { uniqueId: 'ana', nickname: 'Ana Maria', avatar: null }, 5);
  const entry = db.configs.get(1).state.topLikers.entries[0];
  assert.equal(entry.nickname, 'Ana Maria');
  assert.equal(entry.avatar, 'https://img/viejo.png');
  assert.equal(entry.likes, 10);
});

test('un espectador sin usuario ni nombre se agrupa como "anonimo" y los likes en cero no cuentan', async () => {
  reset();
  assert.equal(await service.incrementTopLiker(1, {}, 0), null);
  await service.incrementTopLiker(1, {}, 3);
  await service.incrementTopLiker(1, null, 4);
  assert.deepEqual(topLikes(), ['anonimo:7']);
});

test('reiniciar el top de likes borra el acumulado (y no toca el de monedas)', async () => {
  reset();
  await service.incrementTopLiker(1, viewer('a'), 10);
  await service.incrementTopGifter(1, viewer('a'), 50);
  await service.resetTopLikers(1);
  assert.deepEqual(topLikes(), []);
  assert.equal(db.totals.has('1|likes|a'), false, 'el acumulado tambien se borro');
  assert.equal(db.totals.get('1|coins|a').total, 50);

  // y despues de reiniciar se empieza de cero de verdad
  await service.incrementTopLiker(1, viewer('b'), 2);
  assert.deepEqual(topLikes(), ['b:2']);
});

test('guardar la configuracion NO pisa el top con datos viejos de la pagina, y respeta cuantos puestos mostrar', async () => {
  reset();
  for (const [id, likes] of [['a', 70], ['b', 60], ['c', 50], ['d', 40], ['e', 30], ['f', 20], ['g', 10]]) await service.incrementTopLiker(1, viewer(id), likes);
  assert.equal(topLikes().length, 5);

  // la pagina lleva rato abierta y manda una tabla vieja y vacia + pide mostrar 7 puestos
  const stale = freshState(7);
  stale.topLikers.entries = [{ uniqueId: 'viejo', nickname: 'Viejo', avatar: null, likes: 1 }];
  const saved = await service.saveOverlayState(1, stale);

  assert.deepEqual(saved.state.topLikers.entries.map((e) => `${e.uniqueId}:${e.likes}`), ['a:70', 'b:60', 'c:50', 'd:40', 'e:30', 'f:20', 'g:10']);
});

test('el acumulado soporta muchisimos espectadores sin perder a ninguno', async () => {
  reset();
  for (let i = 0; i < 300; i += 1) await service.incrementTopLiker(1, viewer(`v${i}`), 1 + (i % 7));
  await service.incrementTopLiker(1, viewer('v299'), 1000);
  const [first] = db.configs.get(1).state.topLikers.entries;
  assert.equal(first.uniqueId, 'v299');
  assert.equal(db.totals.size, 300);
});
