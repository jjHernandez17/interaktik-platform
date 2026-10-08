# Interaktik — Cubo Gigante (mod de Minecraft Java, Fabric 1.21.4)

Cubos enormes de **vidrio** (suelo y cuatro paredes, sin techo) que se llenan de bloques, capa por capa. Cuando
se llena uno empieza una **cuenta regresiva** configurable y, al llegar a 0, es **+1 win**: se celebra con un título y un
sonido, el cubo se vacía solo y empieza otro. Un marcador arriba muestra los wins así: `3/10 wins`. Puede haber
**cualquier cantidad de cubos a la vez**. El tamaño lo elige el streamer con comandos.

Instalación: copiar `InteraktikCubo-1.0.0.jar` a la carpeta `mods` de Fabric 1.21.4 (no hace falta Fabric API) o usar el
instalador de Windows de la plataforma. Funciona junto al mod `InteraktikMod`: los regalos de TikTok llegan como
comandos (`/cubo agregar <cantidad>`).

## Cómo son los cubos

- Las medidas (ancho × alto × largo) son las del cubo **completo, vidrio incluido**: 10×10×10 mide 10 bloques por lado y
  se llena por dentro (8 × 9 × 8: el suelo ocupa la primera capa del alto).
- El **piso queda a la altura del jugador** (el bloque bajo sus pies) y el cubo aparece 4 bloques frente a él, aunque
  vuele en creativo. Si ya hay un cubo en ese sitio, el nuevo se corre hacia la derecha.
- El vidrio (piso, paredes y esquinas) es **indestructible**, también en creativo y contra explosiones: si algo lo
  rompe se repone enseguida. Lo que rellena el jugador sí se puede romper.
- El jugador llena el cubo **a mano** (y los regalos con `/cubo agregar`). El mod revisa el interior: cuando no queda ningún
  hueco empieza la cuenta regresiva con un **número grande en el centro de la pantalla**; si alguien rompe un bloque antes
  de llegar a 0, la cuenta se cancela y vuelve a empezar al volver a llenarlo.
- El interior siempre empieza vacío (se despeja el terreno que haya).
- Todo el estado se guarda **dentro de cada mundo** (`interaktik_cubo.json` en la carpeta del mundo): un mundo nuevo
  empieza sin cubos ni victorias.

## Colocar bloques sin pausa

En Minecraft, mantener el clic derecho coloca un bloque cada 0,2 s. Con el mod, mientras tengas un bloque en la mano se coloca
uno en cada tick (hasta 20 por segundo), sin espera entre bloque y bloque. Se puede apagar en el menú (tecla K) con el botón
«Colocar bloques sin pausa». Solo afecta a la colocación de bloques, no a comer, atacar ni usar otros objetos.

## Menú visual

Pulsa **K** (o escribe `/cubomenu`) para abrir el menú: ancho, alto y largo, material, cuenta regresiva, objetivo de
wins y wins actuales, con botones para **Crear cubo**, guardar el contador, vaciar y quitar los cubos. La tecla se
cambia en Opciones → Controles → «Interaktik Cubo Gigante». El menú manda los mismos comandos `/cubo` del chat.

## Comandos (sin permisos de operador)

| Comando | Qué hace |
|---|---|
| `/cubo tamano <ancho> <alto> <largo>` | **Crea un cubo nuevo** con esas medidas, en un solo comando (mínimo 3 × 2 × 3, máximo 100 por lado, interior de hasta 400 000 bloques) |
| `/cubo ancho <n>` · `/cubo alto <n>` · `/cubo largo <n>` | Cambia una medida de los próximos cubos sin crear nada |
| `/cubo iniciar [x y z]` | Crea un cubo con las últimas medidas (o con la esquina de su piso en esa posición) |
| `/cubo agregar [cantidad] [id\|todos]` | Coloca bloques en el cubo seleccionado, en el cubo `id` o en todos |
| `/cubo tnt <cantidad> [id\|todos]` | Suelta TNT desde arriba del cubo, en zonas al azar. Explotan justo al tocar un bloque |
| `/cubo creeper <cantidad> [id\|todos]` | Hace aparecer creepers dentro del cubo, sobre lo construido (con humo y siseo); buscan al jugador **aunque esté en creativo** (los creepers normales lo ignoran), se le acercan y se encienden al llegar; si no llegan, explotan igual a los pocos segundos y rompen lo que haya |
| `/cubo vacio <capas> [id\|todos]` | Bomba de vacío: un remolino violeta se forma sobre el cubo (~1,4 s) y luego quita, de una en una, las capas de arriba que haya construido el jugador: los bloques se encogen y vuelan hacia el remolino, con onda de choque, polvo del material, sonido que sube de tono y un destello final |
| `/cubo rayo <fuerza 1-10> [veces] [id\|todos]` | Rayo sobre lo que hay construido; la fuerza decide cuántos bloques rompe a su alrededor (el vidrio no se toca) |
| `/cubo seleccionar <id>` · `/cubo lista` | Elige a qué cubo van los bloques por defecto / ver los cubos |
| `/cubo bloque arcoiris` · `/cubo bloque <id>` | Material de relleno (por defecto, colores por capas) |
| `/cubo reiniciar [id\|todos]` | Vacía el cubo y empieza otro (mismas medidas) |
| `/cubo detener [id\|todos]` | Quita el cubo y su vidrio |
| `/cubo contador <segundos>` | Cuenta regresiva (descendente) al llenar un cubo; al llegar a 0 se suma 1 win. Con 0 se suma al instante. Por defecto 10 |
| `/cubo objetivo <n>` | Objetivo de wins (admite negativos). Por defecto 10 |
| `/cubo victorias` · `/cubo victorias poner <n>` | Ver o fijar los wins (admite negativos) |
| `/cubo estado [id]` | Progreso, cola y victorias |

Sin `id`, los comandos actúan sobre el cubo **seleccionado** (el último que se creó). Arriba de la pantalla solo se ve el marcador de wins (`3/10 wins`); no hay barra de progreso por cubo.

## Compilar

JDK 21 y Gradle (sin wrapper), igual que `minecraft-mod`:

```bash
cd minecraft-cube-mod
gradle build        # genera build/libs/InteraktikCubo-1.0.0.jar
```
