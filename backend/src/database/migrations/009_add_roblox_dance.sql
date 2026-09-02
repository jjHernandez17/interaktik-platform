CREATE TABLE IF NOT EXISTS roblox_dance_config (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  join_keyword VARCHAR(40) NOT NULL DEFAULT 'join',
  roblox_username VARCHAR(60),
  api_key VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roblox_dance_config_api_key ON roblox_dance_config (api_key);

CREATE TABLE IF NOT EXISTS roblox_dance_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  roblox_username VARCHAR(60) NOT NULL,
  tiktok_nickname VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_roblox_dance_queue_poll ON roblox_dance_queue (user_id, status, created_at);
