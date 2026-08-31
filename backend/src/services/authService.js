const bcrypt = require('bcryptjs');
const pool = require('../database/pool');
const { normalizeEmail, normalizeError } = require('../utils/normalize');
const { attachAuthFlags } = require('../middleware/auth');
const accessService = require('./accessService');
const verificationService = require('./verificationService');
const emailService = require('./emailService');

function buildVerifyUrl(baseUrl, token) {
  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmailFor(user, baseUrl) {
  const token = await verificationService.createVerificationToken(user.id);
  await emailService.sendVerificationEmail({
    to: user.email,
    name: user.name,
    verifyUrl: buildVerifyUrl(baseUrl, token),
  });
}

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length <= 5) {
    throw new Error('La contraseña debe tener mas de 5 caracteres.');
  }

  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error('La contraseña debe incluir mayusculas, minusculas, un numero y un caracter especial.');
  }
}

async function register(name, email, password, baseUrl) {
  const normalizedEmail = normalizeEmail(email);

  if (!name || !normalizedEmail || password.length < 6) {
    throw new Error('Debes completar nombre, correo y contrasena (minimo 6 caracteres).');
  }

  validatePasswordStrength(password);

  try {
    const existingUser = await pool.query('SELECT id FROM app_users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rowCount > 0) {
      throw new Error('Ese correo ya esta registrado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO app_users (name, email, password_hash, email_verified)
       VALUES ($1, $2, $3, false) RETURNING id, name, email`,
      [name, normalizedEmail, passwordHash],
    );

    const user = result.rows[0];

    await accessService.grantTrial(user.id);
    await sendVerificationEmailFor(user, baseUrl);

    return { ...attachAuthFlags(user), requiresVerification: true };
  } catch (error) {
    throw error;
  }
}

async function login(email, password) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    throw new Error('Debes completar correo y contrasena.');
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash, email_verified FROM app_users WHERE email = $1',
      [normalizedEmail],
    );
    if (result.rowCount === 0) {
      throw new Error('Credenciales invalidas.');
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new Error('Credenciales invalidas.');
    }

    if (!user.email_verified) {
      const error = new Error('Debes verificar tu correo antes de iniciar sesion.');
      error.code = 'EMAIL_NOT_VERIFIED';
      throw error;
    }

    return attachAuthFlags({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    throw error;
  }
}

async function resendVerification(email, baseUrl) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Debes indicar un correo.');
  }

  const result = await pool.query(
    'SELECT id, name, email, email_verified FROM app_users WHERE email = $1',
    [normalizedEmail],
  );

  // No revelamos si la cuenta existe o no, ni si ya estaba verificada —
  // misma respuesta generica siempre, para no filtrar informacion de cuentas.
  if (result.rowCount > 0 && !result.rows[0].email_verified) {
    await sendVerificationEmailFor(result.rows[0], baseUrl);
  }

  return { success: true };
}

async function changePassword(userId, currentPassword, newPassword) {
  const normalizedUserId = Number(userId);
  const current = String(currentPassword || '');
  const next = String(newPassword || '');

  if (!normalizedUserId) {
    throw new Error('Usuario invalido.');
  }

  if (!current || !next) {
    throw new Error('Debes completar la contraseña actual y la nueva contraseña.');
  }

  validatePasswordStrength(next);

  const result = await pool.query(
    'SELECT id, name, email, password_hash FROM app_users WHERE id = $1',
    [normalizedUserId],
  );

  if (result.rowCount === 0) {
    throw new Error('Cuenta no encontrada.');
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(current, user.password_hash);

  if (!isValid) {
    throw new Error('La contraseña actual es incorrecta.');
  }

  if (current === next) {
    throw new Error('La nueva contraseña debe ser diferente a la actual.');
  }

  const newHash = await bcrypt.hash(next, 10);
  await pool.query(
    'UPDATE app_users SET password_hash = $1 WHERE id = $2',
    [newHash, normalizedUserId],
  );

  await emailService.sendPasswordChangedEmail({ to: user.email, name: user.name });

  return {
    success: true,
  };
}

module.exports = {
  register,
  login,
  changePassword,
  validatePasswordStrength,
  resendVerification,
};
