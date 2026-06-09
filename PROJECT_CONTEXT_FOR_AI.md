# Contexto del proyecto para otra IA

Este documento resume que hace cada parte del proyecto `tiktokInteractive` para que otra IA pueda entenderlo rapido antes de modificar codigo.

## Resumen General

`tiktokInteractive` es una plataforma web interactiva para juegos conectados a TikTok Live.

La plataforma tiene:

- Landing page publica.
- Registro e inicio de sesion.
- Panel principal con configuracion de cuenta, lista de juegos y seccion de superusuario.
- Tres juegos:
  - `app`: Contador de puntos.
  - `snake`: Snake vs Snake.
  - `race`: Carrera de Colegas.
- Conexion a TikTok Live por usuario y por juego.
- Persistencia en PostgreSQL.
- Backend desplegable en Railway.
- Frontend desplegable en Vercel.

El superusuario fijo es:

```txt
juanjohervar1708@gmail.com
```

Ese usuario puede ver cuentas registradas, eliminar cuentas, editar IDs de TikTok por juego y habilitar/deshabilitar juegos.

## Arquitectura

El backend es Express/CommonJS y vive en `backend/`.

El frontend es HTML, CSS y JavaScript vanilla y vive en `frontend/`.

La base de datos es PostgreSQL. Las tablas se crean desde `backend/src/database/init.js` al arrancar el servidor.

El backend sirve APIs bajo `/api`. Tambien puede servir paginas HTML en local. En produccion, el frontend normalmente vive en Vercel y llama al backend de Railway usando `window.API_BASE_URL`, definido en `frontend/js/config.js`.

## Flujos Principales

### Autenticacion

1. El usuario se registra o inicia sesion desde `frontend/login.html` o `frontend/register.html`.
2. `frontend/js/auth.js` llama a:
   - `POST /api/auth/register`
   - `POST /api/auth/login`
3. `backend/src/routes/auth.js` valida credenciales con `backend/src/services/authService.js`.
4. El backend guarda la sesion en PostgreSQL con `connect-pg-simple`, tabla `user_sessions`.
5. `GET /api/auth/me` devuelve el usuario actual e incluye `isSuperUser`.

### TikTok Live

Cada juego tiene un ID de TikTok vinculado en `user_tiktok_connections`.

Estados esperados de conexion:

- Sin ID guardado: `Desvinculado`
- ID guardado pero sin conectar live: `Vinculado`
- Boton conectar presionado: `cargando...`
- Conexion exitosa: `conectado`
- Cuenta no esta en live: `live apagado`
- Otro error: `error al conectar live, por favor contactate con un desarrollador`

El backend usa `tiktok-live-connector` en `backend/src/services/tiktokLiveManager.js`.

Los eventos live se publican por:

- SSE en `/events`
- Socket.IO como compatibilidad adicional

El filtrado de eventos live depende de `ownerKey`, que identifica al dueno de la conexion:

```txt
user:{userId}:{gameType}
session:{sessionId}:{gameType}
```

Esto evita que eventos de un usuario se filtren a otro usuario.

### Disponibilidad de Juegos

La tabla `game_availability` controla si un juego esta habilitado.

Juegos:

- `app`
- `snake`
- `race`

Usuarios normales no deben poder entrar a juegos deshabilitados. El superusuario si puede entrar y cambiar el estado desde las tarjetas de juegos en `platform.html`.

## Base de Datos

Tablas principales creadas en `backend/src/database/init.js`:

- `app_users`: usuarios registrados.
- `user_sessions`: sesiones de Express, creada por `connect-pg-simple`.
- `game_states`: estado legacy JSONB del contador.
- `game_state_meta`: metadata del estado relacional del contador.
- `game_teams`: participantes/equipos del contador.
- `game_gift_rules`: reglas regalo -> puntos/equipo del contador.
- `game_history_entries`: historial del contador.
- `user_gift_catalog`: catalogo de regalos por usuario.
- `snake_vs_snake_state`: estado completo de Snake vs Snake.
- `race_game_state`: estado completo de Carrera de Colegas.
- `user_tiktok_connections`: ID de TikTok vinculado por usuario y juego.
- `game_availability`: habilitado/deshabilitado de cada juego.

Muchas tablas tienen `ON DELETE CASCADE` hacia `app_users`. Si se elimina una cuenta, se elimina tambien su estado de juegos, reglas, historial y conexiones TikTok.

## Archivos de Raiz

### `package.json`

Define el proyecto principal. Script:

```txt
npm start -> node backend/server.js
```

Incluye dependencias backend como Express, PostgreSQL, sesiones, CORS y TikTok Live.

### `package-lock.json`

Lockfile de dependencias del proyecto raiz.

### `.env`

Variables reales del entorno local. No debe compartirse publicamente.

### `.env.example`

Plantilla de variables de entorno.

### `.gitignore`

Archivos/carpetas ignorados por Git.

### `README.md`

Documentacion general inicial del proyecto.

### `ARCHITECTURE.md`

Documento previo de arquitectura. Sirve como referencia historica.

### `BACKEND_GUIDE.md`

Guia sobre backend y APIs.

### `BACKEND_SUMMARY.md`

Resumen del backend.

### `DEBUGGING.md`

Notas de depuracion.

### `IMPLEMENTATION_CHECKLIST.md`

Checklist historico de implementacion.

### `RACE_GAME_DIAGNOSTICS.md`

Notas especificas de diagnostico del juego de carrera.

### `gifts-cache.json`

Catalogo local/cacheado de regalos TikTok. El backend lo usa como fallback cuando no hay catalogo live.

### `init_db.sql`, `recreate_tables.sql`

Scripts SQL sueltos para inicializar o recrear tablas. La fuente activa de creacion automatica esta en `backend/src/database/init.js`.

### `test-socket-cors.js`

