-- Reglas de regalos del Co-anfitrion IA: el streamer elige que regalos activan cada accion.
--   { "priority": [...], "advice": [...], "joke": [...], "flatter": [...] }  (listas de nombres de regalo)
ALTER TABLE ai_host_config ADD COLUMN IF NOT EXISTS gift_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
