const { runMigrations } = require('./migrate');
const logger = require('../config/logger');

async function bootstrapDatabase() {
  logger.info('Initializing database via migrations...');

  try {
    await runMigrations();
    logger.success('Database initialized successfully via migrations');
  } catch (error) {
    logger.error('Database initialization failed', error);
    throw error;
  }
}

module.exports = { bootstrapDatabase };
