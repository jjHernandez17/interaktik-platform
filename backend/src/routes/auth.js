const express = require('express');
const { requireAuth, getSessionUserId } = require('../middleware/auth');
const authService = require('../services/authService');
const verificationService = require('../services/verificationService');
const { normalizeError } = require('../utils/normalize');
const env = require('../config/env');
const logger = require('../config/logger');

const router = express.Router();

// URL base de ESTE backend (no la del frontend) — el link de verificacion
// apunta a una ruta propia de este servidor, sin importar donde viva el
// frontend estatico.
function getOwnBaseUrl(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  return `${protocol}://${req.get('host')}`;
}

function getFrontendBaseUrl(req) {
  if (env.NODE_ENV === 'production') {
    return env.FRONTEND_URL;
  }
  return getOwnBaseUrl(req);
}

router.post('/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = req.body?.email;
    const password = String(req.body?.password || '');

    const user = await authService.register(name, email, password, getOwnBaseUrl(req));

    // No se crea sesion: la cuenta no puede usarse hasta verificar el correo.
    logger.success(`Usuario registrado (pendiente de verificacion): ${user.email}`);
    return res.status(201).json({ user, requiresVerification: true });
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
    const status = error.code === 'EMAIL_NOT_VERIFIED' ? 403 : 401;
    return res.status(status).json({ error: normalizeError(error), code: error.code || null });
  }
});

router.post('/auth/resend-verification', async (req, res) => {
  try {
    const email = req.body?.email;
    await authService.resendVerification(email, getOwnBaseUrl(req));
    return res.json({ success: true, message: 'Si la cuenta existe y no ha sido verificada, se envio un nuevo correo.' });
  } catch (error) {
    logger.error('Resend verification error', error);
    return res.status(400).json({ error: normalizeError(error) });
  }
});

// El usuario llega aqui haciendo click en el link del correo (navegacion
// completa, no fetch) — por eso responde con redirecciones, no JSON.
router.get('/auth/verify-email', async (req, res) => {
  const frontendBase = getFrontendBaseUrl(req);
  const token = req.query?.token;

  try {
    const result = await verificationService.consumeVerificationToken(token);

    if (!result.success) {
      logger.warn(`Verificacion de correo fallida: ${result.reason}`);
      return res.redirect(`${frontendBase}/login.html?verify=${result.reason}`);
    }

    logger.success(`Correo verificado: ${result.email}`);
    return res.redirect(`${frontendBase}/login.html?verify=success`);
  } catch (error) {
    logger.error('Verify email error', error);
    return res.redirect(`${frontendBase}/login.html?verify=error`);
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

  req.session.user = {
    ...req.session.user,
    isSuperUser: String(req.session.user.email || '').trim().toLowerCase() === 'juanjohervar1708@gmail.com',
  };

  logger.success(`Auth check successful - User: ${req.session.user.email}`);
  return res.json({ user: req.session.user });
});

router.put('/auth/password', requireAuth, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    await authService.changePassword(userId, currentPassword, newPassword);

    return res.json({ success: true });
  } catch (error) {
    logger.error('Change password error', error);
    return res.status(400).json({ error: normalizeError(error) });
  }
});

module.exports = router;
