-- Nuevos tokens incluidos en los planes del Co-anfitrion IA (1 token = $0.0000001 de costo real de IA, 10 M = $1):
--   Mensual ($15): 10 millones de tokens ($1.00 de IA)
--   Anual   ($70): 110 millones de tokens ($11.00 de IA)
-- Solo afecta compras futuras: lo que ya se entrego queda como esta (el libro ai_host_credit_ledger no se toca).

UPDATE plans SET ai_tokens = 10000000 WHERE id = 'monthly';
UPDATE plans SET ai_tokens = 110000000 WHERE id = 'yearly';
