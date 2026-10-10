// Referidos: resumen del usuario, canje de monedas por planes y herramientas del superusuario.

const express = require('express');
const { requireAuth, requireSuperUser, getSessionUserId } = require('../middleware/auth');
const { redeemLimiter, referralReadLimiter } = require('../middleware/rateLimit');
const { isOriginAllowed } = require('../config/cors');
const referralService = require('../services/referralService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

// Defensa contra CSRF para las rutas que cambian cosas. La cookie de sesion en produccion es SameSite=None y el
// servidor tambien acepta formularios normales, asi que otra pagina podria intentar mandar un POST con la sesion del
// usuario. Se corta de dos formas:
//  1) solo se acepta application/json (un formulario HTML no puede enviarlo, y un fetch cruzado exigiria un permiso
//     CORS que solo tienen nuestros dominios);
//  2) si el navegador declara un origen, tiene que ser uno de los nuestros.
function requireJsonBody(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Formato de solicitud no permitido.' });
  }
  return next();
}

function requireTrustedOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    if (!isOriginAllowed(origin)) {
      return res.status(403).json({ error: 'Origen no permitido.' });
    }
    return next();
  }

  // Sin Origin (curl, apps): un navegador de otro sitio siempre lo manda en un POST, asi que si dice "cross-site" se rechaza.
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'Origen no permitido.' });
  }
  return next();
}

function sendError(res, error, fallbackMessage) {
  const status = Number(error?.status) || 500;
  if (status >= 500) logger.error(fallbackMessage, error);
  return res.status(status).json({
    error: status >= 500 ? 'No se pudo completar la operacion. Intenta de nuevo.' : normalizeError(error),
    code: error?.code && typeof error.code === 'string' && !/^\d+$/.test(error.code) ? error.code : undefined,
  });
}

// Mi codigo, mis monedas, mis invitados
router.get('/referrals/me', requireAuth, referralReadLimiter, async (req, res) => {
  try {
    const overview = await referralService.getOverview(getSessionUserId(req));
    res.set('Cache-Control', 'no-store');
    return res.json(overview);
  } catch (error) {
    return sendError(res, error, 'Error cargando referidos');
  }
});

// Cambiar monedas por un plan para mi propia cuenta. Solo se acepta el plan y un identificador de la solicitud: el
// costo lo decide el servidor.
router.post('/referrals/redeem', requireAuth, requireJsonBody, requireTrustedOrigin, redeemLimiter, async (req, res) => {
  try {
    const result = await referralService.redeem(getSessionUserId(req), req.body?.planId, req.body?.requestId);
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'Error canjeando monedas de referidos');
  }
});

// ---------- superusuario ----------

router.get('/admin/referrals', requireAuth, requireSuperUser, async (_req, res) => {
  try {
    return res.json({ referrals: await referralService.listForAdmin() });
  } catch (error) {
    return sendError(res, error, 'Error listando referidos');
  }
});

// Revertir la recompensa de un referido (por ejemplo si su pago se reembolso o hubo un contracargo)
router.post('/admin/referrals/:id/revoke', requireAuth, requireSuperUser, requireJsonBody, requireTrustedOrigin, async (req, res) => {
  try {
    const result = await referralService.revokeReward(req.params.id, req.body?.note);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Error revirtiendo recompensa de referido');
  }
});

// Vuelve a revisar recompensas que no se dieron al confirmar un pago
router.post('/admin/referrals/reconcile', requireAuth, requireSuperUser, requireJsonBody, requireTrustedOrigin, async (_req, res) => {
  try {
    return res.json(await referralService.reconcilePendingRewards());
  } catch (error) {
    return sendError(res, error, 'Error corrigiendo recompensas de referidos');
  }
});

module.exports = router;
