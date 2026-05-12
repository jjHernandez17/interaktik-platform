const express = require('express');
const { requireAuth, getSessionUserId } = require('../middleware/auth');
const tiktokService = require('../services/tiktokService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

router.post('/tiktok-connection', requireAuth, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    const gameType = String(req.body?.gameType || '').trim();
    const tiktokUsername = String(req.body?.tiktokUsername || '').trim();

    if (!gameType || !tiktokUsername) {
      return res.status(400).json({ error: 'Debes proporcionar gameType y tiktokUsername.' });
    }

    const connection = await tiktokService.saveTiktokConnection(userId, gameType, tiktokUsername);
    return res.json({
      success: true,
      tiktok_username: connection.tiktok_username,
      is_linked: connection.is_linked,
      linked_at: connection.linked_at,
    });
  } catch (error) {
    logger.error('Error saving tiktok connection', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.get('/tiktok-connection/:gameType', requireAuth, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    const gameType = String(req.params.gameType || '').trim();

    if (!gameType) {
      return res.status(400).json({ error: 'Debes proporcionar gameType.' });
    }

    const connection = await tiktokService.getTiktokConnection(userId, gameType);

    if (!connection) {
      return res.json({ connected: false, tiktok_username: null });
    }

    return res.json({
      connected: connection.is_linked,
      tiktok_username: connection.tiktok_username,
      linked_at: connection.linked_at,
    });
  } catch (error) {
    logger.error('Error getting tiktok connection', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.delete('/tiktok-connection/:gameType', requireAuth, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    const gameType = String(req.params.gameType || '').trim();

    if (!gameType) {
      return res.status(400).json({ error: 'Debes proporcionar gameType.' });
    }

    await tiktokService.deleteTiktokConnection(userId, gameType);

    return res.json({
      success: true,
      message: 'Conexión eliminada.',
    });
  } catch (error) {
    logger.error('Error deleting tiktok connection', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
