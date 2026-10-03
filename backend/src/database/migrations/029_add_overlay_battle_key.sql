-- Nuevo overlay: barra de batalla (dos bandos). Mismo patron que los otros
-- overlays: una overlay_key propia (columna nullable que se rellena sola la
-- primera vez que se consulta la config de un usuario existente). Los bandos,
-- sus regalos y el marcador viven dentro de overlay_config.state (JSONB).
ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS battle_key VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_overlay_config_battle_key ON overlay_config (battle_key);
