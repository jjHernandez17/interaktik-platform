-- Revierte la migracion 022: el daño por regalo se volvio a asignar de forma
-- directa por el streamer (ver combat.powerBindings), no por una tasa
-- global de monedas-por-daño.
ALTER TABLE dominance_game_state
DROP COLUMN IF EXISTS coins_per_damage;
