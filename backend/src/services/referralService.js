// Programa de referidos: codigo unico por cuenta, monedas por invitados que pagan y canje de monedas por planes.
//
// Reglas de seguridad (leerlas antes de tocar este archivo):
//  - Los montos (monedas por plan, costo de cada canje, dias de espera) viven SOLO aqui. El navegador nunca manda un
//    monto: solo dice "quiero el plan X" y el servidor decide cuanto cuesta.
//  - Las monedas salen de un libro de movimientos de solo escritura (referral_ledger). No existe un contador que
//    editar: el saldo es siempre la suma del libro.
//  - Una recompensa solo nace de un pago CONFIRMADO por la pasarela (confirmPayment, dentro de su misma transaccion).
//    Planes gratis, prueba gratuita y tiempo que da el superusuario nunca generan monedas porque no son pagos.
//  - Un invitado da recompensa una sola vez (su primer plan pagado). Esta garantizado por el estado de `referrals`
//    (UPDATE ... WHERE status = 'pending') y, ademas, por indices unicos en el libro.
//  - El enlace invitado -> invitador se crea unicamente al registrarse; no hay ninguna ruta para crearlo o cambiarlo despues.
//  - Canjear bloquea la billetera del usuario (advisory lock) para que dos peticiones en paralelo no puedan gastar
//    las mismas monedas, y cada canje lleva un request_id unico para que un reintento no cobre dos veces.
//  - Las monedas ganadas esperan HOLD_DAYS antes de poder gastarse, para poder deshacerlas si el pago se reembolsa o
//    se disputa (contracargo).

'use strict';

const crypto = require('crypto');
const pool = require('../database/pool');
const accessService = require('./accessService');
const logger = require('../config/logger');

// 32 simbolos (sin I, O, 0, 1): 256 es multiplo de 32, asi que `byte & 31` no sesga el sorteo.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_BODY_LENGTH = 8;
const CODE_PREFIX = 'IK-';
const CODE_REGEX = /^IK-[A-HJ-NP-Z2-9]{8}$/;

// Monedas que gana quien invita cuando su invitado paga su primer plan. Un plan que no esta aqui no da monedas.
// (Mapas sin prototipo y consultados con coinsFor/costFor: asi "__proto__" o "constructor" nunca cuentan como un plan.)
const REWARD_COINS_BY_PLAN = Object.freeze(Object.assign(Object.create(null), { pass_2d: 1, monthly: 3, yearly: 10 }));

// Cuanto cuesta canjear cada plan.
const REDEEM_COST_BY_PLAN = Object.freeze(Object.assign(Object.create(null), { pass_2d: 40, monthly: 150, yearly: 400 }));

function ownValue(map, key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : 0;
}

function readHoldDays() {
  const raw = process.env.REFERRAL_HOLD_DAYS;
  if (raw === undefined || raw === '') return 7;
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(60, Math.max(0, parsed));
}

const HOLD_DAYS = readHoldDays();

const REDEEM_REQUEST_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;
const WALLET_LOCK_NAMESPACE = 7301;
const MAX_CODE_ATTEMPTS = 8;

function makeError(message, status = 400, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

// ---------- codigos ----------

function generateCode() {
  const bytes = crypto.randomBytes(CODE_BODY_LENGTH);
  let body = '';
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) {
    body += CODE_ALPHABET[bytes[i] & 31];
  }
  return CODE_PREFIX + body;
}

// Acepta "ik-abcd2345", "IKABCD2345", "abcd 2345"... y devuelve "IK-ABCD2345", o null si no tiene la forma de un codigo.
function normalizeCode(value) {
  const raw = String(value ?? '').slice(0, 40).toUpperCase();
  let cleaned = raw.replace(/[^A-Z0-9]/g, '');
  if (cleaned.startsWith('IK')) cleaned = cleaned.slice(2);
  if (cleaned.length !== CODE_BODY_LENGTH) return null;

  const code = CODE_PREFIX + cleaned;
  return CODE_REGEX.test(code) ? code : null;
}

