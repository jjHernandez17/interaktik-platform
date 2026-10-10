const express = require('express');
const pool = require('../database/pool');
const { requireAuth, requireSuperUser } = require('../middleware/auth');
const plansService = require('../services/plansService');
const accessService = require('../services/accessService');
const currencyService = require('../services/currencyService');
const env = require('../config/env');
const logger = require('../config/logger');

const router = express.Router();
const EDITABLE_GAME_TYPES = ['app', 'snake', 'race', 'dominance', 'roblox', 'robloxparkour', 'robloxfighters', 'minecraft', 'minecraftcubo', 'gta', 'gtarampa', 'kingdoms', 'shellgame', 'boyvsgirl'];

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
    SELECT id, name, email, created_at, email_verified, email_verified_at
    FROM app_users
    ORDER BY created_at DESC, id DESC
  `);

  const connectionsResult = await pool.query(`
    SELECT user_id, game_type, tiktok_username, is_linked, linked_at
    FROM user_tiktok_connections
    ORDER BY user_id ASC, game_type ASC
  `);

  const accessResult = await pool.query(`
    SELECT user_id, access_expires_at, is_trial
    FROM user_access
  `);

  // Ultimo pago pagado de cada usuario (para mostrar plan actual/mas reciente).
  const lastPaymentResult = await pool.query(`
    SELECT DISTINCT ON (p.user_id)
      p.user_id, p.gateway, p.amount_cents, p.currency, p.paid_at, pl.name AS plan_name
    FROM payments p
    JOIN plans pl ON pl.id = p.plan_id
    WHERE p.status = 'paid'
    ORDER BY p.user_id, p.paid_at DESC
  `);

  const paymentCountsResult = await pool.query(`
    SELECT user_id, COUNT(*)::int AS paid_count
    FROM payments
    WHERE status = 'paid'
    GROUP BY user_id
  `);

  const connectionsByUser = new Map();
  for (const connection of connectionsResult.rows) {
    if (!connectionsByUser.has(connection.user_id)) {
      connectionsByUser.set(connection.user_id, []);
    }

    connectionsByUser.get(connection.user_id).push(connection);
  }

  const accessByUser = new Map(accessResult.rows.map((row) => [row.user_id, row]));
  const lastPaymentByUser = new Map(lastPaymentResult.rows.map((row) => [row.user_id, row]));
  const paidCountByUser = new Map(paymentCountsResult.rows.map((row) => [row.user_id, row.paid_count]));

  return usersResult.rows.map((user) => {
    const access = accessByUser.get(user.id) || null;
    const expiresAt = access?.access_expires_at ? new Date(access.access_expires_at) : null;
    const hasAccess = Boolean(expiresAt && expiresAt.getTime() > Date.now());

    return {
      ...user,
      tiktokConnections: buildConnectionsMap(connectionsByUser.get(user.id) || []),
      access: {
        hasAccess,
        isTrial: Boolean(access?.is_trial),
        accessExpiresAt: access?.access_expires_at || null,
      },
      lastPayment: lastPaymentByUser.get(user.id) || null,
      paidPaymentsCount: paidCountByUser.get(user.id) || 0,
    };
  });
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

router.get('/games/availability', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT game_type, is_enabled, updated_at
      FROM game_availability
      ORDER BY game_type ASC
    `);

    return res.json({
      games: result.rows.reduce((accumulator, row) => {
        accumulator[row.game_type] = {
          gameType: row.game_type,
          isEnabled: row.is_enabled,
          updatedAt: row.updated_at,
        };
        return accumulator;
      }, {}),
    });
  } catch (error) {
    logger.error('Game availability list error', error);
    return res.status(500).json({ error: 'No se pudo cargar la disponibilidad de juegos.' });
  }
});

router.put('/admin/games/:gameType/availability', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const gameType = String(req.params.gameType || '').trim();
    const isEnabled = Boolean(req.body?.isEnabled);

    if (!EDITABLE_GAME_TYPES.includes(gameType)) {
      return res.status(400).json({ error: 'Juego invalido.' });
    }

    const result = await pool.query(
      `
        INSERT INTO game_availability (game_type, is_enabled, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (game_type)
        DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = NOW()
        RETURNING game_type, is_enabled, updated_at
      `,
      [gameType, isEnabled],
    );

    return res.json({ game: result.rows[0] });
  } catch (error) {
    logger.error('Game availability update error', error);
    return res.status(500).json({ error: 'No se pudo actualizar el juego.' });
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

// PUT /api/admin/users/:id/access - agrega dias/horas al plan de un usuario
// (suma a partir de lo que le quedaba, igual que una compra real).
router.put('/admin/users/:id/access', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario invalido.' });
    }

    const days = Number(req.body?.days) || 0;
    const hours = Number(req.body?.hours) || 0;

    if (days < 0 || hours < 0) {
      return res.status(400).json({ error: 'Los valores no pueden ser negativos.' });
    }

    await accessService.adminAddAccessTime(userId, { days, hours });

    const users = await loadAdminUsers();
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }

    return res.json({ user });
  } catch (error) {
    logger.error('Admin add access time error', error);
    return res.status(400).json({ error: error.message || 'No se pudo agregar tiempo al plan.' });
  }
});

