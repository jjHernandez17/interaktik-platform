'use strict';

// Ejecutar con: node --test backend/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGiftPipeline, IDLE_FLUSH_MS } = require('../src/services/giftPipeline');

// Reloj y temporizadores de mentira para controlar el tiempo
function makeClock() {
  let current = 1_000_000;
  const timers = [];
  return {
    now: () => current,
    setTimer: (fn, ms) => { const t = { fn, at: current + ms, active: true }; timers.push(t); return t; },
    clearTimer: (t) => { if (t) t.active = false; },
    advance(ms) {
      current += ms;
      for (const t of timers) {
        if (t.active && t.at <= current) { t.active = false; t.fn(); }
      }
    },
  };
}

function setup(mode = 'final') {
  const clock = makeClock();
  const out = [];
  const pipeline = createGiftPipeline({ mode, emit: (chunk, data) => out.push({ ...chunk, data }), ...clock });
  return { pipeline, out, clock };
}

function gift({ user = 'u1', id = 5655, count = 1, end = 0, combo = true, type = 1, msgId, groupId } = {}) {
  return {
    giftId: id,
    repeatCount: count,
    repeatEnd: end,
    groupId,
    common: msgId ? { msgId } : undefined,
    user: { userId: user, uniqueId: user },
    giftDetails: { combo, giftType: type, giftName: 'Gift', diamondCount: 100 },
  };
}

const total = (out) => out.reduce((sum, e) => sum + e.repeatCount, 0);

test('regalo sin racha con repeatEnd en 0 se entrega al instante (antes se perdia)', () => {
  const { pipeline, out } = setup();
  pipeline.handle(gift({ combo: false, type: 2, end: 0, msgId: 'a' }));
  assert.equal(out.length, 1);
  assert.equal(out[0].repeatCount, 1);
});

test('dos regalos sin racha seguidos del mismo espectador cuentan los dos', () => {
  const { pipeline, out } = setup();
  pipeline.handle(gift({ combo: false, type: 2, msgId: 'a' }));
  pipeline.handle(gift({ combo: false, type: 2, msgId: 'b' }));
  assert.equal(total(out), 2);
});

test('el mismo mensaje sin racha repetido (mismo msgId) cuenta una sola vez', () => {
  const { pipeline, out } = setup();
  pipeline.handle(gift({ combo: false, type: 2, msgId: 'a' }));
  pipeline.handle(gift({ combo: false, type: 2, msgId: 'a' }));
  assert.equal(total(out), 1);
});

test('racha: mensajes duplicados + cierre duplicado entregan UN solo evento', () => {
  const { pipeline, out } = setup('final');
  pipeline.handle(gift({ count: 1, end: 0, msgId: 'm1' }));
  pipeline.handle(gift({ count: 1, end: 0, msgId: 'm1' }));
  assert.equal(out.length, 0);
  pipeline.handle(gift({ count: 1, end: 1, msgId: 'm2' }));
  pipeline.handle(gift({ count: 1, end: 1, msgId: 'm2' }));
  assert.equal(out.length, 1);
  assert.equal(out[0].repeatCount, 1);
});

test('racha: el cierre con el mismo msgId que un mensaje intermedio NO se pierde', () => {
  const { pipeline, out } = setup('final');
  pipeline.handle(gift({ count: 2, end: 0, msgId: 'same' }));
  pipeline.handle(gift({ count: 2, end: 1, msgId: 'same' }));
  assert.equal(total(out), 2);
});

test('racha de 3 toques entrega el total (3) una sola vez al cerrar', () => {
  const { pipeline, out } = setup('final');
  [1, 2, 3].forEach((n) => pipeline.handle(gift({ count: n, end: 0, msgId: `t${n}` })));
  pipeline.handle(gift({ count: 3, end: 1, msgId: 'end' }));
  assert.equal(out.length, 1);
  assert.equal(out[0].repeatCount, 3);
  assert.equal(out[0].streakTotal, 3);
});

test('racha cuyo cierre nunca llega se entrega igual por inactividad', () => {
  const { pipeline, out, clock } = setup('final');
  pipeline.handle(gift({ count: 1, end: 0, msgId: 'x1' }));
  pipeline.handle(gift({ count: 2, end: 0, msgId: 'x2' }));
  assert.equal(out.length, 0);
  clock.advance(IDLE_FLUSH_MS + 10);
  assert.equal(total(out), 2);
});

