-- Batalla de Reinos: dos bandos de la audiencia invocan tropas con sus regalos y pelean por los castillos.
-- El juego corre en el navegador (como Boy vs Girl); aqui solo se guarda la configuracion y el marcador.

CREATE TABLE IF NOT EXISTS kingdoms_state (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando esté listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('kingdoms', false)
ON CONFLICT (game_type) DO NOTHING;
