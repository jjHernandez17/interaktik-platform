// Pagina pensada para pegarse como "Browser Source" en OBS/Streamlabs/TikTok
// LIVE Studio. Sin login: se identifica con la overlay_key de la URL. No usa
// sesion de navegador ni gameType — recibe seguidores nuevos de CUALQUIER
// juego que el streamer tenga conectado en ese momento (ver GET /events/overlay).

const root = document.getElementById('followAlertRoot');
const avatarEl = document.getElementById('followAlertAvatar');
const nameEl = document.getElementById('followAlertName');

const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23ffffff" opacity="0.25"/></svg>',
);

let overlayState = { followAlert: { enabled: true, durationSeconds: 5 } };
let alertQueue = [];
let showingAlert = false;

const DEMO_NAMES = ['María', 'Carlos', 'Sofía', 'Andrés', 'Valentina'];
let demoIntervalId = null;

function getOverlayKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function isDemoMode() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

// Modo demo: SOLO para la vista previa embebida dentro de la plataforma. Es
// enteramente local (nunca toca el backend ni el canal real de eventos), asi
// que jamas le llega a un overlay real pegado en OBS — ahi solo deben verse
// seguidores reales o el que se dispare a mano con "Enviar seguidor de prueba".
function startDemoLoop() {
  stopDemoLoop();

  const fireDemoFollow = () => {
    const nickname = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
    handleFollowEvent({ user: { nickname, avatar: window.generateDemoAvatar?.(nickname) || '' } });
  };

  const durationSeconds = Math.max(2, overlayState.followAlert?.durationSeconds || 5);
  const intervalMs = Math.max(4, durationSeconds + 3) * 1000;

  setTimeout(fireDemoFollow, 600);
  demoIntervalId = setInterval(fireDemoFollow, intervalMs);
}

function stopDemoLoop() {
  if (demoIntervalId) {
    clearInterval(demoIntervalId);
    demoIntervalId = null;
  }
}

async function loadOverlayConfig(key) {
  try {
    const response = await fetch(`/api/overlay/public-config?key=${encodeURIComponent(key)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data?.state) overlayState = data.state;
  } catch (error) {
    console.error('[Overlay] Error cargando configuración:', error.message);
  }
}

function showNextAlert() {
  if (showingAlert || alertQueue.length === 0) return;

  showingAlert = true;
  const alert = alertQueue.shift();

  avatarEl.src = alert.avatar || DEFAULT_AVATAR;
  avatarEl.onerror = () => { avatarEl.src = DEFAULT_AVATAR; };
  nameEl.textContent = alert.nickname;

  root.classList.add('visible');
  if (!isDemoMode() && window.playOverlaySound) {
    window.playOverlaySound(overlayState.followAlert?.sound);
  }

  const durationMs = Math.max(2, overlayState.followAlert?.durationSeconds || 5) * 1000;
  setTimeout(() => {
    root.classList.remove('visible');
    setTimeout(() => {
      showingAlert = false;
      showNextAlert();
    }, 280);
  }, durationMs);
}

function handleFollowEvent(payload) {
  if (overlayState.followAlert?.enabled === false) return;

  alertQueue.push({
    nickname: payload.user?.nickname || payload.user?.uniqueId || 'Alguien',
    avatar: payload.user?.avatar || '',
  });

  showNextAlert();
}

function connectToOverlayEvents(key) {
  const source = new EventSource(`/events/overlay?key=${encodeURIComponent(key)}`);

  source.addEventListener('follow', (event) => {
    try {
      handleFollowEvent(JSON.parse(event.data));
    } catch (error) {
      console.error('[Overlay] Error procesando seguidor nuevo:', error.message);
    }
  });

  source.addEventListener('error', () => {
    console.warn('[Overlay] Conexión SSE interrumpida, reintentando...');
  });
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
