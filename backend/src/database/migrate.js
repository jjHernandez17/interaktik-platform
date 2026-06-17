const fs = require('fs').promises;
const path = require('path');
const pool = require('./pool');
const logger = require('../config/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id VARCHAR(120) PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrationIds(client) {
  const result = await client.query(`SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`);
  return new Set(result.rows.map((row) => row.id));
}

async function readMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);
    const appliedIds = await getAppliedMigrationIds(client);
    const migrationFiles = await readMigrationFiles();

    for (const filename of migrationFiles) {
      const migrationId = filename.replace(/\.sql$/i, '');

      if (appliedIds.has(migrationId)) {
        logger.info(`[migrations] Saltando migracion aplicada: ${filename}`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = await fs.readFile(filePath, 'utf8');

      logger.info(`[migrations] Aplicando migracion: ${filename}`);
      await client.query(sql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, filename) VALUES ($1, $2)`,
        [migrationId, filename],
      );
    }

    await client.query('COMMIT');
    logger.success('[migrations] Migraciones aplicadas correctamente');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('[migrations] Error aplicando migraciones', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  runMigrations,
  MIGRATIONS_DIR,
  MIGRATIONS_TABLE,
};
