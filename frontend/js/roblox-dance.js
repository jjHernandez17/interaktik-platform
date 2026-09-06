const GAME_TYPE = 'roblox';

const robloxConnectionForm = document.getElementById('robloxConnectionForm');
const usernameInput = document.getElementById('robloxUsernameInput');
const statusBadge = document.getElementById('robloxConnectionStatusBadge');
const connectionDetails = document.getElementById('robloxConnectionDetails');
const linkBtn = document.getElementById('robloxLinkBtn');
const connectLiveBtn = document.getElementById('robloxConnectLiveBtn');
const disconnectBtn = document.getElementById('robloxDisconnectBtn');

const linkForm = document.getElementById('robloxLinkForm');
const robloxUserIdInput = document.getElementById('robloxUserIdInput');
const linkAccountBtn = document.getElementById('robloxLinkAccountBtn');
const linkStatus = document.getElementById('robloxLinkStatus');

const configForm = document.getElementById('robloxConfigForm');
const joinKeywordInput = document.getElementById('robloxJoinKeywordInput');
const configSaveBtn = document.getElementById('robloxConfigSaveBtn');

const testSpawnBtn = document.getElementById('robloxTestSpawnBtn');
const testSpawnStatus = document.getElementById('robloxTestSpawnStatus');
const activityList = document.getElementById('robloxActivityList');

const loadGiftsBtn = document.getElementById('robloxLoadGiftsBtn');
const ruleForm = document.getElementById('robloxRuleForm');
const giftPicker = document.getElementById('robloxGiftPicker');
const giftPickerToggle = document.getElementById('robloxGiftPickerToggle');
const giftPickerSelected = document.getElementById('robloxGiftPickerSelected');
const giftPickerPanel = document.getElementById('robloxGiftPickerPanel');
const giftPickerList = document.getElementById('robloxGiftPickerList');
const giftFilterName = document.getElementById('robloxGiftFilterName');
const giftFilterCoinsMin = document.getElementById('robloxGiftFilterCoinsMin');
const giftFilterCoinsMax = document.getElementById('robloxGiftFilterCoinsMax');
const rulePowerSelect = document.getElementById('robloxRulePowerSelect');
const ruleDurationInput = document.getElementById('robloxRuleDurationInput');
const ruleSaveBtn = document.getElementById('robloxRuleSaveBtn');
const rulesList = document.getElementById('robloxRulesList');

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

