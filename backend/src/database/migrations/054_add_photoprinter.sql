-- Impresora de fotos: una impresora dibuja en una cinta de hoja infinita la foto de perfil de quien manda un regalo de las reglas.
-- Se guardan las reglas (que regalos imprimen) y las opciones de la impresora de cada streamer.
CREATE TABLE IF NOT EXISTS photoprinter_state (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando este listo (el superusuario siempre puede entrar).
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('photoprinter', false)
ON CONFLICT (game_type) DO NOTHING;