Script de prueba para revisar CORS/Socket.IO.

## Backend

### `backend/package.json`

Package propio del backend. Script:

```txt
npm start -> node server.js
```

Tiene dependencias Express, Socket.IO, PostgreSQL, sesiones y `tiktok-live-connector`.

### `backend/package-lock.json`

Lockfile del backend.

### `backend/STRUCTURE.md`

Documento de estructura del backend.

### `backend/server.js`

Punto de entrada del backend.

Responsabilidades:

- Crear app Express.
- Configurar Helmet, compression, CORS y body parsers.
- Configurar sesiones en PostgreSQL.
- Montar rutas `/api`.
- Crear endpoint SSE `/events`.
- Crear servidor HTTP.
- Inicializar Socket.IO.
- Ejecutar `bootstrapDatabase()`.
- Manejar errores globales y cierre graceful.

Punto importante: `/events` filtra eventos por `gameType` y `ownerKey`.

## Backend Config

### `backend/src/config/env.js`

Centraliza variables de entorno como `NODE_ENV`, `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `FRONTEND_URL`, `REDIS_URL`.

### `backend/src/config/cors.js`

Define origins permitidos para CORS y Socket.IO. Debe incluir Vercel, Railway y localhost segun el entorno.

### `backend/src/config/logger.js`

Logger simple usado por backend para `info`, `warn`, `error`, `success`.

## Backend Database

### `backend/src/database/pool.js`

Crea y exporta el pool de PostgreSQL.

Usado por servicios, rutas admin y bootstrap de DB.

### `backend/src/database/init.js`

Crea tablas e indices si no existen.

Tambien inserta disponibilidad por defecto:

```txt
app=true
snake=true
race=true
```

Es la referencia principal para entender el esquema actual.

## Backend Middleware

### `backend/src/middleware/auth.js`

Contiene:

- `requireAuth`: protege APIs.
- `requireAuthPage`: protege paginas servidas por backend.
- `requireGuestPage`: evita que usuarios logueados entren a login/register.
- `getSessionUserId`: obtiene ID desde sesion.
- `requireSuperUser`: protege APIs admin.
- `isSuperUserEmail`: valida el correo fijo del superusuario.
- `attachAuthFlags`: agrega `isSuperUser` al objeto user.

### `backend/src/middleware/errorHandler.js`

Manejadores Express para errores y 404.

## Backend Routes

### `backend/src/routes/auth.js`

Rutas de autenticacion:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Guarda `req.session.user` y `req.session.userId`.

### `backend/src/routes/admin.js`

Rutas del superusuario:

- `GET /api/admin/users`: lista usuarios y conexiones TikTok.
- `GET /api/admin/users/:id`: detalle de usuario.
- `PUT /api/admin/users/:id`: edita IDs de TikTok por juego.
- `DELETE /api/admin/users/:id`: elimina cuenta y sesiones relacionadas.
- `GET /api/games/availability`: lista disponibilidad de juegos.
- `PUT /api/admin/games/:gameType/availability`: habilita/deshabilita juegos.

Solo `GET /api/games/availability` requiere usuario autenticado normal. Las demas rutas admin requieren superusuario.

### `backend/src/routes/gameRoutes.js`

Rutas de estado de juegos:

Contador:

- `GET /api/game-state`
- `PUT /api/game-state`

Snake:

- `GET /api/snake-vs-snake/state`
- `PUT /api/snake-vs-snake/state`

Carrera:

- `GET /api/race/state`
- `POST /api/race/state`
- `GET /api/race/debug`

Cada ruta usa `requireAuth` y guarda/carga por `userId`.

### `backend/src/routes/tiktok.js`

Rutas TikTok y catalogo:

- `GET /api/status`: estado servidor + estado TikTok del juego inferido.
- `GET /api/gifts`: catalogo de regalos.
- `POST /api/catalog`: catalogo para un usuario/live.
- `POST /api/connect`: conecta a TikTok Live.
- `POST /api/disconnect`: desconecta live.
- `POST /api/tiktok-connection`: guarda ID TikTok por `gameType`.
- `GET /api/tiktok-connection/app`: obtiene ID para contador.
- `DELETE /api/tiktok-connection/app`: elimina ID para contador.
- `GET /api/tiktok-connection/:gameType`: obtiene ID para cualquier juego.
- `DELETE /api/tiktok-connection/:gameType`: elimina ID para cualquier juego.

Nota importante: `POST /api/connect` tambien guarda el ID si hay usuario autenticado.

### `backend/src/routes/pages.js`

Rutas para servir HTML/CSS/JS desde el backend en local.

En produccion redirige al frontend de Vercel usando `env.FRONTEND_URL`.

Tambien:

- Protege paginas con sesion.
- Bloquea juegos deshabilitados para usuarios normales.
- Sirve `/api/config.js`, que inyecta `window.__INTERAKTIK_API_BASE_URL__`.

En produccion, el frontend estatico en Vercel normalmente debe usar `frontend/js/config.js` para apuntar al backend Railway.

## Backend Services

### `backend/src/services/authService.js`

Logica de registro/login.

- Normaliza email.
- Hashea password con bcrypt.
- Valida password en login.
- Devuelve user con `isSuperUser`.

### `backend/src/services/gameStateService.js`

Persistencia del contador de puntos.

Usa modelo relacional:

- `game_teams`
- `game_gift_rules`
- `game_history_entries`
- `game_state_meta`

Tambien puede migrar desde `game_states` legacy JSONB si encuentra datos antiguos.

### `backend/src/services/snakeService.js`

Persistencia de Snake vs Snake en `snake_vs_snake_state`.

Guarda JSONB:

- `settings`
- `snakes`
- `rules`
- `history`

Usa `sanitizeSnakeVsSnakeState` para limpiar payloads.

### `backend/src/services/raceService.js`

Persistencia de Carrera en `race_game_state`.

Guarda JSONB:

- `participants`
- `car_positions`
- `finish_counts`
- `viewer_bindings`
- `history`

### `backend/src/services/tiktokService.js`

Funciones auxiliares TikTok:

- `saveTiktokConnection(userId, gameType, tiktokUsername)`
- `getTiktokConnection(userId, gameType)`
- `deleteTiktokConnection(userId, gameType)`
- `getGiftCatalog()`
- `getStatus()`

Lee `gifts-cache.json` como fallback de catalogo.

### `backend/src/services/tiktokLiveManager.js`

Nucleo de TikTok Live.

Responsabilidades:

- Cargar `tiktok-live-connector`.
- Normalizar `gameType`.
- Inferir juego desde body/query/referer.
- Crear claves `ownerKey` por usuario/sesion/juego.
- Mantener `connections` en memoria.
- Conectar/desconectar TikTok Live.
- Convertir eventos live a payloads simples.
- Publicar eventos al hub SSE y Socket.IO.
- Detectar errores de live apagado.
- Limpiar conexiones obsoletas si el ID vinculado cambio o se borro.

Eventos TikTok publicados:

- `gift`
- `comment`
- `member`
- `like`
- `share`
- `follow`
- `streamEnd`
- `status`
- `giftCatalog`

### `backend/src/services/liveHub.js`

EventEmitter compartido para enviar eventos live al endpoint SSE `/events`.

### `backend/src/utils/normalize.js`

Funciones de limpieza/sanitizacion.

Incluye normalizadores para:

- emails
- colores
- fechas
- numeros
- estado del contador
- estado Snake
- estado Carrera
- errores

Archivo importante para evitar que payloads del frontend rompan la DB.

## Frontend HTML

### `frontend/index.html`

Landing page publica.

Presenta la plataforma y enlaces a login/registro.

### `frontend/login.html`

Formulario de inicio de sesion.

Usa:

- `frontend/js/config.js`
- `frontend/js/dialog.js`
- `frontend/js/auth.js`
- `frontend/assets/css/auth.css`

### `frontend/register.html`

Formulario de registro.

Usa los mismos scripts base de auth.

### `frontend/platform.html`

Panel principal despues de iniciar sesion.

Contiene:

- Menu lateral.
- Datos de cuenta.
- Tarjetas de juegos.
- Seccion superusuario.
- Modal de editar usuario.

Usa `frontend/js/platform.js`.

### `frontend/app.html`

Juego Contador de puntos.

Permite:

- Vincular ID TikTok.
- Conectar live.
- Crear participantes/equipos.
- Crear reglas regalo -> puntos -> participante.
- Ver tablero de puntos.
- Ajustar puntajes.
- Ver historial.

Usa `frontend/js/app.js` y `frontend/assets/css/styles.css`.

### `frontend/snake-vs-snake.html`

Juego Snake vs Snake.

Permite:

- Vincular ID TikTok.
- Conectar live.
- Configurar nombre/color/fondo de cada serpiente.
- Configurar reglas de regalo por serpiente.
- Generar manzanas por regalos live.
- Pausar/reanudar/reiniciar.
- Ver tablero y ganador.

Usa `frontend/js/snake-vs-snake.js`.

### `frontend/race.html`

Juego Carrera de Colegas.

Permite:

- Vincular ID TikTok.
- Conectar live.
- Crear participantes.
- Asignar carros/avatares.
- Avanzar por monedas/regalos/comentarios segun la logica actual.
- Ver historial y ganador.

Usa `frontend/js/race.js`.

## Frontend JavaScript

### `frontend/js/config.js`

Define `window.API_BASE_URL`.

Logica:

- Si existe `window.__INTERAKTIK_API_BASE_URL__`, lo usa.
- Si hay `?apiBaseUrl=...`, lo usa.
- Si hay override en `localStorage`, lo usa.
- Si esta en localhost, usa `window.location.origin`.
- Si esta en produccion, usa Railway:

```txt
https://interaktik-platform-production.up.railway.app
```

Este archivo es clave porque Vercel no tiene backend propio. Las APIs deben apuntar a Railway.

### `frontend/js/dialog.js`

Utilidades de dialogos/modales/confirmaciones reutilizables.

### `frontend/js/auth.js`

Logica de login y registro.

Llama a:

- `${API_BASE_URL}/api/auth/login`
- `${API_BASE_URL}/api/auth/register`

Despues redirige a `platform.html`.

### `frontend/js/platform.js`

Logica del panel principal.

Responsabilidades:

- Cargar usuario con `/api/auth/me`.
- Mostrar nombre/correo.
- Mostrar/ocultar seccion admin segun `isSuperUser`.
- Navegacion entre secciones.
- Logout.
- Listar usuarios admin.
- Buscar usuarios por correo.
- Editar IDs TikTok por juego en modal.
- Eliminar cuentas.
- Cargar y aplicar disponibilidad de juegos.
- Agregar controles habilitar/deshabilitar dentro de cada tarjeta para superusuario.
- Bloquear visualmente juegos deshabilitados para usuario normal.

### `frontend/js/app.js`

Logica completa del contador de puntos.

Responsabilidades:

- Estado local de equipos, reglas, historial y catalogo.
- Cargar/guardar estado en `/api/game-state`.
- Crear/eliminar equipos.
- Crear/eliminar reglas de regalos.
- Aplicar regalos manuales.
- Ajustar puntos manualmente.
- Renderizar scoreboard, lista de equipos e historial.
- Cargar catalogo de regalos.
- Vincular ID TikTok en `/api/tiktok-connection`.
- Restaurar ID TikTok guardado desde `/api/tiktok-connection/app`.
- Conectar live con `/api/connect`.
- Escuchar eventos live con `/events?gameType=app`.
- Procesar regalos live y sumar puntos segun reglas.
- Evitar duplicados/progreso intermedio de regalos live.

Punto delicado actual: cuando el frontend esta en Vercel, las llamadas a APIs deben usar `window.API_BASE_URL`, no rutas relativas, especialmente para restaurar el ID vinculado.

### `frontend/js/snake-vs-snake.js`

Logica completa de Snake vs Snake.

Responsabilidades:

- Crear estado default del juego.
- Cargar/guardar estado en `/api/snake-vs-snake/state`.
- Dibujar tableros en canvas.
- Dibujar serpientes, cabezas, comida/manzanas y fondos.
- Manejar velocidad, pausa, reinicio, fullscreen.
- Configurar nombre/color/fondo por serpiente.
- Crear reglas por regalo y lado.
- Cargar catalogo de regalos.
- Vincular/restaurar/eliminar ID TikTok para `snake`.
- Conectar live con `/api/connect`.
- Escuchar SSE `/events?gameType=snake`.
- Procesar regalos live y convertirlos en manzanas.
- Gestionar historial y ganador.

Punto delicado: TikTok puede emitir eventos repetidos/intermedios para regalos con `repeatCount`. La logica debe evitar duplicar manzanas.

### `frontend/js/race.js`

Logica completa de Carrera de Colegas.

Responsabilidades:

- Crear/editar/eliminar participantes.
- Guardar/cargar estado en `/api/race/state`.
- Renderizar pista y carros.
- Animar progreso de participantes.
- Gestionar vueltas/meta/ganador.
- Vincular/restaurar/eliminar ID TikTok para `race`.
- Conectar live.
- Escuchar eventos `gift` y `comment`.
- Aplicar monedas/progreso a participantes.
- Guardar historial.

### `frontend/js/runtime.js`

Script auxiliar de runtime. Revisar antes de tocar porque puede estar pensado para ajustes globales del frontend.

## Frontend CSS

### `frontend/assets/css/landing.css`

Estilos de landing page.

### `frontend/assets/css/auth.css`

Estilos de login y registro.

### `frontend/assets/css/platform.css`

Estilos del panel principal, menu lateral, tarjetas de juegos, seccion admin y modales.

Incluye estilos para juegos deshabilitados y controles admin.

### `frontend/assets/css/styles.css`

Estilos del contador de puntos.

Incluye tablero, equipos, reglas, catalogo, estado de conexion y modales.

### `frontend/assets/css/snake-vs-snake.css`

Estilos del juego Snake vs Snake.

Incluye tableros canvas, paneles de configuracion, catalogos, badges y controles.

### `frontend/assets/css/race.css`

Estilos de Carrera de Colegas.

Incluye pista, carriles, carros, participantes, modal de ganador y estado live.

## Frontend Assets

### `frontend/assets/images/ContadorPuntos.png`

Imagen de tarjeta/preview del juego contador.

### `frontend/assets/images/SnakeVsSnake.png`

Imagen de tarjeta/preview de Snake vs Snake.

### `frontend/assets/images/Carrera de Colegas.png`

Imagen de tarjeta/preview de Carrera de Colegas.

### `frontend/assets/images/car1.png` a `car17.png`

Imagenes de carros usadas por Carrera de Colegas.

## Database Folder

### `database/init.sql`

Script SQL de inicializacion manual.

### `database/init_db.sql`

Script SQL alternativo/historico.

### `database/recreate_tables.sql`

Script SQL para recrear tablas.

Importante: antes de ejecutar scripts destructivos, revisar bien porque pueden borrar datos.

## Backups

### `backups/snake-vs-snake.html.bak`

Backup historico del HTML de Snake.

### `backups/snake-vs-snake.css.bak`

Backup historico del CSS de Snake.

### `backups/snake-vs-snake.js.bak`

Backup historico del JS de Snake.

No editar backups salvo que se quiera comparar o recuperar versiones anteriores.

## Carpeta `fronte nd`

Existe una carpeta con espacio en el nombre: `fronte nd`.

Parece accidental o historica. No asumir que es el frontend activo. El frontend activo esta en:

```txt
frontend/
```

## Convenciones de `gameType`

Usar estos valores:

```txt
app
snake
race
```

`snake-vs-snake` puede aparecer en URLs, pero el backend lo normaliza a `snake`.

## APIs Importantes

Autenticacion:

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Estado de juegos:

```txt
GET /api/game-state
PUT /api/game-state

