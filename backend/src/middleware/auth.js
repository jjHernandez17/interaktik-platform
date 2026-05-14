function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Debes iniciar sesion.' });
  }
  return next();
}

function requireAuthPage(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  return next();
}

function requireGuestPage(req, res, next) {
  if (req.session.user) {
    return res.redirect('/platform.html');
  }
  return next();
}

function getSessionUserId(req) {
  return Number(req.session?.userId || req.session?.user?.id || 0) || null;
}

module.exports = {
  requireAuth,
  requireAuthPage,
  requireGuestPage,
  getSessionUserId,
};
