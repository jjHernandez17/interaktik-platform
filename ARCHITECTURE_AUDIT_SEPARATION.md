# Auditoria de Separacion Frontend / Backend

Fecha de auditoria: 2026-06-11

Objetivo:

- Verificar que el frontend solo contenga logica de navegador.
- Verificar que el backend solo contenga logica de servidor.
- Identificar archivos contaminados, si existian.
- Registrar importes, duplicados y bloques sospechosos.

## Resultado General

No encontre contaminacion real que obligue a mover bloques de logica entre capas.

Lo que si existe es una separacion funcional correcta:

- `frontend/` maneja DOM, canvas, formularios, `fetch()`, `EventSource`, renderizado visual y estado temporal en memoria.
- `backend/` maneja Express, PostgreSQL, sesiones, TikTok Live, SSE, Socket.IO y persistencia.

## Archivos Frontend Revisados

Archivos verificados:

- `frontend/js/app.js`
- `frontend/js/snake-vs-snake.js`
- `frontend/js/race.js`
- `frontend/js/platform.js`
- `frontend/js/auth.js`
- `frontend/js/dialog.js`
- `frontend/js/config.js`
- `frontend/js/runtime.js`
- `frontend/*.html`
- `frontend/assets/*`

### Hallazgos

- No hay `require()`.
- No hay `module.exports`.
- No hay `pool.query`.
- No hay `express`.
- No hay `TikTokLiveConnection`.
- No hay logica de servidor.
- Si hay DOM, eventos, renderizado, canvas y `fetch()`, lo cual es correcto para frontend.

### Puntos delicados encontrados

- `frontend/js/runtime.js` interfiere con `window.fetch` y `window.EventSource` para inyectar la base URL de API.
- Eso sigue siendo frontend, pero es un archivo sensible porque modifica comportamiento global del navegador.
- `frontend/js/config.js` define `window.API_BASE_URL`.
- `frontend/js/app.js` usa `APP_API_BASE_URL` para apuntar a Railway.
- `frontend/js/snake-vs-snake.js` y `frontend/js/race.js` usan `fetch()` y `EventSource` para hablar con el backend, lo cual es correcto.

## Archivos Backend Revisados

Archivos verificados:

- `backend/server.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/admin.js`
- `backend/src/routes/gameRoutes.js`
- `backend/src/routes/tiktok.js`
- `backend/src/routes/pages.js`
- `backend/src/services/*`
- `backend/src/database/*`
- `backend/src/middleware/*`
- `backend/src/utils/normalize.js`

### Hallazgos

- No hay `document.getElementById`.
- No hay manipulacion del DOM.
- No hay renderizado visual de interfaz.
- No hay `addEventListener` sobre elementos HTML.
- Si hay Express, rutas, SSE, Socket.IO, pool PostgreSQL y TikTok Live, lo cual es correcto para backend.

### Puntos delicados encontrados

- `backend/src/routes/pages.js` sirve HTML, CSS, JS y define `/api/config.js`.
- Eso no es frontend contaminado, sino backend sirviendo assets y paginas.
- `backend/server.js` expone `/events` para SSE y filtra por `ownerKey`.
- `backend/src/services/tiktokLiveManager.js` contiene logica de negocio TikTok Live.
- `backend/src/routes/tiktok.js` actua como capa de API entre frontend y TikTok Live.

## Archivos Criticos Verificados

### `frontend/js/app.js`

Estado:

- Limpio respecto a backend.
- Usa DOM, `fetch()` y `EventSource` como corresponde.

### `frontend/js/snake-vs-snake.js`

Estado:

- Limpio respecto a backend.
- Usa canvas, DOM, `fetch()` y `EventSource` como corresponde.

### `frontend/js/race.js`

Estado:

- Limpio respecto a backend.
- Usa DOM, animacion visual y `fetch()` como corresponde.

### `backend/src/services/tiktokLiveManager.js`

Estado:

- Limpio respecto a frontend.
- Contiene logica de TikTok Live, SSE y eventos.
- No manipula DOM.

### `backend/src/routes/tiktok.js`

Estado:

- Limpio respecto a frontend.
- Expone APIs para conexion, catalogo y estado TikTok.

### `backend/src/routes/gameRoutes.js`

Estado:

- Limpio respecto a frontend.
- Solo persiste y carga estado de juegos.

## Importes y Exports

No identifique imports rotos que obliguen a mover funciones entre capas.

Los patrones actuales estan correctos:

- Frontend usa `window.API_BASE_URL` y `window.__INTERAKTIK_API_BASE_URL__`.
- Backend usa `require()` y `module.exports`.
- Backend no importa modulos de frontend.
- Frontend no usa `require()` ni `module.exports`.

## Duplicados O Posibles Duplicados

No encontre duplicados de capa que ameriten mover codigo, pero si encontre patrones repetidos que conviene conservar como estan:

- Restauracion de ID TikTok en los tres juegos.
- Manejo de `fetch()` con base URL centralizada.
- Persistencia de estado por usuario en cada juego.
- Manejo de `EventSource` para eventos live.

## Recomendaciones

1. Mantener `frontend/js/runtime.js` como archivo de adaptacion global del navegador.
2. Mantener `backend/src/routes/pages.js` como servidor de paginas y assets, no como logica de juego.
3. Si se agrega nueva logica TikTok Live, ponerla en `backend/src/services/tiktokLiveManager.js` o en un servicio nuevo, no en frontend.
4. Si se agrega nuevo UI o renderizado, ponerlo en frontend, nunca en rutas de backend.
5. Si se crea otra pagina, seguir el patron actual: HTML en `frontend/`, ruta de servicio en `backend/src/routes/pages.js`, estado en backend, renderizado en frontend.

## Conclusiones

La estructura actual ya esta bastante bien separada.

No hubo que mover bloques de codigo entre frontend y backend en esta auditoria porque no encontre mezcla real que rompiera las reglas solicitadas.

El principal foco de atencion no es la separacion de capas, sino mantener esa frontera en:

- `frontend/js/runtime.js`
- `backend/src/routes/pages.js`
- `backend/src/services/tiktokLiveManager.js`

Esos tres archivos son los mas sensibles para futuras modificaciones.

