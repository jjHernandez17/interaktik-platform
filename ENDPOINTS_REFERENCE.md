# Referencia de Endpoints

Este archivo lista los endpoints del backend, la ruta exacta, el archivo donde esta declarado y que hace cada endpoint.

## Montaje General

Archivo: `backend/server.js`

El backend monta las rutas asi:

```txt
app.use('/api', authRouter)
app.use('/api', adminRouter)
app.use('/api', gameRouter)
app.use('/api', tiktokRouter)
app.get('/events')
app.use('/', pagesRouter)
```

Por eso las rutas declaradas dentro de `backend/src/routes/*.js` normalmente quedan expuestas con prefijo `/api`, excepto las rutas de `pages.js` y `/events`.

## Server

### `OPTIONS *`

- Ubicacion: `backend/server.js`
- Proteccion: ninguna
- Hace: responde preflight CORS de navegador antes de peticiones reales.
- Usa: `cors(getCorsConfig())`

### `GET /events`

- Ubicacion: `backend/server.js`
- Proteccion: no usa `requireAuth`, pero usa la sesion disponible para calcular `ownerKey`.
- Query:
  - `gameType`: opcional, puede ser `app`, `snake` o `race`.
- Hace:
  - Abre una conexion SSE `text/event-stream`.
  - Infere el juego.
  - Calcula el `ownerKey` del usuario/sesion.
  - Envia un evento inicial `status`.
  - Escucha eventos del `liveHub`.
  - Solo envia eventos cuyo `payload.gameType` y `payload.ownerKey` coincidan.
- Eventos que puede enviar:
  - `status`
  - `gift`
  - `giftCatalog`
  - `comment`
  - `member`
  - `like`
  - `share`
  - `follow`
  - `streamEnd`
- Importante: esta ruta separa eventos por usuario. No quitar el filtro por `ownerKey`.

## Auth

Archivo: `backend/src/routes/auth.js`

### `POST /api/auth/register`

- Ubicacion: `backend/src/routes/auth.js`
- Proteccion: publica
- Body:
  - `name`
  - `email`
  - `password`
- Hace:
  - Registra un usuario nuevo.
  - Normaliza email.
  - Hashea la contrasena.
  - Inserta en `app_users`.
  - Crea sesion guardando `req.session.user` y `req.session.userId`.
- Respuesta:
  - `201 { user }`
- Errores:
  - `409` si el correo ya existe.
  - `400` si faltan datos o password es invalida.

### `POST /api/auth/login`

- Ubicacion: `backend/src/routes/auth.js`
- Proteccion: publica
- Body:
  - `email`
  - `password`
- Hace:
  - Busca usuario por email.
  - Compara password con bcrypt.
  - Crea sesion guardando `req.session.user` y `req.session.userId`.
- Respuesta:
  - `{ user }`
- Errores:
  - `401` si las credenciales son invalidas.

### `POST /api/auth/logout`

- Ubicacion: `backend/src/routes/auth.js`
- Proteccion: publica, pero opera sobre la sesion actual.
- Hace:
  - Destruye la sesion.
  - Limpia cookie `connect.sid`.
- Respuesta:
  - `{ ok: true }`
- Errores:
  - `500` si no puede destruir la sesion.

### `GET /api/auth/me`

- Ubicacion: `backend/src/routes/auth.js`
- Proteccion: requiere tener `req.session.user`.
- Hace:
  - Devuelve el usuario autenticado.
  - Agrega `isSuperUser` si el correo es `juanjohervar1708@gmail.com`.
- Respuesta:
  - `{ user }`
- Errores:
  - `401` si no hay sesion.

## Admin

Archivo: `backend/src/routes/admin.js`

### `GET /api/admin/users`

- Ubicacion: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`
- Hace:
  - Lista todos los usuarios registrados.
  - Adjunta sus conexiones TikTok por juego desde `user_tiktok_connections`.
- Respuesta:
  - `{ users, total }`

### `GET /api/admin/users/:id`

- Ubicacion: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`
- Params:
  - `id`: ID numerico del usuario.
- Hace:
  - Busca el detalle de un usuario registrado.
  - Incluye conexiones TikTok por juego.
- Respuesta:
  - `{ user }`
- Errores:
  - `400` si el ID no es valido.
  - `404` si la cuenta no existe.

