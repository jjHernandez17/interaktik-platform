// Limites de intentos para las rutas de autenticacion (login, registro,
// recuperacion de contraseña). Antes no habia ninguno: un atacante podia
// probar contraseñas sin limite (fuerza bruta / credential stuffing) o
// bombardear el correo de un usuario con reenvios de verificacion/reset.
// Solo se aplica a estas rutas puntuales, nunca de forma global, para no
// afectar los endpoints que los juegos consultan en bucle (polling).

const rateLimit = require('express-rate-limit');

// `trust proxy` ya esta activo en server.js (Railway/Render van detras de
// proxy), asi que req.ip refleja la IP real del cliente via X-Forwarded-For.
function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    handler: (req, res, _next, options) => {
      res.status(options.statusCode).json(options.message);
    },
  });
}

// Login: intentos limitados por IP para frenar fuerza bruta de contraseñas.
const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Demasiados intentos de inicio de sesion. Intenta de nuevo en unos minutos.',
});

// Registro: evita que un script cree cuentas en masa desde la misma IP.
const registerLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiadas cuentas creadas desde esta conexion. Intenta de nuevo mas tarde.',
});

// Recuperacion de contraseña / reenvio de verificacion: ambas disparan un
// correo por intento, asi que ademas de frenar fuerza bruta evitan que se
// use el endpoint para bombardear la bandeja de entrada de un tercero.
const emailActionLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: 'Demasiadas solicitudes. Intenta de nuevo mas tarde.',
});

// Cambio/restablecimiento de contraseña: menos margen que login porque cada
// intento consume (o intenta consumir) un token de un solo uso.
const passwordChangeLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos. Intenta de nuevo en unos minutos.',
});

module.exports = {
  loginLimiter,
  registerLimiter,
  emailActionLimiter,
  passwordChangeLimiter,
};
