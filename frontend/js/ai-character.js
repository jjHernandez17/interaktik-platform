// Motor de personajes del Co-anfitrión IA.
//
// Tiene dos partes que no dependen una de otra:
//   1) El ARTE de cada personaje (CHARACTERS): un SVG con partes con nombre y una funcion apply(pose) que mueve esas partes.
//   2) El MOTOR de animacion (Rig): calcula la pose de cada frame (respiracion, parpadeo, mirada, expresion, boca al hablar, gestos y
//      acciones como saludar o bailar) y se la pasa al arte.
//
// Para agregar otro personaje basta con registrar uno nuevo en CHARACTERS con su `markup` y su `apply(pose, parts)`; el motor y la
// pagina no cambian. Canales de la pose (todos numericos salvo `mouth`):
//   rootX, rootY (px), bodyRot (grados), sx, sy (escala del cuerpo), headRot, headX, headY,
//   armLsh/armRsh (grados; 0 = colgando, positivo = sube hacia afuera), armLel/armRel (grados; positivo = antebrazo hacia adentro/arriba),
//   tail, pupilX, pupilY (-1..1), lidTop (0 abierto .. 1 cerrado), lidBot (0..1 sonrisa de ojos), browLy/browRy (px), browLr/browRr (grados),
//   blush, heartEyes, tears, sparkle (0..1) y mouth (nombre de forma de boca).

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------------------------------------------------------------
  // Personaje: Mochi (gatito alegre con audifonos)
  // ---------------------------------------------------------------------------------------------------------------------

  const MOCHI_MARKUP = `
<svg xmlns="${SVG_NS}" viewBox="0 0 400 560" class="mc" role="img" aria-label="Mochi, el co-anfitrión">
  <defs>
    <clipPath id="mcClipL"><ellipse cx="160" cy="205" rx="23" ry="28"/></clipPath>
    <clipPath id="mcClipR"><ellipse cx="240" cy="205" rx="23" ry="28"/></clipPath>
    <radialGradient id="mcShadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <style>
    .mc { --main: #7c5cff; --light: color-mix(in srgb, var(--main) 28%, #fff); --dark: color-mix(in srgb, var(--main) 62%, #000); --ink: #1a1230; --pink: #ff8fb4; overflow: visible; }
    .mc .fill-main { fill: var(--main); } .mc .fill-light { fill: var(--light); } .mc .fill-dark { fill: var(--dark); }
    .mc .stroke-main { stroke: var(--main); fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .mc .ink { fill: var(--ink); } .mc .ink-stroke { stroke: var(--ink); fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .mc .hidden { display: none; }
  </style>

  <ellipse cx="200" cy="528" rx="100" ry="14" fill="url(#mcShadow)"/>

  <g id="mcRoot">
    <!-- cola -->
    <g id="mcTail"><path d="M258 470 Q330 470 336 400 Q340 366 316 360" class="stroke-main" stroke-width="26"/><circle cx="316" cy="360" r="15" class="fill-light"/></g>

    <g id="mcBody">
      <path d="M118 362 Q116 298 200 292 Q284 298 282 362 Q296 452 258 506 Q200 528 142 506 Q104 452 118 362 Z" class="fill-main"/>
      <ellipse cx="200" cy="424" rx="52" ry="72" class="fill-light"/>
      <ellipse cx="160" cy="514" rx="32" ry="16" class="fill-dark"/><ellipse cx="240" cy="514" rx="32" ry="16" class="fill-dark"/>
      <path d="M150 514 v-6 M160 516 v-8 M170 514 v-6 M230 514 v-6 M240 516 v-8 M250 514 v-6" class="ink-stroke" stroke-width="3" opacity=".35"/>

      <!-- brazo izquierdo de la pantalla -->
      <g id="mcArmL" transform="translate(130 340)">
        <path d="M0 0 L0 56" class="stroke-main" stroke-width="30"/>
        <g id="mcForeL" transform="translate(0 56)"><path d="M0 0 L0 46" class="stroke-main" stroke-width="28"/><circle cx="0" cy="52" r="21" class="fill-light"/><circle cx="-13" cy="60" r="8" class="fill-light"/></g>
      </g>
      <!-- brazo derecho de la pantalla -->
      <g id="mcArmR" transform="translate(270 340)">
        <path d="M0 0 L0 56" class="stroke-main" stroke-width="30"/>
        <g id="mcForeR" transform="translate(0 56)"><path d="M0 0 L0 46" class="stroke-main" stroke-width="28"/><circle cx="0" cy="52" r="21" class="fill-light"/><circle cx="13" cy="60" r="8" class="fill-light"/></g>
      </g>
    </g>

    <g id="mcHead">
      <!-- orejas -->
      <path d="M104 168 L94 70 L172 124 Z" class="fill-main" stroke="var(--main)" stroke-width="10" stroke-linejoin="round"/>
      <path d="M296 168 L306 70 L228 124 Z" class="fill-main" stroke="var(--main)" stroke-width="10" stroke-linejoin="round"/>
      <path d="M114 150 L108 96 L152 126 Z" fill="var(--pink)" opacity=".85"/>
      <path d="M286 150 L292 96 L248 126 Z" fill="var(--pink)" opacity=".85"/>
      <!-- cabeza -->
      <ellipse cx="200" cy="215" rx="110" ry="94" class="fill-main"/>
      <path d="M200 132 L190 160 M200 132 L210 160" class="ink-stroke" stroke-width="0"/>
      <ellipse cx="200" cy="252" rx="52" ry="34" class="fill-light"/>

      <!-- ojos -->
      <g id="mcEyeL">
        <ellipse cx="160" cy="205" rx="23" ry="28" fill="#fff"/>
        <g clip-path="url(#mcClipL)">
          <g id="mcPupilL"><circle cx="160" cy="207" r="16" fill="#3a2b7a"/><circle cx="160" cy="207" r="9.5" class="ink"/><circle cx="154" cy="199" r="5.2" fill="#fff"/><circle cx="167" cy="214" r="2.6" fill="#fff" opacity=".8"/></g>
          <g id="mcHeartL" class="hidden"><path d="M160 224 C142 210 144 194 154 194 C158 194 160 197 160 199 C160 197 162 194 166 194 C176 194 178 210 160 224 Z" fill="#ff4d86"/></g>
          <rect id="mcLidTopL" x="130" y="170" width="60" height="64" fill="var(--main)" transform="translate(0 170) scale(1 0) translate(0 -170)"/>
          <rect id="mcLidBotL" x="130" y="176" width="60" height="64" fill="var(--main)" transform="translate(0 234) scale(1 0) translate(0 -234)"/>
        </g>
        <ellipse cx="160" cy="205" rx="23" ry="28" fill="none" stroke="var(--dark)" stroke-width="3" opacity=".35"/>
      </g>
      <g id="mcEyeR">
        <ellipse cx="240" cy="205" rx="23" ry="28" fill="#fff"/>
        <g clip-path="url(#mcClipR)">
          <g id="mcPupilR"><circle cx="240" cy="207" r="16" fill="#3a2b7a"/><circle cx="240" cy="207" r="9.5" class="ink"/><circle cx="234" cy="199" r="5.2" fill="#fff"/><circle cx="247" cy="214" r="2.6" fill="#fff" opacity=".8"/></g>
          <g id="mcHeartR" class="hidden"><path d="M240 224 C222 210 224 194 234 194 C238 194 240 197 240 199 C240 197 242 194 246 194 C256 194 258 210 240 224 Z" fill="#ff4d86"/></g>
          <rect id="mcLidTopR" x="210" y="170" width="60" height="64" fill="var(--main)" transform="translate(0 170) scale(1 0) translate(0 -170)"/>
          <rect id="mcLidBotR" x="210" y="176" width="60" height="64" fill="var(--main)" transform="translate(0 234) scale(1 0) translate(0 -234)"/>
        </g>
        <ellipse cx="240" cy="205" rx="23" ry="28" fill="none" stroke="var(--dark)" stroke-width="3" opacity=".35"/>
      </g>

      <!-- cejas -->
      <g id="mcBrowL" transform="translate(160 164)"><path d="M-20 0 Q0 -9 20 0" class="ink-stroke" stroke-width="7"/></g>
      <g id="mcBrowR" transform="translate(240 164)"><path d="M-20 0 Q0 -9 20 0" class="ink-stroke" stroke-width="7"/></g>

      <!-- mejillas, nariz y bigotes -->
      <ellipse id="mcBlushL" cx="128" cy="244" rx="20" ry="12" fill="var(--pink)" opacity=".2"/>
      <ellipse id="mcBlushR" cx="272" cy="244" rx="20" ry="12" fill="var(--pink)" opacity=".2"/>
      <path d="M190 236 Q200 232 210 236 Q205 246 200 247 Q195 246 190 236 Z" fill="var(--pink)"/>
      <path d="M96 236 L132 240 M94 252 L130 250 M98 268 L132 258 M304 236 L268 240 M306 252 L270 250 M302 268 L268 258" class="ink-stroke" stroke-width="3" opacity=".3"/>

      <!-- boca -->
      <g id="mcMouth" transform="translate(200 262)">
        <path id="m-closed" d="M-22 0 Q0 11 22 0" class="ink-stroke" stroke-width="5"/>
        <path id="m-smile" class="hidden ink-stroke" d="M-32 -2 Q0 26 32 -2" stroke-width="5"/>
        <g id="m-open-smile" class="hidden"><path d="M-32 -4 Q0 44 32 -4 Z" class="ink"/><ellipse cx="0" cy="22" rx="14" ry="8" fill="#ff7a9e"/></g>
        <g id="m-laugh" class="hidden"><path d="M-36 -6 Q0 56 36 -6 Z" class="ink"/><ellipse cx="0" cy="26" rx="17" ry="10" fill="#ff7a9e"/></g>
        <g id="m-o" class="hidden"><ellipse cx="0" cy="8" rx="11" ry="14" class="ink"/><ellipse cx="0" cy="14" rx="6" ry="5" fill="#ff7a9e"/></g>
        <path id="m-flat" class="hidden ink-stroke" d="M-16 6 L16 6" stroke-width="5"/>
        <path id="m-smirk" class="hidden ink-stroke" d="M-24 8 Q4 16 26 -6" stroke-width="5"/>
        <path id="m-frown" class="hidden ink-stroke" d="M-22 12 Q0 -4 22 12" stroke-width="5"/>
        <g id="m-talk-small" class="hidden"><ellipse cx="0" cy="6" rx="14" ry="7" class="ink"/></g>
        <g id="m-talk-i" class="hidden"><ellipse cx="0" cy="6" rx="21" ry="5.5" class="ink"/></g>
        <g id="m-talk-o" class="hidden"><ellipse cx="0" cy="8" rx="10" ry="12" class="ink"/></g>
        <g id="m-talk-a" class="hidden"><ellipse cx="0" cy="10" rx="18" ry="15" class="ink"/><ellipse cx="0" cy="18" rx="10" ry="6" fill="#ff7a9e"/></g>
      </g>

      <!-- audifonos con microfono -->
      <path d="M100 196 Q98 86 200 84 Q302 86 300 196" fill="none" stroke="#2a2342" stroke-width="11" stroke-linecap="round"/>
      <rect x="82" y="182" width="30" height="62" rx="13" fill="#2a2342"/><rect x="88" y="190" width="14" height="46" rx="7" fill="var(--main)" opacity=".85"/>
      <rect x="288" y="182" width="30" height="62" rx="13" fill="#2a2342"/><rect x="298" y="190" width="14" height="46" rx="7" fill="var(--main)" opacity=".85"/>
      <path d="M94 242 Q104 290 150 286" fill="none" stroke="#2a2342" stroke-width="6" stroke-linecap="round"/>
      <circle cx="154" cy="286" r="9" fill="#2a2342"/><circle cx="154" cy="286" r="4" fill="#ff5c7a"/>

      <!-- efectos de la cara -->
      <g id="mcTears" class="hidden" opacity="0"><path d="M142 236 q-6 14 0 22 q6 -8 0 -22 Z" fill="#7ed0ff"/><path d="M258 236 q-6 14 0 22 q6 -8 0 -22 Z" fill="#7ed0ff"/></g>
      <g id="mcSparkle" opacity="0"><path d="M92 120 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5 z" fill="#ffe27a"/><path d="M308 112 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 z" fill="#ffe27a"/></g>
    </g>
  </g>
</svg>`;

  function q(root, id) {
    return root.querySelector(`#${id}`);
  }

  const MOUTHS = ['m-closed', 'm-smile', 'm-open-smile', 'm-laugh', 'm-o', 'm-flat', 'm-smirk', 'm-frown', 'm-talk-small', 'm-talk-i', 'm-talk-o', 'm-talk-a'];

  const MOCHI = {
    id: 'mochi',
    name: 'Mochi',
    markup: MOCHI_MARKUP,
    // Busca las partes una sola vez
    bind(root) {
      const parts = {};
      for (const id of ['mcRoot', 'mcBody', 'mcHead', 'mcTail', 'mcArmL', 'mcForeL', 'mcArmR', 'mcForeR', 'mcPupilL', 'mcPupilR', 'mcHeartL', 'mcHeartR',
        'mcLidTopL', 'mcLidTopR', 'mcLidBotL', 'mcLidBotR', 'mcBrowL', 'mcBrowR', 'mcBlushL', 'mcBlushR', 'mcMouth', 'mcTears', 'mcSparkle']) {
        parts[id] = q(root, id);
      }
      parts.mouths = Object.fromEntries(MOUTHS.map((id) => [id, q(root, id)]));
      parts.shownMouth = 'm-closed';
      parts.svg = root.querySelector('svg');
      return parts;
    },
    setAccent(parts, color) {
      parts.svg.style.setProperty('--main', color);
    },
    // Mueve las partes segun la pose
    apply(pose, p) {
      const rot = (deg, cx, cy) => `rotate(${deg.toFixed(2)} ${cx} ${cy})`;

      p.mcRoot.setAttribute('transform', `translate(${pose.rootX.toFixed(1)} ${pose.rootY.toFixed(1)})`);
      // el cuerpo se aplasta/estira apoyado en el suelo (y = 520) y se inclina
      p.mcBody.setAttribute('transform', `translate(200 520) rotate(${pose.bodyRot.toFixed(2)}) scale(${pose.sx.toFixed(3)} ${pose.sy.toFixed(3)}) translate(-200 -520)`);
      p.mcHead.setAttribute('transform', `translate(${pose.headX.toFixed(1)} ${pose.headY.toFixed(1)}) ${rot(pose.headRot, 200, 300)}`);
      p.mcTail.setAttribute('transform', rot(pose.tail, 262, 468));

      // brazos: lo positivo sube hacia afuera; el codo dobla el antebrazo hacia adentro
      p.mcArmL.setAttribute('transform', `translate(130 340) rotate(${pose.armLsh.toFixed(2)})`);
      p.mcForeL.setAttribute('transform', `translate(0 56) rotate(${(-pose.armLel).toFixed(2)})`);
      p.mcArmR.setAttribute('transform', `translate(270 340) rotate(${(-pose.armRsh).toFixed(2)})`);
      p.mcForeR.setAttribute('transform', `translate(0 56) rotate(${pose.armRel.toFixed(2)})`);

      // mirada
      const px = pose.pupilX * 7;
      const py = pose.pupilY * 6;
      p.mcPupilL.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);
      p.mcPupilR.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);
      const heart = pose.heartEyes > 0.5;
      p.mcHeartL.classList.toggle('hidden', !heart);
      p.mcHeartR.classList.toggle('hidden', !heart);
      p.mcPupilL.style.opacity = heart ? 0 : 1;
      p.mcPupilR.style.opacity = heart ? 0 : 1;

      // parpados: arriba (parpadeo, ojos caidos) y abajo (ojos que sonrien)
      const top = Math.max(0, Math.min(1, pose.lidTop));
      const bot = Math.max(0, Math.min(1, pose.lidBot));
      for (const side of ['L', 'R']) {
        p[`mcLidTop${side}`].setAttribute('transform', `translate(0 170) scale(1 ${top.toFixed(3)}) translate(0 -170)`);
        p[`mcLidBot${side}`].setAttribute('transform', `translate(0 234) scale(1 ${bot.toFixed(3)}) translate(0 -234)`);
      }

      p.mcBrowL.setAttribute('transform', `translate(160 ${(164 + pose.browLy).toFixed(1)}) rotate(${pose.browLr.toFixed(1)})`);
      p.mcBrowR.setAttribute('transform', `translate(240 ${(164 + pose.browRy).toFixed(1)}) rotate(${pose.browRr.toFixed(1)})`);

      p.mcBlushL.setAttribute('opacity', pose.blush.toFixed(2));
      p.mcBlushR.setAttribute('opacity', pose.blush.toFixed(2));
      p.mcSparkle.setAttribute('opacity', pose.sparkle.toFixed(2));
      p.mcTears.classList.toggle('hidden', pose.tears < 0.05);
      p.mcTears.setAttribute('opacity', pose.tears.toFixed(2));

      if (pose.mouth !== p.shownMouth) {
        p.mouths[p.shownMouth]?.classList.add('hidden');
        p.mouths[pose.mouth]?.classList.remove('hidden');
        p.shownMouth = pose.mouth;
      }
    },
  };

  const CHARACTERS = { mochi: MOCHI };

  // ---------------------------------------------------------------------------------------------------------------------
  // Expresiones (la cara): cada una es un objetivo hacia el que la cara se mueve con suavidad
  // ---------------------------------------------------------------------------------------------------------------------

  const EXPRESSIONS = {
    neutral: { browLy: 0, browRy: 0, browLr: 0, browRr: 0, lidTop: 0, lidBot: 0, blush: 0.22, mouth: 'm-closed', heartEyes: 0, tears: 0, sparkle: 0, look: [0, 0] },
    feliz: { browLy: -4, browRy: -4, browLr: -4, browRr: 4, lidTop: 0, lidBot: 0.2, blush: 0.55, mouth: 'm-smile', heartEyes: 0, tears: 0, sparkle: 0, look: [0, 0] },
    emocionado: { browLy: -12, browRy: -12, browLr: -6, browRr: 6, lidTop: 0, lidBot: 0.1, blush: 0.7, mouth: 'm-open-smile', heartEyes: 0, tears: 0, sparkle: 1, look: [0, -0.1] },
    sorprendido: { browLy: -16, browRy: -16, browLr: 0, browRr: 0, lidTop: 0, lidBot: 0, blush: 0.3, mouth: 'm-o', heartEyes: 0, tears: 0, sparkle: 0.4, look: [0, 0] },
    pensando: { browLy: -10, browRy: 2, browLr: -8, browRr: 10, lidTop: 0.12, lidBot: 0, blush: 0.2, mouth: 'm-flat', heartEyes: 0, tears: 0, sparkle: 0, look: [-0.7, -0.8] },
    risa: { browLy: -6, browRy: -6, browLr: -6, browRr: 6, lidTop: 0.4, lidBot: 0.55, blush: 0.75, mouth: 'm-laugh', heartEyes: 0, tears: 0, sparkle: 0, look: [0, 0] },
    carino: { browLy: -6, browRy: -6, browLr: -8, browRr: 8, lidTop: 0, lidBot: 0.15, blush: 0.95, mouth: 'm-smile', heartEyes: 1, tears: 0, sparkle: 0.3, look: [0, 0] },
    picaro: { browLy: -12, browRy: 3, browLr: -10, browRr: 6, lidTop: 0.3, lidBot: 0.1, blush: 0.4, mouth: 'm-smirk', heartEyes: 0, tears: 0, sparkle: 0, look: [0.6, 0] },
    triste: { browLy: -2, browRy: -2, browLr: 14, browRr: -14, lidTop: 0.22, lidBot: 0, blush: 0.1, mouth: 'm-frown', heartEyes: 0, tears: 0.9, sparkle: 0, look: [0, 0.6] },
  };

  const NUMERIC = ['browLy', 'browRy', 'browLr', 'browRr', 'lidTop', 'lidBot', 'blush', 'heartEyes', 'tears', 'sparkle'];

  // ---------------------------------------------------------------------------------------------------------------------
  // Acciones (el cuerpo): cada una devuelve, para el instante t (segundos), canales absolutos (abs) y canales que se suman (add).
  // `w` (0..1) es el peso: entra y sale suave, asi que nunca hay saltos entre una accion y la pose normal.
  // ---------------------------------------------------------------------------------------------------------------------

  const TAU = Math.PI * 2;
  const bounce = (t, period) => Math.abs(Math.sin((Math.PI * t) / period));

  const ACTIONS = {
    ninguna: { dur: 0.1, fn: () => ({}) },

    saludar: {
      dur: 2.5,
      fn: (t) => ({ abs: { armRsh: 148, armRel: 28 + 26 * Math.sin(t * 13) }, add: { headRot: 4, bodyRot: -1.5, tail: 10 * Math.sin(t * 7) }, effect: t < 0.05 ? 'sparkles' : null }),
    },

    aplaudir: {
      dur: 2.3,
      fn: (t) => {
        const clap = Math.sin(t * 17);
        return { abs: { armLsh: -(30 + 7 * clap), armRsh: -(30 + 7 * clap), armLel: 100, armRel: 100 }, add: { rootY: -3 * Math.abs(clap), headRot: 2 * clap } };
      },
    },

    bailar: {
      dur: 3.8,
      fn: (t) => {
        const beat = Math.sin(t * 5.2);
        return {
          abs: { armLsh: 105 + 60 * beat, armRsh: 105 - 60 * beat, armLel: 20, armRel: 20 },
          add: { rootX: 16 * beat, rootY: -12 * Math.abs(Math.sin(t * 5.2)), bodyRot: 7 * beat, headRot: 8 * Math.sin(t * 5.2 + 0.6), tail: 24 * Math.sin(t * 10) },
        };
      },
    },

    saltar: {
      dur: 1.6,
      fn: (t) => {
        const air = bounce(t, 0.8);
        return { abs: { armLsh: 70 * air, armRsh: 70 * air }, add: { rootY: -70 * air, sy: 0.1 * air - 0.1 * (1 - air) * 0.7, sx: -0.05 * air + 0.07 * (1 - air), tail: 20 * air } };
      },
    },

    celebrar: {
      dur: 2.8,
      fn: (t) => {
        const air = bounce(t, 0.7);
        return {
          abs: { armLsh: 150 + 18 * Math.sin(t * 14), armRsh: 150 - 18 * Math.sin(t * 14), armLel: 10, armRel: 10 },
          add: { rootY: -64 * air, sy: 0.09 * air - 0.07 * (1 - air), sx: -0.04 * air + 0.06 * (1 - air), headRot: 5 * Math.sin(t * 9), tail: 28 * Math.sin(t * 12) },
          effect: t < 0.05 ? 'confetti' : null,
        };
      },
    },

    pensar: {
      dur: 3,
      fn: (t) => ({ abs: { armRsh: 125, armRel: 205 }, add: { headRot: -7, headY: 5, headX: -5, bodyRot: -1 }, effect: t < 0.05 ? 'thought' : null }),
    },

    encogerse: {
      dur: 1.9,
      fn: (t) => ({ abs: { armLsh: 36, armRsh: 36, armLel: -80 + 4 * Math.sin(t * 6), armRel: -80 + 4 * Math.sin(t * 6) }, add: { headRot: 9 * Math.sin(t * 3), rootY: -6, headY: -4 } }),
    },

    senalar: {
      dur: 2.2,
      fn: (t) => ({ abs: { armRsh: 100 + 3 * Math.sin(t * 6), armRel: 0 }, add: { headRot: 5, headX: 8, bodyRot: 2 } }),
    },

    asentir: {
      dur: 1.6,
      fn: (t) => ({ abs: {}, add: { headY: 9 * Math.abs(Math.sin(t * 6.4)), headRot: 1.5 * Math.sin(t * 6.4) } }),
    },

    negar: {
      dur: 1.7,
      fn: (t) => ({ abs: { armRsh: 55, armRel: -125 + 15 * Math.sin(t * 12) }, add: { headRot: 11 * Math.sin(t * 10.5) * Math.exp(-t * 0.5), headX: 3 * Math.sin(t * 10.5) } }),
    },

    corazon: {
      dur: 2.8,
      fn: (t) => ({ abs: { armLsh: -38, armRsh: -38, armLel: 112, armRel: 112 }, add: { headRot: 4 * Math.sin(t * 3), rootY: -4 * Math.abs(Math.sin(t * 6)), bodyRot: 2 * Math.sin(t * 3), tail: 14 * Math.sin(t * 6) }, effect: t < 0.05 ? 'hearts' : null }),
    },
  };

  // ---------------------------------------------------------------------------------------------------------------------
  // Motor
  // ---------------------------------------------------------------------------------------------------------------------

  const smooth = (edge0, edge1, x) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  function neutralPose() {
    return {
      rootX: 0, rootY: 0, bodyRot: 0, sx: 1, sy: 1, headRot: 0, headX: 0, headY: 0,
      armLsh: 6, armLel: 4, armRsh: 6, armRel: 4, tail: 0, pupilX: 0, pupilY: 0,
      lidTop: 0, lidBot: 0, browLy: 0, browRy: 0, browLr: 0, browRr: 0,
      blush: 0.2, heartEyes: 0, tears: 0, sparkle: 0, mouth: 'm-closed',
    };
  }

  class Rig {
    constructor(container, { character = 'mochi', accent = '#7c5cff', onEffect = null } = {}) {
      const art = CHARACTERS[character] || CHARACTERS.mochi;
      this.art = art;
      this.onEffect = onEffect;
      container.innerHTML = art.markup;
      this.parts = art.bind(container);
      art.setAccent(this.parts, accent);

      this.face = { ...EXPRESSIONS.neutral };
      this.faceTarget = EXPRESSIONS.neutral;
      this.expressionName = 'neutral';
      this.expressionUntil = 0;
      this.look = { x: 0, y: 0, tx: 0, ty: 0, nextAt: 0, override: null };
      this.blink = { start: -1, next: 1.5 };
      this.speaking = { on: false, until: 0, viseme: 'm-closed', nextAt: 0, open: 0, beatAt: 0, beat: null, beatStart: 0 };
      this.actionQueue = [];
      this.action = null;
      this.pose = neutralPose();
      this.clock = 0;
      this.last = performance.now();
      this.running = true;
      this.loop = this.loop.bind(this);
      this.frame = requestAnimationFrame(this.loop);
    }

    setAccent(color) {
      this.art.setAccent(this.parts, color);
    }

    // Expresion de la cara. holdMs = cuanto dura antes de volver a neutral (0 = hasta que se cambie).
    setExpression(name, holdMs = 0) {
      const target = EXPRESSIONS[name] || EXPRESSIONS.neutral;
      this.faceTarget = target;
      this.expressionName = name;
      this.expressionUntil = holdMs > 0 ? this.clock + holdMs / 1000 : 0;
    }

    play(name) {
      const action = ACTIONS[name];
      if (!action || name === 'ninguna') return;
      if (this.action && this.action.name === name) return; // ya lo esta haciendo
      if (this.action && this.actionQueue.length < 2) this.actionQueue.push(name);
      else if (!this.action) this.startAction(name);
    }

    startAction(name) {
      this.action = { name, def: ACTIONS[name], start: this.clock, emitted: false };
    }

    startSpeaking(durationMs = 4000) {
      this.speaking.on = true;
      this.speaking.until = this.clock + durationMs / 1000 + 0.4;
    }

    stopSpeaking() {
      this.speaking.on = false;
    }

    // Una palabra nueva en la voz: abre la boca un poco mas fuerte
    pulseWord(strength = 1) {
      this.speaking.open = Math.min(1, 0.55 + 0.45 * strength);
      this.speaking.nextAt = 0;
    }

    lookAt(x, y, ms = 1500) {
      this.look.override = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), until: this.clock + ms / 1000 };
    }

    destroy() {
      this.running = false;
      cancelAnimationFrame(this.frame);
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.clock += dt;
      this.update(dt);
      this.art.apply(this.pose, this.parts);
      this.frame = requestAnimationFrame(this.loop);
    }

    update(dt) {
      const t = this.clock;
      const pose = neutralPose();

      // ----- respiracion y vida propia -----
      const breath = Math.sin((t * TAU) / 3.4);
      pose.sy = 1 + 0.012 * breath;
      pose.sx = 1 - 0.006 * breath;
      pose.rootY = -1.2 * breath;
      pose.headRot = 2.2 * Math.sin(t * 0.7) + 0.8 * Math.sin(t * 1.9);
      pose.headY = 1.2 * Math.sin(t * 1.3);
      pose.tail = 9 * Math.sin(t * 1.6) + 4 * Math.sin(t * 3.1);
      pose.bodyRot = 0.8 * Math.sin(t * 0.55);
      pose.armLsh = 6 + 1.6 * Math.sin(t * 1.1);
      pose.armRsh = 6 + 1.6 * Math.sin(t * 1.1 + 1.2);

      // ----- expresion (la cara se acerca suave al objetivo) -----
      if (this.expressionUntil && t > this.expressionUntil) {
        this.faceTarget = EXPRESSIONS.neutral;
        this.expressionName = 'neutral';
        this.expressionUntil = 0;
      }
      const k = 1 - Math.exp(-9 * dt);
      for (const key of NUMERIC) this.face[key] += (this.faceTarget[key] - this.face[key]) * k;
      pose.browLy = this.face.browLy; pose.browRy = this.face.browRy; pose.browLr = this.face.browLr; pose.browRr = this.face.browRr;
      pose.lidTop = this.face.lidTop; pose.lidBot = this.face.lidBot;
      pose.blush = this.face.blush; pose.heartEyes = this.face.heartEyes; pose.tears = this.face.tears; pose.sparkle = this.face.sparkle;
      pose.mouth = this.faceTarget.mouth;

      // ----- mirada -----
      const look = this.look;
      if (look.override && t > look.override.until) look.override = null;
      if (t >= look.nextAt) {
        look.tx = (Math.random() - 0.5) * 0.9;
        look.ty = (Math.random() - 0.5) * 0.5;
        look.nextAt = t + 1.1 + Math.random() * 2.4;
      }
      const wantX = look.override ? look.override.x : (this.speaking.on ? look.tx * 0.35 : look.tx) + this.faceTarget.look[0] * 0.9;
      const wantY = look.override ? look.override.y : (this.speaking.on ? look.ty * 0.35 : look.ty) + this.faceTarget.look[1] * 0.9;
      const lk = 1 - Math.exp(-14 * dt);
      look.x += (wantX - look.x) * lk;
      look.y += (wantY - look.y) * lk;
      pose.pupilX = look.x;
      pose.pupilY = look.y;
      pose.headX += look.x * 3;

      // ----- parpadeo -----
      const blink = this.blink;
      if (blink.start < 0 && t >= blink.next) blink.start = t;
      if (blink.start >= 0) {
        const u = (t - blink.start) / 0.17;
        if (u >= 1) {
          blink.start = -1;
          blink.next = t + 2.2 + Math.random() * 3.6 + (Math.random() < 0.2 ? -1.6 : 0);
        } else {
          pose.lidTop = Math.max(pose.lidTop, Math.sin(u * Math.PI));
        }
      }

      // ----- hablar: la boca sigue la voz y el cuerpo acompaña con gestos pequeños -----
      const sp = this.speaking;
      if (sp.on && t > sp.until) sp.on = false;
      if (sp.on) {
        if (t >= sp.nextAt) {
          const r = Math.random();
          const loud = sp.open > 0.5;
          sp.viseme = loud ? (r < 0.5 ? 'm-talk-a' : r < 0.8 ? 'm-talk-o' : 'm-talk-i') : (r < 0.25 ? 'm-closed' : r < 0.55 ? 'm-talk-small' : r < 0.8 ? 'm-talk-i' : 'm-talk-o');
          sp.open = Math.max(0, sp.open - 0.35);
          sp.nextAt = t + 0.07 + Math.random() * 0.1;
        }
        pose.mouth = sp.viseme;
        pose.headRot += 1.8 * Math.sin(t * 5.1);
        pose.headY += 1.5 * Math.sin(t * 7.3);

        // gesto de "ritmo" con las manos mientras habla (si no hay una accion mas grande)
        if (!this.action) {
          if (t >= sp.beatAt) {
            const options = ['L', 'R', 'B', null];
            sp.beat = options[Math.floor(Math.random() * options.length)];
            sp.beatStart = t;
            sp.beatAt = t + 1.0 + Math.random() * 1.8;
          }
          if (sp.beat) {
            const u = (t - sp.beatStart) / 0.9;
            if (u >= 0 && u < 1) {
              const lift = Math.sin(u * Math.PI);
              if (sp.beat === 'L' || sp.beat === 'B') { pose.armLsh += 34 * lift; pose.armLel += 40 * lift; }
              if (sp.beat === 'R' || sp.beat === 'B') { pose.armRsh += 34 * lift; pose.armRel += 40 * lift; }
              pose.headRot += (sp.beat === 'L' ? -3 : 3) * lift;
            }
          }
        }
      }

      // ----- accion -----
      if (!this.action && this.actionQueue.length) this.startAction(this.actionQueue.shift());
      if (this.action) {
        const a = this.action;
        const local = t - a.start;
        const u = local / a.def.dur;
        if (u >= 1) {
          this.action = null;
        } else {
          const w = smooth(0, 0.14, u) * (1 - smooth(0.86, 1, u));
          const out = a.def.fn(local);
          if (out.effect && !a.emitted && this.onEffect) {
            a.emitted = true;
            this.onEffect(out.effect);
          }
          for (const [key, value] of Object.entries(out.abs || {})) pose[key] += (value - pose[key]) * w;
          for (const [key, value] of Object.entries(out.add || {})) pose[key] += value * w;
        }
      }

      this.pose = pose;
    }
  }

  window.AiCharacter = {
    create(container, options) {
      return new Rig(container, options);
    },
    CHARACTERS,
    EXPRESSIONS,
    ACTIONS,
    list() {
      return Object.values(CHARACTERS).map((item) => ({ id: item.id, name: item.name }));
    },
  };
})();
