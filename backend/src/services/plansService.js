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

module.exports = {
  listActivePlans,
  getPlanById,
};
