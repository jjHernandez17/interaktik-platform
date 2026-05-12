# Backend Profesionalizado - Guía Completa

## 🎯 Estructura Nueva

```
backend/
├── src/
│   ├── config/           # Configuración
│   │   ├── env.js        # Variables de entorno
│   │   └── logger.js     # Sistema de logging
│   ├── database/         # Base de datos
│   │   ├── pool.js       # Conexión PostgreSQL
│   │   └── init.js       # Inicialización de schema
│   ├── middleware/       # Middlewares Express
│   │   ├── auth.js       # Autenticación
│   │   └── errorHandler.js  # Manejo de errores
│   ├── routes/           # Rutas API
│   │   ├── pages.js      # Páginas HTML/CSS/JS
│   │   ├── auth.js       # /api/auth/*
│   │   ├── gameRoutes.js # /api/game-state, /api/snake, /api/race
│   │   └── tiktok.js     # /api/tiktok-connection
│   ├── services/         # Lógica de negocio
│   │   ├── authService.js
│   │   ├── gameStateService.js
│   │   ├── snakeService.js
│   │   ├── raceService.js
│   │   └── tiktokService.js
│   └── utils/            # Utilidades
│       └── normalize.js  # Validación y sanitización
├── server.js             # Punto de entrada (95 líneas - limpio)
└── STRUCTURE.md          # Documentación técnica
```

## 🚀 Características de Producción

### Seguridad
- ✅ **helmet** - Headers HTTP seguros
- ✅ **cors** - Control de CORS
- ✅ **bcryptjs** - Hash seguro de contraseñas
- ✅ **variables de entorno** - Configuración segura

### Rendimiento
- ✅ **compression** - Compresión gzip automática
- ✅ **Pool PostgreSQL** - Conexiones optimizadas
- ✅ **Índices BD** - Consultas rápidas

### Mantenibilidad
- ✅ **Separación de responsabilidades** - Routes, Services, Middleware
- ✅ **Logging colorizado** - Debugging fácil
- ✅ **Manejo centralizado de errores** - Error handler global
- ✅ **Reutilización de código** - DRY principle

## 📦 Instalación

### 1. Instalar dependencias
```bash
npm install
```

Nuevas dependencias agregadas:
- `cors@^2.8.5` - Control de CORS
- `helmet@^7.1.0` - Headers de seguridad
- `compression@^1.7.4` - Compresión gzip
- `ioredis@^5.3.2` - Cliente Redis (para caching futuro)

### 2. Configurar variables de entorno

Copia `.env.example` a `.env` y configura:

```bash
# Environment
NODE_ENV=development

# Server
PORT=3000
CORS_ORIGIN=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/tiktok_interactive
DATABASE_SSL=false

# Session
SESSION_SECRET=tu-clave-super-secreta-aqui
```

## ▶️ Iniciar servidor

```bash
npm start
```

Output esperado:
```
[2026-05-12T03:48:37.341Z] INFO Starting server in development mode...
[2026-05-12T03:48:37.343Z] INFO Initializing database...
[2026-05-12T03:48:37.382Z] INFO ✅ Database connected
[2026-05-12T03:48:37.391Z] ✅ Database initialized successfully
Servidor listo en http://localhost:3000
```

## 📡 Rutas API

### Autenticación
```
POST   /api/auth/register         - Registrar usuario
POST   /api/auth/login            - Iniciar sesión
POST   /api/auth/logout           - Cerrar sesión
GET    /api/auth/me               - Obtener usuario actual
```

### Contador (App)
```
GET    /api/game-state            - Obtener estado del juego
PUT    /api/game-state            - Guardar estado del juego
```

### Snake vs Snake
```
GET    /api/snake-vs-snake/state  - Obtener estado
PUT    /api/snake-vs-snake/state  - Guardar estado
```

### Carrera (Race)
```
GET    /api/race/state            - Obtener estado
POST   /api/race/state            - Guardar estado
GET    /api/race/debug            - Debug (verificar tabla)
```

### TikTok
```
POST   /api/tiktok-connection     - Vincular cuenta TikTok
GET    /api/tiktok-connection/:gameType  - Obtener conexión
DELETE /api/tiktok-connection/:gameType  - Desvincula cuenta
```

