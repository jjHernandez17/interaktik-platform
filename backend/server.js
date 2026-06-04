const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');

// Config
const env = require('./src/config/env');
const logger = require('./src/config/logger');
const { getCorsConfig, getSocketCorsConfig, isOriginAllowed } = require('./src/config/cors');

// Database
const pool = require('./src/database/pool');
const { bootstrapDatabase } = require('./src/database/init');

// Middleware
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// Routes
const pagesRouter = require('./src/routes/pages');
const authRouter = require('./src/routes/auth');
const gameRouter = require('./src/routes/gameRoutes');
const tiktokRouter = require('./src/routes/tiktok');
const { hub } = require('./src/services/liveHub');
const { getConnectionState, inferGameTypeFromRequest, getOwnerKeyFromRequest } = require('./src/services/tiktokLiveManager');

// Initialize Express app
const app = express();

// Security and compression middleware
app.use(helmet({
  hsts: false, // <-- IMPORTANTE: Desactivar Strict-Transport-Security (fuerza HTTPS)
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "http://localhost:*", "https://localhost:*"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
      fontSrc: ["'self'"],
      upgradeInsecureRequests: null, // <-- IMPORTANTE: Evita que el navegador convierta HTTP a HTTPS automáticamente
    },
  },
  referrerPolicy: { policy: "no-referrer" },
}));
app.use(compression({
  filter(req, res) {
    if (req.path === '/events' || req.originalUrl.startsWith('/events')) {
      return false;
    }

    return compression.filter(req, res);
  },
}));
app.use(cors(getCorsConfig()));

// Handle preflight OPTIONS requests
app.options('*', cors(getCorsConfig()));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Trust proxy for secure cookies behind reverse proxies (Railway, Render, etc.)
app.set('trust proxy', 1);

// Session configuration
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

// Routes
app.use('/api', authRouter);
app.use('/api', gameRouter);
app.use('/api', tiktokRouter);

// Server-Sent Events endpoint (para compatibilidad con EventSource del frontend)
app.get('/events', (req, res) => {
  const origin = req.headers.origin;
  const gameType = inferGameTypeFromRequest(req);
  const ownerKey = getOwnerKeyFromRequest(req, gameType);

  // Verificar CORS dinámicamente
  if (!isOriginAllowed(origin)) {
    logger.error(`CORS bloqueado en /events para origin: ${origin}`);
    return res.status(403).json({ error: 'CORS not allowed' });
  }

  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Accel-Buffering': 'no',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }

  res.writeHead(200, headers);
  res.flushHeaders();

  logger.success(`Cliente conectado a /events (${gameType}) desde origin: ${origin || 'sin origin'}`);

  res.write('retry: 3000\n\n');
  res.write('event: status\n');
  res.write(`data: ${JSON.stringify({
    status: 'connected',
    message: 'SSE conectado correctamente',
    gameType,
    live: getConnectionState(gameType, {
      userId: req.session?.user?.id || req.session?.userId || null,
      sessionId: req.sessionID,
    }),
  })}\n\n`);

  const pushEvent = ({ eventName, payload }) => {
    if (!payload || payload.gameType !== gameType || payload.ownerKey !== ownerKey) {
      return;
    }

    if (eventName === 'gift') {
      logger.info(`[SSE-PUSH] Enviando gift al cliente (${gameType}):`, {
        giftName: payload?.giftName,
        timestamp: payload?.timestamp,
      });
    }

    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  hub.on('live-event', pushEvent);

  // Mantener la conexión viva
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  // Limpiar cuando se desconecte
  req.on('close', () => {
    logger.info(`Cliente desconectado de /events (${gameType})`);
    clearInterval(keepAlive);
    hub.off('live-event', pushEvent);
  });
});

app.use('/', pagesRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
function start() {
  const PORT = process.env.PORT || env.PORT || 3000;
  logger.info(`Starting server in ${env.NODE_ENV} mode...`);

  // 1. Crear servidor HTTP con Express
  const server = http.createServer(app);
  logger.success('Servidor HTTP creado correctamente');

  // 2. Inicializar Socket.IO con el servidor HTTP
  const io = new Server(server, {
    cors: getSocketCorsConfig(),
    transports: ['websocket', 'polling'],
  });
  logger.success('Socket.IO inicializado correctamente');

  // 3. Configurar eventos de Socket.IO
  io.on('connection', (socket) => {
    logger.success(`Cliente Socket.IO conectado: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.info(`Cliente Socket.IO desconectado: ${socket.id} (razón: ${reason})`);
    });

    // Aquí puedes agregar más eventos específicos de tu aplicación
    socket.on('join-room', (roomId) => {
      socket.join(roomId);
      logger.info(`Cliente ${socket.id} se unió a la sala: ${roomId}`);
    });

    socket.on('leave-room', (roomId) => {
      socket.leave(roomId);
      logger.info(`Cliente ${socket.id} salió de la sala: ${roomId}`);
    });
  });

  // 4. Hacer io disponible globalmente para las rutas
  global.io = io;

  // 5. Iniciar el servidor HTTP (esto es lo que Railway espera)
  server.listen(PORT, '0.0.0.0', () => {
    logger.success(`Servidor Express iniciado correctamente`);
    logger.success(`Escuchando en el puerto: ${PORT}`);
    logger.success(`Socket.IO listo para conexiones`);
  });

  // 6. Inicializar base de datos (PostgreSQL) sin bloquear el arranque del puerto
  bootstrapDatabase()
    .then(() => {
      logger.success('Database bootstrap completed successfully');
    })
    .catch((error) => {
      logger.error('No se pudo inicializar la base de datos PostgreSQL', error);
    });

  // 7. Verificación de Redis (si se utiliza más adelante)
  if (process.env.REDIS_URL || env.REDIS_URL) {
    logger.success('Conexión Redis configurada');
  } else {
    logger.info('No se configuró REDIS_URL. Se continuará sin Redis.');
  }

  // 8. Capturadores de errores a nivel global
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception thrown:', error);
  });

  // 9. Manejar señales de terminación correctamente (importante para Railway)
  const gracefulShutdown = () => {
    logger.info('Iniciando cierre graceful...');

    // Cerrar Socket.IO
    if (global.io) {
      global.io.close(() => {
        logger.success('Socket.IO cerrado correctamente');
      });
    }

    // Cerrar pool de PostgreSQL
    pool.end(() => {
      logger.success('Pool de PostgreSQL cerrado correctamente');
    });

    // Cerrar servidor HTTP
    server.close(() => {
      logger.success('Servidor cerrado correctamente');
      process.exit(0);
    });

    // Timeout de seguridad
    setTimeout(() => {
      logger.error('Cierre forzado por timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  // 10. Mantener el proceso vivo (importante para Railway)
  setInterval(() => {
    // Ping silencioso para mantener el proceso vivo
  }, 30000);
}

start();

module.exports = { app, io: global.io };
