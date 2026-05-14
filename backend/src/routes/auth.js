const express = require('express');
const { requireAuth, getSessionUserId } = require('../middleware/auth');
const authService = require('../services/authService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

router.post('/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = req.body?.email;
    const password = String(req.body?.password || '');

    const user = await authService.register(name, email, password);

    req.session.user = user;
    req.session.userId = user.id;

    logger.success(`Usuario registrado exitosamente: ${user.email}, Session ID: ${req.session.id}`);
    return res.status(201).json({ user });
  } catch (error) {
    logger.error('Register error', error);
    return res.status(error.message.includes('ya esta') ? 409 : 400).json({ error: normalizeError(error) });
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const email = req.body?.email;
    const password = String(req.body?.password || '');

    const user = await authService.login(email, password);

    req.session.user = user;
    req.session.userId = user.id;

    return res.json({ user });
  } catch (error) {
    logger.error('Login error', error);
    return res.status(401).json({ error: normalizeError(error) });
  }
});

router.post('/auth/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ error: 'No se pudo cerrar la sesion.' });
    }

    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

router.get('/auth/me', (req, res) => {
  logger.info(`Auth check - Session exists: ${!!req.session}, User: ${!!req.session?.user}`);
  logger.info(`Auth check - Session ID: ${req.session?.id}`);
  logger.info(`Auth check - Origin: ${req.headers.origin}`);
  logger.info(`Auth check - Cookies: ${!!req.headers.cookie}`);

  if (!req.session.user) {
    logger.warn('Auth check failed - No user in session');
    return res.status(401).json({ error: 'No autenticado' });
  }

  logger.success(`Auth check successful - User: ${req.session.user.email}`);
  return res.json({ user: req.session.user });
});

module.exports = router;
