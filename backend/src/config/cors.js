// Configuración CORS centralizada
const env = require('./env');
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://interaktik-platform.vercel.app',
  'https://interaktik-platform-git-main-juan-jose-hernandez-s-projects.vercel.app',
  'https://interaktik.com',
  'https://www.interaktik.com',
  env.FRONTEND_URL,
  ...String(env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const logger = require('./logger');

function isOriginAllowed(origin) {
  // Permitir requests sin origin (como mobile apps, curl, etc.)
  if (!origin) {
    logger.info('CORS: Request sin origin permitido (mobile/curl)');
    return true;
  }

  if (/^https:\/\/[^\s]+\.up\.railway\.app$/i.test(origin)) {
    logger.success(`CORS: Origin Railway permitido - ${origin}`);
    return true;
  }

  const allowed = ALLOWED_ORIGINS.includes(origin);
  if (allowed) {
    logger.success(`CORS: Origin permitido - ${origin}`);
  } else {
    logger.error(`CORS: Origin bloqueado - ${origin}`);
  }

  return allowed;
}

function getCorsConfig() {
  return {
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, origin || false);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control'
    ],
    optionsSuccessStatus: 200 // Para legacy browsers
  };
}

function getSocketCorsConfig() {
  return {
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, origin || false);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type']
  };
}

module.exports = {
  ALLOWED_ORIGINS,
  isOriginAllowed,
  getCorsConfig,
  getSocketCorsConfig
};