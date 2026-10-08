// tiktokinteractik/backend/src/routes/gtaRampRoutes.js
//
// Rutas de GTA V "Rampa Imposible". Usan la sesion del navegador (requireAuth); el mod se conecta por
// WebSocket (gtaRampBridge.js) con la llave del usuario.

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const rampService = require('../services/gtaRampService');
const rampBridge = require('../services/gtaRampBridge');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function sendError(res, error, logMessage) {
  const status = error.status || 500;
  if (status >= 500) logger.error(logMessage, error);
  return res.status(status).json({ error: normalizeError(error) });
}

router.get('/gtaramp/actions', requireAuth, requireActiveAccess, (req, res) => res.json(rampService.listActions()));

router.get('/gtaramp/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const [config, settings] = await Promise.all([rampService.getOrCreateConfig(userId), rampService.getSettings(userId)]);
    return res.json({ serverKey: config.server_key, settings, maxWins: rampService.MAX_WINS });
  } catch (error) {
    return sendError(res, error, 'Error cargando configuracion de Rampa');
  }
});

// Estado del mod: conectado, si GTA V esta abierto y si hay una partida en marcha. Tambien los wins actuales.
router.get('/gtaramp/status', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const settings = await rampService.getSettings(userId);
    return res.json({ app: rampBridge.getStatus(userId), settings });
  } catch (error) {
    return sendError(res, error, 'Error cargando el estado de Rampa');
  }
});

router.post('/gtaramp/regenerate-key', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await rampService.regenerateServerKey(getSessionUserId(req));
    return res.json({ serverKey: config.server_key });
  } catch (error) {
    return sendError(res, error, 'Error regenerando la llave de GTA V');
  }
});

// Objetivo de wins y wins actuales (ambos admiten negativos)
router.post('/gtaramp/settings', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const settings = await rampService.saveSettings(getSessionUserId(req), { goal: req.body?.goal, wins: req.body?.wins });
    return res.json({ settings });
  } catch (error) {
    return sendError(res, error, 'Error guardando el marcador de Rampa');
  }
});

// Ordenes al mod: start | stop | reset
router.post('/gtaramp/control', requireAuth, requireActiveAccess, (req, res) => {
  const cmd = String(req.body?.cmd || '');
  if (!['start', 'stop', 'reset'].includes(cmd)) return res.status(400).json({ error: 'Orden no válida.' });
  const sent = rampBridge.sendCommand(getSessionUserId(req), cmd);
  if (!sent) {
    return res.status(409).json({ error: 'El mod no está conectado. Abre GTA V en modo historia con el mod de Rampa instalado (el instalador de Interaktik lo deja listo).' });
  }
  return res.json({ success: true });
});

router.get('/gtaramp/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    return res.json({ rules: await rampService.listGiftRules(getSessionUserId(req)) });
  } catch (error) {
    return sendError(res, error, 'Error listando reglas de Rampa');
  }
});

router.post('/gtaramp/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rule = await rampService.upsertGiftRule(getSessionUserId(req), {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      action: req.body?.action,
      amount: req.body?.amount,
    });
    return res.json({ rule });
  } catch (error) {
    return sendError(res, error, 'Error guardando regla de Rampa');
  }
});

router.delete('/gtaramp/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await rampService.deleteGiftRule(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error eliminando regla de Rampa');
  }
});

router.post('/gtaramp/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await rampService.enqueueTestAction(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando accion de Rampa');
  }
});

module.exports = router;
