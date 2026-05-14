const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Config
const env = require('./src/config/env');
const logger = require('./src/config/logger');

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
app.use(compression());
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

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
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

// Routes
app.use('/api', authRouter);
app.use('/api', gameRouter);
app.use('/api', tiktokRouter);
app.use('/', pagesRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
function start() {
  const PORT = process.env.PORT || env.PORT || 3000;
  logger.info(`Starting server in ${env.NODE_ENV} mode...`);

  // 1. Iniciamos el servidor EXPRESS primero para no bloquear a Railway / Render
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.success(`Servidor iniciado correctamente`);
    logger.success(`Escuchando en el puerto: ${PORT}`);
  });

  // 2. Inicializamos base de datos (PostgreSQL) sin bloquear el arranque del puerto
  bootstrapDatabase()
    .then(() => {
      logger.success('Database bootstrap completed successfully');
    })
    .catch((error) => {
      logger.error('No se pudo inicializar la base de datos PostgreSQL', error);
    });

  // 3. Verificación de Redis (si se utiliza más adelante, dejamos el log de si está configurado)
  if (process.env.REDIS_URL || env.REDIS_URL) {
    logger.success(`Conexión Redis configurada`);
  } else {
    logger.info(`No se configuró REDIS_URL. Se continuará sin Redis.`);
  }

  // Capturadores de errores a nivel global para que no muera en promesas infinitas
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception thrown:', error);
  });
}

start();

module.exports = app;
