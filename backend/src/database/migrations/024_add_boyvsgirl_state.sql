CREATE TABLE IF NOT EXISTS boyvsgirl_state (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO game_availability (game_type, is_enabled)
VALUES ('boyvsgirl', true)
ON CONFLICT (game_type) DO NOTHING;
