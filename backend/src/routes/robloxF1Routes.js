// tiktokinteractik/backend/src/routes/robloxF1Routes.js
//
// Rutas de la Carrera de Formula 1 (Roblox). Las de configuracion usan la sesion del navegador (requireAuth). Las que consulta
// el propio juego de Roblox (session, queue, ack, race-result) son publicas por diseno: se identifican con el ID de la cuenta
// de Roblox que abrio el juego, verificado contra la vinculacion guardada (mismo modelo que Pelea Callejera).

const express = require('express');
const { requireAuth, requireActiveAccess, getSessionUserId } = require('../middleware/auth');
const robloxF1Service = require('../services/robloxF1Service');
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
    settings: robloxF1Service.toSettings(row),
    racesPlayed: row.races_played,
  };
}

// Valida que la cuenta de Roblox este vinculada y con acceso; si no, ya responde el error y devuelve null
async function requireLinkedGameUser(req, res) {
  const { linked, hasAccess, userId } = await robloxF1Service.resolveLinkedUser(req.query?.robloxUserId);

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

router.get('/roblox-f1/config', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const row = await robloxF1Service.getOrCreateConfig(getSessionUserId(req));
    return res.json(toConfigResponse(row));
  } catch (error) {
    return sendError(res, error, 'Error cargando configuracion de la Carrera de F1');
  }
});

router.post('/roblox-f1/link', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const row = await robloxF1Service.linkRobloxAccount(getSessionUserId(req), req.body?.robloxUserId);
    return res.json(toConfigResponse(row));
  } catch (error) {
    return sendError(res, error, 'Error vinculando cuenta de Roblox (Carrera de F1)');
  }
});

router.put('/roblox-f1/settings', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const row = await robloxF1Service.updateSettings(getSessionUserId(req), req.body || {});
    return res.json(toConfigResponse(row));
  } catch (error) {
    return sendError(res, error, 'Error guardando ajustes de la Carrera de F1');
  }
});

router.get('/roblox-f1/leaderboard', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    return res.json({ leaderboard: await robloxF1Service.getLeaderboard(getSessionUserId(req), 10) });
  } catch (error) {
    return sendError(res, error, 'Error leyendo el ranking de la Carrera de F1');
  }
});

router.post('/roblox-f1/score/reset', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxF1Service.resetScore(getSessionUserId(req));
    return res.json({ leaderboard: [] });
  } catch (error) {
    return sendError(res, error, 'Error reiniciando el ranking de la Carrera de F1');
  }
});

router.get('/roblox-f1/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    return res.json({ rules: await robloxF1Service.listGiftRules(getSessionUserId(req)) });
  } catch (error) {
    return sendError(res, error, 'Error listando reglas de la Carrera de F1');
  }
});

router.post('/roblox-f1/rules', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    const rule = await robloxF1Service.upsertGiftRule(getSessionUserId(req), {
      giftId: req.body?.giftId,
      giftName: req.body?.giftName,
      giftImageUrl: req.body?.giftImageUrl,
      power: req.body?.power,
      target: req.body?.target,
      seconds: req.body?.seconds,
    });
    return res.json({ rule });
  } catch (error) {
    return sendError(res, error, 'Error guardando regla de la Carrera de F1');
  }
});

router.delete('/roblox-f1/rules/:id', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxF1Service.deleteGiftRule(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error eliminando regla de la Carrera de F1');
  }
});

router.post('/roblox-f1/rules/:id/test', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxF1Service.enqueueTestPower(getSessionUserId(req), Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando poder de la Carrera de F1');
  }
});

router.post('/roblox-f1/test-join', requireAuth, requireActiveAccess, async (req, res) => {
  try {
    await robloxF1Service.enqueueTestJoin(getSessionUserId(req));
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Error probando la union a la Carrera de F1');
  }
});

// ---------- lo que consulta el juego de Roblox ----------

router.get('/roblox-f1/session', async (req, res) => {
  try {
    const { linked, hasAccess, userId } = await robloxF1Service.resolveLinkedUser(req.query?.robloxUserId);
    if (!linked || !hasAccess) {
      return res.json({ linked, hasAccess, ready: false });
    }

    const payload = await robloxF1Service.getSessionPayload(userId);
    return res.json({ linked, hasAccess, ready: true, ...payload });
  } catch (error) {
    return sendError(res, error, 'Error resolviendo sesion de la Carrera de F1');
  }
});

// Consultada en bucle por el juego: uniones y poderes nuevos. Lo entregado se confirma con /ack.
router.get('/roblox-f1/queue', async (req, res) => {
  try {
    const userId = await requireLinkedGameUser(req, res);
    if (userId === null) return undefined;

    return res.json({ items: await robloxF1Service.pollQueue(userId) });
  } catch (error) {
    return sendError(res, error, 'Error consultando la cola de la Carrera de F1');
  }
});

router.post('/roblox-f1/ack', async (req, res) => {
  try {
    const userId = await requireLinkedGameUser(req, res);
    if (userId === null) return undefined;

    return res.json({ confirmed: await robloxF1Service.ackQueue(userId, req.body?.ids) });
  } catch (error) {
    return sendError(res, error, 'Error confirmando la cola de la Carrera de F1');
  }
});

// El juego avisa el resultado de cada carrera (primeros 10 con su puesto y tiempo)
router.post('/roblox-f1/race-result', async (req, res) => {
  try {
    const userId = await requireLinkedGameUser(req, res);
    if (userId === null) return undefined;

    const result = await robloxF1Service.reportRaceResult(userId, {
      raceId: req.body?.raceId,
      results: req.body?.results,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'Error guardando el resultado de la Carrera de F1');
  }
});

module.exports = router;