GET /api/snake-vs-snake/state
PUT /api/snake-vs-snake/state

GET  /api/race/state
POST /api/race/state
```

TikTok:

```txt
GET    /api/status
GET    /api/gifts
POST   /api/catalog
POST   /api/connect
POST   /api/disconnect
POST   /api/tiktok-connection
GET    /api/tiktok-connection/:gameType
DELETE /api/tiktok-connection/:gameType
GET    /events?gameType=app|snake|race
```

Admin:

```txt
GET    /api/admin/users
GET    /api/admin/users/:id
PUT    /api/admin/users/:id
DELETE /api/admin/users/:id
GET    /api/games/availability
PUT    /api/admin/games/:gameType/availability
```

## Endpoints y Rutas Detalladas Por Archivo

Esta seccion documenta todas las rutas declaradas en el backend y que hace cada una. Recordar que en `backend/server.js` las rutas de `auth.js`, `admin.js`, `gameRoutes.js` y `tiktok.js` se montan con prefijo `/api`.

### `backend/server.js`

#### `OPTIONS *`

Middleware global para preflight CORS.

- Archivo: `backend/server.js`
- Proteccion: ninguna.
- Funcion: responder solicitudes preflight de navegador antes de llamadas reales a la API.
- Usa: `cors(getCorsConfig())`.

#### `GET /events`

Endpoint SSE para recibir eventos de TikTok Live en tiempo real.

- Archivo: `backend/server.js`
- Proteccion: no usa `requireAuth`, pero filtra por `ownerKey` usando sesion si existe.
- Query:
  - `gameType`: opcional. Valores esperados: `app`, `snake`, `race`.
- Funcion:
  - Abre un stream `text/event-stream`.
  - Infere el juego con `inferGameTypeFromRequest(req)`.
  - Calcula el dueno de la conexion con `getOwnerKeyFromRequest(req, gameType)`.
  - Envia un evento inicial `status`.
  - Escucha `hub.on('live-event')`.
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
- Respuesta:
  - Stream SSE continuo.
- Punto delicado:
  - No romper el filtro `ownerKey`; evita que un usuario vea eventos live de otro.

#### `app.use('/api', authRouter)`

Monta todas las rutas de autenticacion de `backend/src/routes/auth.js`.

#### `app.use('/api', adminRouter)`

Monta todas las rutas admin y disponibilidad de juegos de `backend/src/routes/admin.js`.

#### `app.use('/api', gameRouter)`

Monta las rutas de persistencia de estado de juegos de `backend/src/routes/gameRoutes.js`.

#### `app.use('/api', tiktokRouter)`

Monta las rutas TikTok Live, catalogo y vinculacion de IDs de `backend/src/routes/tiktok.js`.

#### `app.use('/', pagesRouter)`

Monta rutas de paginas, assets y fallback de `backend/src/routes/pages.js`.

### `backend/src/routes/auth.js`

#### `POST /api/auth/register`

Registra un usuario nuevo.

- Archivo: `backend/src/routes/auth.js`
- Proteccion: ninguna; ruta publica.
- Body esperado:
  - `name`: nombre del usuario.
  - `email`: correo.
  - `password`: contrasena, minimo 6 caracteres.
- Funcion:
  - Normaliza email.
  - Valida datos.
  - Hashea password con bcrypt.
  - Inserta en `app_users`.
  - Guarda `req.session.user` y `req.session.userId`.
- Respuesta exitosa:
  - HTTP `201`
  - `{ user }`
- Errores:
  - `409` si el correo ya existe.
  - `400` si faltan datos o password invalida.

#### `POST /api/auth/login`

Inicia sesion.

- Archivo: `backend/src/routes/auth.js`
- Proteccion: ninguna; ruta publica.
- Body esperado:
  - `email`
  - `password`
- Funcion:
  - Busca usuario por email.
  - Compara password con `password_hash`.
  - Guarda usuario en sesion.
- Respuesta exitosa:
  - `{ user }`
- Errores:
  - `401` si credenciales invalidas.

#### `POST /api/auth/logout`

Cierra sesion.

- Archivo: `backend/src/routes/auth.js`
- Proteccion: no usa `requireAuth`, pero depende de la sesion actual si existe.
- Funcion:
  - Destruye `req.session`.
  - Limpia cookie `connect.sid`.
- Respuesta:
  - `{ ok: true }`
- Errores:
  - `500` si no se puede destruir la sesion.

#### `GET /api/auth/me`

Devuelve el usuario autenticado actual.

- Archivo: `backend/src/routes/auth.js`
- Proteccion: valida manualmente `req.session.user`.
- Funcion:
  - Revisa si hay usuario en sesion.
  - Agrega/actualiza `isSuperUser` comparando el email.
- Respuesta exitosa:
  - `{ user }`
- Errores:
  - `401` si no hay sesion autenticada.
- Punto delicado:
  - El frontend usa esta ruta para decidir si muestra el panel de superusuario.

### `backend/src/routes/admin.js`

#### `GET /api/admin/users`

Lista todos los usuarios registrados.

- Archivo: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`.
- Funcion:
  - Lee `app_users`.
  - Lee `user_tiktok_connections`.
  - Une conexiones TikTok por usuario.
