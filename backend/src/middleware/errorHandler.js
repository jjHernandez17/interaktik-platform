const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
