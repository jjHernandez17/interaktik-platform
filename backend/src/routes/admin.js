const express = require('express');
const pool = require('../database/pool');
const { requireAuth, requireSuperUser } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();
const EDITABLE_GAME_TYPES = ['app', 'snake', 'race'];

function buildConnectionsMap(rows = []) {
  return rows.reduce((accumulator, row) => {
    accumulator[row.game_type] = {
      gameType: row.game_type,
      tiktokUsername: row.tiktok_username,
      isLinked: row.is_linked,
      linkedAt: row.linked_at,
    };
    return accumulator;
  }, {});
}

async function loadAdminUsers() {
  const usersResult = await pool.query(`
    SELECT id, name, email, created_at
    FROM app_users
    ORDER BY created_at DESC, id DESC
  `);

  const connectionsResult = await pool.query(`
    SELECT user_id, game_type, tiktok_username, is_linked, linked_at
    FROM user_tiktok_connections
    ORDER BY user_id ASC, game_type ASC
  `);

  const connectionsByUser = new Map();
  for (const connection of connectionsResult.rows) {
    if (!connectionsByUser.has(connection.user_id)) {
      connectionsByUser.set(connection.user_id, []);
    }

    connectionsByUser.get(connection.user_id).push(connection);
  }

  return usersResult.rows.map((user) => ({
    ...user,
    tiktokConnections: buildConnectionsMap(connectionsByUser.get(user.id) || []),
  }));
}

router.get('/admin/users', requireAuth, requireSuperUser, async (_req, res) => {
  try {
    const users = await loadAdminUsers();
    return res.json({ users, total: users.length });
  } catch (error) {
    logger.error('Admin users list error', error);
    return res.status(500).json({ error: 'No se pudo cargar la lista de cuentas.' });
  }
});

router.get('/admin/users/:id', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario invalido.' });
    }

    const users = await loadAdminUsers();
    const user = users.find((item) => item.id === userId);

    if (!user) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }

    return res.json({ user });
  } catch (error) {
    logger.error('Admin user detail error', error);
    return res.status(500).json({ error: 'No se pudo cargar la cuenta.' });
  }
});

router.put('/admin/users/:id', requireAuth, requireSuperUser, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = Number(req.params.id);
    const tiktokConnections = req.body?.tiktokConnections || {};

    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario invalido.' });
    }

    await client.query('BEGIN');

    const userResult = await client.query('SELECT id FROM app_users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }

    for (const gameType of EDITABLE_GAME_TYPES) {
      const username = String(tiktokConnections[gameType] || '').trim().replace(/^@/, '').slice(0, 120);

      if (!username) {
        await client.query(
          'DELETE FROM user_tiktok_connections WHERE user_id = $1 AND game_type = $2',
          [userId, gameType],
        );
        continue;
      }

      await client.query(
        `
          INSERT INTO user_tiktok_connections (user_id, game_type, tiktok_username, is_linked, linked_at, created_at, updated_at)
          VALUES ($1, $2, $3, true, NOW(), NOW(), NOW())
          ON CONFLICT (user_id, game_type)
          DO UPDATE SET tiktok_username = EXCLUDED.tiktok_username, is_linked = true, linked_at = NOW(), updated_at = NOW()
        `,
        [userId, gameType, username],
      );
    }

    await client.query('COMMIT');

    const users = await loadAdminUsers();
    const user = users.find((item) => item.id === userId);

    return res.json({ user });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Admin user update error', error);
    return res.status(500).json({ error: 'No se pudo actualizar la cuenta.' });
  } finally {
    client.release();
  }
});

router.delete('/admin/users/:id', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario invalido.' });
    }

    const deletedUserResult = await pool.query(
      'DELETE FROM app_users WHERE id = $1 RETURNING id, name, email',
      [userId],
    );

    if (deletedUserResult.rowCount === 0) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }

    await pool.query(
      `
        DELETE FROM user_sessions
        WHERE sess::text LIKE $1
           OR sess::text LIKE $2
           OR sess::text LIKE $3
      `,
      [
        `%"userId":${userId}%`,
        `%"id":${userId}%`,
        `%"user":{"id":${userId}%`,
      ],
    );

    return res.json({ success: true, deletedUser: deletedUserResult.rows[0] });
  } catch (error) {
    logger.error('Admin user delete error', error);
    return res.status(500).json({ error: 'No se pudo eliminar la cuenta.' });
  }
});

module.exports = router;
