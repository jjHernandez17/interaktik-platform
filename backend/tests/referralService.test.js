'use strict';

// Ejecutar con: node --test backend/tests/referralService.test.js
//
// Usa una base de datos de mentira (en memoria) que entiende solo las consultas de referralService y authService.register.
// Emula lo que importa para la seguridad: transacciones con deshacer, el bloqueo de billetera (advisory lock, que
// serializa dos canjes en paralelo) y los indices unicos del libro de monedas.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

function uniqueViolation(constraint) {
  const error = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

function makeFakeDb() {
  const db = {
    now: Date.parse('2026-10-10T12:00:00Z'),
    users: new Map(), // id -> { id, name, email }
    nextUserId: 1,
    codes: new Map(), // userId -> code
    referrals: [], // { id, referrer_user_id, referred_user_id, code_used, status, rewarded_payment_id, rewarded_coins, rewarded_at, created_at }
    ledger: [], // { id, user_id, kind, coins, available_at(ms), referral_id, payment_id, plan_id, request_id, note, created_at }
    payments: [], // { id, user_id, plan_id, status, amount_cents, paid_at }
    plans: new Map([
      ['pass_2d', { id: 'pass_2d', name: 'Pase 2 dias', duration_days: 2, is_active: true }],
      ['monthly', { id: 'monthly', name: 'Mensual', duration_days: 30, is_active: true }],
      ['yearly', { id: 'yearly', name: 'Anual', duration_days: 365, is_active: true }],
    ]),
    access: new Map(), // userId -> { days }
    nextId: 1,
    locks: new Map(), // userId -> cola de espera
    failNext: null,
    emailsSent: 0,
  };

  const dayMs = 24 * 60 * 60 * 1000;
  const balanceOf = (userId) => {
    const rows = db.ledger.filter((row) => row.user_id === userId);
    const available = rows.filter((row) => row.available_at <= db.now).reduce((sum, row) => sum + row.coins, 0);
    const pendingRows = rows.filter((row) => row.available_at > db.now);
    const pending = pendingRows.reduce((sum, row) => sum + row.coins, 0);
    const next = pendingRows.filter((row) => row.coins > 0).map((row) => row.available_at).sort((a, b) => a - b)[0];
    return { available, pending, next_available_at: next ? new Date(next) : null };
  };

  function makeClient() {
    const undo = [];
    const heldLocks = [];
    let inTransaction = false;

    const releaseLocks = () => {
      while (heldLocks.length) heldLocks.pop()();
    };

    const client = {
      async query(sqlText, params = []) {
        if (db.failNext && norm(sqlText).includes(db.failNext)) {
          db.failNext = null;
          throw new Error('fallo simulado de la base');
        }
        const sql = norm(sqlText);
        // dar un turno al planificador para que las llamadas "en paralelo" de verdad se entrelacen
        await new Promise((resolve) => setImmediate(resolve));

        if (sql === 'BEGIN') { inTransaction = true; return { rows: [], rowCount: 0 }; }
        if (sql === 'COMMIT') { undo.length = 0; inTransaction = false; releaseLocks(); return { rows: [], rowCount: 0 }; }
        if (sql === 'ROLLBACK') {
          while (undo.length) undo.pop()();
          inTransaction = false;
          releaseLocks();
          return { rows: [], rowCount: 0 };
        }
        if (sql.startsWith('SAVEPOINT') || sql.startsWith('RELEASE SAVEPOINT')) return { rows: [], rowCount: 0 };
        if (sql.startsWith('ROLLBACK TO SAVEPOINT')) return { rows: [], rowCount: 0 };

        if (sql === 'SELECT pg_advisory_xact_lock($1, $2)') {
          const key = params[1];
          const previous = db.locks.get(key) || Promise.resolve();
          let release;
          const mine = new Promise((resolve) => { release = resolve; });
          db.locks.set(key, previous.then(() => mine));
          await previous;
          heldLocks.push(release);
          return { rows: [], rowCount: 1 };
        }

        // ----- codigos -----
        if (sql === 'SELECT code FROM referral_codes WHERE user_id = $1') {
          const code = db.codes.get(params[0]);
          return { rows: code ? [{ code }] : [], rowCount: code ? 1 : 0 };
        }
        if (sql.startsWith('INSERT INTO referral_codes')) {
          const [userId, code] = params;
          const codeTaken = [...db.codes.values()].includes(code);
          if (db.codes.has(userId) || codeTaken) return { rows: [], rowCount: 0 };
          db.codes.set(userId, code);
          return { rows: [{ code }], rowCount: 1 };
        }
        if (sql === 'SELECT user_id FROM referral_codes WHERE code = $1') {
          const found = [...db.codes.entries()].find(([, code]) => code === params[0]);
          return { rows: found ? [{ user_id: found[0] }] : [], rowCount: found ? 1 : 0 };
        }

        // ----- registro -----
        if (sql === 'SELECT id FROM app_users WHERE email = $1') {
          const found = [...db.users.values()].find((user) => user.email === params[0]);
          return { rows: found ? [{ id: found.id }] : [], rowCount: found ? 1 : 0 };
        }
        if (sql.startsWith('INSERT INTO app_users')) {
          const [name, email] = params;
          if ([...db.users.values()].some((user) => user.email === email)) throw uniqueViolation('app_users_email_key');
          const user = { id: db.nextUserId++, name, email };
          db.users.set(user.id, user);
          undo.push(() => db.users.delete(user.id));
          return { rows: [{ id: user.id, name, email }], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO referrals (referrer_user_id, referred_user_id, code_used)')) {
          const [referrer, referred, code] = params;
          if (db.referrals.some((row) => row.referred_user_id === referred)) throw uniqueViolation('referrals_referred_user_id_key');
          if (referrer === referred) throw new Error('referrals_no_self');
          const row = { id: db.nextId++, referrer_user_id: referrer, referred_user_id: referred, code_used: code, status: 'pending', rewarded_payment_id: null, rewarded_coins: null, rewarded_at: null, created_at: new Date(db.now) };
          db.referrals.push(row);
          undo.push(() => db.referrals.splice(db.referrals.indexOf(row), 1));
          return { rows: [], rowCount: 1 };
        }

        // ----- recompensas -----
        if (sql.startsWith("SELECT id, referrer_user_id FROM referrals WHERE referred_user_id = $1 AND status = 'pending' FOR UPDATE")) {
          const rows = db.referrals.filter((row) => row.referred_user_id === params[0] && row.status === 'pending').map((row) => ({ id: row.id, referrer_user_id: row.referrer_user_id }));
          return { rows, rowCount: rows.length };
        }
        if (sql.startsWith("UPDATE referrals SET status = 'rewarded'")) {
          const [id, paymentId, coins] = params;
          const row = db.referrals.find((entry) => entry.id === id && entry.status === 'pending');
          if (!row) return { rows: [], rowCount: 0 };
          const before = { ...row };
          Object.assign(row, { status: 'rewarded', rewarded_payment_id: paymentId, rewarded_coins: coins, rewarded_at: new Date(db.now) });
          undo.push(() => Object.assign(row, before));
          return { rows: [{ id }], rowCount: 1 };
        }
        if (sql.startsWith("INSERT INTO referral_ledger (user_id, kind, coins, available_at, referral_id, payment_id, plan_id) VALUES ($1, 'earn'")) {
          const [userId, coins, holdDays, referralId, paymentId, planId] = params;
          if (db.ledger.some((row) => row.kind === 'earn' && row.referral_id === referralId)) throw uniqueViolation('uq_referral_ledger_earn');
          const row = { id: db.nextId++, user_id: userId, kind: 'earn', coins, available_at: db.now + holdDays * dayMs, referral_id: referralId, payment_id: paymentId, plan_id: planId, request_id: null, note: null, created_at: new Date(db.now) };
          db.ledger.push(row);
          undo.push(() => db.ledger.splice(db.ledger.indexOf(row), 1));
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM referrals r JOIN LATERAL')) {
          const [referrerUserId] = params;
          const rows = [];
          for (const referral of db.referrals) {
            if (referral.status !== 'pending') continue;
            if (referrerUserId !== null && referral.referrer_user_id !== referrerUserId) continue;
            const first = db.payments.filter((pay) => pay.user_id === referral.referred_user_id && pay.status === 'paid').sort((a, b) => a.paid_at - b.paid_at || a.id - b.id)[0];
            if (first) rows.push({ id: first.id, user_id: first.user_id, plan_id: first.plan_id, amount_cents: first.amount_cents });
          }
          return { rows, rowCount: rows.length };
        }

        // ----- revertir -----
        if (sql.startsWith('SELECT id, referrer_user_id, status FROM referrals WHERE id = $1 FOR UPDATE')) {
          const row = db.referrals.find((entry) => entry.id === params[0]);
          return { rows: row ? [{ id: row.id, referrer_user_id: row.referrer_user_id, status: row.status }] : [], rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith("SELECT coins, available_at, payment_id, plan_id FROM referral_ledger WHERE referral_id = $1 AND kind = 'earn'")) {
          const row = db.ledger.find((entry) => entry.referral_id === params[0] && entry.kind === 'earn');
          return { rows: row ? [{ coins: row.coins, available_at: new Date(row.available_at), payment_id: row.payment_id, plan_id: row.plan_id }] : [], rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith("INSERT INTO referral_ledger (user_id, kind, coins, available_at, referral_id, payment_id, plan_id, note) VALUES ($1, 'revoke'")) {
          const [userId, coins, availableAt, referralId, paymentId, planId, note] = params;
          if (db.ledger.some((row) => row.kind === 'revoke' && row.referral_id === referralId)) throw uniqueViolation('uq_referral_ledger_revoke');
          const row = { id: db.nextId++, user_id: userId, kind: 'revoke', coins, available_at: Math.max(new Date(availableAt).getTime(), db.now), referral_id: referralId, payment_id: paymentId, plan_id: planId, request_id: null, note, created_at: new Date(db.now) };
          db.ledger.push(row);
          undo.push(() => db.ledger.splice(db.ledger.indexOf(row), 1));
          return { rows: [], rowCount: 1 };
        }
        if (sql === "UPDATE referrals SET status = 'revoked' WHERE id = $1") {
          const row = db.referrals.find((entry) => entry.id === params[0]);
          const before = row.status;
          row.status = 'revoked';
          undo.push(() => { row.status = before; });
          return { rows: [], rowCount: 1 };
        }

        // ----- canje -----
        if (sql.startsWith("SELECT plan_id FROM referral_ledger WHERE user_id = $1 AND kind = 'redeem' AND request_id = $2")) {
          const row = db.ledger.find((entry) => entry.user_id === params[0] && entry.kind === 'redeem' && entry.request_id === params[1]);
          return { rows: row ? [{ plan_id: row.plan_id }] : [], rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith('SELECT id, name, duration_days FROM plans WHERE id = $1 AND is_active = true')) {
          const plan = db.plans.get(params[0]);
          return { rows: plan && plan.is_active ? [plan] : [], rowCount: plan && plan.is_active ? 1 : 0 };
        }
        if (sql.startsWith('SELECT COALESCE(SUM(coins) FILTER (WHERE available_at <= NOW())')) {
          const balance = balanceOf(params[0]);
          return { rows: [balance], rowCount: 1 };
        }
        if (sql.startsWith("INSERT INTO referral_ledger (user_id, kind, coins, available_at, plan_id, request_id) VALUES ($1, 'redeem'")) {
          const [userId, coins, planId, requestId] = params;
          if (db.ledger.some((row) => row.kind === 'redeem' && row.user_id === userId && row.request_id === requestId)) throw uniqueViolation('uq_referral_ledger_redeem_request');
          const row = { id: db.nextId++, user_id: userId, kind: 'redeem', coins, available_at: db.now, referral_id: null, payment_id: null, plan_id: planId, request_id: requestId, note: null, created_at: new Date(db.now) };
          db.ledger.push(row);
          undo.push(() => db.ledger.splice(db.ledger.indexOf(row), 1));
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO user_access')) {
          const [userId, days] = params;
          const before = db.access.get(userId);
          db.access.set(userId, { days: (before ? before.days : 0) + Number(days) });
          undo.push(() => { if (before) db.access.set(userId, before); else db.access.delete(userId); });
          return { rows: [{ access_expires_at: new Date(db.now + Number(days) * dayMs) }], rowCount: 1 };
        }

        // ----- resumen -----
        if (sql.includes('FROM referrals r JOIN app_users u ON u.id = r.referred_user_id')) {
          const rows = db.referrals.filter((row) => row.referrer_user_id === params[0]).map((row) => ({ status: row.status, rewarded_coins: row.rewarded_coins, rewarded_at: row.rewarded_at, created_at: row.created_at, name: db.users.get(row.referred_user_id)?.name }));
          return { rows, rowCount: rows.length };
        }
        if (sql.startsWith('SELECT kind, coins, plan_id, available_at, created_at FROM referral_ledger WHERE user_id = $1')) {
          const rows = db.ledger.filter((row) => row.user_id === params[0]).map((row) => ({ kind: row.kind, coins: row.coins, plan_id: row.plan_id, available_at: new Date(row.available_at), created_at: row.created_at }));
          return { rows, rowCount: rows.length };
        }

        throw new Error(`consulta no soportada por la base de mentira: ${sql}`);
      },
      release() {
        if (inTransaction) {
          while (undo.length) undo.pop()();
          releaseLocks();
        }
      },
    };
    return client;
  }

  const pool = {
    async connect() { return makeClient(); },
    async query(sql, params) { const client = makeClient(); try { return await client.query(sql, params); } finally { client.release(); } },
  };

  return { db, pool, makeClient };
}

const fake = makeFakeDb();
const db = fake.db;
stubModule('database/pool.js', fake.pool);
stubModule('config/logger.js', { info() {}, success() {}, warn() {}, error() {} });
stubModule('services/accessService.js', {
  grantTrial: async () => {},
  extendAccess: async (userId, days, runner) => {
    const result = await (runner || fake.pool).query('INSERT INTO user_access (user_id, access_expires_at) VALUES ($1, $2)', [userId, days]);
    return result.rows[0].access_expires_at;
  },
});
stubModule('services/verificationService.js', { createVerificationToken: async () => 'token-de-prueba' });
stubModule('services/passwordResetService.js', {});
stubModule('services/emailService.js', { sendVerificationEmail: async () => { db.emailsSent += 1; } });
stubModule('middleware/auth.js', { attachAuthFlags: (user) => user });

const referralService = require(path.join(root, 'services', 'referralService.js'));
const authService = require(path.join(root, 'services', 'authService.js'));

function reset() {
  db.users.clear();
  db.nextUserId = 1;
  db.codes.clear();
  db.referrals.length = 0;
  db.ledger.length = 0;
  db.payments.length = 0;
  db.access.clear();
  db.locks.clear();
  db.nextId = 1;
  db.failNext = null;
  db.emailsSent = 0;
  db.now = Date.parse('2026-10-10T12:00:00Z');
  for (const plan of db.plans.values()) plan.is_active = true;
}

function addUser(name) {
  const user = { id: db.nextUserId++, name, email: `${name.toLowerCase()}@mail.test` };
  db.users.set(user.id, user);
  return user;
}

// Un invitador (con codigo) y un invitado enlazado a el
async function setupPair() {
  const referrer = addUser('Ana');
  const referred = addUser('Beto');
  const code = await referralService.ensureCode(referrer.id);
  await referralService.linkReferral(fake.pool, { referrerUserId: referrer.id, referredUserId: referred.id, code });
  return { referrer, referred, code };
}

let paymentSeq = 100;
function addPaidPayment(userId, planId, overrides = {}) {
  const payment = { id: paymentSeq++, user_id: userId, plan_id: planId, status: 'paid', amount_cents: 1000, paid_at: db.now, ...overrides };
  db.payments.push(payment);
  return payment;
}

async function reward(payment) {
  const client = await fake.pool.connect();
  try {
    await client.query('BEGIN');
    const outcome = await referralService.grantRewardForPayment(client, payment);
    await client.query('COMMIT');
    return outcome;
  } finally {
    client.release();
  }
}

const HOLD_MS = referralService.HOLD_DAYS * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- codigos

test('el codigo tiene el formato IK-XXXXXXXX, sin letras confusas, y es unico por cuenta', async () => {
  reset();
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    const code = referralService.generateCode();
    assert.match(code, referralService.CODE_REGEX);
    assert.ok(!/[IO01]/.test(code.slice(3)), 'no usa I, O, 0 ni 1');
    seen.add(code);
  }
  assert.equal(seen.size, 300, 'no se repiten');

  const user = addUser('Ana');
  const first = await referralService.ensureCode(user.id);
  const again = await referralService.ensureCode(user.id);
  assert.equal(first, again, 'la misma cuenta siempre tiene el mismo codigo');
});

test('dos llamadas a la vez para crear el codigo de la misma cuenta terminan con un solo codigo', async () => {
  reset();
  const user = addUser('Ana');
  const codes = await Promise.all([1, 2, 3, 4, 5].map(() => referralService.ensureCode(user.id)));
  assert.equal(new Set(codes).size, 1);
});

test('normalizeCode acepta minusculas, espacios y sin prefijo; rechaza lo que no es un codigo', () => {
  assert.equal(referralService.normalizeCode('ik-abcd2345'), 'IK-ABCD2345');
  assert.equal(referralService.normalizeCode('  IK ABCD 2345 '), 'IK-ABCD2345');
  assert.equal(referralService.normalizeCode('abcd2345'), 'IK-ABCD2345');
  assert.equal(referralService.normalizeCode('IK-ABCD234'), null, 'muy corto');
  assert.equal(referralService.normalizeCode('IK-ABCD23456'), null, 'muy largo');
  assert.equal(referralService.normalizeCode('IK-ABCD234I'), null, 'letra prohibida');
  assert.equal(referralService.normalizeCode('IK-ABCD2340'), null, 'cero prohibido');
  assert.equal(referralService.normalizeCode("' OR 1=1 --"), null);
  assert.equal(referralService.normalizeCode(''), null);
  assert.equal(referralService.normalizeCode(null), null);
  assert.equal(referralService.normalizeCode({ toString() { return 'IK-ABCD2345'; } }), 'IK-ABCD2345');
  assert.equal(referralService.normalizeCode('A'.repeat(5000)), null, 'una cadena enorme no rompe nada');
});

// ---------------------------------------------------------------- registro

test('registro con un codigo valido crea la cuenta y el enlace; el invitado queda ligado a quien lo invito', async () => {
  reset();
  const inviter = addUser('Ana');
  const code = await referralService.ensureCode(inviter.id);

  const user = await authService.register('Beto', 'beto@mail.test', 'Abcd1234!', 'http://x', true, code.toLowerCase());
  assert.ok(user.id);
  assert.equal(db.referrals.length, 1);
  assert.equal(db.referrals[0].referrer_user_id, inviter.id);
  assert.equal(db.referrals[0].referred_user_id, user.id);
  assert.equal(db.referrals[0].status, 'pending');
  assert.equal(db.emailsSent, 1);
});

test('registro con un codigo inventado o mal escrito se rechaza y NO crea la cuenta', async () => {
  reset();
  await assert.rejects(() => authService.register('Beto', 'beto@mail.test', 'Abcd1234!', 'http://x', true, 'IK-ZZZZZZZZ'), /codigo de referido no es valido/);
  await assert.rejects(() => authService.register('Beto', 'beto@mail.test', 'Abcd1234!', 'http://x', true, 'hola'), /codigo de referido no es valido/);
  assert.equal(db.users.size, 0);
  assert.equal(db.referrals.length, 0);
});

test('registro sin codigo funciona como siempre (el codigo es opcional)', async () => {
  reset();
  const user = await authService.register('Beto', 'beto@mail.test', 'Abcd1234!', 'http://x', true);
  assert.ok(user.id);
  assert.equal(db.referrals.length, 0);
  const user2 = await authService.register('Cami', 'cami@mail.test', 'Abcd1234!', 'http://x', true, '   ');
  assert.ok(user2.id);
  assert.equal(db.referrals.length, 0);
});

test('si falla el enlace del referido, la cuenta tampoco queda creada (todo o nada)', async () => {
  reset();
  const inviter = addUser('Ana');
  const code = await referralService.ensureCode(inviter.id);
  db.failNext = 'INSERT INTO referrals';
  await assert.rejects(() => authService.register('Beto', 'beto@mail.test', 'Abcd1234!', 'http://x', true, code));
  assert.equal(db.users.size, 1, 'solo existe la cuenta de Ana');
  assert.ok(![...db.users.values()].some((user) => user.email === 'beto@mail.test'));
});

test('nadie puede usar su propio codigo ni enlazarse dos veces', async () => {
  reset();
  const { referrer, referred, code } = await setupPair();
  await assert.rejects(() => referralService.linkReferral(fake.pool, { referrerUserId: referrer.id, referredUserId: referrer.id, code }), /propio codigo/);
  await assert.rejects(() => referralService.linkReferral(fake.pool, { referrerUserId: referrer.id, referredUserId: referred.id, code }), /referrals_referred_user_id_key/);
  assert.equal(db.referrals.length, 1);
});

// ---------------------------------------------------------------- recompensas

test('monedas por plan: 2 dias = 1, mensual = 3, anual = 10', async () => {
  for (const [plan, expected] of [['pass_2d', 1], ['monthly', 3], ['yearly', 10]]) {
    reset();
    const { referrer, referred } = await setupPair();
    const payment = addPaidPayment(referred.id, plan);
    const outcome = await reward(payment);
    assert.equal(outcome.granted, true);
    assert.equal(outcome.coins, expected);
    const balance = (await referralService.getOverview(referrer.id)).balance;
    assert.equal(balance.pending, expected, 'queda en espera');
    assert.equal(balance.available, 0);
  }
});

test('las monedas esperan los dias de retencion y luego quedan disponibles', async () => {
  reset();
  const { referrer, referred } = await setupPair();
  await reward(addPaidPayment(referred.id, 'monthly'));

  let balance = (await referralService.getOverview(referrer.id)).balance;
  assert.deepEqual([balance.available, balance.pending], [0, 3]);
  assert.ok(balance.nextAvailableAt);

  db.now += HOLD_MS - 1000;
  balance = (await referralService.getOverview(referrer.id)).balance;
  assert.deepEqual([balance.available, balance.pending], [0, 3], 'un segundo antes todavia no');

  db.now += 2000;
  balance = (await referralService.getOverview(referrer.id)).balance;
  assert.deepEqual([balance.available, balance.pending], [3, 0]);
  assert.equal(balance.nextAvailableAt, null);
});

test('un invitado da recompensa UNA sola vez: su segunda compra no suma nada', async () => {
  reset();
  const { referrer, referred } = await setupPair();
  const first = await reward(addPaidPayment(referred.id, 'pass_2d'));
  const second = await reward(addPaidPayment(referred.id, 'yearly'));
  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.equal(db.ledger.filter((row) => row.kind === 'earn').length, 1);
  assert.equal((await referralService.getOverview(referrer.id)).balance.pending, 1);
});

test('el mismo pago procesado dos veces (webhook repetido) no duplica la recompensa', async () => {
  reset();
  const { referred } = await setupPair();
  const payment = addPaidPayment(referred.id, 'monthly');
  const results = await Promise.all([reward(payment), reward(payment), reward(payment)]);
  assert.equal(results.filter((outcome) => outcome.granted).length, 1);
  assert.equal(db.ledger.filter((row) => row.kind === 'earn').length, 1);
});

test('sin referido, o con un plan que no da monedas, o con pago de monto cero, no se da nada', async () => {
  reset();
  const lonely = addUser('Solo');
  assert.equal((await reward(addPaidPayment(lonely.id, 'monthly'))).granted, false);

  const { referred } = await setupPair();
  assert.equal((await reward(addPaidPayment(referred.id, 'plan_inventado'))).granted, false);
  assert.equal((await reward(addPaidPayment(referred.id, 'monthly', { amount_cents: 0 }))).granted, false);
  assert.equal(db.ledger.length, 0);
  assert.equal(db.referrals[0].status, 'pending', 'sigue pendiente: su primera compra real todavia puede dar recompensa');
});

test('si la recompensa falla a mitad, no queda a medias: el referido sigue pendiente y se corrige solo', async () => {
  reset();
  const { referrer, referred } = await setupPair();
  const payment = addPaidPayment(referred.id, 'monthly');

  db.failNext = "INSERT INTO referral_ledger (user_id, kind, coins, available_at, referral_id, payment_id, plan_id) VALUES ($1, 'earn'";
  const client = await fake.pool.connect();
  await client.query('BEGIN');
  await assert.rejects(() => referralService.grantRewardForPayment(client, payment));
  await client.query('ROLLBACK');
  client.release();

  assert.equal(db.referrals[0].status, 'pending', 'el estado se deshizo junto con el fallo');
  assert.equal(db.ledger.length, 0);

  // al abrir su panel, el sistema detecta el pago pagado y da la recompensa que faltaba
  const overview = await referralService.getOverview(referrer.id);
  assert.equal(overview.balance.pending, 3);
  assert.equal(db.referrals[0].status, 'rewarded');
});

test('revisar recompensas pendientes es seguro repetirlo y no da dos veces', async () => {
  reset();
  const { referred } = await setupPair();
  addPaidPayment(referred.id, 'yearly');
  const first = await referralService.reconcilePendingRewards();
  const second = await referralService.reconcilePendingRewards();
  assert.equal(first.granted, 1);
  assert.equal(second.granted, 0);
  assert.equal(db.ledger.filter((row) => row.kind === 'earn').length, 1);
});

test('el resumen no filtra datos del invitado: solo la inicial del nombre', async () => {
  reset();
  const { referrer } = await setupPair();
  const overview = await referralService.getOverview(referrer.id);
  assert.equal(overview.referrals[0].name, 'B***');
  assert.equal(JSON.stringify(overview).includes('beto@mail.test'), false);
  assert.equal(JSON.stringify(overview).includes('Beto'), false);
});

// ---------------------------------------------------------------- canje

async function fundWallet(userId, coins) {
  db.ledger.push({ id: db.nextId++, user_id: userId, kind: 'earn', coins, available_at: db.now - 1000, referral_id: null, payment_id: null, plan_id: null, request_id: null, note: null, created_at: new Date(db.now) });
}

test('canje: 40 monedas = 2 dias, 150 = mensual, 400 = anual (y el acceso se extiende)', async () => {
  for (const [plan, cost, days] of [['pass_2d', 40, 2], ['monthly', 150, 30], ['yearly', 400, 365]]) {
    reset();
    const user = addUser('Ana');
    await fundWallet(user.id, cost);
    const result = await referralService.redeem(user.id, plan, 'req-' + plan + '-12345');
    assert.equal(result.cost, cost);
    assert.equal(result.balance.available, 0);
    assert.equal(db.access.get(user.id).days, days);
  }
});

test('canje: sin saldo suficiente se rechaza y no pasa nada', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 149);
  await assert.rejects(() => referralService.redeem(user.id, 'monthly', 'req-12345678'), (error) => error.status === 400 && error.code === 'INSUFFICIENT_COINS');
  assert.equal(db.access.size, 0, 'no se extendio el acceso');
  assert.equal(db.ledger.length, 1, 'no se descontaron monedas');
});

test('canje: las monedas pendientes (en espera) NO se pueden gastar', async () => {
  reset();
  const { referrer, referred } = await setupPair();
  for (let i = 0; i < 20; i += 1) { /* 20 invitados reales darian 60 monedas, todas pendientes */ }
  await reward(addPaidPayment(referred.id, 'yearly')); // 10 pendientes
  db.ledger.push({ id: db.nextId++, user_id: referrer.id, kind: 'earn', coins: 35, available_at: db.now + HOLD_MS, referral_id: null, payment_id: null, plan_id: null, request_id: null, note: null, created_at: new Date(db.now) });
  await assert.rejects(() => referralService.redeem(referrer.id, 'pass_2d', 'req-pending-1'), /Necesitas 40/);
});

test('canje: el costo y el plan los decide el servidor (planes inventados o no canjeables se rechazan)', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 1000);
  for (const planId of ['plan_inventado', '', null, undefined, 'MONTHLY', 'monthly; DROP TABLE plans', '__proto__', 'constructor', { toString: () => 'monthly' }]) {
    await assert.rejects(() => referralService.redeem(user.id, planId, 'req-12345678'), (error) => error.status === 400, `plan ${String(planId)}`);
  }
  assert.equal(db.access.size, 0);
  assert.equal(db.ledger.length, 1);
});

