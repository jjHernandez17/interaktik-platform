// GTA V "Rampa Imposible": conexion TikTok, llave, control de la partida, marcador de wins y reglas regalo -> lo que cae.
// Mismo patron que minecraft-cubo.js.
const GAME_TYPE = 'gtarampa';

const $ = (id) => document.getElementById(id);

const connectionForm = $('rpConnectionForm');
const usernameInput = $('rpUsernameInput');
const statusBadge = $('rpConnectionStatusBadge');
const connectionDetails = $('rpConnectionDetails');
const connectLiveBtn = $('rpConnectLiveBtn');
const disconnectBtn = $('rpDisconnectBtn');
const heroTiktok = $('rpHeroTiktok');
const heroGame = $('rpHeroGame');
const heroPlaying = $('rpHeroPlaying');
const gameBadge = $('rpGameBadge');

const serverKeyInput = $('rpServerKeyInput');
const toggleKeyBtn = $('rpToggleKeyBtn');
const copyKeyBtn = $('rpCopyKeyBtn');
const regenerateBtn = $('rpRegenerateBtn');

const startBtn = $('rpStartBtn');
const resetBtn = $('rpResetBtn');
const stopBtn = $('rpStopBtn');
const goalInput = $('rpGoal');
const winsInput = $('rpWins');
const saveScoreBtn = $('rpSaveScoreBtn');
const scoreChip = $('rpScoreChip');

const loadGiftsBtn = $('rpLoadGiftsBtn');
const ruleForm = $('rpRuleForm');
const giftPicker = $('rpGiftPicker');
const giftPickerToggle = $('rpGiftPickerToggle');
const giftPickerSelected = $('rpGiftPickerSelected');
const giftPickerPanel = $('rpGiftPickerPanel');
const giftPickerList = $('rpGiftPickerList');
const giftFilterName = $('rpGiftFilterName');
const giftFilterCoinsMin = $('rpGiftFilterCoinsMin');
const giftFilterCoinsMax = $('rpGiftFilterCoinsMax');
const actionSelect = $('rpActionSelect');
const amountField = $('rpAmountField');
const amountInput = $('rpAmountInput');
const amountHint = $('rpAmountHint');
const ruleSaveBtn = $('rpRuleSaveBtn');
const rulesList = $('rpRulesList');
const ruleCount = $('rpRuleCount');

let liveEventsSource = null;
let giftCatalog = [];
let selectedGift = null;
let actionGroups = [];
let actions = [];
let scoreEdited = false; // si el streamer esta escribiendo, no se le pisa el valor con el que llega del servidor

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setBtnLabel(button, iconId, label, size = 14) {
  button.innerHTML = `<svg width="${size}" height="${size}"><use href="#${iconId}" /></svg>${label}`;
}

function actionById(id) {
  return actions.find((action) => action.id === id) || null;
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
  if (heroTiktok) heroTiktok.dataset.state = (status === 'connected' || status === 'linked') ? 'on' : 'off';
  if (message) connectionDetails.textContent = message;
}

