// tiktokinteractive/backend/src/services/plansService.js

const pool = require('../database/pool');

async function listActivePlans() {
  const result = await pool.query(
    `SELECT id, name, description, price_usd_cents, price_cop_cents, duration_days
     FROM plans WHERE is_active = true ORDER BY sort_order ASC`,
  );
  return result.rows;
}

async function getPlanById(planId) {
  const result = await pool.query(
    `SELECT id, name, description, price_usd_cents, price_cop_cents, duration_days
     FROM plans WHERE id = $1 AND is_active = true`,
    [planId],
  );
  return result.rows[0] || null;
}

// Para el editor de precios del admin: todos los planes (activos o no), con
// los centavos crudos tal cual estan guardados (sin redondear/convertir).
async function listAllPlansForAdmin() {
  const result = await pool.query(
    `SELECT id, name, description, price_usd_cents, price_cop_cents, duration_days, is_active, sort_order
     FROM plans ORDER BY sort_order ASC`,
  );
  return result.rows;
}

async function updatePlanPrice(planId, { priceUsdCents, priceCopCents }) {
  const result = await pool.query(
    `UPDATE plans SET price_usd_cents = $1, price_cop_cents = $2
     WHERE id = $3
     RETURNING id, name, description, price_usd_cents, price_cop_cents, duration_days, is_active, sort_order`,
    [priceUsdCents, priceCopCents, planId],
  );
  return result.rows[0] || null;
}

module.exports = {
  listActivePlans,
  getPlanById,
  listAllPlansForAdmin,
  updatePlanPrice,
};
