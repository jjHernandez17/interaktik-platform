# Pelea Callejera (Roblox)

Juego de peleas 2.5D estilo Street Fighter: dos bandos (rojo y azul) pelean hasta quedarse sin vida. Los espectadores de TikTok Live ayudan a su bando con regalos (golpes, bolas de energía, súper, meteoros, curar, escudo, furia, velocidad, congelar, cambio de estilo).

## Instalar en Roblox Studio

1. Abre un lugar nuevo (Baseplate) en Roblox Studio.
2. Arrastra `frontend/downloads/PeleaCallejera.rbxmx` a la ventana (o clic derecho en **ServerScriptService → Insert from File**). Debe quedar un único Script llamado `PeleaCallejera`.
3. **Game Settings → Security → Allow HTTP Requests = ON**.
4. Publica el lugar como experiencia **pública**.
5. En la web de Interaktik, abre *Pelea Callejera*, vincula tu ID de Roblox y conecta tu TikTok Live.
6. Pon el link de la experiencia en `ROBLOX_GAME_URL` de `frontend/js/roblox-fighters.js` para mostrar el botón "Abrir en Roblox".

Sin vincular (o sin HTTP) el juego corre en **modo demostración** con regalos simulados.

## Estructura

- `src/server/` — lógica autoritativa: `Match` (rondas), `Fighter`, `AI`, `Combat`, `Powers`, `Styles`, `Effects`, `Arena`, `Net` (backend).
- `src/client/` — cámara lateral, HUD y animación procedural de los luchadores.
- `build_rbxmx.py` — genera `PeleaCallejera.rbxmx` a partir de `src/`. Ejecútalo después de editar cualquier script.
- `dev_bundle.py` — solo desarrollo (cargar los scripts en Studio por HTTP local).

## Notas

- La cámara es fija: los jugadores no tienen personaje. El servidor fija un `ReplicationFocus` en el centro de la arena para que funcione con `StreamingEnabled`.
- Backend: `/api/roblox-fighters/*` (ver `backend/src/routes/robloxFightersRoutes.js`).
