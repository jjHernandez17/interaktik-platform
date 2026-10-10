'use strict';

// Ejecutar con: node --test backend/tests/robloxFightersService.test.js
// Usa una base de datos de mentira (en memoria) que entiende solo las consultas de este servicio.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function makeFakePool() {
  const db = {
    config: {
      user_id: 1, roblox_user_id: null, roblox_username: null,
      left_name: 'Rojo', right_name: 'Azul', left_color: '#e63946', right_color: '#3a86ff',
      left_style: 'karateka', right_style: 'ninja', left_keyword: 'rojo', right_keyword: 'azul',
      win_goal: 3, round_seconds: 90, max_health: 1000, ai_level: 2,
      left_wins: 0, right_wins: 0, champions_left: 0, champions_right: 0, last_round_id: null,
    },
    rules: [],
    viewers: new Map(),
    queue: [],
    nextId: 1,
    inserts: 0,
    failNextQueueInsert: 0,
    now: 1000,
  };

  async function query(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('SELECT * FROM roblox_fighters_config')) return { rowCount: 1, rows: [{ ...db.config }] };

    if (q.startsWith('SELECT gift_id, power, amount, duration_seconds, param, side FROM roblox_fighters_gift_rules')) {
      return { rowCount: db.rules.length, rows: db.rules };
    }

    if (q.startsWith('SELECT side FROM roblox_fighters_viewers')) {
      const side = db.viewers.get(params[1]);
      return { rowCount: side ? 1 : 0, rows: side ? [{ side: side.side }] : [] };
    }

    if (q.startsWith('INSERT INTO roblox_fighters_viewers')) {
      db.viewers.set(params[1], { nickname: params[2], side: params[3] });
      return { rowCount: 1, rows: [] };
    }

    if (q.startsWith('SELECT side, COUNT(*)')) {
      const totals = { left: 0, right: 0 };
      for (const viewer of db.viewers.values()) totals[viewer.side] += 1;
      return { rowCount: 2, rows: [{ side: 'left', total: totals.left }, { side: 'right', total: totals.right }] };
    }

    if (q.startsWith('INSERT INTO roblox_fighters_queue')) {
      if (db.failNextQueueInsert > 0) {
        db.failNextQueueInsert -= 1;
        throw new Error('la base fallo un instante');
      }
      db.queue.push({
        id: db.nextId++, user_id: params[0], kind: params[1], tiktok_unique_id: params[2], tiktok_nickname: params[3], side: params[4],
        power: params[5], amount: params[6], duration_seconds: params[7], param: params[8], status: 'pending', sent_at: null,
      });
      return { rowCount: 1, rows: [] };
    }

    if (q.startsWith("UPDATE roblox_fighters_queue SET status = 'sent'")) {
      const limit = params[1];
      const redeliverAfter = params[2] * 1000;
      const picked = db.queue
        .filter((row) => row.status === 'pending' || (row.status === 'sent' && db.now - row.sent_at > redeliverAfter))
        .slice(0, limit);
      picked.forEach((row) => { row.status = 'sent'; row.sent_at = db.now; });
      return { rowCount: picked.length, rows: picked.map((row) => ({ ...row })) };
    }

    if (q.startsWith("UPDATE roblox_fighters_queue SET status = 'done'")) {
      let count = 0;
      for (const row of db.queue) {
        if (params[1].includes(row.id) && row.status !== 'done') { row.status = 'done'; count += 1; }
      }
      return { rowCount: count, rows: [] };
    }

    if (q.startsWith('DELETE FROM roblox_fighters_queue')) return { rowCount: 0, rows: [] };
    if (q.startsWith('DELETE FROM roblox_fighters_viewers')) { db.viewers.clear(); return { rowCount: 0, rows: [] }; }

    if (q.startsWith('UPDATE roblox_fighters_config SET left_wins = left_wins')) {
      db.config.left_wins += params[1];
      db.config.right_wins += params[2];
      if (params[3]) db.config.last_round_id = params[3];
      return { rowCount: 1, rows: [{ ...db.config }] };
    }

    if (q.startsWith('UPDATE roblox_fighters_config SET left_wins = 0, right_wins = 0, champions_left')) {
      db.config.left_wins = 0;
      db.config.right_wins = 0;
      db.config.champions_left += params[1];
      db.config.champions_right += params[2];
      return { rowCount: 1, rows: [{ champions_left: db.config.champions_left, champions_right: db.config.champions_right }] };
    }

    throw new Error(`consulta no prevista en la prueba: ${q.slice(0, 90)}`);
  }

  return { query, db };
}

