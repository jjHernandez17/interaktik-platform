// tiktokinteractive/backend/src/services/passwordResetService.js

const crypto = require('crypto');
const pool = require('../database/pool');

const TOKEN_TTL_HOURS = 1;

async function createPasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt],
  );

  return token;
}

// Valida el token (existe, no usado, no vencido) sin consumirlo todavia —
// lo usa la pagina de "nueva contrasena" para decidir si mostrar el
// formulario o un mensaje de enlace invalido, antes de que el usuario
// escriba nada.
async function checkPasswordResetToken(token) {
  const result = await pool.query(
    'SELECT id, expires_at, used_at FROM password_resets WHERE token = $1',
    [String(token || '')],
  );

  if (result.rowCount === 0) {
    return { valid: false, reason: 'not_found' };
  }

  const row = result.rows[0];

  if (row.used_at) {
    return { valid: false, reason: 'used' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true };
}

// Consume el token si es valido y devuelve el usuario dueño — quien llama
// es responsable de actualizar la contraseña dentro de la misma operacion.
async function consumePasswordResetToken(token) {
  const result = await pool.query(
    `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at, u.email, u.name
     FROM password_resets pr
     JOIN app_users u ON u.id = pr.user_id
     WHERE pr.token = $1`,
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

  await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [row.id]);

  return { success: true, userId: row.user_id, email: row.email, name: row.name };
}

module.exports = {
  createPasswordResetToken,
  checkPasswordResetToken,
  consumePasswordResetToken,
};
