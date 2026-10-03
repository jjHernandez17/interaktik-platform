// tiktokinteractik/backend/src/routes/minecraftRoutes.js
//
// Rutas de Minecraft interactivo. Las de configuracion usan la sesion del navegador
// (requireAuth). La que consulta el plugin del servidor de Minecraft (GET /minecraft/queue)
// es publica por diseno: se identifica con la llave secreta del usuario (server_key), que
// el streamer copia desde el panel al config.yml del plugin.

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const minecraftService = require('../services/minecraftService');
const minecraftBridge = require('../services/minecraftBridge');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function toConfigResponse(row) {
  return {
    serverKey: row.server_key,
    minecraftUsername: row.minecraft_username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sendError(res, error, logMessage) {
  const status = error.status || 500;
  if (status >= 500) logger.error(logMessage, error);
  return res.status(status).json({ error: normalizeError(error) });
}

router.get('/minecraft/actions', requireAuth, requireActiveAccess, (req, res) => {
  return res.json(minecraftService.listActions());
});

router.get('/minecraft/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await minecraftService.getOrCreateConfig(getSessionUserId(req));
    return res.json(toConfigResponse(config));
  } catch (error) {
    return sendError(res, error, 'Error cargando configuracion de Minecraft');
  }
});

// Estado de la conexion con Minecraft Java: por el mod (puente WebSocket) o por el plugin (servidor)
router.get('/minecraft/status', requireAuth, requireActiveAccess, (req, res) => {
  const userId = getSessionUserId(req);
  const bridge = minecraftBridge.getStatus(userId);
  const plugin = minecraftService.getPluginStatus(userId);

  return res.json({
    java: bridge.connected
      ? { connected: true, playerOnline: true, via: 'mod' }
      : { ...plugin, via: plugin.connected ? 'plugin' : null },
  });
});

router.post('/minecraft/username', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await minecraftService.setMinecraftUsername(getSessionUserId(req), req.body?.minecraftUsername);
    return res.json(toConfigResponse(config));
  } catch (error) {
    return sendError(res, error, 'Error guardando usuario de Minecraft');
  }
});

router.post('/minecraft/regenerate-key', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await minecraftService.regenerateServerKey(getSessionUserId(req));
    return res.json(toConfigResponse(config));
  } catch (error) {
    return sendError(res, error, 'Error regenerando la llave de Minecraft');
  }
});

router.get('/minecraft/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rules = await minecraftService.listGiftRules(getSessionUserId(req));
    return res.json({ rules });
  } catch (error) {
    return sendError(res, error, 'Error listando reglas de Minecraft');
  }
});

router.post('/minecraft/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rule = await minecraftService.upsertGiftRule(getSessionUserId(req), {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      action: req.body?.action,
      amount: req.body?.amount,
    });
    return res.json({ rule });
  } catch (error) {
    return sendError(res, error, 'Error guardando regla de Minecraft');
  }
});

router.delete('/minecraft/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await minecraftService.deleteGiftRule(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error eliminando regla de Minecraft');
  }
});

router.post('/minecraft/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await minecraftService.enqueueTestAction(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando accion de Minecraft');
  }
});

// Consultado en bucle por el plugin del servidor de Minecraft.
//   ?key=<server_key>&online=1|0
// online=1 -> el streamer esta dentro del servidor: se entregan (y se marcan como enviadas)
// las acciones pendientes. online=0 -> solo se devuelve el usuario de Minecraft configurado.
router.get('/minecraft/queue', async (req, res) => {
  try {
    const { found, hasAccess, userId, username } = await minecraftService.resolveByServerKey(req.query?.key);

    if (!found) {
      return res.status(404).json({ error: 'Llave no valida. Copia la llave desde el panel de Minecraft.' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    }

    const online = String(req.query?.online || '') === '1';
    minecraftService.notePluginPoll(userId, online);
    const items = await minecraftService.pollActionQueue(userId, { online });
    return res.json({ player: username, items });
  } catch (error) {
    return sendError(res, error, 'Error consultando cola de Minecraft');
  }
});

module.exports = router;
