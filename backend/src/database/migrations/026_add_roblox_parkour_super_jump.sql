-- Roblox Parkour: poder "super_salto" (dura N segundos). Las reglas y la cola
-- necesitan guardar cuánto dura el poder.

ALTER TABLE roblox_parkour_gift_rules
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 10;

ALTER TABLE roblox_parkour_power_queue
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 0;
