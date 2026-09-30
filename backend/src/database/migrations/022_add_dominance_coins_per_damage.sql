-- Cuantas monedas de un regalo equivalen a 1 punto de daño/curacion/escudo.
-- Configurable por el streamer (antes el dano de un regalo no tenia relacion
-- con su valor real: una Rosa de 1 moneda pegaba igual que un Leon de 29999).
ALTER TABLE dominance_game_state
ADD COLUMN IF NOT EXISTS coins_per_damage INTEGER NOT NULL DEFAULT 10;
