-- Nuevo overlay: alerta de nuevo seguidor. Sigue el mismo patron que los
-- otros 5 overlays (una overlay_key propia, columna nullable que se rellena
-- sola la primera vez que se consulta la config de un usuario existente).
ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS follow_alert_key VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_overlay_config_follow_alert_key ON overlay_config (follow_alert_key);
