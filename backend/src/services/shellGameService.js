const pool = require('../database/pool');
const { sanitizeShellGameState } = require('../utils/normalize');

function defaultShellGameState() {
  return {
    cupCount: 3,
    mode: 'gift_rules',
    giftRules: {},
    minCoinsToConfirm: 50,
    timing: { votingSeconds: 15, mixSeconds: 6, moveSpeed: 5, resultSeconds: 4 },
    leaderboard: {},
    history: [],
    updated_at: null,
  };
}

async function loadShellGameState(userId) {
  const result = await pool.query(
    `SELECT state, updated_at FROM shellgame_state WHERE user_id = $1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return defaultShellGameState();
  }

  const row = result.rows[0];
  return {
    ...sanitizeShellGameState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function saveShellGameState(userId, nextState) {
  const normalized = sanitizeShellGameState(nextState);

  const result = await pool.query(
    `INSERT INTO shellgame_state (user_id, state, updated_at)
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
  loadShellGameState,
  saveShellGameState,
};