const fake = makeFakePool();
stubModule('database/pool.js', { query: fake.query });
stubModule('config/logger.js', { info() {}, warn() {}, error() {}, success() {} });
stubModule('middleware/auth.js', { isSuperUserEmail: () => false });

const service = require(path.join(root, 'services', 'robloxFightersService.js'));
const db = fake.db;

async function resetDb() {
  await service.resetGame(1); // tambien limpia la memoria de lados del servicio
  db.rules = [];
  db.viewers.clear();
  db.queue = [];
  db.nextId = 1;
  db.failNextQueueInsert = 0;
  db.config.left_wins = 0;
  db.config.right_wins = 0;
  db.config.champions_left = 0;
  db.config.champions_right = 0;
  db.config.last_round_id = null;
  db.now = 1000;
}

const rule = (over) => Object.assign({ gift_id: '5655', power: 'golpe', amount: 60, duration_seconds: 0, param: null, side: 'viewer' }, over);
const gift = (over) => Object.assign({ giftId: 5655, repeatCount: 1, user: { uniqueId: 'ana', nickname: 'Ana' } }, over);

test('elegir lado: nombre completo o primera letra, sin importar mayusculas ni tildes', () => {
  const names = { left: 'Rojo', right: 'Azul' };
  assert.equal(service.matchSide('rojo', names), 'left');
  assert.equal(service.matchSide('ROJO', names), 'left');
  assert.equal(service.matchSide('¡Rojo! 🔥', names), 'left');
  assert.equal(service.matchSide('r', names), 'left', 'la primera letra basta');
  assert.equal(service.matchSide('R', names), 'left');
  assert.equal(service.matchSide('azul', names), 'right');
  assert.equal(service.matchSide('A', names), 'right');
  assert.equal(service.matchSide('hola', names), null);
  assert.equal(service.matchSide('equipo rojo', names), null, 'tiene que ser el nombre y nada mas');
  assert.equal(service.matchSide('ro', names), null, 'una parte del nombre no cuenta');
  assert.equal(service.matchSide('', names), null);

  const accents = { left: 'Águilas Ñandú', right: 'Cóndor' };
  assert.equal(service.matchSide('aguilas nandu', accents), 'left', 'sin tildes');
  assert.equal(service.matchSide('ÁGUILAS ÑANDÚ', accents), 'left', 'con tildes y en mayusculas');
  assert.equal(service.matchSide('a', accents), 'left');
  assert.equal(service.matchSide('Condor', accents), 'right');
  assert.equal(service.matchSide('ć', accents), 'right', 'la letra tambien ignora tildes');

  // si los dos nombres empiezan igual, la letra no vale para ninguno
  const sameInitial = { left: 'Tigres', right: 'Toros' };
  assert.equal(service.matchSide('t', sameInitial), null);
  assert.equal(service.matchSide('tigres', sameInitial), 'left');
  assert.equal(service.matchSide('Toros', sameInitial), 'right');
});

test('ajustes: se validan y se limitan, y los nombres de los dos lados no pueden ser iguales', () => {
  const row = { ...db.config };
  const merged = service.mergeSettings(row, { winGoal: 500, roundSeconds: 5, maxHealth: 99999, aiLevel: 9, left: { color: 'rojo', style: 'inventado' } });
  assert.equal(merged.winGoal, 99);
  assert.equal(merged.roundSeconds, 20);
  assert.equal(merged.maxHealth, 5000);
  assert.equal(merged.aiLevel, 3);
  assert.equal(merged.leftColor, '#e63946', 'un color invalido se queda como estaba');
  assert.equal(merged.leftStyle, 'karateka', 'un estilo invalido se queda como estaba');
  assert.throws(() => service.mergeSettings(row, { left: { name: 'azul' } }), /nombres distintos/);
});

