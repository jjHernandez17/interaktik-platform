// tiktokinteractik/backend/src/routes/gtaRoutes.js
//
// Rutas de GTA V interactivo. Todas usan la sesion del navegador (requireAuth): la aplicacion de
// Windows no usa HTTP, se conecta por WebSocket (gtaBridge.js) con la llave secreta del usuario.

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const gtaService = require('../services/gtaService');
const gtaBridge = require('../services/gtaBridge');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function toConfigResponse(row) {
  return {
    serverKey: row.server_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sendError(res, error, logMessage) {
  const status = error.status || 500;
  if (status >= 500) logger.error(logMessage, error);
  return res.status(status).json({ error: normalizeError(error) });
}

router.get('/gta/actions', requireAuth, requireActiveAccess, (req, res) => {
  return res.json(gtaService.listActions());
});

router.get('/gta/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await gtaService.getOrCreateConfig(getSessionUserId(req));
    return res.json(toConfigResponse(config));
  } catch (error) {
    return sendError(res, error, 'Error cargando configuracion de GTA V');
  }
});

// Estado de la aplicacion de Windows (y si detecta GTA V abierto)
router.get('/gta/status', requireAuth, requireActiveAccess, (req, res) => {
  return res.json({ app: gtaBridge.getStatus(getSessionUserId(req)) });
});

router.post('/gta/regenerate-key', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await gtaService.regenerateServerKey(getSessionUserId(req));
    return res.json(toConfigResponse(config));
  } catch (error) {
    return sendError(res, error, 'Error regenerando la llave de GTA V');
  }
});

router.get('/gta/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rules = await gtaService.listGiftRules(getSessionUserId(req));
    return res.json({ rules });
  } catch (error) {
    return sendError(res, error, 'Error listando reglas de GTA V');
  }
});

router.post('/gta/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rule = await gtaService.upsertGiftRule(getSessionUserId(req), {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      action: req.body?.action,
      amount: req.body?.amount,
    });
    return res.json({ rule });
  } catch (error) {
    return sendError(res, error, 'Error guardando regla de GTA V');
  }
});

router.delete('/gta/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await gtaService.deleteGiftRule(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error eliminando regla de GTA V');
  }
});

router.post('/gta/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await gtaService.enqueueTestAction(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando accion de GTA V');
  }
});

module.exports = router;
