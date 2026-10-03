-- Minecraft interactivo: los regalos de TikTok ayudan o molestan al streamer dentro de su
-- servidor de Minecraft. Un plugin instalado en el servidor consulta la cola de acciones
-- con una llave secreta (server_key) y las ejecuta.

CREATE TABLE IF NOT EXISTS minecraft_config (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  server_key VARCHAR(64) NOT NULL UNIQUE,
  minecraft_username VARCHAR(16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS minecraft_gift_rules (
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

CREATE TABLE IF NOT EXISTS minecraft_action_queue (
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

CREATE INDEX IF NOT EXISTS idx_minecraft_action_queue_poll
  ON minecraft_action_queue (user_id, status, created_at);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando esté listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('minecraft', false)
ON CONFLICT (game_type) DO NOTHING;
