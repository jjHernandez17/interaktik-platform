-- Opcion de cada personaje del Co-anfitrion IA: solo responder los mensajes del chat de quienes enviaron regalos en este live.
ALTER TABLE ai_host_config ADD COLUMN IF NOT EXISTS only_gifters BOOLEAN NOT NULL DEFAULT FALSE;
