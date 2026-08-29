// tiktokinteractive/backend/src/payments/mercadopagoClient.js
//
// Envuelve el SDK de MercadoPago con inicializacion perezosa (mismo criterio
// que stripeClient.js): sin MERCADOPAGO_ACCESS_TOKEN el servidor arranca
// normal y solo falla al intentar cobrar.
//
// Nota: MercadoPago opera principalmente en moneda local segun el pais de la
// cuenta del vendedor. MERCADOPAGO_CURRENCY es configurable por variable de
// entorno (default USD) — hay que confirmar cual moneda acepta la cuenta real
// una vez creada.

const env = require('../config/env');

let configInstance = null;
let PreferenceClass = null;
let PaymentClass = null;

function isConfigured() {
  return Boolean(env.MERCADOPAGO_ACCESS_TOKEN);
}

function getSdk() {
  if (!isConfigured()) {
    throw new Error('MercadoPago no esta configurado (falta MERCADOPAGO_ACCESS_TOKEN en las variables de entorno).');
  }

  if (!configInstance) {
    const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
    configInstance = new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
    PreferenceClass = Preference;
    PaymentClass = Payment;
  }

  return configInstance;
}

async function createPreference({ plan, paymentId, successUrl, cancelUrl }) {
  const client = getSdk();
  const preference = new PreferenceClass(client);

  const result = await preference.create({
    body: {
      items: [
        {
          id: plan.id,
          title: plan.name,
          description: plan.description || undefined,
          quantity: 1,
          currency_id: env.MERCADOPAGO_CURRENCY || 'USD',
          unit_price: plan.price_usd_cents / 100,
        },
      ],
      external_reference: String(paymentId),
      back_urls: {
        success: successUrl,
        failure: cancelUrl,
        pending: cancelUrl,
      },
      auto_return: 'approved',
    },
  });

  return { url: result.init_point, preferenceId: result.id };
}

async function fetchPayment(paymentGatewayId) {
  const client = getSdk();
  const payment = new PaymentClass(client);
  return payment.get({ id: paymentGatewayId });
}

module.exports = {
  isConfigured,
  createPreference,
  fetchPayment,
};
