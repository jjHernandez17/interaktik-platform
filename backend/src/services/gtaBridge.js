// tiktokinteractik/backend/src/services/gtaBridge.js
//
// Puente WebSocket para GTA V: el mod de ScriptHookVDotNet del streamer (gta-mod/) se conecta como
// cliente a <plataforma>/gta-bridge/<llave>. Cada regalo (cola gta_action_queue) se empuja al mod al
// instante y el ejecuta la accion dentro del juego. (La aplicacion de teclas antigua, gta-helper/,
// usa el mismo protocolo y escribe los 'codes'.)
//
// Mensajes del servidor al mod:
//   { type: 'hello' }                                            al conectar
//   { type: 'cheat', id, action, amount, label, nickname, codes } ejecutar esta accion
// Del mod al servidor:
//   { type: 'status', gameRunning, gameFocused }                 cada pocos segundos
//   { type: 'result', id, ok, reason }                           resultado de cada 'cheat'
//
// Una conexion por streamer; si se conecta otra (por ejemplo al reabrir el juego), la anterior se
// cierra para no ejecutar dos veces.

const { WebSocketServer } = require('ws');
const gtaService = require('./gtaService');
const logger = require('../config/logger');

const BRIDGE_PATH = /^\/gta-bridge\/([A-Fa-f0-9]{32,64})\/?(?:\?.*)?$/;
const STALE_ACTION_MS = 120000; // acciones mas viejas (de cuando no habia aplicacion conectada) se descartan
const PING_INTERVAL_MS = 25000;
const SAFETY_FLUSH_MS = 3000;

const connections = new Map(); // userId -> { ws, connectedAt, executed, failed, lastError, gameRunning, gameFocused, ... }

// Entrega las acciones pendientes del usuario a su aplicacion conectada
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
      const items = await gtaService.pollActionQueue(userId);

      for (const item of items) {
        const age = Date.now() - new Date(item.created_at).getTime();
        if (age > STALE_ACTION_MS) continue; // llego cuando no habia aplicacion conectada: ya no tiene sentido

        const cheat = gtaService.cheatsFor(item.action, item.amount);
        if (!cheat) continue;

        connection.ws.send(JSON.stringify({
          type: 'cheat',
          id: item.id,
          action: item.action,
          amount: cheat.amount,
          label: cheat.label,
          nickname: String(item.tiktok_nickname || '').slice(0, 40),
          codes: cheat.codes,
        }));
        connection.sent += 1;
        connection.lastActionAt = Date.now();
      }
    } while (connection.flushAgain && connections.get(userId) === connection);
  } catch (error) {
    logger.warn('Error entregando acciones al puente de GTA V', error);
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
    resolved = await gtaService.resolveByServerKey(key.toLowerCase());
  } catch (error) {
    logger.warn('Error validando llave del puente de GTA V', error);
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

  // Una sola conexion por usuario: la nueva reemplaza a la anterior
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
    flushing: false,
    flushAgain: false,
  };
  connections.set(userId, connection);
  logger.info(`Puente de GTA V conectado (usuario ${userId})`);

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
    } else if (message?.type === 'result') {
      if (message.ok) {
        connection.executed += 1;
      } else {
        connection.failed += 1;
        connection.lastError = String(message.reason || 'no se pudo ejecutar').slice(0, 200);
      }
    }
  });

  ws.on('close', () => {
    if (connections.get(userId) === connection) {
      connections.delete(userId);
      logger.info(`Puente de GTA V desconectado (usuario ${userId})`);
    }
  });

  try {
    ws.send(JSON.stringify({ type: 'hello' }));
  } catch (error) {
    // si falla el envio, el cierre normal limpia la conexion
  }

  // Lo que haya quedado pendiente (reciente) se entrega ya
  flush(userId);
}

function attach(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  httpServer.on('upgrade', (request, socket, head) => {
    const match = BRIDGE_PATH.exec(request.url || '');
    if (!match) return; // otras rutas (Socket.IO, Minecraft) las maneja su propio listener

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleConnection(ws, match[1]).catch((error) => {
        logger.warn('Error en el puente de GTA V', error);
        try { ws.close(1011, 'error del servidor'); } catch (closeError) { /* nada */ }
      });
    });
  });

  // Cada regalo nuevo se entrega al instante; el intervalo es solo una red de seguridad
  gtaService.events.on('queued', (userId) => { flush(Number(userId)); });
  gtaService.events.on('keyChanged', (userId) => { closeConnection(Number(userId), 4001, 'llave regenerada'); });

  const safety = setInterval(() => {
    connections.forEach((_connection, userId) => { flush(userId); });
  }, SAFETY_FLUSH_MS);
  safety.unref?.();

  // Conexiones muertas (por ejemplo la aplicacion cerrada a la fuerza) se limpian
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

function getStatus(userId) {
  const connection = connections.get(Number(userId));
  return connection
    ? {
      connected: true,
      connectedAt: connection.connectedAt,
      lastActionAt: connection.lastActionAt,
      gameRunning: connection.gameRunning,
      gameFocused: connection.gameFocused,
      executed: connection.executed,
      failed: connection.failed,
      lastError: connection.lastError,
    }
    : { connected: false };
}

module.exports = { attach, getStatus, flush };
