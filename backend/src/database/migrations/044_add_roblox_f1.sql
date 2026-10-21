-- Carrera de Formula 1 (Roblox): hasta 20 espectadores de TikTok corren en una pista de 4 carriles; los regalos les dan
-- turbo, escudo o frenan a otros con aceite. Aqui se guarda la vinculacion de la cuenta de Roblox, los ajustes, las reglas
-- regalo -> poder, el marcador de victorias por espectador y la cola que consulta el juego de Roblox.

CREATE TABLE IF NOT EXISTS roblox_f1_config (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  roblox_user_id BIGINT UNIQUE,
  roblox_username VARCHAR(60),
  join_keyword VARCHAR(20) NOT NULL DEFAULT 'unirme',
  laps INTEGER NOT NULL DEFAULT 3,
  lobby_seconds INTEGER NOT NULL DEFAULT 30,
  races_played INTEGER NOT NULL DEFAULT 0,
  last_race_id VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roblox_f1_gift_rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  gift_id VARCHAR(60) NOT NULL,
  gift_name VARCHAR(120) NOT NULL,
  gift_image_url VARCHAR(500),
  power VARCHAR(10) NOT NULL CHECK (power IN ('turbo', 'slow', 'shield')),
  -- a quien le pega: el carro de quien manda el regalo, el que va primero, el ultimo o uno al azar
  target VARCHAR(10) NOT NULL DEFAULT 'self' CHECK (target IN ('self', 'leader', 'last', 'random')),
  seconds INTEGER NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, gift_id)
);

-- Marcador acumulado por espectador (para el ranking de ganadores del streamer)
CREATE TABLE IF NOT EXISTS roblox_f1_scores (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tiktok_unique_id VARCHAR(120) NOT NULL,
  tiktok_nickname VARCHAR(120) NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  podiums INTEGER NOT NULL DEFAULT 0,
  races INTEGER NOT NULL DEFAULT 0,
  best_time NUMERIC(8, 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tiktok_unique_id)
);

-- Cola que consulta el juego. Entrega "al menos una vez": 'pending' -> 'sent' al entregarse -> 'done' cuando el juego la
-- confirma; si no se confirma en unos segundos se vuelve a entregar (el juego descarta las que ya aplico por su id).
CREATE TABLE IF NOT EXISTS roblox_f1_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL DEFAULT 'join' CHECK (kind IN ('join', 'power')),
  tiktok_unique_id VARCHAR(120) NOT NULL,
  tiktok_nickname VARCHAR(120) NOT NULL,
  power VARCHAR(10),
  target VARCHAR(10),
  seconds INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_roblox_f1_queue_poll
  ON roblox_f1_queue (user_id, status, created_at);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando este listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('robloxf1', false)
ON CONFLICT (game_type) DO NOTHING;
