// tiktokinteractive/backend/src/routes/payments.js

const express = require('express');
const { requireAuth, getSessionUserId } = require('../middleware/auth');
const plansService = require('../services/plansService');
const accessService = require('../services/accessService');
const mercadopagoClient = require('../payments/mercadopagoClient');
const wompiClient = require('../payments/wompiClient');
const currencyService = require('../services/currencyService');
const emailService = require('../services/emailService');
const referralService = require('../services/referralService');
const aiHostCredit = require('../services/aiHostCredit');
const pool = require('../database/pool');
const { normalizeError, sanitizeHostHeader } = require('../utils/normalize');
const env = require('../config/env');
const logger = require('../config/logger');

const router = express.Router();

const VALID_GATEWAYS = ['mercadopago', 'wompi'];

// Monedas sin decimales (no manejan centavos): MercadoPago exige que
// unit_price sea entero para estas, o rechaza la preferencia con
// "unit_price must be a integer".
const ZERO_DECIMAL_CURRENCIES = new Set(['COP', 'CLP', 'PYG']);

function getFrontendBaseUrl(req) {
  if (env.NODE_ENV === 'production') {
    return env.FRONTEND_URL;
  }
  const safeHost = sanitizeHostHeader(req.get('host')) || sanitizeHostHeader(env.FRONTEND_URL.replace(/^https?:\/\//, ''));
  return `${req.protocol}://${safeHost}`;
}

// GET /api/plans - publico, catalogo de planes
// ?currency=XXX (opcional): agrega un precio ESTIMADO en esa moneda a cada
// plan, solo para mostrar. El cobro real de Wompi/MercadoPago se calcula
// convirtiendo price_usd_cents a la moneda de esa pasarela EN VIVO al
// momento de pagar (ver /payments/checkout) — por eso tambien va aca un
// estimado en COP (wompiEstimateCop) para la nota "Cobro real vía Wompi" de
// la tarjeta, sin importar la moneda que el visitante tenga detectada.
router.get('/plans', async (req, res) => {
  try {
    const plans = await plansService.listActivePlans();
    const requestedCurrency = String(req.query?.currency || '').toUpperCase();

    const plansWithEstimates = await Promise.all(plans.map(async (plan) => {
      const wompiEstimateCop = await currencyService.convertUsdCentsToDisplay(plan.price_usd_cents, 'COP');

      let display;
      if (requestedCurrency && requestedCurrency !== 'USD') {
        display = requestedCurrency === 'COP'
          ? wompiEstimateCop
          : await currencyService.convertUsdCentsToDisplay(plan.price_usd_cents, requestedCurrency);
      }

      return { ...plan, display, wompiEstimateCop };
    }));

    return res.json({
      plans: plansWithEstimates,
      gateways: {
        mercadopago: mercadopagoClient.isConfigured(),
        wompi: wompiClient.isConfigured(),
      },
    });
  } catch (error) {
    logger.error('Error listando planes', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// GET /api/account/access - estado de acceso del usuario actual
router.get('/account/access', requireAuth, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const access = await accessService.getUserAccess(userId);
    // Que tanto puede usar el Co-anfitrion IA (la plataforma muestra el candado y los tokens que le quedan)
    const aiHost = await aiHostCredit.getEntitlement(userId).catch(() => null);
    return res.json({ ...access, aiHost });
  } catch (error) {
    logger.error('Error consultando acceso', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// POST /api/payments/checkout - crea una sesion de pago con la pasarela elegida
router.post('/payments/checkout', requireAuth, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const planId = String(req.body?.planId || '');
    const gateway = String(req.body?.gateway || '');

    if (!VALID_GATEWAYS.includes(gateway)) {
      return res.status(400).json({ error: 'Pasarela invalida.' });
    }

    const plan = await plansService.getPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    const gatewayClients = { mercadopago: mercadopagoClient, wompi: wompiClient };
    const gatewayNames = { mercadopago: 'MercadoPago', wompi: 'Wompi' };
    const gatewayClient = gatewayClients[gateway];

    if (!gatewayClient.isConfigured()) {
      return res.status(503).json({ error: `${gatewayNames[gateway]} todavia no esta configurado en el servidor.` });
    }

    // El admin solo fija price_usd_cents. Wompi siempre cobra en COP,
    // convertido en vivo desde ese precio base; MercadoPago cobra en la
    // moneda de la cuenta del vendedor (MERCADOPAGO_CURRENCY), tambien
    // convertida en vivo si no es USD. La
    // conversion se hace UNA sola vez aca y el mismo numero se usa para lo
    // que se le manda a la pasarela, lo que se guarda en `payments` y lo
    // que sale despues en el recibo.
    let amountForRecord;
    let currencyForRecord;
    let gatewayCharge = null; // { amount: unidad completa, currency }

    if (gateway === 'wompi') {
      gatewayCharge = await currencyService.convertUsdCentsToDisplay(plan.price_usd_cents, 'COP');
      currencyForRecord = gatewayCharge.currency;
      amountForRecord = Math.round(gatewayCharge.amount * 100);
    } else {
      // mercadopago
      const mpCurrency = String(env.MERCADOPAGO_CURRENCY || 'USD').toUpperCase();
      gatewayCharge = mpCurrency === 'USD'
        ? { currency: 'USD', amount: plan.price_usd_cents / 100 }
        : await currencyService.convertUsdCentsToDisplay(plan.price_usd_cents, mpCurrency);

      if (ZERO_DECIMAL_CURRENCIES.has(gatewayCharge.currency)) {
        gatewayCharge = { ...gatewayCharge, amount: Math.round(gatewayCharge.amount) };
      }

      currencyForRecord = gatewayCharge.currency;
      amountForRecord = Math.round(gatewayCharge.amount * 100);
    }

    const paymentInsert = await pool.query(
      `INSERT INTO payments (user_id, plan_id, gateway, amount_cents, currency, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [userId, plan.id, gateway, amountForRecord, currencyForRecord],
    );
    const paymentId = paymentInsert.rows[0].id;

    const baseUrl = getFrontendBaseUrl(req);
    const successUrl = `${baseUrl}/platform.html?payment=success&paymentId=${paymentId}`;
    const cancelUrl = `${baseUrl}/platform.html?payment=cancel&paymentId=${paymentId}`;

    let checkoutUrl;
    let gatewaySessionId;

    if (gateway === 'mercadopago') {
      const preference = await mercadopagoClient.createPreference({
        plan,
        paymentId,
        successUrl,
        cancelUrl,
        amount: gatewayCharge.amount,
        currency: gatewayCharge.currency,
      });
      checkoutUrl = preference.url;
      gatewaySessionId = preference.preferenceId;
    } else {
      const checkout = wompiClient.buildCheckoutUrl({
        paymentId,
        amountInCents: amountForRecord,
        currency: gatewayCharge.currency,
        redirectUrl: successUrl,
      });
      checkoutUrl = checkout.url;
      gatewaySessionId = checkout.reference;
    }

    await pool.query('UPDATE payments SET gateway_session_id = $1 WHERE id = $2', [gatewaySessionId, paymentId]);

    return res.json({ url: checkoutUrl, paymentId });
  } catch (error) {
    logger.error('Error creando checkout', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// GET /api/payments/:id/status - estado real de un pago (fuente de verdad: DB,
// actualizada por el webhook de la pasarela). El frontend usa esto despues de
// que la pasarela redirige de vuelta, en vez de confiar en el query param de
// la URL de redireccion (algunas pasarelas, como Wompi, redirigen a la MISMA
// url sin importar si el pago fue aprobado o rechazado).
router.get('/payments/:id/status', requireAuth, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const paymentId = Number(req.params.id);

    const result = await pool.query(
      'SELECT id, status, gateway, plan_id, kind, topup_tokens FROM payments WHERE id = $1 AND user_id = $2',
      [paymentId, userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pago no encontrado.' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error consultando estado de pago', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// ---- Recarga de creditos (tokens) del Co-anfitrion IA ----
// Solo Wompi y MercadoPago. El usuario elige un presupuesto en USD; los tokens que recibe los calcula SIEMPRE el servidor
// (aiHostCredit.quoteTopup) y quedan guardados en el pago, asi que el navegador no puede inflarlos.
const TOPUP_GATEWAYS = ['wompi', 'mercadopago'];
const TOPUP_ITEM = { id: 'ai_topup', name: 'Recarga de créditos IA', description: 'Tokens para el Co-anfitrión IA de Interaktik' };

async function topupCharge(gateway, usdCents) {
  if (gateway === 'wompi') {
    return currencyService.convertUsdCentsToDisplay(usdCents, 'COP');
  }
  const mpCurrency = String(env.MERCADOPAGO_CURRENCY || 'USD').toUpperCase();
  let charge = mpCurrency === 'USD'
    ? { currency: 'USD', amount: usdCents / 100 }
    : await currencyService.convertUsdCentsToDisplay(usdCents, mpCurrency);
  if (ZERO_DECIMAL_CURRENCIES.has(charge.currency)) charge = { ...charge, amount: Math.round(charge.amount) };
  return charge;
}

// GET /api/ai-host/topup/options - pasarelas disponibles y tarifa (para pintar el modal y convertir al instante mientras se escribe)
router.get('/ai-host/topup/options', requireAuth, (req, res) => {
  return res.json({
    gateways: {
      wompi: wompiClient.isConfigured(),
      mercadopago: mercadopagoClient.isConfigured(),
    },
    tokensPerUsd: aiHostCredit.TOPUP_TOKENS_PER_USD,
    feePercent: aiHostCredit.TOPUP_FEE_PERCENT,
    minUsd: aiHostCredit.TOPUP_MIN_USD,
    maxUsd: aiHostCredit.TOPUP_MAX_USD,
    tokensPerResponse: aiHostCredit.AVG_TOKENS_PER_RESPONSE,
  });
});

// GET /api/ai-host/topup/quote?budget=5&gateway=wompi - lo que recibiria y lo que se cobraria en la moneda de la pasarela
router.get('/ai-host/topup/quote', requireAuth, async (req, res) => {
  try {
    const gateway = String(req.query.gateway || '');
    const quote = aiHostCredit.quoteTopup(req.query.budget);
    if (!quote) {
      return res.status(400).json({ error: `El presupuesto debe estar entre ${aiHostCredit.TOPUP_MIN_USD} y ${aiHostCredit.TOPUP_MAX_USD} USD.` });
    }
    let charge = null;
    if (TOPUP_GATEWAYS.includes(gateway)) {
      charge = await topupCharge(gateway, quote.totalCents).catch(() => null);
    }
    return res.json({
      usd: quote.usdCents / 100,
      feeUsd: quote.feeCents / 100,
      totalUsd: quote.totalCents / 100,
      tokens: quote.tokens,
      approx: quote.approx,
      charge,
    });
  } catch (error) {
    logger.error('Error cotizando recarga de IA', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// POST /api/ai-host/topup/checkout { gateway, budgetUsd } - crea el pago de la recarga y devuelve la URL de la pasarela
router.post('/ai-host/topup/checkout', requireAuth, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const gateway = String(req.body?.gateway || '');
    if (!TOPUP_GATEWAYS.includes(gateway)) {
      return res.status(400).json({ error: 'Elige Wompi o MercadoPago.' });
    }

    const quote = aiHostCredit.quoteTopup(req.body?.budgetUsd);
    if (!quote) {
      return res.status(400).json({ error: `El presupuesto debe estar entre ${aiHostCredit.TOPUP_MIN_USD} y ${aiHostCredit.TOPUP_MAX_USD} USD.` });
    }

    const gatewayClient = gateway === 'wompi' ? wompiClient : mercadopagoClient;
    if (!gatewayClient.isConfigured()) {
      return res.status(503).json({ error: `${gateway === 'wompi' ? 'Wompi' : 'MercadoPago'} todavia no esta configurado en el servidor.` });
    }

    // Solo recarga quien compro un plan con tokens (Mensual o Anual): el pase de 2 dias y la prueba no se desbloquean pagando tokens sueltos.
    const access = await accessService.getUserAccess(userId);
    const bought = await pool.query(
      "SELECT 1 FROM ai_host_credit_ledger WHERE user_id = $1 AND reason = 'plan' LIMIT 1",
      [userId],
    );
    if (!access.hasAccess || access.isTrial || bought.rowCount === 0) {
      return res.status(403).json({ error: 'Las recargas son para quienes tienen un plan Mensual o Anual. Compra uno desde Planes.' });
    }

    // Se cobra el presupuesto + el costo de transaccion; los tokens son los del presupuesto.
    const charge = await topupCharge(gateway, quote.totalCents);
    const amountForRecord = Math.round(charge.amount * 100);

    const paymentInsert = await pool.query(
      `INSERT INTO payments (user_id, plan_id, kind, topup_usd_cents, topup_tokens, gateway, amount_cents, currency, status)
       VALUES ($1, NULL, 'topup', $2, $3, $4, $5, $6, 'pending') RETURNING id`,
      [userId, quote.usdCents, quote.tokens, gateway, amountForRecord, charge.currency],
    );
    const paymentId = paymentInsert.rows[0].id;

    const baseUrl = getFrontendBaseUrl(req);
    const successUrl = `${baseUrl}/ai-host.html?topup=success&paymentId=${paymentId}`;
    const cancelUrl = `${baseUrl}/ai-host.html?topup=cancel&paymentId=${paymentId}`;

    let checkoutUrl;
    let gatewaySessionId;
    if (gateway === 'mercadopago') {
      const preference = await mercadopagoClient.createPreference({
        plan: TOPUP_ITEM,
        paymentId,
        successUrl,
        cancelUrl,
        amount: charge.amount,
        currency: charge.currency,
      });
      checkoutUrl = preference.url;
      gatewaySessionId = preference.preferenceId;
    } else {
      const checkout = wompiClient.buildCheckoutUrl({
        paymentId,
        amountInCents: amountForRecord,
        currency: charge.currency,
        redirectUrl: successUrl,
      });
      checkoutUrl = checkout.url;
      gatewaySessionId = checkout.reference;
    }

    await pool.query('UPDATE payments SET gateway_session_id = $1 WHERE id = $2', [gatewaySessionId, paymentId]);
    return res.json({ url: checkoutUrl, paymentId, tokens: quote.tokens });
  } catch (error) {
    logger.error('Error creando checkout de recarga de IA', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// POST /api/payments/webhook/mercadopago
router.post('/payments/webhook/mercadopago', async (req, res) => {
  try {
    // MercadoPago firma el manifest con el data.id tal como viene en la URL
    // (query string), no el del body — se extrae UNA sola vez y se usa tanto
    // para verificar la firma como para pedirle el pago a su API, para que
    // nunca se firme un id y se actue sobre otro.
    const paymentGatewayId = req.query?.['data.id'] || req.query?.id || req.body?.data?.id;

    let signatureValid = false;
    try {
      signatureValid = mercadopagoClient.verifyWebhookSignature(req, paymentGatewayId);
    } catch (verifyError) {
      logger.error('Error verificando firma de MercadoPago', verifyError);
    }

    if (!signatureValid) {
      logger.warn('[payments] Webhook MercadoPago con firma invalida, ignorado');
      return res.status(200).json({ received: true });
    }

    if (!paymentGatewayId) {
      return res.status(200).json({ received: true });
    }

    const payment = await mercadopagoClient.fetchPayment(paymentGatewayId);
    const paymentId = Number(payment?.external_reference);

    if (payment?.status === 'approved' && paymentId) {
      await confirmPayment(paymentId, String(paymentGatewayId));
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error procesando webhook de MercadoPago', error);
    // Respondemos 200 igual para evitar tormentas de reintentos de MercadoPago;
    // el pago quedara en 'pending' y se puede reconciliar manualmente si hace falta.
    return res.status(200).json({ received: true });
  }
});

// POST /api/payments/webhook/wompi
router.post('/payments/webhook/wompi', async (req, res) => {
  try {
    const event = req.body || {};

    let checksumValid = false;
    try {
      checksumValid = wompiClient.verifyEventChecksum(event);
    } catch (verifyError) {
      logger.error('Error verificando checksum de Wompi', verifyError);
    }

    if (!checksumValid) {
      logger.warn('[payments] Webhook Wompi con checksum invalido, ignorado');
      return res.status(200).json({ received: true });
    }

    const transaction = event?.data?.transaction;
    if (event.event === 'transaction.updated' && transaction?.status) {
      const reference = String(transaction.reference || '');
      const paymentId = Number(reference.replace(/^ik-/, ''));

      if (!paymentId) {
        logger.warn('[payments] Webhook Wompi con referencia no reconocida', reference);
      } else if (transaction.status === 'APPROVED') {
        await confirmPayment(paymentId, String(transaction.id));
      } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(transaction.status)) {
        await failPayment(paymentId, String(transaction.id));
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error procesando webhook de Wompi', error);
    return res.status(200).json({ received: true });
  }
});

// Recarga de IA confirmada: marca el pago y entrega los tokens en la MISMA transaccion (o se confirman los dos o ninguno, y el aviso
// repetido de la pasarela no duplica nada: el libro tiene un solo renglon por pago). No toca el acceso ni los referidos.
// Recibe la conexion de confirmPayment con la transaccion abierta; el release lo hace el finally de confirmPayment.
async function confirmTopup(client, payment, gatewayPaymentId) {
  const userResult = await client.query('SELECT email, name FROM app_users WHERE id = $1', [payment.user_id]);
  await client.query(
    `UPDATE payments SET status = 'paid', gateway_payment_id = $1, paid_at = NOW() WHERE id = $2`,
    [gatewayPaymentId, payment.id],
  );
  const grant = await aiHostCredit.grantTopup(client, payment);
  await client.query('COMMIT');
  logger.success(`[payments] Recarga de IA ${payment.id} confirmada: +${grant.granted} tokens al usuario ${payment.user_id}`);

  const user = userResult.rows[0];
  if (user?.email) {
    await emailService.sendPaymentReceiptEmail({
      to: user.email,
      name: user.name,
      planName: `Recarga de créditos IA (${Number(payment.topup_tokens).toLocaleString('es')} tokens)`,
      amountCents: payment.amount_cents,
      currency: payment.currency,
      gateway: payment.gateway,
      paymentId: payment.id,
      gatewayPaymentId,
      paidAt: new Date(),
      accessExpiresAt: null,
    }).catch((error) => logger.error('[payments] No se pudo enviar el recibo de la recarga', error));
  }
}

// Idempotente: si el pago ya estaba 'paid', no vuelve a extender el acceso.
async function confirmPayment(paymentId, gatewayPaymentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paymentResult = await client.query(
      `SELECT id, user_id, plan_id, kind, topup_tokens, status, gateway, currency, amount_cents FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId],
    );

    if (paymentResult.rowCount === 0) {
      logger.warn(`[payments] confirmPayment: pago ${paymentId} no existe`);
      await client.query('ROLLBACK');
      return;
    }

    const payment = paymentResult.rows[0];
    if (payment.status === 'paid') {
      await client.query('ROLLBACK');
      return;
    }

    if (payment.kind === 'topup') {
      await confirmTopup(client, payment, gatewayPaymentId);
      return;
    }

    const planResult = await client.query(
      'SELECT name, duration_days FROM plans WHERE id = $1',
      [payment.plan_id],
    );
    if (planResult.rowCount === 0) {
      logger.error(`[payments] confirmPayment: plan ${payment.plan_id} no existe`);
      await client.query('ROLLBACK');
      return;
    }

    const userResult = await client.query('SELECT email, name FROM app_users WHERE id = $1', [payment.user_id]);

    await client.query(
      `UPDATE payments SET status = 'paid', gateway_payment_id = $1, paid_at = NOW() WHERE id = $2`,
      [gatewayPaymentId, paymentId],
    );

    // Programa de referidos: si quien pago llego por un codigo, su invitador gana monedas. Va dentro de esta misma
    // transaccion (el pago y la recompensa se confirman juntos o ninguno), pero en un SAVEPOINT: un fallo aqui nunca
    // puede tumbar la confirmacion del pago (el usuario ya pago). Si falla, el referido queda 'pending' y se corrige
    // solo luego (referralService.reconcilePendingRewards).
    try {
      await client.query('SAVEPOINT referral_reward');
      await referralService.grantRewardForPayment(client, {
        id: payment.id,
        user_id: payment.user_id,
        plan_id: payment.plan_id,
        amount_cents: payment.amount_cents,
      });
      await client.query('RELEASE SAVEPOINT referral_reward');
    } catch (referralError) {
      await client.query('ROLLBACK TO SAVEPOINT referral_reward').catch(() => {});
      logger.error(`[payments] No se pudo dar la recompensa de referidos del pago ${paymentId} (el pago si se confirmo)`, referralError);
    }

    // Co-anfitrion IA: los planes que lo incluyen (Mensual y Anual) entregan sus tokens con la compra. Igual que lo de referidos,
    // va en un SAVEPOINT: si falla no tumba el pago (la reconciliacion de aiHostCredit entrega los tokens despues). El tiempo de
    // prueba, el que asigna el superusuario y el pase de 2 dias no pasan por aqui, asi que nunca dan tokens.
    try {
      await client.query('SAVEPOINT ai_host_tokens');
      await aiHostCredit.grantForPayment(client, { id: payment.id, user_id: payment.user_id, plan_id: payment.plan_id });
      await client.query('RELEASE SAVEPOINT ai_host_tokens');
    } catch (aiError) {
      await client.query('ROLLBACK TO SAVEPOINT ai_host_tokens').catch(() => {});
      logger.error(`[payments] No se pudieron entregar los tokens de IA del pago ${paymentId} (el pago si se confirmo)`, aiError);
    }

    await client.query('COMMIT');

    const plan = planResult.rows[0];
    const newExpiry = await accessService.extendAccess(payment.user_id, plan.duration_days);
    logger.success(`[payments] Pago ${paymentId} confirmado. Usuario ${payment.user_id} con acceso hasta ${newExpiry}`);

    const user = userResult.rows[0];
    if (user?.email) {
      await emailService.sendPaymentReceiptEmail({
        to: user.email,
        name: user.name,
        planName: plan.name,
        amountCents: payment.amount_cents,
        currency: payment.currency,
        gateway: payment.gateway,
        paymentId,
        gatewayPaymentId,
        paidAt: new Date(),
        accessExpiresAt: newExpiry,
      });
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Marca un pago como rechazado/fallido. Idempotente igual que confirmPayment;
// nunca extiende acceso ni sobreescribe un pago que ya haya quedado 'paid'.
async function failPayment(paymentId, gatewayPaymentId) {
  const result = await pool.query(
    `UPDATE payments SET status = 'failed', gateway_payment_id = $1
     WHERE id = $2 AND status = 'pending'`,
    [gatewayPaymentId, paymentId],
  );

  if (result.rowCount > 0) {
    logger.warn(`[payments] Pago ${paymentId} rechazado/fallido (gateway: ${gatewayPaymentId})`);
  }
}

module.exports = router;
module.exports.confirmPayment = confirmPayment;
