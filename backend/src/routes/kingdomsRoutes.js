// tiktokinteractik/backend/src/routes/kingdomsRoutes.js
//
// Batalla de Reinos: lectura y guardado de la configuracion y el marcador (sesion del navegador).

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const kingdomsService = require('../services/kingdomsService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

router.get('/kingdoms/state', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const state = await kingdomsService.loadKingdomsState(getSessionUserId(req));
    return res.json(state);
  } catch (error) {
    logger.error('Error cargando el estado de Batalla de Reinos', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/kingdoms/state', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const saved = await kingdomsService.saveKingdomsState(getSessionUserId(req), req.body || {});
    return res.json({ success: true, updated_at: saved.updated_at });
  } catch (error) {
    logger.error('Error guardando el estado de Batalla de Reinos', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
