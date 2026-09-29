require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_SESSION_SECRET = 'dev-secret-change-this';

// En produccion, un SESSION_SECRET adivinable (o el default de desarrollo)
// permite falsificar la cookie de sesion de cualquier usuario, incluido el
// superusuario — mejor no arrancar que arrancar inseguro.
if (NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === DEFAULT_SESSION_SECRET)) {
  throw new Error('[FATAL] SESSION_SECRET no esta configurado (o usa el valor por defecto de desarrollo). Define una clave larga y aleatoria en las variables de entorno de produccion antes de iniciar.');
}

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET,
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  REDIS_URL: process.env.REDIS_URL || null,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://www.interaktik.com',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || null,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
  MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN || null,
  MERCADOPAGO_CURRENCY: process.env.MERCADOPAGO_CURRENCY || 'USD',
  MERCADOPAGO_WEBHOOK_SECRET: process.env.MERCADOPAGO_WEBHOOK_SECRET || null,
  // Monto minimo (en PESOS COP, no centavos) que cada pasarela deja cobrar.
  // Valores por defecto tomados de lo publicado por cada pasarela al momento
  // de escribir esto — verificalos en el dashboard/docs de cada una antes de
  // confiar en ellos a ciegas, y ajustalos aca si cambian.
  WOMPI_MIN_AMOUNT_COP: Number(process.env.WOMPI_MIN_AMOUNT_COP) || 1500,
  MERCADOPAGO_MIN_AMOUNT_COP: Number(process.env.MERCADOPAGO_MIN_AMOUNT_COP) || 1500,
  WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY || null,
  WOMPI_PRIVATE_KEY: process.env.WOMPI_PRIVATE_KEY || null,
  WOMPI_INTEGRITY_SECRET: process.env.WOMPI_INTEGRITY_SECRET || null,
  WOMPI_EVENTS_SECRET: process.env.WOMPI_EVENTS_SECRET || null,
  RESEND_API_KEY: process.env.RESEND_API_KEY || null,
  EMAIL_FROM: process.env.EMAIL_FROM || 'onboarding@resend.dev',
  DISCORD_SIGNUP_WEBHOOK_URL: process.env.DISCORD_SIGNUP_WEBHOOK_URL || null,
};
