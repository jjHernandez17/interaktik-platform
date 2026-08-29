ALTER TABLE race_game_state
ADD COLUMN IF NOT EXISTS likes_config JSONB NOT NULL DEFAULT '{"enabled":false,"likesPerMove":50,"movePercent":5}'::jsonb;