### Páginas
```
GET    /                    - Landing page
GET    /login               - Página de login
GET    /register            - Página de registro
GET    /platform            - Dashboard
GET    /app                 - Juego Contador
GET    /snake-vs-snake      - Juego Snake vs Snake
GET    /race                - Juego Carrera
GET    /api/status          - Estado de conexión TikTok
GET    /events              - Server-sent events (SSE)
```

## 🔄 Flujo de una Solicitud

```
1. Cliente envía GET /api/game-state
   ↓
2. server.js recibe y pasa por middlewares:
   - helmet() - Headers de seguridad
   - compression() - Compresión
   - cors() - Validación de origen
   - express.json() - Parse JSON
   - session() - Gestión de sesión
   ↓
3. Enruta a gameRouter (/src/routes/gameRoutes.js)
   ↓
4. Middleware requireAuth valida sesión
   ↓
5. Controlador obtiene userId y llama a:
   gameStateService.loadGameState(userId)
   ↓
6. Service consulta base de datos:
   pool.query('SELECT ... FROM game_teams WHERE user_id = $1')
   ↓
7. Resultado se valida con sanitizeGameState()
   ↓
8. Response JSON se comprime y envía al cliente
```

## 🛠️ Estructura de un Servicio

```javascript
// services/miService.js
const pool = require('../database/pool');

async function obtenerDatos(userId) {
  const result = await pool.query(
    'SELECT * FROM tabla WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

module.exports = { obtenerDatos };
```

## 🛣️ Estructura de una Ruta

```javascript
// routes/miRuta.js
const express = require('express');
const { requireAuth, getSessionUserId } = require('../middleware/auth');
const miService = require('../services/miService');
const { normalizeError } = require('../utils/normalize');
const logger = require('../config/logger');

const router = express.Router();

router.get('/datos', requireAuth, async (req, res, next) => {
  try {
    const userId = getSessionUserId(req);
    const datos = await miService.obtenerDatos(userId);
    return res.json(datos);
  } catch (error) {
    logger.error('Error getting datos', error);
    return res.status(500).json({ error: normalizeError(error) });
  }
});

module.exports = router;
```

## 🔍 Debugging

### Ver logs
El servidor imprime logs coloridos en desarrollo:
- 🔵 INFO
- ✅ SUCCESS (verde)
- ⚠️ WARNING (amarillo)
- ❌ ERROR (rojo)

### Debug mode
En `src/config/logger.js` hay métodos de debugging:
```javascript
logger.debug('Variable:', myVar);
```

### Endpoints de debug
```
GET /api/race/debug - Verifica tabla y datos de carrera
```

## 🔐 Variables de Entorno

Todas las variables se definen en `src/config/env.js`:

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NODE_ENV` | development o production | development |
| `PORT` | Puerto del servidor | 3000 |
| `DATABASE_URL` | URL de PostgreSQL | Requerido |
| `DATABASE_SSL` | Usar SSL en BD | false |
| `SESSION_SECRET` | Clave de sesión (cambiar en prod) | dev-secret-change-this |
| `CORS_ORIGIN` | Origen permitido | http://localhost:3000 |
| `REDIS_URL` | URL de Redis (opcional) | redis://localhost:6379 |

## 📋 Checklist de Producción

- [ ] Cambiar `SESSION_SECRET` a valor aleatorio largo
- [ ] Configurar `DATABASE_SSL=true` si BD está en cloud
- [ ] Cambiar `NODE_ENV=production`
- [ ] Configurar `CORS_ORIGIN` al dominio correcto
- [ ] Ejecutar `npm audit` y revisar vulnerabilidades
- [ ] Configurar `helmet()` si es necesario más restrictivo
- [ ] Implementar rate limiting con `express-rate-limit`
- [ ] Agregar logs persistentes (archivo o servicio)
- [ ] Monitoreo de performance

## 🚀 Próximas Mejoras

- [ ] Socket.io para actualizaciones en tiempo real
- [ ] Redis para caching y session store distribuido
- [ ] Validación de entrada con `joi` o `zod`
- [ ] Tests automatizados con `jest`
- [ ] Documentación API con Swagger
- [ ] Rate limiting
- [ ] Backup automático de BD

## 📞 Soporte

Si tienes errores:
1. Verifica `.env` esté configurado correctamente
2. Comprueba que PostgreSQL esté corriendo
3. Revisa los logs del servidor
4. Intenta `npm install` de nuevo

