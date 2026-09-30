// tiktokinteractive/frontend/js/combat/projectileRenderer.js
//
// Capa puramente visual: escucha los eventos que ya emite el combat engine
// (ProjectileCreated) y dibuja un proyectil viajando en pantalla desde el
// atacante hasta el objetivo, con una forma/animación distinta según el
// "projectileType" del poder, más un flash de impacto al llegar.
//
// No participa en el cálculo de daño/colisión (eso lo sigue resolviendo el
// engine de forma instantánea); es una animación independiente que no
// requiere unificar el sistema de coordenadas x/y de cada ejército (que
// viven en cajas DOM separadas) porque lee posiciones reales en pantalla
// con getBoundingClientRect().

(function () {
  // "straight": viaja en línea recta con transición CSS (rápido, barato).
  // "arc":      viaja en una parábola (impulsado por rAF).
  // "wobble":   viaja recto pero con un balanceo lateral suave (rAF).
  // "beam":     no viaja; dibuja un haz instantáneo entre atacante y objetivo.
  const STYLE_CONFIG = {
    'basic-bullet': { motion: 'straight', shape: 'dot', trail: false, rotate: true },
    'heavy-bullet': { motion: 'straight', shape: 'dot', trail: true, sizeMultiplier: 1.3, rotate: true },
    'rocket': { motion: 'straight', shape: 'capsule', trail: true, rotate: true },
    'laser': { motion: 'beam' },
    'meteor': { motion: 'arc', shape: 'dot', trail: true, spin: true, arcHeight: 70 },
    'fireball': { motion: 'straight', shape: 'orb', trail: true },
    'bomb': { motion: 'arc', shape: 'dot', trail: false, arcHeight: 90, spin: true },
    'heal-orb': { motion: 'wobble', shape: 'orb', trail: false },
    'shield-wave': { motion: 'straight', shape: 'ring', trail: false, grow: true },
  };

  function attach(engine, options = {}) {
    const layer = options.layer;
    const getSoldierElement = options.getSoldierElement;

    if (!engine || !layer || typeof getSoldierElement !== 'function') {
      return null;
    }

    function getCenter(element) {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      return {
        x: rect.left + (rect.width / 2) - layerRect.left,
        y: rect.top + (rect.height / 2) - layerRect.top,
      };
    }

    function spawnImpactFlash(position, color, big = false) {
      if (!position) return;
      const flash = document.createElement('div');
      flash.className = 'combat-impact-flash';
      if (big) flash.classList.add('big');
      flash.style.left = `${position.x}px`;
      flash.style.top = `${position.y}px`;
      flash.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
      layer.appendChild(flash);
      setTimeout(() => flash.remove(), 420);
    }

    function makeDot(config, size, color) {
      const dot = document.createElement('div');
      dot.className = `projectile proj-shape-${config.shape || 'dot'}`;
      if (config.trail) dot.classList.add('proj-trail');

      const width = config.shape === 'capsule' ? size * 2.4 : size;
      const height = config.shape === 'capsule' ? size * 0.9 : size;

      dot.style.width = `${width}px`;
      dot.style.height = `${height}px`;
      dot.style.setProperty('--proj-color', color);

      if (config.shape === 'ring') {
        dot.style.borderColor = color;
        dot.style.boxShadow = `0 0 12px ${color}`;
      } else if (config.shape === 'orb') {
        dot.style.background = `radial-gradient(circle, #ffffff 0%, ${color} 55%, transparent 80%)`;
        dot.style.boxShadow = `0 0 14px ${color}, 0 0 28px ${color}`;
      } else {
        dot.style.background = color;
        dot.style.boxShadow = `0 0 10px ${color}, 0 0 22px ${color}`;
      }

      return dot;
    }

    function runStraight(dot, config, start, end, durationMs) {
      dot.style.left = `${start.x}px`;
      dot.style.top = `${start.y}px`;

      let rotation = '';
      if (config.rotate) {
        const angleDeg = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
        rotation = ` rotate(${angleDeg}deg)`;
      }
      dot.style.transform = `translate(-50%, -50%)${rotation}`;

      layer.appendChild(dot);
      void dot.offsetHeight; // fuerza reflow antes de animar

      dot.style.transitionDuration = `${durationMs}ms`;

      window.requestAnimationFrame(() => {
        dot.style.left = `${end.x}px`;
        dot.style.top = `${end.y}px`;
        if (config.grow) {
          const grownWidth = parseFloat(dot.style.width) * 2.6;
          const grownHeight = parseFloat(dot.style.height) * 2.6;
          dot.style.width = `${grownWidth}px`;
          dot.style.height = `${grownHeight}px`;
          dot.style.opacity = '0.15';
        }
      });

      setTimeout(() => dot.remove(), durationMs);
    }

    function runParametric(dot, config, start, end, durationMs, wobble) {
      dot.style.left = `${start.x}px`;
      dot.style.top = `${start.y}px`;
      dot.style.transform = 'translate(-50%, -50%)';
      layer.appendChild(dot);

      const startTime = performance.now();
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));
      // vector perpendicular a la trayectoria, para el balanceo lateral del orbe de curación
      const perpX = -dy / distance;
      const perpY = dx / distance;

      function step(now) {
        const t = Math.min(1, (now - startTime) / durationMs);

        let x = start.x + (dx * t);
        let y = start.y + (dy * t);

        if (config.motion === 'arc') {
          const arcOffset = -4 * (config.arcHeight || 60) * t * (1 - t);
          y += arcOffset;
        } else if (wobble) {
          const wobbleOffset = Math.sin(t * Math.PI * 3) * 14 * (1 - t);
          x += perpX * wobbleOffset;
          y += perpY * wobbleOffset;
        }

        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;

        if (config.spin) {
          dot.style.transform = `translate(-50%, -50%) rotate(${t * 540}deg)`;
        }

        if (t < 1) {
          window.requestAnimationFrame(step);
        } else {
          dot.remove();
        }
      }

      window.requestAnimationFrame(step);
    }

    // Cohete "de verdad": SVG con cuerpo/aletas/ventana/cono en vez del
    // punto de color genérico. El color del poder tiñe la franja, el cono
    // y la llama, para conservar la identidad visual por poder que ya
    // usaba el sistema de puntos.
    function makeRocketElement(size, color) {
      const width = size * 4.8;
      const height = size * 1.9;

      const wrapper = document.createElement('div');
      wrapper.className = 'projectile proj-rocket';
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.setProperty('--proj-color', color);

      wrapper.innerHTML = `
        <svg class="rocket-svg" viewBox="-8 0 72 24" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="rocketBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#f1f5f9"/>
              <stop offset="100%" stop-color="#94a3b8"/>
            </linearGradient>
            <linearGradient id="rocketFlameOuterGrad" x1="100%" y1="50%" x2="0%" y2="50%">
              <stop offset="0%" stop-color="${color}"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="rocketFlameInnerGrad" x1="100%" y1="50%" x2="0%" y2="50%">
              <stop offset="0%" stop-color="#fef9c3"/>
              <stop offset="100%" stop-color="#fde047" stop-opacity="0"/>
            </linearGradient>
          </defs>

          <path class="rocket-flame-outer" d="M10,4 C0,7 -8,12 -8,12 C-8,12 0,17 10,20 C7,15 7,9 10,4 Z" fill="url(#rocketFlameOuterGrad)"/>
          <path class="rocket-flame-inner" d="M10,8 C4,10 -2,12 -2,12 C-2,12 4,14 10,16 C8,13 8,11 10,8 Z" fill="url(#rocketFlameInnerGrad)"/>

          <path d="M14,7 L4,1 L14,10 Z" fill="#475569" stroke="#1e293b" stroke-width="0.6"/>
          <path d="M14,17 L4,23 L14,14 Z" fill="#475569" stroke="#1e293b" stroke-width="0.6"/>

          <rect x="10" y="6" width="38" height="12" rx="6" fill="url(#rocketBodyGrad)" stroke="#1e293b" stroke-width="1"/>
          <rect x="20" y="6" width="7" height="12" fill="var(--proj-color)"/>
          <circle cx="33" cy="12" r="3.4" fill="#bae6fd" stroke="#0369a1" stroke-width="1"/>

          <path d="M48,6 L62,12 L48,18 Z" fill="var(--proj-color)" stroke="#1e293b" stroke-width="0.6"/>
          <circle cx="58" cy="10" r="1.1" fill="#ffffff" opacity="0.85"/>
        </svg>
      `;

      return wrapper;
    }

    // Bala trazadora (básica/pesada): núcleo brillante + estela cónica que
    // se desvanece hacia atrás. "heavy" solo cambia proporción y glow, para
    // que se sienta más pesada sin duplicar la función.
    function makeBulletElement(size, color, heavy) {
      const width = size * (heavy ? 4.4 : 3.6);
      const height = size * (heavy ? 1.7 : 1.3);

      const wrapper = document.createElement('div');
      wrapper.className = `projectile proj-bullet${heavy ? ' proj-bullet-heavy' : ''}`;
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.setProperty('--proj-color', color);

      wrapper.innerHTML = `
        <svg viewBox="-16 -6 34 12" preserveAspectRatio="xMidYMid meet">
          <path d="M-16,0 L2,-3.6 L2,3.6 Z" fill="${color}" opacity="0.55"/>
          <ellipse cx="6" cy="0" rx="6" ry="3.4" fill="#ffffff"/>
          <ellipse cx="7.4" cy="0" rx="4.2" ry="2.3" fill="${color}"/>
        </svg>
      `;

      return wrapper;
    }

    // Meteoro: roca irregular con resplandor de fuego alrededor (el
    // resplandor va omnidireccional porque el objeto gira durante el arco,
    // así que una llama "de un solo lado" se vería mal).
    function makeMeteorElement(size, color) {
      const width = size * 2.2;
      const height = size * 2.2;

      const wrapper = document.createElement('div');
      wrapper.className = 'projectile proj-meteor';
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.setProperty('--proj-color', color);

      wrapper.innerHTML = `
        <svg viewBox="0 0 28 28" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="meteorGlowGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.7"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="meteorRockGrad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#a8a29e"/>
              <stop offset="60%" stop-color="#57534e"/>
              <stop offset="100%" stop-color="#292524"/>
            </radialGradient>
          </defs>
          <circle class="meteor-glow" cx="14" cy="14" r="13" fill="url(#meteorGlowGrad)"/>
          <path d="M14,3 L19,6 L24,11 L22,18 L16,25 L9,24 L4,17 L5,9 L9,4 Z" fill="url(#meteorRockGrad)" stroke="#1c1917" stroke-width="0.6"/>
          <path d="M11,10 L15,15 L12,20" stroke="#1c1917" stroke-width="1" fill="none" opacity="0.55"/>
          <circle class="meteor-ember" cx="8" cy="19" r="1.3" fill="#fde047"/>
          <circle class="meteor-ember" cx="18" cy="9" r="1" fill="#fde047"/>
        </svg>
      `;

      return wrapper;
    }

    // Bola de fuego: capas de gradiente radial (núcleo blanco-amarillo,
    // envoltura del color del poder) con parpadeo CSS, sin geometría fija
    // de "adelante/atrás" porque viaja recta sin rotar.
    function makeFireballElement(size, color) {
      const width = size * 2.4;
      const height = size * 2.4;

      const wrapper = document.createElement('div');
      wrapper.className = 'projectile proj-fireball';
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.setProperty('--proj-color', color);

      wrapper.innerHTML = `
        <svg viewBox="0 0 26 26" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="fireballMidGrad" cx="50%" cy="55%" r="55%">
              <stop offset="0%" stop-color="#fff7ed"/>
              <stop offset="35%" stop-color="${color}"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <path class="fireball-outer" d="M13,1 C18,3 23,8 22,14 C21,20 16,25 13,25 C10,25 5,20 4,14 C3,8 8,3 13,1 Z" fill="url(#fireballMidGrad)"/>
          <circle class="fireball-core" cx="12" cy="12" r="4.6" fill="#fff7d6"/>
        </svg>
      `;

      return wrapper;
    }

    // Bomba: cuerpo redondo con brillo, mecha encendida (chispa parpadeante)
    // y una franja del color del poder para conservar identidad. Gira
    // durante el arco (spin:true en STYLE_CONFIG), como un meteoro.
    function makeBombElement(size, color) {
      const width = size * 2.0;
      const height = size * 2.5;

      const wrapper = document.createElement('div');
      wrapper.className = 'projectile proj-bomb';
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.setProperty('--proj-color', color);

      wrapper.innerHTML = `
        <svg viewBox="0 0 24 30" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="bombBodyGrad" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stop-color="#6b7280"/>
              <stop offset="65%" stop-color="#111827"/>
              <stop offset="100%" stop-color="#000000"/>
            </radialGradient>
          </defs>
          <path d="M12,9 C13,6 13,4 15,2" stroke="#78350f" stroke-width="1.4" fill="none"/>
          <circle class="bomb-spark" cx="15" cy="2" r="1.6" fill="#fde047"/>
          <circle cx="12" cy="18" r="9" fill="url(#bombBodyGrad)" stroke="#000000" stroke-width="0.6"/>
          <path d="M6.5,13.5 A9,9 0 0 1 12,9" stroke="#9ca3af" stroke-width="1.6" fill="none" opacity="0.5"/>
          <rect x="3" y="16.5" width="18" height="3" fill="${color}" opacity="0.9"/>
        </svg>
      `;

      return wrapper;
    }

    // Orbe de curación: núcleo suave con una cruz, resplandor pulsante y un
    // par de destellos fijos que titilan (nada de geometría direccional,
    // viaja con balanceo lateral, no rota).
    function makeHealOrbElement(size, color) {
      const width = size * 2.2;
      const height = size * 2.2;

      const wrapper = document.createElement('div');
      wrapper.className = 'projectile proj-heal';
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.setProperty('--proj-color', color);

      wrapper.innerHTML = `
        <svg viewBox="0 0 22 22" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="healCoreGrad" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="55%" stop-color="${color}"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0.15"/>
            </radialGradient>
          </defs>
          <circle class="heal-glow" cx="11" cy="11" r="10" fill="${color}" opacity="0.25"/>
          <circle cx="11" cy="11" r="7" fill="url(#healCoreGrad)"/>
          <path d="M11,7 L11,15 M7,11 L15,11" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
          <circle class="heal-sparkle heal-sparkle-a" cx="4" cy="6" r="1" fill="#ffffff"/>
          <circle class="heal-sparkle heal-sparkle-b" cx="18" cy="15" r="1.2" fill="#ffffff"/>
        </svg>
      `;

      return wrapper;
    }

    // Escudo: emblema hexagonal con relleno degradado, en vez del anillo
    // genérico. Conserva el "grow" (crece y se desvanece) que ya aplicaba
    // runStraight para este tipo.
    function makeShieldElement(size, color) {
      const width = size * 2.0;
      const height = size * 2.2;

      const wrapper = document.createElement('div');
      wrapper.className = 'projectile proj-shield';
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.setProperty('--proj-color', color);

      wrapper.innerHTML = `
        <svg viewBox="0 0 22 24" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="shieldFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.85"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0.25"/>
            </linearGradient>
          </defs>
          <path class="shield-emblem" d="M11,1 L20,5 L20,12 C20,18 16,22 11,23 C6,22 2,18 2,12 L2,5 Z" fill="url(#shieldFillGrad)" stroke="#e0f2fe" stroke-width="1"/>
          <path d="M11,7 L11,17 M7,12 L15,12" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity="0.85"/>
        </svg>
      `;

      return wrapper;
    }

    // Chispas que van quedando detrás del cohete mientras vuela: se
    // muestrea su posición real en pantalla (sirve para trayectoria recta
    // O en arco) y se van soltando partículas que se desvanecen solas.
    function spawnTrailParticles(dot, durationMs, color) {
      const intervalMs = 45;

      const spawn = () => {
        const center = getCenter(dot);
        if (!center) return;
        const spark = document.createElement('div');
        spark.className = 'combat-trail-spark';
        spark.style.left = `${center.x}px`;
        spark.style.top = `${center.y}px`;
        spark.style.background = `radial-gradient(circle, #fff 0%, ${color} 60%, transparent 80%)`;
        layer.appendChild(spark);
        setTimeout(() => spark.remove(), 380);
      };

      spawn();
      const timer = setInterval(spawn, intervalMs);
      setTimeout(() => clearInterval(timer), Math.max(0, durationMs - intervalMs));
    }

    // Explosión con onda expansiva + escombros, para impactos con radio de
    // splash (reemplaza el flash plano por algo que se sienta como un
    // impacto real).
    function spawnExplosion(position, color, radius) {
      if (!position) return;

      spawnImpactFlash(position, color, true);

      const ring = document.createElement('div');
      ring.className = 'combat-shockwave';
      const ringSize = Math.max(40, radius * 2);
      ring.style.width = `${ringSize}px`;
      ring.style.height = `${ringSize}px`;
      ring.style.left = `${position.x}px`;
      ring.style.top = `${position.y}px`;
      ring.style.color = color;
      layer.appendChild(ring);
      setTimeout(() => ring.remove(), 440);

      const debrisCount = 7;
      for (let i = 0; i < debrisCount; i += 1) {
        const angle = (Math.PI * 2 * i) / debrisCount + (Math.random() * 0.5 - 0.25);
        const distance = radius * (0.6 + Math.random() * 0.5);
        const debris = document.createElement('div');
        debris.className = 'combat-debris';
        debris.style.left = `${position.x}px`;
        debris.style.top = `${position.y}px`;
        debris.style.background = color;
        debris.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        debris.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
        layer.appendChild(debris);
        setTimeout(() => debris.remove(), 440);
      }
    }

    // Chispas finas que "crecen" radiando desde el punto de impacto (nada
    // de trasladar+rotar por CSS var: cada esquirla ya nace rotada hacia su
    // ángulo y solo anima su propio largo/opacidad, así que no hace falta
    // combinar transforms en el keyframe).
    function spawnSparkBurst(position, color, count = 5, distance = 16) {
      if (!position) return;

      for (let i = 0; i < count; i += 1) {
        const angle = ((Math.PI * 2 * i) / count) + (Math.random() * 0.4 - 0.2);
        const shard = document.createElement('div');
        shard.className = 'combat-spark-shard';
        shard.style.left = `${position.x}px`;
        shard.style.top = `${position.y}px`;
        shard.style.background = color;
        shard.style.transform = `rotate(${angle}rad)`;
        shard.style.setProperty('--shard-len', `${distance}px`);
        layer.appendChild(shard);
        setTimeout(() => shard.remove(), 240);
      }
    }

    // Impacto "suave" para curación/escudo: un anillo que se expande sin
    // violencia + destellos que flotan hacia arriba (a diferencia de los
    // escombros de spawnExplosion, que salen disparados en todas
    // direcciones) — para que se sienta positivo, no destructivo.
    function spawnSoftBloom(position, color) {
      if (!position) return;

      spawnImpactFlash(position, color, false);

      const ring = document.createElement('div');
      ring.className = 'combat-soft-bloom';
      ring.style.left = `${position.x}px`;
      ring.style.top = `${position.y}px`;
      ring.style.color = color;
      layer.appendChild(ring);
      setTimeout(() => ring.remove(), 520);

      const sparkleCount = 5;
      for (let i = 0; i < sparkleCount; i += 1) {
        const spreadX = (Math.random() * 24) - 12;
        const riseY = 16 + Math.random() * 14;
        const sparkle = document.createElement('div');
        sparkle.className = 'combat-heal-sparkle';
        sparkle.style.left = `${position.x}px`;
        sparkle.style.top = `${position.y}px`;
        sparkle.style.background = color;
        sparkle.style.setProperty('--dx', `${spreadX}px`);
        sparkle.style.setProperty('--dy', `${-riseY}px`);
        layer.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 620);
      }
    }

    function runBeam(start, end, color, durationMs) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt((dx * dx) + (dy * dy));
      const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

      const beam = document.createElement('div');
      beam.className = 'combat-laser-beam';
      beam.style.left = `${start.x}px`;
      beam.style.top = `${start.y}px`;
      beam.style.width = `${length}px`;
      beam.style.background = `linear-gradient(90deg, ${color}, #fff)`;
      beam.style.boxShadow = `0 0 10px ${color}, 0 0 18px ${color}`;
      beam.style.transform = `rotate(${angleDeg}deg)`;
      layer.appendChild(beam);

      const core = document.createElement('div');
      core.className = 'combat-laser-core';
      core.style.left = `${start.x}px`;
      core.style.top = `${start.y}px`;
      core.style.width = `${length}px`;
      core.style.transform = `rotate(${angleDeg}deg)`;
      layer.appendChild(core);

      setTimeout(() => {
        beam.remove();
        core.remove();
      }, Math.max(120, durationMs));
    }

    // Constructor de sprite por tipo. Lo que no tiene entrada acá sigue
    // usando el punto de color genérico (makeDot) como red de seguridad.
    const ELEMENT_BUILDERS = {
      'basic-bullet': (size, color) => makeBulletElement(size, color, false),
      'heavy-bullet': (size, color) => makeBulletElement(size, color, true),
      'rocket': makeRocketElement,
      'meteor': makeMeteorElement,
      'fireball': makeFireballElement,
      'bomb': makeBombElement,
      'heal-orb': makeHealOrbElement,
      'shield-wave': makeShieldElement,
    };

    // Tipos que sueltan chispas/partículas mientras vuelan (los que tienen
    // fuego o propulsión; balas y orbes de soporte se quedan sin estela
    // para no saturar la pantalla con poderes de bajo costo/soporte).
    const TRAIL_TYPES = new Set(['rocket', 'meteor', 'fireball', 'bomb']);

    // Efecto al llegar, por tipo. Los splash (cohete/meteoro/fuego/bomba)
    // usan la explosión con onda+escombros; soporte usa el bloom suave;
    // balas usan un chispazo rápido. Lo que no está acá cae al flash plano.
    const IMPACT_HANDLERS = {
      'rocket': (end, color, data) => spawnExplosion(end, color, Number(data?.explosionRadius || 40)),
      'meteor': (end, color, data) => spawnExplosion(end, color, Number(data?.explosionRadius || 45)),
      'fireball': (end, color, data) => spawnExplosion(end, color, Number(data?.explosionRadius || 36)),
      'bomb': (end, color, data) => spawnExplosion(end, color, Number(data?.explosionRadius || 50)),
      'heal-orb': (end, color) => spawnSoftBloom(end, color),
      'shield-wave': (end, color) => spawnSoftBloom(end, color),
      'basic-bullet': (end, color) => { spawnImpactFlash(end, color); spawnSparkBurst(end, color, 4, 14); },
      'heavy-bullet': (end, color) => { spawnImpactFlash(end, color); spawnSparkBurst(end, color, 6, 20); },
    };

    function handleProjectileCreated({ projectileId, attackerId, targetId } = {}) {
      const start = getCenter(getSoldierElement(attackerId));
      const end = getCenter(getSoldierElement(targetId));
      if (!start || !end) return;

      const projectileData = (engine.getActiveProjectiles?.() || [])
        .find((projectile) => projectile.id === projectileId) || null;

      const durationMs = Math.max(80, Number(projectileData?.ttl || 280));
      const size = Math.max(6, Number(projectileData?.size || 8));
      const projectileType = projectileData?.projectileType || 'basic-bullet';
      const config = STYLE_CONFIG[projectileType] || STYLE_CONFIG['basic-bullet'];

      const isHeal = Number(projectileData?.healing || 0) > 0;
      const isShield = !isHeal && Number(projectileData?.shield || 0) > 0;
      const baseColor = projectileData?.color || '#f59e0b';
      const color = isHeal ? '#22c55e' : isShield ? '#38bdf8' : baseColor;

      if (config.motion === 'beam') {
        runBeam(start, end, color, durationMs);
        spawnSparkBurst(end, color, 6, 20);
        spawnImpactFlash(end, color);
        return;
      }

      const buildElement = ELEMENT_BUILDERS[projectileType];
      const dot = buildElement
        ? buildElement(size, color)
        : makeDot(config, size * (config.sizeMultiplier || 1), color);

      if (config.motion === 'straight') {
        runStraight(dot, config, start, end, durationMs);
      } else {
        runParametric(dot, config, start, end, durationMs, config.motion === 'wobble');
      }

      if (TRAIL_TYPES.has(projectileType)) {
        spawnTrailParticles(dot, durationMs, color);
      }

      setTimeout(() => {
        const impact = IMPACT_HANDLERS[projectileType];
        if (impact) {
          impact(end, color, projectileData);
        } else {
          spawnImpactFlash(end, color, config.motion === 'arc');
        }
      }, durationMs);
    }

    const unsubscribe = engine.eventBus?.on?.('ProjectileCreated', handleProjectileCreated) || null;

    return {
      detach: () => unsubscribe?.(),
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileRenderer = {
    attach,
  };
})();
