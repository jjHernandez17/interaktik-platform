// Pagina pensada para pegarse como "Browser Source" en OBS/Streamlabs/TikTok
// LIVE Studio. Sin login: se identifica con la overlay_key de la URL. El
// ranking se acumula en el servidor (ver backend/src/services/
// overlayAccumulator.js) asi que sobrevive a recargas de OBS.

const root = document.getElementById('topLikersRoot');
const titleEl = document.getElementById('topLikersTitleText');
const listEl = document.getElementById('topLikersList');
const emptyEl = document.getElementById('topLikersEmpty');

const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23ffffff" opacity="0.25"/></svg>',
);

let topLikers = { enabled: true, title: 'Top Likes', maxEntries: 5, entries: [] };

const DEMO_NAMES = ['María', 'Carlos', 'Sofía', 'Andrés', 'Valentina', 'Diego', 'Camila'];
let demoEntries = [];
let demoIntervalId = null;

function getOverlayKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function isDemoMode() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

function render() {
  if (topLikers.enabled === false) {
    root.classList.remove('visible');
    return;
  }

  root.classList.add('visible');
  titleEl.textContent = topLikers.title || 'Top Likes';

  const entries = isDemoMode() ? demoEntries : topLikers.entries;

  if (!entries || entries.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  listEl.innerHTML = entries.map((entry, index) => `
    <div class="top-liker-row">
      <span class="top-liker-rank">${index + 1}</span>
      <img class="top-liker-avatar" src="${entry.avatar || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}'" />
      <span class="top-liker-name">${escapeHtml(entry.nickname)}</span>
      <span class="top-liker-count">${entry.likes}</span>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadOverlayConfig(key) {
  try {
    const response = await fetch(`/api/overlay/public-config?key=${encodeURIComponent(key)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data?.state?.topLikers) topLikers = data.state.topLikers;
    render();
  } catch (error) {
    console.error('[Overlay] Error cargando configuración:', error.message);
  }
}

function connectToOverlayEvents(key) {
  const source = new EventSource(`/events/overlay?key=${encodeURIComponent(key)}`);

  source.addEventListener('overlay-likers-update', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data?.topLikers) {
        topLikers = data.topLikers;
        render();
      }
    } catch (error) {
      console.error('[Overlay] Error procesando actualización del top:', error.message);
    }
  });

  source.addEventListener('error', () => {
    console.warn('[Overlay] Conexión SSE interrumpida, reintentando...');
  });
}

// Modo demo: SOLO para la vista previa embebida en la plataforma. Simula un
// ranking localmente (nunca toca el backend ni el canal real de eventos),
// asi que jamas afecta a un overlay real pegado en OBS.
function startDemoLoop() {
  stopDemoLoop();

  demoIntervalId = setInterval(() => {
    const name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
    const likes = Math.floor(Math.random() * 80) + 10;
    const existing = demoEntries.find((entry) => entry.nickname === name);

    if (existing) {
      existing.likes += likes;
    } else {
      demoEntries.push({ nickname: name, avatar: '', likes });
    }

    demoEntries.sort((a, b) => b.likes - a.likes);
    demoEntries = demoEntries.slice(0, topLikers.maxEntries || 5);

    render();
  }, 1000);
}

function stopDemoLoop() {
  if (demoIntervalId) {
    clearInterval(demoIntervalId);
    demoIntervalId = null;
  }
}

async function init() {
  const key = getOverlayKey();
  if (!key) {
    console.error('[Overlay] Falta el parámetro ?key= en la URL.');
    return;
  }

  await loadOverlayConfig(key);
  connectToOverlayEvents(key);

  if (isDemoMode()) {
    startDemoLoop();
  }
}

init();
