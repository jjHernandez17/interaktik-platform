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
app.use(helmet());
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
async function start() {
  try {
    logger.info(`Starting server in ${env.NODE_ENV} mode...`);

    // Bootstrap database
    await bootstrapDatabase();

    // Start listening
    app.listen(env.PORT, () => {
      logger.success(`Servidor listo en http://localhost:${env.PORT}`);
      console.log(`Servidor listo en http://localhost:${env.PORT}`);
    });
  } catch (error) {
    logger.error('No se pudo iniciar el servidor', error);
    process.exit(1);
  }
}

start();

module.exports = app;