// Devuelve el codigo de la cuenta; lo crea la primera vez. Seguro ante dos llamadas a la vez.
async function ensureCode(userId, db = pool) {
  const existing = await db.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
  if (existing.rowCount > 0) return existing.rows[0].code;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const inserted = await db.query(
      'INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code',
      [userId, generateCode()],
    );
    if (inserted.rowCount > 0) return inserted.rows[0].code;

    // O ya existe uno para esta cuenta (otra llamada se adelanto) o el codigo sorteado choco con otro: se relee.
    const again = await db.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
    if (again.rowCount > 0) return again.rows[0].code;
  }

  throw makeError('No se pudo crear tu codigo de referido. Intenta de nuevo.', 500);
}

async function findReferrerId(db, code) {
  const result = await db.query('SELECT user_id FROM referral_codes WHERE code = $1', [code]);
  return result.rowCount > 0 ? Number(result.rows[0].user_id) : null;
}

// Enlaza al nuevo usuario con quien lo invito. Solo se llama desde el registro, dentro de su transaccion.
async function linkReferral(db, { referrerUserId, referredUserId, code }) {
  if (Number(referrerUserId) === Number(referredUserId)) {
    throw makeError('No puedes usar tu propio codigo de referido.', 400);
  }

  await db.query(
    `INSERT INTO referrals (referrer_user_id, referred_user_id, code_used)
     VALUES ($1, $2, $3)`,
    [referrerUserId, referredUserId, code],
  );
}

// ---------- billetera ----------

async function lockWallet(client, userId) {
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [WALLET_LOCK_NAMESPACE, Number(userId)]);
}

// disponible = lo que ya se puede gastar; pendiente = recompensas que todavia estan en espera.
async function readBalance(db, userId) {
  const result = await db.query(
    `SELECT
       COALESCE(SUM(coins) FILTER (WHERE available_at <= NOW()), 0)::int AS available,
       COALESCE(SUM(coins) FILTER (WHERE available_at > NOW()), 0)::int AS pending,
       MIN(available_at) FILTER (WHERE available_at > NOW() AND coins > 0) AS next_available_at
     FROM referral_ledger WHERE user_id = $1`,
    [userId],
  );

  const row = result.rows[0] || {};
  const pending = Number(row.pending) || 0;
  return {
    available: Number(row.available) || 0,
    pending,
    nextAvailableAt: pending > 0 ? row.next_available_at || null : null,
  };
}

// ---------- recompensas ----------

