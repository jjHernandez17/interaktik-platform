const pool = require('../database/pool');
const { sanitizePhotoPrinterState } = require('../utils/normalize');

function defaultPhotoPrinterState() {
  return { ...sanitizePhotoPrinterState({}), updated_at: null };
}

async function loadPhotoPrinterState(userId) {
  const result = await pool.query('SELECT state, updated_at FROM photoprinter_state WHERE user_id = $1', [userId]);
  if (result.rowCount === 0) {
    return defaultPhotoPrinterState();
  }
  const row = result.rows[0];
  return { ...sanitizePhotoPrinterState(row.state || {}), updated_at: row.updated_at };
}

async function savePhotoPrinterState(userId, nextState) {
  const normalized = sanitizePhotoPrinterState(nextState);
  const result = await pool.query(
    `INSERT INTO photoprinter_state (user_id, state, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
     RETURNING updated_at`,
    [userId, JSON.stringify(normalized)],
  );
  return { ...normalized, updated_at: result.rows[0].updated_at };
}

module.exports = {
  loadPhotoPrinterState,
  savePhotoPrinterState,
  defaultPhotoPrinterState,
};
