// tiktokinteractik/backend/src/routes/robloxParkourRoutes.js
//
// Rutas de Roblox Parkour. Las de configuracion usan la sesion del navegador
// (requireAuth). Las que consulta el propio juego de Roblox (session,
// power-queue, reset) son publicas por diseno: se identifican con el ID de la
// cuenta de Roblox que abrio el juego, verificado contra la vinculacion
// guardada — no hay secreto que copiar.

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const robloxParkourService = require('../services/robloxParkourService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function toConfigResponse(row) {
  return {
    robloxUsername: row.roblox_username,
    robloxUserId: row.roblox_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sendError(res, error, logMessage) {
  const status = error.status || 500;
  if (status >= 500) logger.error(logMessage, error);
  return res.status(status).json({ error: normalizeError(error) });
}

router.get('/roblox-parkour/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await robloxParkourService.getOrCreateConfig(getSessionUserId(req));
    return res.json(toConfigResponse(config));
  } catch (error) {
    return sendError(res, error, 'Error cargando configuracion de Roblox Parkour');
  }
});

router.post('/roblox-parkour/link', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await robloxParkourService.linkRobloxAccount(getSessionUserId(req), req.body?.robloxUserId);
    return res.json(toConfigResponse(config));
  } catch (error) {
    return sendError(res, error, 'Error vinculando cuenta de Roblox (Parkour)');
  }
});

router.get('/roblox-parkour/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rules = await robloxParkourService.listGiftRules(getSessionUserId(req));
    return res.json({ rules });
  } catch (error) {
    return sendError(res, error, 'Error listando reglas de Roblox Parkour');
  }
});

router.post('/roblox-parkour/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rule = await robloxParkourService.upsertGiftRule(getSessionUserId(req), {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      power: req.body?.power,
      stairs: req.body?.stairs,
    });
    return res.json({ rule });
  } catch (error) {
    return sendError(res, error, 'Error guardando regla de Roblox Parkour');
  }
});

router.delete('/roblox-parkour/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxParkourService.deleteGiftRule(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error eliminando regla de Roblox Parkour');
  }
});

router.post('/roblox-parkour/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxParkourService.enqueueTestPower(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando poder de Roblox Parkour');
  }
});

// Consultado por el juego de Roblox al arrancar: confirma si esa cuenta de
// Roblox esta vinculada a un usuario con acceso activo.
router.get('/roblox-parkour/session', async (req, res) => {
  try {
    const { linked, hasAccess } = await robloxParkourService.resolveLinkedUser(req.query?.robloxUserId);
    return res.json({ linked, hasAccess, ready: linked && hasAccess });
  } catch (error) {
    return sendError(res, error, 'Error resolviendo sesion de Roblox Parkour');
  }
});

// Consultado en bucle por el juego de Roblox para traer los poderes
// activados por regalos (o por el boton "Probar").
router.get('/roblox-parkour/power-queue', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxParkourService.resolveLinkedUser(req.query?.robloxUserId);

    if (!linked) {
      return res.status(404).json({ error: 'Esa cuenta de Roblox no esta vinculada.' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    }

    const items = await robloxParkourService.pollPowerQueue(userId);
    return res.json({ items });
  } catch (error) {
    return sendError(res, error, 'Error consultando cola de poderes de Roblox Parkour');
  }
});

router.post('/roblox-parkour/reset', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxParkourService.resolveLinkedUser(req.query?.robloxUserId);

    if (!linked) {
      return res.status(404).json({ error: 'Esa cuenta de Roblox no esta vinculada.' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    }

    await robloxParkourService.resetGame(userId);
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error reiniciando Roblox Parkour');
  }
});

module.exports = router;
