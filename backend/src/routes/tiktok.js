const express = require('express');
const { requireAuth, getSessionUserId } = require('../middleware/auth');
const tiktokService = require('../services/tiktokService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

async function getConnectionByGameType(req, res, gameType) {
  const userId = getSessionUserId(req);

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
}

async function deleteConnectionByGameType(req, res, gameType) {
  const userId = getSessionUserId(req);

  if (!gameType) {
    return res.status(400).json({ error: 'Debes proporcionar gameType.' });
  }

  await tiktokService.deleteTiktokConnection(userId, gameType);

  return res.json({
    success: true,
    message: 'Conexión eliminada.',
  });
}

router.get('/status', async (req, res) => {
  try {
    const status = await tiktokService.getStatus(req.session?.user?.id || null);
    logger.info(`API status request from ${req.headers.origin || 'no-origin'}`);

    return res.json({
      ...status,
      timestamp: new Date().toISOString(),
      sessionUser: req.session?.user ? {
        id: req.session.user.id,
        email: req.session.user.email,
        name: req.session.user.name,
      } : null,
    });
  } catch (error) {
    logger.error('Error getting API status', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.get('/gifts', async (req, res) => {
  try {
    const catalog = await tiktokService.getGiftCatalog();
    logger.info(`API gifts request served (${catalog.total} gifts)`);

    return res.json({
      gifts: catalog.gifts,
      total: catalog.total,
      source: catalog.source,
      updated_at: catalog.updated_at,
    });
  } catch (error) {
    logger.error('Error getting gifts catalog', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/catalog', async (req, res) => {
  try {
    const uniqueId = String(req.body?.uniqueId || '').trim().replace(/^@/, '');
    const catalog = await tiktokService.getGiftCatalog();

    logger.info(`API catalog request for @${uniqueId || 'unknown'} served (${catalog.total} gifts)`);

    return res.json({
      uniqueId,
      gifts: catalog.gifts,
      total: catalog.total,
      fromCache: true,
      warning: 'Se devolvió el catálogo desde cache local en producción.',
    });
  } catch (error) {
    logger.error('Error getting catalog', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.get('/tiktok-connection/app', requireAuth, async (req, res, next) => {
  try {
    return getConnectionByGameType(req, res, 'app');
  } catch (error) {
    logger.error('Error getting app tiktok connection', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.delete('/tiktok-connection/app', requireAuth, async (req, res, next) => {
  try {
    return deleteConnectionByGameType(req, res, 'app');
  } catch (error) {
    logger.error('Error deleting app tiktok connection', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

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
    const gameType = String(req.params.gameType || '').trim();
    return getConnectionByGameType(req, res, gameType);
  } catch (error) {
    logger.error('Error getting tiktok connection', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.delete('/tiktok-connection/:gameType', requireAuth, async (req, res, next) => {
  try {
    const gameType = String(req.params.gameType || '').trim();
    return deleteConnectionByGameType(req, res, gameType);
  } catch (error) {
    logger.error('Error deleting tiktok connection', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