test('si el cierre llega despues de la entrega por inactividad no se cuenta de mas', () => {
  const { pipeline, out, clock } = setup('final');
  pipeline.handle(gift({ count: 2, end: 0, msgId: 'x2' }));
  clock.advance(IDLE_FLUSH_MS + 10);
  pipeline.handle(gift({ count: 2, end: 1, msgId: 'end' }));
  assert.equal(total(out), 2);
});

test('si el cierre trae mas unidades que lo ya entregado, solo se suma la diferencia', () => {
  const { pipeline, out, clock } = setup('final');
  pipeline.handle(gift({ count: 2, end: 0, msgId: 'x2' }));
  clock.advance(IDLE_FLUSH_MS + 10);
  pipeline.handle(gift({ count: 5, end: 1, msgId: 'end' }));
  assert.equal(total(out), 5);
});

test('modo delta: cada toque se entrega al instante y la suma coincide con el total', () => {
  const { pipeline, out } = setup('delta');
  pipeline.handle(gift({ count: 1, end: 0, msgId: 'a' }));
  assert.equal(total(out), 1);
  pipeline.handle(gift({ count: 4, end: 0, msgId: 'b' }));
  assert.equal(total(out), 4);
  pipeline.handle(gift({ count: 4, end: 1, msgId: 'c' }));
  assert.equal(total(out), 4);
  assert.deepEqual(out.map((e) => e.repeatCount), [1, 3]);
});

test('dos rachas seguidas del mismo regalo (sin groupId) se cuentan por separado', () => {
  const { pipeline, out } = setup('final');
  pipeline.handle(gift({ count: 1, end: 0, msgId: 'a1' }));
  pipeline.handle(gift({ count: 1, end: 1, msgId: 'a2' }));
  pipeline.handle(gift({ count: 1, end: 0, msgId: 'b1' }));
  pipeline.handle(gift({ count: 1, end: 1, msgId: 'b2' }));
  assert.equal(total(out), 2);
});

test('con groupId distinto son rachas distintas aunque la primera no haya cerrado', () => {
  const { pipeline, out, clock } = setup('final');
  pipeline.handle(gift({ count: 1, end: 0, msgId: 'a1', groupId: 'G1' }));
  pipeline.handle(gift({ count: 1, end: 1, msgId: 'b2', groupId: 'G2' }));
  clock.advance(IDLE_FLUSH_MS + 10);
  assert.equal(total(out), 2);
});

test('espectadores distintos no se mezclan', () => {
  const { pipeline, out } = setup('final');
  pipeline.handle(gift({ user: 'a', count: 2, end: 1, msgId: '1' }));
  pipeline.handle(gift({ user: 'b', count: 3, end: 1, msgId: '2' }));
  assert.equal(total(out), 5);
});

test('regalo marcado combo pero con otro tipo tambien se trata como racha y no se pierde', () => {
  const { pipeline, out, clock } = setup('final');
  pipeline.handle(gift({ combo: true, type: 3, count: 1, end: 0, msgId: 'z' }));
  clock.advance(IDLE_FLUSH_MS + 10);
  assert.equal(total(out), 1);
});

test('regalo de tipo 1 sin bandera combo tambien se trata como racha (no cuenta cada toque como regalo nuevo)', () => {
  const { pipeline, out } = setup('final');
  pipeline.handle(gift({ combo: false, type: 1, count: 1, end: 0, msgId: 'q1' }));
  pipeline.handle(gift({ combo: false, type: 1, count: 2, end: 0, msgId: 'q2' }));
  pipeline.handle(gift({ combo: false, type: 1, count: 2, end: 1, msgId: 'q3' }));
  assert.equal(total(out), 2);
});

test('al desconectar no se pierde una racha pendiente', () => {
  const { pipeline, out } = setup('final');
  pipeline.handle(gift({ count: 3, end: 0, msgId: 'p1' }));
  pipeline.dispose();
  assert.equal(total(out), 3);
});

test('cada evento entregado trae unidades nuevas y la cuenta acumulada', () => {
  const { pipeline, out } = setup('delta');
  pipeline.handle(gift({ count: 2, end: 0, msgId: 'a' }));
  pipeline.handle(gift({ count: 5, end: 0, msgId: 'b' }));
  assert.deepEqual(out.map((e) => [e.repeatCount, e.streakTotal]), [[2, 2], [3, 5]]);
});
