// tiktokinteractik/backend/src/services/aiHostCredit.js
//
// Tokens y acceso del Co-anfitrion IA segun el plan.
//
// Reglas:
//   - Los tokens se entregan SOLO cuando se confirma el pago de un plan que los incluye (plans.ai_tokens > 0): hoy Mensual y Anual.
//   - NO dan tokens: la prueba gratuita, el tiempo que el superusuario asigna a mano, el pase de 2 dias ni canjear monedas de referidos.
//   - El juego esta bloqueado en prueba gratuita, con el pase de 2 dias (o tiempo asignado a mano) y cuando se acaban los tokens.
//   - El superusuario no tiene limite.
//
// Medida: 1 token = $0.0000001 de costo real de la IA (10 millones = $1), contado en "tokens de Haiku equivalentes": una respuesta
// con Haiku 5.5 gasta ~1.500 y con Sonnet 5.5 ~30.000 (20 veces mas, igual que su precio).

'use strict';

const pool = require('../database/pool');
const logger = require('../config/logger');
const { isSuperUserEmail } = require('../middleware/auth');

const TOKENS_PER_USD = 10000000;

// Cuanto puede costar como maximo una respuesta (con el cache frio): si queda menos que esto no se pide otra
const MIN_TOKENS_TO_RUN = { 'claude-haiku-5-5': 4000, 'claude-sonnet-5-5': 80000 };
const AVG_TOKENS_PER_RESPONSE = { haiku: 1500, sonnet: 30000 };

// Recargas: cada dolar de presupuesto da 9 M de tokens = $0.90 de IA real (texto de Claude y voz de ElevenLabs al costo real); sobre cada
// $10 de presupuesto la plataforma se queda ~$1.50 despues de la pasarela: se cobran $11.10 ($10 + 11 % de costo de transaccion), la pasarela
// se lleva ~$0.56 y la IA ~$9.00. Se pueden ajustar con AI_HOST_TOPUP_TOKENS_PER_USD y AI_HOST_TOPUP_FEE_PERCENT.
const TOPUP_TOKENS_PER_USD = Math.max(100000, Number(process.env.AI_HOST_TOPUP_TOKENS_PER_USD) || 9000000);
const TOPUP_FEE_PERCENT = Math.min(50, Math.max(0, Number(process.env.AI_HOST_TOPUP_FEE_PERCENT ?? 11)));
const TOPUP_MIN_USD = 2;
const TOPUP_MAX_USD = 100;
const LOW_TOKENS_WARNING = 0.1; // avisa cuando queda el 10 % de lo que se le dio

const LOCK_MESSAGES = {
  no_access: 'Tu plan venció. Renueva tu plan para seguir usando la plataforma.',
  trial: 'El Co-anfitrión IA no está disponible en la prueba gratuita. Se incluye con los planes Mensual y Anual.',
  plan: 'Tu plan no incluye el Co-anfitrión IA. Se incluye con los planes Mensual y Anual.',
  tokens: 'Se acabaron tus tokens de IA. Renueva tu plan Mensual o Anual para recibir más.',
};

function costToTokens(costUsd) {
  return Math.max(1, Math.ceil(Number(costUsd || 0) * TOKENS_PER_USD));
}

function approxResponses(tokens) {
  const value = Math.max(0, Number(tokens) || 0);
  return { haiku: Math.floor(value / AVG_TOKENS_PER_RESPONSE.haiku), sonnet: Math.floor(value / AVG_TOKENS_PER_RESPONSE.sonnet) };
}

// Cotizacion de una recarga a partir del presupuesto en USD (el mismo calculo que usa el cobro real). Devuelve null si esta fuera de rango.
function quoteTopup(budgetUsd) {
  const usdCents = Math.round(Number(budgetUsd) * 100);
  if (!Number.isFinite(usdCents) || usdCents < TOPUP_MIN_USD * 100 || usdCents > TOPUP_MAX_USD * 100) return null;
  const tokens = Math.floor((usdCents * TOPUP_TOKENS_PER_USD) / 100);
  // costo de transaccion: se suma al presupuesto (los tokens se calculan solo sobre el presupuesto)
  const feeCents = Math.round((usdCents * TOPUP_FEE_PERCENT) / 100);
  return { usdCents, feeCents, totalCents: usdCents + feeCents, tokens, approx: approxResponses(tokens) };
}

async function getCredit(db, userId) {
  const result = await db.query(
    'SELECT tokens_remaining, tokens_granted_total, tokens_used_total FROM ai_host_credit WHERE user_id = $1',
    [userId],
  );
  const row = result.rows[0];
  return {
    remaining: row ? Number(row.tokens_remaining) : 0,
    granted: row ? Number(row.tokens_granted_total) : 0,
    used: row ? Number(row.tokens_used_total) : 0,
  };
}

// Si puede usar el juego y por que no. { allowed, reason, message, unlimited, tokensRemaining, tokensGranted, approx }
async function getEntitlement(userId) {
  const userResult = await pool.query('SELECT email FROM app_users WHERE id = $1', [userId]);
  if (userResult.rowCount > 0 && isSuperUserEmail(userResult.rows[0].email)) {
    return { allowed: true, reason: 'superuser', message: '', unlimited: true, tokensRemaining: null, tokensGranted: null, approx: null };
  }

  const access = await require('./accessService').getUserAccess(userId);
  const credit = await getCredit(pool, userId);

  let reason = 'ok';
  if (!access.hasAccess) reason = 'no_access';
  else if (access.isTrial) reason = 'trial';
  else if (credit.remaining <= 0) reason = credit.granted > 0 ? 'tokens' : 'plan';

  return {
    allowed: reason === 'ok',
    reason,
    message: LOCK_MESSAGES[reason] || '',
    unlimited: false,
    tokensRemaining: credit.remaining,
    tokensGranted: credit.granted,
    approx: approxResponses(credit.remaining),
  };
}

