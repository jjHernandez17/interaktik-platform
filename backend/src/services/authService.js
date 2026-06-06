const bcrypt = require('bcryptjs');
const pool = require('../database/pool');
const { normalizeEmail, normalizeError } = require('../utils/normalize');
const { attachAuthFlags } = require('../middleware/auth');

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

module.exports = {
  register,
  login,
};
