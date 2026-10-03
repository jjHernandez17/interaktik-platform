# Interaktik — mod de Minecraft Java (Fabric)

Conecta un mundo de **Minecraft Java** (de un jugador, abierto a LAN o un servidor Fabric) con la plataforma, **sin
servidor propio**. Los regalos de TikTok Live se convierten en comandos de Minecraft y el mod los ejecuta.

El mod es deliberadamente "tonto": solo abre un WebSocket a `<plataforma>/mc-bridge/<llave>?edition=java` y
ejecuta el texto de cada `commandRequest` que le llega. Toda la lógica (qué comando es cada acción) vive en
`backend/src/services/minecraftJavaCommands.js`, así que **agregar acciones nuevas no requiere recompilar el mod**.

## Uso (streamer)

1. Instala [Fabric](https://fabricmc.net/use/installer/) y [Fabric API](https://modrinth.com/mod/fabric-api).
2. Copia `InteraktikMod.jar` a la carpeta `mods`.
3. Dentro del mundo: `/interaktik conectar <llave>` (la llave sale del panel). Se guarda en `config/interaktik.json` y en
   adelante se conecta sola al abrir cualquier mundo.

Comandos: `/interaktik conectar <llave>`, `/interaktik estado`, `/interaktik desconectar`. No piden permisos de operador
ni trucos activados.

## Compilar

Requiere JDK 21 y Gradle (el proyecto no incluye wrapper):

```bash
cd minecraft-mod
gradle build
cp build/libs/InteraktikMod-1.0.0.jar ../frontend/downloads/InteraktikMod.jar
```

Se compila contra Minecraft 1.21.4 y declara compatibilidad `~1.21`. Probado en servidores Fabric 1.21.4 y 1.21.11.
Para otra versión basta con cambiar `minecraft_version` y `fabric_version` en `gradle.properties` (y recompilar).

## Notas

- El mod no guarda nada en el mundo; solo `config/interaktik.json` (llave y dirección de la plataforma).
- Si la llave se regenera en el panel, el mod se desconecta y muestra el motivo en `/interaktik estado`.
