-- Cubo Gigante: cada regla de regalo puede dar bloques, soltar TNT o lanzar un rayo.
-- "blocks" pasa a ser la cantidad del poder: bloques, TNT o fuerza del rayo (1 a 10).
ALTER TABLE minecraft_cube_rules ADD COLUMN IF NOT EXISTS power VARCHAR(12) NOT NULL DEFAULT 'blocks';
