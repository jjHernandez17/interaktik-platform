ALTER TABLE roblox_dance_config
  ADD COLUMN IF NOT EXISTS roblox_user_id BIGINT UNIQUE;