### `PUT /api/admin/users/:id`

- Ubicacion: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`
- Params:
  - `id`: ID numerico del usuario.
- Body:
  - `tiktokConnections`: objeto con claves `app`, `snake`, `race`.
- Ejemplo:

```json
{
  "tiktokConnections": {
    "app": "usuario_contador",
    "snake": "usuario_snake",
    "race": "usuario_race"
  }
}
```

- Hace:
  - Edita solo los IDs de TikTok vinculados por juego.
  - Si el valor de un juego viene vacio, elimina esa conexion.
  - Si viene con texto, inserta o actualiza `user_tiktok_connections`.
  - No edita nombre ni correo.
- Respuesta:
  - `{ user }`

### `DELETE /api/admin/users/:id`

- Ubicacion: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`
- Params:
  - `id`: ID numerico del usuario.
- Hace:
  - Elimina la cuenta desde `app_users`.
  - Elimina datos relacionados por `ON DELETE CASCADE`.
  - Limpia sesiones relacionadas en `user_sessions`.
- Respuesta:
  - `{ success: true, deletedUser }`
- Errores:
  - `404` si la cuenta no existe.

### `GET /api/games/availability`

- Ubicacion: `backend/src/routes/admin.js`
- Proteccion: `requireAuth`
- Hace:
  - Lista si cada juego esta habilitado o deshabilitado.
  - Lee la tabla `game_availability`.
- Respuesta:
  - `{ games }`
- Juegos:
  - `app`
  - `snake`
  - `race`

### `PUT /api/admin/games/:gameType/availability`

- Ubicacion: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`
- Params:
  - `gameType`: `app`, `snake` o `race`.
- Body:
  - `isEnabled`: boolean.
- Hace:
  - Habilita o deshabilita un juego.
  - Inserta/actualiza `game_availability`.
- Respuesta:
  - `{ game }`

## Game State

Archivo: `backend/src/routes/gameRoutes.js`

### `GET /api/game-state`

- Ubicacion: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`
- Hace:
  - Carga el estado del contador de puntos del usuario actual.
  - Usa `gameStateService.loadGameState(userId)`.
  - Puede migrar estado legacy desde `game_states` si no hay estado relacional.
- Respuesta:
  - `{ teams, gifts, history, updated_at }`

### `PUT /api/game-state`

- Ubicacion: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`
- Body:
  - `teams`
  - `gifts`
  - `history`
- Hace:
  - Guarda el estado completo del contador de puntos.
  - Reemplaza equipos, reglas e historial del usuario.
  - Usa `gameStateService.saveGameState(userId, body)`.
- Respuesta:
  - Estado normalizado guardado.

### `GET /api/snake-vs-snake/state`

- Ubicacion: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`
- Hace:
  - Carga el estado de Snake vs Snake del usuario actual.
  - Si no existe, devuelve estado default.
- Respuesta:
  - `{ settings, snakes, rules, history, updated_at }`

### `PUT /api/snake-vs-snake/state`

- Ubicacion: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`
- Body:
  - `settings`
  - `snakes`
  - `rules`
  - `history`
- Hace:
  - Guarda el estado completo de Snake vs Snake.
  - Usa `snakeService.saveSnakeVsSnakeState`.
  - Persiste en `snake_vs_snake_state`.
- Respuesta:
  - Estado normalizado guardado.

### `GET /api/race/state`

- Ubicacion: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`
- Hace:
  - Carga el estado de Carrera de Colegas del usuario actual.
  - Si no existe, devuelve estado vacio.
- Respuesta:
  - `{ participants, car_positions, finish_counts, viewer_bindings, history, updated_at }`

### `POST /api/race/state`

- Ubicacion: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`
- Body:
  - `participants`
  - `car_positions`
  - `finish_counts`
  - `viewer_bindings`
  - `history`
- Hace:
  - Guarda el estado de Carrera de Colegas.
  - Usa `raceService.saveRaceGameState`.
  - Persiste en `race_game_state`.
- Respuesta:
  - `{ success: true, updated_at }`

### `GET /api/race/debug`

- Ubicacion: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`
- Hace:
  - Diagnostica si existe la tabla `race_game_state`.
  - Devuelve si hay estado guardado para el usuario actual.
