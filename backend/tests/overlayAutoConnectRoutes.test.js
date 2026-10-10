'use strict';

// Ejecutar con: node --test backend/tests/overlayAutoConnectRoutes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const store = new Map(); // userId -> boolean
const saved = [];
stubModule('database/pool.js', { query: async () => ({ rows: [] }) });
stubModule('config/logger.js', { info() {}, success() {}, warn() {}, error() {} });
stubModule('services/liveHub.js', { emitLiveEvent() {} });
stubModule('services/accessService.js', { hasActiveAccess: async () => true });
stubModule('services/overlayService.js', {
  getAutoConnect: async (userId) => (store.has(userId) ? store.get(userId) : true),
  setAutoConnect: async (userId, enabled) => { saved.push({ userId, enabled }); store.set(userId, enabled); return enabled; },
});

const express = require('express');
const overlayRoutes = require(path.join(root, 'routes', 'overlayRoutes.js'));

function request(server, { method = 'GET', url, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(data); } catch (_e) { return null; } })() }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('interruptor de conexion automatica de overlays', async (t) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-test-user'];
    req.session = id ? { userId: Number(id), user: { id: Number(id), email: `u${id}@mail.test` } } : {};
    next();
  });
  app.use('/api', overlayRoutes);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => server.close());

  const json = { 'Content-Type': 'application/json', 'x-test-user': '5' };

  await t.test('sin sesion: 401', async () => {
    assert.equal((await request(server, { url: '/api/overlay/auto-connect' })).status, 401);
    assert.equal((await request(server, { method: 'PUT', url: '/api/overlay/auto-connect', headers: { 'Content-Type': 'application/json' }, body: '{"enabled":false}' })).status, 401);
  });

  await t.test('una cuenta nueva lo tiene encendido por defecto', async () => {
    const res = await request(server, { url: '/api/overlay/auto-connect', headers: { 'x-test-user': '5' } });
    assert.deepEqual(res.json, { enabled: true });
  });

  await t.test('se apaga y se enciende, y siempre se guarda para la cuenta de la sesion', async () => {
    const off = await request(server, { method: 'PUT', url: '/api/overlay/auto-connect', headers: json, body: JSON.stringify({ enabled: false, userId: 99 }) });
    assert.deepEqual(off.json, { enabled: false });
    assert.deepEqual(saved.at(-1), { userId: 5, enabled: false });
    assert.deepEqual((await request(server, { url: '/api/overlay/auto-connect', headers: { 'x-test-user': '5' } })).json, { enabled: false });
    assert.deepEqual((await request(server, { url: '/api/overlay/auto-connect', headers: { 'x-test-user': '6' } })).json, { enabled: true }, 'otra cuenta no se afecta');

    const on = await request(server, { method: 'PUT', url: '/api/overlay/auto-connect', headers: json, body: JSON.stringify({ enabled: true }) });
    assert.deepEqual(on.json, { enabled: true });
  });

  await t.test('solo acepta true o false de verdad', async () => {
    const before = saved.length;
    for (const body of ['{"enabled":"false"}', '{"enabled":0}', '{"enabled":null}', '{}', '{"enabled":"yes"}']) {
      const res = await request(server, { method: 'PUT', url: '/api/overlay/auto-connect', headers: json, body });
      assert.equal(res.status, 400, body);
    }
    assert.equal(saved.length, before, 'no se guardo nada');
  });
});
