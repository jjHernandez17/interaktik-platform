// tiktokinteractik/backend/src/services/gtaRampBridge.js
//
// Puente WebSocket de GTA V "Rampa Imposible": el mod aparte (gta-ramp-mod/) se conecta como cliente a
// <plataforma>/gtaramp-bridge/<llave> (la misma llave que el modo historia, pero otro canal: no se estorban).
//
// Mensajes del servidor al mod:
//   { type: 'hello' }
//   { type: 'config', goal, wins }                         objetivo y wins actuales (al conectar y cada vez que cambian)
//   { type: 'command', cmd: 'start' | 'stop' | 'reset' }   ordenes de la pagina del juego
//   { type: 'spawn', id, action, amount, label, nickname } hacer caer algo
// Del mod al servidor:
//   { type: 'status', gameRunning, gameFocused, active }   cada pocos segundos
//   { type: 'result', id, ok, reason }                     resultado de cada 'spawn'
//   { type: 'win' }                                        el jugador llego arriba: +1 win
//
// Una conexion por streamer; si se conecta otra, la anterior se cierra.

const { WebSocketServer } = require('ws');
const rampService = require('./gtaRampService');
const logger = require('../config/logger');

const BRIDGE_PATH = /^\/gtaramp-bridge\/([A-Fa-f0-9]{32,64})\/?(?:\?.*)?$/;
const STALE_ACTION_MS = 60000; // lo que llego cuando no habia partida se descarta
const PING_INTERVAL_MS = 25000;
const SAFETY_FLUSH_MS = 2000;

const connections = new Map(); // userId -> { ws, connectedAt, executed, failed, lastError, gameRunning, gameFocused, active }

function sendJson(connection, payload) {
  try {
    connection.ws.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    return false;
  }
}

async function pushConfig(userId) {
  const connection = connections.get(userId);
  if (!connection) return;
  try {
    const settings = await rampService.getSettings(userId);
    sendJson(connection, { type: 'config', goal: settings.goal, wins: settings.wins });
  } catch (error) {
    logger.warn('Error enviando la configuracion al puente de Rampa', error);
  }
}

// Entrega las acciones pendientes. Solo mientras haya una partida en marcha: si no, quedan en cola (y las viejas caducan)
async function flush(userId) {
  const connection = connections.get(userId);
  if (!connection || connection.flushing) {
    if (connection) connection.flushAgain = true;
    return;
  }

  connection.flushing = true;
  try {
    do {
      connection.flushAgain = false;
      if (!connection.active) break;
      const items = await rampService.pollActionQueue(userId);

      for (const item of items) {
        const age = Date.now() - new Date(item.created_at).getTime();
        if (age > STALE_ACTION_MS) continue;

        sendJson(connection, {
          type: 'spawn',
          id: item.id,
          action: item.action,
          amount: item.amount,
          label: `${rampService.labelFor(item.action)}${item.amount > 1 ? ` ×${item.amount}` : ''}`,
          nickname: String(item.tiktok_nickname || '').slice(0, 40),
        });
        connection.sent += 1;
        connection.lastActionAt = Date.now();
      }
    } while (connection.flushAgain && connections.get(userId) === connection);
  } catch (error) {
    logger.warn('Error entregando acciones al puente de Rampa', error);
  } finally {
    connection.flushing = false;
  }
}

function closeConnection(userId, code, reason) {
  const connection = connections.get(userId);
  if (!connection) return;
  connections.delete(userId);
  try {
    connection.ws.close(code, reason);
  } catch (error) {
    // ya estaba cerrada
  }
}

async function handleConnection(ws, key) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => { /* se cierra solo */ });

  let resolved;
  try {
    resolved = await rampService.resolveByServerKey(key.toLowerCase());
  } catch (error) {
    logger.warn('Error validando llave del puente de Rampa', error);
    ws.close(1011, 'error del servidor');
    return;
  }

  if (!resolved.found) {
    ws.close(4004, 'llave no valida');
    return;
  }
  if (!resolved.hasAccess) {
    ws.close(4003, 'plan vencido');
    return;
  }

  const { userId } = resolved;
  closeConnection(userId, 4000, 'reemplazada por una conexion nueva');

  const connection = {
    ws,
    connectedAt: Date.now(),
    lastActionAt: null,
    sent: 0,
    executed: 0,
    failed: 0,
    lastError: '',
    gameRunning: false,
    gameFocused: false,
    active: false,
    flushing: false,
    flushAgain: false,
  };
  connections.set(userId, connection);
  logger.info(`Puente de Rampa conectado (usuario ${userId})`);

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    if (message?.type === 'status') {
      connection.gameRunning = Boolean(message.gameRunning);
      connection.gameFocused = Boolean(message.gameFocused);
      const wasActive = connection.active;
      connection.active = Boolean(message.active);
      if (connection.active && !wasActive) flush(userId);
    } else if (message?.type === 'result') {
      if (message.ok) {
        connection.executed += 1;
      } else {
        connection.failed += 1;
        connection.lastError = String(message.reason || 'no se pudo ejecutar').slice(0, 200);
      }
    } else if (message?.type === 'win') {
      rampService.addWin(userId).catch((error) => logger.warn('Error guardando el win de Rampa', error));
    }
  });

  ws.on('close', () => {
    if (connections.get(userId) === connection) {
      connections.delete(userId);
      logger.info(`Puente de Rampa desconectado (usuario ${userId})`);
    }
  });

  sendJson(connection, { type: 'hello' });
  pushConfig(userId);
  flush(userId);
}

function attach(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  httpServer.on('upgrade', (request, socket, head) => {
    const match = BRIDGE_PATH.exec(request.url || '');
    if (!match) return; // otras rutas las maneja su propio listener

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleConnection(ws, match[1]).catch((error) => {
        logger.warn('Error en el puente de Rampa', error);
        try { ws.close(1011, 'error del servidor'); } catch (closeError) { /* nada */ }
      });
    });
  });

  rampService.events.on('queued', (userId) => { flush(Number(userId)); });
  rampService.events.on('settingsChanged', (userId) => { pushConfig(Number(userId)); });
  rampService.keyEvents.on('keyChanged', (userId) => { closeConnection(Number(userId), 4001, 'llave regenerada'); });

  const safety = setInterval(() => {
    connections.forEach((_connection, userId) => { flush(userId); });
  }, SAFETY_FLUSH_MS);
  safety.unref?.();

  const heartbeat = setInterval(() => {
    connections.forEach((connection, userId) => {
      if (connection.ws.isAlive === false) {
        connection.ws.terminate();
        connections.delete(userId);
        return;
      }
      connection.ws.isAlive = false;
      try { connection.ws.ping(); } catch (error) { /* se limpia en el siguiente ciclo */ }
    });
  }, PING_INTERVAL_MS);
  heartbeat.unref?.();

  return wss;
}

// Ordenes de la pagina: iniciar, terminar o reiniciar la partida
function sendCommand(userId, cmd) {
  const connection = connections.get(Number(userId));
  if (!connection) return false;
  return sendJson(connection, { type: 'command', cmd });
}

function getStatus(userId) {
  const connection = connections.get(Number(userId));
  return connection
    ? {
      connected: true,
      connectedAt: connection.connectedAt,
      lastActionAt: connection.lastActionAt,
      gameRunning: connection.gameRunning,
      gameFocused: connection.gameFocused,
      active: connection.active,
      executed: connection.executed,
      failed: connection.failed,
      lastError: connection.lastError,
    }
    : { connected: false };
}

module.exports = { attach, getStatus, flush, sendCommand };
