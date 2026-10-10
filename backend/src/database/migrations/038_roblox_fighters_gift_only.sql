-- Nuevo nivel 0: los luchadores solo actuan con regalos. Pasa a ser el valor por defecto.
ALTER TABLE roblox_fighters_config ALTER COLUMN ai_level SET DEFAULT 0;
UPDATE roblox_fighters_config SET ai_level = 0 WHERE ai_level = 2;