// PATCH /api/admin/users/:id/access - quita dias/horas puntuales del plan de
// un usuario (nunca deja el vencimiento en el pasado, ver adminSubtractAccessTime).
router.patch('/admin/users/:id/access', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario invalido.' });
    }

    const days = Number(req.body?.days) || 0;
    const hours = Number(req.body?.hours) || 0;

    if (days < 0 || hours < 0) {
      return res.status(400).json({ error: 'Los valores no pueden ser negativos.' });
    }

    await accessService.adminSubtractAccessTime(userId, { days, hours });

    const users = await loadAdminUsers();
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }

    return res.json({ user });
  } catch (error) {
    logger.error('Admin subtract access time error', error);
    return res.status(400).json({ error: error.message || 'No se pudo quitar tiempo del plan.' });
  }
});

// DELETE /api/admin/users/:id/access - quita el plan/acceso del usuario.
router.delete('/admin/users/:id/access', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario invalido.' });
    }

    await accessService.adminRevokeAccess(userId);

    const users = await loadAdminUsers();
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }

    return res.json({ user });
  } catch (error) {
    logger.error('Admin revoke access error', error);
    return res.status(500).json({ error: 'No se pudo quitar el plan.' });
  }
});

// GET /api/admin/plans - lista completa de planes (activos o no) con los
// precios crudos en centavos, para el editor de precios del admin.
router.get('/admin/plans', requireAuth, requireSuperUser, async (_req, res) => {
  try {
    const plans = await plansService.listAllPlansForAdmin();
    const plansWithEstimates = await Promise.all(plans.map(async (plan) => {
      const wompiEstimateCop = await currencyService.convertUsdCentsToDisplay(plan.price_usd_cents, 'COP');
      return { ...plan, wompiEstimateCop };
    }));

    return res.json({
      plans: plansWithEstimates,
      minimums: {
        wompiCop: env.WOMPI_MIN_AMOUNT_COP,
        mercadopagoCop: env.MERCADOPAGO_MIN_AMOUNT_COP,
      },
    });
  } catch (error) {
    logger.error('Admin plans list error', error);
    return res.status(500).json({ error: 'No se pudo cargar la lista de planes.' });
  }
});

// PUT /api/admin/plans/:id/price - actualiza el precio real de un plan.
// El admin SOLO digita en USD. Lo que se le cobra al usuario en cada
// pasarela (COP via Wompi, la moneda de la cuenta via MercadoPago) se
// convierte en vivo al momento de pagar — ver checkout en payments.js. Aca
// se valida con la tasa de HOY, como resguardo: si el dolar se mueve mucho
// despues, un precio que hoy pasa el minimo podria dejar de pasarlo manana;
// no es una garantia permanente, conviene revisar los precios de vez en
// cuando.
router.put('/admin/plans/:id/price', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const planId = String(req.params.id || '');
    const priceUsdCents = Math.round(Number(req.body?.priceUsdCents));

    if (!planId) {
      return res.status(400).json({ error: 'Plan invalido.' });
    }
    if (!Number.isFinite(priceUsdCents) || priceUsdCents <= 0) {
      return res.status(400).json({ error: 'Precio en USD invalido.' });
    }

    const wompiConverted = await currencyService.convertUsdCentsToDisplay(priceUsdCents, 'COP');
    const wompiConvertedCents = Math.round(wompiConverted.amount * 100);
    const wompiMinCents = env.WOMPI_MIN_AMOUNT_COP * 100;
    if (wompiConvertedCents < wompiMinCents) {
      return res.status(400).json({
        error: `Con la tasa de cambio de hoy, ese precio en USD equivale a menos del minimo de Wompi ($${env.WOMPI_MIN_AMOUNT_COP} COP). Sube el precio en USD.`,
      });
    }

    const mpCurrency = String(env.MERCADOPAGO_CURRENCY || 'USD').toUpperCase();
    if (mpCurrency === 'COP') {
      // Ya convertimos arriba para Wompi y MercadoPago cobra en la misma
      // moneda (COP) en esta cuenta — reusamos el mismo numero.
      const mercadopagoMinCents = env.MERCADOPAGO_MIN_AMOUNT_COP * 100;
      if (wompiConvertedCents < mercadopagoMinCents) {
        return res.status(400).json({
          error: `Con la tasa de cambio de hoy, ese precio en USD equivale a menos del minimo de MercadoPago ($${env.MERCADOPAGO_MIN_AMOUNT_COP} COP). Sube el precio en USD.`,
        });
      }
    }

    const plan = await plansService.updatePlanPrice(planId, { priceUsdCents });
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    return res.json({ plan });
  } catch (error) {
    logger.error('Admin plan price update error', error);
    return res.status(500).json({ error: 'No se pudo actualizar el precio del plan.' });
  }
});

module.exports = router;
