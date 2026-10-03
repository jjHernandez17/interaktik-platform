// tiktokinteractik/backend/src/services/minecraftBridge.js
//
// Puente WebSocket para Minecraft Bedrock, sin servidor ni instalar nada: el streamer abre su mundo
// (con trucos activados) y escribe en el chat
//
//     /connect wss://<plataforma>/mc-bridge/<su llave>
//
// Bedrock se conecta como cliente WebSocket a esta direccion y acepta comandos desde aqui. Cada
// regalo que llega (cola minecraft_action_queue) se traduce a comandos de Bedrock
// (minecraftBedrockCommands.js) y se empuja al juego al instante.
//
// Mismo puente para Java: el mod de Java se conecta a la misma direccion con ?edition=java y recibe el
// mismo tipo de mensaje, pero con comandos de Java (minecraftJavaCommands.js); el mod solo los ejecuta.
//
// Una conexion por streamer; si se conecta otra (por ejemplo al recargar el mundo), la anterior se
// cierra para no ejecutar dos veces.

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const minecraftService = require('./minecraftService');
const { toBedrockSteps } = require('./minecraftBedrockCommands');
const { toJavaSteps } = require('./minecraftJavaCommands');
const logger = require('../config/logger');

const BRIDGE_PATH = /^\/mc-bridge\/([A-Fa-f0-9]{32,64})\/?(?:\?.*)?$/;
const STALE_ACTION_MS = 120000; // acciones mas viejas que esto (de cuando no habia juego conectado) se descartan
const COMMAND_GAP_MS = 60; // pausa entre comandos: Bedrock los pierde si llegan todos juntos
const PING_INTERVAL_MS = 25000;
const SAFETY_FLUSH_MS = 3000;

const connections = new Map(); // userId -> { ws, connectedAt, executed, failed, lastError, sending }

function newRequestId() {
  return crypto.randomUUID();
}

function sendCommand(ws, commandLine) {
  ws.send(JSON.stringify({
    header: {
      version: 1,
      requestId: newRequestId(),
      messageType: 'commandRequest',
      messagePurpose: 'commandRequest',
    },
    body: {
      version: 1,
      commandLine,
      origin: { type: 'player' },
    },
  }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Manda los pasos de una accion en orden, con pausas, sin mezclar acciones distintas
async function playSteps(connection, steps) {
  for (const step of steps) {
    if (connection.ws.readyState !== connection.ws.OPEN) return;
    if (typeof step === 'string') {
      sendCommand(connection.ws, step);
      await sleep(COMMAND_GAP_MS);
    } else if (step?.wait) {
      await sleep(step.wait);
    }
  }
}

// Entrega las acciones pendientes del usuario a su juego conectado
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
      const items = await minecraftService.pollActionQueue(userId, { online: true });

      for (const item of items) {
        const age = Date.now() - new Date(item.created_at).getTime();
        if (age > STALE_ACTION_MS) continue; // llego cuando no habia juego conectado: ya no tiene sentido

        const translate = connection.edition === 'java' ? toJavaSteps : toBedrockSteps;
        const steps = translate(
          { action: item.action, amount: item.amount, nickname: item.tiktok_nickname },
          { actions: minecraftService.ACTIONS },
        );
        if (steps.length === 0) continue;

        await playSteps(connection, steps);
        connection.executed += 1;
        connection.lastActionAt = Date.now();
      }
    } while (connection.flushAgain && connections.get(userId) === connection);
  } catch (error) {
    logger.warn('Error entregando acciones al puente de Minecraft', error);
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

async function handleConnection(ws, key, edition) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => { /* se cierra solo */ });

  let resolved;
  try {
    resolved = await minecraftService.resolveByServerKey(key.toLowerCase());
  } catch (error) {
    logger.warn('Error validando llave del puente de Minecraft', error);
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
    edition,
    connectedAt: Date.now(),
    lastActionAt: null,
    executed: 0,
    failed: 0,
    lastError: '',
    flushing: false,
    flushAgain: false,
  };
  connections.set(userId, connection);
  logger.info(`Puente de Minecraft conectado (usuario ${userId}, ${edition})`);

  // Respuestas del juego: contamos los comandos que fallaron para poder avisarle al streamer
  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }
    if (message?.header?.messagePurpose !== 'commandResponse') return;

    const status = Number(message?.body?.statusCode);
    if (Number.isFinite(status) && status !== 0) {
      connection.failed += 1;
      connection.lastError = String(message?.body?.statusMessage || `codigo ${status}`).slice(0, 200);
    }
  });

  ws.on('close', () => {
    if (connections.get(userId) === connection) {
      connections.delete(userId);
      logger.info(`Puente de Minecraft desconectado (usuario ${userId})`);
    }
  });

  // Aviso en pantalla de que quedo conectado
  try {
    sendCommand(ws, edition === 'java'
      ? 'title @a actionbar {"text":"Interaktik conectado ✔","color":"green"}'
      : 'title @a actionbar §aInteraktik conectado ✔');
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
    if (!match) return; // otras rutas (Socket.IO) las maneja su propio listener

    let edition = 'bedrock';
    try {
      const requested = new URL(request.url, 'http://localhost').searchParams.get('edition');
      if (requested === 'java') edition = 'java';
    } catch (error) {
      // sin parametros: Bedrock
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleConnection(ws, match[1], edition).catch((error) => {
        logger.warn('Error en el puente de Minecraft', error);
        try { ws.close(1011, 'error del servidor'); } catch (closeError) { /* nada */ }
      });
    });
  });

  // Cada regalo nuevo se entrega al instante; el intervalo es solo una red de seguridad
  minecraftService.events.on('queued', (userId) => { flush(Number(userId)); });
  minecraftService.events.on('keyChanged', (userId) => { closeConnection(Number(userId), 4001, 'llave regenerada'); });

  const safety = setInterval(() => {
    connections.forEach((_connection, userId) => { flush(userId); });
  }, SAFETY_FLUSH_MS);
  safety.unref?.();

  // Conexiones muertas (por ejemplo el juego cerrado a la fuerza) se limpian
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
      edition: connection.edition,
      connectedAt: connection.connectedAt,
      lastActionAt: connection.lastActionAt,
      executed: connection.executed,
      failed: connection.failed,
      lastError: connection.lastError,
    }
    : { connected: false };
}

module.exports = { attach, getStatus, flush };
