// tiktokinteractive/backend/src/services/currencyService.js
//
// Conversion de precios SOLO para mostrar un estimado en la moneda del
// usuario. El cobro real siempre se hace en el precio fijo de cada pasarela
// (ej. COP para Wompi) — esto nunca determina cuanto se cobra, solo lo que
// se muestra en pantalla antes de pagar.

const https = require('https');
const logger = require('../config/logger');

// Respaldo si la API externa no responde (tasas aproximadas, USD = 1).
const FALLBACK_RATES = {
  USD: 1,
  COP: 3900,
  MXN: 18.5,
  BRL: 5.4,
  ARS: 1200,
  CLP: 950,
  PEN: 3.7,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.38,
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
let cachedRates = null;
let cachedAt = 0;

function fetchRatesFromApi() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.result === 'success' && parsed?.rates) {
            resolve(parsed.rates);
          } else {
            reject(new Error('Respuesta invalida de la API de tasas de cambio.'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('timeout', () => req.destroy(new Error('Timeout consultando tasas de cambio.')));
    req.on('error', reject);
  });
}

async function getRates() {
  const now = Date.now();
  if (cachedRates && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedRates;
  }

  try {
    const rates = await fetchRatesFromApi();
    cachedRates = rates;
    cachedAt = now;
    return rates;
  } catch (error) {
    logger.warn('[currency] No se pudo obtener tasas de cambio en vivo, usando respaldo estatico', error.message);
    return FALLBACK_RATES;
  }
}

// Convierte un monto en centavos de USD a la moneda destino (no en centavos,
// unidad completa) para mostrar. Si la moneda no se reconoce, devuelve USD.
async function convertUsdCentsToDisplay(usdCents, targetCurrency) {
  const rates = await getRates();
  const currency = String(targetCurrency || 'USD').toUpperCase();
  const rate = rates[currency];

  if (!rate || currency === 'USD') {
    return { currency: 'USD', amount: Number(usdCents || 0) / 100 };
  }

  const amount = (Number(usdCents || 0) / 100) * rate;
  return { currency, amount };
}

module.exports = {
  getRates,
  convertUsdCentsToDisplay,
};
