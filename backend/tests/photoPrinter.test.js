'use strict';

// Ejecutar con: node --test backend/tests/photoPrinter.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(root, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// base de datos de mentira: una fila por usuario
const rows = new Map();
stubModule('database/pool.js', {
  async query(sql, params) {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT state, updated_at FROM photoprinter_state')) {
      const row = rows.get(params[0]);
      return row ? { rowCount: 1, rows: [row] } : { rowCount: 0, rows: [] };
    }
    if (text.startsWith('INSERT INTO photoprinter_state')) {
      const row = { state: JSON.parse(params[1]), updated_at: new Date('2026-11-20T10:00:00Z') };
      rows.set(params[0], row);
      return { rowCount: 1, rows: [{ updated_at: row.updated_at }] };
    }
    throw new Error(`consulta no soportada: ${text}`);
  },
});

const { sanitizePhotoPrinterState } = require(path.join(root, 'utils', 'normalize.js'));
const service = require(path.join(root, 'services', 'photoPrinterService.js'));

test('sin nada guardado, la impresora arranca en reposo: sin regalos y con las opciones por defecto', async () => {
  rows.clear();
  const state = await service.loadPhotoPrinterState(5);
  assert.deepEqual(state.giftRules, []);
  assert.equal(state.anyGift, false);
  assert.deepEqual(state.options, { speed: 'normal', paper: 'white', shape: 'rounded', showName: true, showGift: true, sound: true, topDonor: true, topMedal: true });
  assert.deepEqual(state.giftEffects, {});
  assert.equal(state.defaultEffect, 'none');
});

test('las reglas de regalo son fijas: solo se puede elegir una de la lista, y solo para regalos que estan en las reglas', () => {
  const clean = sanitizePhotoPrinterState({
    giftRules: ['Rose', 'Leon', 'Galaxy', 'Heart'],
    giftEffects: {
      ROSÉ: 'kiss',
      Leon: 'tear',
      Galaxy: 'fire',
      Heart: 'inventada',
      'Otro regalo': 'wanted',
    },
  });
  assert.deepEqual(clean.giftEffects, { Rose: 'kiss', Leon: 'tear', Galaxy: 'fire' }, 'una regla inventada o de un regalo fuera de la lista no se guarda');
  for (const effect of ['wanted', 'top', 'beauty', 'fire', 'snakes', 'thorns', 'ice', 'lightning', 'kiss', 'tear']) {
    assert.equal(sanitizePhotoPrinterState({ giftRules: ['Rose'], giftEffects: { Rose: effect } }).giftEffects.Rose, effect, effect);
  }
  assert.deepEqual(sanitizePhotoPrinterState({ giftRules: ['Rose'], giftEffects: { Rose: 'none' } }).giftEffects, {}, '"sin efecto" no se guarda');
  assert.deepEqual(sanitizePhotoPrinterState({ giftRules: ['Rose'], giftEffects: ['kiss'] }).giftEffects, {});
  assert.deepEqual(sanitizePhotoPrinterState({ giftRules: ['Rose'], giftEffects: 'kiss' }).giftEffects, {});

  assert.equal(sanitizePhotoPrinterState({ defaultEffect: 'ice' }).defaultEffect, 'ice');
  assert.equal(sanitizePhotoPrinterState({ defaultEffect: 'raro' }).defaultEffect, 'none');
});

test('lo que se guardo con el editor de estilos de antes sigue cargando (sin esos estilos)', () => {
  const old = sanitizePhotoPrinterState({
    giftRules: ['Rose'],
    giftStyles: { Rose: { color: 'bw', frame: 'gold' } },
    defaultStyle: { color: 'sketch' },
    coinRules: [{ minCoins: 100, style: { frame: 'neon' } }],
    options: { vipWall: true, speed: 'fast' },
  });
  assert.deepEqual(old.giftRules, ['Rose']);
  assert.equal(old.giftStyles, undefined);
  assert.equal(old.coinRules, undefined);
  assert.equal(old.options.vipWall, undefined);
  assert.equal(old.options.speed, 'fast');
  assert.deepEqual(old.giftEffects, {});
});

test('las opciones del top donador', () => {
  const clean = sanitizePhotoPrinterState({ options: { topDonor: false, topMedal: 0 } });
  assert.equal(clean.options.topDonor, false);
  assert.equal(clean.options.topMedal, false);
});

test('las reglas se limpian: sin repetidos (tildes y mayusculas no cuentan), sin vacios y con tope', () => {
  const clean = sanitizePhotoPrinterState({ giftRules: ['Rose', ' rose ', 'ROSÉ!', 'Corazón  Rojo', 'corazon rojo', '', null, 42] });
  assert.deepEqual(clean.giftRules, ['Rose', 'Corazón  Rojo', '42']);

  const many = sanitizePhotoPrinterState({ giftRules: new Array(100).fill(0).map((_, i) => `Regalo ${i}`) });
  assert.equal(many.giftRules.length, 40, 'maximo 40 regalos');
  assert.deepEqual(sanitizePhotoPrinterState({ giftRules: 'no es lista' }).giftRules, []);
});

test('las opciones invalidas vuelven al valor por defecto y las validas se respetan', () => {
  const clean = sanitizePhotoPrinterState({ anyGift: 1, options: { speed: 'ultra', paper: 'kraft', shape: 'circle', showName: false, showGift: 0, sound: undefined } });
  assert.equal(clean.anyGift, true);
  assert.equal(clean.options.speed, 'normal', 'velocidad invalida');
  assert.equal(clean.options.paper, 'kraft');
  assert.equal(clean.options.shape, 'circle');
  assert.equal(clean.options.showName, false);
  assert.equal(clean.options.showGift, false);
  assert.equal(clean.options.sound, true, 'lo que no se manda queda por defecto');
  assert.deepEqual(sanitizePhotoPrinterState(null).giftRules, []);
  assert.equal(sanitizePhotoPrinterState({ options: { speed: 'turbo' } }).options.speed, 'turbo', 'super rapida es valida');
});

test('lo que se guarda es lo ya limpio y cada streamer tiene lo suyo', async () => {
  rows.clear();
  const saved = await service.savePhotoPrinterState(5, {
    giftRules: ['Rose', 'rose', 'Leon'],
    giftEffects: { Rose: 'snakes' },
    defaultEffect: 'top',
    options: { paper: 'mint', shape: 'polaroid', speed: 'fast' },
  });
  assert.deepEqual(saved.giftRules, ['Rose', 'Leon']);
  assert.ok(saved.updated_at);

  const loaded = await service.loadPhotoPrinterState(5);
  assert.deepEqual(loaded.giftRules, ['Rose', 'Leon']);
  assert.equal(loaded.options.paper, 'mint');
  assert.equal(loaded.options.speed, 'fast');
  assert.equal(loaded.giftEffects.Rose, 'snakes');
  assert.equal(loaded.defaultEffect, 'top');

  // lo guardado antes de que existieran las reglas fijas sigue cargando (sin reglas)
  rows.set(9, { state: { giftRules: ['Rose'], anyGift: false, options: { speed: 'slow' } }, updated_at: new Date() });
  const old = await service.loadPhotoPrinterState(9);
  assert.deepEqual(old.giftRules, ['Rose']);
  assert.deepEqual(old.giftEffects, {});
  assert.equal(old.options.speed, 'slow');

  const other = await service.loadPhotoPrinterState(6);
  assert.deepEqual(other.giftRules, [], 'otro streamer no ve lo de este');
});
