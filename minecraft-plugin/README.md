# Interaktik — plugin de Minecraft

Plugin para servidores **Paper** (o forks como Purpur) **1.20 o superior** (no funciona en Spigot puro) que ejecuta en tu partida las
acciones que activan los regalos de TikTok Live (mobs, TNT, rayos, efectos, items...).

Lo único que hace es preguntar a la plataforma cada segundo si hay acciones nuevas para tu llave y ejecutarlas
sobre el jugador que guardaste en el panel. No abre puertos ni necesita RCON.

## Instalación (para el streamer)

1. Descarga `InteraktikMinecraft.jar` desde el panel (Juegos > Survivaltik).
2. Cópialo a la carpeta `plugins` de tu servidor y reinícialo una vez.
3. Pega tu llave en `plugins/Interaktik/config.yml` (campo `server-key`) y ejecuta `/interaktik reload`.

Comandos (solo operadores): `/interaktik status`, `/interaktik reload`, `/interaktik test <accion> [cantidad]`.

## Compilar

Requiere JDK 17 y Maven:

```bash
cd minecraft-plugin
mvn package
cp target/InteraktikMinecraft.jar ../frontend/downloads/InteraktikMinecraft.jar
```

## Agregar una acción nueva

1. Agrégala al catálogo `ACTIONS` de `backend/src/services/minecraftService.js` (id, nombre, unidad, mínimo, máximo).
2. Impleméntala en `ActionExecutor.run(...)` y añade su id a `ACTIONS` y `LABELS` de `ActionExecutor.java`.
3. Recompila y reemplaza el `.jar` de `frontend/downloads`.

## Notas

- El TNT de los regalos hace daño pero no rompe bloques, salvo que pongas `tnt-destroys-blocks: true`.
- Si el streamer no está dentro del servidor, las acciones quedan pendientes en la plataforma y se ejecutan cuando entre.
- Los efectos usan los nombres `minecraft:...`, por lo que funcionan igual entre versiones.