test('canje: el request_id es obligatorio y con forma valida', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 1000);
  for (const requestId of [undefined, null, '', 'corto', 'x'.repeat(65), 'tiene espacios aqui', "'; DROP TABLE--"]) {
    await assert.rejects(() => referralService.redeem(user.id, 'pass_2d', requestId), (error) => error.status === 400);
  }
  assert.equal(db.access.size, 0);
});

test('canje: el mismo clic reenviado (mismo request_id) no cobra dos veces', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 400);
  const first = await referralService.redeem(user.id, 'pass_2d', 'mismo-clic-0001');
  const second = await referralService.redeem(user.id, 'pass_2d', 'mismo-clic-0001');
  assert.equal(first.alreadyProcessed, false);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(db.ledger.filter((row) => row.kind === 'redeem').length, 1);
  assert.equal(db.access.get(user.id).days, 2);
  assert.equal(second.balance.available, 360);
});

test('DOBLE GASTO: 10 canjes a la vez con saldo para uno solo -> solo uno pasa', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 150); // alcanza para UN mensual
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => referralService.redeem(user.id, 'monthly', `carrera-${i}-abcdef`)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'solo uno se concreta');
  assert.equal(results.filter((r) => r.status === 'rejected').length, 9);
  assert.equal(db.ledger.filter((row) => row.kind === 'redeem').length, 1);
  assert.equal(db.access.get(user.id).days, 30, 'recibio UN mes, no diez');
  const balance = await referralService.getOverview(user.id);
  assert.equal(balance.balance.available, 0);
});

