-- Recarga de creditos (tokens) del Co-anfitrion IA.
--
-- Una recarga es un pago sin plan: kind = 'topup', plan_id NULL, y topup_tokens guarda los tokens que se entregan al confirmarse
-- (se calculan en el servidor al crear el pago, nunca vienen del navegador). amount_cents/currency siguen siendo lo que se cobra en
-- la pasarela; topup_usd_cents es el presupuesto en USD que eligio el usuario.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'plan';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS topup_usd_cents INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS topup_tokens BIGINT;
ALTER TABLE payments ALTER COLUMN plan_id DROP NOT NULL;
