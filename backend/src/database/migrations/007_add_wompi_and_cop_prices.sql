ALTER TABLE plans
ADD COLUMN IF NOT EXISTS price_cop_cents BIGINT NOT NULL DEFAULT 0;

-- amount_usd_cents guardaba montos en cualquier moneda a pesar de su nombre
-- (Wompi cobra en COP) — se renombra a algo neutral y se agrega la moneda
-- explicita para que el historial de pagos no sea ambiguo.
ALTER TABLE payments RENAME COLUMN amount_usd_cents TO amount_cents;
ALTER TABLE payments ALTER COLUMN amount_cents TYPE BIGINT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'USD';
UPDATE payments SET currency = 'USD' WHERE gateway IN ('stripe', 'mercadopago');

-- Precios fijos en COP (calculados con la tasa USD/COP vigente al integrar Wompi;
-- no se recalculan automaticamente para evitar que la volatilidad del cambio
-- afecte el precio ya publicado — como un negocio real fijando su propio menu).
UPDATE plans SET price_cop_cents = 930000 WHERE id = 'pass_2d';
UPDATE plans SET price_cop_cents = 3110000 WHERE id = 'monthly';
UPDATE plans SET price_cop_cents = 21750000 WHERE id = 'yearly';
