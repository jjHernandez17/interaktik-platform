const pool = require('../database/pool');
const { sanitizeBoyVsGirlState } = require('../utils/normalize');

function defaultBoyVsGirlState() {
  return {
    girlsPercent: 50,
    girlsWins: 0,
    boysWins: 0,
    pushingSide: null,
    giftRules: [{ id: 'binding-gift-default', giftName: '', percent: 1 }],
    teamBindings: {},
    updated_at: null,
  };
}

async function loadBoyVsGirlState(userId) {
  const result = await pool.query(
    `SELECT state, updated_at FROM boyvsgirl_state WHERE user_id = $1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return defaultBoyVsGirlState();
  }

  const row = result.rows[0];
  return {
    ...sanitizeBoyVsGirlState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function saveBoyVsGirlState(userId, nextState) {
  const normalized = sanitizeBoyVsGirlState(nextState);

  const result = await pool.query(
    `INSERT INTO boyvsgirl_state (user_id, state, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
     RETURNING updated_at`,
    [userId, JSON.stringify(normalized)],
  );

  return {
    ...normalized,
    updated_at: result.rows[0].updated_at,
  };
}

module.exports = {
  loadBoyVsGirlState,
  saveBoyVsGirlState,
};
