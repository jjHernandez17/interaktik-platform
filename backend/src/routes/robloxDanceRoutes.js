// tiktokinteractik/backend/src/routes/robloxDanceRoutes.js
//
// Rutas de Roblox Dance. Las de configuracion usan la sesion del navegador
// (requireAuth). Las que consulta el propio juego de Roblox (session, queue)
// son publicas por diseno: se identifican con el ID de Roblox de la cuenta
// que abrio el juego, verificado contra la vinculacion guardada — no hay
// secreto que copiar, y lo unico que exponen es si esa cuenta esta vinculada
// y su cola de spawns (sin escritura posible desde ahi).

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const robloxDanceService = require('../services/robloxDanceService');
const { sanitizeJoinKeyword, normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function toResponse(row) {
  return {
    joinKeyword: row.join_keyword,
    robloxUsername: row.roblox_username,
    robloxUserId: row.roblox_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/roblox-dance/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await robloxDanceService.getOrCreateConfig(userId);
    return res.json(toResponse(config));
  } catch (error) {
    logger.error('Error cargando configuracion de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.put('/roblox-dance/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const joinKeyword = sanitizeJoinKeyword(req.body?.joinKeyword);

    const config = await robloxDanceService.updateJoinKeyword(userId, joinKeyword);
    return res.json(toResponse(config));
  } catch (error) {
    logger.error('Error guardando configuracion de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/roblox-dance/link', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await robloxDanceService.linkRobloxAccount(userId, req.body?.robloxUserId);
    return res.json(toResponse(config));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      logger.error('Error vinculando cuenta de Roblox', error);
    }
    return res.status(status).json({ error: normalizeError(error) });
  }
});

router.post('/roblox-dance/test-spawn', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    await robloxDanceService.enqueueTestSpawn(userId);
    return res.json({ success: true });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      logger.error('Error enviando spawn de prueba', error);
    }
    return res.status(status).json({ error: normalizeError(error) });
  }
});

// Consultado por el propio juego de Roblox (servidor o cliente) antes de
// dejar entrar a jugar: confirma si esa cuenta de Roblox esta vinculada a
// un usuario con acceso activo en la plataforma.
router.get('/roblox-dance/session', async (req, res) => {
  try {
    const { linked, hasAccess } = await robloxDanceService.resolveLinkedUser(req.query?.robloxUserId);
    return res.json({ linked, hasAccess, ready: linked && hasAccess });
  } catch (error) {
    logger.error('Error resolviendo sesion de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.get('/roblox-dance/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const rules = await robloxDanceService.listGiftRules(userId);
    return res.json({ rules });
  } catch (error) {
    logger.error('Error listando reglas de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/roblox-dance/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const rule = await robloxDanceService.upsertGiftRule(userId, {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      power: req.body?.power,
      durationSeconds: req.body?.durationSeconds,
    });
    return res.json({ rule });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      logger.error('Error guardando regla de Roblox Dance', error);
    }
    return res.status(status).json({ error: normalizeError(error) });
  }
});

router.delete('/roblox-dance/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    await robloxDanceService.deleteGiftRule(userId, Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    logger.error('Error eliminando regla de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/roblox-dance/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    await robloxDanceService.enqueueTestPower(userId, Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      logger.error('Error probando poder de Roblox Dance', error);
    }
    return res.status(status).json({ error: normalizeError(error) });
  }
});

// Consultado en bucle por el script de Roblox Studio para traer los poderes
// activados por regalos (o por el boton de prueba).
router.get('/roblox-dance/power-queue', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxDanceService.resolveLinkedUser(req.query?.robloxUserId);

    if (!linked) {
      return res.status(404).json({ error: 'Esa cuenta de Roblox no esta vinculada.' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    }

    const items = await robloxDanceService.pollPowerQueue(userId);
    return res.json({ items });
  } catch (error) {
    logger.error('Error consultando cola de poderes de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Consultado por el script de Roblox Studio para llenar la valla con el
// top de espectadores que mas monedas han mandado en regalos.
router.get('/roblox-dance/leaderboard', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxDanceService.resolveLinkedUser(req.query?.robloxUserId);

    if (!linked || !hasAccess) {
      return res.json({ items: [] });
    }

    const items = await robloxDanceService.getTopGifters(userId, 3);
    return res.json({ items });
  } catch (error) {
    logger.error('Error consultando leaderboard de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Consultado en bucle por el script de Roblox Studio para traer las
// solicitudes de spawn pendientes.
router.get('/roblox-dance/queue', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxDanceService.resolveLinkedUser(req.query?.robloxUserId);

    if (!linked) {
      return res.status(404).json({ error: 'Esa cuenta de Roblox no esta vinculada.' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    }

    const items = await robloxDanceService.pollQueue(userId);
    return res.json({ items });
  } catch (error) {
    logger.error('Error consultando cola de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Consultado por el script de Roblox Studio cuando el streamer da "Reiniciar
// juego" en el menu del juego: limpia el estado efimero de la partida
// (players en cola, poderes pendientes, total de monedas de la valla).
router.post('/roblox-dance/reset', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxDanceService.resolveLinkedUser(req.query?.robloxUserId);

    if (!linked) {
      return res.status(404).json({ error: 'Esa cuenta de Roblox no esta vinculada.' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    }

    await robloxDanceService.resetGame(userId);
    return res.json({ success: true });
  } catch (error) {
    logger.error('Error reiniciando el juego de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
