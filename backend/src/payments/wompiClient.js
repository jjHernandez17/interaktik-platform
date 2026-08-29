// tiktokinteractive/backend/src/payments/wompiClient.js
//
// Wompi (Colombia) usa "Web Checkout": un simple redirect con parametros
// firmados en la URL, sin necesidad de crear una sesion via API primero.
// La firma de integridad evita que alguien manipule el monto/referencia
// antes de que el usuario pague.

const crypto = require('crypto');
const env = require('../config/env');

const CHECKOUT_BASE_URL = 'https://checkout.wompi.co/p/';

function isConfigured() {
  return Boolean(env.WOMPI_PUBLIC_KEY && env.WOMPI_INTEGRITY_SECRET);
}

function buildIntegritySignature({ reference, amountInCents, currency }) {
  const raw = `${reference}${amountInCents}${currency}${env.WOMPI_INTEGRITY_SECRET}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Wompi no requiere una llamada a su API para iniciar el pago: el "checkout"
// es literalmente una URL con query params firmados a la que se redirige al
// usuario (equivale a un <form method="GET"> enviado).
function buildCheckoutUrl({ paymentId, amountInCents, currency = 'COP', redirectUrl }) {
  if (!isConfigured()) {
    throw new Error('Wompi no esta configurado (falta WOMPI_PUBLIC_KEY o WOMPI_INTEGRITY_SECRET).');
  }

  const reference = `ik-${paymentId}`;
  const signature = buildIntegritySignature({ reference, amountInCents, currency });

  const params = new URLSearchParams({
    'public-key': env.WOMPI_PUBLIC_KEY,
    currency,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': signature,
  });

  if (redirectUrl) {
    params.set('redirect-url', redirectUrl);
  }

  return { url: `${CHECKOUT_BASE_URL}?${params.toString()}`, reference };
}

// Extrae un valor por dot-path (ej. "transaction.status") de un objeto.
function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function verifyEventChecksum(event) {
  if (!env.WOMPI_EVENTS_SECRET) {
    throw new Error('WOMPI_EVENTS_SECRET no esta configurado.');
  }

  const properties = event?.signature?.properties;
  const providedChecksum = String(event?.signature?.checksum || '').toLowerCase();

  if (!Array.isArray(properties) || !providedChecksum) {
    return false;
  }

  const concatenatedProperties = properties
    .map((propertyPath) => String(resolvePath(event.data, propertyPath) ?? ''))
    .join('');

  const raw = `${concatenatedProperties}${event.timestamp}${env.WOMPI_EVENTS_SECRET}`;
  const computedChecksum = crypto.createHash('sha256').update(raw).digest('hex').toLowerCase();

  return computedChecksum === providedChecksum;
}

module.exports = {
  isConfigured,
  buildCheckoutUrl,
  verifyEventChecksum,
};
