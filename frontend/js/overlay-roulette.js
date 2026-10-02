// Overlay de ruleta. Pagina pensada para pegarse como "Browser Source" en
// OBS/Streamlabs/TikTok LIVE Studio. Sin login: se identifica con la
// overlay_key de la URL. Recibe los regalos de CUALQUIER juego que el
// streamer tenga conectado (ver GET /events/overlay) y gira cuando llega uno
// de los regalos configurados en la ruleta.

const rootEl = document.getElementById('rouletteRoot');
const titleEl = document.getElementById('rouletteTitle');
const stageEl = document.getElementById('wheelStage');
const canvas = document.getElementById('wheelCanvas');
const resultEl = document.getElementById('rouletteResult');
const resultLabelEl = document.getElementById('resultLabel');
const resultDetailEl = document.getElementById('resultDetail');
const ctx = canvas.getContext('2d');

const TWO_PI = Math.PI * 2;
const MAX_SPINS_PER_GIFT = 10;
const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

const DEMO_OPTIONS = [
  { label: 'Premio 1', color: '#7c5cff' },
  { label: 'Premio 2', color: '#22d3ee' },
  { label: 'Premio 3', color: '#f472b6' },
  { label: 'Premio 4', color: '#fbbf24' },
  { label: 'Premio 5', color: '#4ade80' },
  { label: 'Premio 6', color: '#fb923c' },
];
const DEMO_SENDERS = ['María', 'Carlos', 'Sofía', 'Andrés', 'Valentina'];

let rouletteConfig = {
  enabled: true,
  title: 'Ruleta',
  spinSeconds: 6,
  resultSeconds: 5,
  sound: 'none',
  spinPerGift: false,
  options: [],
  giftRules: [],
};

let rotation = 0;
let highlightIndex = -1;
let canvasSize = 0;
let processing = false;
const spinQueue = [];

function getOverlayKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function isDemoMode() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// En la vista previa (demo) sin opciones suficientes se usan opciones de
// ejemplo; en el overlay real se respeta lo que configuró el streamer.
function getOptions() {
  const options = rouletteConfig.options || [];
  if (options.length >= 2) return options;
  return isDemoMode() ? DEMO_OPTIONS : options;
}

// ---------- Sonido ----------
let audioContext = null;
let lastTickAt = 0;

function playTick() {
  if (isDemoMode()) return;

  const now = performance.now();
  if (now - lastTickAt < 45) return;
  lastTickAt = now;

  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();

    const start = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(980, start);
    gain.gain.setValueAtTime(0.07, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.06);
  } catch (_error) {
    // Sin Web Audio disponible la ruleta gira igual, solo sin el "tic".
  }
}

// ---------- Dibujo ----------
function resolveTextColor(hex) {
  const value = String(hex || '#7c5cff').replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) || 0;
  const g = parseInt(value.slice(2, 4), 16) || 0;
  const b = parseInt(value.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0b1020' : '#ffffff';
}

function fitText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

// Reparte el texto de una opción: una línea si cabe; si no, dos líneas
// (cortando en el espacio que deje las mitades más parejas) y, como último
// recurso, letra más pequeña y "…" al final.
function layoutLabel(label, fontSize, maxWidth, arcHeight) {
  ctx.font = `800 ${fontSize}px ${FONT_FAMILY}`;
  const singleWidth = ctx.measureText(label).width;
  if (singleWidth <= maxWidth) return { lines: [label], size: fontSize };

  const words = label.split(/\s+/).filter(Boolean);
  if (words.length > 1 && arcHeight >= fontSize * 2.2) {
    let best = null;
    for (let cut = 1; cut < words.length; cut += 1) {
      const first = words.slice(0, cut).join(' ');
      const second = words.slice(cut).join(' ');
      const widest = Math.max(ctx.measureText(first).width, ctx.measureText(second).width);
      if (!best || widest < best.widest) best = { lines: [first, second], widest };
    }

    const size = best.widest > maxWidth
      ? Math.max(fontSize * 0.75, fontSize * (maxWidth / best.widest))
      : fontSize;
    return { lines: best.lines, size };
  }

  return { lines: [label], size: Math.max(fontSize * 0.7, fontSize * (maxWidth / singleWidth)) };
}