- Respuesta:
  - `{ users, total }`
- Cada usuario incluye:
  - `id`
  - `name`
  - `email`
  - `created_at`
  - `tiktokConnections`
- Usado por:
  - `frontend/js/platform.js` en la seccion admin.

#### `GET /api/admin/users/:id`

Obtiene el detalle de un usuario.

- Archivo: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`.
- Params:
  - `id`: ID numerico de usuario.
- Funcion:
  - Carga usuarios con sus conexiones.
  - Busca el usuario solicitado.
- Respuesta:
  - `{ user }`
- Errores:
  - `400` si `id` no es valido.
  - `404` si no existe.

#### `PUT /api/admin/users/:id`

Edita los IDs de TikTok vinculados de una cuenta.

- Archivo: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`.
- Params:
  - `id`: ID numerico de usuario.
- Body esperado:
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

- Funcion:
  - Valida que el usuario exista.
  - Por cada juego editable:
    - Si el valor esta vacio, borra la conexion de ese juego.
    - Si tiene valor, inserta/actualiza `user_tiktok_connections`.
  - No edita nombre ni correo.
- Respuesta:
  - `{ user }` actualizado.
- Punto delicado:
  - Este endpoint debe tocar solo IDs TikTok por juego, no datos de cuenta.

#### `DELETE /api/admin/users/:id`

