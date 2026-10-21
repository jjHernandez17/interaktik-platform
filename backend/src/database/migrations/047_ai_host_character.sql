-- Co-anfitrion IA: ahora es un juego con un personaje animado como centro del live (no un overlay). Se quita la llave del overlay y
-- se agregan el personaje, el fondo del escenario y si se muestra el chat en pantalla.

ALTER TABLE ai_host_config DROP COLUMN IF EXISTS overlay_key;
ALTER TABLE ai_host_config ADD COLUMN IF NOT EXISTS character VARCHAR(20) NOT NULL DEFAULT 'mochi';
ALTER TABLE ai_host_config ADD COLUMN IF NOT EXISTS background VARCHAR(20) NOT NULL DEFAULT 'studio';
ALTER TABLE ai_host_config ADD COLUMN IF NOT EXISTS show_chat BOOLEAN NOT NULL DEFAULT TRUE;
