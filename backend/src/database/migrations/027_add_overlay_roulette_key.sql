-- Nuevo overlay: ruleta. Mismo patron que los otros overlays: una overlay_key
-- propia (columna nullable que se rellena sola la primera vez que se consulta
-- la config de un usuario existente). Las opciones y los regalos que la hacen
-- girar viven dentro de overlay_config.state (JSONB), no necesitan tabla propia.
ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS roulette_key VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_overlay_config_roulette_key ON overlay_config (roulette_key);
