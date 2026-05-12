require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-this',
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  REDIS_URL: process.env.REDIS_URL || null,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
};
