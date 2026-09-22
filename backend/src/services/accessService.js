// tiktokinteractive/backend/src/services/accessService.js
//
// Controla el acceso a los juegos: prueba gratuita de 2 dias al registrarse,
// y extension de esa fecha de vencimiento cuando se confirma un pago.

const pool = require('../database/pool');

const TRIAL_DAYS = 2;

async function grantTrial(userId) {
  await pool.query(
    `INSERT INTO user_access (user_id, access_expires_at, is_trial, updated_at)
     VALUES ($1, NOW() + ($2 || ' days')::interval, true, NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, TRIAL_DAYS],
  );
}

// Nombre del plan a mostrar en la UI (ej. en el menu lateral). No hay una
// columna "plan actual" en user_access — para una compra real se toma el
// nombre del ultimo pago confirmado; para prueba gratuita o sin acceso se
// usa una etiqueta fija.
async function getPlanLabel(userId, { isTrial, hasAccess }) {
  if (!hasAccess) return 'Sin plan activo';
  if (isTrial) return 'Prueba gratuita';

  const result = await pool.query(
    `SELECT p.name FROM payments pay
     JOIN plans p ON p.id = pay.plan_id
     WHERE pay.user_id = $1 AND pay.status = 'paid'
     ORDER BY pay.paid_at DESC LIMIT 1`,
    [userId],
  );

  return result.rowCount > 0 ? result.rows[0].name : 'Plan activo';
}

async function getUserAccess(userId) {
  const result = await pool.query(
    'SELECT access_expires_at, is_trial FROM user_access WHERE user_id = $1',
    [userId],
  );

  if (result.rowCount === 0) {
    return { accessExpiresAt: null, isTrial: false, hasAccess: false, daysRemaining: 0, planLabel: 'Sin plan activo' };
  }

  const row = result.rows[0];
  const expiresAt = row.access_expires_at ? new Date(row.access_expires_at) : null;
  const hasAccess = Boolean(expiresAt && expiresAt.getTime() > Date.now());
  const isTrial = Boolean(row.is_trial);
  const daysRemaining = hasAccess
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  const planLabel = await getPlanLabel(userId, { isTrial, hasAccess });

  return {
    accessExpiresAt: row.access_expires_at,
    isTrial,
    hasAccess,
    daysRemaining,
    planLabel,
  };
}

async function hasActiveAccess(userId) {
  const access = await getUserAccess(userId);
  return access.hasAccess;
}

// Si al usuario todavia le quedaba tiempo activo, la nueva compra se suma
// a partir de ese vencimiento; si ya estaba vencido (o nunca tuvo acceso),
// arranca desde ahora. Una compra real siempre reemplaza el estado de prueba.
async function extendAccess(userId, durationDays) {
  const result = await pool.query(
    `INSERT INTO user_access (user_id, access_expires_at, is_trial, updated_at)
     VALUES ($1, NOW() + ($2 || ' days')::interval, false, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       access_expires_at = GREATEST(COALESCE(user_access.access_expires_at, NOW()), NOW()) + ($2 || ' days')::interval,
       is_trial = false,
       updated_at = NOW()
     RETURNING access_expires_at`,
    [userId, durationDays],
  );

  return result.rows[0].access_expires_at;
}

module.exports = {
  TRIAL_DAYS,
  grantTrial,
  getUserAccess,
  hasActiveAccess,
  extendAccess,
};
