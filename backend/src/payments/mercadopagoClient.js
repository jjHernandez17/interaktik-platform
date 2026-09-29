// tiktokinteractive/backend/src/payments/mercadopagoClient.js
//
// Envuelve el SDK de MercadoPago con inicializacion perezosa (mismo criterio
// que stripeClient.js): sin MERCADOPAGO_ACCESS_TOKEN el servidor arranca
// normal y solo falla al intentar cobrar.
//
// Nota: MercadoPago opera principalmente en moneda local segun el pais de la
// cuenta del vendedor. El monto/moneda a cobrar NO se calculan aca — los
// arma routes/payments.js (usando el precio fijo en USD del plan, convertido
// a MERCADOPAGO_CURRENCY si hace falta) y se pasan ya resueltos como
// `amount`/`currency`, para que el numero que se registra en la tabla
// `payments` sea siempre el mismo que el que de verdad se le cobra al
// usuario.

const crypto = require('crypto');
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

async function createPreference({ plan, paymentId, successUrl, cancelUrl, amount, currency }) {
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
          currency_id: currency,
          unit_price: amount,
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

// Verifica la firma del webhook (header x-signature: "ts=...,v1=...") segun
// el esquema documentado por MercadoPago, para confirmar que la notificacion
// de verdad viene de ellos antes de siquiera consultar su API. Sin esto,
// cualquiera podria pegarle a este endpoint con un data.id cualquiera.
function verifyWebhookSignature(req, dataId) {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new Error('MERCADOPAGO_WEBHOOK_SECRET no esta configurado.');
  }

  const signatureHeader = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];

  if (!signatureHeader || !requestId || !dataId) {
    return false;
  }

  const parts = String(signatureHeader).split(',').reduce((acc, part) => {
    const [key, value] = part.split('=').map((piece) => piece && piece.trim());
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  // MercadoPago pide bajar el data.id a minusculas SOLO si es alfanumerico.
  const normalizedDataId = /^[a-zA-Z0-9]+$/.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  const manifest = `id:${normalizedDataId};request-id:${requestId};ts:${ts};`;
  const computed = crypto.createHmac('sha256', env.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  isConfigured,
  createPreference,
  fetchPayment,
  verifyWebhookSignature,
};