Elimina una cuenta de la plataforma.

- Archivo: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`.
- Params:
  - `id`: ID numerico de usuario.
- Funcion:
  - Borra de `app_users`.
  - Las tablas relacionadas se eliminan por `ON DELETE CASCADE`.
  - Borra sesiones en `user_sessions` que contengan ese usuario.
- Respuesta:
  - `{ success: true, deletedUser }`
- Errores:
  - `404` si la cuenta no existe.

#### `GET /api/games/availability`

Lista la disponibilidad actual de los juegos.

- Archivo: `backend/src/routes/admin.js`
- Proteccion: `requireAuth`.
- Funcion:
  - Lee `game_availability`.
  - Devuelve si cada juego esta habilitado.
- Respuesta:
  - `{ games }`
- Ejemplo de `games`:

```json
{
  "app": { "gameType": "app", "isEnabled": true },
  "snake": { "gameType": "snake", "isEnabled": true },
  "race": { "gameType": "race", "isEnabled": false }
}
```

- Usado por:
  - `frontend/js/platform.js` para pintar tarjetas habilitadas/deshabilitadas.

#### `PUT /api/admin/games/:gameType/availability`

Habilita o deshabilita un juego.

- Archivo: `backend/src/routes/admin.js`
- Proteccion: `requireAuth` + `requireSuperUser`.
- Params:
  - `gameType`: `app`, `snake` o `race`.
- Body esperado:
  - `isEnabled`: boolean.
- Funcion:
  - Inserta/actualiza `game_availability`.
- Respuesta:
  - `{ game }`
- Punto delicado:
  - Aunque un juego este deshabilitado, el superusuario puede entrar.

### `backend/src/routes/gameRoutes.js`

#### `GET /api/game-state`

Carga el estado del contador de puntos del usuario autenticado.

- Archivo: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`.
- Funcion:
  - Obtiene `userId` desde la sesion.
  - Llama `gameStateService.loadGameState(userId)`.
  - Si no hay estado relacional pero hay estado legacy, lo migra.
