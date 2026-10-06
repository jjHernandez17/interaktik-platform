-- GTA V interactivo: los regalos de TikTok ayudan o molestan al streamer en su GTA V (modo historia).
-- Una pequeña aplicación de Windows se conecta a la plataforma con una llave secreta (server_key)
-- y escribe en el juego los trucos que corresponden a cada regalo.

CREATE TABLE IF NOT EXISTS gta_config (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  server_key VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gta_gift_rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  gift_id VARCHAR(60) NOT NULL,
  gift_name VARCHAR(120) NOT NULL,
  gift_image_url VARCHAR(500),
  action VARCHAR(40) NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, gift_id)
);

CREATE TABLE IF NOT EXISTS gta_action_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tiktok_unique_id VARCHAR(120) NOT NULL,
  tiktok_nickname VARCHAR(120) NOT NULL,
  action VARCHAR(40) NOT NULL,
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gta_action_queue_poll
  ON gta_action_queue (user_id, status, created_at);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando esté listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('gta', false)
ON CONFLICT (game_type) DO NOTHING;
