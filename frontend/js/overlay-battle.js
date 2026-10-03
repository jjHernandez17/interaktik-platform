// Overlay de batalla (barra de dos bandos al estilo de las batallas de TikTok).
// Pagina pensada para pegarse como "Browser Source" en OBS/Streamlabs/TikTok
// LIVE Studio. Sin login: se identifica con la overlay_key de la URL.
//
// La configuracion (nombres, imagenes, colores) se lee una vez al abrir; los
// marcadores llegan en vivo por el canal de overlays (GET /events/overlay) cada
// vez que el servidor suma el regalo de un bando.

const rootEl = document.getElementById('battleRoot');
const titleEl = document.getElementById('battleTitle');
const segAEl = document.getElementById('segA');
const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');
const sideAEl = document.getElementById('sideA');
const sideBEl = document.getElementById('sideB');
const imgAEl = document.getElementById('imgA');
const imgBEl = document.getElementById('imgB');
const nameAEl = document.getElementById('nameA');
const nameBEl = document.getElementById('nameB');
const floatersEl = document.getElementById('battleFloaters');

const MIN_PERCENT = 12; // ningun bando se encoge por debajo de esto
const MAX_PERCENT = 88;
const COUNT_UP_MS = 600;

let battle = {
  enabled: true,
  title: '',
  sideA: { name: 'Bando azul', image: '', color: '#2f6bff' },
  sideB: { name: 'Bando rosa', image: '', color: '#ff2d8a' },
  scoreA: 0,
  scoreB: 0,
};

// Lo que se ve en pantalla (puede ir un poco por detras del real mientras
// corre la animacion de conteo).
let shownA = 0;
let shownB = 0;
let targetA = 0;
let targetB = 0;
let countAnimation = null;

function getOverlayKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function isDemoMode() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

function formatScore(value) {
  return Math.round(value).toLocaleString('es');
}

function render() {
  scoreAEl.textContent = formatScore(shownA);
  scoreBEl.textContent = formatScore(shownB);

  // El ancho sigue al valor REAL (no al del conteo) para que la barra se mueva
  // de una sola vez con su propia transicion.
  const total = targetA + targetB;
  const rawPercent = total > 0 ? (targetA / total) * 100 : 50;
  const percent = Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, rawPercent));
  rootEl.style.setProperty('--pct', `${percent}%`);
}

function animateTo(nextA, nextB) {
  targetA = nextA;
  targetB = nextB;

  if (countAnimation) cancelAnimationFrame(countAnimation);

  const fromA = shownA;
  const fromB = shownB;
  const startedAt = performance.now();
  render();

  function frame(now) {
    const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    shownA = fromA + (targetA - fromA) * eased;
    shownB = fromB + (targetB - fromB) * eased;
    render();

    if (progress < 1) {
      countAnimation = requestAnimationFrame(frame);
    } else {
      shownA = targetA;
      shownB = targetB;
      countAnimation = null;
      render();
    }
  }

  countAnimation = requestAnimationFrame(frame);
  // Respaldo por si el navegador pausa los frames.
  setTimeout(() => {
    shownA = targetA;
    shownB = targetB;
    render();
  }, COUNT_UP_MS + 120);
}

function showFloater(side, coins, nickname) {
  if (!coins) return;

  const floater = document.createElement('span');
  floater.className = `floater ${side === 'B' ? 'is-b' : 'is-a'}`;
  floater.textContent = `+${formatScore(coins)}${nickname ? ` · ${nickname}` : ''}`;
  floatersEl.appendChild(floater);
  setTimeout(() => floater.remove(), 1500);
}

function applySide(side, config, els) {
  const { sideEl, imgEl, nameEl } = els;
  const hasImage = Boolean(config.image);
  const hasName = Boolean(config.name);

  nameEl.textContent = config.name || '';
  imgEl.hidden = !hasImage;
  if (hasImage) imgEl.src = config.image;
  else imgEl.removeAttribute('src');
  sideEl.hidden = !(hasImage || hasName);
}

function applyConfig() {
  rootEl.hidden = battle.enabled === false;
  rootEl.style.setProperty('--a', battle.sideA.color);
  rootEl.style.setProperty('--b', battle.sideB.color);
  titleEl.textContent = battle.title || '';
  applySide('A', battle.sideA, { sideEl: sideAEl, imgEl: imgAEl, nameEl: nameAEl });
  applySide('B', battle.sideB, { sideEl: sideBEl, imgEl: imgBEl, nameEl: nameBEl });
}

// ---------- Eventos en vivo ----------
function handleBattleUpdate(payload) {
  if (battle.enabled === false) return;

  const nextA = Math.max(0, Number(payload?.scoreA) || 0);
  const nextB = Math.max(0, Number(payload?.scoreB) || 0);
  animateTo(nextA, nextB);

  if (payload?.side && payload?.coins) {
    showFloater(payload.side, Number(payload.coins), payload.nickname);
  }
}

function connectToOverlayEvents(key) {
  const source = new EventSource(`/events/overlay?key=${encodeURIComponent(key)}`);

  source.addEventListener('overlay-battle-update', (event) => {
    try {
      handleBattleUpdate(JSON.parse(event.data));
    } catch (error) {
      console.error('[Overlay] Error procesando la batalla:', error.message);
    }
  });

  source.addEventListener('error', () => {
    console.warn('[Overlay] Conexión SSE interrumpida, reintentando...');
  });
}

// ---------- Demo (solo vista previa dentro de la plataforma) ----------
// Enteramente local: nunca toca el canal real, asi que no llega a un overlay
// pegado en OBS.
function startDemoLoop() {
  let demoA = 18400;
  let demoB = 15200;
  animateTo(demoA, demoB);

  let tick = 0;
  setInterval(() => {
    tick += 1;
    // Va alternando quien manda para que se vea moverse la barra.
    const side = tick % 3 === 0 ? 'B' : 'A';
    const coins = 300 + Math.floor(Math.random() * 1200);
    if (side === 'A') demoA += coins;
    else demoB += coins;

    animateTo(demoA, demoB);
    showFloater(side, coins, side === 'A' ? 'María' : 'Carlos');
  }, 2200);
}

// ---------- Inicio ----------
async function loadOverlayConfig(key) {
  try {
    const response = await fetch(`/api/overlay/public-config?key=${encodeURIComponent(key)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data?.state?.battle) battle = { ...battle, ...data.state.battle };
  } catch (error) {
    console.error('[Overlay] Error cargando configuración:', error.message);
  }
}

async function init() {
  applyConfig();
  render();

  const key = getOverlayKey();
  if (!key) {
    console.error('[Overlay] Falta el parámetro ?key= en la URL.');
    return;
  }

  await loadOverlayConfig(key);
  applyConfig();
  animateTo(Number(battle.scoreA) || 0, Number(battle.scoreB) || 0);

  // La vista previa del panel (demo) se simula sola y no necesita el canal de
  // eventos; no abrirlo ahorra una conexion SSE por cada vista previa abierta.
  if (isDemoMode()) {
    startDemoLoop();
    return;
  }

  connectToOverlayEvents(key);
}

init();
