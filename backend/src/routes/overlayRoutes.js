// tiktokinteractik/backend/src/routes/overlayRoutes.js
//
// Rutas de configuracion de overlays (para pegar en OBS/Streamlabs/TikTok
// LIVE Studio como Browser Source). Las de configuracion usan la sesion del
// navegador (requireAuth). La de "public-config" es publica por diseno: el
// propio overlay (sin sesion, corriendo dentro de OBS) se identifica con la
// overlay_key de la URL, no con cookies.

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const overlayService = require('../services/overlayService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');
const { emitLiveEvent } = require('../services/liveHub');

const TEST_GIFT_NAMES = ['Rosa', 'Finger Heart', 'Corona', 'León', 'Universo'];
const TEST_SENDERS = [
  { uniqueId: 'usuario_prueba1', nickname: 'María' },
  { uniqueId: 'usuario_prueba2', nickname: 'Carlos' },
  { uniqueId: 'usuario_prueba3', nickname: 'Sofía' },
  { uniqueId: 'usuario_prueba4', nickname: 'Andrés' },
  { uniqueId: 'usuario_prueba5', nickname: 'Valentina' },
];

const router = express.Router();

router.get('/overlay/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await overlayService.getOrCreateOverlayConfig(userId);
    return res.json(config);
  } catch (error) {
    logger.error('Error cargando configuracion de overlay', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/overlay/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await overlayService.saveOverlayState(userId, req.body || {});
    return res.json(config);
  } catch (error) {
    logger.error('Error guardando configuracion de overlay', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

const VALID_OVERLAY_WIDGETS = ['giftAlert', 'goalBar', 'topGifters', 'likeCounter', 'topLikers', 'followAlert'];

router.post('/overlay/regenerate-key', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const widget = String(req.body?.widget || '').trim();

    if (!VALID_OVERLAY_WIDGETS.includes(widget)) {
      return res.status(400).json({ error: 'Debes indicar que overlay regenerar.' });
    }

    const config = await overlayService.regenerateOverlayKey(userId, widget);
    return res.json(config);
  } catch (error) {
    logger.error('Error regenerando la key del overlay', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Dispara un evento de regalo falso por el mismo canal en vivo (liveHub),
// para poder probar la alerta del overlay sin necesidad de estar conectado
// a un TikTok Live real. Solo el propio streamer (autenticado) puede
// probarse a si mismo.
router.post('/overlay/test-gift', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const diamondCount = Math.max(1, Math.min(100000, Math.round(Number(req.body?.diamondCount)) || 100));
    const giftName = TEST_GIFT_NAMES[Math.floor(Math.random() * TEST_GIFT_NAMES.length)];
    const sender = TEST_SENDERS[Math.floor(Math.random() * TEST_SENDERS.length)];

    emitLiveEvent('gift', {
      gameType: 'overlay-test',
      ownerKey: `user:${userId}:overlay-test`,
      giftId: 'test',
      giftName,
      repeatCount: 1,
      repeatEnd: true,
      diamondCount,
      user: { ...sender, userId: 'test', avatar: null },
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, giftName, diamondCount, sender: sender.nickname });
  } catch (error) {
    logger.error('Error enviando regalo de prueba de overlay', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Igual que /overlay/test-gift, pero para probar la alerta de nuevo
// seguidor sin estar en vivo.
router.post('/overlay/test-follow', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const sender = TEST_SENDERS[Math.floor(Math.random() * TEST_SENDERS.length)];

    emitLiveEvent('follow', {
      gameType: 'overlay-test',
      ownerKey: `user:${userId}:overlay-test`,
      user: { ...sender, userId: 'test', avatar: null },
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, sender: sender.nickname });
  } catch (error) {
    logger.error('Error enviando seguidor de prueba de overlay', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/overlay/goal-bar/reset', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await overlayService.resetGoalBar(userId);
    emitLiveEvent('overlay-goal-update', {
      ownerKey: `user:${userId}:overlay-goal`,
      goalBar: config.state.goalBar,
    });
    return res.json(config);
  } catch (error) {
    logger.error('Error reiniciando la barra de meta', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Dispara likes falsos por el mismo canal en vivo, para poder probar el
// contador sin estar conectado a un TikTok Live real.
router.post('/overlay/test-like', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const likeCount = Math.max(1, Math.min(1000, Math.round(Number(req.body?.likeCount)) || 50));
    const sender = TEST_SENDERS[Math.floor(Math.random() * TEST_SENDERS.length)];

    emitLiveEvent('like', {
      gameType: 'overlay-test',
      ownerKey: `user:${userId}:overlay-test`,
      likeCount,
      user: { ...sender, userId: 'test' },
    });

    return res.json({ success: true, likeCount, sender: sender.nickname });
  } catch (error) {
    logger.error('Error enviando likes de prueba de overlay', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/overlay/like-counter/reset', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await overlayService.resetLikeCounter(userId);
    emitLiveEvent('overlay-likes-update', {
      ownerKey: `user:${userId}:overlay-likes`,
      likeCounter: config.state.likeCounter,
    });
    return res.json(config);
  } catch (error) {
    logger.error('Error reiniciando el contador de likes', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/overlay/top-gifters/reset', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await overlayService.resetTopGifters(userId);
    emitLiveEvent('overlay-gifters-update', {
      ownerKey: `user:${userId}:overlay-gifters`,
      topGifters: config.state.topGifters,
    });
    return res.json(config);
  } catch (error) {
    logger.error('Error reiniciando el top de regaladores', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

router.post('/overlay/top-likers/reset', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const config = await overlayService.resetTopLikers(userId);
    emitLiveEvent('overlay-likers-update', {
      ownerKey: `user:${userId}:overlay-likers`,
      topLikers: config.state.topLikers,
    });
    return res.json(config);
  } catch (error) {
    logger.error('Error reiniciando el top de likes', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

// Consultado por la propia pagina de overlay (sin sesion, corre dentro de
// OBS) para cargar su configuracion (duracion de la alerta, monedas
// minimas) al abrir.
router.get('/overlay/public-config', async (req, res) => {
  try {
    const resolved = await overlayService.resolveByOverlayKey(req.query?.key);

    if (!resolved) {
      return res.status(404).json({ error: 'Link de overlay invalido.' });
    }

    return res.json({ state: resolved.state });
  } catch (error) {
    logger.error('Error consultando configuracion publica de overlay', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
