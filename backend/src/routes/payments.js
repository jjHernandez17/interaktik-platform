// tiktokinteractive/backend/src/routes/payments.js

const express = require('express');
const { requireAuth, getSessionUserId } = require('../middleware/auth');
const plansService = require('../services/plansService');
const accessService = require('../services/accessService');
const stripeClient = require('../payments/stripeClient');
const mercadopagoClient = require('../payments/mercadopagoClient');
const wompiClient = require('../payments/wompiClient');
const currencyService = require('../services/currencyService');
const pool = require('../database/pool');
const { normalizeError } = require('../utils/normalize');
const env = require('../config/env');
const logger = require('../config/logger');

const router = express.Router();

const VALID_GATEWAYS = ['stripe', 'mercadopago', 'wompi'];

function getFrontendBaseUrl(req) {
  if (env.NODE_ENV === 'production') {
    return env.FRONTEND_URL;
  }
  return `${req.protocol}://${req.get('host')}`;
}

// GET /api/plans - publico, catalogo de planes
// ?currency=XXX (opcional): agrega un precio ESTIMADO en esa moneda a cada
// plan, solo para mostrar. El cobro real siempre usa el precio fijo de cada
// pasarela (price_usd_cents para Stripe/MercadoPago, price_cop_cents para Wompi).
router.get('/plans', async (req, res) => {
  try {
    const plans = await plansService.listActivePlans();
    const requestedCurrency = String(req.query?.currency || '').toUpperCase();

    let plansWithDisplay = plans;
    if (requestedCurrency && requestedCurrency !== 'USD') {
      plansWithDisplay = await Promise.all(plans.map(async (plan) => {
        const display = await currencyService.convertUsdCentsToDisplay(plan.price_usd_cents, requestedCurrency);
        return { ...plan, display };
      }));
    }

    return res.json({
      plans: plansWithDisplay,
      gateways: {
        stripe: stripeClient.isConfigured(),
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
    return res.json(access);
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

    const gatewayClients = { stripe: stripeClient, mercadopago: mercadopagoClient, wompi: wompiClient };
    const gatewayNames = { stripe: 'Stripe', mercadopago: 'MercadoPago', wompi: 'Wompi' };
    const gatewayClient = gatewayClients[gateway];

    if (!gatewayClient.isConfigured()) {
      return res.status(503).json({ error: `${gatewayNames[gateway]} todavia no esta configurado en el servidor.` });
    }

    // Wompi cobra en COP con precio fijo; Stripe/MercadoPago usan el precio en USD.
    const amountForRecord = gateway === 'wompi' ? plan.price_cop_cents : plan.price_usd_cents;
    const currencyForRecord = gateway === 'wompi' ? 'COP' : 'USD';

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

    if (gateway === 'stripe') {
      const session = await stripeClient.createCheckoutSession({
        plan,
        paymentId,
        userEmail: req.session?.user?.email,
        successUrl,
        cancelUrl,
      });
      checkoutUrl = session.url;
      gatewaySessionId = session.sessionId;
    } else if (gateway === 'mercadopago') {
      const preference = await mercadopagoClient.createPreference({
        plan,
        paymentId,
        successUrl,
        cancelUrl,
      });
      checkoutUrl = preference.url;
      gatewaySessionId = preference.preferenceId;
    } else {
      const checkout = wompiClient.buildCheckoutUrl({
        paymentId,
        amountInCents: plan.price_cop_cents,
        currency: 'COP',
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

// NOTA: el webhook de Stripe NO se registra en este router porque necesita el
// body crudo (sin pasar por express.json()) para verificar la firma. Se monta
// aparte en server.js, antes del parser JSON global — ver stripeWebhookHandler
// exportado al final de este archivo.

// POST /api/payments/webhook/mercadopago
router.post('/payments/webhook/mercadopago', async (req, res) => {
  try {
    const paymentGatewayId = req.body?.data?.id || req.query['data.id'] || req.query.id;

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
    if (event.event === 'transaction.updated' && transaction?.status === 'APPROVED') {
      const reference = String(transaction.reference || '');
      const paymentId = Number(reference.replace(/^ik-/, ''));

      if (paymentId) {
        await confirmPayment(paymentId, String(transaction.id));
      } else {
        logger.warn('[payments] Webhook Wompi con referencia no reconocida', reference);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error procesando webhook de Wompi', error);
    return res.status(200).json({ received: true });
  }
});

// Idempotente: si el pago ya estaba 'paid', no vuelve a extender el acceso.
async function confirmPayment(paymentId, gatewayPaymentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paymentResult = await client.query(
      `SELECT id, user_id, plan_id, status FROM payments WHERE id = $1 FOR UPDATE`,
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

    const planResult = await client.query('SELECT duration_days FROM plans WHERE id = $1', [payment.plan_id]);
    if (planResult.rowCount === 0) {
      logger.error(`[payments] confirmPayment: plan ${payment.plan_id} no existe`);
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE payments SET status = 'paid', gateway_payment_id = $1, paid_at = NOW() WHERE id = $2`,
      [gatewayPaymentId, paymentId],
    );

    await client.query('COMMIT');

    const durationDays = planResult.rows[0].duration_days;
    const newExpiry = await accessService.extendAccess(payment.user_id, durationDays);
    logger.success(`[payments] Pago ${paymentId} confirmado. Usuario ${payment.user_id} con acceso hasta ${newExpiry}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Handler crudo para el webhook de Stripe (requiere el body sin parsear como
// JSON para poder verificar la firma byte a byte). Se monta directamente en
// server.js con express.raw(), antes del parser JSON global.
async function stripeWebhookHandler(req, res) {
  try {
    const signature = req.headers['stripe-signature'];
    const event = stripeClient.constructWebhookEvent(req.body, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const paymentId = Number(session.metadata?.paymentId);

      if (paymentId) {
        await confirmPayment(paymentId, session.payment_intent || session.id);
      } else {
        logger.warn('[payments] Webhook Stripe sin paymentId en metadata', session.id);
      }
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error('Error procesando webhook de Stripe', error);
    return res.status(400).json({ error: 'Webhook invalido.' });
  }
}

module.exports = router;
module.exports.stripeWebhookHandler = stripeWebhookHandler;
