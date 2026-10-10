-- Programa de referidos.
--
-- Cada cuenta tiene un codigo unico (referral_codes). Quien se registra con el codigo de otro queda enlazado en
-- `referrals` (una sola vez y para siempre: referred_user_id es UNIQUE y no hay forma de enlazar despues del registro).
-- Cuando el invitado paga su PRIMER plan (pago confirmado por la pasarela), el que invito recibe monedas.
--
-- Las monedas NO son un contador que alguien pueda editar: son un libro de movimientos (referral_ledger) de solo
-- escritura. El saldo siempre se calcula sumando el libro. Las monedas ganadas quedan "pendientes" unos dias antes de
-- poder gastarse (available_at) para poder deshacer la recompensa si el pago se reembolsa o se disputa.

CREATE TABLE IF NOT EXISTS referral_codes (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  code VARCHAR(11) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- IK- + 8 caracteres sin letras que se confundan (sin I, O, 0, 1): 32^8 combinaciones, imposible de adivinar
  CONSTRAINT referral_codes_format CHECK (code ~ '^IK-[A-HJ-NP-Z2-9]{8}$')
);

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  referred_user_id INTEGER NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  code_used VARCHAR(11) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  rewarded_payment_id INTEGER UNIQUE REFERENCES payments(id) ON DELETE SET NULL,
  rewarded_coins INTEGER,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_status_valid CHECK (status IN ('pending', 'rewarded', 'revoked')),
  CONSTRAINT referrals_no_self CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_user_id, created_at DESC);

-- Libro de monedas. coins > 0 = gana, coins < 0 = gasta o se descuenta.
--   earn   : recompensa por un invitado que pago (available_at = pago + dias de espera)
--   redeem : canje por un plan (available_at = ahora)
--   revoke : se deshace una recompensa (reembolso o abuso); cancela exactamente al earn que corresponde
-- referral_id y payment_id son solo referencia (sin FK a proposito): borrar un pago o un referido nunca debe borrar
-- ni editar monedas que alguien ya gano.
CREATE TABLE IF NOT EXISTS referral_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL,
  coins INTEGER NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referral_id INTEGER,
  payment_id INTEGER,
  plan_id VARCHAR(40),
  request_id VARCHAR(64),
  note VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_ledger_kind_valid CHECK (kind IN ('earn', 'redeem', 'revoke')),
  CONSTRAINT referral_ledger_sign CHECK (
    (kind = 'earn' AND coins > 0) OR (kind IN ('redeem', 'revoke') AND coins < 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_referral_ledger_user ON referral_ledger (user_id, created_at DESC);

-- Una recompensa por invitado, un descuento por recompensa y un canje por solicitud (evita doble cobro/doble pago
-- aunque la misma peticion llegue dos veces o dos webhooks se crucen).
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_ledger_earn ON referral_ledger (referral_id) WHERE kind = 'earn';
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_ledger_revoke ON referral_ledger (referral_id) WHERE kind = 'revoke';
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_ledger_redeem_request ON referral_ledger (user_id, request_id) WHERE kind = 'redeem';

-- El libro es de solo escritura: una fila nunca se modifica (los errores se corrigen con un movimiento nuevo).
CREATE OR REPLACE FUNCTION referral_ledger_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'referral_ledger es de solo escritura: no se puede modificar un movimiento';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referral_ledger_no_update ON referral_ledger;
CREATE TRIGGER trg_referral_ledger_no_update
  BEFORE UPDATE ON referral_ledger
  FOR EACH ROW EXECUTE FUNCTION referral_ledger_no_update();
