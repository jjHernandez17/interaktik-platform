const env = require('../config/env');
const logger = require('../config/logger');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    logger.warn(`Auth API denied for ${req.originalUrl} from ${req.headers.origin || 'no-origin'}`);
    return res.status(401).json({ error: 'Debes iniciar sesion.' });
  }

  logger.success(`Auth API granted for ${req.session.user.email} on ${req.originalUrl}`);
  return next();
}

function requireAuthPage(req, res, next) {
  if (!req.session.user) {
    const redirectTarget = env.NODE_ENV === 'production'
      ? `${env.FRONTEND_URL}/login.html`
      : '/login.html';

    logger.warn(`Auth page denied for ${req.originalUrl}; redirecting to ${redirectTarget}`);
    return res.redirect(redirectTarget);
  }

  logger.success(`Auth page granted for ${req.session.user.email} on ${req.originalUrl}`);
  return next();
}

function requireGuestPage(req, res, next) {
  if (req.session.user) {
    const redirectTarget = env.NODE_ENV === 'production'
      ? `${env.FRONTEND_URL}/platform.html`
      : '/platform.html';

    logger.info(`Guest page blocked for ${req.originalUrl}; redirecting to ${redirectTarget}`);
    return res.redirect(redirectTarget);
  }

  logger.info(`Guest page granted for ${req.originalUrl}`);
  return next();
}

function getSessionUserId(req) {
  return Number(req.session?.userId || req.session?.user?.id || 0) || null;
}

module.exports = {
  requireAuth,
  requireAuthPage,
  requireGuestPage,
  getSessionUserId,
};
