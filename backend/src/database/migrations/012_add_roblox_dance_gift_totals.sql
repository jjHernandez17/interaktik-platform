CREATE TABLE IF NOT EXISTS roblox_dance_gift_totals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tiktok_unique_id VARCHAR(120) NOT NULL,
  tiktok_nickname VARCHAR(120) NOT NULL,
  total_coins INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tiktok_unique_id)
);

CREATE INDEX IF NOT EXISTS idx_roblox_dance_gift_totals_leaderboard ON roblox_dance_gift_totals (user_id, total_coins DESC);