// Se llama dentro de la transaccion que marca el pago como pagado. `payment` = { id, user_id, plan_id, amount_cents }.
// Idempotente: aunque se llame dos veces para el mismo pago, la recompensa se da una sola vez.
async function grantRewardForPayment(db, payment) {
  const coins = ownValue(REWARD_COINS_BY_PLAN, payment.plan_id);
  if (!coins) return { granted: false, reason: 'plan_sin_recompensa' };
  if (!(Number(payment.amount_cents) > 0)) return { granted: false, reason: 'pago_sin_monto' };

  const pending = await db.query(
    `SELECT id, referrer_user_id FROM referrals
     WHERE referred_user_id = $1 AND status = 'pending'
     FOR UPDATE`,
    [payment.user_id],
  );
  if (pending.rowCount === 0) return { granted: false, reason: 'sin_referido_pendiente' };

  const referral = pending.rows[0];

  const claimed = await db.query(
    `UPDATE referrals
     SET status = 'rewarded', rewarded_payment_id = $2, rewarded_coins = $3, rewarded_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [referral.id, payment.id, coins],
  );
  if (claimed.rowCount === 0) return { granted: false, reason: 'ya_recompensado' };

  await db.query(
    `INSERT INTO referral_ledger (user_id, kind, coins, available_at, referral_id, payment_id, plan_id)
     VALUES ($1, 'earn', $2, NOW() + ($3::int * INTERVAL '1 day'), $4, $5, $6)`,
    [referral.referrer_user_id, coins, HOLD_DAYS, referral.id, payment.id, payment.plan_id],
  );

  logger.success(`[referrals] +${coins} monedas para el usuario ${referral.referrer_user_id} (invitado ${payment.user_id}, pago ${payment.id})`);
  return { granted: true, coins, referrerUserId: Number(referral.referrer_user_id) };
}

// Red de seguridad: si por algun fallo una recompensa no se dio al confirmar el pago, el referido sigue 'pending' y
// aqui se corrige (con el primer pago pagado del invitado). Es seguro llamarlo cuantas veces haga falta.
async function reconcilePendingRewards({ referrerUserId = null, limit = 200 } = {}) {
  const result = await pool.query(
    `SELECT pay.id, pay.user_id, pay.plan_id, pay.amount_cents
     FROM referrals r
     JOIN LATERAL (
       SELECT id, user_id, plan_id, amount_cents FROM payments
       WHERE user_id = r.referred_user_id AND status = 'paid'
       ORDER BY paid_at ASC NULLS LAST, id ASC
       LIMIT 1
     ) pay ON true
     WHERE r.status = 'pending' AND ($1::int IS NULL OR r.referrer_user_id = $1)
     LIMIT $2`,
    [referrerUserId, limit],
  );

  let granted = 0;
  for (const payment of result.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const outcome = await grantRewardForPayment(client, payment);
      await client.query('COMMIT');
      if (outcome.granted) granted += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error(`[referrals] No se pudo corregir la recompensa del pago ${payment.id}`, error);
    } finally {
      client.release();
    }
  }

  return { checked: result.rowCount, granted };
}

// Deshace una recompensa (reembolso, contracargo, abuso). Solo el superusuario llega aqui (ver la ruta).
async function revokeReward(referralId, note = null) {
  const id = Number(referralId);
  if (!Number.isInteger(id) || id <= 0) throw makeError('Referido invalido.', 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const referralResult = await client.query(
      'SELECT id, referrer_user_id, status FROM referrals WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (referralResult.rowCount === 0) throw makeError('Referido no encontrado.', 404);

    const referral = referralResult.rows[0];
    if (referral.status !== 'rewarded') {
      throw makeError(referral.status === 'revoked' ? 'Esta recompensa ya fue revertida.' : 'Este referido todavia no tiene recompensa.', 409);
    }

    await lockWallet(client, referral.referrer_user_id);

    const earn = await client.query(
      `SELECT coins, available_at, payment_id, plan_id FROM referral_ledger WHERE referral_id = $1 AND kind = 'earn'`,
      [id],
    );
    if (earn.rowCount === 0) throw makeError('No se encontro la recompensa original.', 409);

    const original = earn.rows[0];

    // La reversa cae en la misma fecha que la recompensa si todavia estaba en espera (se cancelan entre si sin tocar el
    // saldo disponible) o ahora mismo si ya se podia gastar (el saldo baja, incluso por debajo de cero).
    await client.query(
      `INSERT INTO referral_ledger (user_id, kind, coins, available_at, referral_id, payment_id, plan_id, note)
       VALUES ($1, 'revoke', $2, GREATEST($3::timestamptz, NOW()), $4, $5, $6, $7)`,
      [referral.referrer_user_id, -Number(original.coins), original.available_at, id, original.payment_id, original.plan_id, note ? String(note).slice(0, 200) : null],
    );
    await client.query(`UPDATE referrals SET status = 'revoked' WHERE id = $1`, [id]);

    await client.query('COMMIT');
    logger.warn(`[referrals] Recompensa del referido ${id} revertida (${original.coins} monedas del usuario ${referral.referrer_user_id})`);
    return { referralId: id, coins: Number(original.coins) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---------- canje ----------

async function redeem(userId, planId, requestId) {
  const cost = ownValue(REDEEM_COST_BY_PLAN, planId);
  if (!cost) throw makeError('Ese plan no se puede canjear.', 400);

  const cleanRequestId = String(requestId ?? '');
  if (!REDEEM_REQUEST_ID_REGEX.test(cleanRequestId)) {
    throw makeError('Solicitud invalida. Recarga la pagina e intenta de nuevo.', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockWallet(client, userId);

    // Mismo request_id = mismo clic reenviado: se devuelve el resultado anterior sin cobrar otra vez.
    const duplicate = await client.query(
      `SELECT plan_id FROM referral_ledger WHERE user_id = $1 AND kind = 'redeem' AND request_id = $2`,
      [userId, cleanRequestId],
    );
    if (duplicate.rowCount > 0) {
      await client.query('ROLLBACK');
      return { alreadyProcessed: true, planId: duplicate.rows[0].plan_id, balance: await readBalance(pool, userId) };
    }

    const planResult = await client.query(
      'SELECT id, name, duration_days FROM plans WHERE id = $1 AND is_active = true',
      [planId],
    );
    if (planResult.rowCount === 0) throw makeError('Ese plan no esta disponible ahora mismo.', 404);

    const balance = await readBalance(client, userId);
    if (balance.available < cost) {
      throw makeError(`Necesitas ${cost} monedas disponibles y tienes ${Math.max(0, balance.available)}.`, 400, 'INSUFFICIENT_COINS');
    }

    const plan = planResult.rows[0];

    await client.query(
      `INSERT INTO referral_ledger (user_id, kind, coins, available_at, plan_id, request_id)
       VALUES ($1, 'redeem', $2, NOW(), $3, $4)`,
      [userId, -cost, plan.id, cleanRequestId],
    );

    const accessExpiresAt = await accessService.extendAccess(userId, plan.duration_days, client);

    await client.query('COMMIT');
    logger.success(`[referrals] Usuario ${userId} canjeo ${cost} monedas por ${plan.id}`);

    return {
      alreadyProcessed: false,
      planId: plan.id,
      planName: plan.name,
      cost,
      accessExpiresAt,
      balance: await readBalance(pool, userId),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error && error.code === '23505') {
      throw makeError('Este canje ya se estaba procesando. Revisa tu saldo.', 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

// ---------- lo que ve la pagina ----------

// Del nombre solo se muestra la inicial: el que invita no necesita (ni debe) ver datos de otras personas.
function maskName(name) {
  const first = Array.from(String(name || '').trim())[0];
  return first ? `${first}***` : '***';
}

async function getOverview(userId) {
  const code = await ensureCode(userId);

  try {
    await reconcilePendingRewards({ referrerUserId: userId, limit: 50 });
  } catch (error) {
    logger.error('[referrals] Fallo la correccion de recompensas pendientes', error);
  }

  const [balance, referralsResult, historyResult] = await Promise.all([
    readBalance(pool, userId),
    pool.query(
      `SELECT r.status, r.rewarded_coins, r.rewarded_at, r.created_at, u.name
       FROM referrals r JOIN app_users u ON u.id = r.referred_user_id
       WHERE r.referrer_user_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [userId],
    ),
    pool.query(
      `SELECT kind, coins, plan_id, available_at, created_at
       FROM referral_ledger WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 25`,
      [userId],
    ),
  ]);

  const referrals = referralsResult.rows.map((row) => ({
    name: maskName(row.name),
    status: row.status,
    coins: row.status === 'rewarded' ? Number(row.rewarded_coins) || 0 : 0,
    joinedAt: row.created_at,
    rewardedAt: row.rewarded_at,
  }));

  return {
    code,
    balance,
    holdDays: HOLD_DAYS,
    rewards: REWARD_COINS_BY_PLAN,
    costs: REDEEM_COST_BY_PLAN,
    totals: {
      invited: referrals.length,
      paid: referrals.filter((entry) => entry.status === 'rewarded').length,
    },
    referrals,
    history: historyResult.rows.map((row) => ({
      kind: row.kind,
      coins: Number(row.coins),
      planId: row.plan_id,
      availableAt: row.available_at,
      createdAt: row.created_at,
    })),
  };
}

// Para el superusuario: ver quien invito a quien y poder revertir una recompensa.
async function listForAdmin(limit = 200) {
  const result = await pool.query(
    `SELECT r.id, r.status, r.rewarded_coins, r.rewarded_payment_id, r.rewarded_at, r.created_at,
            referrer.email AS referrer_email, referred.email AS referred_email
     FROM referrals r
     JOIN app_users referrer ON referrer.id = r.referrer_user_id
     JOIN app_users referred ON referred.id = r.referred_user_id
     ORDER BY r.created_at DESC
     LIMIT $1`,
    [Math.min(500, Math.max(1, Number(limit) || 200))],
  );
  return result.rows;
}

module.exports = {
  REWARD_COINS_BY_PLAN,
  REDEEM_COST_BY_PLAN,
  HOLD_DAYS,
  CODE_REGEX,
  generateCode,
  normalizeCode,
  ensureCode,
  findReferrerId,
  linkReferral,
  grantRewardForPayment,
  reconcilePendingRewards,
  revokeReward,
  redeem,
  getOverview,
  listForAdmin,
  maskName,
};
