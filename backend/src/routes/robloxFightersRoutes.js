// tiktokinteractik/backend/src/routes/robloxFightersRoutes.js
//
// Rutas de Pelea Callejera (Roblox). Las de configuracion usan la sesion del navegador (requireAuth). Las que consulta el
// propio juego de Roblox (session, queue, ack, round-result, reset) son publicas por diseno: se identifican con el ID de la
// cuenta de Roblox que abrio el juego, verificado contra la vinculacion guardada (mismo modelo que Roblox Parkour).

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const robloxFightersService = require('../services/robloxFightersService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

function sendError(res, error, logMessage) {
  const status = error.status || 500;
  if (status >= 500) logger.error(logMessage, error);
  return res.status(status).json({ error: normalizeError(error) });
}

function toConfigResponse(row) {
  return {
    robloxUsername: row.roblox_username,
    robloxUserId: row.roblox_user_id,
    settings: robloxFightersService.toSettings(row),
    score: robloxFightersService.toScore(row),
  };
}

// Valida que la cuenta de Roblox este vinculada y con acceso; si no, ya responde el error y devuelve null
async function requireLinkedGameUser(req, res) {
  const robloxUserId = req.query?.robloxUserId;
  const { linked, hasAccess, userId } = await robloxFightersService.resolveLinkedUser(robloxUserId);

  if (!linked) {
    res.status(404).json({ error: 'Esa cuenta de Roblox no esta vinculada.' });
    return null;
  }
  if (!hasAccess) {
    res.status(403).json({ error: 'La prueba o el plan de este usuario vencio.', code: 'ACCESS_EXPIRED' });
    return null;
  }
  return userId;
}

// ---------- pagina de configuracion ----------

router.get('/roblox-fighters/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const row = await robloxFightersService.getOrCreateConfig(getSessionUserId(req));
    return res.json(toConfigResponse(row));
  } catch (error) {
    return sendError(res, error, 'Error cargando configuracion de Pelea Callejera');
  }
});

router.post('/roblox-fighters/link', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const row = await robloxFightersService.linkRobloxAccount(getSessionUserId(req), req.body?.robloxUserId);
    return res.json(toConfigResponse(row));
  } catch (error) {
    return sendError(res, error, 'Error vinculando cuenta de Roblox (Pelea Callejera)');
  }
});

router.put('/roblox-fighters/settings', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const row = await robloxFightersService.updateSettings(getSessionUserId(req), req.body || {});
    return res.json(toConfigResponse(row));
  } catch (error) {
    return sendError(res, error, 'Error guardando ajustes de Pelea Callejera');
  }
});

router.get('/roblox-fighters/score', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    return res.json({ score: await robloxFightersService.getScore(getSessionUserId(req)) });
  } catch (error) {
    return sendError(res, error, 'Error leyendo el marcador de Pelea Callejera');
  }
});

router.post('/roblox-fighters/score/reset', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    return res.json({ score: await robloxFightersService.resetScore(getSessionUserId(req)) });
  } catch (error) {
    return sendError(res, error, 'Error reiniciando el marcador de Pelea Callejera');
  }
});

router.get('/roblox-fighters/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rules = await robloxFightersService.listGiftRules(getSessionUserId(req));
    return res.json({ rules });
  } catch (error) {
    return sendError(res, error, 'Error listando reglas de Pelea Callejera');
  }
});

router.post('/roblox-fighters/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rule = await robloxFightersService.upsertGiftRule(getSessionUserId(req), {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      power: req.body?.power,
      amount: req.body?.amount,
      durationSeconds: req.body?.durationSeconds,
      param: req.body?.param,
    });
    return res.json({ rule });
  } catch (error) {
    return sendError(res, error, 'Error guardando regla de Pelea Callejera');
  }
});

router.delete('/roblox-fighters/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxFightersService.deleteGiftRule(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error eliminando regla de Pelea Callejera');
  }
});

router.post('/roblox-fighters/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxFightersService.enqueueTestPower(getSessionUserId(req), Number(req.params.id), req.body?.side);
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando poder de Pelea Callejera');
  }
});

// ---------- lo que consulta el juego de Roblox ----------

// Al arrancar y cada cierto tiempo: confirma la vinculacion y trae ajustes, marcador y seguidores de cada lado
router.get('/roblox-fighters/session', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxFightersService.resolveLinkedUser(req.query?.robloxUserId);
    if (!linked || !hasAccess) {
      return res.json({ linked, hasAccess, ready: false });
    }

    const payload = await robloxFightersService.getSessionPayload(userId);
    return res.json({ linked, hasAccess, ready: true, ...payload });
  } catch (error) {
    return sendError(res, error, 'Error resolviendo sesion de Pelea Callejera');
  }
});

// Consultada en bucle por el juego: poderes y espectadores nuevos. Lo entregado se confirma con /ack.
router.get('/roblox-fighters/queue', async (req, res) => {
  try {
    const userId = await requireLinkedGameUser(req, res);
    if (userId === null) return undefined;

    const items = await robloxFightersService.pollQueue(userId);
    return res.json({ items });
  } catch (error) {
    return sendError(res, error, 'Error consultando la cola de Pelea Callejera');
  }
});

router.post('/roblox-fighters/ack', async (req, res) => {
  try {
    const userId = await requireLinkedGameUser(req, res);
    if (userId === null) return undefined;

    const confirmed = await robloxFightersService.ackQueue(userId, req.body?.ids);
    return res.json({ confirmed });
  } catch (error) {
    return sendError(res, error, 'Error confirmando la cola de Pelea Callejera');
  }
});

// El juego avisa quien gano cada round; responde el marcador y si alguien llego a la meta (campeon)
router.post('/roblox-fighters/round-result', async (req, res) => {
  try {
    const userId = await requireLinkedGameUser(req, res);
    if (userId === null) return undefined;

    const result = await robloxFightersService.reportRoundResult(userId, {
      winner: req.body?.winner,
      roundId: req.body?.roundId,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'Error guardando el resultado de un round de Pelea Callejera');
  }
});

router.post('/roblox-fighters/reset', async (req, res) => {
  try {
    const userId = await requireLinkedGameUser(req, res);
    if (userId === null) return undefined;

    await robloxFightersService.resetGame(userId);
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error reiniciando Pelea Callejera');
  }
});

module.exports = router;
