-- GTA V "Montaña Imposible": el jugador sube una rampa de containers en un mapa aparte mientras los regalos de TikTok
-- hacen caer carros, camiones y objetos desde arriba. Usa la misma llave que GTA V modo historia (gta_config),
-- pero con su propio mod, su propio puente WebSocket, sus reglas y su marcador de wins.

CREATE TABLE IF NOT EXISTS gtaramp_settings (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  win_goal INTEGER NOT NULL DEFAULT 10,
  wins INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gtaramp_gift_rules (
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

CREATE TABLE IF NOT EXISTS gtaramp_action_queue (
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

CREATE INDEX IF NOT EXISTS idx_gtaramp_action_queue_poll
  ON gtaramp_action_queue (user_id, status, created_at);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando esté listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('gtarampa', false)
ON CONFLICT (game_type) DO NOTHING;