// Suma tokens a la cuenta y deja el renglon en el libro (uno solo por pago). Devuelve false si ese pago ya los habia entregado.
async function creditLedger(db, { userId, paymentId, tokens, reason }) {
  const ledger = await db.query(
    `INSERT INTO ai_host_credit_ledger (user_id, payment_id, tokens, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (payment_id) DO NOTHING
     RETURNING id`,
    [userId, paymentId, tokens, reason],
  );
  if (ledger.rowCount === 0) return false;

  await db.query(
    `INSERT INTO ai_host_credit (user_id, tokens_remaining, tokens_granted_total)
     VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       tokens_remaining = ai_host_credit.tokens_remaining + EXCLUDED.tokens_remaining,
       tokens_granted_total = ai_host_credit.tokens_granted_total + EXCLUDED.tokens_granted_total,
       updated_at = NOW()`,
    [userId, tokens],
  );
  return true;
}

// Entrega los tokens de una recarga confirmada (payments.topup_tokens, fijado por el servidor al crear el pago).
async function grantTopup(db, { id, user_id: userId }) {
  const row = await db.query("SELECT topup_tokens FROM payments WHERE id = $1 AND kind = 'topup'", [id]);
  const tokens = row.rowCount > 0 ? Number(row.rows[0].topup_tokens) : 0;
  if (!(tokens > 0)) return { granted: 0 };
  const done = await creditLedger(db, { userId, paymentId: id, tokens, reason: 'topup' });
  return done ? { granted: tokens } : { granted: 0, duplicate: true };
}

// Entrega los tokens de un pago confirmado. `db` es la conexion de la transaccion del pago, para que se confirme junto con el pago.
// Seguro de repetir: el libro tiene un solo renglon por pago.
async function grantForPayment(db, { id, user_id: userId, plan_id: planId }) {
  const plan = await db.query('SELECT ai_tokens FROM plans WHERE id = $1', [planId]);
  const tokens = plan.rowCount > 0 ? Number(plan.rows[0].ai_tokens) : 0;
  if (!(tokens > 0)) return { granted: 0 };

  const done = await creditLedger(db, { userId, paymentId: id, tokens, reason: 'plan' });
  if (!done) return { granted: 0, duplicate: true };
  return { granted: tokens };
}

// Gasta tokens (atomico, nunca baja de cero). Devuelve lo que queda.
async function consume(userId, tokens) {
  const amount = Math.max(0, Math.round(Number(tokens) || 0));
  const result = await pool.query(
    `UPDATE ai_host_credit SET
       tokens_remaining = GREATEST(0, tokens_remaining - $2),
       tokens_used_total = tokens_used_total + $2,
       updated_at = NOW()
     WHERE user_id = $1
     RETURNING tokens_remaining`,
    [userId, amount],
  );
  return result.rowCount > 0 ? Number(result.rows[0].tokens_remaining) : 0;
}

// Red de seguridad: pagos confirmados de planes con tokens que todavia estan vigentes y nunca recibieron su entrega (por ejemplo
// compras hechas antes de esta funcion, o un fallo al entregar). Se puede correr las veces que sea: el libro evita duplicados.
async function reconcileGrants() {
  const pending = await pool.query(
    `SELECT pay.id, pay.user_id, pay.plan_id
     FROM payments pay
     JOIN plans p ON p.id = pay.plan_id
     WHERE pay.status = 'paid'
       AND pay.kind = 'plan'
       AND p.ai_tokens > 0
       AND pay.paid_at IS NOT NULL
       AND pay.paid_at + (p.duration_days || ' days')::interval > NOW()
       AND NOT EXISTS (SELECT 1 FROM ai_host_credit_ledger l WHERE l.payment_id = pay.id)
     ORDER BY pay.id ASC
     LIMIT 500`,
  );

  let granted = 0;
  for (const payment of pending.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await grantForPayment(client, payment);
      await client.query('COMMIT');
      if (result.granted > 0) granted += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error(`[AIHOST] No se pudieron entregar los tokens del pago ${payment.id}`, error);
    } finally {
      client.release();
    }
  }

  // Recargas pagadas que no llegaron a entregarse (no vencen)
  const topups = await pool.query(
    `SELECT pay.id, pay.user_id FROM payments pay
     WHERE pay.status = 'paid' AND pay.kind = 'topup' AND pay.topup_tokens > 0
       AND NOT EXISTS (SELECT 1 FROM ai_host_credit_ledger l WHERE l.payment_id = pay.id)
     ORDER BY pay.id ASC LIMIT 500`,
  );
  for (const payment of topups.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await grantTopup(client, payment);
      await client.query('COMMIT');
      if (result.granted > 0) granted += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error(`[AIHOST] No se pudieron entregar los tokens de la recarga ${payment.id}`, error);
    } finally {
      client.release();
    }
  }
  if (granted > 0) logger.info(`[AIHOST] Tokens de IA entregados a ${granted} compra(s) vigentes que no los tenian`);
  return granted;
}

module.exports = {
  TOKENS_PER_USD,
  MIN_TOKENS_TO_RUN,
  AVG_TOKENS_PER_RESPONSE,
  LOW_TOKENS_WARNING,
  LOCK_MESSAGES,
  TOPUP_TOKENS_PER_USD,
  TOPUP_FEE_PERCENT,
  TOPUP_MIN_USD,
  TOPUP_MAX_USD,
  quoteTopup,
  grantTopup,
  costToTokens,
  approxResponses,
  getCredit,
  getEntitlement,
  grantForPayment,
  consume,
  reconcileGrants,
};