- Respuesta:
  - `{ table_exists, user_id, data_found, data, timestamp }`

## TikTok

Archivo: `backend/src/routes/tiktok.js`

### `GET /api/status`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: publica, pero usa sesion si existe.
- Query/body:
  - `gameType`: opcional.
- Hace:
  - Infere el juego actual.
  - Limpia conexiones live obsoletas.
  - Devuelve estado del backend, base de datos y TikTok Live.
- Respuesta:
  - Estado live.
  - `server`
  - `gameType`
  - `timestamp`
  - `sessionUser`

### `GET /api/gifts`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: publica.
- Query/body:
  - `gameType`: opcional.
- Hace:
  - Devuelve catalogo de regalos.
  - Si hay conexion live activa con catalogo, usa catalogo live.
  - Si no, usa `gifts-cache.json`.
- Respuesta:
  - `{ gifts, total, source, updated_at, gameType }`

### `POST /api/catalog`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: publica.
- Body:
  - `uniqueId`: ID TikTok opcional.
  - `gameType`: opcional.
- Hace:
  - Devuelve catalogo de regalos para un juego.
  - Normaliza o infiere `gameType`.
  - Usa catalogo live si existe; si no, cache local.
- Respuesta:
  - `{ uniqueId, gifts, total, source, gameType, warning }`

### `POST /api/connect`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: publica, pero guarda ID si hay sesion.
- Body:
  - `uniqueId`: ID TikTok.
  - `gameType`: opcional.
- Hace:
  - Conecta el juego a TikTok Live.
  - Si hay usuario autenticado, guarda el ID en `user_tiktok_connections`.
  - Crea/actualiza conexion en memoria en `tiktokLiveManager`.
  - Empieza a emitir eventos live por `/events` y Socket.IO.
- Respuesta:
  - Estado de conexion:
    - `gameType`
    - `uniqueId`
    - `status`
    - `message`
    - `error`
    - `roomId`
    - `availableGifts`
- Estados relevantes:
  - `connecting`
  - `connected`
  - `live_off`
  - `error`

### `POST /api/disconnect`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: publica, pero usa sesion si existe.
- Body/query:
  - `gameType`: opcional.
- Hace:
  - Desconecta el live del juego inferido.
  - No elimina el ID guardado en base de datos.
- Respuesta:
  - Estado vacio/desconectado del juego.

### `POST /api/tiktok-connection`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`
- Body:
  - `gameType`: `app`, `snake` o `race`.
  - `tiktokUsername`: ID de TikTok.
- Hace:
  - Guarda o actualiza el ID TikTok vinculado para ese usuario y juego.
  - Marca `is_linked = true`.
- Respuesta:
  - `{ success, tiktok_username, is_linked, linked_at }`

### `GET /api/tiktok-connection/app`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`
- Hace:
  - Obtiene el ID TikTok vinculado especificamente para el contador de puntos.
  - Lee `user_tiktok_connections` con `game_type = 'app'`.
- Respuesta si existe:
  - `{ connected, tiktok_username, linked_at }`
- Respuesta si no existe:
  - `{ connected: false, tiktok_username: null }`

### `DELETE /api/tiktok-connection/app`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`
- Hace:
  - Elimina el ID TikTok vinculado del contador.
  - Desconecta el live de `app` si estaba activo.
- Respuesta:
  - `{ success: true, message }`

### `GET /api/tiktok-connection/:gameType`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`
- Params:
  - `gameType`: `app`, `snake` o `race`.
- Hace:
  - Obtiene el ID TikTok vinculado para cualquier juego.
- Respuesta si existe:
  - `{ connected, tiktok_username, linked_at }`
- Respuesta si no existe:
  - `{ connected: false, tiktok_username: null }`

### `DELETE /api/tiktok-connection/:gameType`

