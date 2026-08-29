CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  price_usd_cents INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (id, name, description, price_usd_cents, duration_days, sort_order) VALUES
  ('pass_2d', 'Pase 2 días', 'Acceso completo a todos los juegos por 2 días.', 300, 2, 1),
  ('monthly', 'Mensual', 'Acceso completo a todos los juegos por 1 mes.', 1000, 30, 2),
  ('yearly', 'Anual', 'Acceso completo a todos los juegos por 1 año.', 7000, 365, 3)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_access (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  access_expires_at TIMESTAMPTZ,
  is_trial BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plan_id VARCHAR(40) NOT NULL REFERENCES plans(id),
  gateway VARCHAR(20) NOT NULL,
  gateway_session_id VARCHAR(255),
  gateway_payment_id VARCHAR(255),
  amount_usd_cents INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_session_id ON payments (gateway_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
