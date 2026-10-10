'use strict';

// Ejecutar con: node --test backend/tests/referralRoutes.test.js
// Levanta las rutas reales de referidos en un servidor express de prueba (con un servicio de mentira detras) y
// comprueba las defensas HTTP: sesion obligatoria, CSRF, origen, limite de intentos y que el usuario salga SOLO de la sesion.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

stubModule('database/pool.js', { query: async () => ({ rows: [] }) });
stubModule('config/logger.js', { info() {}, success() {}, warn() {}, error() {} });

const calls = { redeem: [], revoke: [] };
let nextRedeemError = null;
stubModule('services/referralService.js', {
  getOverview: async (userId) => ({ code: 'IK-ABCD2345', userId }),
  redeem: async (userId, planId, requestId) => {
    calls.redeem.push({ userId, planId, requestId });
    if (nextRedeemError) { const error = nextRedeemError; nextRedeemError = null; throw error; }
    return { alreadyProcessed: false, planId };
  },
  revokeReward: async (id, note) => { calls.revoke.push({ id, note }); return { referralId: Number(id), coins: 3 }; },
  listForAdmin: async () => [],
  reconcilePendingRewards: async () => ({ checked: 0, granted: 0 }),
});

const express = require('express');
const referralRoutes = require(path.join(root, 'routes', 'referralRoutes.js'));

