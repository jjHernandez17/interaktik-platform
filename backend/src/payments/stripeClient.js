// tiktokinteractive/backend/src/payments/stripeClient.js
//
// Envuelve el SDK de Stripe con inicializacion perezosa: si STRIPE_SECRET_KEY
// no esta configurado, el servidor sigue arrancando normal y solo falla al
// intentar cobrar (con un mensaje claro), no al iniciar.

const env = require('../config/env');

let stripeInstance = null;

function isConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('Stripe no esta configurado (falta STRIPE_SECRET_KEY en las variables de entorno).');
  }

  if (!stripeInstance) {
    const Stripe = require('stripe');
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return stripeInstance;
}

async function createCheckoutSession({ plan, paymentId, userEmail, successUrl, cancelUrl }) {
  const stripe = getClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: userEmail || undefined,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: plan.name,
            description: plan.description || undefined,
          },
          unit_amount: plan.price_usd_cents,
        },
        quantity: 1,
      },
    ],
    metadata: { paymentId: String(paymentId) },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return { url: session.url, sessionId: session.id };
}

function constructWebhookEvent(rawBody, signature) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET no esta configurado.');
  }

  const stripe = getClient();
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  isConfigured,
  createCheckoutSession,
  constructWebhookEvent,
};
