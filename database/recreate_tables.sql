DROP TABLE IF EXISTS app_users CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;

CREATE TABLE app_users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IDX_user_sessions_expire ON user_sessions (expire);

GRANT ALL PRIVILEGES ON app_users, user_sessions TO playtik_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO playtik_app;
