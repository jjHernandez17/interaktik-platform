// tiktokinteractive/backend/src/routes/robloxDanceRoutes.js
//
// Rutas de Roblox Dance. Separadas de gameRoutes.js porque mezclan dos tipos
// de autenticacion: las de configuracion usan la sesion del navegador
// (requireAuth), pero la que consulta el script de Roblox Studio usa una API
// key (requireRobloxApiKey) porque ese cliente no tiene cookies.

const express = require('express');
const { requireAuth, requireActiveAccess, requireRobloxApiKey, getSessionUserId } = require('../middleware/auth');
const robloxDanceService = require('../services/robloxDanceService');
const { sanitizeJoinKeyword, sanitizeRobloxUsername, normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function toResponse(row) {
  return {
    joinKeyword: row.join_keyword,
    robloxUsername: row.roblox_username,
    apiKey: row.api_key,
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
    const robloxUsername = sanitizeRobloxUsername(req.body?.robloxUsername);

    const config = await robloxDanceService.updateConfig(userId, { joinKeyword, robloxUsername });
    return res.json(toResponse(config));
  } catch (error) {
    logger.error('Error guardando configuracion de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/roblox-dance/regenerate-key', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await robloxDanceService.regenerateApiKey(userId);
    return res.json(toResponse(config));
  } catch (error) {
    logger.error('Error regenerando API key de Roblox Dance', error);
    return res.status(400).json({ error: normalizeError(error) });
  }
});

router.post('/roblox-dance/test-spawn', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    await robloxDanceService.enqueueTestSpawn(userId);
    return res.json({ success: true });
  } catch (error) {
    const status = error.status || 500;
    if (status !== 400) {
      logger.error('Error enviando spawn de prueba', error);
    }
    return res.status(status).json({ error: normalizeError(error) });
  }
});

// Consultado por el script de Roblox Studio (HttpService, sin cookies).
router.get('/roblox-dance/queue', requireRobloxApiKey, async (req, res) => {
  try {
    const items = await robloxDanceService.pollQueue(req.robloxUserId);
    return res.json({ items });
  } catch (error) {
    logger.error('Error consultando cola de Roblox Dance', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