function setLinkStatus(robloxUsername, robloxUserId) {
  if (robloxUserId) {
    linkStatus.innerHTML = `Cuenta vinculada: <strong>${robloxUsername ? escapeHtml(robloxUsername) : 'ID ' + robloxUserId}</strong> (ID ${robloxUserId}). Puedes volver a vincular otra cuenta cuando quieras.`;
  } else {
    linkStatus.innerHTML = 'Aún no has vinculado ninguna cuenta de Roblox. Busca tu ID numérico en tu perfil de Roblox (roblox.com/users/<strong>TU_ID</strong>/profile).';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadConfig() {
  try {
    const response = await fetch('/api/roblox-dance/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    currentJoinKeyword = data.joinKeyword || 'join';
    joinKeywordInput.value = currentJoinKeyword;
    setLinkStatus(data.robloxUsername, data.robloxUserId);
    if (data.robloxUserId) {
      robloxUserIdInput.value = data.robloxUserId;
    }
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
      body: JSON.stringify({ joinKeyword: joinKeywordInput.value }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuracion.');

    currentJoinKeyword = data.joinKeyword || 'join';
    joinKeywordInput.value = currentJoinKeyword;
    await showAlert('Configuracion guardada correctamente.', 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    configSaveBtn.disabled = false;
    configSaveBtn.textContent = 'Guardar configuración';
  }
}

async function linkRobloxAccount(event) {
  event.preventDefault();

  const robloxUserId = normalizeText(robloxUserIdInput.value);
  if (!robloxUserId || !/^\d+$/.test(robloxUserId)) {
    await showAlert('Ingresa un ID de Roblox valido (solo numeros).', 'ID invalido');
    return;
  }

  linkAccountBtn.disabled = true;
  linkAccountBtn.textContent = 'Vinculando...';

  try {
    const response = await fetch('/api/roblox-dance/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ robloxUserId }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo vincular la cuenta.');

    setLinkStatus(data.robloxUsername, data.robloxUserId);
    await showAlert(`Cuenta vinculada correctamente${data.robloxUsername ? `: ${data.robloxUsername}` : ''}.`, 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    linkAccountBtn.disabled = false;
    linkAccountBtn.textContent = 'Vincular ID';
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

function pickFirstUrl(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstUrl(item);
      if (picked) return picked;
    }
    return '';
  }

  if (typeof value === 'object') {
    return (
      pickFirstUrl(value.url) ||
      pickFirstUrl(value.urlList) ||
      pickFirstUrl(value.url_list) ||
      pickFirstUrl(value.urls) ||
      pickFirstUrl(value.uri) ||
      ''
    );
  }

  return '';
}

function getGiftImageUrl(gift) {
  return (
    pickFirstUrl(gift?.imageUrl) ||
    pickFirstUrl(gift?.giftImage) ||
    pickFirstUrl(gift?.previewImage) ||
    pickFirstUrl(gift?.icon) ||
    pickFirstUrl(gift?.giftLabelIcon) ||
    pickFirstUrl(gift?.image) ||
    pickFirstUrl(gift?.staticImage) ||
    pickFirstUrl(gift?.dynamicImage) ||
    ''
  );
}

function sanitizeGiftCatalog(rawGifts) {
  return (Array.isArray(rawGifts) ? rawGifts : []).map((gift) => ({
    id: String(gift.id),
    name: gift.name || gift.giftName || `Regalo ID ${gift.id}`,
    diamondCount: Number(gift.diamondCount || gift.diamond_count || 1) || 1,
    imageUrl: gift.imageUrl || getGiftImageUrl(gift),
  }));
}

let giftCatalog = [];
let selectedGift = null;

function renderGiftPickerList() {
  if (giftCatalog.length === 0) {
    giftPickerList.innerHTML = '<p class="muted">Carga el catálogo primero.</p>';
    return;
  }

  const nameFilter = normalizeText(giftFilterName.value).toLowerCase();
  const min = giftFilterCoinsMin.value !== '' ? Number(giftFilterCoinsMin.value) : null;
  const max = giftFilterCoinsMax.value !== '' ? Number(giftFilterCoinsMax.value) : null;

  const filtered = giftCatalog.filter((gift) => {
    if (nameFilter && !String(gift.name || '').toLowerCase().includes(nameFilter)) return false;
    const coins = Number(gift.diamondCount) || 0;
    if (min !== null && !Number.isNaN(min) && coins < min) return false;
    if (max !== null && !Number.isNaN(max) && coins > max) return false;
    return true;
  });

  if (filtered.length === 0) {
    giftPickerList.innerHTML = '<p class="muted">Sin resultados para ese filtro.</p>';
    return;
  }

  giftPickerList.innerHTML = filtered.map((gift) => `
    <button type="button" class="gift-picker-item${selectedGift && String(selectedGift.id) === String(gift.id) ? ' selected' : ''}" data-gift-id="${escapeHtml(gift.id)}">
      <img class="gift-picker-item-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <span class="gift-picker-item-name">${escapeHtml(gift.name)}</span>
      <span class="gift-picker-item-coins">${escapeHtml(gift.diamondCount)}</span>
    </button>
  `).join('');

  giftPickerList.querySelectorAll('.gift-picker-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const gift = giftCatalog.find((entry) => String(entry.id) === btn.dataset.giftId);
      if (gift) selectGift(gift);
      closeGiftPicker();
    });
  });
}

function selectGift(gift) {
  selectedGift = gift;
  giftPickerSelected.classList.remove('placeholder');
  giftPickerSelected.innerHTML = `
    <img class="gift-picker-selected-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" onerror="this.style.visibility='hidden'" />
    <span class="gift-picker-selected-name">${escapeHtml(gift.name)}</span>
    <span class="gift-picker-selected-coins">${escapeHtml(gift.diamondCount)}</span>
  `;
}

function openGiftPicker() {
  if (giftCatalog.length === 0) return;
  giftPickerPanel.classList.remove('hidden');
  giftPickerToggle.classList.add('open');
}

function closeGiftPicker() {
  giftPickerPanel.classList.add('hidden');
  giftPickerToggle.classList.remove('open');
}

function toggleGiftPicker() {
  if (giftPickerPanel.classList.contains('hidden')) openGiftPicker();
  else closeGiftPicker();
}

async function loadGiftCatalog() {
  loadGiftsBtn.disabled = true;
  loadGiftsBtn.textContent = 'Cargando...';

  try {
    const response = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: GAME_TYPE }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catalogo.');

    giftCatalog = sanitizeGiftCatalog(data.gifts);
    selectedGift = null;
    giftPickerSelected.classList.add('placeholder');
    giftPickerSelected.textContent = giftCatalog.length === 0
      ? 'Sin regalos disponibles (conecta tu TikTok primero)'
      : 'Selecciona un regalo';
    giftFilterName.value = '';
    giftFilterCoinsMin.value = '';
    giftFilterCoinsMax.value = '';
    renderGiftPickerList();

    await showAlert(`Catalogo cargado: ${giftCatalog.length} regalos.`, 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    loadGiftsBtn.disabled = false;
    loadGiftsBtn.textContent = 'Cargar catálogo de regalos';
  }
}

async function saveRule(event) {
  event.preventDefault();

  if (!selectedGift) {
    await showAlert('Primero carga el catalogo y selecciona un regalo.', 'Aviso');
    return;
  }

  ruleSaveBtn.disabled = true;
  ruleSaveBtn.textContent = 'Guardando...';

  try {
    const response = await fetch('/api/roblox-dance/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftImageUrl: selectedGift.imageUrl || '',
        power: rulePowerSelect.value,
        durationSeconds: Number(ruleDurationInput.value) || 5,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la regla.');

    await loadRules();
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    ruleSaveBtn.disabled = false;
    ruleSaveBtn.textContent = 'Agregar regla';
  }
}

const POWER_LABELS = { fuego: 'Fuego', brillo: 'Brillo' };

async function loadRules() {
  try {
    const response = await fetch('/api/roblox-dance/rules');
    const data = await response.json();
    const rules = Array.isArray(data.rules) ? data.rules : [];

    if (rules.length === 0) {
      rulesList.innerHTML = '<p class="muted">Aún no has configurado ninguna regla.</p>';
      return;
    }

    rulesList.innerHTML = rules.map((rule) => `
      <div class="rule-item" data-rule-id="${rule.id}">
        <div class="rule-info">
          <strong>${escapeHtml(rule.gift_name)}</strong>
          <span class="muted">${escapeHtml(POWER_LABELS[rule.power] || rule.power)} · ${escapeHtml(rule.duration_seconds)}s</span>
        </div>
        <div class="rule-actions">
          <button class="btn ghost small test-rule-btn" type="button">Probar</button>
          <button class="btn danger small delete-rule-btn" type="button">Eliminar</button>
        </div>
      </div>
    `).join('');

    rulesList.querySelectorAll('.test-rule-btn').forEach((btn) => {
      btn.addEventListener('click', () => testRule(btn.closest('.rule-item').dataset.ruleId, btn));
    });
    rulesList.querySelectorAll('.delete-rule-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteRule(btn.closest('.rule-item').dataset.ruleId));
    });
  } catch (error) {
    rulesList.innerHTML = '<p class="muted">No se pudieron cargar las reglas.</p>';
  }
}

async function testRule(ruleId, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/roblox-dance/rules/${ruleId}/test`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar el poder.');
    await showAlert('Poder de prueba enviado. Deberia activarse en tu Roblox Studio en unos segundos.', 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    button.disabled = false;
  }
}

async function deleteRule(ruleId) {
  const confirmed = await showConfirm('¿Eliminar esta regla?', 'Eliminar regla');
  if (!confirmed) return;

  try {
    await fetch(`/api/roblox-dance/rules/${ruleId}`, { method: 'DELETE' });
    await loadRules();
  } catch (error) {
    await showAlert('No se pudo eliminar la regla.', 'Error');
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
  linkForm.addEventListener('submit', linkRobloxAccount);
  testSpawnBtn.addEventListener('click', sendTestSpawn);

  loadGiftsBtn.addEventListener('click', loadGiftCatalog);
  ruleForm.addEventListener('submit', saveRule);

  giftPickerToggle.addEventListener('click', toggleGiftPicker);
  giftFilterName.addEventListener('input', renderGiftPickerList);
  giftFilterCoinsMin.addEventListener('input', renderGiftPickerList);
  giftFilterCoinsMax.addEventListener('input', renderGiftPickerList);
  document.addEventListener('click', (event) => {
    if (!giftPicker.contains(event.target)) closeGiftPicker();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeGiftPicker();
  });
}

(async function init() {
  bootstrapEventListeners();
  await loadConfig();
  await restoreTiktokConnection();
  await loadRules();
})();