- Respuesta:
  - `{ teams, gifts, history, updated_at }`

#### `PUT /api/game-state`

Guarda el estado del contador de puntos.

- Archivo: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`.
- Body esperado:
  - Estado completo del contador:
    - `teams`
    - `gifts`
    - `history`
- Funcion:
  - Sanitiza payload.
  - Reemplaza equipos, reglas e historial del usuario.
  - Actualiza `game_state_meta`.
- Respuesta:
  - Estado guardado normalizado.

#### `GET /api/snake-vs-snake/state`

Carga el estado de Snake vs Snake.

- Archivo: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`.
- Funcion:
  - Obtiene estado desde `snake_vs_snake_state`.
  - Si no existe, devuelve estado default.
- Respuesta:
  - `{ settings, snakes, rules, history, updated_at }`

#### `PUT /api/snake-vs-snake/state`

Guarda el estado de Snake vs Snake.

- Archivo: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`.
- Body esperado:
  - `settings`
  - `snakes`
  - `rules`
  - `history`
- Funcion:
  - Sanitiza con `sanitizeSnakeVsSnakeState`.
  - Inserta/actualiza `snake_vs_snake_state`.
- Respuesta:
  - Estado guardado normalizado.
- Punto delicado:
  - No perder campos como `boardImage`, reglas, manzanas o historial.

#### `GET /api/race/state`

Carga el estado de Carrera de Colegas.

- Archivo: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`.
- Funcion:
  - Obtiene estado desde `race_game_state`.
  - Si no existe, devuelve estructura vacia.
- Respuesta:
  - `{ participants, car_positions, finish_counts, viewer_bindings, history, updated_at }`

#### `POST /api/race/state`

Guarda el estado de Carrera de Colegas.

- Archivo: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`.
- Body esperado:
  - `participants`
  - `car_positions`
  - `finish_counts`
  - `viewer_bindings`
  - `history`
- Funcion:
  - Sanitiza con `sanitizeRaceGameState`.
  - Inserta/actualiza `race_game_state`.
- Respuesta:
  - `{ success: true, updated_at }`

#### `GET /api/race/debug`

Endpoint de diagnostico para Carrera.

- Archivo: `backend/src/routes/gameRoutes.js`
- Proteccion: `requireAuth`.
- Funcion:
  - Revisa si existe tabla `race_game_state`.
  - Busca estado del usuario actual.
  - Devuelve informacion de depuracion.
- Respuesta:
  - `{ table_exists, user_id, data_found, data, timestamp }`
- Uso:
  - Solo diagnostico. No debe usarse como flujo normal de UI.

### `backend/src/routes/tiktok.js`

#### `GET /api/status`

Devuelve estado general del backend y estado TikTok Live del juego inferido.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: ninguna obligatoria, pero usa sesion si existe.
- Query/body:
  - `gameType`: opcional.
- Funcion:
  - Infere `gameType`.
  - Limpia conexion obsoleta si el ID vinculado ya no coincide.
  - Consulta salud basica del backend/DB.
  - Devuelve estado live desde `tiktokLiveManager`.
- Respuesta:
  - Estado live + `server` + `gameType` + `sessionUser`.

#### `GET /api/gifts`

Devuelve catalogo de regalos.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: ninguna obligatoria.
- Query/body:
  - `gameType`: opcional.
- Funcion:
  - Si hay conexion live activa con catalogo, devuelve catalogo live.
  - Si no, devuelve catalogo fallback desde `gifts-cache.json`.
- Respuesta:
  - `{ gifts, total, source, updated_at, gameType }`

#### `POST /api/catalog`

Devuelve catalogo de regalos para un ID/juego.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: ninguna obligatoria.
- Body esperado:
  - `uniqueId`: ID TikTok opcional para contexto.
  - `gameType`: opcional.
- Funcion:
  - Infere/normaliza `gameType`.
  - Devuelve catalogo live o fallback.
- Respuesta:
  - `{ uniqueId, gifts, total, source, gameType, warning }`

#### `POST /api/connect`

Conecta un juego a TikTok Live.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: no usa `requireAuth`, pero guarda ID si hay usuario en sesion.
- Body esperado:
  - `uniqueId`: ID TikTok.
  - `gameType`: opcional. Si no llega, se infiere desde referer/body/query.
- Funcion:
  - Normaliza ID.
  - Si hay usuario, guarda la conexion en `user_tiktok_connections`.
  - Llama `tiktokLiveManager.connectGame`.
  - Empieza a publicar eventos live por SSE/Socket.IO.
- Respuesta:
  - Estado de conexion:
    - `status`
    - `uniqueId`
    - `message`
    - `error`
    - `roomId`
    - `availableGifts`
- Estados posibles:
  - `connecting`
  - `connected`
  - `live_off`
  - `error`

#### `POST /api/disconnect`

Desconecta TikTok Live del juego inferido.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: no usa `requireAuth`, pero usa sesion si existe.
- Body/query:
  - `gameType`: opcional.
- Funcion:
  - Infere juego.
  - Cierra la conexion activa del usuario/sesion/juego.
- Respuesta:
  - Estado vacio/desconectado.
- Punto importante:
  - No elimina el ID guardado en base; solo desconecta el live.

#### `POST /api/tiktok-connection`

Guarda el ID TikTok vinculado para un juego.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`.
- Body esperado:
  - `gameType`: `app`, `snake` o `race`.
  - `tiktokUsername`: usuario TikTok.