// ===== Conexión TikTok (se vincula desde la sección "Juegos" del panel) =====
async function restoreTiktokConnection() {
  usernameInput.disabled = true;
  connectLiveBtn.disabled = true;

  try {
    const response = await fetch(`/api/tiktok-connection/${GAME_TYPE}`);
    if (!response.ok) {
      setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
      return;
    }

    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      usernameInput.value = `@${data.tiktok_username}`;
      connectLiveBtn.disabled = false;
      setStatus('linked', `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
    } else {
      setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    setStatus('unlinked', 'No has vinculado un ID de TikTok Live.');
    console.error('[GTA-RAMPA] Error restaurando conexion TikTok:', error.message);
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
    if (!response.ok) throw new Error(payload.error || 'No se pudo conectar.');

    setStatus(payload.status || 'connected', payload.message || 'Conectado al live.');
    if (payload.status === 'connected') connectLiveEvents();
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

  disconnectBtn.disabled = true;
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    setStatus('disconnected', 'Conexion cerrada.');
  } finally {
    disconnectBtn.disabled = false;
  }
}

// Los regalos se procesan en el servidor; este stream solo sirve para saber si la conexión sigue viva.
function connectLiveEvents() {
  if (liveEventsSource) liveEventsSource.close();

  liveEventsSource = new EventSource(`/events?gameType=${GAME_TYPE}`);
  liveEventsSource.addEventListener('error', () => {
    setStatus('disconnected', 'La conexion de eventos con el servidor se interrumpio.');
  });
}

// ===== Llave =====
async function loadConfig() {
  try {
    const response = await fetch('/api/gtaramp/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    serverKeyInput.value = data.serverKey || '';
    applyScore(data.settings, true);
  } catch (error) {
    serverKeyInput.value = '';
    await showAlert(error.message, 'Error');
  }
}

function toggleSecret(input, button) {
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  button.textContent = hidden ? 'Ocultar' : 'Mostrar';
}

async function copyKey() {
  const text = serverKeyInput.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const previousType = serverKeyInput.type;
    serverKeyInput.type = 'text';
    serverKeyInput.select();
    document.execCommand('copy');
    serverKeyInput.type = previousType;
  }

  setBtnLabel(copyKeyBtn, 'i-copy', 'Copiada ✓', 15);
  setTimeout(() => setBtnLabel(copyKeyBtn, 'i-copy', 'Copiar llave', 15), 1600);
}

async function regenerateKey() {
  const confirmed = await showConfirm(
    'Se creará una llave nueva y la anterior dejará de funcionar (también en «Modo historia»): tendrás que ejecutar el instalador otra vez con la nueva. ¿Continuar?',
    'Regenerar llave',
  );
  if (!confirmed) return;

  regenerateBtn.disabled = true;
  try {
    const response = await fetch('/api/gtaramp/regenerate-key', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo regenerar la llave.');
    serverKeyInput.value = data.serverKey;
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    regenerateBtn.disabled = false;
  }
}

// ===== Estado del mod y marcador =====
function setBadge(badge, state, text) {
  badge.textContent = text;
  badge.className = `status-badge ${state}`;
}

function applyScore(settings, force = false) {
  if (!settings) return;
  scoreChip.textContent = `${settings.wins}/${settings.goal}`;
  if (force || !scoreEdited) {
    goalInput.value = settings.goal;
    winsInput.value = settings.wins;
  }
}

async function refreshStatus() {
  if (document.hidden) return;

  try {
    const response = await fetch('/api/gtaramp/status');
    if (!response.ok) return;
    const data = await response.json();
    const app = data.app || {};

    if (app.connected) {
      setBadge(gameBadge, 'connected', app.active ? 'Conectado · partida en marcha' : (app.gameFocused === false ? 'Conectado · juego en pausa' : 'Conectado'));
    } else {
      setBadge(gameBadge, 'disconnected', 'Sin conexión');
    }
    if (heroGame) heroGame.dataset.state = app.connected ? 'on' : 'off';
    if (heroPlaying) heroPlaying.dataset.state = app.active ? 'on' : 'off';
    applyScore(data.settings);
  } catch (error) {
    // se reintenta en el siguiente ciclo
  }
}

async function control(cmd, button, doneMessage) {
  button.disabled = true;
  try {
    const response = await fetch('/api/gtaramp/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar la orden.');
    if (doneMessage) await showAlert(doneMessage, 'Listo');
    setTimeout(refreshStatus, 800);
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    button.disabled = false;
  }
}

async function saveScore() {
  const goal = Math.round(Number(goalInput.value));
  const wins = Math.round(Number(winsInput.value));
  if (!Number.isFinite(goal) || !Number.isFinite(wins) || Math.abs(goal) > 1000000 || Math.abs(wins) > 1000000) {
    await showAlert('El objetivo y los wins deben estar entre -1 000 000 y 1 000 000.', 'Marcador no válido');
    return;
  }

  saveScoreBtn.disabled = true;
  try {
    const response = await fetch('/api/gtaramp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, wins }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
    scoreEdited = false;
    applyScore(data.settings, true);
    await showAlert(`Marcador guardado: ${data.settings.wins}/${data.settings.goal} wins.`, 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    saveScoreBtn.disabled = false;
  }
}

// ===== Catálogo de acciones =====
async function loadActions() {
  try {
    const response = await fetch('/api/gtaramp/actions');
    if (!response.ok) throw new Error('No se pudo cargar el catalogo.');

    const data = await response.json();
    actionGroups = Array.isArray(data.groups) ? data.groups : [];
    actions = Array.isArray(data.actions) ? data.actions : [];

    actionSelect.innerHTML = '<option value="">Selecciona una opción</option>' + actionGroups.map((group) => `
      <optgroup label="${escapeHtml(group.label)}">
        ${actions.filter((action) => action.group === group.id)
    .map((action) => `<option value="${escapeHtml(action.id)}">${escapeHtml(action.label)}</option>`)
    .join('')}
      </optgroup>
    `).join('');
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

function syncAmountField() {
  const action = actionById(actionSelect.value);
  amountField.hidden = !action;
  if (!action) return;

  amountInput.min = String(action.min);
  amountInput.max = String(action.max);
  amountInput.value = String(action.def);
  amountHint.textContent = `Entre ${action.min} y ${action.max}.`;
}

// ===== Catálogo de regalos (mismo patrón que minecraft-cubo.js) =====
function pickFirstUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;

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

async function loadGiftCatalog(silent) {
  loadGiftsBtn.disabled = true;
  setBtnLabel(loadGiftsBtn, 'i-refresh', 'Cargando...');

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
      ? 'Sin regalos disponibles (conecta tu TikTok y carga el catalogo una vez)'
      : 'Selecciona un regalo';
    giftFilterName.value = '';
    giftFilterCoinsMin.value = '';
    giftFilterCoinsMax.value = '';
    renderGiftPickerList();

    if (!silent) await showAlert(`Catalogo cargado: ${giftCatalog.length} regalos.`, 'Listo');
  } catch (error) {
    if (!silent) await showAlert(error.message, 'Error');
  } finally {
    loadGiftsBtn.disabled = false;
    setBtnLabel(loadGiftsBtn, 'i-refresh', 'Actualizar regalos');
  }
}

// ===== Reglas regalo -> lo que cae =====
async function saveRule(event) {
  event.preventDefault();

  if (!selectedGift) {
    await showAlert('Primero carga el catalogo y selecciona un regalo.', 'Aviso');
    return;
  }

  const action = actionById(actionSelect.value);
  if (!action) {
    await showAlert('Selecciona qué cae.', 'Aviso');
    return;
  }

  const amount = Math.round(Number(amountInput.value));
  if (!Number.isFinite(amount) || amount < action.min || amount > action.max) {
    await showAlert(`La cantidad debe estar entre ${action.min} y ${action.max}.`, 'Aviso');
    return;
  }

  ruleSaveBtn.disabled = true;
  setBtnLabel(ruleSaveBtn, 'i-plus', 'Guardando...', 16);

  try {
    const response = await fetch('/api/gtaramp/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftImageUrl: selectedGift.imageUrl || '',
        action: action.id,
        amount,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la regla.');

    await loadRules();
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    ruleSaveBtn.disabled = false;
    setBtnLabel(ruleSaveBtn, 'i-plus', 'Agregar regla', 16);
  }
}

async function loadRules() {
  try {
    const response = await fetch('/api/gtaramp/rules');
    const data = await response.json();
    const rules = Array.isArray(data.rules) ? data.rules : [];

    ruleCount.textContent = String(rules.length);

    if (rules.length === 0) {
      rulesList.innerHTML = `
        <div class="pk-empty">
          <svg><use href="#i-bolt" /></svg>
          <strong>Aún no hay reglas</strong>
          <span>Crea la primera con el formulario: elige un regalo y lo que hace caer.</span>
        </div>`;
      return;
    }

    rulesList.innerHTML = rules.map((rule) => {
      const action = actionById(rule.action);
      const label = action ? action.label : rule.action;
      return `
      <div class="rule-item" data-rule-id="${rule.id}">
        ${rule.gift_image_url
    ? `<img class="rule-gift" src="${escapeHtml(rule.gift_image_url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), {className: 'rule-gift placeholder'}))" />`
    : '<span class="rule-gift placeholder"><svg><use href="#i-bolt" /></svg></span>'}
        <div class="rule-info">
          <strong>${escapeHtml(rule.gift_name)}</strong>
          <span class="pk-chip pk-chip--down"><svg width="13" height="13"><use href="#i-bolt" /></svg>${escapeHtml(label)} ×${escapeHtml(rule.amount)}</span>
        </div>
        <div class="rule-actions">
          <button class="btn ghost small test-rule-btn" type="button" title="Hacer caer esto ahora (con la partida en marcha)"><svg><use href="#i-play" /></svg>Probar</button>
          <button class="btn ghost small icon-only delete-rule-btn" type="button" title="Eliminar regla" aria-label="Eliminar regla"><svg><use href="#i-trash" /></svg></button>
        </div>
      </div>`;
    }).join('');

    rulesList.querySelectorAll('.test-rule-btn').forEach((btn) => {
      btn.addEventListener('click', () => testRule(btn.closest('.rule-item').dataset.ruleId, btn));
    });
    rulesList.querySelectorAll('.delete-rule-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteRule(btn.closest('.rule-item').dataset.ruleId));
    });
  } catch (error) {
    rulesList.innerHTML = '<div class="pk-empty"><strong>No se pudieron cargar las reglas</strong><span>Recarga la página e inténtalo de nuevo.</span></div>';
  }
}

async function testRule(ruleId, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/gtaramp/rules/${ruleId}/test`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar la regla.');
    await showAlert('Enviado. Cae al final de la rampa en un par de segundos (la partida tiene que estar en marcha).', 'Listo');
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
    await fetch(`/api/gtaramp/rules/${ruleId}`, { method: 'DELETE' });
    await loadRules();
  } catch (error) {
    await showAlert('No se pudo eliminar la regla.', 'Error');
  }
}

function bootstrapEventListeners() {
  connectionForm.addEventListener('submit', (event) => event.preventDefault());
  connectLiveBtn.addEventListener('click', connectLive);
  disconnectBtn.addEventListener('click', disconnectLive);

  toggleKeyBtn.addEventListener('click', () => toggleSecret(serverKeyInput, toggleKeyBtn));
  copyKeyBtn.addEventListener('click', copyKey);
  regenerateBtn.addEventListener('click', regenerateKey);

  startBtn.addEventListener('click', () => control('start', startBtn, 'Orden enviada: en unos segundos aparecerás en el mapa de containers.'));
  resetBtn.addEventListener('click', () => control('reset', resetBtn, 'Volviste al inicio y se limpiaron los objetos que caían.'));
  stopBtn.addEventListener('click', () => control('stop', stopBtn, 'Partida terminada: vuelves a donde estabas.'));
  [goalInput, winsInput].forEach((input) => input.addEventListener('input', () => { scoreEdited = true; }));
  saveScoreBtn.addEventListener('click', saveScore);

  loadGiftsBtn.addEventListener('click', () => loadGiftCatalog());
  ruleForm.addEventListener('submit', saveRule);
  actionSelect.addEventListener('change', syncAmountField);

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
  await loadActions();
  await loadConfig();
  await restoreTiktokConnection();
  await loadRules();
  await loadGiftCatalog(true);
  refreshStatus();
  setInterval(refreshStatus, 4000);
})().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
