const GAME_TYPE = 'roblox';

const robloxConnectionForm = document.getElementById('robloxConnectionForm');
const usernameInput = document.getElementById('robloxUsernameInput');
const statusBadge = document.getElementById('robloxConnectionStatusBadge');
const connectionDetails = document.getElementById('robloxConnectionDetails');
const linkBtn = document.getElementById('robloxLinkBtn');
const connectLiveBtn = document.getElementById('robloxConnectLiveBtn');
const disconnectBtn = document.getElementById('robloxDisconnectBtn');

const configForm = document.getElementById('robloxConfigForm');
const joinKeywordInput = document.getElementById('robloxJoinKeywordInput');
const usernameConfigInput = document.getElementById('robloxUsernameConfigInput');
const apiKeyInput = document.getElementById('robloxApiKeyInput');
const copyKeyBtn = document.getElementById('robloxCopyKeyBtn');
const regenerateKeyBtn = document.getElementById('robloxRegenerateKeyBtn');
const configSaveBtn = document.getElementById('robloxConfigSaveBtn');

const testSpawnBtn = document.getElementById('robloxTestSpawnBtn');
const testSpawnStatus = document.getElementById('robloxTestSpawnStatus');
const activityList = document.getElementById('robloxActivityList');

let liveEventsSource = null;
let liveConnected = false;
let currentJoinKeyword = 'join';

async function showAlert(message, title = 'Aviso') {
  if (window.showAppAlert) return window.showAppAlert(message, title);
  window.alert(message);
}

