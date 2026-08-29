// tiktokinteractive/backend/src/services/verificationService.js

const crypto = require('crypto');
const pool = require('../database/pool');

const TOKEN_TTL_HOURS = 24;

async function createVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt],
  );

  return token;
}

// Consume el token si es valido (existe, no usado, no vencido). Idempotente
// en el sentido de que un token ya usado simplemente falla, no revierte nada.
async function consumeVerificationToken(token) {
  const result = await pool.query(
    `SELECT ev.id, ev.user_id, ev.expires_at, ev.used_at, u.email, u.name
     FROM email_verifications ev
     JOIN app_users u ON u.id = ev.user_id
     WHERE ev.token = $1`,
    [String(token || '')],
  );

  if (result.rowCount === 0) {
    return { success: false, reason: 'not_found' };
  }

  const row = result.rows[0];

  if (row.used_at) {
    return { success: false, reason: 'used' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { success: false, reason: 'expired' };
  }

  await pool.query('UPDATE email_verifications SET used_at = NOW() WHERE id = $1', [row.id]);
  await pool.query(
    'UPDATE app_users SET email_verified = true, email_verified_at = NOW() WHERE id = $1',
    [row.user_id],
  );

  return { success: true, userId: row.user_id, email: row.email, name: row.name };
}

module.exports = {
  createVerificationToken,
  consumeVerificationToken,
};
