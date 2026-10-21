-- Carrera de Formula 1: quien se une con "!unirme <ID de Roblox>" corre con su skin de Roblox; la cola lleva ese ID.
ALTER TABLE roblox_f1_queue ADD COLUMN IF NOT EXISTS roblox_user_id BIGINT;
