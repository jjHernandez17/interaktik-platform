// tiktokinteractik/backend/src/routes/aiHostRoutes.js
//
// Rutas del Co-anfitrion IA (el juego donde un personaje animado es el centro del live). Todo usa la sesion del navegador
// (requireAuth); lo que dice el agente le llega a la pagina por /events?gameType=aihost.

const express = require('express');
const { requireAuth, requireActiveAccess, requireSuperUser, getSessionUserId } = require('../middleware/auth');
const aiHostService = require('../services/aiHostService');
const aiHostPrompt = require('../services/aiHostPrompt');
const aiHostCredit = require('../services/aiHostCredit');
const aiHostVoice = require('../services/aiHostVoice');
const aiHostEstimate = require('../services/aiHostEstimate');
const giftImageProxy = require('../services/giftImageProxy');
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
    characterDefaults: aiHostService.characterDefaultsMap(),
    emotions: aiHostPrompt.EMOTIONS,
    actions: aiHostPrompt.ACTIONS,
  };
}

// Si la voz realista (IA) esta disponible en el servidor (clave de ElevenLabs y voz del personaje). La pagina lo consulta al elegir ese tipo de voz.
router.get('/ai-host/voice', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const config = await aiHostService.getOrCreateConfig(getSessionUserId(req));
    return res.json({ available: aiHostVoice.isConfigured(config.character) });
  } catch (error) {
    return sendError(res, error, 'Error consultando la voz con IA');
  }
});

// Voz realista (IA). Cuesta tokens del usuario (estimados por caracteres); si no hay clave, tokens o falla el servicio, la pagina
// usa la "voz sin costo" del navegador. El personaje sale de la configuracion guardada, no de lo que mande el navegador.
router.post('/ai-host/speak', requireAuth, requireActiveAccess, requireAiAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await aiHostService.getOrCreateConfig(userId);
    if (!aiHostVoice.isConfigured(config.character)) {
      return res.status(503).json({ error: 'La voz con IA todavía no está configurada en el servidor.', code: 'NO_VOICE_KEY' });
    }
    if (!aiHostVoice.allowRequest(userId)) {
      return res.status(429).json({ error: 'Demasiadas frases seguidas. Espera un momento.', code: 'VOICE_RATE' });
    }

    const text = aiHostVoice.cleanText(req.body?.text);
    if (!text) return res.status(400).json({ error: 'No hay nada que decir.' });

    const entitlement = await aiHostCredit.getEntitlement(userId);
    const cost = aiHostVoice.estimateTokens(text, aiHostCredit.TOKENS_PER_USD);
    if (!entitlement.unlimited && entitlement.tokensRemaining < cost) {
      return res.status(402).json({ error: 'No te quedan tokens para la voz con IA.', code: 'NO_TOKENS' });
    }

    const { audio, cached } = await aiHostVoice.synthesize({
      text,
      characterId: config.character,
      speed: req.body?.speed,
      emotion: req.body?.emotion,
    });

    // No se cobra aqui: se entrega un recibo y los tokens se descuentan cuando la pagina confirma que el audio sono
    // (POST /ai-host/speak/confirm). Si el navegador no puede reproducirlo, el usuario no paga nada.
    const receipt = !cached && !entitlement.unlimited ? aiHostVoice.createReceipt(userId, cost) : '';

    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Voice-Receipt': receipt,
      'X-Voice-Tokens-Left': String(entitlement.tokensRemaining ?? ''),
      'Access-Control-Expose-Headers': 'X-Voice-Receipt, X-Voice-Tokens-Left',
    });
    return res.send(audio);
  } catch (error) {
    if (error.detail) logger.error(`Voz IA: ${error.message} ${error.detail}`);
    return sendError(res, error, 'Error generando la voz con IA');
  }
});

// La pagina avisa que el audio sono: recien ahi se descuentan los tokens (una sola vez por recibo)
// Gasto aproximado por respuesta con la configuracion que el usuario tiene en pantalla (aunque todavia no la haya guardado)
router.post('/ai-host/estimate', requireAuth, requireActiveAccess, requireAiAccess, async (req, res) => {
  try {
    const current = await aiHostService.getOrCreateConfig(getSessionUserId(req));
    const config = aiHostService.normalizeConfigInput(req.body?.config || {}, current);
    const voiceAi = req.body?.voice === 'ai' && aiHostVoice.isConfigured(config.character);
    return res.json(aiHostEstimate.estimate(config, { models: aiHostService.ALLOWED_MODELS, voiceAi }));
  } catch (error) {
    return sendError(res, error, 'Error calculando el gasto aproximado');
  }
});

router.post('/ai-host/speak/confirm', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const cost = aiHostVoice.takeReceipt(userId, req.body?.receipt);
    if (cost === null) return res.json({ charged: 0 });
    const tokensLeft = await aiHostCredit.consume(userId, cost);
    return res.json({ charged: cost, tokensLeft });
  } catch (error) {
    return sendError(res, error, 'Error confirmando la voz con IA');
  }
});

// Para la plataforma y la pagina: si puede entrar, cuantos tokens le quedan y por que no (si esta bloqueado)
// Imagen de un regalo (del CDN de TikTok) servida por nuestro servidor, para armar la imagen descargable de las reglas de regalos
router.get('/ai-host/gift-image', requireAuth, async (req, res) => {
  try {
    const { buffer, contentType } = await giftImageProxy.fetchImage(req.query.url);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    return res.send(buffer);
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.status ? error.message : 'No se pudo cargar la imagen del regalo.' });
  }
});

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
    const outcome = await aiHostService.injectTest(getSessionUserId(req), {
      kind: req.body?.kind,
      text: req.body?.text,
      nickname: req.body?.nickname,
      giftName: req.body?.giftName,
      coins: req.body?.coins,
    });
    return res.json({ success: true, waiting: Boolean(outcome && outcome.waiting) });
  } catch (error) {
    return sendError(res, error, 'Error enviando una prueba al Co-anfitrion IA');
  }
});

// Presentacion de la plataforma: el personaje hace publicidad de Interaktik (solo superusuario)
router.post('/ai-host/promo', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const result = await aiHostService.sendPromo(getSessionUserId(req));
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Error generando la presentacion de la plataforma');
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
