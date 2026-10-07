-- Cubo Gigante (Minecraft Java): los regalos llenan un cubo enorme de bloques; cada cubo completo es +1 victoria.
-- Reutiliza la llave (minecraft_config), el puente WebSocket y la cola de acciones de Minecraft.

CREATE TABLE IF NOT EXISTS minecraft_cube_settings (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  width INTEGER NOT NULL DEFAULT 10,
  height INTEGER NOT NULL DEFAULT 10,
  length INTEGER NOT NULL DEFAULT 10,
  block VARCHAR(80) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS minecraft_cube_rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  gift_id VARCHAR(60) NOT NULL,
  gift_name VARCHAR(120) NOT NULL,
  gift_image_url VARCHAR(500),
  blocks INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, gift_id)
);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando esté listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('minecraftcubo', false)
ON CONFLICT (game_type) DO NOTHING;
