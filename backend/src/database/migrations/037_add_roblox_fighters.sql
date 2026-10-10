-- Pelea Callejera (Roblox): dos luchadores peleando hasta quedarse sin vida. Aqui se guarda la vinculacion de la cuenta
-- de Roblox, la configuracion de cada lado, el marcador de wins, las reglas regalo -> poder, los espectadores que
-- eligieron lado y la cola que consulta el juego de Roblox.

CREATE TABLE IF NOT EXISTS roblox_fighters_config (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  roblox_user_id BIGINT UNIQUE,
  roblox_username VARCHAR(60),
  left_name VARCHAR(24) NOT NULL DEFAULT 'Rojo',
  right_name VARCHAR(24) NOT NULL DEFAULT 'Azul',
  left_color VARCHAR(7) NOT NULL DEFAULT '#e63946',
  right_color VARCHAR(7) NOT NULL DEFAULT '#3a86ff',
  left_style VARCHAR(20) NOT NULL DEFAULT 'karateka',
  right_style VARCHAR(20) NOT NULL DEFAULT 'ninja',
  left_keyword VARCHAR(20) NOT NULL DEFAULT 'rojo',
  right_keyword VARCHAR(20) NOT NULL DEFAULT 'azul',
  win_goal INTEGER NOT NULL DEFAULT 5,
  round_seconds INTEGER NOT NULL DEFAULT 90,
  max_health INTEGER NOT NULL DEFAULT 1000,
  ai_level INTEGER NOT NULL DEFAULT 2,
  left_wins INTEGER NOT NULL DEFAULT 0,
  right_wins INTEGER NOT NULL DEFAULT 0,
  champions_left INTEGER NOT NULL DEFAULT 0,
  champions_right INTEGER NOT NULL DEFAULT 0,
  last_round_id VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roblox_fighters_gift_rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  gift_id VARCHAR(60) NOT NULL,
  gift_name VARCHAR(120) NOT NULL,
  gift_image_url VARCHAR(500),
  power VARCHAR(40) NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  param VARCHAR(40),
  side VARCHAR(10) NOT NULL DEFAULT 'viewer' CHECK (side IN ('viewer', 'left', 'right')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, gift_id)
);

-- Lado que eligio cada espectador (comentando la palabra de su lado, o asignado solo al mandar su primer regalo)
CREATE TABLE IF NOT EXISTS roblox_fighters_viewers (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tiktok_unique_id VARCHAR(120) NOT NULL,
  tiktok_nickname VARCHAR(120) NOT NULL,
  side VARCHAR(5) NOT NULL CHECK (side IN ('left', 'right')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tiktok_unique_id)
);

-- Cola que consulta el juego. Entrega "al menos una vez": una fila pasa a 'sent' al entregarse y a 'done' cuando el juego
-- la confirma; si no se confirma en unos segundos se vuelve a entregar (el juego descarta las que ya aplico por su id).
CREATE TABLE IF NOT EXISTS roblox_fighters_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL DEFAULT 'power' CHECK (kind IN ('power', 'join')),
  tiktok_unique_id VARCHAR(120) NOT NULL,
  tiktok_nickname VARCHAR(120) NOT NULL,
  side VARCHAR(5) NOT NULL CHECK (side IN ('left', 'right')),
  power VARCHAR(40),
  amount INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  param VARCHAR(40),
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_roblox_fighters_queue_poll
  ON roblox_fighters_queue (user_id, status, created_at);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando este listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('robloxfighters', false)
ON CONFLICT (game_type) DO NOTHING;
