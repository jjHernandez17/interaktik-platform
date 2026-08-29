ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Los usuarios que ya existian antes de esta migracion quedan verificados
-- automaticamente (DEFAULT true los cubre); solo se backfillea la fecha
-- para que quede un dato coherente. Los registros NUEVOS se marcan
-- explicitamente email_verified=false desde el codigo, sin importar este
-- default permisivo a nivel de columna.
UPDATE app_users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications (token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications (user_id);
