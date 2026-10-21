-- Co-anfitrion IA con tokens incluidos en el plan.
--
-- Solo se agregan tokens cuando un usuario COMPRA un plan que los incluye (columna plans.ai_tokens). El tiempo de prueba gratuita, el
-- tiempo que el superusuario asigna a mano desde "Cuentas registradas" y el pase de 2 dias no dan tokens, y sin tokens el juego de IA
-- queda bloqueado.
--
-- 1 token = $0.0000001 de costo real de IA (es decir, 10 millones de tokens = $1): se mide en "tokens de Haiku equivalentes" para que un
-- solo numero sirva con cualquier modelo (Sonnet 5.5 gasta 20 veces mas tokens por respuesta que Haiku 5.5).
--   Mensual ($15):  30 millones de tokens ($3.00, 20 % del precio)
--   Anual ($70):   120 millones de tokens ($12.00, 17 % del precio)

ALTER TABLE plans ADD COLUMN IF NOT EXISTS ai_tokens BIGINT NOT NULL DEFAULT 0;

UPDATE plans SET ai_tokens = 30000000 WHERE id = 'monthly' AND ai_tokens = 0;
UPDATE plans SET ai_tokens = 120000000 WHERE id = 'yearly' AND ai_tokens = 0;

CREATE TABLE IF NOT EXISTS ai_host_credit (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  tokens_remaining BIGINT NOT NULL DEFAULT 0 CHECK (tokens_remaining >= 0),
  tokens_granted_total BIGINT NOT NULL DEFAULT 0,
  tokens_used_total BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Libro de entregas: un pago solo puede dar tokens UNA vez (payment_id unico), aunque el aviso de pago llegue repetido o se
-- vuelva a correr la reconciliacion.
CREATE TABLE IF NOT EXISTS ai_host_credit_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  payment_id INTEGER UNIQUE REFERENCES payments(id) ON DELETE SET NULL,
  tokens BIGINT NOT NULL,
  reason VARCHAR(20) NOT NULL DEFAULT 'plan',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_host_credit_ledger_user ON ai_host_credit_ledger (user_id);
