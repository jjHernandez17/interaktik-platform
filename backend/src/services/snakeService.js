const pool = require('../database/pool');
const { sanitizeSnakeVsSnakeState } = require('../utils/normalize');

function getDefaultSnakeVsSnakeState() {
  return {
    settings: { rows: 14, cols: 14, tickMs: 450 },
    snakes: {
      left: {
        side: 'left',
        direction: 'right',
        label: 'Serpiente1',
        color: '#8b5cf6',
        headIndex: 2,
        length: 3,
        applesEaten: 0,
        wins: 0,
        finished: false,
        apples: [],
      },
      right: {
        side: 'right',
        direction: 'right',
        label: 'Serpiente2',
        color: '#06b6d4',
        headIndex: 2,
        length: 3,
        applesEaten: 0,
        wins: 0,
        finished: false,
        apples: [],
      },
    },
    rules: [],
    history: [],
  };
}

async function loadSnakeVsSnakeState(userId) {
  const result = await pool.query(
    `SELECT settings, snakes, rules, history, updated_at
     FROM snake_vs_snake_state WHERE user_id = $1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return { ...getDefaultSnakeVsSnakeState(), updated_at: null };
  }

  const row = result.rows[0];
  return {
    ...sanitizeSnakeVsSnakeState({
      settings: row.settings,
      snakes: row.snakes,
      rules: row.rules,
      history: row.history,
    }),
    updated_at: row.updated_at,
  };
}

async function saveSnakeVsSnakeState(userId, nextState) {
  const normalized = sanitizeSnakeVsSnakeState(nextState);

  const result = await pool.query(
    `INSERT INTO snake_vs_snake_state (user_id, settings, snakes, rules, history, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET settings = EXCLUDED.settings, snakes = EXCLUDED.snakes, rules = EXCLUDED.rules, history = EXCLUDED.history, updated_at = NOW()
     RETURNING updated_at`,
    [
      userId,
      JSON.stringify(normalized.settings),
      JSON.stringify(normalized.snakes),
      JSON.stringify(normalized.rules),
      JSON.stringify(normalized.history),
    ],
  );

  return {
    ...normalized,
    updated_at: result.rows[0].updated_at,
  };
}

module.exports = {
  getDefaultSnakeVsSnakeState,
  loadSnakeVsSnakeState,
  saveSnakeVsSnakeState,
};
