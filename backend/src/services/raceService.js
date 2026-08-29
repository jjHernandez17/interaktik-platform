const pool = require('../database/pool');
const { sanitizeRaceGameState } = require('../utils/normalize');

async function loadRaceGameState(userId) {
  const result = await pool.query(
    `SELECT participants, car_positions, finish_counts, viewer_bindings, history,
            race_laps_limit, winner_participant_id, likes_config, updated_at
     FROM race_game_state WHERE user_id = $1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return {
      participants: [],
      car_positions: {},
      finish_counts: {},
      viewer_bindings: {},
      history: [],
      race_laps_limit: 5,
      winner_participant_id: null,
      likes_config: { enabled: false, likesPerMove: 50, movePercent: 5 },
      updated_at: null,
    };
  }

  const row = result.rows[0];
  return {
    participants: row.participants || [],
    car_positions: row.car_positions || {},
    finish_counts: row.finish_counts || {},
    viewer_bindings: row.viewer_bindings || {},
    history: row.history || [],
    race_laps_limit: row.race_laps_limit || 5,
    winner_participant_id: row.winner_participant_id || null,
    likes_config: row.likes_config || { enabled: false, likesPerMove: 50, movePercent: 5 },
    updated_at: row.updated_at,
  };
}

async function saveRaceGameState(userId, nextState) {
  const normalized = sanitizeRaceGameState(nextState);

  const result = await pool.query(
    `INSERT INTO race_game_state (user_id, participants, car_positions, finish_counts, viewer_bindings, history, race_laps_limit, winner_participant_id, likes_config, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET participants = EXCLUDED.participants, car_positions = EXCLUDED.car_positions,
                   finish_counts = EXCLUDED.finish_counts, viewer_bindings = EXCLUDED.viewer_bindings,
                   history = EXCLUDED.history, race_laps_limit = EXCLUDED.race_laps_limit,
                   winner_participant_id = EXCLUDED.winner_participant_id, likes_config = EXCLUDED.likes_config,
                   updated_at = NOW()
     RETURNING updated_at`,
    [
      userId,
      JSON.stringify(normalized.participants),
      JSON.stringify(normalized.car_positions),
      JSON.stringify(normalized.finish_counts),
      JSON.stringify(normalized.viewer_bindings),
      JSON.stringify(normalized.history),
      normalized.race_laps_limit,
      normalized.winner_participant_id,
      JSON.stringify(normalized.likes_config),
    ],
  );

  return {
    ...normalized,
    updated_at: result.rows[0].updated_at,
  };
}

module.exports = {
  loadRaceGameState,
  saveRaceGameState,
};
