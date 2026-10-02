-- Aceptacion de terminos y condiciones al registrarse: cuando se acepto y que
-- version del texto. Las cuentas creadas antes de esta migracion quedan en
-- NULL (no se les exige aceptar de forma retroactiva).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);
