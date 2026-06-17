const pool = require('../database/pool');
const { sanitizeDominanceGameState } = require('../utils/normalize');

async function loadDominanceState(userId) {
  const result = await pool.query(
    `SELECT teams, active_team_id, round, winner_team_id, history, viewer_bindings, soldiers, updated_at
     FROM dominance_game_state WHERE user_id = $1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return {
      teams: [
        { id: 'team-1', name: 'Equipo Morado', color: '#8b5cf6', life: 100, attack: 12, alive: true },
        { id: 'team-2', name: 'Equipo Azul', color: '#06b6d4', life: 100, attack: 12, alive: true },
      ],
      active_team_id: 'team-1',
      round: 1,
      winner_team_id: null,
      history: [],
      updated_at: null,
    };
  }

  const row = result.rows[0];
  return {
    ...sanitizeDominanceGameState({
      teams: row.teams,
      active_team_id: row.active_team_id,
      round: row.round,
      winner_team_id: row.winner_team_id,
      history: row.history,
      viewer_bindings: row.viewer_bindings,
      soldiers: row.soldiers,
    }),
    updated_at: row.updated_at,
  };
}

async function saveDominanceState(userId, nextState) {
  const normalized = sanitizeDominanceGameState(nextState);

  const result = await pool.query(
    `INSERT INTO dominance_game_state (user_id, teams, active_team_id, round, winner_team_id, history, viewer_bindings, soldiers, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET teams = EXCLUDED.teams,
                   active_team_id = EXCLUDED.active_team_id,
                   round = EXCLUDED.round,
                   winner_team_id = EXCLUDED.winner_team_id,
                   history = EXCLUDED.history,
                   viewer_bindings = EXCLUDED.viewer_bindings,
                   soldiers = EXCLUDED.soldiers,
                   updated_at = NOW()
     RETURNING updated_at`,
    [
      userId,
      JSON.stringify(normalized.teams),
      normalized.active_team_id,
      normalized.round,
      normalized.winner_team_id,
      JSON.stringify(normalized.history),
      JSON.stringify(normalized.viewer_bindings || {}),
      JSON.stringify(normalized.soldiers || []),
    ],
  );

  return {
    ...normalized,
    updated_at: result.rows[0].updated_at,
  };
}

module.exports = {
  loadDominanceState,
  saveDominanceState,
};
