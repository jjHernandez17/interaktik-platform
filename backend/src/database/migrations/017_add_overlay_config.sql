CREATE TABLE IF NOT EXISTS overlay_config (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  overlay_key VARCHAR(64) NOT NULL UNIQUE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overlay_config_key ON overlay_config (overlay_key);
