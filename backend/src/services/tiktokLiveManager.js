const logger = require('../config/logger');
const tiktokService = require('./tiktokService');
const { emitLiveEvent } = require('./liveHub');

let TikTokLiveConnection = null;
let WebcastEvent = null;
let ControlEvent = null;

try {
  const tiktokLiveConnector = require('tiktok-live-connector');
  TikTokLiveConnection = tiktokLiveConnector.TikTokLiveConnection || null;
  WebcastEvent = tiktokLiveConnector.WebcastEvent || null;
  ControlEvent = tiktokLiveConnector.ControlEvent || null;

  if (!TikTokLiveConnection || !WebcastEvent || !ControlEvent) {
    throw new Error('La librería tiktok-live-connector no expone la API moderna esperada.');
  }
} catch (error) {
  logger.warn('TikTok Live no disponible al iniciar el backend. Se continuará sin conexión live.', error);
}

const connections = new Map();

function normalizeGameType(value) {
  const gameType = String(value || 'app').trim().toLowerCase();

  if (['app', 'race', 'snake', 'snake-vs-snake'].includes(gameType)) {
    return gameType === 'snake-vs-snake' ? 'snake' : gameType;
  }

  return 'app';
}

function parseRequestedGameType(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  return normalizeGameType(raw);
}

function inferGameTypeFromRequest(req) {
  const explicit = parseRequestedGameType(req.body?.gameType || req.query?.gameType);
  if (explicit) {
    return explicit;
  }

  const referer = String(req.get('referer') || req.get('referrer') || '').toLowerCase();
  if (referer.includes('snake-vs-snake')) return 'snake';
  if (referer.includes('race')) return 'race';
  if (referer.includes('app')) return 'app';

  return 'app';
}

