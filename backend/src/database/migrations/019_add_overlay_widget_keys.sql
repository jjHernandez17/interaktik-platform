-- Cada overlay (alerta de regalos, barra de meta, top de regaladores,
-- contador de likes, top de likes) pasa a tener su PROPIA overlay_key en vez
-- de compartir una sola por usuario. Antes, regenerar el link de un overlay
-- invalidaba los 5 de una — y pegar dos overlays distintos con la MISMA key
-- en TikTok LIVE Studio al mismo tiempo daba problemas. Las columnas nuevas
-- quedan nullable: los usuarios ya existentes las reciben la próxima vez que
-- se consulte/guarde su configuración (ver getOrCreateOverlayConfig).
ALTER TABLE overlay_config RENAME COLUMN overlay_key TO gift_alert_key;
ALTER INDEX idx_overlay_config_key RENAME TO idx_overlay_config_gift_alert_key;

ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS goal_bar_key VARCHAR(64) UNIQUE;
ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS top_gifters_key VARCHAR(64) UNIQUE;
ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS like_counter_key VARCHAR(64) UNIQUE;
ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS top_likers_key VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_overlay_config_goal_bar_key ON overlay_config (goal_bar_key);
CREATE INDEX IF NOT EXISTS idx_overlay_config_top_gifters_key ON overlay_config (top_gifters_key);
CREATE INDEX IF NOT EXISTS idx_overlay_config_like_counter_key ON overlay_config (like_counter_key);
CREATE INDEX IF NOT EXISTS idx_overlay_config_top_likers_key ON overlay_config (top_likers_key);
