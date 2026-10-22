-- Ajustes propios de cada personaje del Co-anfitrion IA.
-- { "mochi": { accentColor, background, showChat, giftRules, voiceName, voiceRate, voicePitch, voiceVolume }, "cj": { ... } }
-- Lo que es del agente de IA (nombre, idioma, personalidad, palabras prohibidas, modelo, cadencia...) sigue siendo comun a todos los personajes.
ALTER TABLE ai_host_config ADD COLUMN IF NOT EXISTS character_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
