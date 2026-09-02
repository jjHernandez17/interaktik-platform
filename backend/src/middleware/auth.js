const env = require('../config/env');
const logger = require('../config/logger');

const SUPER_USER_EMAIL = 'juanjohervar1708@gmail.com';

function isSuperUserEmail(email) {
  return String(email || '').trim().toLowerCase() === SUPER_USER_EMAIL;
}

function attachAuthFlags(user) {
  if (!user) {
    return user;
  }

  return {
    ...user,
    isSuperUser: isSuperUserEmail(user.email),
  };
}

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

function requireSuperUser(req, res, next) {
  if (!req.session?.user || !isSuperUserEmail(req.session.user.email)) {
    logger.warn(`Admin API denied for ${req.originalUrl} from ${req.headers.origin || 'no-origin'}`);
    return res.status(403).json({ error: 'No autorizado.' });
  }

  return next();
}

// Bloquea las APIs de juegos si el usuario no tiene un plan/prueba activos.
// El superusuario siempre pasa, igual que con requireEnabledGame.
async function requireActiveAccess(req, res, next) {
  if (isSuperUserEmail(req.session?.user?.email)) {
    return next();
  }

  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Debes iniciar sesion.' });
    }

    const accessService = require('../services/accessService');
    const hasAccess = await accessService.hasActiveAccess(userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Tu prueba gratuita o plan vencio. Adquiere un plan para seguir jugando.', code: 'ACCESS_EXPIRED' });
    }

    return next();
  } catch (error) {
    logger.error('Error verificando acceso activo', error);
    return res.status(500).json({ error: 'No se pudo verificar tu acceso.' });
  }
}

// Autenticacion por API key para clientes sin cookies de sesion (ej. el script
// de Roblox Studio consultando la cola de spawns via HttpService).
async function requireRobloxApiKey(req, res, next) {
  const apiKey = String(req.get('X-API-Key') || '').trim();
  if (!apiKey) {
    return res.status(401).json({ error: 'Falta la API key.' });
  }

  try {
    const pool = require('../database/pool');
    const result = await pool.query(
      'SELECT user_id FROM roblox_dance_config WHERE api_key = $1',
      [apiKey],
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'API key invalida.' });
    }

    const userId = result.rows[0].user_id;
    const accessService = require('../services/accessService');
    const hasAccess = await accessService.hasActiveAccess(userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    }

    req.robloxUserId = userId;
    return next();
  } catch (error) {
    logger.error('Error verificando API key de Roblox', error);
    return res.status(500).json({ error: 'No se pudo verificar la API key.' });
  }
}

module.exports = {
  requireAuth,
  requireAuthPage,
  requireGuestPage,
  getSessionUserId,
  requireSuperUser,
  requireActiveAccess,
  requireRobloxApiKey,
  isSuperUserEmail,
  attachAuthFlags,
};
