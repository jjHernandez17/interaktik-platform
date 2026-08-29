
// TIKTOKINTERACTIVE/backend/src/services/dominanceService.js
const pool = require('../database/pool');
const { sanitizeDominanceGameState } = require('../utils/normalize');

async function loadDominanceState(userId) {
  const result = await pool.query(
    `SELECT game_mode, kills_config, teams, active_team_id, round, winner_team_id, winner, history, viewer_bindings, soldiers, combat, updated_at
     FROM dominance_game_state
     WHERE user_id = $1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return {
      gameMode: 'team_hp',
      killsConfig: {
        victoryType: 'time',
        durationSeconds: 120,
        targetKills: 20,
        soldierHp: 200,
        timerStartedAt: null,
        timerEndsAt: null,
        isFinished: false,
      },
      teams: {
        left: {
          name: 'Titanes',
          color: '#ef4444',
          health: 10000,
          maxHealth: 10000,
          kills: 0,
        },
        right: {
          name: 'Imperio',
          color: '#3b82f6',
          health: 10000,
          maxHealth: 10000,
          kills: 0,
        }
      },
      soldiers: {
        left: [],
        right: []
      },
      viewer_bindings: {},
      giftRules: [],
      history: [],
      combat: {
        powerCatalog: [],
        powerBindings: [],
      },
      winner_team_id: null,
      winner: null,
      updated_at: null
    };
  }

  const row = result.rows[0];

  return {
    ...sanitizeDominanceGameState({
      gameMode: row.game_mode,
      killsConfig: row.kills_config,
      teams: row.teams,
      active_team_id: row.active_team_id,
      round: row.round,
      winner_team_id: row.winner_team_id,
      winner: row.winner,
      history: row.history,
      viewer_bindings: row.viewer_bindings,
      soldiers: row.soldiers,
      combat: row.combat,
    }),
    updated_at: row.updated_at,
  };
}

async function saveDominanceState(userId, nextState) {
  const normalized = sanitizeDominanceGameState(nextState);

  const result = await pool.query(
    `INSERT INTO dominance_game_state (
      user_id,
      game_mode,
      kills_config,
      teams,
      active_team_id,
      round,
      winner_team_id,
      winner,
      history,
      viewer_bindings,
      soldiers,
      combat,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3::jsonb,
      $4::jsonb,
      $5,
      $6,
      $7,
      $8,
      $9::jsonb,
      $10::jsonb,
      $11::jsonb,
      $12::jsonb,
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      game_mode = EXCLUDED.game_mode,
      kills_config = EXCLUDED.kills_config,
      teams = EXCLUDED.teams,
      active_team_id = EXCLUDED.active_team_id,
      round = EXCLUDED.round,
      winner_team_id = EXCLUDED.winner_team_id,
      winner = EXCLUDED.winner,
      history = EXCLUDED.history,
      viewer_bindings = EXCLUDED.viewer_bindings,
      soldiers = EXCLUDED.soldiers,
      combat = EXCLUDED.combat,
      updated_at = NOW()
    RETURNING updated_at`,
    [
      userId,
      normalized.gameMode,
      JSON.stringify(normalized.killsConfig),
      JSON.stringify(normalized.teams),
      normalized.active_team_id,
      normalized.round,
      normalized.winner_team_id,
      normalized.winner,
      JSON.stringify(normalized.history),
      JSON.stringify(normalized.viewer_bindings || {}),
      JSON.stringify(normalized.soldiers || {}),
      JSON.stringify(normalized.combat || { powerCatalog: [], powerBindings: [] }),
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