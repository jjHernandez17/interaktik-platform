-- Resumen/estadisticas post-stream: cada vez que TikTok avisa que un live
-- termino (evento streamEnd), se guarda una fila con lo que paso en esa
-- transmision. No reemplaza ni resetea los overlays en vivo (goal bar, top
-- de regaladores, etc.) — es un conteo independiente que arranca en memoria
-- cuando el streamer se conecta y se vuelca aqui al terminar.
CREATE TABLE IF NOT EXISTS stream_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tiktok_username VARCHAR(120),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_coins INTEGER NOT NULL DEFAULT 0,
  total_likes INTEGER NOT NULL DEFAULT 0,
  new_followers INTEGER NOT NULL DEFAULT 0,
  top_gifters JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_likers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stream_sessions_user_ended ON stream_sessions (user_id, ended_at DESC);
