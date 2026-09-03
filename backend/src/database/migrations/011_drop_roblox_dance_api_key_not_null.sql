-- La identificacion de Roblox Dance paso de una API key manual a la
-- vinculacion por ID de cuenta de Roblox (ver 010_add_roblox_dance_link.sql).
-- api_key queda en la tabla sin usarse (no se borra para no perder datos
-- existentes), pero ya no debe ser obligatoria al crear/actualizar filas.
ALTER TABLE roblox_dance_config
  ALTER COLUMN api_key DROP NOT NULL;
