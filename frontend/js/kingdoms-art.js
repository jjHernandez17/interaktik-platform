// Batalla de Reinos — arte. Todo se dibuja con código (sin imágenes): personajes con esqueleto animado,
// castillos y escenario. Los personajes se "hornean" una vez en hojas de sprites (caminar y atacar) por reino,
// así el juego puede mover cientos a la vez sin gastar CPU dibujando formas complejas en cada cuadro.

const KingdomsArt = (function createKingdomsArt() {
  const ART_BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src)
    ? document.currentScript.src.replace(/js\/kingdoms-art\.js.*$/, 'assets/images/kingdoms/') : 'assets/images/kingdoms/';
  const TAU = Math.PI * 2;
  const INK = '#1c1530';
  const PR = 1.6; // píxeles por unidad de arte en las hojas de sprites
  const WALK_FRAMES = 8;
  const ATTACK_FRAMES = 7;
  const UNIT_SCALE = 0.8; // tamaño en pantalla de las tropas respecto al diseño original

  // ---------- color ----------
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function shade(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    const f = (v) => clamp(Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)), 0, 255);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  // acepta '#rrggbb' o 'rgb(...)' ya sombreado
  function mix(a, b, t) {
    const pa = a.startsWith('#') ? hexToRgb(a) : a.match(/\d+/g).map(Number);
    const pb = b.startsWith('#') ? hexToRgb(b) : b.match(/\d+/g).map(Number);
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
  }

  // ---------- primitivas ----------
  function grad(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  }
  function rgrad(c, x, y, r0, r1, stops) {
    const g = c.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  }
  function ink(c, w = 2) { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; }
  function fillStroke(c, fill, w = 2) { c.fillStyle = fill; c.fill(); ink(c, w); c.stroke(); }
  function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function rr(c, x, y, w, h, r) {
    const q = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + q, y); c.arcTo(x + w, y, x + w, y + h, q); c.arcTo(x + w, y + h, x, y + h, q);
    c.arcTo(x, y + h, x, y, q); c.arcTo(x, y, x + w, y, q); c.closePath();
  }
  // cápsula con contorno: extremidades, mangos, troncos
  function cap(c, x0, y0, x1, y1, w, fill, hi) {
    c.lineCap = 'round';
    c.strokeStyle = INK; c.lineWidth = w + 3.2;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = fill; c.lineWidth = w;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    if (hi) {
      c.strokeStyle = hi; c.lineWidth = Math.max(1, w * 0.28);
      const nx = -(y1 - y0), ny = x1 - x0;
      const len = Math.hypot(nx, ny) || 1;
      const ox = (nx / len) * w * 0.2, oy = (ny / len) * w * 0.2;
      c.beginPath(); c.moveTo(x0 + ox, y0 + oy); c.lineTo(x1 + ox, y1 + oy); c.stroke();
    }
  }
  // cinemática inversa de dos huesos: devuelve la posición de la rodilla/codo
  function ik(x0, y0, x1, y1, l1, l2, dir) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.min(Math.hypot(dx, dy) || 0.01, l1 + l2 - 0.02);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / (Math.hypot(dx, dy) || 1);
    const uy = dy / (Math.hypot(dx, dy) || 1);
    return [x0 + ux * a - uy * h * dir, y0 + uy * a + ux * h * dir];
  }
  const ease = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function star(c, x, y, r, points = 5, inner = 0.45) {
    c.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const rad = i % 2 ? r * inner : r;
      const a = (i / (points * 2)) * TAU - Math.PI / 2;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }

  // ======================================================================
  // humanoide con esqueleto
  // ======================================================================
  const HIP_Y = -33;
  const SHOULDER_Y = -58;
  const HEAD_Y = -73;

  // pose de ataque cuerpo a cuerpo: ángulo del arma (0 = hacia arriba) según el progreso 0..1
  function swingAngle(p) {
    if (p < 0.38) return lerp(0.35, -1.25, ease(p / 0.38));      // preparación: se echa hacia atrás
    if (p < 0.58) return lerp(-1.25, 2.15, ease((p - 0.38) / 0.2)); // golpe rápido
    return lerp(2.15, 0.35, ease((p - 0.58) / 0.42));            // recupera
  }

  function limbColors(o) {
    return { skin: o.skin || '#f1c9a0', pants: o.pants || '#4b3a2c', boots: o.boots || '#2f2218' };
  }

  function drawLeg(c, o, hipX, footX, footY, dir) {
    const w = o.w || 1;
    const col = limbColors(o);
    const knee = ik(hipX, HIP_Y + 2, footX, footY - 3, 16.6, 16.6, dir);
    cap(c, hipX, HIP_Y + 2, knee[0], knee[1], 10 * w, col.pants, 'rgba(255,255,255,.12)');
    cap(c, knee[0], knee[1], footX, footY - 4, 9 * w, col.pants, 'rgba(255,255,255,.1)');
    // bota
    c.beginPath();
    c.moveTo(footX - 6 * w, footY - 7); c.lineTo(footX + 6 * w, footY - 7); c.lineTo(footX + 9 * w, footY); c.lineTo(footX - 7 * w, footY);
    c.closePath();
    fillStroke(c, grad(c, 0, footY - 7, 0, footY, [[0, shade(col.boots, 0.15)], [1, col.boots]]), 2);
  }

  function drawArm(c, o, shoulder, hand, dir, sleeveCol) {
    const w = o.w || 1;
    const col = limbColors(o);
    const elbow = ik(shoulder[0], shoulder[1], hand[0], hand[1], 15, 14, dir);
    cap(c, shoulder[0], shoulder[1], elbow[0], elbow[1], 9 * w, sleeveCol || o.tunic, 'rgba(255,255,255,.14)');
    cap(c, elbow[0], elbow[1], hand[0], hand[1], 8 * w, o.sleeveEnd || sleeveCol || o.tunic, 'rgba(255,255,255,.1)');
    // mano / guante
    c.beginPath(); c.arc(hand[0], hand[1], 5 * w, 0, TAU);
    fillStroke(c, o.glove || col.skin, 1.8);
  }

  function drawTorso(c, o, ps) {
    const w = o.w || 1;
    const sway = Math.sin(ps.phase) * 1.2;
    const top = SHOULDER_Y + 2;
    c.beginPath();
    if (o.robe) {
      // túnica larga hasta el suelo
      const hem = 3 + Math.sin(ps.phase * 2) * 1.5;
      c.moveTo(-12 * w, top + 2);
      c.quadraticCurveTo(-15 * w, HIP_Y, -22 * w, -5);
      c.lineTo(-20 * w, hem); c.quadraticCurveTo(0, hem + 5, 20 * w, hem); c.lineTo(22 * w, -5);
      c.quadraticCurveTo(15 * w, HIP_Y, 12 * w, top + 2);
      c.quadraticCurveTo(0, top - 5, -12 * w, top + 2);
    } else {
      c.moveTo(-11 * w, HIP_Y + 3);
      c.quadraticCurveTo(-14 * w, (HIP_Y + top) / 2, -13 * w + sway, top + 1);
      c.quadraticCurveTo(0, top - 6, 13 * w + sway, top + 1);
      c.quadraticCurveTo(14 * w, (HIP_Y + top) / 2, 11 * w, HIP_Y + 3);
      c.closePath();
    }
    fillStroke(c, grad(c, -14 * w, top, 14 * w, HIP_Y, [[0, shade(o.tunic, 0.22)], [0.55, o.tunic], [1, shade(o.tunic, -0.28)]]), 2.2);

    // detalles del torso
    if (o.armor) {
      c.beginPath(); c.moveTo(-10 * w, top + 3); c.lineTo(10 * w, top + 3); c.lineTo(8 * w, HIP_Y + 2); c.lineTo(-8 * w, HIP_Y + 2); c.closePath();
      fillStroke(c, grad(c, -10 * w, top, 10 * w, HIP_Y, [[0, '#e5e7eb'], [0.5, '#9ca3af'], [1, '#4b5563']]), 1.8);
      c.strokeStyle = 'rgba(15,23,42,.35)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, top + 4); c.lineTo(0, HIP_Y + 2); c.stroke();
    }
    if (o.belt !== false && !o.robe) {
      c.fillStyle = o.beltColor || '#6b3f1d'; rr(c, -12 * w, HIP_Y - 3, 24 * w, 6, 2); c.fill(); ink(c, 1.4); c.stroke();
      c.fillStyle = '#facc15'; rr(c, -3, HIP_Y - 2.4, 6, 4.8, 1.2); c.fill();
    }
    if (o.sash) {
      c.beginPath(); c.moveTo(-12 * w, top + 2); c.lineTo(-5 * w, top + 2); c.lineTo(12 * w, HIP_Y); c.lineTo(5 * w, HIP_Y + 2); c.closePath();
      fillStroke(c, o.sash, 1.6);
    }
    if (o.chest) o.chest(c, o, ps);
  }

  function drawEyes(c, y, o) {
    const e = o.eyes || '#fff';
    c.fillStyle = e; ell(c, -4.2, y, 2.6, 3); c.fill(); ell(c, 4.4, y, 2.6, 3); c.fill();
    c.fillStyle = o.pupil || '#111827';
    c.beginPath(); c.arc(-3.2, y + 0.4, 1.4, 0, TAU); c.fill(); c.beginPath(); c.arc(5.4, y + 0.4, 1.4, 0, TAU); c.fill();
  }

  function drawHead(c, o, ps, headFn) {
    const bob = ps.headBob || 0;
    c.save();
    c.translate(ps.lean || 0, HEAD_Y + bob);
    if (o.headScale) c.scale(o.headScale, o.headScale);
    if (headFn) headFn(c, o, ps);
    else {
      c.beginPath(); c.arc(0, 0, 11, 0, TAU);
      fillStroke(c, rgrad(c, -3, -4, 1, 14, [[0, shade(o.skin || '#f1c9a0', 0.25)], [1, o.skin || '#f1c9a0']]), 2);
      drawEyes(c, -1, o);
      c.strokeStyle = 'rgba(120,53,15,.8)'; c.lineWidth = 1.4; c.beginPath(); c.arc(0.5, 5.5, 3, 0.2, Math.PI - 0.2); c.stroke();
    }
    c.restore();
  }

  // pose por defecto (caminar y atacar con arma de mano)
  function computePose(o, ps) {
    const w = o.w || 1;
    const sp = Math.sin(ps.phase);
    const cs = Math.cos(ps.phase);
    const stride = (o.stride || 1);
    const pose = {
      footL: [-8 * w - cs * 4 * stride, -Math.max(0, sp) * 7 * stride],
      footR: [8 * w + cs * 4 * stride, -Math.max(0, -sp) * 7 * stride],
      handL: [-19 * w, -36 - sp * 2.5],
      handR: [19 * w, -36 + sp * 2.5],
      weaponAngle: 0.35 + sp * 0.06,
      bob: Math.abs(sp) * 2.4 * (o.bobMul || 1),
      lean: 0,
      headBob: 0,
    };
    if (ps.atk >= 0) {
      const p = ps.atk;
      const a = swingAngle(p);
      const reach = 21;
      pose.weaponAngle = a;
      pose.handR = [14 * w + Math.sin(a) * reach, SHOULDER_Y + 4 - Math.cos(a) * reach];
      pose.lean = lerp(0, 5, Math.sin(p * Math.PI));
      pose.footL = [-9 * w - 3, 0];
      pose.footR = [9 * w + 5, 0];
      pose.bob = 0;
      pose.headBob = Math.sin(p * Math.PI) * 1.5;
    }
    return pose;
  }

  // dibuja un humanoide completo
  function drawHumanoid(c, o, ps) {
    const w = o.w || 1;
    const pose = (o.pose || computePose)(o, ps, computePose);
    const hipX = 6 * w;

    c.save();
    c.translate(0, -pose.bob);

    if (o.back) o.back(c, o, ps, pose);

    drawLeg(c, o, -hipX, pose.footL[0], pose.footL[1], 1);
    drawLeg(c, o, hipX, pose.footR[0], pose.footR[1], -1);

    c.save();
    c.translate(pose.lean * 0.5, 0);
    // brazo del lado del escudo (detrás del torso si lleva escudo grande)
    const shL = [-14 * w, SHOULDER_Y + 5];
    const shR = [14 * w, SHOULDER_Y + 5];
    if (!o.offFront) drawArm(c, o, shL, pose.handL, 1, o.sleeveL || o.tunic);

    drawTorso(c, o, { ...ps, phase: ps.phase });
    if (o.front) o.front(c, o, ps, pose);

    if (o.offFront) drawArm(c, o, shL, pose.handL, 1, o.sleeveL || o.tunic);
    if (o.off) o.off(c, o, ps, pose);

    drawHead(c, o, { ...ps, lean: 0, headBob: pose.headBob }, o.head);

    drawArm(c, o, shR, pose.handR, -1, o.sleeveR || o.tunic);
    if (o.weapon) o.weapon(c, o, ps, pose);
    c.restore();

    if (o.cape) o.cape(c, o, ps, pose);
    c.restore();
  }

  // ---------- armas y accesorios ----------
  function bladeTrail(c, pose, ps, len, color) {
    if (ps.atk < 0.36 || ps.atk > 0.74) return;
    const k = 1 - Math.abs(ps.atk - 0.5) / 0.24;
    if (k <= 0) return;
    const hx = pose.handR[0];
    const hy = pose.handR[1];
    c.save();
    c.translate(hx, hy);
    c.strokeStyle = color || 'rgba(255,255,255,.75)';
    c.globalAlpha = clamp(k, 0, 1) * 0.85;
    c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath();
    const a1 = pose.weaponAngle - 0.95;
    const a0 = pose.weaponAngle;
    c.arc(0, 0, len, a1 - Math.PI / 2, a0 - Math.PI / 2);
    c.stroke();
    c.restore();
  }

  function sword(c, o, ps, pose, len = 26, blade = '#e5e7eb', glow) {
    const [hx, hy] = pose.handR;
    c.save();
    c.translate(hx, hy);
    c.rotate(pose.weaponAngle);
    // empuñadura
    c.fillStyle = '#6b3f1d'; rr(c, -2.3, -2, 4.6, 11, 2); c.fill(); ink(c, 1.4); c.stroke();
    c.fillStyle = '#facc15'; rr(c, -7, -4, 14, 4, 1.6); c.fill(); ink(c, 1.4); c.stroke();
    c.beginPath(); c.moveTo(-3.4, -4); c.lineTo(-3.4, -len + 4); c.lineTo(0, -len - 2); c.lineTo(3.4, -len + 4); c.lineTo(3.4, -4); c.closePath();
    fillStroke(c, grad(c, -3.4, 0, 3.4, 0, [[0, '#9ca3af'], [0.5, blade], [1, '#cbd5e1']]), 1.6);
    if (glow) { c.shadowColor = glow; c.shadowBlur = 10; c.strokeStyle = glow; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -6); c.lineTo(0, -len + 3); c.stroke(); c.shadowBlur = 0; }
    c.restore();
    bladeTrail(c, pose, ps, len, glow ? rgba('#ffffff', 0.8) : null);
  }

  function roundShield(c, o, ps, pose) {
    const [hx, hy] = pose.handL;
    c.save();
    c.translate(hx - 3, hy - 4);
    c.beginPath(); c.arc(0, 0, 13, 0, TAU);
    fillStroke(c, rgrad(c, -4, -4, 1, 15, [[0, shade(o.team, 0.35)], [1, shade(o.team, -0.3)]]), 2.4);
    c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.strokeStyle = '#d6d3d1'; c.lineWidth = 2.2; c.stroke();
    c.fillStyle = '#fde68a'; star(c, 0, 0, 6.5, 5, 0.5); c.fill(); ink(c, 1); c.stroke();
    c.fillStyle = '#9ca3af'; c.beginPath(); c.arc(0, 0, 2, 0, TAU); c.fill();
    c.restore();
  }

  // ---------- cabezas ----------
  function ironHelm(plume) {
    return (c, o) => {
      c.beginPath(); c.arc(0, 0, 11, 0, TAU);
      fillStroke(c, rgrad(c, -3, -4, 1, 14, [[0, shade(o.skin || '#f1c9a0', 0.25)], [1, o.skin || '#f1c9a0']]), 2);
      drawEyes(c, 3.2, o);
      c.strokeStyle = 'rgba(120,53,15,.8)'; c.lineWidth = 1.4; c.beginPath(); c.arc(0.5, 7, 2.6, 0.2, Math.PI - 0.2); c.stroke();
      // yelmo
      c.beginPath(); c.moveTo(-12, -1); c.arc(0, 0, 12.4, Math.PI, 0); c.lineTo(12, -1); c.lineTo(4, -3); c.lineTo(-4, -3); c.closePath();
      fillStroke(c, grad(c, -12, -12, 12, 4, [[0, '#e5e7eb'], [0.5, '#9ca3af'], [1, '#4b5563']]), 2);
      c.fillStyle = '#6b7280'; c.fillRect(-1.4, -12, 2.8, 14);
      if (plume) {
        c.beginPath(); c.moveTo(-3, -11); c.quadraticCurveTo(-3, -26, 9, -22); c.quadraticCurveTo(2, -19, 3, -11); c.closePath();
        fillStroke(c, grad(c, -3, -24, 8, -11, [[0, shade(o.team, 0.3)], [1, o.team]]), 1.8);
      }
    };
  }

  // ======================================================================
  // personajes
  // ======================================================================
  const FIGURES = {};

  FIGURES.squire = (team) => ({
    team, tunic: team, pants: '#4a3a2e', armor: false,
    head: ironHelm(true),
    offFront: true,
    off: roundShield,
    weapon: (c, o, ps, pose) => sword(c, o, ps, pose, 27),
    chest: (c, o) => { c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.moveTo(-6, SHOULDER_Y + 4); c.lineTo(6, SHOULDER_Y + 4); c.lineTo(0, SHOULDER_Y + 16); c.closePath(); c.fill(); },
  });

  FIGURES.archer = (team) => ({
    team, tunic: '#3f7d32', pants: '#5b4630', sleeveL: '#3f7d32', glove: '#7c4a21', beltColor: '#5b3a1e',
    stride: 1.1,
    head: (c, o, ps) => {
      c.beginPath(); c.arc(0, 1, 10.5, 0, TAU);
      fillStroke(c, rgrad(c, -3, -2, 1, 14, [[0, '#ffe0bd'], [1, '#e8b88a']]), 2);
      drawEyes(c, 1, o);
      // capucha
      c.beginPath(); c.moveTo(-13, 8); c.quadraticCurveTo(-14, -14, 0, -15); c.quadraticCurveTo(14, -14, 13, 8); c.quadraticCurveTo(10, -4, 0, -5); c.quadraticCurveTo(-10, -4, -13, 8); c.closePath();
      fillStroke(c, grad(c, -12, -15, 12, 6, [[0, '#5aa047'], [1, '#2f6320']]), 2);
      c.fillStyle = team; c.beginPath(); c.arc(8, -10, 2.4, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(6, -12); c.lineTo(15, -17); c.lineTo(12, -9); c.closePath(); fillStroke(c, '#f8fafc', 1.2);
    },
    back: (c, o, ps, pose) => {
      // carcaj
      c.save(); c.translate(-9, SHOULDER_Y + 12); c.rotate(-0.25);
      rr(c, -4, -2, 8, 26, 3); fillStroke(c, grad(c, -4, 0, 4, 0, [[0, '#8a5a2b'], [1, '#4b2e14']]), 1.8);
      c.strokeStyle = '#e5e7eb'; c.lineWidth = 1.8;
      [-2, 0.5, 3].forEach((x) => { c.beginPath(); c.moveTo(x, -2); c.lineTo(x * 1.4, -10); c.stroke(); c.fillStyle = team; c.fillRect(x * 1.4 - 1.4, -12, 2.8, 4); });
      c.restore();
    },
    pose: (o, ps, base) => {
      const pose = base(o, { ...ps, atk: -1 });
      pose.handR = [24, -50 + Math.sin(ps.phase) * 1.2];
      pose.handL = [4, -44];
      let pull = 0;
      if (ps.atk >= 0) {
        const p = ps.atk;
        pull = p < 0.5 ? ease(p / 0.5) : Math.max(0, 1 - ease(Math.min(1, (p - 0.5) / 0.18)));
        pose.handR = [25, -51];
        pose.handL = [8 - pull * 12, -50];
        pose.lean = -pull * 1.5;
        pose.footL = [-9 - 2, 0]; pose.footR = [9 + 4, 0]; pose.bob = 0;
      }
      pose.string = pull;
      return pose;
    },
    weapon: (c, o, ps, pose) => {
      const [bx, by] = pose.handR;
      const pull = pose.string || 0;
      c.save(); c.translate(bx, by);
      c.strokeStyle = INK; c.lineWidth = 5.4; c.lineCap = 'round';
      c.beginPath(); c.arc(-6, 0, 18, -1.15, 1.15); c.stroke();
      c.strokeStyle = '#a16207'; c.lineWidth = 3.2;
      c.beginPath(); c.arc(-6, 0, 18, -1.15, 1.15); c.stroke();
      const tx = -6 + Math.cos(-1.15) * 18;
      const ty = Math.sin(-1.15) * 18;
      const bxs = -6 + Math.cos(1.15) * 18;
      const bys = Math.sin(1.15) * 18;
      const px = pose.handL[0] - bx;
      c.strokeStyle = '#f1f5f9'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(px, 0); c.lineTo(bxs, bys); c.stroke();
      if (pull > 0.05) {
        c.strokeStyle = '#e5e7eb'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, 0); c.lineTo(10, 0); c.stroke();
        c.fillStyle = '#d1d5db'; c.beginPath(); c.moveTo(10, -3); c.lineTo(17, 0); c.lineTo(10, 3); c.closePath(); c.fill();
      }
      c.restore();
    },
  });

  FIGURES.knight = (team) => ({ team, special: 'knight' });
  FIGURES.dragon = (team) => ({ team, special: 'dragon' });
  FIGURES.colossus = (team) => ({ team, special: 'colossus' });
  FIGURES.ram = (team) => ({ team, special: 'ram' });

  FIGURES.wizard = (team) => ({
    team, tunic: '#6d3fc7', robe: true, pants: '#3b1f6e', glove: '#f1c9a0', w: 0.95,
    sash: shade(team, -0.05),
    head: (c, o, ps) => {
      c.beginPath(); c.arc(0, 1, 10.4, 0, TAU);
      fillStroke(c, rgrad(c, -3, -2, 1, 14, [[0, '#ffe0bd'], [1, '#e8b88a']]), 2);
      drawEyes(c, 0, o);
      // barba
      c.beginPath(); c.moveTo(-9, 4); c.quadraticCurveTo(-8, 17, 0, 20); c.quadraticCurveTo(8, 17, 9, 4); c.quadraticCurveTo(0, 9, -9, 4); c.closePath();
      fillStroke(c, grad(c, 0, 4, 0, 20, [[0, '#f8fafc'], [1, '#cbd5e1']]), 1.8);
      // sombrero
      c.beginPath(); c.moveTo(-16, -6); c.quadraticCurveTo(0, -11, 16, -6); c.lineTo(5, -9); c.quadraticCurveTo(10, -26, 2, -40); c.quadraticCurveTo(-6, -24, -5, -9); c.closePath();
      fillStroke(c, grad(c, -14, -40, 14, -6, [[0, '#8b5cf6'], [1, '#3b1f8a']]), 2);
      c.fillStyle = team; c.fillRect(-9, -13, 18, 4);
      c.fillStyle = '#fde047'; star(c, 0, -22, 3.2, 5, 0.5); c.fill();
    },
    pose: (o, ps, base) => {
      const pose = base(o, { ...ps, atk: -1 });
      pose.handR = [20, -44 + Math.sin(ps.phase) * 2];
      pose.weaponAngle = 0.08;
      if (ps.atk >= 0) {
        const p = ps.atk;
        const thrust = p < 0.4 ? -ease(p / 0.4) * 6 : p < 0.6 ? lerp(-6, 8, ease((p - 0.4) / 0.2)) : lerp(8, 0, ease((p - 0.6) / 0.4));
        pose.handR = [20 + thrust, -48 - Math.sin(p * Math.PI) * 6];
        pose.weaponAngle = lerp(0.08, 0.9, Math.sin(p * Math.PI));
        pose.lean = thrust * 0.4;
        pose.footL = [-10, 0]; pose.footR = [10, 0]; pose.bob = 0;
      }
      return pose;
    },
    weapon: (c, o, ps, pose) => {
      const [hx, hy] = pose.handR;
      c.save(); c.translate(hx, hy); c.rotate(pose.weaponAngle);
      cap(c, 0, 14, 0, -34, 4, '#7a4a21', 'rgba(255,255,255,.2)');
      c.strokeStyle = '#d4a017'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, -38, 7, 0.4, TAU - 0.4); c.stroke();
      const flare = ps.atk >= 0 ? 1 + Math.sin(ps.atk * Math.PI) * 1.2 : 1;
      c.fillStyle = rgrad(c, 0, -38, 0, 14 * flare, [[0, 'rgba(255,247,237,1)'], [0.35, 'rgba(251,146,60,.95)'], [1, 'rgba(239,68,68,0)']]);
      c.beginPath(); c.arc(0, -38, 14 * flare, 0, TAU); c.fill();
      c.fillStyle = '#fff7ed'; c.beginPath(); c.arc(0, -38, 3.6, 0, TAU); c.fill();
      c.restore();
    },
  });

  FIGURES.ogre = (team) => ({
    team, tunic: '#6f9a2c', skin: '#8dbb3a', pants: '#6b4a28', boots: '#3b2a18', w: 1.55, h: 1, stride: 0.8, bobMul: 1.2, glove: '#8dbb3a',
    beltColor: '#7c4a21', sleeveL: '#8dbb3a', sleeveR: '#8dbb3a',
    head: (c, o, ps) => {
      c.save(); c.translate(0, 3);
      c.beginPath(); c.ellipse(0, 0, 11.5, 10.5, 0, 0, TAU);
      fillStroke(c, rgrad(c, -3, -3, 1, 15, [[0, '#b4dc5e'], [1, '#6f9a2c']]), 2.2);
      // ojos pequeños y ceño
      c.fillStyle = '#fef9c3'; ell(c, -4.6, -2, 2.4, 2.6); c.fill(); ell(c, 4.6, -2, 2.4, 2.6); c.fill();
      c.fillStyle = '#7f1d1d'; c.beginPath(); c.arc(-4, -1.6, 1.3, 0, TAU); c.fill(); c.beginPath(); c.arc(5.2, -1.6, 1.3, 0, TAU); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, -6); c.lineTo(-2, -4); c.moveTo(8, -6); c.lineTo(2, -4); c.stroke();
      // mandíbula y colmillos
      c.fillStyle = '#4d6b1c'; rr(c, -8, 3.4, 16, 5, 2.5); c.fill(); ink(c, 1.4); c.stroke();
      c.fillStyle = '#f8fafc'; [[-6, 3.6], [4.4, 3.6]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2.4, y); c.lineTo(x + 1.2, y - 6); c.closePath(); c.fill(); ink(c, 1); c.stroke(); });
      // orejas
      c.fillStyle = '#7ba832'; c.beginPath(); c.moveTo(-11, -2); c.lineTo(-18, -7); c.lineTo(-11, 3); c.closePath(); fillStroke(c, '#7ba832', 1.6);
      c.beginPath(); c.moveTo(11, -2); c.lineTo(18, -7); c.lineTo(11, 3); c.closePath(); fillStroke(c, '#7ba832', 1.6);
      c.restore();
    },
    chest: (c, o) => {
      c.beginPath(); c.moveTo(-13, SHOULDER_Y + 4); c.lineTo(13, SHOULDER_Y + 4); c.lineTo(10, HIP_Y - 2); c.lineTo(-10, HIP_Y - 2); c.closePath();
      fillStroke(c, grad(c, -13, SHOULDER_Y, 13, HIP_Y, [[0, '#a16207'], [1, '#6b3f1d']]), 2);
      c.fillStyle = '#f5e9c8'; for (let i = -2; i <= 2; i += 1) { c.beginPath(); c.arc(i * 5, SHOULDER_Y + 7 + Math.abs(i), 2.4, 0, TAU); c.fill(); ink(c, 1); c.stroke(); }
    },
    weapon: (c, o, ps, pose) => {
      const [hx, hy] = pose.handR;
      c.save(); c.translate(hx, hy); c.rotate(pose.weaponAngle);
      cap(c, 0, 8, 0, -32, 7, '#8a5a2b', 'rgba(255,255,255,.18)');
      c.beginPath(); c.ellipse(0, -38, 11, 14, 0, 0, TAU);
      fillStroke(c, grad(c, -10, -50, 10, -26, [[0, '#a8794a'], [1, '#5b3a1e']]), 2.2);
      c.fillStyle = '#d1d5db';
      [[-9, -42], [9, -42], [-8, -32], [8, -32], [0, -52]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x - 2.6, y); c.lineTo(x * 1.4, y - (x ? 0 : 5) - 2); c.lineTo(x + 2.6, y); c.closePath(); c.fill(); ink(c, 1); c.stroke(); });
      c.restore();
      bladeTrail(c, pose, ps, 36, 'rgba(255,237,160,.7)');
    },
  });

  FIGURES.titan = (team) => ({
    team, tunic: '#475569', armor: true, skin: '#d4a373', pants: '#334155', boots: '#1e293b', w: 1.35, stride: 0.85, bobMul: 1.1,
    glove: '#64748b', sleeveL: '#64748b', sleeveR: '#64748b', beltColor: '#1e293b',
    head: (c, o, ps) => {
      c.beginPath(); c.arc(0, 0, 11.5, 0, TAU);
      fillStroke(c, grad(c, -11, -11, 11, 11, [[0, '#cbd5e1'], [0.5, '#94a3b8'], [1, '#475569']]), 2.2);
      // visera con ojos encendidos
      c.fillStyle = '#0f172a'; rr(c, -8, -3, 16, 5.4, 2); c.fill();
      c.fillStyle = '#fb7185'; c.shadowColor = '#fb7185'; c.shadowBlur = 8; c.fillRect(-6, -1.6, 4.4, 2.2); c.fillRect(1.6, -1.6, 4.4, 2.2); c.shadowBlur = 0;
      c.fillStyle = '#334155'; c.fillRect(-1.2, -11.5, 2.4, 22);
      // cuernos
      [[-1, -9], [1, -9]].forEach(([s]) => {
        c.beginPath(); c.moveTo(s * 9, -7); c.quadraticCurveTo(s * 20, -9, s * 19, -26); c.quadraticCurveTo(s * 13, -14, s * 6, -9); c.closePath();
        fillStroke(c, grad(c, s * 6, -26, s * 19, -7, [[0, '#f8fafc'], [1, '#94a3b8']]), 1.8);
      });
      // penacho
      c.beginPath(); c.moveTo(-3, -11); c.quadraticCurveTo(0, -22, 3, -11); c.closePath(); fillStroke(c, team, 1.4);
    },
    chest: (c, o) => {
      // hombreras
      [[-1], [1]].forEach(([s]) => {
        c.beginPath(); c.ellipse(s * 15, SHOULDER_Y + 5, 9, 7, s * 0.3, 0, TAU);
        fillStroke(c, grad(c, s * 6, SHOULDER_Y - 2, s * 22, SHOULDER_Y + 12, [[0, '#e2e8f0'], [1, '#475569']]), 2);
        c.fillStyle = o.team; c.beginPath(); c.arc(s * 15, SHOULDER_Y + 5, 3, 0, TAU); c.fill();
      });
      c.fillStyle = o.team; c.beginPath(); c.moveTo(-4, SHOULDER_Y + 6); c.lineTo(4, SHOULDER_Y + 6); c.lineTo(0, SHOULDER_Y + 20); c.closePath(); c.fill(); ink(c, 1.2); c.stroke();
    },
    cape: (c, o, ps) => {
      c.save(); c.globalCompositeOperation = 'destination-over';
      const wv = Math.sin(ps.phase) * 3;
      c.beginPath(); c.moveTo(-14, SHOULDER_Y + 4); c.lineTo(14, SHOULDER_Y + 4); c.quadraticCurveTo(22 + wv, -30, 16 + wv, -4); c.lineTo(-16 + wv, -4); c.quadraticCurveTo(-22 + wv, -30, -14, SHOULDER_Y + 4);
      fillStroke(c, grad(c, 0, SHOULDER_Y, 0, -4, [[0, shade(o.team, -0.1)], [1, shade(o.team, -0.5)]]), 2);
      c.restore();
    },
    weapon: (c, o, ps, pose) => {
      const [hx, hy] = pose.handR;
      c.save(); c.translate(hx, hy); c.rotate(pose.weaponAngle);
      c.fillStyle = '#4b3621'; rr(c, -2.6, -2, 5.2, 14, 2); c.fill(); ink(c, 1.4); c.stroke();
      c.fillStyle = '#facc15'; rr(c, -9, -5, 18, 5, 2); c.fill(); ink(c, 1.4); c.stroke();
      c.beginPath(); c.moveTo(-6, -5); c.lineTo(-6, -40); c.lineTo(0, -52); c.lineTo(6, -40); c.lineTo(6, -5); c.closePath();
      fillStroke(c, grad(c, -6, 0, 6, 0, [[0, '#94a3b8'], [0.5, '#f1f5f9'], [1, '#94a3b8']]), 2);
      c.shadowColor = '#fb7185'; c.shadowBlur = 12; c.strokeStyle = '#fda4af'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(0, -9); c.lineTo(0, -44); c.stroke();
      [-18, -28, -37].forEach((y) => { c.beginPath(); c.moveTo(-3, y); c.lineTo(3, y); c.stroke(); });
      c.shadowBlur = 0;
      c.restore();
      bladeTrail(c, pose, ps, 44, 'rgba(255,205,215,.85)');
    },
  });

  FIGURES.skeletons = (team) => ({
    team, tunic: '#e7e1d0', skin: '#f3efe2', pants: '#d8d2c0', boots: '#9a9483', glove: '#f3efe2', w: 0.7, stride: 1.2, belt: false, beltColor: '#6b5b3a',
    sleeveL: '#e7e1d0', sleeveR: '#e7e1d0',
    head: (c, o, ps) => {
      c.beginPath(); c.arc(0, 0, 11, 0, TAU);
      fillStroke(c, rgrad(c, -3, -4, 1, 14, [[0, '#ffffff'], [1, '#d8d2c0']]), 2);
      c.fillStyle = '#0f172a'; ell(c, -4.4, -1, 3.2, 3.8); c.fill(); ell(c, 4.4, -1, 3.2, 3.8); c.fill();
      c.fillStyle = '#7dd3fc'; c.shadowColor = '#38bdf8'; c.shadowBlur = 6; c.beginPath(); c.arc(-4.2, -1, 1.2, 0, TAU); c.fill(); c.beginPath(); c.arc(4.6, -1, 1.2, 0, TAU); c.fill(); c.shadowBlur = 0;
      c.fillStyle = '#0f172a'; c.beginPath(); c.moveTo(-1.4, 3.6); c.lineTo(1.4, 3.6); c.lineTo(0, 1.4); c.closePath(); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-6, 7.4); c.lineTo(6, 7.4); c.stroke();
      for (let i = -4; i <= 4; i += 2) { c.beginPath(); c.moveTo(i, 6.4); c.lineTo(i, 9.4); c.stroke(); }
      c.fillStyle = team; c.beginPath(); c.moveTo(-11, -4); c.lineTo(11, -4); c.lineTo(9, -8); c.lineTo(-9, -8); c.closePath(); c.fill(); ink(c, 1.4); c.stroke();
    },
    chest: (c, o) => {
      c.strokeStyle = '#8b8574'; c.lineWidth = 1.6;
      for (let i = 0; i < 4; i += 1) { c.beginPath(); c.moveTo(-8, SHOULDER_Y + 8 + i * 5); c.quadraticCurveTo(0, SHOULDER_Y + 12 + i * 5, 8, SHOULDER_Y + 8 + i * 5); c.stroke(); }
      c.beginPath(); c.moveTo(0, SHOULDER_Y + 4); c.lineTo(0, HIP_Y); c.stroke();
      c.fillStyle = o.team; c.beginPath(); c.moveTo(-9, HIP_Y - 2); c.lineTo(9, HIP_Y - 2); c.lineTo(5, HIP_Y + 10); c.lineTo(0, HIP_Y + 6); c.lineTo(-5, HIP_Y + 10); c.closePath(); c.fill(); ink(c, 1.2); c.stroke();
    },
    weapon: (c, o, ps, pose) => sword(c, o, ps, pose, 22, '#a8a29e'),
  });

  FIGURES.healer = (team) => ({
    team, tunic: '#f8fafc', robe: true, pants: '#e2e8f0', glove: '#f1c9a0', w: 0.95, sash: team,
    head: (c, o, ps) => {
      // cabello largo
      c.beginPath(); c.moveTo(-12, -2); c.quadraticCurveTo(-15, 18, -8, 20); c.lineTo(8, 20); c.quadraticCurveTo(15, 18, 12, -2); c.closePath();
      fillStroke(c, grad(c, 0, -8, 0, 20, [[0, '#f59e0b'], [1, '#b45309']]), 2);
      c.beginPath(); c.arc(0, 0, 10.6, 0, TAU);
      fillStroke(c, rgrad(c, -3, -3, 1, 14, [[0, '#ffe0bd'], [1, '#e8b88a']]), 2);
      c.beginPath(); c.moveTo(-11, -1); c.quadraticCurveTo(0, -14, 11, -1); c.quadraticCurveTo(2, -5, -11, -1); c.closePath(); fillStroke(c, '#f59e0b', 1.6);
      drawEyes(c, 1, o);
      c.fillStyle = '#e11d48'; c.beginPath(); c.arc(0.4, 6.2, 1.6, 0, Math.PI); c.fill();
      // aureola
      c.strokeStyle = '#fde047'; c.lineWidth = 3; c.shadowColor = '#fde047'; c.shadowBlur = 9;
      c.beginPath(); c.ellipse(0, -17, 9, 3, 0, 0, TAU); c.stroke(); c.shadowBlur = 0;
    },
    chest: (c, o) => { c.fillStyle = o.team; c.fillRect(-2.4, SHOULDER_Y + 4, 4.8, 22); c.fillStyle = '#facc15'; c.beginPath(); c.arc(0, SHOULDER_Y + 8, 3.4, 0, TAU); c.fill(); ink(c, 1); c.stroke(); },
    pose: (o, ps, base) => {
      const pose = base(o, { ...ps, atk: -1 });
      pose.handR = [20, -44 + Math.sin(ps.phase) * 2];
      pose.weaponAngle = 0.05;
      pose.handL = [-19, -38 + Math.sin(ps.phase) * 2];
      if (ps.atk >= 0) {
        const lift = Math.sin(ps.atk * Math.PI);
        pose.handR = [18, -50 - lift * 12];
        pose.handL = [-18, -50 - lift * 12];
        pose.bob = 0; pose.footL = [-9, 0]; pose.footR = [9, 0];
      }
      return pose;
    },
    weapon: (c, o, ps, pose) => {
      const [hx, hy] = pose.handR;
      c.save(); c.translate(hx, hy); c.rotate(pose.weaponAngle);
      cap(c, 0, 14, 0, -32, 4, '#c08a3e', 'rgba(255,255,255,.3)');
      c.fillStyle = '#fde047'; c.beginPath(); c.moveTo(-9, -34); c.quadraticCurveTo(-3, -34, 0, -30); c.quadraticCurveTo(3, -34, 9, -34); c.quadraticCurveTo(4, -29, 0, -26); c.quadraticCurveTo(-4, -29, -9, -34); c.fill(); ink(c, 1.2); c.stroke();
      const flare = ps.atk >= 0 ? 1 + Math.sin(ps.atk * Math.PI) * 1.5 : 1;
      c.fillStyle = rgrad(c, 0, -34, 0, 13 * flare, [[0, '#f0fdf4'], [0.4, 'rgba(74,222,128,.9)'], [1, 'rgba(74,222,128,0)']]);
      c.beginPath(); c.arc(0, -34, 13 * flare, 0, TAU); c.fill();
      c.restore();
    },
  });

  FIGURES.necromancer = (team) => ({
    team, tunic: '#23184a', robe: true, pants: '#150f30', glove: '#cbd5e1', skin: '#cbd5e1', w: 0.98, sash: shade(team, -0.2),
    sleeveL: '#2c1f5e', sleeveR: '#2c1f5e',
    head: (c, o, ps) => {
      c.beginPath(); c.arc(0, 1, 10, 0, TAU);
      fillStroke(c, rgrad(c, -3, -2, 1, 14, [[0, '#f1f5f9'], [1, '#94a3b8']]), 2);
      c.fillStyle = '#a855f7'; c.shadowColor = '#c084fc'; c.shadowBlur = 8; ell(c, -3.8, 0, 2.2, 2.6); c.fill(); ell(c, 4, 0, 2.2, 2.6); c.fill(); c.shadowBlur = 0;
      // capucha
      c.beginPath(); c.moveTo(-14, 10); c.quadraticCurveTo(-16, -16, 0, -17); c.quadraticCurveTo(16, -16, 14, 10); c.quadraticCurveTo(10, -3, 0, -4); c.quadraticCurveTo(-10, -3, -14, 10); c.closePath();
      fillStroke(c, grad(c, -12, -17, 12, 8, [[0, '#4c2f9a'], [1, '#150f30']]), 2);
      c.fillStyle = '#e2e8f0'; c.beginPath(); c.moveTo(-4, -14); c.lineTo(0, -22); c.lineTo(4, -14); c.closePath(); fillStroke(c, '#e2e8f0', 1.2);
    },
    chest: (c, o) => {
      c.fillStyle = '#e2e8f0'; for (let i = -1; i <= 1; i += 1) { c.beginPath(); c.arc(i * 6, SHOULDER_Y + 6, 3.2, 0, TAU); c.fill(); ink(c, 1.1); c.stroke(); }
    },
    pose: (o, ps, base) => {
      const pose = base(o, { ...ps, atk: -1 });
      pose.handR = [20, -42 + Math.sin(ps.phase) * 2]; pose.weaponAngle = 0.1;
      pose.bob = pose.bob + Math.sin(ps.t * 4) * 1.2;
      if (ps.atk >= 0) {
        const lift = Math.sin(ps.atk * Math.PI);
        pose.handR = [18 + lift * 5, -48 - lift * 8]; pose.weaponAngle = 0.1 + lift * 0.7;
        pose.bob = 0; pose.footL = [-9, 0]; pose.footR = [9, 0];
      }
      return pose;
    },
    weapon: (c, o, ps, pose) => {
      const [hx, hy] = pose.handR;
      c.save(); c.translate(hx, hy); c.rotate(pose.weaponAngle);
      cap(c, 0, 14, 0, -32, 4, '#3f3f46', 'rgba(255,255,255,.18)');
      c.beginPath(); c.arc(0, -38, 7.4, 0, TAU); fillStroke(c, rgrad(c, -2, -40, 1, 9, [[0, '#ffffff'], [1, '#cbd5e1']]), 1.8);
      c.fillStyle = '#0f172a'; c.beginPath(); c.arc(-2.6, -39, 1.8, 0, TAU); c.arc(2.6, -39, 1.8, 0, TAU); c.fill();
      const flare = ps.atk >= 0 ? 1 + Math.sin(ps.atk * Math.PI) * 1.2 : 1;
      c.fillStyle = rgrad(c, 0, -38, 2, 17 * flare, [[0, 'rgba(216,180,254,.9)'], [1, 'rgba(168,85,247,0)']]);
      c.beginPath(); c.arc(0, -38, 17 * flare, 0, TAU); c.fill();
      c.restore();
    },
  });

  // ======================================================================
  // criaturas y máquinas (dibujo propio)
  // ======================================================================
  function drawKnight(c, team, ps) {
    const sp = Math.sin(ps.phase);
    const atk = ps.atk;
    const gallop = Math.abs(sp) * 3.5;
    c.save();
    c.translate(0, -gallop);
    const lunge = atk >= 0 ? Math.sin(atk * Math.PI) * 8 : 0;
    c.translate(lunge, 0);

    // cola
    c.strokeStyle = '#2a1a0d'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-38, -34); c.quadraticCurveTo(-52, -26 + sp * 8, -50, -8 + sp * 6); c.stroke();
    // patas traseras y delanteras (galope)
    const legs = [[-30, 1], [-20, -1], [22, -1], [32, 1]];
    legs.forEach(([x, d], i) => {
      const a = ps.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.8 : 0);
      const fx = x + Math.sin(a) * 9 * d;
      const fy = -Math.max(0, Math.cos(a)) * 9;
      cap(c, x, -30, (x + fx) / 2 + 2, -16 + fy / 2, 8, '#6e3f1b', 'rgba(255,255,255,.12)');
      cap(c, (x + fx) / 2 + 2, -16 + fy / 2, fx, fy - 3, 6.5, '#6e3f1b');
      c.fillStyle = '#1f1208'; rr(c, fx - 4.4, fy - 6, 8.8, 6.4, 2); c.fill(); ink(c, 1.4); c.stroke();
    });
    // cuerpo
    c.beginPath(); c.ellipse(0, -40, 40, 19, 0, 0, TAU);
    fillStroke(c, grad(c, 0, -60, 0, -22, [[0, '#9a5a2a'], [0.6, '#7a4420'], [1, '#4f2a12']]), 2.4);
    // manta con colores del reino
    c.beginPath(); c.moveTo(-26, -56); c.lineTo(26, -56); c.quadraticCurveTo(34, -36, 26, -22); c.lineTo(-26, -22); c.quadraticCurveTo(-34, -36, -26, -56); c.closePath();
    fillStroke(c, grad(c, 0, -56, 0, -22, [[0, shade(team, 0.2)], [1, shade(team, -0.35)]]), 2);
    c.fillStyle = '#fde68a'; star(c, 0, -38, 6, 5, 0.5); c.fill(); ink(c, 1); c.stroke();
    // cuello y cabeza
    c.beginPath(); c.moveTo(24, -50); c.quadraticCurveTo(40, -66, 50, -62); c.lineTo(52, -48); c.quadraticCurveTo(40, -42, 30, -34); c.closePath();
    fillStroke(c, grad(c, 24, -66, 52, -34, [[0, '#9a5a2a'], [1, '#6e3f1b']]), 2.2);
    c.beginPath(); c.ellipse(54, -56, 10, 7, 0.45, 0, TAU); fillStroke(c, '#865022', 2);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(52, -59, 1.8, 0, TAU); c.fill(); c.fillStyle = '#111827'; c.beginPath(); c.arc(52.6, -59, 1, 0, TAU); c.fill();
    // crin
    c.fillStyle = '#2a1a0d'; c.beginPath(); c.moveTo(28, -56); c.quadraticCurveTo(40, -74 + sp * 3, 48, -64); c.lineTo(44, -58); c.closePath(); c.fill();
    // jinete
    c.save(); c.translate(-2, -52);
    cap(c, -6, 14, -9, -4, 10, shade(team, -0.2), 'rgba(255,255,255,.15)');
    cap(c, 6, 14, 14, -4, 9, '#9ca3af');
    c.beginPath(); c.moveTo(-9, 6); c.lineTo(9, 6); c.lineTo(8, -22); c.lineTo(-8, -22); c.closePath();
    fillStroke(c, grad(c, -9, -22, 9, 6, [[0, '#e5e7eb'], [0.5, '#9ca3af'], [1, '#4b5563']]), 2);
    c.fillStyle = team; c.fillRect(-9, -8, 18, 4);
    c.beginPath(); c.arc(0, -29, 8.4, 0, TAU); fillStroke(c, grad(c, -8, -37, 8, -21, [[0, '#f1f5f9'], [1, '#6b7280']]), 2);
    c.fillStyle = '#0f172a'; c.fillRect(-6, -30, 12, 3);
    c.beginPath(); c.moveTo(-2, -37); c.quadraticCurveTo(-4, -50 + sp * 3, 8, -46); c.quadraticCurveTo(2, -43, 3, -37); c.closePath(); fillStroke(c, team, 1.6);
    // escudo
    c.beginPath(); c.moveTo(-18, -18); c.lineTo(-5, -18); c.lineTo(-5, -2); c.quadraticCurveTo(-11, 6, -18, -2); c.closePath();
    fillStroke(c, grad(c, -18, -18, -5, 4, [[0, shade(team, 0.25)], [1, shade(team, -0.3)]]), 2);
    // lanza
    c.save();
    const ang = atk >= 0 ? lerp(-0.25, 0.05, Math.sin(atk * Math.PI)) : -0.18;
    c.translate(12, -6); c.rotate(ang);
    const thrust = atk >= 0 ? Math.sin(atk * Math.PI) * 14 : 0;
    cap(c, -18, 0, 46 + thrust, 0, 4, '#8a5a2b', 'rgba(255,255,255,.2)');
    c.beginPath(); c.moveTo(46 + thrust, -4.6); c.lineTo(62 + thrust, 0); c.lineTo(46 + thrust, 4.6); c.closePath(); fillStroke(c, grad(c, 46, -5, 62, 5, [[0, '#f1f5f9'], [1, '#94a3b8']]), 1.6);
    c.fillStyle = team; c.beginPath(); c.moveTo(34 + thrust, -3); c.lineTo(44 + thrust, -11); c.lineTo(44 + thrust, 3); c.closePath(); c.fill(); ink(c, 1.2); c.stroke();
    c.restore();
    c.restore();
    c.restore();
  }

  function drawColossus(c, team, ps) {
    const sp = Math.sin(ps.phase);
    const atk = ps.atk;
    const stomp = Math.abs(sp) * 3;
    c.save();
    c.translate(0, -stomp);
    const lean = atk >= 0 ? Math.sin(atk * Math.PI) * 7 : sp * 1.6;
    const rock = (x, y, rx, ry, rot, lightness) => {
      c.beginPath();
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * TAU + rot;
        const k = 0.82 + ((i * 53) % 7) / 7 * 0.28;
        c.lineTo(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k);
      }
      c.closePath();
      fillStroke(c, grad(c, x - rx, y - ry, x + rx, y + ry, [[0, shade('#a8a29e', lightness + 0.2)], [1, shade('#57534e', lightness)]]), 2.4);
    };
    // piernas
    rock(-14, -14 - Math.max(0, sp) * 4, 12, 15, 0.3, 0);
    rock(14, -14 - Math.max(0, -sp) * 4, 12, 15, 0.9, 0);
    // brazo trasero
    rock(-34 + lean * 0.4, -56, 12, 20, 0.2, -0.05);
    // torso
    rock(lean * 0.6, -58, 30, 28, 0.4, 0.05);
    // musgo
    c.fillStyle = 'rgba(101,163,13,.75)'; c.beginPath(); c.ellipse(-12 + lean * 0.6, -80, 12, 4, 0.2, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(16 + lean * 0.6, -36, 8, 3.4, -0.3, 0, TAU); c.fill();
    // runas brillantes
    const glow = 0.65 + Math.sin(ps.t * 3) * 0.3;
    c.save(); c.shadowColor = team; c.shadowBlur = 14; c.strokeStyle = shade(team, 0.45); c.lineWidth = 3; c.globalAlpha = glow; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-10 + lean * 0.6, -70); c.lineTo(-2 + lean * 0.6, -60); c.lineTo(-12 + lean * 0.6, -50); c.moveTo(8 + lean * 0.6, -72); c.lineTo(14 + lean * 0.6, -56); c.lineTo(6 + lean * 0.6, -46); c.stroke();
    c.restore();
    // cabeza
    rock(2 + lean, -92, 14, 12, 0.7, 0.1);
    c.save(); c.shadowColor = '#fde047'; c.shadowBlur = 10; c.fillStyle = '#fde047';
    c.fillRect(-4 + lean, -96, 4.4, 3.6); c.fillRect(4 + lean, -96, 4.4, 3.6); c.restore();
    c.fillStyle = team; rr(c, -14 + lean * 0.6, -74, 28, 5, 2); c.fill(); ink(c, 1.4); c.stroke();
    // brazo delantero con puño (golpe)
    const fist = atk >= 0 ? (atk < 0.4 ? -ease(atk / 0.4) * 14 : lerp(-14, 26, ease(Math.min(1, (atk - 0.4) / 0.2)))) : 0;
    const fy = atk >= 0 ? (atk < 0.4 ? -ease(atk / 0.4) * 22 : lerp(-22, 12, ease(Math.min(1, (atk - 0.4) / 0.2)))) : 0;
    rock(34 + lean * 0.4 + fist * 0.4, -52 + fy * 0.4, 12, 20, 0.5, 0.05);
    rock(38 + lean * 0.4 + fist, -26 + fy, 15, 14, 0.2, 0.1);
    c.restore();
  }

  function drawDragon(c, team, ps) {
    const flap = Math.sin(ps.phase * 1.3);
    const atk = ps.atk;
    const hover = Math.sin(ps.phase) * 3;
    c.save();
    c.translate(0, hover);
    const dark = shade(team, -0.45);
    const mid = shade(team, -0.15);
    // ala de murciélago: hueso del brazo, tres dedos y membrana con borde festoneado
    const wing = (sx, sy, k, col, vein) => {
      c.save(); c.translate(sx, sy); c.rotate(-0.1 - flap * 0.5 * k);
      const wrist = [-30, -50 * k];
      const tips = [[-70, -60 * k], [-66, -34 * k], [-46, -14 * k]];
      c.beginPath(); c.moveTo(0, 2); c.lineTo(wrist[0], wrist[1]); c.lineTo(tips[0][0], tips[0][1]);
      c.quadraticCurveTo(-60, -44 * k, tips[1][0], tips[1][1]);
      c.quadraticCurveTo(-54, -24 * k, tips[2][0], tips[2][1]);
      c.quadraticCurveTo(-26, -6 * k, 3, 10); c.closePath();
      fillStroke(c, grad(c, -70, -60, 0, 8, [[0, shade(col, 0.28)], [0.6, col], [1, shade(col, -0.4)]]), 2.4);
      c.strokeStyle = vein; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 2); c.lineTo(wrist[0], wrist[1]);
      tips.forEach((t) => { c.moveTo(wrist[0], wrist[1]); c.lineTo(t[0], t[1]); });
      c.stroke();
      c.fillStyle = '#f8fafc'; c.beginPath(); c.arc(wrist[0], wrist[1], 3, 0, TAU); c.fill(); ink(c, 1.2); c.stroke();
      c.restore();
    };
    wing(-6, -26, 0.8, dark, 'rgba(0,0,0,.35)');
    wing(4, -30, 1.0, team, 'rgba(0,0,0,.3)');
    // cola
    c.strokeStyle = INK; c.lineWidth = 11; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-14, -14); c.quadraticCurveTo(-40, -6 + flap * 6, -56, -22 + flap * 9); c.stroke();
    c.strokeStyle = mid; c.lineWidth = 7.6;
    c.beginPath(); c.moveTo(-14, -14); c.quadraticCurveTo(-40, -6 + flap * 6, -56, -22 + flap * 9); c.stroke();
    c.fillStyle = dark; c.beginPath(); c.moveTo(-54, -26 + flap * 9); c.lineTo(-68, -34 + flap * 9); c.lineTo(-60, -18 + flap * 9); c.closePath(); c.fill(); ink(c, 1.4); c.stroke();
    // cuerpo
    c.beginPath(); c.ellipse(0, -18, 26, 17, -0.15, 0, TAU);
    fillStroke(c, grad(c, 0, -36, 0, 0, [[0, shade(team, 0.2)], [0.55, team], [1, shade(team, -0.4)]]), 2.4);
    c.fillStyle = shade(team, 0.55); c.beginPath(); c.ellipse(4, -8, 17, 7, -0.1, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.2; for (let i = -3; i <= 3; i += 1) { c.beginPath(); c.moveTo(i * 5 + 4, -12); c.lineTo(i * 5 + 4, -4); c.stroke(); }
    // patas
    cap(c, -4, -6, -8, 4, 6, mid); cap(c, 10, -6, 14, 4, 6, mid);
    // cuello y cabeza
    const mouth = atk >= 0 ? Math.sin(atk * Math.PI) : 0;
    c.strokeStyle = INK; c.lineWidth = 13; c.beginPath(); c.moveTo(14, -26); c.quadraticCurveTo(30, -42, 38, -36); c.stroke();
    c.strokeStyle = team; c.lineWidth = 9.4; c.beginPath(); c.moveTo(14, -26); c.quadraticCurveTo(30, -42, 38, -36); c.stroke();
    c.save(); c.translate(40, -36); c.rotate(-0.1 + mouth * 0.25);
    c.beginPath(); c.moveTo(-4, -8); c.quadraticCurveTo(10, -12, 20, -4); c.lineTo(20, 0); c.lineTo(-4, 2); c.closePath(); fillStroke(c, grad(c, 0, -10, 0, 4, [[0, shade(team, 0.15)], [1, team]]), 2);
    c.save(); c.rotate(mouth * 0.45);
    c.beginPath(); c.moveTo(-3, 1); c.lineTo(18, 1); c.lineTo(14, 6); c.lineTo(-2, 6); c.closePath(); fillStroke(c, mid, 1.8); c.restore();
    c.fillStyle = '#fef08a'; c.shadowColor = '#fde047'; c.shadowBlur = 6; c.beginPath(); c.arc(6, -6, 2.4, 0, TAU); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#f8fafc'; c.beginPath(); c.moveTo(-2, -9); c.lineTo(-8, -20); c.lineTo(2, -11); c.closePath(); fillStroke(c, '#f8fafc', 1.4);
    c.beginPath(); c.moveTo(4, -10); c.lineTo(0, -21); c.lineTo(9, -10); c.closePath(); fillStroke(c, '#e2e8f0', 1.4);
    if (mouth > 0.1) {
      c.fillStyle = rgrad(c, 28, 2, 0, 20 + mouth * 16, [[0, '#fff7ed'], [0.4, '#fb923c'], [1, 'rgba(239,68,68,0)']]);
      c.beginPath(); c.arc(28, 2, 20 + mouth * 16, 0, TAU); c.fill();
    }
    c.restore();
    c.restore();
  }

  function drawRam(c, team, ps) {
    const atk = ps.atk;
    const roll = ps.phase * 0.9;
    const thrust = atk >= 0 ? (atk < 0.4 ? -ease(atk / 0.4) * 12 : lerp(-12, 20, ease(Math.min(1, (atk - 0.4) / 0.18))) * (atk < 0.7 ? 1 : 1 - ease((atk - 0.7) / 0.3))) : 0;
    c.save();
    c.translate(0, -Math.abs(Math.sin(ps.phase)) * 1.4);
    // techo (tejado con el color del reino)
    c.beginPath(); c.moveTo(-42, -42); c.lineTo(0, -66); c.lineTo(42, -42); c.lineTo(36, -36); c.lineTo(-36, -36); c.closePath();
    fillStroke(c, grad(c, 0, -66, 0, -36, [[0, shade(team, 0.2)], [1, shade(team, -0.35)]]), 2.4);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.5; for (let i = -3; i <= 3; i += 1) { c.beginPath(); c.moveTo(i * 10, -62 + Math.abs(i) * 4); c.lineTo(i * 11, -37); c.stroke(); }
    // postes
    cap(c, -34, -38, -34, -12, 6, '#7a4a21'); cap(c, 34, -38, 34, -12, 6, '#7a4a21');
    // tronco con cabeza de carnero
    c.save(); c.translate(thrust, 0);
    cap(c, -44, -22, 40, -22, 14, '#8a5a2b', 'rgba(255,255,255,.2)');
    c.strokeStyle = '#3f3f46'; c.lineWidth = 2; [-26, -6, 14].forEach((x) => { c.beginPath(); c.moveTo(x, -30); c.lineTo(x, -14); c.stroke(); });
    c.beginPath(); c.moveTo(38, -34); c.quadraticCurveTo(62, -34, 64, -22); c.quadraticCurveTo(62, -10, 38, -10); c.closePath();
    fillStroke(c, grad(c, 38, -34, 64, -10, [[0, '#e2e8f0'], [1, '#64748b']]), 2.4);
    c.beginPath(); c.arc(50, -34, 8, Math.PI, TAU * 0.9); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#cbd5e1'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#fda4af'; c.beginPath(); c.arc(56, -24, 2.4, 0, TAU); c.fill();
    c.restore();
    // ruedas
    [[-30], [28]].forEach(([x]) => {
      c.save(); c.translate(x, -9); c.rotate(roll);
      c.beginPath(); c.arc(0, 0, 11, 0, TAU); fillStroke(c, '#5b3a1e', 2.4);
      c.strokeStyle = '#3f3f46'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 2; for (let i = 0; i < 4; i += 1) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(i * Math.PI / 2) * 9, Math.sin(i * Math.PI / 2) * 9); c.stroke(); }
      c.restore();
    });
    c.restore();
  }

  const SPECIAL = { knight: drawKnight, colossus: drawColossus, dragon: drawDragon, ram: drawRam };

  // metadatos de cada hoja: caja de dibujo (unidades de arte), origen en los pies, altura visual y tamaño en pantalla
  const META = {
    squire: { w: 120, h: 130, ox: 60, oy: 112, artH: 82, hf: 3.15 },
    archer: { w: 130, h: 130, ox: 62, oy: 112, artH: 84, hf: 3.15 },
    knight: { w: 190, h: 150, ox: 85, oy: 120, artH: 100, hf: 3.6 },
    wizard: { w: 120, h: 150, ox: 60, oy: 118, artH: 108, hf: 3.5 },
    ogre: { w: 150, h: 160, ox: 75, oy: 124, artH: 96, hf: 3.1 },
    titan: { w: 150, h: 160, ox: 75, oy: 124, artH: 102, hf: 3.2 },
    colossus: { w: 160, h: 180, ox: 80, oy: 150, artH: 112, hf: 3.1 },
    dragon: { w: 210, h: 160, ox: 100, oy: 112, artH: 88, hf: 3.4 },
    skeletons: { w: 100, h: 120, ox: 50, oy: 106, artH: 78, hf: 3.0 },
    healer: { w: 120, h: 150, ox: 60, oy: 118, artH: 104, hf: 3.4 },
    ram: { w: 170, h: 130, ox: 80, oy: 100, artH: 70, hf: 3.0 },
    necromancer: { w: 130, h: 160, ox: 65, oy: 124, artH: 110, hf: 3.5 },
  };

  function drawFigure(c, typeId, team, ps) {
    const maker = FIGURES[typeId];
    const o = maker(team);
    if (o.special) { SPECIAL[o.special](c, team, ps); return; }
    drawHumanoid(c, o, ps);
  }

  // ---------- hojas de sprites ----------
  const sheets = new Map();

  // ---------- hojas horneadas desde modelos 3D (CC0, ver CREDITOS) ----------
  // cada atlas: 8 columnas x 2 filas (caminar / atacar); el estandarte magenta se tiñe con el color del reino
  const BAKED = {
    squire: { fw: 192, fh: 192, feetY: 165.12, h: 148 }, archer: { fw: 192, fh: 192, feetY: 165.12, h: 142 },
    wizard: { fw: 192, fh: 192, feetY: 165.12, h: 150 }, healer: { fw: 192, fh: 192, feetY: 165.12, h: 150 },
    necromancer: { fw: 192, fh: 192, feetY: 165.12, h: 148 }, titan: { fw: 192, fh: 192, feetY: 165.12, h: 170 },
    ogre: { fw: 192, fh: 192, feetY: 165.12, h: 150 }, skeletons: { fw: 192, fh: 192, feetY: 165.12, h: 140 },
    colossus: { fw: 256, fh: 256, feetY: 220.16, h: 176 }, dragon: { fw: 288, fh: 256, feetY: 220.16, h: 140 },
    knight: { fw: 288, fh: 256, feetY: 220.16, h: 135 },
  };
  const bakedImages = {};
  function loadBaked() {
    if (typeof Image === 'undefined') return;
    Object.keys(BAKED).forEach((id) => {
      const img = new Image();
      img.onload = () => {
        const b = BAKED[id];
        bakedImages[id] = img;
        META[id] = Object.assign({}, META[id], { w: b.fw, h: b.fh, ox: b.fw / 2, oy: b.feetY, artH: b.h, baked: true });
        sheets.delete(`${id}|left`); sheets.delete(`${id}|right`);
        sheets.forEach((_v, key) => { if (key.startsWith(`${id}|`)) sheets.delete(key); });
      };
      img.src = ART_BASE + id + '.png';
    });
  }

  function recolorFrame(cv, team) {
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height);
    const px = d.data;
    const [tr, tg, tb] = hexToRgb(team);
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (px[i + 3] > 0 && r > 140 && b > 140 && g < Math.min(r, b) * 0.62) {
        const f = ((r + b) / 510) * 1.05;
        px[i] = clamp(tr * f, 0, 255); px[i + 1] = clamp(tg * f, 0, 255); px[i + 2] = clamp(tb * f, 0, 255);
      }
    }
    c.putImageData(d, 0, 0);
  }

  function buildBakedSheet(typeId, team) {
    const meta = META[typeId];
    const b = BAKED[typeId];
    const img = bakedImages[typeId];
    const cut = (col, row) => {
      const cv = document.createElement('canvas');
      cv.width = b.fw; cv.height = b.fh;
      cv.getContext('2d').drawImage(img, col * b.fw, row * b.fh, b.fw, b.fh, 0, 0, b.fw, b.fh);
      recolorFrame(cv, team);
      return cv;
    };
    const walk = []; const attack = [];
    for (let i = 0; i < WALK_FRAMES; i += 1) walk.push(cut(i, 0));
    for (let i = 0; i < ATTACK_FRAMES; i += 1) attack.push(cut(i, 1));
    return { meta, walk, attack };
  }

  function buildSheet(typeId, team) {
    if (bakedImages[typeId] && META[typeId].baked) return buildBakedSheet(typeId, team);
    const meta = META[typeId];
    const mk = (phase, atk, t) => {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(meta.w * PR);
      cv.height = Math.ceil(meta.h * PR);
      const c = cv.getContext('2d');
      c.scale(PR, PR);
      c.translate(meta.ox, meta.oy);
      drawFigure(c, typeId, team, { phase, atk, t });
      return cv;
    };
    const walk = [];
    for (let i = 0; i < WALK_FRAMES; i += 1) walk.push(mk((i / WALK_FRAMES) * TAU, -1, i * 0.4));
    const attack = [];
    for (let i = 0; i < ATTACK_FRAMES; i += 1) attack.push(mk(0.4, i / (ATTACK_FRAMES - 1), i * 0.4));
    return { meta, walk, attack };
  }

  function getSheet(typeId, team) {
    const key = `${typeId}|${team}`;
    let sheet = sheets.get(key);
    if (!sheet) { sheet = buildSheet(typeId, team); sheets.set(key, sheet); }
    return sheet;
  }

  function clearSheets() { sheets.clear(); }
  loadBaked();

  // sombra suave reutilizable (crear un degradado por unidad en cada cuadro es caro)
  let shadowCache = null;
  function shadowSprite() {
    if (!shadowCache) {
      shadowCache = document.createElement('canvas');
      shadowCache.width = 96; shadowCache.height = 38;
      const sc = shadowCache.getContext('2d');
      sc.translate(48, 19); sc.scale(1, 0.4);
      sc.fillStyle = rgrad(sc, 0, 0, 0, 47, [[0, 'rgba(0,0,0,.45)'], [0.6, 'rgba(0,0,0,.25)'], [1, 'rgba(0,0,0,0)']]);
      sc.beginPath(); sc.arc(0, 0, 47, 0, TAU); sc.fill();
    }
    return shadowCache;
  }

  // Dibuja un personaje en (x, y) del mundo. r = radio de la unidad.
  const flashCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

  function drawUnit(c, typeId, team, x, y, r, facing, o) {
    const sheet = getSheet(typeId, team);
    const m = sheet.meta;
    const k = (r * m.hf * UNIT_SCALE) / m.artH; // unidades de mundo por unidad de arte
    const attacking = o.attackP !== undefined && o.attackP >= 0 && o.attackP < 1;
    let frame;
    if (attacking) frame = sheet.attack[Math.min(ATTACK_FRAMES - 1, Math.floor(o.attackP * ATTACK_FRAMES))];
    else frame = sheet.walk[Math.floor(o.walkT * WALK_FRAMES) % WALK_FRAMES];

    const lift = o.lift || 0;
    const pop = o.pop === undefined ? 1 : o.pop;
    const squash = o.squash || 0;
    const breathe = o.moving || attacking ? 0 : Math.sin(o.time * 3 + o.phase) * 0.012;

    // sombra suave en el suelo
    c.save();
    c.translate(x, y);
    if (o.alpha !== undefined) c.globalAlpha = Math.max(0, o.alpha);
    const sk = 1 - lift / 160;
    c.drawImage(shadowSprite(), -r * 1.4 * sk, r * 0.7 - r * 0.55 * sk, r * 2.8 * sk, r * 1.1 * sk);
    // aro del reino
    c.strokeStyle = rgba(team, 0.85); c.lineWidth = 2.4;
    c.beginPath(); c.ellipse(0, r * 0.7, r * 1.05, r * 0.42, 0, 0, TAU); c.stroke();
    if (o.gold) {
      c.strokeStyle = 'rgba(250,204,21,.9)'; c.lineWidth = 1.8;
      c.beginPath(); c.ellipse(0, r * 0.7, r * 1.25, r * 0.5, 0, 0, TAU); c.stroke();
    }

    c.translate(o.lunge ? o.lunge * facing : 0, -lift);
    if (o.rot) c.rotate(o.rot);
    c.scale(facing * pop * (1 + breathe - squash * 0.4), pop * (1 + squash - breathe));
    const w = m.w * k;
    const h = m.h * k;
    const ox = m.ox * k;
    const oy = m.oy * k;

    if (o.flash > 0) {
      const f = flashCanvas;
      f.width = frame.width; f.height = frame.height;
      const fc = f.getContext('2d');
      fc.clearRect(0, 0, f.width, f.height);
      fc.drawImage(frame, 0, 0);
      fc.globalCompositeOperation = 'source-atop';
      fc.fillStyle = `rgba(255,255,255,${Math.min(0.85, o.flash * 5)})`;
      fc.fillRect(0, 0, f.width, f.height);
      c.drawImage(f, -ox, -oy, w, h);
    } else {
      c.drawImage(frame, -ox, -oy, w, h);
    }
    c.restore();
    return k;
  }

  // ======================================================================
  // castillos y torres (sprites estáticos; banderas y fuego van aparte)
  // ======================================================================
  // piedra con bloques irregulares: variación de tono por bloque, juntas con sombra, luz arriba, oclusión abajo y musgo
  function stoneWall(c, x, y, w, h, base, rows = 5) {
    c.save();
    rr(c, x, y, w, h, 6);
    c.fillStyle = grad(c, x, y, x + w, y + h, [[0, shade(base, 0.22)], [0.55, base], [1, shade(base, -0.34)]]); c.fill();
    c.clip();
    const rowH = h / rows;
    const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7 + x * 0.37 + y * 0.91) * 43758.5453; return v - Math.floor(v); };
    for (let r2 = 0; r2 < rows; r2 += 1) {
      const off = r2 % 2 ? 0 : 16;
      const by = y + r2 * rowH;
      for (let xx = x + off - 32, k = 0; xx < x + w; xx += 32, k += 1) {
        const bw = 32 - 2 + hash(r2, k) * 2;
        const t = hash(r2 * 7 + 1, k * 3 + 2);
        c.fillStyle = t > 0.5 ? `rgba(255,248,235,${(t - 0.5) * 0.22})` : `rgba(30,20,14,${(0.5 - t) * 0.26})`;
        c.fillRect(xx + 1, by + 1, bw, rowH - 2);
        // luz en el borde superior y sombra en el inferior de cada bloque
        c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(xx + 1, by + 1, bw, Math.max(1, rowH * 0.14));
        c.fillStyle = 'rgba(20,12,8,.16)'; c.fillRect(xx + 1, by + rowH - Math.max(2, rowH * 0.16), bw, Math.max(2, rowH * 0.16));
        if (hash(r2 + 9, k + 4) > 0.82) { c.fillStyle = 'rgba(20,12,8,.35)'; c.fillRect(xx + 5 + hash(k, r2) * (bw - 12), by + rowH * 0.3, 2 + hash(r2, 3) * 4, 1.4); }
      }
    }
    c.strokeStyle = 'rgba(28,20,16,.5)'; c.lineWidth = 1.5;
    for (let r2 = 1; r2 < rows; r2 += 1) { c.beginPath(); c.moveTo(x, y + r2 * rowH); c.lineTo(x + w, y + r2 * rowH); c.stroke(); }
    for (let r2 = 0; r2 < rows; r2 += 1) {
      const off = r2 % 2 ? 0 : 16;
      for (let xx = x + off; xx < x + w; xx += 32) { c.beginPath(); c.moveTo(xx, y + r2 * rowH); c.lineTo(xx, y + (r2 + 1) * rowH); c.stroke(); }
    }
    // volumen: luz por la izquierda, sombra por la derecha, oclusión al pie y musgo
    c.fillStyle = grad(c, x, 0, x + w, 0, [[0, 'rgba(255,245,220,.22)'], [0.35, 'rgba(255,245,220,0)'], [0.7, 'rgba(10,10,30,0)'], [1, 'rgba(10,10,30,.32)']]); c.fillRect(x, y, w, h);
    c.fillStyle = grad(c, 0, y + h * 0.7, 0, y + h, [[0, 'rgba(20,40,10,0)'], [1, 'rgba(40,70,25,.38)']]); c.fillRect(x, y + h * 0.7, w, h * 0.3);
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(x, y, w, h * 0.06);
    c.restore();
    rr(c, x, y, w, h, 6); ink(c, 2.4); c.stroke();
  }

  function crenels(c, x, y, w, base) {
    const n = Math.max(3, Math.round(w / 24));
    const cw = w / (n * 2 - 1);
    for (let i = 0; i < n; i += 1) {
      const cx = x + i * cw * 2;
      rr(c, cx, y - 14, cw, 16, 2);
      c.fillStyle = grad(c, cx, y - 14, cx + cw, y, [[0, shade(base, 0.25)], [1, shade(base, -0.3)]]); c.fill(); ink(c, 2); c.stroke();
    }
  }

  function roof(c, cx, baseY, halfW, height, color) {
    c.beginPath(); c.moveTo(cx - halfW, baseY); c.lineTo(cx, baseY - height); c.lineTo(cx + halfW, baseY); c.closePath();
    fillStroke(c, grad(c, cx - halfW, baseY - height, cx + halfW, baseY, [[0, shade(color, 0.3)], [0.55, color], [1, shade(color, -0.4)]]), 2.6);
    c.save(); c.clip();
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1.6;
    for (let y = baseY - 10; y > baseY - height; y -= 11) {
      const half = halfW * (1 - (baseY - y) / height);
      c.beginPath(); c.moveTo(cx - half, y); c.lineTo(cx + half, y); c.stroke();
      for (let x = cx - half + 8; x < cx + half; x += 16) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 11); c.stroke(); }
    }
    c.restore();
  }

  function windowGlow(c, x, y, w, h) {
    rr(c, x, y, w, h, w / 2);
    c.fillStyle = grad(c, x, y, x, y + h, [[0, '#fff3b0'], [1, '#f59e0b']]); c.fill(); ink(c, 1.8); c.stroke();
    c.strokeStyle = 'rgba(30,24,20,.7)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.stroke();
  }

  function drawCastleSprite(kind, team, state) {
    const king = kind === 'king';
    const W = king ? 330 : 190;
    const H = king ? 360 : 250;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(W * PR); cv.height = Math.ceil(H * PR);
    const c = cv.getContext('2d');
    c.scale(PR, PR);
    const cx = W / 2;
    const base = H - 26; // línea del suelo
    const stone = '#b7b0a6';

    if (state === 'ruin') {
      const s = king ? 1.4 : 1;
      c.translate(cx, base);
      c.fillStyle = 'rgba(0,0,0,.3)'; ell(c, 0, 10, 70 * s, 20 * s); c.fill();
      for (let i = 0; i < 14; i += 1) {
        const a = (i * 2.4) % TAU; const rx = 12 + (i * 7) % 18; const px = Math.cos(a) * (28 + (i * 11) % 44) * s; const py = -Math.abs(Math.sin(a)) * 18 * s - (i % 3) * 5;
        c.save(); c.translate(px, py); c.rotate(a);
        rr(c, -rx / 2, -rx / 3, rx, rx * 0.7, 3); fillStroke(c, grad(c, -rx, -rx, rx, rx, [[0, '#a8a29e'], [1, '#57534e']]), 2); c.restore();
      }
      c.fillStyle = rgrad(c, 0, -8, 4, 38 * s, [[0, 'rgba(15,10,10,.85)'], [1, 'rgba(15,10,10,0)']]); ell(c, 0, -8, 38 * s, 18 * s); c.fill();
      // pedazo de muro en pie con bandera rota
      c.save(); c.translate(-30 * s, 0); stoneWall(c, -10, -34, 22, 34, '#8f887e', 3); c.restore();
      cap(c, 22 * s, 0, 18 * s, -44 * s, 3, '#5b3a1e');
      c.fillStyle = shade(team, -0.4); c.beginPath(); c.moveTo(18 * s, -44 * s); c.lineTo(34 * s, -38 * s); c.lineTo(20 * s, -32 * s); c.closePath(); c.fill(); ink(c, 1.2); c.stroke();
      return { canvas: cv, w: W, h: H, ox: cx, oy: base };
    }

    if (king) {
      // base y muralla
      c.fillStyle = 'rgba(0,0,0,.28)'; ell(c, cx + 6, base + 14, 160, 28); c.fill();
      stoneWall(c, cx - 128, base - 106, 256, 112, stone, 5);
      crenels(c, cx - 128, base - 106, 256, stone);
      // torreones laterales
      [-1, 1].forEach((s) => {
        const tx = cx + s * 128;
        stoneWall(c, tx - 30, base - 170, 60, 176, shade(stone, -0.06), 7);
        crenels(c, tx - 30, base - 170, 60, stone);
        roof(c, tx, base - 172, 42, 56, team);
        windowGlow(c, tx - 6, base - 128, 12, 22);
        c.fillStyle = '#facc15'; c.beginPath(); c.arc(tx, base - 190, 4, 0, TAU); c.fill(); ink(c, 1.4); c.stroke();
      });
      // torre central
      stoneWall(c, cx - 56, base - 228, 112, 232, shade(stone, 0.04), 9);
      crenels(c, cx - 56, base - 228, 112, stone);
      roof(c, cx, base - 230, 76, 100, team);
      windowGlow(c, cx - 7, base - 190, 14, 28); windowGlow(c, cx - 7, base - 140, 14, 28);
      // portón
      c.beginPath(); c.moveTo(cx - 28, base + 6); c.lineTo(cx - 28, base - 46); c.arc(cx, base - 46, 28, Math.PI, 0); c.lineTo(cx + 28, base + 6); c.closePath();
      fillStroke(c, grad(c, cx - 28, base - 74, cx + 28, base, [[0, '#6b4423'], [1, '#3a2412']]), 3);
      c.strokeStyle = '#27272a'; c.lineWidth = 2.4;
      [-16, 0, 16].forEach((x) => { c.beginPath(); c.moveTo(cx + x, base - 70); c.lineTo(cx + x, base + 4); c.stroke(); });
      [-36, -16].forEach((y) => { c.beginPath(); c.moveTo(cx - 28, base + y); c.lineTo(cx + 28, base + y); c.stroke(); });
      // escudo del reino sobre la puerta
      c.beginPath(); c.moveTo(cx - 14, base - 104); c.lineTo(cx + 14, base - 104); c.lineTo(cx + 14, base - 86); c.quadraticCurveTo(cx, base - 74, cx - 14, base - 86); c.closePath();
      fillStroke(c, grad(c, cx - 14, base - 104, cx + 14, base - 76, [[0, shade(team, 0.3)], [1, shade(team, -0.3)]]), 2);
      c.fillStyle = '#fde68a'; star(c, cx, base - 92, 6, 5, 0.5); c.fill();
    } else {
      c.fillStyle = 'rgba(0,0,0,.28)'; ell(c, cx + 4, base + 12, 78, 20); c.fill();
      // base ancha y fuste
      stoneWall(c, cx - 62, base - 40, 124, 46, shade(stone, -0.08), 3);
      stoneWall(c, cx - 46, base - 150, 92, 120, stone, 6);
      crenels(c, cx - 52, base - 150, 104, stone);
      roof(c, cx, base - 152, 64, 80, team);
      windowGlow(c, cx - 6, base - 112, 12, 24);
      c.beginPath(); c.moveTo(cx - 12, base - 40); c.lineTo(cx - 12, base - 62); c.arc(cx, base - 62, 12, Math.PI, 0); c.lineTo(cx + 12, base - 40); c.closePath();
      fillStroke(c, '#4a2f18', 2.2);
    }

    // daños: grietas y almenas rotas
    if (state === 'damaged') {
      c.save();
      c.strokeStyle = 'rgba(20,14,10,.8)'; c.lineWidth = 2.6; c.lineCap = 'round';
      const cracks = king
        ? [[cx - 30, base - 190, cx - 22, base - 160, cx - 36, base - 130], [cx + 24, base - 80, cx + 38, base - 56, cx + 28, base - 30], [cx - 100, base - 90, cx - 92, base - 60]]
        : [[cx - 18, base - 140, cx - 8, base - 110, cx - 22, base - 80], [cx + 20, base - 100, cx + 28, base - 70]];
      cracks.forEach((p) => { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.stroke(); });
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath(); c.arc(cx + (king ? 70 : 30), base - (king ? 150 : 100), 9, 0, TAU); c.fill();
      c.restore();
    }
    return { canvas: cv, w: W, h: H, ox: cx, oy: base };
  }

  const castleCache = new Map();
  function getCastle(kind, team, state) {
    const key = `${kind}|${team}|${state}`;
    let s = castleCache.get(key);
    if (!s) { s = drawCastleSprite(kind, team, state); castleCache.set(key, s); }
    return s;
  }
  function clearCastles() { castleCache.clear(); }

  // ======================================================================
  // escenario
  // ======================================================================
  function buildBackground(width, height, W, H, teams, geom) {
    const cv = document.createElement('canvas');
    cv.width = width; cv.height = height;
    const c = cv.getContext('2d');
    const s = width / W;
    c.scale(s, s);

    let seed = 1234567;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const { RIVER_X0, RIVER_X1, LANE_Y, BRIDGE_HALF } = geom;

    // pasto base con luz
    c.fillStyle = grad(c, 0, 0, 0, H, [[0, '#5aa24a'], [0.5, '#4a9140'], [1, '#3b7a36']]); c.fillRect(0, 0, W, H);
    // manchas grandes de color
    for (let i = 0; i < 70; i += 1) {
      const x = rnd() * W; const y = rnd() * H; const r = 60 + rnd() * 150;
      c.fillStyle = rgrad(c, x, y, 0, r, [[0, rnd() > 0.5 ? 'rgba(120,200,90,.18)' : 'rgba(20,80,40,.16)'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // tinte de cada reino
    c.fillStyle = grad(c, 0, 0, RIVER_X0, 0, [[0, rgba(teams.left.color, 0.2)], [1, rgba(teams.left.color, 0.03)]]); c.fillRect(0, 0, RIVER_X0, H);
    c.fillStyle = grad(c, RIVER_X1, 0, W, 0, [[0, rgba(teams.right.color, 0.03)], [1, rgba(teams.right.color, 0.2)]]); c.fillRect(RIVER_X1, 0, W - RIVER_X1, H);

    // caminos de tierra con borde de piedras y huellas de carreta
    LANE_Y.forEach((y) => {
      c.save();
      const path = new Path2D();
      path.moveTo(130, y - 56); path.bezierCurveTo(400, y - 76, 600, y - 40, RIVER_X0, y - BRIDGE_HALF + 20);
      path.lineTo(RIVER_X0, y + BRIDGE_HALF - 20); path.bezierCurveTo(600, y + 40, 400, y + 76, 130, y + 56); path.closePath();
      const path2 = new Path2D();
      path2.moveTo(W - 130, y - 56); path2.bezierCurveTo(W - 400, y - 76, W - 600, y - 40, RIVER_X1, y - BRIDGE_HALF + 20);
      path2.lineTo(RIVER_X1, y + BRIDGE_HALF - 20); path2.bezierCurveTo(W - 600, y + 40, W - 400, y + 76, W - 130, y + 56); path2.closePath();
      [path, path2].forEach((p) => {
        c.fillStyle = grad(c, 0, y - 70, 0, y + 70, [[0, '#a98a5c'], [0.5, '#c4a574'], [1, '#a08157']]); c.fill(p);
        c.lineWidth = 3; c.strokeStyle = 'rgba(70,50,28,.5)'; c.stroke(p);
      });
      c.restore();
      // piedras del borde y huellas
      for (let i = 0; i < 180; i += 1) {
        const left = i % 2 === 0;
        const x = left ? 140 + rnd() * (RIVER_X0 - 170) : RIVER_X1 + 30 + rnd() * (W - RIVER_X1 - 170);
        const yy = y + (rnd() > 0.5 ? 1 : -1) * (50 + rnd() * 10 - Math.abs(x - 450) * 0.0);
        c.fillStyle = rnd() > 0.5 ? '#8c8579' : '#a39d90'; ell(c, x, yy, 3 + rnd() * 4, 2 + rnd() * 2.4); c.fill();
      }
      c.strokeStyle = 'rgba(80,58,32,.3)'; c.lineWidth = 2;
      [-14, 14].forEach((d) => { c.beginPath(); c.moveTo(150, y + d); c.lineTo(RIVER_X0 - 20, y + d); c.moveTo(RIVER_X1 + 20, y + d); c.lineTo(W - 150, y + d); c.stroke(); });
      for (let i = 0; i < 260; i += 1) {
        const x = (i % 2 ? 150 : RIVER_X1 + 20) + rnd() * (i % 2 ? RIVER_X0 - 190 : W - RIVER_X1 - 170);
        c.fillStyle = `rgba(${rnd() > 0.5 ? '130,100,60' : '210,185,140'},${0.25 + rnd() * 0.25})`; ell(c, x, y + (rnd() - 0.5) * 100, 2 + rnd() * 3, 1.2 + rnd() * 1.4); c.fill();
      }
    });

    // briznas de pasto
    for (let i = 0; i < 3800; i += 1) {
      const x = rnd() * W; const y = rnd() * H;
      if (x > RIVER_X0 - 12 && x < RIVER_X1 + 12) continue;
      const g = rnd();
      c.strokeStyle = g > 0.66 ? 'rgba(160,230,110,.55)' : g > 0.33 ? 'rgba(30,100,50,.5)' : 'rgba(90,170,70,.5)';
      c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (rnd() - 0.5) * 5, y - 5, x + (rnd() - 0.5) * 7, y - 8 - rnd() * 4); c.stroke();
    }
    // flores
    for (let i = 0; i < 160; i += 1) {
      const x = rnd() * W; const y = rnd() * H;
      if ((x > RIVER_X0 - 30 && x < RIVER_X1 + 30) || LANE_Y.some((ly) => Math.abs(y - ly) < 70)) continue;
      const col = ['#fef9c3', '#fbcfe8', '#fde68a', '#ffffff', '#c4b5fd'][Math.floor(rnd() * 5)];
      for (let p = 0; p < 5; p += 1) { c.fillStyle = col; c.beginPath(); c.arc(x + Math.cos(p * 1.26) * 2.4, y + Math.sin(p * 1.26) * 2.4, 1.7, 0, TAU); c.fill(); }
      c.fillStyle = '#f59e0b'; c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill();
    }

    // río
    c.fillStyle = grad(c, RIVER_X0, 0, RIVER_X1, 0, [[0, '#1d5a96'], [0.18, '#2f7fc4'], [0.5, '#4aa6ec'], [0.82, '#2f7fc4'], [1, '#1d5a96']]); c.fillRect(RIVER_X0 - 4, 0, RIVER_X1 - RIVER_X0 + 8, H);
    // orillas con barro y espuma
    [RIVER_X0 - 4, RIVER_X1 + 4].forEach((x, side) => {
      c.fillStyle = side ? 'rgba(90,70,40,.4)' : 'rgba(90,70,40,.4)';
      c.fillRect(side ? x : x - 10, 0, 10, H);
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2.4;
      c.beginPath(); for (let y = 0; y < H; y += 6) c.lineTo(x + (side ? -2 : 2) + Math.sin(y * 0.11) * 2.6, y); c.stroke();
    });
    // juncos y nenúfares
    for (let i = 0; i < 26; i += 1) {
      const y = rnd() * H; const left = rnd() > 0.5;
      if (LANE_Y.some((ly) => Math.abs(y - ly) < BRIDGE_HALF + 10)) continue;
      const x = left ? RIVER_X0 - 8 : RIVER_X1 + 8;
      c.strokeStyle = '#2f6b2a'; c.lineWidth = 2.2;
      for (let k = 0; k < 4; k += 1) { c.beginPath(); c.moveTo(x + k * 2, y); c.quadraticCurveTo(x + k * 3 - 4, y - 14, x + k * 4 - 6, y - 24); c.stroke(); }
      c.fillStyle = '#7a4f1d'; c.fillRect(x + 2, y - 22, 3, 8);
    }
    for (let i = 0; i < 12; i += 1) {
      const x = RIVER_X0 + 14 + rnd() * (RIVER_X1 - RIVER_X0 - 28); const y = rnd() * H;
      if (LANE_Y.some((ly) => Math.abs(y - ly) < BRIDGE_HALF + 6)) continue;
      c.fillStyle = '#3f9a4a'; ell(c, x, y, 9, 5); c.fill(); ink(c, 1.2); c.stroke();
      if (rnd() > 0.6) { c.fillStyle = '#fbcfe8'; c.beginPath(); c.arc(x, y - 1, 2.6, 0, TAU); c.fill(); }
    }

    // puentes de madera con barandillas
    LANE_Y.forEach((y) => {
      const x0 = RIVER_X0 - 26; const x1 = RIVER_X1 + 26; const top = y - BRIDGE_HALF; const bot = y + BRIDGE_HALF;
      c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, x0 + 4, top + 8, x1 - x0, bot - top, 8); c.fill();
      for (let yy = top; yy < bot; yy += 14) { // tablones
        const t = (yy - top) / (bot - top);
        c.fillStyle = grad(c, x0, yy, x1, yy, [[0, '#9a7545'], [0.5, '#b88d58'], [1, '#8a6a3d']]);
        rr(c, x0, yy, x1 - x0, 13, 2); c.fill(); ink(c, 1.4); c.stroke();
        c.strokeStyle = 'rgba(60,40,18,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + 8, yy + 6); c.lineTo(x1 - 8, yy + 6 + (t > 0.5 ? 1 : -1)); c.stroke();
      }
      // barandillas
      [top, bot - 8].forEach((yy) => {
        c.fillStyle = grad(c, x0, yy, x1, yy, [[0, '#7a5530'], [1, '#5a3d20']]); rr(c, x0 - 4, yy, x1 - x0 + 8, 8, 3); c.fill(); ink(c, 1.8); c.stroke();
        for (let x = x0; x <= x1; x += (x1 - x0) / 3) { c.fillStyle = '#6b4a28'; rr(c, x - 4, yy - 10, 8, 26, 3); c.fill(); ink(c, 1.6); c.stroke(); c.fillStyle = '#d1b07a'; c.beginPath(); c.arc(x, yy - 8, 3.4, 0, TAU); c.fill(); ink(c, 1); c.stroke(); }
      });
    });

    // árboles y rocas
    const tree = (x, y, sc) => {
      c.fillStyle = 'rgba(0,0,0,.26)'; ell(c, x + 8 * sc, y + 24 * sc, 30 * sc, 9 * sc); c.fill();
      cap(c, x, y + 24 * sc, x, y - 4 * sc, 11 * sc, '#6b4423', 'rgba(255,255,255,.15)');
      [[0, -26, 28, '#1f6b34'], [-17, -14, 21, '#238a3d'], [17, -14, 21, '#238a3d'], [0, -38, 22, '#2fa44a'], [-6, -44, 12, '#5cc46a']].forEach(([dx, dy, r, col]) => {
        c.beginPath(); c.arc(x + dx * sc, y + dy * sc, r * sc, 0, TAU);
        fillStroke(c, rgrad(c, x + (dx - 6) * sc, y + (dy - 8) * sc, 1, r * sc * 1.2, [[0, shade(col, 0.35)], [1, shade(col, -0.2)]]), 2);
      });
    };
    const rock = (x, y, sc) => {
      c.fillStyle = 'rgba(0,0,0,.26)'; ell(c, x + 4 * sc, y + 9 * sc, 20 * sc, 6 * sc); c.fill();
      c.beginPath(); c.moveTo(x - 18 * sc, y + 6 * sc); c.lineTo(x - 12 * sc, y - 10 * sc); c.lineTo(x + 4 * sc, y - 15 * sc); c.lineTo(x + 18 * sc, y - 4 * sc); c.lineTo(x + 16 * sc, y + 7 * sc); c.closePath();
      fillStroke(c, grad(c, x - 18 * sc, y - 15 * sc, x + 18 * sc, y + 8 * sc, [[0, '#cfc9bd'], [1, '#6b655a']]), 2);
    };
    const bush = (x, y, sc) => {
      [[-10, 0], [0, -6], [10, 0]].forEach(([dx, dy]) => { c.beginPath(); c.arc(x + dx * sc, y + dy * sc, 11 * sc, 0, TAU); fillStroke(c, rgrad(c, x + (dx - 3) * sc, y + (dy - 4) * sc, 1, 14 * sc, [[0, '#6fcf6b'], [1, '#2a7a35']]), 1.8); });
      c.fillStyle = '#f87171'; [[-6, -4], [4, -9], [10, 2]].forEach(([dx, dy]) => { c.beginPath(); c.arc(x + dx * sc, y + dy * sc, 2, 0, TAU); c.fill(); });
    };
    const props = [];
    for (let i = 0; i < 30; i += 1) {
      const top = rnd() < 0.5;
      const x = 40 + rnd() * (W - 80);
      if ((x > RIVER_X0 - 60 && x < RIVER_X1 + 60)) continue;
      const y = top ? 24 + rnd() * 80 : H - 26 - rnd() * 70;
      props.push([rnd() < 0.62 ? 'tree' : rnd() < 0.55 ? 'rock' : 'bush', x, y, 0.8 + rnd() * 0.5]);
    }
    for (let i = 0; i < 10; i += 1) { // un poco de decoración entre carriles
      const x = 380 + rnd() * 840; const y = H / 2 + (rnd() - 0.5) * 120;
      if (x > RIVER_X0 - 80 && x < RIVER_X1 + 80) continue;
      props.push([rnd() < 0.5 ? 'bush' : 'rock', x, y, 0.7 + rnd() * 0.4]);
    }
    props.sort((a, b) => a[2] === b[2] ? a[1] - b[1] : a[1] - b[1]).forEach(([kind, x, y, sc]) => { if (kind === 'tree') tree(x, y, sc); else if (kind === 'rock') rock(x, y, sc); else bush(x, y, sc); });

    // luz cálida y viñeta
    c.fillStyle = rgrad(c, W / 2, H * 0.42, H * 0.2, H * 0.95, [[0, 'rgba(255,240,200,.1)'], [1, 'rgba(10,20,30,.38)']]); c.fillRect(0, 0, W, H);
    return cv;
  }

  return {
    PR, META, WALK_FRAMES, ATTACK_FRAMES,
    drawUnit, getSheet, clearSheets, getCastle, clearCastles, buildBackground,
    util: { shade, rgba, mix, rgrad, grad, ell, rr, ink, star, TAU },
  };
}());

if (typeof window !== 'undefined') window.KingdomsArt = KingdomsArt;
