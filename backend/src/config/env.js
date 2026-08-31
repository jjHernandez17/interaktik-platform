require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-this',
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  REDIS_URL: process.env.REDIS_URL || null,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://www.interaktik.com',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || null,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
  MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN || null,
  MERCADOPAGO_CURRENCY: process.env.MERCADOPAGO_CURRENCY || 'USD',
  WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY || null,
  WOMPI_PRIVATE_KEY: process.env.WOMPI_PRIVATE_KEY || null,
  WOMPI_INTEGRITY_SECRET: process.env.WOMPI_INTEGRITY_SECRET || null,
  WOMPI_EVENTS_SECRET: process.env.WOMPI_EVENTS_SECRET || null,
  RESEND_API_KEY: process.env.RESEND_API_KEY || null,
  EMAIL_FROM: process.env.EMAIL_FROM || 'onboarding@resend.dev',
};