test('reglas: cada poder guarda solo lo que le importa y rechaza lo invalido', () => {
  assert.deepEqual(service.normalizeRulePower({ power: 'golpe', amount: 80, durationSeconds: 99, param: 'x' }), { power: 'golpe', amount: 80, durationSeconds: 0, param: null });
  assert.deepEqual(service.normalizeRulePower({ power: 'furia', amount: 80, durationSeconds: 12 }), { power: 'furia', amount: 0, durationSeconds: 12, param: null });
  assert.deepEqual(service.normalizeRulePower({ power: 'estilo', param: 'Ninja' }), { power: 'estilo', amount: 0, durationSeconds: 0, param: 'ninja' });
  assert.equal(service.normalizeRulePower({ power: 'meteoros', amount: 9999 }).amount, 60, 'tope de meteoros');
  assert.throws(() => service.normalizeRulePower({ power: 'volar' }), /Poder no valido/);
  assert.throws(() => service.normalizeRulePower({ power: 'estilo', param: 'sumo' }), /estilo/);
});

test('un regalo con regla y espectador sin lado: se le asigna lado, se anota su union y se encola el poder', async () => {
  await resetDb();
  db.rules = [rule()];
  await service.handleGift(1, gift());

  assert.equal(db.queue.length, 2);
  assert.equal(db.queue[0].kind, 'join');
  assert.equal(db.queue[1].kind, 'power');
  assert.equal(db.queue[1].power, 'golpe');
  assert.equal(db.queue[1].amount, 60);
  assert.equal(db.queue[1].side, db.queue[0].side);
  assert.ok(['left', 'right'].includes(db.queue[1].side));
  assert.equal(db.viewers.size, 1);
});

test('un combo multiplica la cantidad, con tope', async () => {
  await resetDb();
  db.rules = [rule({ amount: 100 })];
  await service.handleGift(1, gift({ repeatCount: 5 }));
  assert.equal(db.queue.find((r) => r.kind === 'power').amount, 500);

  await resetDb();
  db.rules = [rule({ amount: 4000 })];
  await service.handleGift(1, gift({ repeatCount: 10 }));
  assert.equal(db.queue.find((r) => r.kind === 'power').amount, 5000, 'tope de golpe');
});

test('los poderes de duracion suman segundos con tope', async () => {
  await resetDb();
  db.rules = [rule({ gift_id: '7', power: 'congelar', amount: 0, duration_seconds: 3 })];
  await service.handleGift(1, gift({ giftId: 7, repeatCount: 100 }));
  assert.equal(db.queue.find((r) => r.kind === 'power').duration, undefined);
  assert.equal(db.queue.find((r) => r.kind === 'power').duration_seconds, 20, 'congelar tiene tope de 20 s');
});

test('un espectador que ya eligio lado mantiene ese lado (aunque el otro tenga menos gente)', async () => {
  await resetDb();
  db.rules = [rule()];
  db.viewers.set('ana', { nickname: 'Ana', side: 'left' });
  db.viewers.set('luis', { nickname: 'Luis', side: 'left' });
  await service.handleGift(1, gift());

  assert.equal(db.queue.length, 1, 'no hay union nueva');
  assert.equal(db.queue[0].side, 'left');
});

test('la asignacion automatica equilibra los lados', async () => {
  await resetDb();
  db.rules = [rule()];
  for (let i = 0; i < 6; i += 1) db.viewers.set(`l${i}`, { nickname: `L${i}`, side: 'left' });
  db.viewers.set('r0', { nickname: 'R0', side: 'right' });
  await service.handleGift(1, gift({ user: { uniqueId: 'nuevo', nickname: 'Nuevo' } }));
  assert.equal(db.viewers.get('nuevo').side, 'right', 'va al lado con menos seguidores');
});

test('las reglas valen para los dos lados: el poder lo activa el lado que eligio el espectador', async () => {
  await resetDb();
  db.rules = [rule()];
  db.viewers.set('ana', { nickname: 'Ana', side: 'left' });
  db.viewers.set('luis', { nickname: 'Luis', side: 'right' });
  await service.handleGift(1, gift({ user: { uniqueId: 'ana', nickname: 'Ana' } }));
  await service.handleGift(1, gift({ user: { uniqueId: 'luis', nickname: 'Luis' } }));

  assert.deepEqual(db.queue.map((i) => i.side), ['left', 'right']);
});

test('una regla vieja con lado fijo se ignora: manda el lado del espectador', async () => {
  await resetDb();
  db.rules = [rule({ side: 'right' })];
  db.viewers.set('ana', { nickname: 'Ana', side: 'left' });
  await service.handleGift(1, gift());

  assert.equal(db.queue.length, 1);
  assert.equal(db.queue[0].side, 'left');
  assert.equal(db.viewers.get('ana').side, 'left');
});

