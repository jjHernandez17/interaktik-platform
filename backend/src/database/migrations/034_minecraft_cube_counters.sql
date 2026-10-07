-- Cubo Gigante: cuenta regresiva al llenar un cubo y objetivo de wins (admite negativos)
ALTER TABLE minecraft_cube_settings ADD COLUMN IF NOT EXISTS countdown_seconds INTEGER NOT NULL DEFAULT 10;
ALTER TABLE minecraft_cube_settings ADD COLUMN IF NOT EXISTS win_goal INTEGER NOT NULL DEFAULT 10;
