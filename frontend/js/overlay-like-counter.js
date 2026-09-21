// Pagina pensada para pegarse como "Browser Source" en OBS/Streamlabs/TikTok
// LIVE Studio. Sin login: se identifica con la overlay_key de la URL. El
// conteo se acumula en el servidor (ver backend/src/services/
// overlayAccumulator.js) asi que sobrevive a recargas de OBS.

const root = document.getElementById('likeCounterRoot');
const labelEl = document.getElementById('likeCounterLabel');
const valueEl = document.getElementById('likeCounterValue');

let likeCounter = { enabled: true, label: 'Likes en vivo', totalLikes: 0 };
let demoLikes = 0;
let demoIntervalId = null;
let pulseTimeoutId = null;

function getOverlayKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function isDemoMode() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

function pulse() {
  root.classList.remove('pulse');
  // Forzar reflow para poder reiniciar la animación en clics consecutivos.
  void root.offsetWidth;
  root.classList.add('pulse');
  clearTimeout(pulseTimeoutId);
  pulseTimeoutId = setTimeout(() => root.classList.remove('pulse'), 450);
}

function render(shouldPulse) {
  if (likeCounter.enabled === false) {
    root.classList.remove('visible');
    return;
  }

  root.classList.add('visible');
  labelEl.textContent = likeCounter.label || 'Likes en vivo';
  valueEl.textContent = (isDemoMode() ? demoLikes : likeCounter.totalLikes).toLocaleString('es');

  if (shouldPulse) pulse();
}

async function loadOverlayConfig(key) {
  try {
    const response = await fetch(`/api/overlay/public-config?key=${encodeURIComponent(key)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data?.state?.likeCounter) likeCounter = data.state.likeCounter;
    render(false);
  } catch (error) {
    console.error('[Overlay] Error cargando configuración:', error.message);
  }
}

function connectToOverlayEvents(key) {
  const source = new EventSource(`/events/overlay?key=${encodeURIComponent(key)}`);

  source.addEventListener('overlay-likes-update', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data?.likeCounter) {
        likeCounter = data.likeCounter;
        render(true);
      }
    } catch (error) {
      console.error('[Overlay] Error procesando actualización de likes:', error.message);
    }
  });

  source.addEventListener('error', () => {
    console.warn('[Overlay] Conexión SSE interrumpida, reintentando...');
  });
}

// Modo demo: SOLO para la vista previa embebida en la plataforma. Simula el
// conteo localmente (nunca toca el backend ni el canal real de eventos),
// asi que jamas afecta a un overlay real pegado en OBS.
function startDemoLoop() {
  stopDemoLoop();

  demoIntervalId = setInterval(() => {
    demoLikes += Math.floor(Math.random() * 15) + 1;
    render(true);
  }, 900);
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
