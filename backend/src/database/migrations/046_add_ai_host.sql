-- Co-anfitrion IA ("AI Host"): un agente que lee los comentarios del live, agradece regalos y seguidores, conversa con el chat y da
-- consejos. Aqui se guarda su configuracion por streamer, la llave de su overlay y el consumo diario (para poner topes de costo).

CREATE TABLE IF NOT EXISTS ai_host_config (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  overlay_key VARCHAR(64) NOT NULL UNIQUE,
  agent_name VARCHAR(30) NOT NULL DEFAULT 'Nova',
  language VARCHAR(10) NOT NULL DEFAULT 'es',
  tone VARCHAR(20) NOT NULL DEFAULT 'amigable',
  persona TEXT NOT NULL DEFAULT '',
  about_streamer TEXT NOT NULL DEFAULT '',
  reply_mode VARCHAR(10) NOT NULL DEFAULT 'all' CHECK (reply_mode IN ('all', 'questions', 'mentions')),
  thank_gifts BOOLEAN NOT NULL DEFAULT TRUE,
  min_gift_coins INTEGER NOT NULL DEFAULT 1,
  greet_followers BOOLEAN NOT NULL DEFAULT TRUE,
  greet_viewers BOOLEAN NOT NULL DEFAULT FALSE,
  proactive BOOLEAN NOT NULL DEFAULT TRUE,
  proactive_minutes INTEGER NOT NULL DEFAULT 4,
  cadence_seconds INTEGER NOT NULL DEFAULT 8,
  max_chars INTEGER NOT NULL DEFAULT 220,
  model VARCHAR(40) NOT NULL DEFAULT 'claude-haiku-5-5',
  banned_words TEXT NOT NULL DEFAULT '',
  voice_name VARCHAR(120) NOT NULL DEFAULT '',
  voice_rate NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
  voice_pitch NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
  voice_volume NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
  accent_color VARCHAR(7) NOT NULL DEFAULT '#7c5cff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consumo por dia: sirve para el tope diario de respuestas y para mostrarle al streamer cuanto uso lleva
CREATE TABLE IF NOT EXISTS ai_host_usage (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  spoken INTEGER NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 5) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Nace deshabilitado: el administrador lo habilita desde el panel cuando este listo.
INSERT INTO game_availability (game_type, is_enabled)
VALUES ('aihost', false)
ON CONFLICT (game_type) DO NOTHING;