async function showConfirm(message, title = 'Confirmacion') {
  if (window.showAppConfirm) return window.showAppConfirm(message, title);
  return window.confirm(message);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function setStatus(status, message = '') {
  const labels = {
    unlinked: 'Desvinculado',
    linked: 'Vinculado',
    connecting: 'Conectando...',
    connected: 'Conectado',
    error: 'Error',
    disconnected: 'Desconectado',
  };

  statusBadge.textContent = labels[status] || status;
  statusBadge.className = `status-badge ${status}`;
  if (message) connectionDetails.textContent = message;
}

function lockUsernameInput() {
  usernameInput.disabled = true;
  linkBtn.disabled = true;
  connectLiveBtn.disabled = false;
}

function unlockUsernameInput() {
  usernameInput.disabled = false;
  linkBtn.disabled = false;
  connectLiveBtn.disabled = true;
}

async function saveTiktokConnectionToDB() {
  const uniqueId = normalizeText(usernameInput.value).replace(/^@/, '');
  if (!uniqueId) return;

  const response = await fetch('/api/tiktok-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameType: GAME_TYPE, tiktokUsername: uniqueId }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'No se pudo guardar la cuenta.');
  }
}

async function restoreTiktokConnection() {
  unlockUsernameInput();

  try {
    const response = await fetch(`/api/tiktok-connection/${GAME_TYPE}`);
    if (!response.ok) {
      setStatus('unlinked', 'No has vinculado un ID de TikTok Live.');
      return;
    }

    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      usernameInput.value = `@${data.tiktok_username}`;
      lockUsernameInput();
      setStatus('linked', `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
    } else {
      setStatus('unlinked', 'Ingresa el nombre de usuario de TikTok que esta transmitiendo en vivo.');
    }
  } catch (error) {
    setStatus('unlinked', 'No has vinculado un ID de TikTok Live.');
    console.error('[ROBLOX] Error restaurando conexion TikTok:', error.message);
  }
}

async function linkTiktokUsername() {
  const uniqueId = normalizeText(usernameInput.value).replace(/^@/, '');
  if (!uniqueId) {
    setStatus('error', 'Debes indicar un usuario de TikTok.');
    return;
  }

  linkBtn.disabled = true;
  try {
    await saveTiktokConnectionToDB();
    usernameInput.value = `@${uniqueId}`;
    lockUsernameInput();
    setStatus('linked', `Cuenta vinculada a @${uniqueId}. Ahora puedes conectar el live.`);
  } catch (error) {
    linkBtn.disabled = false;
    setStatus('error', error.message || 'No se pudo guardar la cuenta.');
  }
}

async function connectLive() {
  const uniqueId = normalizeText(usernameInput.value).replace(/^@/, '');
  if (!uniqueId) {
    setStatus('error', 'Primero vincula y guarda tu cuenta de TikTok.');
    return;
  }

  connectLiveBtn.disabled = true;
  setStatus('connecting', `Conectando a @${uniqueId}...`);

  try {
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, gameType: GAME_TYPE }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo conectar.');
    }

    liveConnected = payload.status === 'connected';
    setStatus(payload.status || 'connected', payload.message || 'Conectado al live.');
    if (liveConnected) connectLiveEvents();
  } catch (error) {
    setStatus('error', error.message || 'No se pudo conectar.');
  } finally {
    connectLiveBtn.disabled = false;
  }
}

async function disconnectLive() {
  if (liveEventsSource) {
    liveEventsSource.close();
    liveEventsSource = null;
  }
  liveConnected = false;

  disconnectBtn.disabled = true;
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    setStatus('disconnected', 'Conexion cerrada.');
  } finally {
    disconnectBtn.disabled = false;
  }
}

function addActivityEntry(text) {
  const empty = activityList.querySelector('.muted');
  if (empty) empty.remove();

  const entry = document.createElement('p');
  entry.className = 'activity-entry';
  entry.textContent = text;
  activityList.prepend(entry);

  while (activityList.children.length > 30) {
    activityList.removeChild(activityList.lastChild);
  }
}

function connectLiveEvents() {
  if (liveEventsSource) {
    liveEventsSource.close();
  }

  liveEventsSource = new EventSource(`/events?gameType=${GAME_TYPE}`);

  liveEventsSource.addEventListener('comment', (event) => {
    try {
      const payload = JSON.parse(event.data);
      const comment = String(payload.comment || '');
      const pattern = new RegExp(`^\\s*${currentJoinKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\S+)\\s*$`, 'i');
      const match = comment.match(pattern);
      if (match) {
        const nickname = payload.user?.nickname || payload.user?.uniqueId || 'Espectador';
        addActivityEntry(`${nickname} pidio unirse como "${match[1]}"`);
      }
    } catch (error) {
      console.error('[ROBLOX] Error parseando comentario SSE:', error);
    }
  });

  liveEventsSource.addEventListener('error', () => {
    liveConnected = false;
    setStatus('disconnected', 'La conexion de eventos con el servidor se interrumpio.');
  });
}

async function loadConfig() {
  try {
    const response = await fetch('/api/roblox-dance/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    currentJoinKeyword = data.joinKeyword || 'join';
    joinKeywordInput.value = currentJoinKeyword;
    usernameConfigInput.value = data.robloxUsername || '';
    apiKeyInput.value = data.apiKey || '';
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

async function saveConfig(event) {
  event.preventDefault();

  configSaveBtn.disabled = true;
  configSaveBtn.textContent = 'Guardando...';

  try {
    const response = await fetch('/api/roblox-dance/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        joinKeyword: joinKeywordInput.value,
        robloxUsername: usernameConfigInput.value,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuracion.');

    currentJoinKeyword = data.joinKeyword || 'join';
    joinKeywordInput.value = currentJoinKeyword;
    usernameConfigInput.value = data.robloxUsername || '';
    await showAlert('Configuracion guardada correctamente.', 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    configSaveBtn.disabled = false;
    configSaveBtn.textContent = 'Guardar configuración';
  }
}

async function copyApiKey() {
  try {
    await navigator.clipboard.writeText(apiKeyInput.value);
    await showAlert('API key copiada al portapapeles.', 'Copiado');
  } catch (error) {
    apiKeyInput.select();
    await showAlert('No se pudo copiar automaticamente. Selecciona y copia manualmente.', 'Aviso');
  }
}

async function regenerateApiKey() {
  const confirmed = await showConfirm(
    'La API key anterior dejara de funcionar de inmediato. Tendras que pegar la nueva en tu script de Roblox Studio. ¿Continuar?',
    'Regenerar API key',
  );
  if (!confirmed) return;

  regenerateKeyBtn.disabled = true;
  try {
    const response = await fetch('/api/roblox-dance/regenerate-key', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo regenerar la API key.');

    apiKeyInput.value = data.apiKey || '';
    await showAlert('Nueva API key generada. Actualizala en tu script de Roblox Studio.', 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    regenerateKeyBtn.disabled = false;
  }
}

async function sendTestSpawn() {
  testSpawnBtn.disabled = true;
  testSpawnStatus.textContent = 'Enviando...';

  try {
    const response = await fetch('/api/roblox-dance/test-spawn', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar el spawn de prueba.');

    testSpawnStatus.textContent = 'Spawn de prueba encolado. Deberia aparecer en tu Roblox Studio en unos segundos.';
    addActivityEntry('Spawn de prueba encolado.');
  } catch (error) {
    testSpawnStatus.textContent = error.message;
  } finally {
    testSpawnBtn.disabled = false;
  }
}

function bootstrapEventListeners() {
  if (robloxConnectionForm) {
    robloxConnectionForm.addEventListener('submit', (event) => event.preventDefault());
  }

  linkBtn.addEventListener('click', linkTiktokUsername);
  connectLiveBtn.addEventListener('click', connectLive);
  disconnectBtn.addEventListener('click', disconnectLive);

  configForm.addEventListener('submit', saveConfig);
  copyKeyBtn.addEventListener('click', copyApiKey);
  regenerateKeyBtn.addEventListener('click', regenerateApiKey);
  testSpawnBtn.addEventListener('click', sendTestSpawn);
}

(async function init() {
  bootstrapEventListeners();
  await loadConfig();
  await restoreTiktokConnection();
})();
