const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../config/logger');

if (!env.DATABASE_URL) {
  logger.error('DATABASE_URL no definido');
  throw new Error('[FATAL] DATABASE_URL no definido. Crea .env usando .env.example y vuelve a iniciar.');
}

const shouldUseSsl = env.DATABASE_SSL || /(?:\.rlwy\.net|\.railway\.app)/i.test(env.DATABASE_URL);

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
  max: 5, // Reducir conexiones máximas para Railway
  min: 1, // Mantener solo 1 conexión mínima
  idleTimeoutMillis: 15000, // Cerrar conexiones idle más rápido (15s)
  connectionTimeoutMillis: 5000, // Timeout más largo para conexiones lentas
  acquireTimeoutMillis: 30000, // Timeout para adquirir conexión del pool
});

pool.on('error', (err, client) => {
  logger.error('Error inesperado en PostgreSQL pool', err);
  // Destruir el cliente problemático
  if (client) {
    client.end();
  }
});

pool.on('connect', (client) => {
  logger.info(`Nueva conexión PostgreSQL - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
});

pool.on('remove', (client) => {
  logger.info(`Conexión PostgreSQL removida - Total: ${pool.totalCount}, Idle: ${pool.idleCount}`);
});

logger.success('Pool de PostgreSQL configurado para Railway');

module.exports = pool;
