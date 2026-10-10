-- Historial de regalos por espectador, para el "Lector de comentarios" (Herramientas): permite leer solo a quienes
-- mandaron cierto regalo (comunidad) o un regalo de mas de X monedas. Se llena con los regalos que llegan a la
-- conexion de overlays; no guarda mas que quien, que regalo y cuanto valia.
CREATE TABLE IF NOT EXISTS viewer_gifts (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tiktok_unique_id VARCHAR(120) NOT NULL,
  gift_name VARCHAR(120) NOT NULL,
  max_coins INTEGER NOT NULL DEFAULT 0,
  times INTEGER NOT NULL DEFAULT 1,
  last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tiktok_unique_id, gift_name)
);

CREATE INDEX IF NOT EXISTS idx_viewer_gifts_last_at ON viewer_gifts (last_at);
