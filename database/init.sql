CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions (expire);

CREATE TABLE IF NOT EXISTS game_states (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  teams JSONB NOT NULL DEFAULT '[]'::jsonb,
  gifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_states_updated_at ON game_states (updated_at DESC);

CREATE TABLE IF NOT EXISTS game_state_meta (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_teams (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  id VARCHAR(120) NOT NULL,
  name VARCHAR(120) NOT NULL,
  color CHAR(7) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS game_gift_rules (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  id VARCHAR(120) NOT NULL,
  gift_id VARCHAR(120),
  name VARCHAR(180) NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  diamond_count INTEGER NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL DEFAULT '',
  team_id VARCHAR(120),
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS game_history_entries (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  id VARCHAR(120) NOT NULL,
  gift_name VARCHAR(180) NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  team_id VARCHAR(120),
  team_name VARCHAR(120) NOT NULL DEFAULT '',
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  note VARCHAR(400) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_game_teams_user_position ON game_teams (user_id, position);
CREATE INDEX IF NOT EXISTS idx_game_gift_rules_user_position ON game_gift_rules (user_id, position);
CREATE INDEX IF NOT EXISTS idx_game_history_entries_user_position ON game_history_entries (user_id, position);

CREATE TABLE IF NOT EXISTS user_gift_catalog (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  gift_id VARCHAR(120) NOT NULL,
  name VARCHAR(180) NOT NULL,
  diamond_count INTEGER NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL DEFAULT '',
  gift_type INTEGER,
  source_unique_id VARCHAR(120) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, gift_id)
);

CREATE INDEX IF NOT EXISTS idx_user_gift_catalog_user_updated ON user_gift_catalog (user_id, updated_at DESC);
