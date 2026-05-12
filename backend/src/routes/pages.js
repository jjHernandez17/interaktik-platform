const express = require('express');
const path = require('path');
const { requireAuth, requireAuthPage, requireGuestPage, getSessionUserId } = require('../middleware/auth');
const { normalizeError } = require('../utils/normalize');

const router = express.Router();

// Static files
router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/platform.html');
  }
  return res.sendFile(path.join(__dirname, '../../../frontend/index.html'));
});

router.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/index.html'));
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
router.get('/login', requireGuestPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/login.html'));
});

router.get('/login.html', requireGuestPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/login.html'));
});

router.get('/register', requireGuestPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/register.html'));
});

router.get('/register.html', requireGuestPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/register.html'));
});

// Platform
router.get('/platform', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/platform.html'));
});

router.get('/platform.html', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/platform.html'));
});

router.get('/platform.css', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/platform.css'));
});

router.get('/platform.js', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/platform.js'));
});

// App (Contador)
router.get('/app', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/app.html'));
});

router.get('/app.html', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/app.html'));
});

router.get('/app.js', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/app.js'));
});

router.get('/styles.css', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/styles.css'));
});

// Snake vs Snake
router.get('/snake-vs-snake', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/snake-vs-snake.html'));
});

router.get('/snake-vs-snake.html', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/snake-vs-snake.html'));
});

router.get('/snake-vs-snake.css', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/assets/css/snake-vs-snake.css'));
});

router.get('/snake-vs-snake.js', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/js/snake-vs-snake.js'));
});

// Race
router.get('/race', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/race.html'));
});

router.get('/race.html', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/race.html'));
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

// Fallback
router.get('*', (req, res) => {
  res.redirect('/');
});

module.exports = router;