test('DOBLE GASTO con saldo para tres: 8 canjes a la vez -> exactamente tres pasan', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 120); // 3 pases de 2 dias
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => referralService.redeem(user.id, 'pass_2d', `paralelo-${i}-abcdef`)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal(db.access.get(user.id).days, 6);
  assert.equal((await referralService.getOverview(user.id)).balance.available, 0);
});

test('canje: si falla a mitad (por ejemplo al extender el acceso) se deshace todo y las monedas no se pierden', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 150);
  db.failNext = 'INSERT INTO user_access';
  await assert.rejects(() => referralService.redeem(user.id, 'monthly', 'fallo-extender-1'));
  assert.equal(db.ledger.filter((row) => row.kind === 'redeem').length, 0, 'el descuento se deshizo');
  assert.equal(db.access.size, 0);

  // y el usuario puede reintentar
  const retry = await referralService.redeem(user.id, 'monthly', 'fallo-extender-2');
  assert.equal(retry.alreadyProcessed, false);
  assert.equal(db.access.get(user.id).days, 30);
});

test('canje: un plan desactivado no se puede canjear', async () => {
  reset();
  const user = addUser('Ana');
  await fundWallet(user.id, 400);
  db.plans.get('yearly').is_active = false;
  await assert.rejects(() => referralService.redeem(user.id, 'yearly', 'plan-apagado-1'), (error) => error.status === 404);
  assert.equal(db.ledger.length, 1);
});

