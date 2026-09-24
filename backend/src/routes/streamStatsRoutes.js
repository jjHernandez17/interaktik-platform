// Rutas de solo lectura para el resumen post-stream (ver streamStatsTracker.js).

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const streamStatsTracker = require('../services/streamStatsTracker');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

router.get('/stream-stats', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const limit = Number(req.query?.limit) || 20;
    const sessions = await streamStatsTracker.getSessions(userId, limit);
    return res.json({ sessions });
  } catch (error) {
    logger.error('Error cargando el resumen de transmisiones', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
