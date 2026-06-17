const bcrypt = require('bcryptjs');
const pool = require('../database/pool');
const { normalizeEmail, normalizeError } = require('../utils/normalize');
const { attachAuthFlags } = require('../middleware/auth');

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length <= 5) {
    throw new Error('La contraseña debe tener mas de 5 caracteres.');
  }

  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error('La contraseña debe incluir al menos una letra, un numero y un caracter especial.');
  }
}

async function register(name, email, password) {
  const normalizedEmail = normalizeEmail(email);

  if (!name || !normalizedEmail || password.length < 6) {
    throw new Error('Debes completar nombre, correo y contrasena (minimo 6 caracteres).');
  }

  try {
    const existingUser = await pool.query('SELECT id FROM app_users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rowCount > 0) {
      throw new Error('Ese correo ya esta registrado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO app_users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, normalizedEmail, passwordHash],
    );

    return attachAuthFlags(result.rows[0]);
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
    const result = await pool.query('SELECT id, name, email, password_hash FROM app_users WHERE email = $1', [normalizedEmail]);
    if (result.rowCount === 0) {
      throw new Error('Credenciales invalidas.');
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new Error('Credenciales invalidas.');
    }

    return attachAuthFlags({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    throw error;
  }
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
    'SELECT id, password_hash FROM app_users WHERE id = $1',
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

  return {
    success: true,
  };
}

module.exports = {
  register,
  login,
  changePassword,
  validatePasswordStrength,
};
