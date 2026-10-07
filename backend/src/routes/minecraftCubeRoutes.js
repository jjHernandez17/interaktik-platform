// Rutas del Cubo Gigante de Minecraft (configuracion, reglas y botones de control del cubo).
// Comparte la llave y el puente WebSocket con Minecraft (minecraftService / minecraftBridge).

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const minecraftService = require('../services/minecraftService');
const minecraftBridge = require('../services/minecraftBridge');
const cubeService = require('../services/minecraftCubeService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function sendError(res, error, logMessage) {
  const status = error.status || 500;
  if (status >= 500) logger.error(logMessage, error);
  return res.status(status).json({ error: normalizeError(error) });
}

router.get('/minecraft-cube/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const [config, settings] = await Promise.all([
      minecraftService.getOrCreateConfig(userId),
      cubeService.getSettings(userId),
    ]);
    return res.json({
      serverKey: config.server_key,
      settings,
      limits: { maxSide: cubeService.MAX_SIDE, minSides: cubeService.MIN_SIDES, maxCountdown: cubeService.MAX_COUNTDOWN, maxWins: cubeService.MAX_WINS, maxBlocks: cubeService.MAX_BLOCKS, maxRuleBlocks: cubeService.MAX_RULE_BLOCKS },
      blockChoices: cubeService.BLOCK_CHOICES,
      powers: cubeService.POWERS,
    });
  } catch (error) {
    return sendError(res, error, 'Error cargando configuracion del Cubo Gigante');
  }
});

router.get('/minecraft-cube/status', requireAuth, requireActiveAccess, (req, res) => {
  const bridge = minecraftBridge.getStatus(getSessionUserId(req));
  return res.json({ connected: Boolean(bridge.connected) });
});

router.post('/minecraft-cube/settings', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const settings = await cubeService.saveSettings(getSessionUserId(req), req.body || {});
    return res.json({ settings });
  } catch (error) {
    return sendError(res, error, 'Error guardando medidas del cubo');
  }
});

// Botones: apply | start | restart | stop. Guarda las medidas recibidas y manda los comandos al juego.
router.post('/minecraft-cube/control', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const kind = String(req.body?.action || '');
    const keepSaved = kind === 'stop' || kind === 'restart' || kind === 'wins';
    const settings = keepSaved
      ? await cubeService.getSettings(userId)
      : await cubeService.saveSettings(userId, req.body || {});
    if (kind === 'wins') settings.winsNow = req.body?.winsNow;

    const commands = cubeService.commandsFor(kind, settings);
    const sent = await minecraftBridge.sendCommands(userId, commands);
    if (!sent) {
      return res.status(409).json({ error: 'Tu Minecraft no está conectado. Abre el juego y entra a tu mundo (el instalador deja todo listo).' });
    }
    return res.json({ success: true, settings });
  } catch (error) {
    return sendError(res, error, 'Error controlando el Cubo Gigante');
  }
});

router.get('/minecraft-cube/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    return res.json({ rules: await cubeService.listRules(getSessionUserId(req)) });
  } catch (error) {
    return sendError(res, error, 'Error listando reglas del Cubo Gigante');
  }
});

router.post('/minecraft-cube/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rule = await cubeService.upsertRule(getSessionUserId(req), {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      power: req.body?.power,
      amount: req.body?.amount,
      blocks: req.body?.blocks,
    });
    return res.json({ rule });
  } catch (error) {
    return sendError(res, error, 'Error guardando regla del Cubo Gigante');
  }
});

router.delete('/minecraft-cube/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await cubeService.deleteRule(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error eliminando regla del Cubo Gigante');
  }
});

router.post('/minecraft-cube/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await cubeService.enqueueTest(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando regla del Cubo Gigante');
  }
});

module.exports = router;