- Funcion:
  - Inserta/actualiza `user_tiktok_connections`.
  - Marca `is_linked = true`.
- Respuesta:
  - `{ success, tiktok_username, is_linked, linked_at }`
- Usado por:
  - Los botones de vincular TikTok en cada juego.

#### `GET /api/tiktok-connection/app`

Obtiene el ID TikTok vinculado del contador.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`.
- Funcion:
  - Busca `user_tiktok_connections` con `game_type = 'app'`.
- Respuesta si existe:
  - `{ connected, tiktok_username, linked_at }`
- Respuesta si no existe:
  - `{ connected: false, tiktok_username: null }`
- Uso:
  - `frontend/js/app.js` debe usarlo al cargar para rellenar y bloquear el input.

#### `DELETE /api/tiktok-connection/app`

Elimina el ID TikTok vinculado del contador.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`.
- Funcion:
  - Borra conexion `game_type = 'app'`.
  - Desconecta live de ese juego si esta activo.
- Respuesta:
  - `{ success: true, message }`

#### `GET /api/tiktok-connection/:gameType`

Obtiene el ID TikTok vinculado de un juego.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`.
- Params:
  - `gameType`: `app`, `snake`, `race`.
- Funcion:
  - Busca conexion por usuario y juego.
- Respuesta:
  - `{ connected, tiktok_username, linked_at }`
- Usado por:
  - Snake y Carrera para restaurar el input de ID TikTok.

#### `DELETE /api/tiktok-connection/:gameType`

Elimina el ID TikTok vinculado de un juego.

- Archivo: `backend/src/routes/tiktok.js`
- Proteccion: `requireAuth`.
- Params:
  - `gameType`: `app`, `snake`, `race`.
- Funcion:
  - Borra conexion del juego.
  - Desconecta live si esta activo.
- Respuesta:
  - `{ success: true, message }`

### `backend/src/routes/pages.js`

Estas rutas sirven paginas y assets cuando el backend sirve el frontend en local. En produccion normalmente redirigen a Vercel porque `shouldServeBackendPages()` devuelve falso cuando `NODE_ENV === 'production'`.

#### `GET /`

Pagina raiz.

- Archivo: `backend/src/routes/pages.js`
- Proteccion: ninguna.
- Funcion local:
  - Si hay sesion, redirige a `/platform.html`.
  - Si no hay sesion, sirve `frontend/index.html`.
- Funcion produccion:
  - Redirige a `${FRONTEND_URL}/platform.html` si hay sesion.
  - Redirige a `${FRONTEND_URL}/index.html` si no hay sesion.

#### `GET /index.html`

Sirve landing page.

- Proteccion: ninguna.
- Funcion local:
  - Sirve `frontend/index.html`.
  - Inyecta `/api/config.js`.
- Funcion produccion:
  - Redirige a Vercel `/index.html`.

#### `GET /landing.css`

Sirve CSS de landing.

- Archivo: `backend/src/routes/pages.js`
- Proteccion: ninguna.
- Respuesta:
  - `frontend/assets/css/landing.css`

#### `GET /auth.css`

Sirve CSS de login/registro.

- Proteccion: ninguna.
- Respuesta:
  - `frontend/assets/css/auth.css`

#### `GET /auth.js`

Sirve JS de autenticacion.

- Proteccion: ninguna.
- Respuesta:
  - `frontend/js/auth.js`

#### `GET /dialog.js`

Sirve JS de dialogos.

- Proteccion: ninguna.
- Respuesta:
  - `frontend/js/dialog.js`

#### `GET /login` y `GET /login.html`

Sirven pagina de login.

- Proteccion: `requireGuestPage`.
- Funcion:
  - Si el usuario ya esta logueado, redirige a platform.
  - Si no, sirve `frontend/login.html` en local.
  - En produccion redirige a Vercel `/login.html`.

#### `GET /register` y `GET /register.html`

Sirven pagina de registro.

- Proteccion: `requireGuestPage`.
- Funcion:
  - Si el usuario ya esta logueado, redirige a platform.
  - Si no, sirve `frontend/register.html` en local.
  - En produccion redirige a Vercel `/register.html`.

#### `GET /platform` y `GET /platform.html`

Sirven panel principal.

- Proteccion: `requireAuthPage`.
- Funcion:
  - Requiere sesion.
  - Sirve `frontend/platform.html` en local.
  - En produccion redirige a Vercel `/platform.html`.

#### `GET /platform.css`

Sirve CSS del panel principal.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/assets/css/platform.css`

#### `GET /platform.js`

Sirve JS del panel principal.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/js/platform.js`

#### `GET /app` y `GET /app.html`

Sirven juego contador de puntos.

- Proteccion: `requireAuthPage`.
- Control adicional:
  - `requireEnabledGame(req, res, 'app')`.
- Funcion:
  - Si usuario normal y juego deshabilitado, redirige a `/platform.html`.
  - Si superusuario, permite entrar aunque este deshabilitado.
  - Sirve `frontend/app.html` en local.
  - En produccion redirige a Vercel `/app.html`.

#### `GET /app.js`

Sirve JS del contador.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/js/app.js`

