// Pagina pensada para pegarse como "Browser Source" en OBS/Streamlabs/TikTok
// LIVE Studio. Sin login: se identifica con la overlay_key de la URL. El
// progreso se acumula en el servidor (ver backend/src/services/
// overlayAccumulator.js) asi que sobrevive a recargas de OBS.

const root = document.getElementById('goalBarRoot');
const labelEl = document.getElementById('goalBarLabel');
const countEl = document.getElementById('goalBarCount');
const fillEl = document.getElementById('goalBarFill');

let goalBar = { enabled: true, label: 'Meta de la transmisión', targetCoins: 500, currentCoins: 0 };
let demoCoins = 0;
let demoIntervalId = null;

function getOverlayKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function isDemoMode() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

function render() {
  if (goalBar.enabled === false) {
    root.classList.remove('visible');
    return;
  }

  root.classList.add('visible');
  labelEl.textContent = goalBar.label || 'Meta de la transmisión';

  const current = isDemoMode() ? demoCoins : goalBar.currentCoins;
  const target = Math.max(1, goalBar.targetCoins || 500);
  const percent = Math.max(0, Math.min(100, (current / target) * 100));

  countEl.textContent = `${Math.round(current)} / ${target} monedas`;
  fillEl.style.width = `${percent}%`;
  root.classList.toggle('reached', current >= target);
}

async function loadOverlayConfig(key) {
  try {
    const response = await fetch(`/api/overlay/public-config?key=${encodeURIComponent(key)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data?.state?.goalBar) goalBar = data.state.goalBar;
    render();
  } catch (error) {
    console.error('[Overlay] Error cargando configuración:', error.message);
  }
}

function connectToOverlayEvents(key) {
  const source = new EventSource(`/events/overlay?key=${encodeURIComponent(key)}`);

  source.addEventListener('overlay-goal-update', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data?.goalBar) {
        goalBar = data.goalBar;
        render();
      }
    } catch (error) {
      console.error('[Overlay] Error procesando actualización de meta:', error.message);
    }
  });

  source.addEventListener('error', () => {
    console.warn('[Overlay] Conexión SSE interrumpida, reintentando...');
  });
}

// Modo demo: SOLO para la vista previa embebida en la plataforma. Simula el
// progreso localmente (nunca toca el backend ni el canal real de eventos),
// asi que jamas afecta a un overlay real pegado en OBS.
function startDemoLoop() {
  stopDemoLoop();

  demoIntervalId = setInterval(() => {
    const target = Math.max(1, goalBar.targetCoins || 500);
    const step = Math.max(1, Math.round(target * 0.08));
    demoCoins += step;
    if (demoCoins > target) demoCoins = 0;
    render();
  }, 700);
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