test('canjear un plan NO genera monedas para nadie (no hay bucle de recompensas)', async () => {
  reset();
  const { referrer, referred } = await setupPair();
  await fundWallet(referred.id, 150);
  await referralService.redeem(referred.id, 'monthly', 'sin-bucle-0001');
  assert.equal(db.ledger.filter((row) => row.user_id === referrer.id).length, 0);
  assert.equal(db.referrals[0].status, 'pending');
});

// ---------------------------------------------------------------- revertir

test('revertir una recompensa en espera la cancela sin tocar el saldo disponible', async () => {
  reset();
  const { referrer, referred } = await setupPair();
  await reward(addPaidPayment(referred.id, 'monthly'));
  await referralService.revokeReward(db.referrals[0].id, 'reembolso');

  const balance = (await referralService.getOverview(referrer.id)).balance;
  assert.deepEqual([balance.available, balance.pending], [0, 0]);
  assert.equal(db.referrals[0].status, 'revoked');
  db.now += HOLD_MS * 2;
  assert.equal((await referralService.getOverview(referrer.id)).balance.available, 0, 'ni despues de la espera aparece');
});

test('revertir una recompensa ya disponible descuenta el saldo, incluso por debajo de cero si ya la gasto', async () => {
  reset();
  const { referrer, referred } = await setupPair();
  await reward(addPaidPayment(referred.id, 'yearly')); // 10
  db.now += HOLD_MS + 1000;
  assert.equal((await referralService.getOverview(referrer.id)).balance.available, 10);

  await fundWallet(referrer.id, 30); // ya gasto/tiene mas: 40 en total
  await referralService.revokeReward(db.referrals[0].id, 'contracargo');
  assert.equal((await referralService.getOverview(referrer.id)).balance.available, 30);

  // gasto todo y luego se revierte: queda en negativo y no puede canjear hasta recuperarse
  await fundWallet(referrer.id, 0 + 1);
  db.ledger = db.ledger.filter((row) => row.kind !== 'earn' || row.referral_id !== null);
  db.ledger.push({ id: db.nextId++, user_id: referrer.id, kind: 'redeem', coins: -31, available_at: db.now, referral_id: null, payment_id: null, plan_id: 'pass_2d', request_id: 'x-gasto-0001', note: null, created_at: new Date(db.now) });
  const balance = (await referralService.getOverview(referrer.id)).balance;
  assert.ok(balance.available <= 0);
  await assert.rejects(() => referralService.redeem(referrer.id, 'pass_2d', 'negativo-0001'), /Necesitas 40/);
});

test('una recompensa se revierte una sola vez; sin recompensa no hay nada que revertir', async () => {
  reset();
  const { referred } = await setupPair();
  await assert.rejects(() => referralService.revokeReward(db.referrals[0].id), (error) => error.status === 409);
  await reward(addPaidPayment(referred.id, 'monthly'));
  await referralService.revokeReward(db.referrals[0].id);
  await assert.rejects(() => referralService.revokeReward(db.referrals[0].id), /ya fue revertida/);
  await assert.rejects(() => referralService.revokeReward(99999), (error) => error.status === 404);
  await assert.rejects(() => referralService.revokeReward('abc'), (error) => error.status === 400);
  assert.equal(db.ledger.filter((row) => row.kind === 'revoke').length, 1);
});

test('despues de revertir, el invitado no vuelve a dar recompensa por otra compra', async () => {
  reset();
  const { referred } = await setupPair();
  await reward(addPaidPayment(referred.id, 'monthly'));
  await referralService.revokeReward(db.referrals[0].id);
  const again = await reward(addPaidPayment(referred.id, 'yearly'));
  assert.equal(again.granted, false);
  assert.equal(db.ledger.filter((row) => row.kind === 'earn').length, 1);
});
