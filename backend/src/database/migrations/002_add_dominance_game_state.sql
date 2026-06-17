CREATE TABLE IF NOT EXISTS dominance_game_state (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  teams JSONB NOT NULL DEFAULT '[{"id":"team-1","name":"Equipo Morado","color":"#8b5cf6","life":100,"attack":12,"alive":true},{"id":"team-2","name":"Equipo Azul","color":"#06b6d4","life":100,"attack":12,"alive":true}]'::jsonb,
  active_team_id VARCHAR(120) NOT NULL DEFAULT 'team-1',
  round INTEGER NOT NULL DEFAULT 1,
  winner_team_id VARCHAR(120),
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  viewer_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  soldiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dominance_game_state_updated_at ON dominance_game_state (updated_at DESC);