# Carrera de Fórmula 1 (Roblox)

Hasta 20 espectadores de TikTok corren en una pista de 4 carriles. Se unen de dos formas: con cuenta de Roblox comentan `!unirme <ID de Roblox>` y corren con su skin sentados en el carro; sin
cuenta comentan `1` y les toca una skin aleatoria. Siempre con su nombre de TikTok sobre el carro (la palabra se cambia en la
página del juego) y sus regalos les dan **turbo**, **escudo** o frenan a otros con **aceite**.

## Cómo está armado

- `src/build/TrackBuilder.lua`: genera la pista (se ejecuta una vez en Studio con `Track.build(workspace)`): asfalto de 4 carriles
  (`ROAD_WIDTH` = 120), pianos, muros, meta, arco con semáforo, tribunas, boxes, árboles, iluminación y la carpeta `Waypoints`.
- `src/shared/` (viaja a `ReplicatedStorage.F1Shared`): `Config` (ajustes), `Path` (recorrido de la pista), `CarBuilder`
  (carro F1 detallado, 8 equipos).
- `src/server/`: `Main.server.lua` (arranque y conexión con Interaktik), `Race.lua` (simulación: parrilla, semáforo, carrera,
  resultados, poderes), `Net.lua` (HTTP hacia el backend).
- `src/client/ClientMain.client.lua`: dibuja los carros (el servidor solo manda posiciones), cámara de televisión y pantalla.

El servidor simula y manda posiciones a ~15 Hz; cada cliente dibuja los carros y los suaviza. Sin cuenta vinculada corre en modo
demostración (12 pilotos bot y regalos de mentira).

## Backend

`backend/src/services/robloxF1Service.js` y `routes/robloxF1Routes.js` (`/api/roblox-f1/*`), migración `044_add_roblox_f1.sql`,
página `frontend/roblox-f1.html`. El juego consulta `session`, `queue` (+ `ack`) y avisa `race-result`.

## Instalar en Roblox Studio

1. En Workspace debe existir la carpeta `F1Track` (ejecuta `TrackBuilder.lua`).
2. `ServerScriptService` > Script `F1Game` (con `Race`, `Net`, la carpeta `Shared` y el LocalScript `Client` adentro).
3. Game Settings > Security > **Allow HTTP Requests**. Desactiva `Workspace.StreamingEnabled`.
4. Para probar sin TikTok: Play. En Studio, `ServerStorage.F1Debug:Invoke("join", "id", "Nombre")` mete un piloto y
   `Invoke("applyEffect", "id", "turbo", 10)` le da un poder.

`dev_bundle.py` solo sirve para desarrollo: junta los scripts en un `bundle.json` que se carga en Studio por HTTP local.
