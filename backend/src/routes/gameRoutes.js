// tiktokinteractive/backend/src/routes/gameRoutes.js

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const gameStateService = require('../services/gameStateService');
const dominanceService = require('../services/dominanceService');
const snakeService = require('../services/snakeService');
const raceService = require('../services/raceService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

// Game State (Contador)
router.get('/game-state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const state = await gameStateService.loadGameState(userId);
    return res.json(state);
  } catch (error) {
    logger.error('Error loading game state', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.put('/game-state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const saved = await gameStateService.saveGameState(userId, req.body || {});
    return res.json(saved);
  } catch (error) {
    logger.error('Error saving game state', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Snake vs Snake
router.get('/snake-vs-snake/state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const state = await snakeService.loadSnakeVsSnakeState(userId);
    return res.json(state);
  } catch (error) {
    logger.error('Error loading snake state', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.put('/snake-vs-snake/state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const saved = await snakeService.saveSnakeVsSnakeState(userId, req.body || {});
    return res.json(saved);
  } catch (error) {
    logger.error('Error saving snake state', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Race Game
router.get('/race/state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const state = await raceService.loadRaceGameState(userId);
    return res.json(state);
  } catch (error) {
    logger.error('Error loading race state', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/race/state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const saved = await raceService.saveRaceGameState(userId, req.body || {});
    return res.json({ success: true, updated_at: saved.updated_at });
  } catch (error) {
    logger.error('Error saving race state', error);
    return res.status(500).json({ error: normalizeError(error), details: error?.message });
  }
});

router.get('/dominance/state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const state = await dominanceService.loadDominanceState(userId);
    return res.json(state);
  } catch (error) {
    logger.error('Error loading dominance state', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/dominance/state', requireAuth, requireActiveAccess, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const saved = await dominanceService.saveDominanceState(userId, req.body || {});
    return res.json({ success: true, updated_at: saved.updated_at });
  } catch (error) {
    logger.error('Error saving dominance state', error);
    return res.status(500).json({ error: normalizeError(error), details: error?.message });
  }
});

router.get('/race/debug', requireAuth, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);

    const pool = require('../database/pool');
    const tableExistsResult = await pool.query(
      `SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'race_game_state') as table_exists`
    );

    const dataResult = await pool.query(
      `SELECT * FROM race_game_state WHERE user_id = $1`,
      [userId],
    );

    return res.json({
      table_exists: tableExistsResult.rows[0]?.table_exists || false,
      user_id: userId,
      data_found: dataResult.rowCount > 0,
      data: dataResult.rows[0] || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Race debug error', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
