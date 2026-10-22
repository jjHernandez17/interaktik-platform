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

  // ---------------------------------------------------------------------------------------------------------------------
  // Personaje: CJ (personaje ORIGINAL con el estilo de Los Santos / San Andreas: camiseta verde sin mangas, bandana, cadena y tenis).
  // No usa arte, modelos ni imagenes de Rockstar: es un dibujo propio hecho en SVG.
  // ---------------------------------------------------------------------------------------------------------------------

  const CJ_MARKUP = `
<svg xmlns="${SVG_NS}" viewBox="0 0 400 560" class="cj" role="img" aria-label="CJ, el co-anfitrión">
  <defs>
    <clipPath id="cjClipL"><path d="M150 206 Q168 187 186 206 Q168 225 150 206 Z"/></clipPath>
    <clipPath id="cjClipR"><path d="M214 206 Q232 187 250 206 Q232 225 214 206 Z"/></clipPath>
    <clipPath id="cjClipHead"><path d="M124 188 C122 128 156 100 200 100 C244 100 278 128 276 188 C276 214 270 236 256 254 C242 272 222 282 200 282 C178 282 158 272 144 254 C130 236 124 214 124 188 Z"/></clipPath>
    <clipPath id="cjClipShirt"><path d="M116 330 C112 306 134 296 160 292 C170 322 230 322 240 292 C266 296 288 306 284 330 L292 440 C246 460 154 460 108 440 Z"/></clipPath>
    <clipPath id="cjClipArm"><path d="M-22 -8 C-28 18 -26 40 -17 60 L17 60 C26 40 28 18 22 -8 C10 -14 -10 -14 -22 -8 Z"/></clipPath>
    <radialGradient id="cjShadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="cjSkinHead" cx="46%" cy="36%" r="70%"><stop offset="0" stop-color="#c0895f"/><stop offset=".55" stop-color="#a06a44"/><stop offset="1" stop-color="#7a4a2d"/></radialGradient>
    <linearGradient id="cjSkinArm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5636"/><stop offset=".45" stop-color="#b07848"/><stop offset="1" stop-color="#8a5636"/></linearGradient>
    <linearGradient id="cjShirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#37b055"/><stop offset=".6" stop-color="#26923f"/><stop offset="1" stop-color="#1a6c2e"/></linearGradient>
    <linearGradient id="cjJeans" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2c3e63"/><stop offset=".5" stop-color="#40578a"/><stop offset="1" stop-color="#2c3e63"/></linearGradient>
    <linearGradient id="cjShoe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d7d9e4"/></linearGradient>
    <linearGradient id="cjBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="color-mix(in srgb, var(--main) 80%, #fff)"/><stop offset="1" stop-color="color-mix(in srgb, var(--main) 75%, #000)"/></linearGradient>
    <radialGradient id="cjIris" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#8a5a2e"/><stop offset="1" stop-color="#3b2212"/></radialGradient>
  </defs>
  <style>
    .cj { --main: #2fa24d; --skin: #a06a44; --skin-dark: #7a4a2d; --skin-light: #c0895f; --line: #1c120d; --ink: #17121a; overflow: visible; }
    .cj .o { stroke: var(--line); stroke-width: 4.5; stroke-linejoin: round; stroke-linecap: round; }
    .cj .o2 { stroke: var(--line); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
    .cj .fx { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .cj .ink { fill: var(--ink); } .cj .ink-stroke { stroke: var(--ink); fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .cj .hidden { display: none; }
  </style>

  <ellipse cx="200" cy="548" rx="112" ry="13" fill="url(#cjShadow)"/>

  <g id="cjRoot">
    <g id="cjBody">
      <!-- ===== piernas: jeans anchos con pliegues ===== -->
      <path d="M130 440 C124 470 122 504 122 530 L196 530 C198 500 200 470 199 440 Z" fill="url(#cjJeans)" class="o"/>
      <path d="M201 440 C200 470 202 500 204 530 L278 530 C278 504 276 470 270 440 Z" fill="url(#cjJeans)" class="o"/>
      <path d="M200 442 L200 528" stroke="#22304f" stroke-width="3" class="fx" opacity=".8"/>
      <path d="M134 470 C150 476 168 476 190 470 M136 494 C148 500 166 500 188 494 M214 470 C232 476 250 476 266 470 M212 494 C230 500 248 500 264 494" stroke="#22304f" stroke-width="3" class="fx" opacity=".55"/>
      <path d="M138 450 C144 460 152 464 162 462 M262 450 C256 460 248 464 238 462" stroke="#6f86b8" stroke-width="3" class="fx" opacity=".55"/>
      <path d="M130 441 C160 449 240 449 270 441" stroke="#22304f" stroke-width="6" class="fx" opacity=".75"/>
      <path d="M126 520 C150 524 172 524 196 520 M204 520 C228 524 250 524 274 520" stroke="#22304f" stroke-width="4" class="fx" opacity=".6"/>

      <!-- ===== tenis ===== -->
      <path d="M110 538 C104 516 120 508 146 510 L188 514 C204 522 208 536 200 542 L114 544 Z" fill="url(#cjShoe)" class="o"/>
      <path d="M110 540 L202 542 L200 550 C176 554 134 554 112 550 Z" fill="#c4c6d4" class="o2"/>
      <path d="M122 524 C132 520 142 520 150 524 M146 516 L152 524 M158 518 L162 526 M170 520 L174 528" stroke="#2fa24d" stroke-width="4" class="fx"/>
      <path d="M204 542 L296 538 C302 516 286 508 262 510 L214 514 C198 522 194 536 204 542 Z" fill="url(#cjShoe)" class="o" transform="translate(-2 0) translate(0 0)"/>
      <path d="M198 542 L290 540 L288 550 C266 554 224 554 200 550 Z" fill="#c4c6d4" class="o2"/>
      <path d="M278 524 C268 520 258 520 250 524 M254 516 L248 524 M242 518 L238 526 M230 520 L226 528" stroke="#2fa24d" stroke-width="4" class="fx"/>

      <!-- ===== torso ===== -->
      <path d="M176 270 C178 292 172 300 160 308 L240 308 C228 300 222 292 224 270 Z" fill="url(#cjSkinArm)" class="o"/>
      <path d="M158 290 C170 332 230 332 242 290 Z" fill="var(--skin)" class="o"/>
      <path d="M116 330 C112 306 134 296 160 292 C170 322 230 322 240 292 C266 296 288 306 284 330 L292 440 C246 460 154 460 108 440 Z" fill="url(#cjShirt)" class="o"/>
      <g clip-path="url(#cjClipShirt)">
        <path d="M104 330 C130 360 130 420 112 470 L96 470 L96 330 Z" fill="#0f4d20" opacity=".35"/>
        <path d="M296 330 C270 360 270 420 288 470 L304 470 L304 330 Z" fill="#0f4d20" opacity=".35"/>
        <path d="M150 340 C170 352 230 352 250 340" stroke="#7be08f" stroke-width="5" class="fx" opacity=".35"/>
        <path d="M150 380 C160 410 156 440 140 462 M250 380 C240 410 244 440 260 462 M200 350 C196 390 202 430 198 470" stroke="#0f4d20" stroke-width="4" class="fx" opacity=".4"/>
        <path d="M118 440 C170 458 230 458 282 440" stroke="#0f4d20" stroke-width="6" class="fx" opacity=".5"/>
      </g>
      <path d="M160 292 C170 322 230 322 240 292" stroke="#14612a" stroke-width="6" class="fx"/>
      <path d="M118 326 C124 308 140 298 160 292 M282 326 C276 308 260 298 240 292" stroke="#14612a" stroke-width="5" class="fx" opacity=".7"/>

      <!-- cadena de oro -->
      <path d="M166 296 C174 338 226 338 234 296" stroke="#8a6410" stroke-width="8" class="fx"/>
      <path d="M166 296 C174 338 226 338 234 296" stroke="#f3cb45" stroke-width="5.5" class="fx" stroke-dasharray="3.5 2"/>
      <rect x="187" y="332" width="26" height="24" rx="6" fill="#f3cb45" class="o2"/>
      <path d="M194 340 L206 340 M194 346 L206 346" stroke="#b88a1a" stroke-width="3" class="fx"/>
      <path d="M192 336 L196 336" stroke="#fff6c8" stroke-width="3" class="fx"/>

      <!-- ===== brazo izquierdo de la pantalla ===== -->
      <g id="cjArmL" transform="translate(120 330)">
        <path d="M-22 -8 C-28 18 -26 40 -17 60 L17 60 C26 40 28 18 22 -8 C10 -14 -10 -14 -22 -8 Z" fill="url(#cjSkinArm)" class="o"/>
        <g clip-path="url(#cjClipArm)"><path d="M-30 -10 C-20 20 -16 44 -20 66 L-34 66 Z" fill="#5e3720" opacity=".35"/><ellipse cx="2" cy="14" rx="8" ry="14" fill="#d9a074" opacity=".35"/></g>
        <g id="cjForeL" transform="translate(0 60)">
          <path d="M-17 -3 C-20 18 -16 38 -12 52 L12 52 C16 38 20 18 17 -3 Z" fill="url(#cjSkinArm)" class="o"/>
          <path d="M-8 6 C-8 20 -6 30 -5 40" stroke="#d9a074" stroke-width="4" class="fx" opacity=".35"/>
          <rect x="-15" y="33" width="30" height="13" rx="5" fill="#f6f6f8" class="o2"/>
          <path d="M-16 52 C-24 62 -22 82 -6 88 C8 92 22 82 20 64 C19 56 14 52 12 52 Z" fill="url(#cjSkinArm)" class="o"/>
          <path d="M-9 78 L-9 88 M0 80 L0 90 M9 78 L9 88" stroke="#5e3720" stroke-width="2.5" class="fx" opacity=".7"/>
          <path d="M-17 62 C-27 66 -24 78 -16 78" fill="none" class="o2"/>
        </g>
      </g>
      <!-- brazo derecho de la pantalla -->
      <g id="cjArmR" transform="translate(280 330)">
        <path d="M-22 -8 C-28 18 -26 40 -17 60 L17 60 C26 40 28 18 22 -8 C10 -14 -10 -14 -22 -8 Z" fill="url(#cjSkinArm)" class="o"/>
        <g clip-path="url(#cjClipArm)"><path d="M30 -10 C20 20 16 44 20 66 L34 66 Z" fill="#5e3720" opacity=".35"/><ellipse cx="-2" cy="14" rx="8" ry="14" fill="#d9a074" opacity=".35"/></g>
        <g id="cjForeR" transform="translate(0 60)">
          <path d="M-17 -3 C-20 18 -16 38 -12 52 L12 52 C16 38 20 18 17 -3 Z" fill="url(#cjSkinArm)" class="o"/>
          <path d="M8 6 C8 20 6 30 5 40" stroke="#d9a074" stroke-width="4" class="fx" opacity=".35"/>
          <rect x="-15" y="33" width="30" height="13" rx="5" fill="#f6f6f8" class="o2"/>
          <path d="M16 52 C24 62 22 82 6 88 C-8 92 -22 82 -20 64 C-19 56 -14 52 -12 52 Z" fill="url(#cjSkinArm)" class="o"/>
          <path d="M9 78 L9 88 M0 80 L0 90 M-9 78 L-9 88" stroke="#5e3720" stroke-width="2.5" class="fx" opacity=".7"/>
          <path d="M17 62 C27 66 24 78 16 78" fill="none" class="o2"/>
          <!-- arma de CJ (se ve solo al disparar; sale de frente, apuntando a la camara) -->
          <g id="cjGun" class="hidden" transform="translate(-14 62)">
            <rect x="-9" y="2" width="18" height="24" rx="5" fill="#23252b" class="o2"/>
            <rect x="-16" y="-20" width="32" height="26" rx="6" fill="#3a3d46" class="o2"/>
            <rect x="-13" y="-18" width="26" height="6" rx="3" fill="#7a8090"/>
            <circle cx="0" cy="-7" r="8.5" fill="#101114" class="o2"/><circle cx="0" cy="-7" r="4.5" fill="#000"/>
            <rect x="-2.5" y="-25" width="5" height="6" rx="1.5" fill="#2a2c33" class="o2"/>
            <g id="cjFlash" opacity="0" transform="translate(0 -7) scale(0)">
              <path d="M0 -44 L9 -14 L40 -22 L16 -2 L44 16 L12 10 L16 42 L0 20 L-16 42 L-12 10 L-44 16 L-16 -2 L-40 -22 L-9 -14 Z" fill="#ff9a1f"/>
              <path d="M0 -28 L6 -9 L26 -14 L10 -1 L28 10 L8 6 L10 26 L0 12 L-10 26 L-8 6 L-28 10 L-10 -1 L-26 -14 L-6 -9 Z" fill="#ffe14d"/>
              <circle r="9" fill="#fff"/>
            </g>
          </g>
        </g>
      </g>
    </g>

    <g id="cjHead">
      <!-- orejas -->
      <path d="M128 186 C108 176 100 198 106 216 C110 230 124 232 132 222 Z" fill="var(--skin-dark)" class="o"/>
      <path d="M272 186 C292 176 300 198 294 216 C290 230 276 232 268 222 Z" fill="var(--skin-dark)" class="o"/>
      <path d="M118 194 C112 200 112 212 118 218 M282 194 C288 200 288 212 282 218" stroke="#4d2c18" stroke-width="3" class="fx" opacity=".6"/>

      <!-- cara -->
      <path d="M124 188 C122 128 156 100 200 100 C244 100 278 128 276 188 C276 214 270 236 256 254 C242 272 222 282 200 282 C178 282 158 272 144 254 C130 236 124 214 124 188 Z" fill="url(#cjSkinHead)" class="o"/>
      <g clip-path="url(#cjClipHead)">
        <path d="M120 200 C126 250 160 286 200 286 L120 290 Z" fill="#5e3720" opacity=".28"/>
        <path d="M280 200 C274 250 240 286 200 286 L280 290 Z" fill="#5e3720" opacity=".28"/>
        <ellipse cx="200" cy="130" rx="46" ry="12" fill="#d9a074" opacity=".22"/>
        <path d="M150 238 C160 252 176 260 200 261 C224 260 240 252 250 238" stroke="#5e3720" stroke-width="3" class="fx" opacity=".25"/>
        <!-- barba corta -->
        <path d="M150 248 C158 276 180 286 200 286 C220 286 242 276 250 248 C240 262 222 266 200 266 C178 266 160 262 150 248 Z" fill="#1a1318" opacity=".55"/>
        <path d="M178 250 C190 246 210 246 222 250 C216 256 184 256 178 250 Z" fill="#1a1318" opacity=".6"/>
      </g>

      <!-- pelo corto -->
      <path d="M121 186 C114 112 152 90 200 90 C248 90 286 112 279 186 C272 160 256 142 200 140 C144 142 128 160 121 186 Z" class="ink o2"/>
      <path d="M136 132 C158 108 194 102 224 110" stroke="#4b4258" stroke-width="4" class="fx" opacity=".55"/>
      <path d="M126 150 C132 140 140 134 150 130" stroke="#4b4258" stroke-width="3" class="fx" opacity=".4"/>
      <path d="M122 182 C121 196 124 210 130 220 L134 196 Z" class="ink"/><path d="M278 182 C279 196 276 210 270 220 L266 196 Z" class="ink"/>

      <!-- bandana con nudo -->
      <path d="M274 170 L314 154 C320 164 318 178 308 186 Z" fill="url(#cjBand)" class="o2"/>
      <path d="M276 184 L312 204 C304 216 292 214 284 208 Z" fill="url(#cjBand)" class="o2"/>
      <path d="M120 166 Q200 136 280 166 L282 186 Q200 156 118 186 Z" fill="url(#cjBand)" class="o"/>
      <circle cx="146" cy="168" r="2.4" fill="#fff" opacity=".7"/><circle cx="166" cy="162" r="2.4" fill="#fff" opacity=".7"/><circle cx="188" cy="158" r="2.4" fill="#fff" opacity=".7"/>
      <circle cx="212" cy="158" r="2.4" fill="#fff" opacity=".7"/><circle cx="234" cy="162" r="2.4" fill="#fff" opacity=".7"/><circle cx="254" cy="168" r="2.4" fill="#fff" opacity=".7"/>
      <path d="M122 176 Q200 148 278 176" stroke="#fff" stroke-width="2" stroke-dasharray="3 5" class="fx" opacity=".45"/>
      <circle cx="278" cy="176" r="9" fill="url(#cjBand)" class="o2"/>

      <!-- ojos -->
      <g id="cjEyeL">
        <path d="M150 206 Q168 187 186 206 Q168 225 150 206 Z" fill="#fff"/>
        <g clip-path="url(#cjClipL)">
          <g id="cjPupilL"><circle cx="168" cy="207" r="10.5" fill="url(#cjIris)"/><circle cx="168" cy="207" r="5.6" class="ink"/><circle cx="163.5" cy="202.5" r="3.4" fill="#fff"/><circle cx="172" cy="211" r="1.6" fill="#fff" opacity=".7"/></g>
          <g id="cjHeartL" class="hidden"><path d="M168 220 C156 211 157 200 163 200 C166 200 168 202 168 204 C168 202 170 200 173 200 C179 200 180 211 168 220 Z" fill="#ff4d86"/></g>
          <rect id="cjLidTopL" x="146" y="184" width="44" height="42" fill="var(--skin)" transform="translate(0 184) scale(1 0) translate(0 -184)"/>
          <rect id="cjLidBotL" x="146" y="196" width="44" height="32" fill="var(--skin)" transform="translate(0 226) scale(1 0) translate(0 -226)"/>
        </g>
        <path d="M148 207 Q168 184 188 207" stroke="var(--line)" stroke-width="4.5" class="fx"/>
        <path d="M154 216 Q168 226 182 216" stroke="#5e3720" stroke-width="2.5" class="fx" opacity=".5"/>
      </g>
      <g id="cjEyeR">
        <path d="M214 206 Q232 187 250 206 Q232 225 214 206 Z" fill="#fff"/>
        <g clip-path="url(#cjClipR)">
          <g id="cjPupilR"><circle cx="232" cy="207" r="10.5" fill="url(#cjIris)"/><circle cx="232" cy="207" r="5.6" class="ink"/><circle cx="227.5" cy="202.5" r="3.4" fill="#fff"/><circle cx="236" cy="211" r="1.6" fill="#fff" opacity=".7"/></g>
          <g id="cjHeartR" class="hidden"><path d="M232 220 C220 211 221 200 227 200 C230 200 232 202 232 204 C232 202 234 200 237 200 C243 200 244 211 232 220 Z" fill="#ff4d86"/></g>
          <rect id="cjLidTopR" x="210" y="184" width="44" height="42" fill="var(--skin)" transform="translate(0 184) scale(1 0) translate(0 -184)"/>
          <rect id="cjLidBotR" x="210" y="196" width="44" height="32" fill="var(--skin)" transform="translate(0 226) scale(1 0) translate(0 -226)"/>
        </g>
        <path d="M212 207 Q232 184 252 207" stroke="var(--line)" stroke-width="4.5" class="fx"/>
        <path d="M218 216 Q232 226 246 216" stroke="#5e3720" stroke-width="2.5" class="fx" opacity=".5"/>
      </g>

      <!-- cejas -->
      <g id="cjBrowL" transform="translate(168 186)"><path d="M-21 6 C-14 -6 6 -10 21 -2 L20 4 C6 -2 -12 0 -20 10 Z" class="ink o2"/></g>
      <g id="cjBrowR" transform="translate(232 186)"><path d="M21 6 C14 -6 -6 -10 -21 -2 L-20 4 C-6 -2 12 0 20 10 Z" class="ink o2"/></g>

      <!-- mejillas y nariz -->
      <ellipse id="cjBlushL" cx="142" cy="238" rx="16" ry="9" fill="#e0675a" opacity=".2"/>
      <ellipse id="cjBlushR" cx="258" cy="238" rx="16" ry="9" fill="#e0675a" opacity=".2"/>
      <path d="M194 208 C192 222 188 232 184 238 C192 248 208 248 216 238 C212 232 208 222 206 208" fill="var(--skin-light)" opacity=".45"/>
      <path d="M184 238 C192 246 208 246 216 238" stroke="#5e3720" stroke-width="3.5" class="fx"/>
      <path d="M190 240 Q193 243 196 241 M204 241 Q207 243 210 240" stroke="#2e180c" stroke-width="3" class="fx" opacity=".8"/>
      <path d="M196 212 C197 224 196 232 194 236" stroke="#e4b184" stroke-width="3" class="fx" opacity=".5"/>

      <!-- boca -->
      <g id="cjMouth" transform="translate(200 262)">
        <g id="m-closed"><path d="M-21 0 C-12 -6 -4 -5 0 -3 C4 -5 12 -6 21 0 C12 9 -12 9 -21 0 Z" fill="#8c4a3a" class="o2"/><path d="M-21 0 C-8 3 8 3 21 0" stroke="#3a1a12" stroke-width="2.5" class="fx"/></g>
        <g id="m-smile" class="hidden"><path d="M-30 -3 C-14 14 14 14 30 -3 C20 -6 -20 -6 -30 -3 Z" fill="#fff" class="o2"/><path d="M-30 -3 C-14 18 14 18 30 -3" stroke="#6e342a" stroke-width="5" class="fx"/></g>
        <g id="m-open-smile" class="hidden"><path d="M-30 -4 C-16 34 16 34 30 -4 Z" fill="#3a1410" class="o2"/><path d="M-26 -3 L26 -3 C24 6 -24 6 -26 -3 Z" fill="#fff"/><ellipse cx="0" cy="20" rx="13" ry="7" fill="#d9566e"/></g>
        <g id="m-laugh" class="hidden"><path d="M-34 -6 C-18 46 18 46 34 -6 Z" fill="#3a1410" class="o2"/><path d="M-30 -5 L30 -5 C28 6 -28 6 -30 -5 Z" fill="#fff"/><ellipse cx="0" cy="24" rx="16" ry="9" fill="#d9566e"/></g>
        <g id="m-o" class="hidden"><ellipse cx="0" cy="8" rx="10" ry="13" fill="#3a1410" class="o2"/><ellipse cx="0" cy="13" rx="5.5" ry="4.5" fill="#d9566e"/></g>
        <path id="m-flat" class="hidden" d="M-16 6 C-6 4 6 4 16 6" stroke="#3a1a12" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path id="m-smirk" class="hidden" d="M-22 8 C-6 14 10 8 24 -6" stroke="#3a1a12" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path id="m-frown" class="hidden" d="M-21 12 C-8 -2 8 -2 21 12" stroke="#3a1a12" stroke-width="5" fill="none" stroke-linecap="round"/>
        <g id="m-talk-small" class="hidden"><ellipse cx="0" cy="6" rx="13" ry="6.5" fill="#3a1410" class="o2"/></g>
        <g id="m-talk-i" class="hidden"><ellipse cx="0" cy="6" rx="20" ry="5.5" fill="#3a1410" class="o2"/><path d="M-16 3 L16 3" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>
        <g id="m-talk-o" class="hidden"><ellipse cx="0" cy="8" rx="9" ry="11" fill="#3a1410" class="o2"/></g>
        <g id="m-talk-a" class="hidden"><ellipse cx="0" cy="10" rx="17" ry="14" fill="#3a1410" class="o2"/><path d="M-13 2 L13 2" stroke="#fff" stroke-width="4" stroke-linecap="round"/><ellipse cx="0" cy="17" rx="9" ry="5" fill="#d9566e"/></g>
      </g>

      <!-- efectos de la cara -->
      <g id="cjTears" class="hidden" opacity="0"><path d="M150 226 q-6 14 0 22 q6 -8 0 -22 Z" fill="#7ed0ff"/><path d="M250 226 q-6 14 0 22 q6 -8 0 -22 Z" fill="#7ed0ff"/></g>
      <g id="cjSparkle" opacity="0"><path d="M92 120 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5 z" fill="#ffe27a"/><path d="M308 112 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 z" fill="#ffe27a"/></g>
    </g>
  </g>
</svg>`;

  const CJ = {
    id: 'cj',
    name: 'CJ',
    markup: CJ_MARKUP,
    bind(root) {
      const parts = {};
      for (const id of ['cjRoot', 'cjBody', 'cjHead', 'cjArmL', 'cjForeL', 'cjArmR', 'cjForeR', 'cjPupilL', 'cjPupilR', 'cjHeartL', 'cjHeartR',
        'cjLidTopL', 'cjLidTopR', 'cjLidBotL', 'cjLidBotR', 'cjBrowL', 'cjBrowR', 'cjBlushL', 'cjBlushR', 'cjMouth', 'cjTears', 'cjSparkle', 'cjGun', 'cjFlash']) {
        parts[id] = q(root, id);
      }
      parts.mouths = Object.fromEntries(MOUTHS.map((id) => [id, q(root, id)]));
      parts.shownMouth = 'm-closed';
      parts.svg = root.querySelector('svg');
      return parts;
    },
    // el color principal tiñe la bandana (la camiseta verde y los tenis son parte del personaje)
    setAccent(parts, color) {
      parts.svg.style.setProperty('--main', String(color).toLowerCase() === '#7c5cff' ? '#2fa24d' : color);
    },
    apply(pose, p) {
      const rot = (deg, cx, cy) => `rotate(${deg.toFixed(2)} ${cx} ${cy})`;

      p.cjRoot.setAttribute('transform', `translate(${pose.rootX.toFixed(1)} ${pose.rootY.toFixed(1)})`);
      p.cjBody.setAttribute('transform', `translate(200 540) rotate(${pose.bodyRot.toFixed(2)}) scale(${pose.sx.toFixed(3)} ${pose.sy.toFixed(3)}) translate(-200 -540)`);
      p.cjHead.setAttribute('transform', `translate(${pose.headX.toFixed(1)} ${pose.headY.toFixed(1)}) ${rot(pose.headRot, 200, 290)}`);

      p.cjArmL.setAttribute('transform', `translate(120 330) rotate(${pose.armLsh.toFixed(2)})`);
      p.cjForeL.setAttribute('transform', `translate(0 60) rotate(${(-pose.armLel).toFixed(2)})`);
      p.cjArmR.setAttribute('transform', `translate(280 330) rotate(${(-pose.armRsh).toFixed(2)})`);
      p.cjForeR.setAttribute('transform', `translate(0 60) rotate(${pose.armRel.toFixed(2)})`);

      const px = pose.pupilX * 5;
      const py = pose.pupilY * 4;
      p.cjPupilL.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);
      p.cjPupilR.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);
      const heart = pose.heartEyes > 0.5;
      p.cjHeartL.classList.toggle('hidden', !heart);
      p.cjHeartR.classList.toggle('hidden', !heart);
      p.cjPupilL.style.opacity = heart ? 0 : 1;
      p.cjPupilR.style.opacity = heart ? 0 : 1;

      const top = Math.max(0, Math.min(1, pose.lidTop));
      const bot = Math.max(0, Math.min(1, pose.lidBot));
      for (const side of ['L', 'R']) {
        p[`cjLidTop${side}`].setAttribute('transform', `translate(0 184) scale(1 ${top.toFixed(3)}) translate(0 -184)`);
        p[`cjLidBot${side}`].setAttribute('transform', `translate(0 226) scale(1 ${bot.toFixed(3)}) translate(0 -226)`);
      }

      p.cjBrowL.setAttribute('transform', `translate(168 ${(186 + pose.browLy).toFixed(1)}) rotate(${pose.browLr.toFixed(1)})`);
      p.cjBrowR.setAttribute('transform', `translate(232 ${(186 + pose.browRy).toFixed(1)}) rotate(${pose.browRr.toFixed(1)})`);

      // arma: aparece al disparar y siempre se ve derecha (se compensa lo que gira el brazo); el destello sale del cañon
      const gunOn = pose.gun > 0.25;
      p.cjGun.classList.toggle('hidden', !gunOn);
      if (gunOn) {
        p.cjGun.setAttribute('transform', `translate(-14 62) rotate(${(pose.armRsh - pose.armRel).toFixed(1)}) scale(${Math.min(1, pose.gun).toFixed(2)})`);
        const flash = Math.max(0, Math.min(1, pose.flash));
        p.cjFlash.setAttribute('opacity', flash.toFixed(2));
        p.cjFlash.setAttribute('transform', `translate(0 -7) scale(${(0.25 + flash * 0.95).toFixed(2)})`);
      }

      p.cjBlushL.setAttribute('opacity', (pose.blush * 0.8).toFixed(2));
      p.cjBlushR.setAttribute('opacity', (pose.blush * 0.8).toFixed(2));
      p.cjSparkle.setAttribute('opacity', pose.sparkle.toFixed(2));
      p.cjTears.classList.toggle('hidden', pose.tears < 0.05);
      p.cjTears.setAttribute('opacity', pose.tears.toFixed(2));

      if (pose.mouth !== p.shownMouth) {
        p.mouths[p.shownMouth]?.classList.add('hidden');
        p.mouths[pose.mouth]?.classList.remove('hidden');
        p.shownMouth = pose.mouth;
      }
    },
  };

  const CHARACTERS = { mochi: MOCHI, cj: CJ };

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

    // Solo CJ: saca el arma con las dos manos y dispara tres veces a la camara (el efecto de pantalla lo hace la pagina)
    disparar: {
      dur: 2.8,
      fn: (t) => {
        const shots = [0.75, 1.0, 1.25];
        let flash = 0;
        for (const at of shots) {
          const d = t - at;
          if (d >= 0 && d < 0.14) flash = Math.max(flash, 1 - d / 0.14);
        }
        return {
          abs: { armRsh: -22, armRel: 96, armLsh: -18, armLel: 88, gun: 1 },
          add: { flash, rootY: -5 * flash, headY: -3 * flash, bodyRot: -2.2 * flash, headRot: -2 * flash },
          effect: t >= shots[0] ? 'shoot' : null,
        };
      },
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
      gun: 0, flash: 0,
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
