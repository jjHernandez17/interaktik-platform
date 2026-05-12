# Interaktik

Plataforma de juegos interactivos para TikTok Live, separada en frontend y backend.

## Estructura

- `frontend/`: interfaz publica y juegos.
  - `index.html`, `login.html`, `register.html`, `platform.html`, `app.html`, `race.html`, `snake-vs-snake.html`
  - `assets/css/`: estilos
  - `assets/images/`: imagenes y recursos visuales
  - `js/`: logica del cliente y `runtime.js`
- `backend/`: servidor Express, rutas API, sesiones, DB y conexion a TikTok Live.
  - `server.js`
  - `package.json`

## Como correrlo localmente

```bash
npm install
npm start
```

El servidor escucha en `http://localhost:3000` y sirve el frontend desde `frontend/`.

## Base de datos

- PostgreSQL para usuarios, sesiones y estado de los juegos.
- El backend usa `DATABASE_URL` y puede trabajar con SSL segun el entorno.

## Variables de entorno

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/interaktik
DATABASE_SSL=false
SESSION_SECRET=una-clave-segura
```

## Rutas

- `GET /` landing publica.
- `GET /login.html` y `GET /register.html` autenticacion.
- `GET /platform.html` panel principal.
- `GET /app.html`, `GET /race.html`, `GET /snake-vs-snake.html` juegos.
- `GET /api/...` backend y conexion TikTok Live.

## Despliegue recomendado

- `frontend/` en Vercel.
- `backend/` en Railway.
- PostgreSQL y Redis gestionados en Railway.
- DNS y TLS con Cloudflare.

## Nota tecnica

La conexion a TikTok Live usa una libreria no oficial (`tiktok-live-connector`) y necesita un proceso Node persistente.
