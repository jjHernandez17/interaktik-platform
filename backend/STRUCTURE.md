# Profesionalized Backend Structure

## Carpetas y Archivos

### `/src/config`
- `env.js` - Manejo de variables de entorno
- `logger.js` - Sistema de logging colorizado

### `/src/database`
- `pool.js` - Configuración de conexión PostgreSQL
- `init.js` - Inicialización de tablas y esquema

### `/src/middleware`
- `auth.js` - Middlewares de autenticación y autorización
- `errorHandler.js` - Manejo de errores global

### `/src/routes`
- `pages.js` - Rutas de páginas estáticas (HTML, CSS, JS)
- `auth.js` - Rutas de autenticación (`/api/auth/*`)
- `gameRoutes.js` - Rutas de juegos (`/api/game-state`, `/api/snake-vs-snake`, `/api/race`)
- `tiktok.js` - Rutas de TikTok (`/api/tiktok-connection`)

### `/src/services`
- `authService.js` - Lógica de registro y login
- `gameStateService.js` - Manejo de estado del juego Contador
- `snakeService.js` - Manejo de estado Snake vs Snake
- `raceService.js` - Manejo de estado Carrera
- `tiktokService.js` - Manejo de conexiones TikTok

### `/src/utils`
- `normalize.js` - Funciones de validación y sanitización de datos

## Características de Producción

✅ **Seguridad**
- `helmet` - Headers de seguridad HTTP
- `cors` - Control de CORS
- `bcryptjs` - Hash seguro de contraseñas
- Variables de entorno (`.env`)

✅ **Rendimiento**
- `compression` - Compresión de respuestas
- Pool de conexiones PostgreSQL optimizado
- Índices de base de datos

✅ **Organización**
- Separación de responsabilidades (routes, services, middleware)
- Logging colorizado
- Manejo centralizado de errores
- Reutilización de código

✅ **Variables de Entorno**
```
NODE_ENV          - production | development
PORT              - Puerto del servidor (default: 3000)
DATABASE_URL      - URL de PostgreSQL
DATABASE_SSL      - true | false
SESSION_SECRET    - Clave de sesión (cambiar en producción)
CORS_ORIGIN       - Origen permitido
REDIS_URL         - URL de Redis (opcional)
```

## Instalación de Dependencias

```bash
npm install
```

Esto instala:
- `cors` - Control de CORS entre dominios
- `helmet` - Headers de seguridad
- `compression` - Compresión gzip
- `ioredis` - Cliente Redis (para futura implementación de cache)

## Inicio de Servidor

```bash
npm start
```

El servidor se inicia en `http://localhost:3000` (o el puerto configurado en `.env`)

## Migraciones de Código

### Antes (Monolítico)
```javascript
// Todo en server.js (2600+ líneas)
```

### Después (Modularizado)
```
server.js                  ← Limpio (95 líneas)
├── src/config/           ← Configuración
├── src/database/         ← Base de datos
├── src/middleware/       ← Middlewares
├── src/routes/           ← Rutas API
├── src/services/         ← Lógica de negocio
└── src/utils/            ← Utilidades
```

## Flujo de una Solicitud

1. **Entrada** → `server.js` recibe solicitud
2. **Middleware** → helmet, cors, compression, session
3. **Rutas** → pages.js, auth.js, gameRoutes.js, tiktok.js
4. **Servicios** → Lógica de negocio (authService, gameStateService, etc)
5. **Database** → Pool de conexiones PostgreSQL
6. **Respuesta** → JSON o error

## Próximos Pasos Opcionales

- [ ] Implementar Redis para caching
- [ ] Agregar Socket.io para live updates
- [ ] Rate limiting con `express-rate-limit`
- [ ] Validación con `joi` o `zod`
- [ ] Tests con `jest`
- [ ] Documentación con `swagger`