function drawWheel() {
  const size = canvasSize;
  if (!size) return;

  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const options = getOptions();
  const cx = size / 2;
  const cy = size / 2 + size * 0.02;
  const radius = size * 0.42;

  // Aro exterior
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = size * 0.03;
  ctx.shadowOffsetY = size * 0.012;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + size * 0.03, 0, TWO_PI);
  ctx.fillStyle = '#0d1222';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius + size * 0.03, 0, TWO_PI);
  ctx.lineWidth = size * 0.004;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.stroke();

  if (options.length < 2) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.fillStyle = 'rgba(30, 38, 62, 0.95)';
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `700 ${Math.max(12, size * 0.05)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Agrega al menos', cx, cy - size * 0.03);
    ctx.fillText('2 opciones', cx, cy + size * 0.03);
    drawPointer(size, cx, cy, radius);
    return;
  }

  const count = options.length;
  const segment = TWO_PI / count;

  options.forEach((option, index) => {
    const start = rotation + index * segment - Math.PI / 2;
    const end = start + segment;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = option.color;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.004);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke();

    // Texto a lo largo del radio, pegado al borde
    const arcHeight = 2 * radius * 0.7 * Math.sin(segment / 2);
    const fontSize = Math.max(9, Math.min(radius * 0.15, arcHeight * 0.6));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + segment / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const maxTextWidth = radius * 0.68;
    const layout = layoutLabel(option.label, fontSize, maxTextWidth, arcHeight);
    ctx.font = `800 ${layout.size}px ${FONT_FAMILY}`;
    ctx.fillStyle = resolveTextColor(option.color);
    layout.lines.forEach((line, lineIndex) => {
      const offsetY = (lineIndex - (layout.lines.length - 1) / 2) * layout.size * 1.1;
      ctx.fillText(fitText(line, maxTextWidth), radius * 0.93, offsetY);
    });
    ctx.restore();

    // Con ganador a la vista, las demás opciones se apagan
    if (highlightIndex >= 0 && index !== highlightIndex) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = 'rgba(5, 8, 16, 0.62)';
      ctx.fill();
    }
  });

  if (highlightIndex >= 0) {
    const start = rotation + highlightIndex * segment - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + segment);
    ctx.closePath();
    ctx.lineWidth = Math.max(2, size * 0.01);
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Luces del aro, una por cada división
  for (let index = 0; index < count; index += 1) {
    const angle = rotation + index * segment - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * (radius + size * 0.016),
      cy + Math.sin(angle) * (radius + size * 0.016),
      Math.max(1.5, size * 0.007),
      0,
      TWO_PI,
    );
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Centro
  const hub = ctx.createLinearGradient(cx - radius * 0.2, cy - radius * 0.2, cx + radius * 0.2, cy + radius * 0.2);
  hub.addColorStop(0, '#6d3ff2');
  hub.addColorStop(1, '#0e7490');
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.17, 0, TWO_PI);
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.01);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  drawPointer(size, cx, cy, radius);
}

function drawPointer(size, cx, cy, radius) {
  const baseY = cy - radius - size * 0.062;
  const tipY = cy - radius + size * 0.012;
  const half = size * 0.04;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = size * 0.02;
  ctx.shadowOffsetY = size * 0.008;
  ctx.beginPath();
  ctx.moveTo(cx - half, baseY);
  ctx.lineTo(cx + half, baseY);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(cx - half, baseY);
  ctx.lineTo(cx + half, baseY);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
  ctx.lineWidth = Math.max(1.5, size * 0.006);
  ctx.strokeStyle = '#7c5cff';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function resizeCanvas() {
  const size = Math.floor(Math.min(stageEl.clientWidth, stageEl.clientHeight));
  if (!size || size === canvasSize) {
    drawWheel();
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvasSize = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  drawWheel();
}

// ---------- Giro ----------
function spinTo(index, durationMs) {
  return new Promise((resolve) => {
    const count = getOptions().length;
    const segment = TWO_PI / count;
    const jitter = (Math.random() - 0.5) * segment * 0.7;
    const target = mod(-(index * segment + segment / 2 + jitter), TWO_PI);
    const delta = mod(target - mod(rotation, TWO_PI), TWO_PI);
    const turns = 4 + Math.floor(durationMs / 1500);
    const total = turns * TWO_PI + delta;
    const startRotation = rotation;
    const startedAt = performance.now();
    let lastSegment = Math.floor(rotation / segment);
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      rotation = startRotation + total;
      drawWheel();
      resolve();
    }

    function frame(now) {
      if (finished) return;

      const progress = Math.min(1, (now - startedAt) / durationMs);
      rotation = startRotation + total * (1 - Math.pow(1 - progress, 4));

      const currentSegment = Math.floor(rotation / segment);
      if (currentSegment !== lastSegment) {
        lastSegment = currentSegment;
        playTick();
      }

      drawWheel();
      if (progress < 1) requestAnimationFrame(frame);
      else finish();
    }

    requestAnimationFrame(frame);
    // Respaldo por si el navegador pausa los frames (pestaña oculta).
    setTimeout(finish, durationMs + 150);
  });
}

function showResult(label, detail) {
  resultLabelEl.textContent = label;
  resultDetailEl.textContent = detail || '';
  resultEl.classList.add('visible');
}

function hideResult() {
  resultEl.classList.remove('visible');
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (spinQueue.length > 0) {
    const job = spinQueue.shift();
    const options = getOptions();
    if (options.length < 2) continue;

    const winnerIndex = Math.floor(Math.random() * options.length);
    highlightIndex = -1;
    hideResult();

    await spinTo(winnerIndex, Math.max(3, rouletteConfig.spinSeconds || 6) * 1000);

    highlightIndex = winnerIndex;
    drawWheel();
    showResult(options[winnerIndex].label, job.detail);
    if (!isDemoMode() && window.playOverlaySound) {
      window.playOverlaySound(rouletteConfig.sound);
    }

    await wait(Math.max(2, rouletteConfig.resultSeconds || 5) * 1000);
    hideResult();
    await wait(320);
    highlightIndex = -1;
    drawWheel();
  }

  processing = false;
}

function queueSpins(count, detail) {
  for (let i = 0; i < count; i += 1) {
    spinQueue.push({ detail });
  }
  processQueue();
}

// ---------- Eventos ----------
function handleGiftEvent(payload) {
  if (rouletteConfig.enabled === false) return;
  if (!payload?.repeatEnd) return;

  const rule = (rouletteConfig.giftRules || []).find(
    (entry) => String(entry.giftId) === String(payload.giftId),
  );
  if (!rule) return;

  const repeatCount = Math.max(1, Number(payload.repeatCount || 1) || 1);
  const spins = rouletteConfig.spinPerGift ? Math.min(MAX_SPINS_PER_GIFT, repeatCount) : 1;
  const nickname = payload.user?.nickname || payload.user?.uniqueId || 'Alguien';
  const giftName = payload.giftName || rule.giftName || 'un regalo';

  queueSpins(spins, `${nickname} · ${giftName}`);
}

function handleTestSpin(payload) {
  if (rouletteConfig.enabled === false) return;
  const nickname = payload?.user?.nickname || 'Prueba';
  queueSpins(1, `${nickname} · giro de prueba`);
}

function connectToOverlayEvents(key) {
  const source = new EventSource(`/events/overlay?key=${encodeURIComponent(key)}`);

  source.addEventListener('gift', (event) => {
    try {
      handleGiftEvent(JSON.parse(event.data));
    } catch (error) {
      console.error('[Overlay] Error procesando regalo:', error.message);
    }
  });

  source.addEventListener('overlay-roulette-test', (event) => {
    try {
      handleTestSpin(JSON.parse(event.data));
    } catch (error) {
      console.error('[Overlay] Error procesando giro de prueba:', error.message);
    }
  });

  source.addEventListener('error', () => {
    console.warn('[Overlay] Conexión SSE interrumpida, reintentando...');
  });
}

// ---------- Demo (solo vista previa dentro de la plataforma) ----------
function startDemoLoop() {
  const fireDemoSpin = () => {
    const sender = DEMO_SENDERS[Math.floor(Math.random() * DEMO_SENDERS.length)];
    if (!processing) queueSpins(1, `${sender} · Rosa`);
  };

  const cycleSeconds = (rouletteConfig.spinSeconds || 6) + (rouletteConfig.resultSeconds || 5) + 2;
  setTimeout(fireDemoSpin, 800);
  setInterval(fireDemoSpin, cycleSeconds * 1000);
}

// ---------- Inicio ----------
function applyConfig() {
  titleEl.textContent = rouletteConfig.title || '';
  rootEl.hidden = rouletteConfig.enabled === false;
  resizeCanvas();
}

async function loadOverlayConfig(key) {
  try {
    const response = await fetch(`/api/overlay/public-config?key=${encodeURIComponent(key)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data?.state?.roulette) rouletteConfig = { ...rouletteConfig, ...data.state.roulette };
  } catch (error) {
    console.error('[Overlay] Error cargando configuración:', error.message);
  }
}

async function init() {
  window.addEventListener('resize', resizeCanvas);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resizeCanvas).observe(stageEl);
  }
  applyConfig();

  const key = getOverlayKey();
  if (!key) {
    console.error('[Overlay] Falta el parámetro ?key= en la URL.');
    return;
  }

  await loadOverlayConfig(key);
  applyConfig();

  // La vista previa del panel (demo) gira sola y no necesita el canal de
  // eventos; no abrirlo ahorra una conexión SSE por cada vista previa abierta
  // (los navegadores limitan las conexiones simultáneas por sitio).
  if (isDemoMode()) {
    startDemoLoop();
    return;
  }

  connectToOverlayEvents(key);
}

init();
