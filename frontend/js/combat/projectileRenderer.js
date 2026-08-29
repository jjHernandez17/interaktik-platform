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
    'basic-bullet': { motion: 'straight', shape: 'dot', trail: false },
    'heavy-bullet': { motion: 'straight', shape: 'dot', trail: true, sizeMultiplier: 1.3 },
    'rocket': { motion: 'straight', shape: 'capsule', trail: true, rotate: true },
    'laser': { motion: 'beam' },
    'meteor': { motion: 'arc', shape: 'dot', trail: true, spin: true, arcHeight: 70 },
    'fireball': { motion: 'straight', shape: 'orb', trail: true },
    'bomb': { motion: 'arc', shape: 'dot', trail: false, arcHeight: 90 },
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

      setTimeout(() => beam.remove(), Math.max(120, durationMs));
    }

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
      const color = isHeal ? '#22c55e' : isShield ? '#38bdf8' : '#f59e0b';

      if (config.motion === 'beam') {
        runBeam(start, end, color, durationMs);
        spawnImpactFlash(end, color);
        return;
      }

      const dot = makeDot(config, size * (config.sizeMultiplier || 1), color);

      if (config.motion === 'straight') {
        runStraight(dot, config, start, end, durationMs);
      } else {
        runParametric(dot, config, start, end, durationMs, config.motion === 'wobble');
      }

      setTimeout(() => {
        spawnImpactFlash(end, color, config.motion === 'arc');
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
