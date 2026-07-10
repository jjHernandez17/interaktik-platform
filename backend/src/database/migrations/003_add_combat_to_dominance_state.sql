ALTER TABLE dominance_game_state
ADD COLUMN IF NOT EXISTS combat JSONB NOT NULL DEFAULT '{}'::jsonb;