function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // igual que el servidor real: acepta formularios
  // sesion de mentira: el encabezado x-test-user la simula
  app.use((req, _res, next) => {
    const id = req.headers['x-test-user'];
    req.session = id ? { userId: Number(id), user: { id: Number(id), email: req.headers['x-test-email'] || `u${id}@mail.test` } } : {};
    next();
  });
  app.use('/api', referralRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(server, { method = 'GET', url, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_e) { /* no es json */ }
        resolve({ status: res.statusCode, json, text: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const json = (obj) => JSON.stringify(obj);
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const GOOD_ORIGIN = 'https://www.interaktik.com';

test('rutas de referidos', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  await t.test('sin sesion: ver referidos y canjear dan 401', async () => {
    assert.equal((await request(server, { url: '/api/referrals/me' })).status, 401);
    const redeem = await request(server, { method: 'POST', url: '/api/referrals/redeem', headers: JSON_HEADERS, body: json({ planId: 'monthly', requestId: 'abcdefgh12' }) });
    assert.equal(redeem.status, 401);
    assert.equal(calls.redeem.length, 0);
  });

  await t.test('el usuario sale SOLO de la sesion: un userId en el cuerpo se ignora', async () => {
    calls.redeem.length = 0;
    const res = await request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { ...JSON_HEADERS, 'x-test-user': '7', Origin: GOOD_ORIGIN },
      body: json({ planId: 'monthly', requestId: 'abcdefgh12', userId: 999, user_id: 999, cost: 0, coins: 99999 }),
    });
    assert.equal(res.status, 200);
    assert.equal(calls.redeem.length, 1);
    assert.deepEqual(calls.redeem[0], { userId: 7, planId: 'monthly', requestId: 'abcdefgh12' });

    const me = await request(server, { url: '/api/referrals/me?userId=999', headers: { 'x-test-user': '7' } });
    assert.equal(me.status, 200);
    assert.equal(me.json.userId, 7);
    assert.equal(me.headers['cache-control'], 'no-store');
  });

  await t.test('CSRF: un formulario normal (urlencoded) o text/plain se rechaza aunque lleve la sesion', async () => {
    calls.redeem.length = 0;
    const form = await request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { 'x-test-user': '7', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'planId=monthly&requestId=abcdefgh12',
    });
    assert.equal(form.status, 415);
    const plain = await request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { 'x-test-user': '7', 'Content-Type': 'text/plain' },
      body: json({ planId: 'monthly', requestId: 'abcdefgh12' }),
    });
    assert.equal(plain.status, 415);
    assert.equal(calls.redeem.length, 0);
  });

  await t.test('CSRF: un origen que no es nuestro se rechaza', async () => {
    calls.redeem.length = 0;
    const evil = await request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { ...JSON_HEADERS, 'x-test-user': '7', Origin: 'https://sitio-malicioso.example' },
      body: json({ planId: 'monthly', requestId: 'abcdefgh12' }),
    });
    assert.equal(evil.status, 403);

    const crossSite = await request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { ...JSON_HEADERS, 'x-test-user': '7', 'Sec-Fetch-Site': 'cross-site' },
      body: json({ planId: 'monthly', requestId: 'abcdefgh12' }),
    });
    assert.equal(crossSite.status, 403);
    assert.equal(calls.redeem.length, 0);
  });

  await t.test('los errores de negocio llegan claros; los errores internos no filtran detalles', async () => {
    const insufficient = new Error('Necesitas 150 monedas disponibles y tienes 3.');
    insufficient.status = 400;
    insufficient.code = 'INSUFFICIENT_COINS';
    nextRedeemError = insufficient;
    const business = await request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { ...JSON_HEADERS, 'x-test-user': '8', Origin: GOOD_ORIGIN },
      body: json({ planId: 'monthly', requestId: 'abcdefgh12' }),
    });
    assert.equal(business.status, 400);
    assert.equal(business.json.code, 'INSUFFICIENT_COINS');
    assert.match(business.json.error, /Necesitas 150/);

    nextRedeemError = new Error('connection to server at "10.0.0.5" failed: password authentication failed for user "postgres"');
    const internal = await request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { ...JSON_HEADERS, 'x-test-user': '8', Origin: GOOD_ORIGIN },
      body: json({ planId: 'monthly', requestId: 'abcdefgh12' }),
    });
    assert.equal(internal.status, 500);
    assert.equal(internal.text.includes('postgres'), false, 'no se filtra el error interno');
    assert.equal(internal.text.includes('10.0.0.5'), false);
  });

  await t.test('rutas de administrador: un usuario normal recibe 403; sin sesion 401', async () => {
    calls.revoke.length = 0;
    const anon = await request(server, { method: 'POST', url: '/api/admin/referrals/1/revoke', headers: JSON_HEADERS, body: json({}) });
    assert.equal(anon.status, 401);

    const normal = await request(server, { method: 'POST', url: '/api/admin/referrals/1/revoke', headers: { ...JSON_HEADERS, 'x-test-user': '7', Origin: GOOD_ORIGIN }, body: json({}) });
    assert.equal(normal.status, 403);
    assert.equal((await request(server, { url: '/api/admin/referrals', headers: { 'x-test-user': '7' } })).status, 403);
    assert.equal((await request(server, { method: 'POST', url: '/api/admin/referrals/reconcile', headers: { ...JSON_HEADERS, 'x-test-user': '7', Origin: GOOD_ORIGIN }, body: json({}) })).status, 403);
    assert.equal(calls.revoke.length, 0);

    const admin = await request(server, {
      method: 'POST', url: '/api/admin/referrals/5/revoke',
      headers: { ...JSON_HEADERS, 'x-test-user': '1', 'x-test-email': 'juanjohervar1708@gmail.com', Origin: GOOD_ORIGIN },
      body: json({ note: 'reembolso' }),
    });
    assert.equal(admin.status, 200);
    assert.deepEqual(calls.revoke, [{ id: '5', note: 'reembolso' }]);
  });

  await t.test('limite de canjes por cuenta: despues de 12 intentos responde 429, y otra cuenta no se ve afectada', async () => {
    const attempt = (user) => request(server, {
      method: 'POST', url: '/api/referrals/redeem',
      headers: { ...JSON_HEADERS, 'x-test-user': String(user), Origin: GOOD_ORIGIN },
      body: json({ planId: 'pass_2d', requestId: 'abcdefgh12' }),
    });

    const statuses = [];
    for (let i = 0; i < 14; i += 1) statuses.push((await attempt(42)).status);
    assert.equal(statuses.filter((status) => status === 429).length >= 2, true, `se esperaba al menos 2 respuestas 429, llegaron: ${statuses.join(',')}`);
    assert.equal(statuses[0], 200);

    assert.equal((await attempt(43)).status, 200, 'otra cuenta tiene su propio limite');
  });
});
