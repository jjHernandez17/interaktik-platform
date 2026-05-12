const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../config/logger');

if (!env.DATABASE_URL) {
  logger.error('DATABASE_URL no definido');
  throw new Error('[FATAL] DATABASE_URL no definido. Crea .env usando .env.example y vuelve a iniciar.');
}

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error('Pool error', err);
});

pool.on('connect', () => {
  logger.info('✅ Database connected');
});

module.exports = pool;