test('un regalo sin regla no encola nada', async () => {
  await resetDb();
  db.rules = [rule({ gift_id: '1' })];
  await service.handleGift(1, gift({ giftId: 999 }));
  assert.equal(db.queue.length, 0);
});

test('si la base falla un instante, el regalo se reintenta y no se pierde', async () => {
  await resetDb();
  db.rules = [rule()];
  db.viewers.set('ana', { nickname: 'Ana', side: 'left' });
  db.failNextQueueInsert = 2;
  await service.handleGift(1, gift());
  assert.equal(db.queue.length, 1);
});

test('comentarios: elegir lado una vez, y repetir el mismo comentario no duplica', async () => {
  await resetDb();
  await service.handleChatComment(1, { comment: '¡ROJO!', user: { uniqueId: 'bea', nickname: 'Bea' } });
  await service.handleChatComment(1, { comment: 'rojo', user: { uniqueId: 'bea', nickname: 'Bea' } });
  assert.equal(db.queue.length, 1);
  assert.equal(db.queue[0].kind, 'join');
  assert.equal(db.queue[0].side, 'left');

  // cambiar de lado si comenta el otro nombre (o su primera letra)
  await service.handleChatComment(1, { comment: 'azul', user: { uniqueId: 'bea', nickname: 'Bea' } });
  assert.equal(db.viewers.get('bea').side, 'right');
  assert.equal(db.queue.length, 2);

  // un comentario cualquiera no hace nada
  await service.handleChatComment(1, { comment: 'que buena pelea', user: { uniqueId: 'bea', nickname: 'Bea' } });
  assert.equal(db.queue.length, 2);
});

test('la cola entrega en orden, vuelve a entregar lo no confirmado y no repite lo confirmado', async () => {
  await resetDb();
  db.rules = [rule()];
  db.viewers.set('a', { nickname: 'A', side: 'left' });
  db.viewers.set('b', { nickname: 'B', side: 'left' });
  await service.handleGift(1, gift({ user: { uniqueId: 'a' } }));
  await service.handleGift(1, gift({ user: { uniqueId: 'b' } }));

  const first = await service.pollQueue(1);
  assert.deepEqual(first.map((i) => i.id), [1, 2]);
  assert.equal(first[0].kind, 'power');
  assert.equal(first[0].side, 'left');

  // sin confirmar y antes de 20 s: no se repite
  db.now += 10000;
  assert.equal((await service.pollQueue(1)).length, 0);

  // el juego confirma solo el primero; el segundo se vuelve a entregar pasados 20 s
  assert.equal(await service.ackQueue(1, [1]), 1);
  db.now += 15000;
  const again = await service.pollQueue(1);
  assert.deepEqual(again.map((i) => i.id), [2]);

  assert.equal(await service.ackQueue(1, [2]), 1);
  db.now += 60000;
  assert.equal((await service.pollQueue(1)).length, 0);
});

test('marcador: suma victorias, no cuenta dos veces el mismo round y corona al campeon', async () => {
  await resetDb();
  let result = await service.reportRoundResult(1, { winner: 'left', roundId: 'r1' });
  assert.equal(result.leftWins, 1);
  assert.equal(result.champion, null);

  result = await service.reportRoundResult(1, { winner: 'left', roundId: 'r1' });
  assert.equal(result.leftWins, 1, 'el mismo round repetido no suma');
  assert.equal(result.duplicate, true);

  await service.reportRoundResult(1, { winner: 'right', roundId: 'r2' });
  await service.reportRoundResult(1, { winner: 'left', roundId: 'r3' });
  result = await service.reportRoundResult(1, { winner: 'left', roundId: 'r4' });
  assert.equal(result.champion, 'left');
  assert.equal(result.leftWins, 3, 'la respuesta trae el marcador final para celebrarlo');
  assert.equal(result.championsLeft, 1);
  assert.equal(db.config.left_wins, 0, 'el siguiente campeonato empieza de cero');

  result = await service.reportRoundResult(1, { winner: 'draw', roundId: 'r5' });
  assert.equal(result.champion, null);
  await assert.rejects(() => service.reportRoundResult(1, { winner: 'nadie' }), /Ganador/);
});
