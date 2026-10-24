// Impresora de fotos: el "look" de cada foto impresa. Todo se dibuja en canvas 2D (sin depender de Three.js), asi la misma funcion
// sirve para la hoja del 3D, las fotos de las paredes y la vista previa del editor de estilos.
//
//   PhotoPrinterLooks.renderBlock(job, img, giftImg, { paper, shape, showName, showGift }) -> canvas (512 de ancho)
//
// `job.style` es un estilo ya resuelto (ver resolveStyle). Un estilo es lo que se elige por regalo, por monedas o por defecto.
(function () {
  const W = 512;
  const FONT = '"Poppins", "Segoe UI", system-ui, -apple-system, sans-serif';

  // ---------------------------------------------------------------- catalogo de opciones (el editor de estilos se arma con esto)

  const PAPER_THEMES = {
    white: { label: 'Blanco', bg: '#fbfbf8', ink: '#1d2230' },
    cream: { label: 'Crema', bg: '#f6ecd2', ink: '#3a2e18' },
    kraft: { label: 'Kraft', bg: '#d7b58a', ink: '#3b2713' },
    pink: { label: 'Rosa', bg: '#ffd3e4', ink: '#5b1a39' },
    mint: { label: 'Menta', bg: '#cdf3dd', ink: '#13452c' },
    blue: { label: 'Azul', bg: '#cfe6ff', ink: '#123a63' },
    grid: { label: 'Cuadriculado', bg: '#f6faff', ink: '#16315a', pattern: 'grid' },
    lined: { label: 'Rayado', bg: '#fffdf4', ink: '#1f2a4a', pattern: 'lined' },
    parchment: { label: 'Pergamino', bg: '#ecd9a8', ink: '#4a3417', pattern: 'parchment' },
    confetti: { label: 'Confeti', bg: '#fff8ef', ink: '#2a2140', pattern: 'confetti' },
    gradient: { label: 'Degradado', bg: '#ffc2dd', ink: '#2b1740', pattern: 'gradient' },
  };

  const CHOICES = {
    color: [['inherit', 'Sin cambio'], ['color', 'Color normal'], ['bw', 'Blanco y negro'], ['sepia', 'Sepia'], ['duotone', 'Dos tonos neón'], ['halftone', 'Puntitos (cómic)'], ['sketch', 'Dibujo a lápiz']],
    paper: [['inherit', 'Sin cambio']].concat(Object.keys(PAPER_THEMES).map((key) => [key, PAPER_THEMES[key].label])),
    frame: [['inherit', 'Sin cambio'], ['rounded', 'Cuadrada'], ['circle', 'Redonda'], ['polaroid', 'Polaroid'], ['gold', 'Dorado'], ['neon', 'Neón'], ['film', 'Tira de película'], ['stamp', 'Estampilla'], ['wanted', 'Se busca'], ['id', 'Carnet'], ['hearts', 'Corazones'], ['fire', 'Fuego'], ['snakes', 'Serpientes'], ['thorns', 'Rosas con espinas'], ['ice', 'Hielo'], ['lightning', 'Rayos']],
    size: [['inherit', 'Sin cambio'], ['small', 'Pequeña'], ['normal', 'Normal'], ['large', 'Grande'], ['huge', 'Enorme']],
    stamp: [['inherit', 'Sin cambio'], ['none', 'Sin sello'], ['vip', 'VIP'], ['top', 'TOP'], ['beauty', 'BELLEZA'], ['new', 'NUEVO'], ['love', 'LOVE'], ['fire', '¡FUEGO!']],
    sound: [['inherit', 'Sin cambio'], ['default', 'Campanita'], ['bell', 'Campana doble'], ['fanfare', 'Fanfarria'], ['coin', 'Moneda']],
  };
  const FLAGS = {
    ribbon: 'Cinta con el nombre del regalo',
    sparkles: 'Brillos y confeti',
    priority: 'Salta la cola de impresión',
    pinned: 'Foto fija en la pared (no se reemplaza)',
    zoom: 'Zoom de la cámara mientras se imprime',
    kiss: 'El personaje la toma y le da un beso (marca de labial)',
    tear: 'El personaje la toma y la rasga a la mitad',
  };
  const ENUM_KEYS = Object.keys(CHOICES);
  const FLAG_KEYS = Object.keys(FLAGS);

  // lo que significa "sin cambio" cuando ninguna capa dice nada
  const BASE = { color: 'color', paper: 'inherit', frame: 'inherit', size: 'normal', stamp: 'none', sound: 'default' };

  function neutralStyle() {
    const style = {};
    for (const key of ENUM_KEYS) style[key] = 'inherit';
    for (const key of FLAG_KEYS) style[key] = false;
    return style;
  }

  // limpia lo que venga del servidor o del usuario: lo invalido queda "sin cambio"
  function sanitizeStyle(raw) {
    const style = neutralStyle();
    const source = raw && typeof raw === 'object' ? raw : {};
    for (const key of ENUM_KEYS) {
      if (CHOICES[key].some(([value]) => value === source[key])) style[key] = source[key];
    }
    for (const key of FLAG_KEYS) style[key] = Boolean(source[key]);
    return style;
  }

  // junta capas (por defecto -> regalo -> monedas): cada capa pisa lo que elige; los interruptores se suman
  function resolveStyle(layers) {
    const effective = { ...BASE };
    for (const key of FLAG_KEYS) effective[key] = false;
    for (const layer of layers || []) {
      if (!layer) continue;
      for (const key of ENUM_KEYS) if (layer[key] && layer[key] !== 'inherit') effective[key] = layer[key];
      for (const key of FLAG_KEYS) if (layer[key]) effective[key] = true;
    }
    return effective;
  }

  // Las reglas de regalo son FIJAS: no se editan, solo se elige cual le toca a cada regalo.
  const EFFECTS = [
    { id: 'none', action: 'Imprime tu foto de perfil', label: 'Sin efecto (impresión normal)', style: {} },
    { id: 'wanted', short: 'Se busca', action: 'Tu foto en un cartel de "Se busca"', label: 'Cartel de "Se busca"', style: { frame: 'wanted' } },
    { id: 'top', short: 'TOP', action: 'Tu foto con el sello TOP', label: 'Sello TOP (rojo)', style: { stamp: 'top' } },
    { id: 'beauty', short: 'Belleza', action: 'Tu foto con el sello de Belleza', label: 'Sello Belleza (rojo)', style: { stamp: 'beauty' } },
    { id: 'fire', short: 'Fuego', action: 'Tu foto con un marco de fuego', label: 'Marco de fuego', style: { frame: 'fire' } },
    { id: 'snakes', short: 'Serpientes', action: 'Tu foto con un marco de serpientes', label: 'Marco de serpientes', style: { frame: 'snakes' } },
    { id: 'thorns', short: 'Rosas', action: 'Tu foto con un marco de rosas y espinas', label: 'Marco de rosas con espinas', style: { frame: 'thorns' } },
    { id: 'ice', short: 'Hielo', action: 'Tu foto con un marco de hielo', label: 'Marco de hielo', style: { frame: 'ice' } },
    { id: 'lightning', short: 'Rayos', action: 'Tu foto con un marco de rayos', label: 'Marco de rayos', style: { frame: 'lightning' } },
    { id: 'kiss', short: 'Beso', action: 'Te dan un beso en tu foto, con labial rojo', label: 'El personaje la toma, le da un beso y a los 1,3 s va a la pared', style: { kiss: true } },
    { id: 'tear', short: 'Rasgar', action: 'Rasgan tu foto a la mitad', label: 'El personaje la toma y la rasga a la mitad', style: { tear: true } },
  ];
  const EFFECT_IDS = EFFECTS.map((effect) => effect.id);

  function effectLabel(id) {
    const found = EFFECTS.find((effect) => effect.id === id);
    return found ? found.label : EFFECTS[0].label;
  }

  // el estilo ya resuelto de una regla fija
  function effectStyle(id) {
    const found = EFFECTS.find((effect) => effect.id === id);
    return resolveStyle([sanitizeStyle(found ? found.style : {})]);
  }

  function isNeutral(style) {
    const s = sanitizeStyle(style);
    return ENUM_KEYS.every((key) => s[key] === 'inherit') && FLAG_KEYS.every((key) => !s[key]);
  }

  function label(key, value) {
    const found = (CHOICES[key] || []).find(([v]) => v === value);
    return found ? found[1] : value;
  }

  // resumen corto de un estilo para mostrarlo junto al regalo ("Blanco y negro · Dorado · VIP")
  function describeStyle(style) {
    const s = sanitizeStyle(style);
    const parts = [];
    if (s.color !== 'inherit') parts.push(label('color', s.color));
    if (s.frame !== 'inherit') parts.push(label('frame', s.frame));
    if (s.paper !== 'inherit') parts.push(`Hoja ${label('paper', s.paper).toLowerCase()}`);
    if (s.size !== 'inherit') parts.push(`Foto ${label('size', s.size).toLowerCase()}`);
    if (s.stamp !== 'inherit') parts.push(s.stamp === 'none' ? 'Sin sello' : `Sello ${label('stamp', s.stamp)}`);
    for (const key of FLAG_KEYS) if (s[key]) parts.push(FLAGS[key].split(' (')[0]);
    if (s.sound !== 'inherit') parts.push(`Sonido: ${label('sound', s.sound).toLowerCase()}`);
    return parts.length ? parts.join(' · ') : 'Sin cambios';
  }

  // ---------------------------------------------------------------- utilidades de dibujo

  function rand(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) >>> 0;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashText(text) {
    let hash = 2166136261;
    for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return hash;
  }

  function roundRectPath(g, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + radius, y);
    g.arcTo(x + w, y, x + w, y + h, radius);
    g.arcTo(x + w, y + h, x, y + h, radius);
    g.arcTo(x, y + h, x, y, radius);
    g.arcTo(x, y, x + w, y, radius);
    g.closePath();
  }

  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // recorta la imagen para que llene un rectangulo (como object-fit: cover)
  function drawCoverRect(g, img, x, y, w, h) {
    const sw = img.naturalWidth || img.width || 1;
    const sh = img.naturalHeight || img.height || 1;
    const scale = Math.max(w / sw, h / sh);
    const cw = w / scale;
    const ch = h / scale;
    g.drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
  }

  function fitText(g, text, maxWidth) {
    if (g.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && g.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  function drawHeart(g, cx, cy, s, color) {
    g.save();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(cx, cy + s * 0.9);
    g.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.9, cy - s * 1.2, cx, cy - s * 0.35);
    g.bezierCurveTo(cx + s * 0.9, cy - s * 1.2, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9);
    g.fill();
    g.restore();
  }

  function drawStar(g, cx, cy, r, color) {
    g.save();
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const radius = i % 2 === 0 ? r : r * 0.28;
      const angle = (Math.PI / 4) * i - Math.PI / 2;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawCrown(g, cx, cy, w, h, fill, stroke) {
    g.save();
    g.beginPath();
    g.moveTo(cx - w / 2, cy + h / 2);
    g.lineTo(cx - w / 2, cy - h * 0.1);
    g.lineTo(cx - w * 0.25, cy + h * 0.15);
    g.lineTo(cx, cy - h / 2);
    g.lineTo(cx + w * 0.25, cy + h * 0.15);
    g.lineTo(cx + w / 2, cy - h * 0.1);
    g.lineTo(cx + w / 2, cy + h / 2);
    g.closePath();
    const gradient = g.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
    gradient.addColorStop(0, '#fff3a6');
    gradient.addColorStop(1, fill);
    g.fillStyle = gradient;
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = Math.max(2, h * 0.07);
    g.strokeStyle = stroke;
    g.stroke();
    g.fillStyle = '#e0306f';
    g.beginPath();
    g.arc(cx, cy + h * 0.18, h * 0.07, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawFold(g, h) {
    g.save();
    const crease = g.createLinearGradient(0, h - 16, 0, h);
    crease.addColorStop(0, 'rgba(0,0,0,0)');
    crease.addColorStop(0.6, 'rgba(0,0,0,0.06)');
    crease.addColorStop(1, 'rgba(255,255,255,0.35)');
    g.fillStyle = crease;
    g.fillRect(0, h - 16, W, 16);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(0, h - 1);
    g.lineTo(W, h - 1);
    g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- fondos de hoja

  function fillPaper(g, w, h, key) {
    const theme = PAPER_THEMES[key] || PAPER_THEMES.white;
    g.save();
    if (theme.pattern === 'gradient') {
      const gradient = g.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#ffc2dd');
      gradient.addColorStop(0.5, '#e7c8ff');
      gradient.addColorStop(1, '#b9e4ff');
      g.fillStyle = gradient;
    } else {
      g.fillStyle = theme.bg;
    }
    g.fillRect(0, 0, w, h);

    if (theme.pattern === 'grid') {
      g.strokeStyle = 'rgba(70,130,210,0.28)';
      g.lineWidth = 1.5;
      for (let x = 0; x <= w; x += 32) {
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, h);
        g.stroke();
      }
      for (let y = 0; y <= h; y += 32) {
        g.beginPath();
        g.moveTo(0, y + 0.5);
        g.lineTo(w, y + 0.5);
        g.stroke();
      }
    } else if (theme.pattern === 'lined') {
      g.strokeStyle = 'rgba(70,120,200,0.35)';
      g.lineWidth = 1.5;
      for (let y = 40; y <= h; y += 34) {
        g.beginPath();
        g.moveTo(0, y + 0.5);
        g.lineTo(w, y + 0.5);
        g.stroke();
      }
      g.strokeStyle = 'rgba(220,70,80,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(54.5, 0);
      g.lineTo(54.5, h);
      g.stroke();
    } else if (theme.pattern === 'parchment') {
      const random = rand(77);
      for (let i = 0; i < 70; i += 1) {
        const radial = g.createRadialGradient(random() * w, random() * h, 0, random() * w, random() * h, 40 + random() * 90);
        radial.addColorStop(0, random() < 0.5 ? 'rgba(150,100,40,0.16)' : 'rgba(255,240,200,0.18)');
        radial.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = radial;
        g.fillRect(0, 0, w, h);
      }
      const vignette = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(110,70,20,0.38)');
      g.fillStyle = vignette;
      g.fillRect(0, 0, w, h);
    } else if (theme.pattern === 'confetti') {
      const random = rand(1234);
      const colors = ['#ff3d9a', '#12b8ff', '#ffd400', '#4ade80', '#fb923c', '#a78bfa'];
      const pieces = Math.round((w * h) / 2600);
      for (let i = 0; i < pieces; i += 1) {
        g.save();
        g.translate(random() * w, random() * h);
        g.rotate(random() * Math.PI);
        g.fillStyle = colors[Math.floor(random() * colors.length)];
        g.globalAlpha = 0.75;
        if (random() < 0.45) {
          g.beginPath();
          g.arc(0, 0, 3 + random() * 4, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillRect(-3, -7, 6 + random() * 3, 14);
        }
        g.restore();
      }
    }
    g.restore();
  }

  // ---------------------------------------------------------------- tratamientos de color de la foto

  function coverCanvas(img, px) {
    const c = newCanvas(px, px);
    drawCoverRect(c.getContext('2d'), img, 0, 0, px, px);
    return c;
  }

  function lerpColor(stops, t) {
    const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i;
    return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f);
  }

  function treatPhoto(img, mode, px) {
    const base = coverCanvas(img, px);
    if (!mode || mode === 'color' || mode === 'inherit') return base;
    const g = base.getContext('2d');
    let imageData;
    try {
      imageData = g.getImageData(0, 0, px, px);
    } catch (error) {
      return base; // imagen de otro dominio: no se puede tocar, se deja en color
    }
    const d = imageData.data;
    const total = px * px;

    if (mode === 'bw' || mode === 'sepia' || mode === 'duotone') {
      const duo = [[18, 6, 58], [193, 59, 255], [111, 231, 255]];
      for (let i = 0; i < total; i += 1) {
        const r = d[i * 4];
        const gr = d[i * 4 + 1];
        const b = d[i * 4 + 2];
        const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
        if (mode === 'bw') {
          const v = Math.max(0, Math.min(255, (lum - 128) * 1.12 + 128));
          d[i * 4] = v;
          d[i * 4 + 1] = v;
          d[i * 4 + 2] = v;
        } else if (mode === 'sepia') {
          d[i * 4] = Math.min(255, 0.393 * r + 0.769 * gr + 0.189 * b);
          d[i * 4 + 1] = Math.min(255, 0.349 * r + 0.686 * gr + 0.168 * b);
          d[i * 4 + 2] = Math.min(255, 0.272 * r + 0.534 * gr + 0.131 * b);
        } else {
          const [rr, gg, bb] = lerpColor(duo, lum / 255);
          d[i * 4] = rr;
          d[i * 4 + 1] = gg;
          d[i * 4 + 2] = bb;
        }
      }
      g.putImageData(imageData, 0, 0);
      return base;
    }

    const gray = new Float32Array(total);
    for (let i = 0; i < total; i += 1) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

    if (mode === 'halftone') {
      const out = newCanvas(px, px);
      const og = out.getContext('2d');
      og.fillStyle = '#fffdf6';
      og.fillRect(0, 0, px, px);
      og.fillStyle = '#14161c';
      const cell = Math.max(5, Math.round(px / 48));
      for (let cy = 0; cy < px; cy += cell) {
        for (let cx = 0; cx < px; cx += cell) {
          let sum = 0;
          let count = 0;
          for (let sy = 0; sy < cell; sy += 2) {
            for (let sx = 0; sx < cell; sx += 2) {
              const yy = Math.min(px - 1, cy + sy);
              const xx = Math.min(px - 1, cx + sx);
              sum += gray[yy * px + xx];
              count += 1;
            }
          }
          const dark = 1 - sum / count / 255;
          const radius = cell * 0.72 * Math.pow(dark, 0.85);
          if (radius < 0.4) continue;
          og.beginPath();
          og.arc(cx + cell / 2, cy + cell / 2, radius, 0, Math.PI * 2);
          og.fill();
        }
      }
      return out;
    }

    if (mode === 'sketch') {
      for (let y = 0; y < px; y += 1) {
        for (let x = 0; x < px; x += 1) {
          const i = y * px + x;
          let edge = 255;
          if (x > 0 && y > 0 && x < px - 1 && y < px - 1) {
            const gx = -gray[i - px - 1] - 2 * gray[i - 1] - gray[i + px - 1] + gray[i - px + 1] + 2 * gray[i + 1] + gray[i + px + 1];
            const gy = -gray[i - px - 1] - 2 * gray[i - px] - gray[i - px + 1] + gray[i + px - 1] + 2 * gray[i + px] + gray[i + px + 1];
            edge = 255 - Math.min(255, Math.sqrt(gx * gx + gy * gy) * 1.5);
          }
          const shade = 0.62 + 0.38 * (gray[i] / 255);
          const v = Math.max(0, Math.min(255, edge * shade));
          d[i * 4] = v;
          d[i * 4 + 1] = v * 0.985;
          d[i * 4 + 2] = v * 0.94;
        }
      }
      g.putImageData(imageData, 0, 0);
      return base;
    }
    return base;
  }

  // ---------------------------------------------------------------- marcos creativos (fuego, serpientes, rosas con espinas, hielo, rayos)

  function insetPhoto(g, photo, x, y, size, inset, radius) {
    g.save();
    roundRectPath(g, x + inset, y + inset, size - inset * 2, size - inset * 2, radius);
    g.clip();
    g.drawImage(photo, x + inset, y + inset, size - inset * 2, size - inset * 2);
    g.restore();
  }

  // punto y direccion hacia afuera sobre el perimetro de un cuadrado (t de 0 a 4: arriba, derecha, abajo, izquierda)
  function perimeterPoint(x, y, s, t) {
    const side = Math.floor(t) % 4;
    const f = t - Math.floor(t);
    if (side === 0) return { px: x + f * s, py: y, nx: 0, ny: -1 };
    if (side === 1) return { px: x + s, py: y + f * s, nx: 1, ny: 0 };
    if (side === 2) return { px: x + s - f * s, py: y + s, nx: 0, ny: 1 };
    return { px: x, py: y + s - f * s, nx: -1, ny: 0 };
  }

  function seedFor(job, extra) {
    return (hashText(job && job.nickname ? job.nickname : 'x') + extra) >>> 0;
  }

  // ----- fuego: borde carbonizado con llamas en tres capas hacia afuera
  function frameFire(g, photo, x, y, size, job) {
    const random = rand(seedFor(job, 11));
    const inset = size * 0.13;
    const edge = inset * 0.62;
    g.save();
    frameShadow(g, 14, 4, 0.35);
    roundRectPath(g, x + edge, y + edge, size - edge * 2, size - edge * 2, size * 0.04);
    g.fillStyle = '#1b0d07';
    g.fill();
    g.restore();

    const flame = (bx, by, nx, ny, len, wid, depth, curl) => {
      const px = -ny;
      const py = nx;
      const tipX = bx + nx * len + px * curl;
      const tipY = by + ny * len + py * curl;
      const gradient = g.createLinearGradient(bx, by, tipX, tipY);
      if (depth === 0) {
        gradient.addColorStop(0, '#ff9a1a');
        gradient.addColorStop(0.55, '#f2500d');
        gradient.addColorStop(1, 'rgba(200,20,10,0.9)');
      } else if (depth === 1) {
        gradient.addColorStop(0, '#ffd23a');
        gradient.addColorStop(1, '#ff8a1a');
      } else {
        gradient.addColorStop(0, '#fffbe0');
        gradient.addColorStop(1, '#ffe36a');
      }
      g.fillStyle = gradient;
      g.beginPath();
      g.moveTo(bx - (px * wid) / 2, by - (py * wid) / 2);
      g.quadraticCurveTo(bx - px * wid * 0.55 + nx * len * 0.55 + px * curl * 0.4, by - py * wid * 0.55 + ny * len * 0.55 + py * curl * 0.4, tipX, tipY);
      g.quadraticCurveTo(bx + px * wid * 0.55 + nx * len * 0.5 + px * curl * 0.4, by + py * wid * 0.55 + ny * len * 0.5 + py * curl * 0.4, bx + (px * wid) / 2, by + (py * wid) / 2);
      g.closePath();
      g.fill();
    };

    const flames = [];
    const perSide = 11;
    for (let side = 0; side < 4; side += 1) {
      for (let k = 0; k < perSide; k += 1) {
        const t = side + (k + 0.5 + (random() - 0.5) * 0.4) / perSide;
        const p = perimeterPoint(x + edge, y + edge, size - edge * 2, t);
        flames.push({ bx: p.px, by: p.py, nx: p.nx, ny: p.ny, len: edge * (0.75 + random() * 0.75), wid: ((size - edge * 2) / perSide) * (1.5 + random() * 0.6), curl: (random() - 0.5) * edge * 0.9 });
      }
    }
    for (const [cx, cy, dx, dy] of [[0, 0, -1, -1], [1, 0, 1, -1], [0, 1, -1, 1], [1, 1, 1, 1]]) {
      flames.push({ bx: x + edge + cx * (size - edge * 2), by: y + edge + cy * (size - edge * 2), nx: dx * 0.7071, ny: dy * 0.7071, len: edge * 1.55, wid: edge * 1.7, curl: (random() - 0.5) * edge * 0.5 });
    }
    g.save();
    g.shadowColor = 'rgba(255,110,0,0.85)';
    g.shadowBlur = size * 0.03;
    for (const f of flames) flame(f.bx, f.by, f.nx, f.ny, f.len, f.wid, 0, f.curl);
    g.shadowColor = 'transparent';
    for (const f of flames) flame(f.bx, f.by, f.nx, f.ny, f.len * 0.72, f.wid * 0.62, 1, f.curl * 0.7);
    for (const f of flames) flame(f.bx, f.by, f.nx, f.ny, f.len * 0.45, f.wid * 0.34, 2, f.curl * 0.4);
    g.restore();

    g.save();
    g.strokeStyle = '#ff6a00';
    g.lineWidth = 2;
    g.shadowColor = '#ff7a00';
    g.shadowBlur = 8;
    roundRectPath(g, x + inset * 0.93, y + inset * 0.93, size - inset * 1.86, size - inset * 1.86, size * 0.025);
    g.stroke();
    g.restore();
    insetPhoto(g, photo, x, y, size, inset, size * 0.02);
  }

  // ----- serpientes: cuatro serpientes enroscadas que se persiguen alrededor de la foto
  function drawSnake(g, pts, width0, width1) {
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const f = i / (n - 1);
      const r = (width0 + (width1 - width0) * f) / 2;
      g.fillStyle = Math.floor(i / 3) % 2 ? '#2c8a3a' : '#3aad49';
      g.beginPath();
      g.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
      g.fill();
    }
    // dibujo de rombos en el lomo
    for (let i = 3; i < n - 3; i += 5) {
      const f = i / (n - 1);
      const r = ((width0 + (width1 - width0) * f) / 2) * 0.62;
      const dx = pts[i + 1].x - pts[i - 1].x;
      const dy = pts[i + 1].y - pts[i - 1].y;
      g.save();
      g.translate(pts[i].x, pts[i].y);
      g.rotate(Math.atan2(dy, dx));
      g.fillStyle = 'rgba(10,50,20,0.7)';
      g.beginPath();
      g.moveTo(-r, 0);
      g.lineTo(0, -r * 0.8);
      g.lineTo(r, 0);
      g.lineTo(0, r * 0.8);
      g.closePath();
      g.fill();
      g.restore();
    }
    // cabeza con ojos de rendija y lengua bifida
    const head = pts[n - 1];
    const prev = pts[n - 4];
    const angle = Math.atan2(head.y - prev.y, head.x - prev.x);
    const r = width0 / 2;
    g.save();
    g.translate(head.x, head.y);
    g.rotate(angle);
    g.strokeStyle = '#d6203a';
    g.lineWidth = Math.max(1.5, r * 0.18);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(r * 1.6, 0);
    g.lineTo(r * 2.7, 0);
    g.moveTo(r * 2.7, 0);
    g.lineTo(r * 3.2, -r * 0.4);
    g.moveTo(r * 2.7, 0);
    g.lineTo(r * 3.2, r * 0.4);
    g.stroke();
    g.fillStyle = '#44bd52';
    g.beginPath();
    g.ellipse(r * 0.5, 0, r * 1.7, r * 1.2, 0, 0, Math.PI * 2);
    g.fill();
    for (const side of [-1, 1]) {
      g.fillStyle = '#ffd93a';
      g.beginPath();
      g.arc(r * 0.8, side * r * 0.62, r * 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.fillRect(r * 0.8 - r * 0.04, side * r * 0.62 - r * 0.22, r * 0.08, r * 0.44);
    }
    g.restore();
  }

  function frameSnakes(g, photo, x, y, size, job) {
    const inset = size * 0.115;
    g.save();
    frameShadow(g, 18, 6, 0.32);
    roundRectPath(g, x, y, size, size, size * 0.05);
    g.fillStyle = '#0c1a10';
    g.fill();
    g.restore();
    const ring = size * 0.058;
    const random = rand(seedFor(job, 29));
    for (let k = 0; k < 4; k += 1) {
      const pts = [];
      const steps = 70;
      const phase = random() * 3;
      for (let i = 0; i <= steps; i += 1) {
        const u = i / steps;
        const p = perimeterPoint(x + ring, y + ring, size - ring * 2, k + 0.02 + u * 0.96);
        const wave = Math.sin(u * Math.PI * 6 + phase) * size * 0.014;
        pts.push({ x: p.px + p.nx * wave, y: p.py + p.ny * wave });
      }
      drawSnake(g, pts, size * 0.056, size * 0.012);
    }
    insetPhoto(g, photo, x, y, size, inset, size * 0.02);
  }

  // ----- rosas con espinas: enredadera con espinas, hojas y rosas rojas en las esquinas
  function drawRose(g, cx, cy, r) {
    g.save();
    for (const a of [-0.9, 0.9, 2.2, -2.2]) {
      g.fillStyle = '#2f9a49';
      g.save();
      g.translate(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, 0, r * 0.6, r * 0.26, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      g.fillStyle = '#b3091b';
      g.strokeStyle = '#6d0410';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, r * 0.58, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (let i = 0; i < 5; i += 1) {
      const a = 0.5 + (i / 5) * Math.PI * 2;
      g.fillStyle = '#d90f25';
      g.beginPath();
      g.arc(cx + Math.cos(a) * r * 0.24, cy + Math.sin(a) * r * 0.24, r * 0.42, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ee2b3f';
    g.beginPath();
    g.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8c0614';
    g.lineWidth = Math.max(1, r * 0.06);
    g.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const radius = r * 0.04 + (a / (Math.PI * 4)) * r * 0.3;
      const px = cx + Math.cos(a) * radius;
      const py = cy + Math.sin(a) * radius;
      if (a === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function frameThorns(g, photo, x, y, size, job) {
    const random = rand(seedFor(job, 41));
    const inset = size * 0.115;
    g.save();
    frameShadow(g, 18, 6, 0.32);
    roundRectPath(g, x, y, size, size, size * 0.05);
    g.fillStyle = '#0c1b12';
    g.fill();
    g.restore();
    const ring = size * 0.056;
    const point = (t) => {
      const p = perimeterPoint(x + ring, y + ring, size - ring * 2, t);
      const wave = Math.sin(t * Math.PI * 9) * size * 0.011;
      return { x: p.px + p.nx * wave, y: p.py + p.ny * wave, nx: p.nx, ny: p.ny };
    };
    // enredadera
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#1f6a33';
    g.lineWidth = size * 0.022;
    g.beginPath();
    for (let i = 0; i <= 260; i += 1) {
      const p = point((i / 260) * 4 - 0.001);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.stroke();
    g.strokeStyle = 'rgba(120,230,150,0.45)';
    g.lineWidth = size * 0.006;
    g.stroke();
    g.restore();
    // espinas y hojas
    for (let t = 0.03; t < 4; t += 0.065) {
      const p = point(t);
      const out = random() < 0.7 ? 1 : -1;
      const base = size * 0.017;
      const height = size * (0.024 + random() * 0.014);
      const sideX = -p.ny;
      const sideY = p.nx;
      g.fillStyle = '#6b2424';
      g.beginPath();
      g.moveTo(p.x - sideX * base, p.y - sideY * base);
      g.lineTo(p.x + p.nx * height * out, p.y + p.ny * height * out);
      g.lineTo(p.x + sideX * base, p.y + sideY * base);
      g.closePath();
      g.fill();
    }
    for (let t = 0.1; t < 4; t += 0.19) {
      const p = point(t);
      const out = random() < 0.5 ? 1 : -1;
      g.save();
      g.translate(p.x + p.nx * size * 0.02 * out, p.y + p.ny * size * 0.02 * out);
      g.rotate(Math.atan2(p.ny * out, p.nx * out) + (random() - 0.5) * 0.6);
      g.fillStyle = '#2f9a49';
      g.beginPath();
      g.ellipse(size * 0.02, 0, size * 0.034, size * 0.014, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    insetPhoto(g, photo, x, y, size, inset, size * 0.02);
    for (const t of [0, 1, 2, 3]) {
      const p = perimeterPoint(x + ring, y + ring, size - ring * 2, t);
      drawRose(g, p.px, p.py, size * 0.062);
    }
    for (const t of [0.5, 1.5, 2.5, 3.5]) {
      const p = perimeterPoint(x + ring, y + ring, size - ring * 2, t);
      drawRose(g, p.px, p.py, size * 0.042);
    }
  }

  // ----- hielo: marco de cristal con picos de escarcha hacia afuera
  function frameIce(g, photo, x, y, size, job) {
    const random = rand(seedFor(job, 53));
    const edge = size * 0.075;
    g.save();
    g.shadowColor = 'rgba(150,230,255,0.9)';
    g.shadowBlur = size * 0.04;
    const shards = 46;
    for (let i = 0; i < shards; i += 1) {
      const t = ((i + random() * 0.6) / shards) * 4;
      const p = perimeterPoint(x + edge * 0.5, y + edge * 0.5, size - edge, t);
      const height = size * (0.03 + random() * 0.05);
      const base = size * (0.03 + random() * 0.02);
      const sideX = -p.ny;
      const sideY = p.nx;
      const lean = (random() - 0.5) * base * 1.2;
      const tipX = p.px + p.nx * height + sideX * lean;
      const tipY = p.py + p.ny * height + sideY * lean;
      const gradient = g.createLinearGradient(p.px, p.py, tipX, tipY);
      gradient.addColorStop(0, '#f4ffff');
      gradient.addColorStop(1, '#69c3fa');
      g.fillStyle = gradient;
      g.beginPath();
      g.moveTo(p.px - sideX * base, p.py - sideY * base);
      g.lineTo(tipX, tipY);
      g.lineTo(p.px + sideX * base, p.py + sideY * base);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.moveTo(p.px - sideX * base, p.py - sideY * base);
      g.lineTo(tipX, tipY);
      g.lineTo(p.px, p.py);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.save();
    roundRectPath(g, x + edge * 0.5, y + edge * 0.5, size - edge, size - edge, size * 0.04);
    const band = g.createLinearGradient(x, y, x + size, y + size);
    band.addColorStop(0, '#effcff');
    band.addColorStop(0.35, '#8fd6ff');
    band.addColorStop(0.6, '#ffffff');
    band.addColorStop(1, '#6bbcf2');
    g.fillStyle = band;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(30,110,170,0.5)';
    g.stroke();
    g.restore();
    const inset = size * 0.1;
    insetPhoto(g, photo, x, y, size, inset, size * 0.02);
    g.save();
    roundRectPath(g, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.02);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2.5;
    g.stroke();
    g.restore();
    for (let i = 0; i < 9; i += 1) drawStar(g, x + random() * size, y + random() * size, 4 + random() * 7, 'rgba(255,255,255,0.95)');
  }

  // ----- rayos: marco oscuro con rayos electricos que recorren el borde
  function boltPoints(x1, y1, x2, y2, amplitude, random) {
    const segments = 16;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const px = -dy / length;
    const py = dx / length;
    const pts = [];
    for (let i = 0; i <= segments; i += 1) {
      const u = i / segments;
      const offset = (random() - 0.5) * 2 * amplitude * Math.sin(u * Math.PI);
      pts.push({ x: x1 + dx * u + px * offset, y: y1 + dy * u + py * offset });
    }
    return pts;
  }

  function strokeBolt(g, pts, width) {
    const trace = () => {
      g.beginPath();
      pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    };
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.shadowColor = '#5db4ff';
    g.shadowBlur = width * 4;
    g.strokeStyle = 'rgba(80,160,255,0.55)';
    g.lineWidth = width * 2.4;
    trace();
    g.stroke();
    g.shadowBlur = width * 2;
    g.strokeStyle = '#8fd0ff';
    g.lineWidth = width * 1.2;
    trace();
    g.stroke();
    g.shadowColor = 'transparent';
    g.strokeStyle = '#ffffff';
    g.lineWidth = width * 0.5;
    trace();
    g.stroke();
    g.restore();
  }

  function frameLightning(g, photo, x, y, size, job) {
    const random = rand(seedFor(job, 67));
    const inset = size * 0.1;
    g.save();
    g.shadowColor = 'rgba(80,170,255,0.9)';
    g.shadowBlur = size * 0.035;
    roundRectPath(g, x, y, size, size, size * 0.05);
    g.fillStyle = '#050818';
    g.fill();
    g.restore();
    g.save();
    g.lineWidth = Math.max(2, size * 0.01);
    g.strokeStyle = '#3fa0ff';
    roundRectPath(g, x + 1.5, y + 1.5, size - 3, size - 3, size * 0.05);
    g.stroke();
    g.restore();
    insetPhoto(g, photo, x, y, size, inset, size * 0.02);
    const lane = size * 0.05;
    const corners = [[x + lane, y + lane], [x + size - lane, y + lane], [x + size - lane, y + size - lane], [x + lane, y + size - lane]];
    for (let k = 0; k < 4; k += 1) {
      const [x1, y1] = corners[k];
      const [x2, y2] = corners[(k + 1) % 4];
      strokeBolt(g, boltPoints(x1, y1, x2, y2, size * 0.022, random), size * 0.0065);
    }
    // rayos que se escapan por las esquinas
    for (const [cx, cy, dx, dy] of [[0, 0, -1, -1], [1, 0, 1, -1], [0, 1, -1, 1], [1, 1, 1, 1]]) {
      const bx = x + lane + cx * (size - lane * 2);
      const by = y + lane + cy * (size - lane * 2);
      strokeBolt(g, boltPoints(bx, by, bx + dx * size * 0.09, by + dy * size * 0.09, size * 0.02, random), size * 0.005);
    }
  }

  // ---------------------------------------------------------------- marcos

  const FRAME_RATIO = { wanted: 1.3, id: 1.2 };
  const SIZES = { small: 250, normal: 332, large: 420, huge: 470 };

  function frameShadow(g, blur = 20, offset = 6, alpha = 0.3) {
    g.shadowColor = `rgba(0,0,0,${alpha})`;
    g.shadowBlur = blur;
    g.shadowOffsetY = offset;
  }

  function drawFrame(g, photo, x, y, size, frame, job) {
    g.save();
    if (frame === 'circle') {
      frameShadow(g, 20, 6, 0.28);
      g.beginPath();
      g.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.shadowColor = 'transparent';
      const inset = size * 0.023;
      g.beginPath();
      g.arc(x + size / 2, y + size / 2, size / 2 - inset, 0, Math.PI * 2);
      g.clip();
      g.drawImage(photo, x + inset, y + inset, size - inset * 2, size - inset * 2);
    } else if (frame === 'polaroid') {
      frameShadow(g, 22, 8, 0.3);
      roundRectPath(g, x, y, size, size, 6);
      g.fillStyle = '#fff';
      g.fill();
      g.shadowColor = 'transparent';
      const inset = size * 0.051;
      roundRectPath(g, x + inset, y + inset, size - inset * 2, size - inset * 2, 4);
      g.clip();
      g.drawImage(photo, x + inset, y + inset, size - inset * 2, size - inset * 2);
    } else if (frame === 'gold') {
      const b = size * 0.055;
      frameShadow(g, 22, 8, 0.35);
      roundRectPath(g, x, y, size, size, size * 0.05);
      const gold = g.createLinearGradient(x, y, x + size, y + size);
      gold.addColorStop(0, '#fff3b0');
      gold.addColorStop(0.25, '#d9a21c');
      gold.addColorStop(0.5, '#fff0a0');
      gold.addColorStop(0.75, '#b57a10');
      gold.addColorStop(1, '#f6d66a');
      g.fillStyle = gold;
      g.fill();
      g.shadowColor = 'transparent';
      roundRectPath(g, x + b * 0.5, y + b * 0.5, size - b, size - b, size * 0.035);
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(80,50,5,0.7)';
      g.stroke();
      g.save();
      roundRectPath(g, x + b, y + b, size - b * 2, size - b * 2, size * 0.02);
      g.clip();
      g.drawImage(photo, x + b, y + b, size - b * 2, size - b * 2);
      g.restore();
      roundRectPath(g, x + b, y + b, size - b * 2, size - b * 2, size * 0.02);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(70,40,0,0.85)';
      g.stroke();
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const cx = x + b * 0.5 + sx * (size - b);
        const cy = y + b * 0.5 + sy * (size - b);
        const stud = g.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, b * 0.5);
        stud.addColorStop(0, '#fffbe0');
        stud.addColorStop(1, '#8a5a08');
        g.fillStyle = stud;
        g.beginPath();
        g.arc(cx, cy, b * 0.42, 0, Math.PI * 2);
        g.fill();
      }
    } else if (frame === 'neon') {
      const inset = size * 0.04;
      g.shadowColor = '#3fe0ff';
      g.shadowBlur = 30;
      roundRectPath(g, x, y, size, size, size * 0.06);
      g.fillStyle = '#07091a';
      g.fill();
      g.shadowColor = 'transparent';
      g.save();
      roundRectPath(g, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.04);
      g.clip();
      g.drawImage(photo, x + inset, y + inset, size - inset * 2, size - inset * 2);
      g.restore();
      g.lineWidth = Math.max(3, size * 0.016);
      g.strokeStyle = '#7ff0ff';
      g.shadowColor = '#3fe0ff';
      g.shadowBlur = 18;
      roundRectPath(g, x + 1, y + 1, size - 2, size - 2, size * 0.06);
      g.stroke();
      g.lineWidth = Math.max(2, size * 0.01);
      g.strokeStyle = '#ff7ac4';
      g.shadowColor = '#ff3d9a';
      g.shadowBlur = 16;
      roundRectPath(g, x + inset * 0.55, y + inset * 0.55, size - inset * 1.1, size - inset * 1.1, size * 0.05);
      g.stroke();
    } else if (frame === 'film') {
      const border = size * 0.12;
      frameShadow(g, 20, 6, 0.32);
      roundRectPath(g, x, y, size, size, size * 0.04);
      g.fillStyle = '#0e0f12';
      g.fill();
      g.shadowColor = 'transparent';
      g.save();
      const ax = x + size * 0.035;
      const ay = y + border;
      const aw = size * 0.93;
      const ah = size - border * 2;
      roundRectPath(g, ax, ay, aw, ah, 4);
      g.clip();
      drawCoverRect(g, photo, ax, ay, aw, ah);
      g.restore();
      g.fillStyle = '#efeee6';
      const holes = 10;
      const hw = size * 0.052;
      const hh = size * 0.05;
      for (let i = 0; i < holes; i += 1) {
        const hx = x + size * 0.04 + (i + 0.5) * ((size * 0.92) / holes) - hw / 2;
        roundRectPath(g, hx, y + (border - hh) / 2, hw, hh, 3);
        g.fill();
        roundRectPath(g, hx, y + size - border + (border - hh) / 2, hw, hh, 3);
        g.fill();
      }
      g.fillStyle = 'rgba(255,190,60,0.85)';
      g.font = `700 ${Math.round(size * 0.035)}px ${FONT}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('▶ 24A', x + size * 0.05, y + size - border * 0.5 + size * 0.055);
    } else if (frame === 'stamp') {
      const mask = newCanvas(size, size);
      const mg = mask.getContext('2d');
      mg.fillStyle = '#fffdf6';
      mg.fillRect(0, 0, size, size);
      mg.globalCompositeOperation = 'destination-out';
      const bite = size * 0.026;
      const step = bite * 2.7;
      for (let p = step / 2; p < size; p += step) {
        for (const [bx, by] of [[p, 0], [p, size], [0, p], [size, p]]) {
          mg.beginPath();
          mg.arc(bx, by, bite, 0, Math.PI * 2);
          mg.fill();
        }
      }
      frameShadow(g, 16, 5, 0.3);
      g.drawImage(mask, x, y);
      g.shadowColor = 'transparent';
      const inset = size * 0.075;
      g.strokeStyle = 'rgba(40,40,60,0.45)';
      g.lineWidth = 1.5;
      g.strokeRect(x + inset * 0.6, y + inset * 0.6, size - inset * 1.2, size - inset * 1.2);
      g.save();
      g.beginPath();
      g.rect(x + inset, y + inset, size - inset * 2, size - inset * 2);
      g.clip();
      g.drawImage(photo, x + inset, y + inset, size - inset * 2, size - inset * 2);
      g.restore();
    } else if (frame === 'wanted') {
      const h = size * FRAME_RATIO.wanted;
      frameShadow(g, 20, 6, 0.32);
      roundRectPath(g, x, y, size, h, size * 0.02);
      const paper = g.createLinearGradient(x, y, x, y + h);
      paper.addColorStop(0, '#ecd8a4');
      paper.addColorStop(1, '#d6b87c');
      g.fillStyle = paper;
      g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = '#3a2410';
      g.lineWidth = size * 0.02;
      g.strokeRect(x + size * 0.02, y + size * 0.02, size - size * 0.04, h - size * 0.04);
      g.lineWidth = 1.5;
      g.strokeRect(x + size * 0.045, y + size * 0.045, size - size * 0.09, h - size * 0.09);
      g.fillStyle = '#3a2410';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${Math.round(size * 0.15)}px Georgia, "Times New Roman", serif`;
      g.fillText('SE BUSCA', x + size / 2, y + size * 0.15);
      const side = size * 0.78;
      const px = x + (size - side) / 2;
      const py = y + size * 0.255;
      g.fillStyle = '#1b1208';
      g.fillRect(px - 5, py - 5, side + 10, side + 10);
      g.drawImage(photo, px, py, side, side);
      g.fillStyle = 'rgba(120,80,30,0.2)';
      g.fillRect(px, py, side, side);
      g.fillStyle = '#3a2410';
      g.font = `800 ${Math.round(size * 0.055)}px Georgia, "Times New Roman", serif`;
      g.fillText('RECOMPENSA', x + size / 2, y + size * 1.1);
      g.font = `900 ${Math.round(size * 0.075)}px Georgia, "Times New Roman", serif`;
      g.fillText(job && job.coins > 0 ? `${job.coins} MONEDAS` : '★ ★ ★', x + size / 2, y + size * 1.2);
    } else if (frame === 'id') {
      const h = size * FRAME_RATIO.id;
      frameShadow(g, 20, 6, 0.3);
      roundRectPath(g, x, y, size, h, size * 0.05);
      g.fillStyle = '#ffffff';
      g.fill();
      g.shadowColor = 'transparent';
      g.save();
      roundRectPath(g, x, y, size, h, size * 0.05);
      g.clip();
      const band = g.createLinearGradient(x, y, x + size, y);
      band.addColorStop(0, '#12b8ff');
      band.addColorStop(1, '#9a5cff');
      g.fillStyle = band;
      g.fillRect(x, y, size, size * 0.155);
      g.restore();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${Math.round(size * 0.058)}px ${FONT}`;
      g.fillText('INTERAKTIK · VIP PASS', x + size / 2, y + size * 0.08);
      const side = size * 0.8;
      const px = x + (size - side) / 2;
      const py = y + size * 0.2;
      roundRectPath(g, px, py, side, side, size * 0.03);
      g.save();
      g.clip();
      g.drawImage(photo, px, py, side, side);
      g.restore();
      const random = rand(hashText(job && job.nickname));
      g.fillStyle = '#14161c';
      let bx = x + size * 0.1;
      const barTop = y + size * 1.04;
      while (bx < x + size * 0.9) {
        const bw = 1.5 + random() * 4;
        g.fillRect(bx, barTop, bw, size * 0.12);
        bx += bw + 1.5 + random() * 3;
      }
    } else if (frame === 'fire') {
      frameFire(g, photo, x, y, size, job);
    } else if (frame === 'snakes') {
      frameSnakes(g, photo, x, y, size, job);
    } else if (frame === 'thorns') {
      frameThorns(g, photo, x, y, size, job);
    } else if (frame === 'ice') {
      frameIce(g, photo, x, y, size, job);
    } else if (frame === 'lightning') {
      frameLightning(g, photo, x, y, size, job);
    } else if (frame === 'hearts') {
      frameShadow(g, 20, 6, 0.28);
      roundRectPath(g, x, y, size, size, size * 0.07);
      g.fillStyle = '#ff9ec7';
      g.fill();
      g.shadowColor = 'transparent';
      const b = size * 0.06;
      g.save();
      roundRectPath(g, x + b, y + b, size - b * 2, size - b * 2, size * 0.04);
      g.clip();
      g.drawImage(photo, x + b, y + b, size - b * 2, size - b * 2);
      g.restore();
      const perSide = 7;
      const colors = ['#e0306f', '#ff5c8a', '#fff'];
      let n = 0;
      for (let i = 0; i < perSide; i += 1) {
        const t = (i + 0.5) / perSide;
        const along = size * (0.05 + t * 0.9);
        const hs = size * 0.028;
        drawHeart(g, x + along, y + b * 0.5, hs, colors[n++ % 3]);
        drawHeart(g, x + along, y + size - b * 0.5, hs, colors[n++ % 3]);
        drawHeart(g, x + b * 0.5, y + along, hs, colors[n++ % 3]);
        drawHeart(g, x + size - b * 0.5, y + along, hs, colors[n++ % 3]);
      }
    } else {
      // cuadrada con esquinas redondeadas
      frameShadow(g, 20, 6, 0.3);
      roundRectPath(g, x, y, size, size, size * 0.06);
      g.fillStyle = '#000';
      g.fill();
      g.shadowColor = 'transparent';
      roundRectPath(g, x, y, size, size, size * 0.06);
      g.clip();
      g.drawImage(photo, x, y, size, size);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- decoraciones

  const STAMPS = {
    vip: { text: 'VIP', color: '#7a1fa2', scale: 1, cx: 0.8, cy: 0.16 },
    top: { text: 'TOP', color: '#d1242f', scale: 1.7, cx: 0.69, cy: 0.21 },
    beauty: { text: 'BELLEZA', color: '#d1242f', scale: 1.05, cx: 0.62, cy: 0.17 },
    new: { text: 'NUEVO', color: '#1e9e57', scale: 1, cx: 0.8, cy: 0.16 },
    love: { text: 'LOVE', color: '#e0306f', scale: 1, cx: 0.8, cy: 0.16 },
    fire: { text: '¡FUEGO!', color: '#e8590c', scale: 1, cx: 0.78, cy: 0.16 },
  };

  function drawStamp(g, kind, x, y, size) {
    const stamp = STAMPS[kind];
    if (!stamp) return;
    const k = stamp.scale;
    g.save();
    g.translate(x + size * stamp.cx, y + size * stamp.cy);
    g.rotate(0.22);
    g.globalAlpha = 0.92;
    g.font = `900 ${Math.round(size * 0.115 * k)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = g.measureText(stamp.text).width + size * 0.12 * k;
    const h = size * 0.17 * k;
    g.strokeStyle = stamp.color;
    g.fillStyle = stamp.color;
    g.lineWidth = size * 0.014 * k;
    roundRectPath(g, -w / 2, -h / 2, w, h, size * 0.025 * k);
    g.stroke();
    g.lineWidth = size * 0.005 * k;
    roundRectPath(g, -w / 2 + size * 0.016 * k, -h / 2 + size * 0.016 * k, w - size * 0.032 * k, h - size * 0.032 * k, size * 0.018 * k);
    g.stroke();
    g.fillText(stamp.text, 0, size * 0.005 * k);
    g.restore();
  }

  function drawRibbon(g, text, x, y, frameH, size) {
    const bandH = size * 0.15;
    const top = y + frameH - size * 0.2;
    const left = x - size * 0.05;
    const width = size * 1.1;
    const tail = size * 0.045;
    g.save();
    frameShadow(g, 10, 4, 0.3);
    g.fillStyle = '#9e1c33';
    g.beginPath();
    g.moveTo(left - tail, top + tail);
    g.lineTo(left + tail * 0.6, top + tail);
    g.lineTo(left + tail * 0.6, top + bandH + tail);
    g.lineTo(left - tail, top + bandH + tail);
    g.lineTo(left - tail * 0.2, top + bandH / 2 + tail);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(left + width + tail, top + tail);
    g.lineTo(left + width - tail * 0.6, top + tail);
    g.lineTo(left + width - tail * 0.6, top + bandH + tail);
    g.lineTo(left + width + tail, top + bandH + tail);
    g.lineTo(left + width + tail * 0.2, top + bandH / 2 + tail);
    g.closePath();
    g.fill();
    const gradient = g.createLinearGradient(0, top, 0, top + bandH);
    gradient.addColorStop(0, '#ff5470');
    gradient.addColorStop(1, '#c4223f');
    g.fillStyle = gradient;
    g.fillRect(left, top, width, bandH);
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.moveTo(left, top + bandH);
    g.lineTo(left + tail * 0.6, top + bandH);
    g.lineTo(left + tail * 0.6, top + bandH + tail);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(left + width, top + bandH);
    g.lineTo(left + width - tail * 0.6, top + bandH);
    g.lineTo(left + width - tail * 0.6, top + bandH + tail);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(size * 0.07)}px ${FONT}`;
    g.fillText(fitText(g, text, width - size * 0.2), left + width / 2, top + bandH / 2 + 1);
    g.restore();
  }

  function drawSparkles(g, x, y, size, frameH, seedText) {
    const random = rand(hashText(seedText || 'x'));
    const colors = ['#ffd400', '#ffffff', '#ff7ac4', '#7ff0ff'];
    g.save();
    for (let i = 0; i < 22; i += 1) {
      const px = x - size * 0.1 + random() * size * 1.2;
      const py = y - size * 0.08 + random() * (frameH + size * 0.16);
      const color = colors[Math.floor(random() * colors.length)];
      const r = 5 + random() * 13;
      if (i % 3 === 0) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(px, py, r * 0.3, 0, Math.PI * 2);
        g.fill();
      } else if (i % 3 === 1) {
        g.save();
        g.translate(px, py);
        g.rotate(random() * 3);
        g.fillStyle = color;
        g.fillRect(-r * 0.2, -r * 0.5, r * 0.4, r);
        g.restore();
      } else {
        g.shadowColor = color;
        g.shadowBlur = 8;
        drawStar(g, px, py, r, color);
        g.shadowBlur = 0;
      }
    }
    g.restore();
  }

  function drawMedal(g, x, y, size) {
    const r = size * 0.095;
    const cx = x + size * 0.085;
    const cy = y + size * 0.14;
    g.save();
    frameShadow(g, 10, 3, 0.4);
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.moveTo(cx - r * 0.7, cy + r * 0.4);
    g.lineTo(cx - r * 0.2, cy + r * 1.9);
    g.lineTo(cx, cy + r * 1.5);
    g.lineTo(cx + r * 0.2, cy + r * 1.9);
    g.lineTo(cx + r * 0.7, cy + r * 0.4);
    g.closePath();
    g.fill();
    const gold = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    gold.addColorStop(0, '#fffbd0');
    gold.addColorStop(0.55, '#f2c230');
    gold.addColorStop(1, '#b57a10');
    g.fillStyle = gold;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = r * 0.12;
    g.strokeStyle = '#8a5a08';
    g.stroke();
    g.fillStyle = '#6b4300';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${Math.round(r * 0.95)}px ${FONT}`;
    g.fillText('#1', cx, cy + r * 0.08);
    drawCrown(g, cx, cy - r * 1.2, r * 1.5, r * 0.85, '#f2c230', '#8a5a08');
    g.restore();
  }

  // Marca de labial: dos labios con arco de cupido, vetas y un borde corrido. `progress` (0..1) la hace aparecer con un "sello".
  function drawKissMark(g, cx, cy, width, progress = 1, seed = 1) {
    if (progress <= 0) return;
    const random = rand(seed >>> 0 || 7);
    const w = width;
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.26);
    const pop = 1 + (1 - Math.min(1, progress)) * 0.35;
    g.scale(pop, pop);
    g.globalAlpha = Math.min(1, progress * 1.7) * 0.9;
    const lips = new Path2D();
    lips.moveTo(-w * 0.5, 0);
    lips.bezierCurveTo(-w * 0.42, -w * 0.2, -w * 0.23, -w * 0.26, -w * 0.1, -w * 0.17);
    lips.quadraticCurveTo(0, -w * 0.09, w * 0.1, -w * 0.17);
    lips.bezierCurveTo(w * 0.23, -w * 0.26, w * 0.42, -w * 0.2, w * 0.5, 0);
    lips.bezierCurveTo(w * 0.44, w * 0.27, w * 0.18, w * 0.35, 0, w * 0.35);
    lips.bezierCurveTo(-w * 0.18, w * 0.35, -w * 0.44, w * 0.27, -w * 0.5, 0);
    lips.closePath();
    // el labial se corre un poco por los bordes
    g.shadowColor = 'rgba(190,10,50,0.55)';
    g.shadowBlur = w * 0.045;
    g.fillStyle = 'rgba(196,16,56,0.9)';
    g.fill(lips);
    g.shadowColor = 'transparent';
    g.save();
    g.clip(lips);
    // vetas de los labios y brillo desigual
    for (let i = 0; i < 46; i += 1) {
      const x = (random() - 0.5) * w;
      g.strokeStyle = random() < 0.55 ? 'rgba(110,4,30,0.28)' : 'rgba(255,120,150,0.2)';
      g.lineWidth = 0.6 + random() * 1.4;
      g.beginPath();
      g.moveTo(x, -w * 0.3);
      g.quadraticCurveTo(x + (random() - 0.5) * w * 0.05, 0, x * 1.05, w * 0.38);
      g.stroke();
    }
    const shine = g.createRadialGradient(-w * 0.12, -w * 0.06, 0, -w * 0.12, -w * 0.06, w * 0.3);
    shine.addColorStop(0, 'rgba(255,160,185,0.35)');
    shine.addColorStop(1, 'rgba(255,160,185,0)');
    g.fillStyle = shine;
    g.fillRect(-w * 0.5, -w * 0.3, w, w * 0.7);
    g.restore();
    // linea entre los labios
    g.strokeStyle = 'rgba(100,0,26,0.85)';
    g.lineWidth = Math.max(1.5, w * 0.012);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-w * 0.48, w * 0.005);
    g.quadraticCurveTo(-w * 0.2, w * 0.075, 0, w * 0.045);
    g.quadraticCurveTo(w * 0.2, w * 0.075, w * 0.48, w * 0.005);
    g.stroke();
    // manchitas sueltas
    g.fillStyle = 'rgba(196,16,56,0.55)';
    for (let i = 0; i < 6; i += 1) {
      const angle = random() * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(angle) * w * (0.52 + random() * 0.08), Math.sin(angle) * w * (0.3 + random() * 0.08), 0.8 + random() * 2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // ---------------------------------------------------------------- la foto completa

  function renderBlock(job, img, giftImg, globals) {
    const options = globals || {};
    const style = job.style || resolveStyle([]);
    const customPaper = style.paper && style.paper !== 'inherit' && PAPER_THEMES[style.paper];
    const paperKey = customPaper ? style.paper : (PAPER_THEMES[options.paper] ? options.paper : 'white');
    const theme = PAPER_THEMES[paperKey];
    const frame = style.frame && style.frame !== 'inherit' ? style.frame : options.shape || 'rounded';
    const size = SIZES[style.size] || SIZES.normal;
    const photoPx = Math.min(420, Math.round(size * 1.1));
    const frameH = Math.round(size * (FRAME_RATIO[frame] || 1));
    const showName = options.showName !== false && job.nickname;
    const showGift = options.showGift !== false && job.giftName && !style.ribbon;
    const nameH = showName ? 58 : 0;
    const giftH = showGift ? 44 : 0;
    const captionH = nameH + giftH;
    const h = 26 + frameH + (captionH ? 20 + captionH : 0) + 30;

    const c = newCanvas(W, h);
    const g = c.getContext('2d');
    if (customPaper) fillPaper(g, W, h, paperKey);

    const photo = treatPhoto(img, style.color, photoPx);
    const x = (W - size) / 2;
    const y = 26;
    drawFrame(g, photo, x, y, size, frame, job);
    if (style.sparkles) drawSparkles(g, x, y, size, frameH, job.nickname);
    if (style.stamp && style.stamp !== 'none') drawStamp(g, style.stamp, x, y, size);
    if (style.ribbon) drawRibbon(g, `${job.giftName || 'Regalo'}${job.count > 1 ? ` ×${job.count}` : ''}`, x, y, frameH, size);
    if (job.isTop) drawMedal(g, x, y, size);

    g.fillStyle = theme.ink;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    let cursor = 26 + frameH + 20;
    if (showName) {
      g.font = `800 46px ${FONT}`;
      g.fillText(fitText(g, job.nickname, W - 130), W / 2, cursor + 42);
      cursor += nameH;
    }
    if (showGift) {
      g.font = `700 27px ${FONT}`;
      g.globalAlpha = 0.82;
      const text = fitText(g, `${job.giftName}${job.count > 1 ? ` ×${job.count}` : ''}`, W - 190);
      const textWidth = g.measureText(text).width;
      const iconSize = giftImg ? 32 : 0;
      const total = textWidth + (giftImg ? iconSize + 10 : 0);
      let textX = (W - total) / 2;
      if (giftImg) {
        g.drawImage(giftImg, textX, cursor + 4, iconSize, iconSize);
        textX += iconSize + 10;
      }
      g.textAlign = 'left';
      g.fillText(text, textX, cursor + 30);
      g.globalAlpha = 1;
    }
    drawFold(g, h);
    return c;
  }

  window.PhotoPrinterLooks = {
    WIDTH: W,
    PAPER_THEMES,
    CHOICES,
    FLAGS,
    ENUM_KEYS,
    FLAG_KEYS,
    neutralStyle,
    sanitizeStyle,
    resolveStyle,
    isNeutral,
    describeStyle,
    EFFECTS,
    EFFECT_IDS,
    effectLabel,
    effectStyle,
    renderBlock,
    drawFold,
    drawKissMark,
    hashText,
    drawCrown,
    drawStar,
    fitText,
    roundRectPath,
    drawCoverRect,
  };
})();
