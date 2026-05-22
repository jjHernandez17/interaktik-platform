const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { requireAuth, requireAuthPage, requireGuestPage, getSessionUserId } = require('../middleware/auth');
const { normalizeError } = require('../utils/normalize');
const env = require('../config/env');
const logger = require('../config/logger');

const router = express.Router();
const isProduction = env.NODE_ENV === 'production';

function getFrontendUrl(pathname) {
  return `${env.FRONTEND_URL}${pathname}`;
}

function redirectFrontendPage(res, pathname, reason) {
  const target = getFrontendUrl(pathname);
  if (reason) {
    logger.info(`[pages] ${reason} -> ${target}`);
  }
  return res.redirect(target);
}

function shouldServeBackendPages() {
  return !isProduction;
}

// Helper to inject API base URL into HTML
async function injectApiBaseUrl(filePath, apiBaseUrl) {
  let html = await fs.readFile(filePath, 'utf-8');
  const scriptTag = `<script src="/api/config.js"></script>`;
  
  // Insertar script tag antes del cierre de </head> o al inicio de </body>
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${scriptTag}\n  </head>`);
  } else if (html.includes('<body')) {
    html = html.replace(/<body[^>]*>/i, (match) => `${match}\n  ${scriptTag}`);
  }
  
  return html;
}

// Helper to get API base URL based on request origin
function getApiBaseUrl(req) {
  const origin = req.headers.origin;
  let apiBaseUrl = 'http://localhost:3000'; // default

  if (origin) {
    // Lista de origins permitidos
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://interaktik-platform.vercel.app'
    ];

    if (allowedOrigins.includes(origin)) {
      apiBaseUrl = origin;
    }
  }

  return apiBaseUrl;
}

// Static files
router.get('/', (req, res) => {
  if (isProduction) {
    return redirectFrontendPage(res, req.session.user ? '/platform.html' : '/index.html', 'Root request in production');
  }

  if (req.session.user) {
    return res.redirect('/platform.html');
  }
  return res.sendFile(path.join(__dirname, '../../../frontend/index.html'));
});

router.get('/index.html', async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/index.html', 'Index page request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/index.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

router.get('/landing.css', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/landing.css'));
});

router.get('/auth.css', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/auth.css'));
});

router.get('/auth.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/auth.js'));
});

router.get('/dialog.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/dialog.js'));
});

// Auth pages
router.get('/login', requireGuestPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/login.html', 'Login page request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/login.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading login');
  }
});

router.get('/login.html', requireGuestPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/login.html', 'Login HTML request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/login.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading login');
  }
});

router.get('/register', requireGuestPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/register.html', 'Register page request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/register.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading register');
  }
});

router.get('/register.html', requireGuestPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/register.html', 'Register HTML request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/register.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading register');
  }
});

// Platform
router.get('/platform', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/platform.html', 'Platform page request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/platform.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading platform');
  }
});

router.get('/platform.html', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/platform.html', 'Platform HTML request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/platform.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading platform');
  }
});

router.get('/platform.css', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/platform.css'));
});

router.get('/platform.js', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/platform.js'));
});

// App (Contador)
router.get('/app', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/app.html', 'App page request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/app.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading app');
  }
});

router.get('/app.html', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/app.html', 'App HTML request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/app.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading app');
  }
});

router.get('/app.js', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/app.js'));
});

router.get('/styles.css', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/styles.css'));
});

// Snake vs Snake
router.get('/snake-vs-snake', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/snake-vs-snake.html', 'Snake vs Snake page request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/snake-vs-snake.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading game');
  }
});

router.get('/snake-vs-snake.html', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/snake-vs-snake.html', 'Snake vs Snake HTML request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/snake-vs-snake.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading game');
  }
});

router.get('/snake-vs-snake.css', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/snake-vs-snake.css'));
});

router.get('/snake-vs-snake.js', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/snake-vs-snake.js'));
});

// Race
router.get('/race', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/race.html', 'Race page request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/race.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading game');
  }
});

router.get('/race.html', requireAuthPage, async (req, res) => {
  try {
    if (!shouldServeBackendPages()) {
      return redirectFrontendPage(res, '/race.html', 'Race HTML request in production');
    }

    const apiBaseUrl = getApiBaseUrl(req);
    const html = await injectApiBaseUrl(path.join(__dirname, '../../../frontend/race.html'), apiBaseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading game');
  }
});

router.get('/race.css', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/race.css'));
});

router.get('/race.js', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/race.js'));
});

// Assets
router.use('/assets', express.static(path.join(__dirname, '../../../frontend/assets')));
router.use('/js', express.static(path.join(__dirname, '../../../frontend/js')));

// Config endpoint
router.get('/api/config.js', (req, res) => {
  const apiBaseUrl = getApiBaseUrl(req);
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.__INTERAKTIK_API_BASE_URL__ = "${apiBaseUrl}";`);
});

// Fallback
router.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    logger.warn(`[pages] API endpoint inexistente: ${req.originalUrl}`);
    return res.status(404).json({ error: 'Not found' });
  }

  if (isProduction) {
    return redirectFrontendPage(res, '/index.html', 'Fallback page request in production');
  }

  res.redirect('/');
});

module.exports = router;
