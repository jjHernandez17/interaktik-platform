// tiktokinteractik/backend/src/routes/aiHostRoutes.js
//
// Rutas del Co-anfitrion IA (el juego donde un personaje animado es el centro del live). Todo usa la sesion del navegador
// (requireAuth); lo que dice el agente le llega a la pagina por /events?gameType=aihost.

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const aiHostService = require('../services/aiHostService');
const aiHostPrompt = require('../services/aiHostPrompt');
const aiHostCredit = require('../services/aiHostCredit');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function sendError(res, error, logMessage) {
  const status = error.status || 500;
  if (status >= 500) logger.error(logMessage, error);
  return res.status(status).json({ error: normalizeError(error) });
}

// El juego de IA solo lo usan los planes con tokens (Mensual y Anual). Prueba gratuita, pase de 2 dias y tiempo asignado a mano quedan
// bloqueados; tambien cuando se acaban los tokens.
async function requireAiAccess(req, res, next) {
  try {
    const entitlement = await aiHostCredit.getEntitlement(getSessionUserId(req));
    // Sin tokens se puede entrar a la pagina (para recargar); el agente sigue detenido hasta que haya tokens.
    if (!entitlement.allowed && entitlement.reason !== 'tokens') {
      return res.status(403).json({ error: entitlement.message, code: 'AI_LOCKED', reason: entitlement.reason });
    }
    return next();
  } catch (error) {
    return sendError(res, error, 'Error comprobando el acceso al Co-anfitrion IA');
  }
}

function catalogs() {
  return {
    tones: Object.keys(aiHostPrompt.TONES),
    languages: aiHostPrompt.LANGUAGES,
    models: Object.fromEntries(Object.entries(aiHostService.ALLOWED_MODELS).map(([id, info]) => [id, info.label])),
    characters: aiHostService.CHARACTERS,
    backgrounds: aiHostService.BACKGROUNDS,
    emotions: aiHostPrompt.EMOTIONS,
    actions: aiHostPrompt.ACTIONS,
  };
}

// Para la plataforma y la pagina: si puede entrar, cuantos tokens le quedan y por que no (si esta bloqueado)
router.get('/ai-host/entitlement', requireAuth, async (req, res) => {
  try {
    return res.json(await aiHostCredit.getEntitlement(getSessionUserId(req)));
  } catch (error) {
    return sendError(res, error, 'Error consultando el acceso al Co-anfitrion IA');
  }
});

router.get('/ai-host/config', requireAuth, requireActiveAccess, requireAiAccess, async (req, res) => {
  try {
    const config = await aiHostService.getOrCreateConfig(getSessionUserId(req));
    return res.json({ config, ...catalogs() });
  } catch (error) {
    return sendError(res, error, 'Error cargando la configuracion del Co-anfitrion IA');
  }
});

router.put('/ai-host/config', requireAuth, requireActiveAccess, requireAiAccess, async (req, res) => {
  try {
    const config = await aiHostService.updateConfig(getSessionUserId(req), req.body || {});
    return res.json({ config });
  } catch (error) {
    return sendError(res, error, 'Error guardando la configuracion del Co-anfitrion IA');
  }
});

router.get('/ai-host/status', requireAuth, requireActiveAccess, requireAiAccess, async (req, res) => {
  try {
    return res.json(await aiHostService.getStatus(getSessionUserId(req)));
  } catch (error) {
    return sendError(res, error, 'Error leyendo el estado del Co-anfitrion IA');
  }
});

router.post('/ai-host/test', requireAuth, requireActiveAccess, requireAiAccess, async (req, res) => {
  try {
    await aiHostService.injectTest(getSessionUserId(req), {
      kind: req.body?.kind,
      text: req.body?.text,
      nickname: req.body?.nickname,
      giftName: req.body?.giftName,
      coins: req.body?.coins,
    });
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error enviando una prueba al Co-anfitrion IA');
  }
});

router.post('/ai-host/reset-memory', requireAuth, requireActiveAccess, requireAiAccess, async (req, res) => {
  try {
    aiHostService.resetMemory(getSessionUserId(req));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error reiniciando la memoria del Co-anfitrion IA');
  }
});

module.exports = router;