- Ubicacion: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`
- Params:
  - `gameType`: `app`, `snake` o `race`.
- Hace:
  - Elimina el ID TikTok vinculado del juego indicado.
  - Desconecta el live de ese juego si estaba activo.
- Respuesta:
  - `{ success: true, message }`

## Pages y Assets

Archivo: `backend/src/routes/pages.js`

Estas rutas sirven HTML, CSS y JS desde el backend principalmente en local. En produccion redirigen al frontend de Vercel cuando corresponde.

### `GET /`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - En local, si hay sesion redirige a `/platform.html`; si no, sirve `frontend/index.html`.
  - En produccion, redirige a `${FRONTEND_URL}/platform.html` o `${FRONTEND_URL}/index.html`.

### `GET /index.html`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Sirve landing page en local.
  - Inyecta `/api/config.js`.
  - En produccion redirige a Vercel.

### `GET /landing.css`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Sirve `frontend/assets/css/landing.css`.

### `GET /auth.css`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Sirve `frontend/assets/css/auth.css`.

### `GET /auth.js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Sirve `frontend/js/auth.js`.

### `GET /dialog.js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Sirve `frontend/js/dialog.js`.

### `GET /login`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireGuestPage`
- Hace:
  - Sirve login en local.
  - Si el usuario ya tiene sesion, redirige a platform.
  - En produccion redirige a Vercel.

### `GET /login.html`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireGuestPage`
- Hace:
  - Igual que `GET /login`, pero con ruta `.html`.

### `GET /register`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireGuestPage`
- Hace:
  - Sirve registro en local.
  - Si el usuario ya tiene sesion, redirige a platform.
  - En produccion redirige a Vercel.

### `GET /register.html`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireGuestPage`
- Hace:
  - Igual que `GET /register`, pero con ruta `.html`.

### `GET /platform`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve panel principal en local.
  - Requiere sesion.
  - En produccion redirige a Vercel.

### `GET /platform.html`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Igual que `GET /platform`, pero con ruta `.html`.

### `GET /platform.css`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/assets/css/platform.css`.

### `GET /platform.js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/js/platform.js`.

### `GET /app`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Control adicional: `requireEnabledGame(req, res, 'app')`
- Hace:
  - Sirve contador de puntos en local.
  - Bloquea a usuario normal si el juego esta deshabilitado.
  - Permite entrar al superusuario.
  - En produccion redirige a Vercel.

### `GET /app.html`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Control adicional: `requireEnabledGame(req, res, 'app')`
- Hace:
  - Igual que `GET /app`, pero con ruta `.html`.

### `GET /app.js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/js/app.js`.

### `GET /styles.css`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/assets/css/styles.css`.

### `GET /snake-vs-snake`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Control adicional: `requireEnabledGame(req, res, 'snake')`
- Hace:
  - Sirve Snake vs Snake en local.
  - Bloquea a usuario normal si el juego esta deshabilitado.
  - Permite entrar al superusuario.
  - En produccion redirige a Vercel.

### `GET /snake-vs-snake.html`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Control adicional: `requireEnabledGame(req, res, 'snake')`
- Hace:
  - Igual que `GET /snake-vs-snake`, pero con ruta `.html`.

### `GET /snake-vs-snake.css`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/assets/css/snake-vs-snake.css`.

### `GET /snake-vs-snake.js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/js/snake-vs-snake.js`.

### `GET /race`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Control adicional: `requireEnabledGame(req, res, 'race')`
- Hace:
  - Sirve Carrera de Colegas en local.
  - Bloquea a usuario normal si el juego esta deshabilitado.
  - Permite entrar al superusuario.
  - En produccion redirige a Vercel.

### `GET /race.html`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Control adicional: `requireEnabledGame(req, res, 'race')`
- Hace:
  - Igual que `GET /race`, pero con ruta `.html`.

### `GET /race.css`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/assets/css/race.css`.

### `GET /race.js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: `requireAuthPage`
- Hace:
  - Sirve `frontend/js/race.js`.

### `USE /assets`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Sirve archivos estaticos desde `frontend/assets`.

### `USE /js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Sirve archivos JavaScript desde `frontend/js`.

### `GET /api/config.js`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Devuelve JavaScript que define `window.__INTERAKTIK_API_BASE_URL__`.
  - Ayuda a que el frontend sepa cual es la URL base del backend.
- Respuesta:

```js
window.__INTERAKTIK_API_BASE_URL__ = "..."
```

### `GET *`

- Ubicacion: `backend/src/routes/pages.js`
- Proteccion: publica.
- Hace:
  - Fallback para rutas no encontradas.
  - Si empieza por `/api/`, devuelve JSON `404`.
  - En produccion redirige a Vercel `/index.html`.
  - En local redirige a `/`.