function getEmptyState(gameType) {
  return {
    gameType,
    uniqueId: '',
    status: 'disconnected',
    message: 'Sin conexión activa.',
    error: '',
    roomId: '',
    roomInfo: null,
    availableGifts: [],
    connectedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function simplifyGiftEvent(data) {
  return {
    giftId: data?.giftId || data?.giftDetails?.giftId || data?.giftDetails?.id || null,
    giftName: data?.giftDetails?.giftName || data?.giftName || data?.giftName?.trim?.() || 'Regalo',
    giftType: data?.giftDetails?.giftType ?? data?.giftType ?? null,
    repeatCount: Number(data?.repeatCount || data?.giftCount || 1) || 1,
    repeatEnd: Boolean(data?.repeatEnd),
    user: {
      uniqueId: data?.user?.uniqueId || data?.user?.uniqueId?.trim?.() || '',
      nickname: data?.user?.nickname || '',
      userId: data?.user?.userId || null,
    },
    diamondCount: data?.giftDetails?.diamondCount ?? data?.diamondCount ?? null,
    extendedGiftInfo: data?.extendedGiftInfo || null,
    timestamp: new Date().toISOString(),
  };
}

function simplifyChatEvent(data) {
  return {
    comment: data?.comment || data?.content || '',
    user: {
      uniqueId: data?.user?.uniqueId || '',
      nickname: data?.user?.nickname || '',
      userId: data?.user?.userId || null,
    },
    timestamp: new Date().toISOString(),
  };
}

function simplifyMemberEvent(data) {
  return {
    user: {
      uniqueId: data?.user?.uniqueId || '',
      nickname: data?.user?.nickname || '',
      userId: data?.user?.userId || null,
    },
    timestamp: new Date().toISOString(),
  };
}

function publish(gameType, eventName, payload) {
  const eventPayload = {
    gameType,
    ...payload,
    timestamp: payload?.timestamp || new Date().toISOString(),
  };

  emitLiveEvent(eventName, eventPayload);

  if (global.io) {
    global.io.emit(`live:${gameType}:${eventName}`, eventPayload);
    global.io.emit('live-event', eventPayload);
  }
}

function getConnectionState(gameType) {
  const normalized = normalizeGameType(gameType);
  const entry = connections.get(normalized);

  if (!entry) {
    return getEmptyState(normalized);
  }

  return {
    gameType: normalized,
    uniqueId: entry.uniqueId,
    status: entry.status,
    message: entry.message,
    error: entry.error,
    roomId: entry.roomId || '',
    roomInfo: entry.roomInfo || null,
    availableGifts: entry.availableGifts || [],
    connectedAt: entry.connectedAt,
    updatedAt: entry.updatedAt,
  };
}

async function getGiftCatalog(gameType = 'app') {
  const normalized = normalizeGameType(gameType);
  const entry = connections.get(normalized);

  if (entry?.connection && Array.isArray(entry.availableGifts) && entry.availableGifts.length > 0) {
    return {
      gifts: entry.availableGifts,
      total: entry.availableGifts.length,
      source: 'live',
      gameType: normalized,
      updated_at: entry.updatedAt,
    };
  }

  const cached = await tiktokService.getGiftCatalog();
  return {
    ...cached,
    gameType: normalized,
  };
}

async function connectGame({ gameType = 'app', uniqueId, userId = null }) {
  const normalizedGameType = normalizeGameType(gameType);
  const normalizedUniqueId = String(uniqueId || '').trim().replace(/^@/, '');

  if (!normalizedUniqueId) {
    throw new Error('Debes proporcionar uniqueId.');
  }

  const existing = connections.get(normalizedGameType);
  if (existing?.connection && existing.uniqueId === normalizedUniqueId && existing.status === 'connected') {
    logger.info(`Reutilizando conexión TikTok Live activa para ${normalizedGameType} @${normalizedUniqueId}`);
    return getConnectionState(normalizedGameType);
  }

  if (existing?.connection) {
    await disconnectGame(normalizedGameType).catch((error) => {
      logger.warn(`No se pudo cerrar la conexión previa de ${normalizedGameType}`, error);
    });
  }

  if (!TikTokLiveConnection || !WebcastEvent || !ControlEvent) {
    const unavailableState = {
      ...getEmptyState(normalizedGameType),
      uniqueId: normalizedUniqueId,
      status: 'error',
      message: 'TikTok Live no está disponible en este entorno.',
      error: 'La librería tiktok-live-connector no pudo cargarse.',
    };

    logger.warn(`TikTok Live deshabilitado para ${normalizedGameType} @${normalizedUniqueId}`);
    return unavailableState;
  }

  const connection = new TikTokLiveConnection(normalizedUniqueId, {
    processInitialData: true,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: true,
  });

  const entry = {
    gameType: normalizedGameType,
    uniqueId: normalizedUniqueId,
    userId,
    status: 'connecting',
    message: `Conectando a @${normalizedUniqueId}...`,
    error: '',
    roomId: '',
    roomInfo: null,
    availableGifts: [],
    connectedAt: null,
    updatedAt: new Date().toISOString(),
    connection,
  };

  connections.set(normalizedGameType, entry);
  publish(normalizedGameType, 'status', getConnectionState(normalizedGameType));

  logger.info(`Iniciando TikTok Live para ${normalizedGameType} @${normalizedUniqueId}`);

  connection.on(WebcastEvent.GIFT, (data) => {
    const payload = simplifyGiftEvent(data);
    publish(normalizedGameType, 'gift', payload);
  });

  connection.on(WebcastEvent.CHAT, (data) => {
    publish(normalizedGameType, 'comment', simplifyChatEvent(data));
  });

  connection.on(WebcastEvent.MEMBER, (data) => {
    publish(normalizedGameType, 'member', simplifyMemberEvent(data));
  });

  connection.on(WebcastEvent.LIKE, (data) => {
    publish(normalizedGameType, 'like', {
      likeCount: data?.likeCount || data?.totalLikeCount || 1,
      user: {
        uniqueId: data?.user?.uniqueId || '',
        nickname: data?.user?.nickname || '',
      },
    });
  });

  connection.on(WebcastEvent.SHARE, (data) => {
    publish(normalizedGameType, 'share', {
      user: {
        uniqueId: data?.user?.uniqueId || '',
        nickname: data?.user?.nickname || '',
      },
    });
  });

  connection.on(WebcastEvent.FOLLOW, (data) => {
    publish(normalizedGameType, 'follow', {
      user: {
        uniqueId: data?.user?.uniqueId || '',
        nickname: data?.user?.nickname || '',
      },
    });
  });

  connection.on(WebcastEvent.STREAM_END, (data) => {
    const current = connections.get(normalizedGameType);
    if (!current) return;

    current.status = 'disconnected';
    current.message = 'La transmisión terminó.';
    current.error = '';
    current.updatedAt = new Date().toISOString();

    publish(normalizedGameType, 'streamEnd', {
      action: data?.action || null,
      ...getConnectionState(normalizedGameType),
    });

    publish(normalizedGameType, 'status', getConnectionState(normalizedGameType));
    logger.info(`TikTok Live terminó para ${normalizedGameType} @${normalizedUniqueId}`);
  });

  connection.on(ControlEvent.CONNECTED, async (state) => {
    const current = connections.get(normalizedGameType);
    if (!current) return;

    current.status = 'connected';
    current.roomId = state?.roomId || connection.roomId || '';
    current.roomInfo = state?.roomInfo || connection.roomInfo || null;
    current.availableGifts = Array.isArray(state?.availableGifts) && state.availableGifts.length > 0
      ? state.availableGifts
      : Array.isArray(connection.availableGifts) ? connection.availableGifts : [];
    current.connectedAt = current.connectedAt || new Date().toISOString();
    current.updatedAt = new Date().toISOString();
    current.message = `Conectado a @${normalizedUniqueId}.`;
    current.error = '';

    if ((!current.availableGifts || current.availableGifts.length === 0) && connection.fetchAvailableGifts) {
      try {
        const gifts = await connection.fetchAvailableGifts();
        current.availableGifts = Array.isArray(gifts) ? gifts : [];
      } catch (error) {
        logger.warn(`No se pudo cargar gifts extendidos para ${normalizedGameType}`, error);
      }
    }

    publish(normalizedGameType, 'status', getConnectionState(normalizedGameType));
    publish(normalizedGameType, 'giftCatalog', {
      gifts: current.availableGifts || [],
      total: (current.availableGifts || []).length,
      source: 'live',
      updated_at: current.updatedAt,
    });

    logger.success(`TikTok Live conectado: ${normalizedGameType} @${normalizedUniqueId}`);
  });

  connection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
    const current = connections.get(normalizedGameType);
    if (!current) return;

    current.status = 'disconnected';
    current.message = 'Conexión cerrada.';
    current.error = '';
    current.updatedAt = new Date().toISOString();
    publish(normalizedGameType, 'status', {
      ...getConnectionState(normalizedGameType),
      status: 'disconnected',
      message: 'Conexión cerrada.',
      error: '',
    });
    logger.info(`TikTok Live desconectado: ${normalizedGameType} code=${code} reason=${reason || ''}`);
  });

  connection.on(ControlEvent.ERROR, (error) => {
    const current = connections.get(normalizedGameType);
    if (!current) return;

    current.status = 'error';
    current.error = error?.message || String(error || 'Error desconocido');
    current.message = 'Error en conexión TikTok Live.';
    current.updatedAt = new Date().toISOString();

    publish(normalizedGameType, 'status', getConnectionState(normalizedGameType));
    logger.error(`TikTok Live error en ${normalizedGameType}`, error);
  });

  try {
    const connectedState = await connection.connect();
    const current = connections.get(normalizedGameType);
    if (current) {
      current.roomId = connectedState?.roomId || connection.roomId || current.roomId || '';
      current.roomInfo = connectedState?.roomInfo || connection.roomInfo || current.roomInfo || null;
      current.availableGifts = Array.isArray(connectedState?.availableGifts) && connectedState.availableGifts.length > 0
        ? connectedState.availableGifts
        : Array.isArray(connection.availableGifts) ? connection.availableGifts : current.availableGifts;
      current.status = 'connected';
      current.message = `Conectado a @${normalizedUniqueId}.`;
      current.error = '';
      current.connectedAt = current.connectedAt || new Date().toISOString();
      current.updatedAt = new Date().toISOString();
    }

    try {
      const gifts = await connection.fetchAvailableGifts();
      const current = connections.get(normalizedGameType);
      if (current) {
        current.availableGifts = Array.isArray(gifts) ? gifts : [];
        current.updatedAt = new Date().toISOString();
      }
    } catch (giftError) {
      logger.warn(`No se pudo refrescar catálogo de gifts para ${normalizedGameType}`, giftError);
    }

    publish(normalizedGameType, 'status', getConnectionState(normalizedGameType));
    publish(normalizedGameType, 'giftCatalog', {
      gifts: (connections.get(normalizedGameType)?.availableGifts) || [],
      total: (connections.get(normalizedGameType)?.availableGifts || []).length,
      source: 'live',
      updated_at: connections.get(normalizedGameType)?.updatedAt || new Date().toISOString(),
    });

    return getConnectionState(normalizedGameType);
  } catch (error) {
    const current = connections.get(normalizedGameType);
    if (current) {
      current.status = 'error';
      current.error = error?.message || String(error || 'Error desconocido');
      current.message = 'No se pudo conectar a TikTok Live.';
      current.updatedAt = new Date().toISOString();
    }

    publish(normalizedGameType, 'status', getConnectionState(normalizedGameType));
    logger.error(`No se pudo conectar TikTok Live para ${normalizedGameType} @${normalizedUniqueId}`, error);
    throw error;
  }
}

async function disconnectGame(gameType = 'app') {
  const normalizedGameType = normalizeGameType(gameType);
  const entry = connections.get(normalizedGameType);

  if (!entry) {
    return getEmptyState(normalizedGameType);
  }

  const connection = entry.connection;
  connections.delete(normalizedGameType);

  if (connection) {
    try {
      await connection.disconnect();
    } catch (error) {
      logger.warn(`Error cerrando TikTok Live para ${normalizedGameType}`, error);
    }
  }

  publish(normalizedGameType, 'status', {
    ...getEmptyState(normalizedGameType),
    message: 'Conexión cerrada.',
  });

  logger.info(`TikTok Live desconectado para ${normalizedGameType}`);
  return getEmptyState(normalizedGameType);
}

module.exports = {
  connectGame,
  disconnectGame,
  getConnectionState,
  getGiftCatalog,
  inferGameTypeFromRequest,
  normalizeGameType,
};