#### `GET /styles.css`

Sirve CSS del contador.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/assets/css/styles.css`

#### `GET /snake-vs-snake` y `GET /snake-vs-snake.html`

Sirven juego Snake vs Snake.

- Proteccion: `requireAuthPage`.
- Control adicional:
  - `requireEnabledGame(req, res, 'snake')`.
- Funcion:
  - Bloquea usuario normal si el juego esta deshabilitado.
  - Permite superusuario.
  - Sirve `frontend/snake-vs-snake.html` en local.
  - En produccion redirige a Vercel `/snake-vs-snake.html`.

#### `GET /snake-vs-snake.css`

Sirve CSS de Snake.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/assets/css/snake-vs-snake.css`

#### `GET /snake-vs-snake.js`

Sirve JS de Snake.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/js/snake-vs-snake.js`

#### `GET /race` y `GET /race.html`

Sirven juego Carrera de Colegas.

- Proteccion: `requireAuthPage`.
- Control adicional:
  - `requireEnabledGame(req, res, 'race')`.
- Funcion:
  - Bloquea usuario normal si el juego esta deshabilitado.
  - Permite superusuario.
  - Sirve `frontend/race.html` en local.
  - En produccion redirige a Vercel `/race.html`.

#### `GET /race.css`

Sirve CSS de Carrera.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/assets/css/race.css`

#### `GET /race.js`

Sirve JS de Carrera.

- Proteccion: `requireAuthPage`.
- Respuesta:
  - `frontend/js/race.js`

#### `USE /assets`

Sirve archivos estaticos desde `frontend/assets`.

- Proteccion: ninguna directa en `router.use`.
- Funcion:
  - Permite cargar imagenes, CSS y otros assets por ruta `/assets/...`.

#### `USE /js`

Sirve archivos JS desde `frontend/js`.

- Proteccion: ninguna directa en `router.use`.
- Funcion:
  - Permite cargar scripts por ruta `/js/...`.

#### `GET /api/config.js`

Devuelve un script JS que define la base URL del backend.

- Archivo: `backend/src/routes/pages.js`
- Proteccion: ninguna.
- Funcion:
  - Calcula `apiBaseUrl` con `getApiBaseUrl(req)`.
  - Responde JavaScript:

```js
window.__INTERAKTIK_API_BASE_URL__ = "..."
```

- Uso:
  - En local o paginas servidas por backend, ayuda al frontend a saber donde esta la API.

#### `GET *`

Fallback de paginas.

- Archivo: `backend/src/routes/pages.js`
- Proteccion: ninguna directa.
- Funcion:
  - Si la ruta empieza por `/api/`, devuelve `404 JSON`.
  - En produccion redirige a Vercel `/index.html`.
  - En local redirige a `/`.

## Reglas Para Otra IA Antes De Modificar

1. No cambiar el superusuario sin permiso del usuario.
2. No romper `ownerKey`; es vital para separar eventos live por usuario.
3. No usar rutas relativas `/api/...` en frontend de Vercel si el archivo ya depende de `window.API_BASE_URL`.
4. Si se toca TikTok Live, revisar contador, Snake y Carrera porque comparten backend.
5. Si se toca `normalize.js`, validar que no se pierdan campos JSONB como imagenes de fondo o reglas.
6. Si se toca disponibilidad de juegos, recordar que el superusuario debe poder entrar aunque el juego este deshabilitado.
7. Si se borra usuario, confiar en `ON DELETE CASCADE`, pero tambien limpiar sesiones relacionadas.
8. Ejecutar al menos:

```txt
node --check backend/server.js
node --check backend/src/routes/tiktok.js
node --check frontend/js/app.js
node --check frontend/js/snake-vs-snake.js
node --check frontend/js/race.js
node --check frontend/js/platform.js
```

segun los archivos tocados.

## Bugs/Detalles Sensibles Conocidos

### Restauracion de ID TikTok en frontend

El input de TikTok de cada juego debe:

- Consultar la base al cargar.
- Si trae `tiktok_username`, mostrar `@usuario`.
- Bloquear el input.
- Desactivar boton de vincular.
- Activar boton de conectar live.
- Si no trae ID, dejar input vacio y editable.

En produccion Vercel + Railway, las llamadas deben ir a Railway con `window.API_BASE_URL`.

### Snake: duplicacion de manzanas

TikTok puede mandar varios eventos para un mismo regalo. Si la regla dice 1 manzana, no se deben crear varias por eventos repetidos/intermedios.

Revisar:

- `handleLiveGift`
- `applyRuleToSnake`
- `spawnApples`
- `repeatCount`
- `repeatEnd`
- filtros de duplicados

### Sesiones en otro dispositivo

Si un usuario entra desde otro dispositivo y vuelve a login, revisar:

- `frontend/js/config.js`
- `window.API_BASE_URL`
- CORS en `backend/src/config/cors.js`
- Cookies `sameSite: none`, `secure: true` en produccion
- `FRONTEND_URL`
- `SESSION_SECRET`
- Dominio real Vercel/Railway

## Como Probar Localmente

Desde la raiz:

```txt
npm start
```

Backend esperado:

```txt
http://localhost:3000
```

Paginas utiles:

```txt
http://localhost:3000/index.html
http://localhost:3000/login.html
http://localhost:3000/register.html
http://localhost:3000/platform.html
http://localhost:3000/app.html
http://localhost:3000/snake-vs-snake.html
http://localhost:3000/race.html
```

En produccion, el frontend vive en Vercel:

```txt
https://interaktik-platform.vercel.app
```

Backend Railway configurado actualmente en frontend:

```txt
https://interaktik-platform-production.up.railway.app
```
