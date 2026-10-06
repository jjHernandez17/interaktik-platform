// GTA V interactivo: conexion TikTok, llave de la aplicacion de Windows y reglas regalo -> accion.
// Mismo patron que minecraft.js.
const GAME_TYPE = 'gta';

const connectionForm = document.getElementById('gtaConnectionForm');
const usernameInput = document.getElementById('gtaUsernameInput');
const statusBadge = document.getElementById('gtaConnectionStatusBadge');
const connectionDetails = document.getElementById('gtaConnectionDetails');
const connectLiveBtn = document.getElementById('gtaConnectLiveBtn');
const disconnectBtn = document.getElementById('gtaDisconnectBtn');
const heroTiktok = document.getElementById('gtaHeroTiktok');
const heroApp = document.getElementById('gtaHeroApp');

const appBadge = document.getElementById('gtaAppBadge');
const downloadIniBtn = document.getElementById('gtaDownloadIniBtn');
const regenerateKeyBtns = document.querySelectorAll('.mc-regenerate');

const serverKeyInput = document.getElementById('gtaServerKeyInput');
const toggleKeyBtn = document.getElementById('gtaToggleKeyBtn');
const copyKeyBtn = document.getElementById('gtaCopyKeyBtn');

const loadGiftsBtn = document.getElementById('gtaLoadGiftsBtn');
const ruleForm = document.getElementById('gtaRuleForm');
const giftPicker = document.getElementById('gtaGiftPicker');
const giftPickerToggle = document.getElementById('gtaGiftPickerToggle');
const giftPickerSelected = document.getElementById('gtaGiftPickerSelected');
const giftPickerPanel = document.getElementById('gtaGiftPickerPanel');
const giftPickerList = document.getElementById('gtaGiftPickerList');
const giftFilterName = document.getElementById('gtaGiftFilterName');
const giftFilterCoinsMin = document.getElementById('gtaGiftFilterCoinsMin');
const giftFilterCoinsMax = document.getElementById('gtaGiftFilterCoinsMax');
const actionSelect = document.getElementById('gtaActionSelect');
const amountField = document.getElementById('gtaAmountField');
const amountLabel = document.getElementById('gtaAmountLabel');
const amountInput = document.getElementById('gtaAmountInput');
const amountHint = document.getElementById('gtaAmountHint');
const ruleSaveBtn = document.getElementById('gtaRuleSaveBtn');
const rulesList = document.getElementById('gtaRulesList');
const ruleCount = document.getElementById('gtaRuleCount');

let liveEventsSource = null;
let giftCatalog = [];
let selectedGift = null;
let actionGroups = [];
let actions = [];

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

// Botones con icono: actualizar solo el texto sin perder el SVG
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

// ===== Conexión TikTok =====
// El usuario de TikTok se vincula desde la sección "Juegos" del panel (una sola vez, para
// todos los juegos). Aquí solo se lee lo que ya esté vinculado.
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
    console.error('[GTA] Error restaurando conexion TikTok:', error.message);
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

// Los regalos se procesan en el servidor (aunque esta pestaña se cierre); este stream solo
// sirve para saber si la conexión sigue viva.
function connectLiveEvents() {
  if (liveEventsSource) liveEventsSource.close();

  liveEventsSource = new EventSource(`/events?gameType=${GAME_TYPE}`);
  liveEventsSource.addEventListener('error', () => {
    setStatus('disconnected', 'La conexion de eventos con el servidor se interrumpio.');
  });
}

// ===== Llave de la aplicación =====
async function loadConfig() {
  try {
    const response = await fetch('/api/gta/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    serverKeyInput.value = data.serverKey || '';
  } catch (error) {
    serverKeyInput.value = '';
    await showAlert(error.message, 'Error');
  }
}

function toggleKeyVisibility() {
  const hidden = serverKeyInput.type === 'password';
  serverKeyInput.type = hidden ? 'text' : 'password';
  toggleKeyBtn.textContent = hidden ? 'Ocultar' : 'Mostrar';
}

// Copia el contenido de un campo (aunque este oculto como contraseña) y avisa en el boton
async function copyFromInput(input, button, idleLabel, doneLabel) {
  const text = input.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const previousType = input.type;
    input.type = 'text';
    input.select();
    document.execCommand('copy');
    input.type = previousType;
  }

  setBtnLabel(button, 'i-copy', doneLabel, 15);
  setTimeout(() => setBtnLabel(button, 'i-copy', idleLabel, 15), 1600);
}

const copyServerKey = () => copyFromInput(serverKeyInput, copyKeyBtn, 'Copiar llave', 'Copiada ✓');

// Archivo de configuración del mod: lleva la llave dentro, así el usuario no tiene que editar nada
function downloadConfigFile() {
  const key = serverKeyInput.value;
  if (!key || key === 'Cargando...') return;

  const text = [
    '; Interaktik para GTA V - NO compartas este archivo (contiene tu llave secreta).',
    '; Va en la carpeta "scripts" de GTA V, junto a InteraktikGTA.dll.',
    `Key=${key}`,
    '',
    '; Mostrar en pantalla quien manda cada regalo (true o false).',
    'ShowGifts=false',
    '; Mostrar el aviso "Interaktik conectado" al abrir el juego (true o false).',
    'ShowConnected=true',
    '',
  ].join(String.fromCharCode(13, 10));

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  link.download = 'InteraktikGTA.ini';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

// ===== Estado del mod (se actualiza solo) =====
function setBadge(badge, state, text) {
  badge.textContent = text;
  badge.className = `status-badge ${state}`;
}

async function refreshGameStatus() {
  if (document.hidden) return;

  try {
    const response = await fetch('/api/gta/status');
    if (!response.ok) return;
    const data = await response.json();
    const app = data.app || {};

    if (app.connected) {
      setBadge(appBadge, 'connected', app.gameFocused === false ? 'Conectado · juego en pausa' : 'Conectado');
    } else {
      setBadge(appBadge, 'disconnected', 'Sin conexión · abre GTA V en modo historia');
    }

    if (heroApp) heroApp.dataset.state = app.connected ? 'on' : 'off';
  } catch (error) {
    // se reintenta en el siguiente ciclo
  }
}

async function regenerateServerKey() {
  const confirmed = await showConfirm(
    'Se creará una llave nueva y la anterior dejará de funcionar: tendrás que descargar de nuevo InteraktikGTA.ini y reemplazarlo. ¿Continuar?',
    'Regenerar llave',
  );
  if (!confirmed) return;

  regenerateKeyBtns.forEach((btn) => { btn.disabled = true; });
  try {
    const response = await fetch('/api/gta/regenerate-key', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo regenerar la llave.');

    serverKeyInput.value = data.serverKey;
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    regenerateKeyBtns.forEach((btn) => { btn.disabled = false; });
  }
}

// ===== Catálogo de acciones =====
async function loadActions() {
  try {
    const response = await fetch('/api/gta/actions');
    if (!response.ok) throw new Error('No se pudo cargar el catalogo de acciones.');

    const data = await response.json();
    actionGroups = Array.isArray(data.groups) ? data.groups : [];
    actions = Array.isArray(data.actions) ? data.actions : [];

    actionSelect.innerHTML = '<option value="">Selecciona una acción</option>' + actionGroups.map((group) => `
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

// Solo las acciones repetibles (estrellas de búsqueda) piden una cantidad
function syncAmountField() {
  const action = actionById(actionSelect.value);
  amountField.hidden = !action || action.min === action.max;
  if (!action) return;

  amountLabel.textContent = action.unit.charAt(0).toUpperCase() + action.unit.slice(1);
  amountInput.min = String(action.min);
  amountInput.max = String(action.max);
  amountInput.value = String(action.def);
  amountHint.textContent = `Entre ${action.min} y ${action.max}.`;
}

// Grupos que ayudan al streamer (el resto lo molesta)
const POSITIVE_GROUPS = ['help', 'allies', 'vehicles'];

function formatAmount(amount, unit) {
  if (unit === 'dólares') return `$${Number(amount).toLocaleString('es')}`;
  if (unit === 'estrellas') return `${amount} ${Number(amount) === 1 ? 'estrella' : 'estrellas'}`;
  return `${amount} ${unit}`;
}

function ruleChip(rule) {
  const action = actionById(rule.action);
  const label = action ? action.label : rule.action;
  const group = action ? action.group : 'annoy';
  const unit = action ? action.unit : '';
  const showAmount = !action || action.min !== action.max;
  const detail = showAmount ? ` · ${escapeHtml(formatAmount(rule.amount, unit))}` : '';
  const positive = POSITIVE_GROUPS.includes(group);

  return `<span class="pk-chip ${positive ? 'pk-chip--up' : 'pk-chip--down'}"><svg width="13" height="13"><use href="#${positive ? 'i-heart' : 'i-bolt'}" /></svg>${escapeHtml(label)}${detail}</span>`;
}

// ===== Catálogo de regalos (mismo patrón que minecraft.js) =====
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

// ===== Reglas regalo -> acción =====
async function saveRule(event) {
  event.preventDefault();

  if (!selectedGift) {
    await showAlert('Primero carga el catalogo y selecciona un regalo.', 'Aviso');
    return;
  }

  const action = actionById(actionSelect.value);
  if (!action) {
    await showAlert('Selecciona una acción.', 'Aviso');
    return;
  }

  ruleSaveBtn.disabled = true;
  setBtnLabel(ruleSaveBtn, 'i-plus', 'Guardando...', 16);

  try {
    const response = await fetch('/api/gta/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftImageUrl: selectedGift.imageUrl || '',
        action: action.id,
        amount: action.min === action.max ? action.min : (Number(amountInput.value) || action.def),
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
    const response = await fetch('/api/gta/rules');
    const data = await response.json();
    const rules = Array.isArray(data.rules) ? data.rules : [];

    ruleCount.textContent = String(rules.length);

    if (rules.length === 0) {
      rulesList.innerHTML = `
        <div class="pk-empty">
          <svg><use href="#i-bolt" /></svg>
          <strong>Aún no hay reglas</strong>
          <span>Crea la primera con el formulario: elige un regalo y lo que hace en tu juego.</span>
        </div>`;
      return;
    }

    rulesList.innerHTML = rules.map((rule) => `
      <div class="rule-item" data-rule-id="${rule.id}">
        ${rule.gift_image_url
    ? `<img class="rule-gift" src="${escapeHtml(rule.gift_image_url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), {className: 'rule-gift placeholder'}))" />`
    : '<span class="rule-gift placeholder"><svg><use href="#i-bolt" /></svg></span>'}
        <div class="rule-info">
          <strong>${escapeHtml(rule.gift_name)}</strong>
          ${ruleChip(rule)}
        </div>
        <div class="rule-actions">
          <button class="btn ghost small test-rule-btn" type="button" title="Enviar esta acción a tu juego ahora"><svg><use href="#i-play" /></svg>Probar</button>
          <button class="btn ghost small icon-only delete-rule-btn" type="button" title="Eliminar regla" aria-label="Eliminar regla"><svg><use href="#i-trash" /></svg></button>
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
    rulesList.innerHTML = '<div class="pk-empty"><strong>No se pudieron cargar las reglas</strong><span>Recarga la página e inténtalo de nuevo.</span></div>';
  }
}

async function testRule(ruleId, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/gta/rules/${ruleId}/test`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar la accion.');
    await showAlert('Acción de prueba enviada. Debería ocurrir dentro de GTA V en un par de segundos. El mod tiene que estar conectado y tú en modo historia, sin pausa ni escenas.', 'Listo');
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
    await fetch(`/api/gta/rules/${ruleId}`, { method: 'DELETE' });
    await loadRules();
  } catch (error) {
    await showAlert('No se pudo eliminar la regla.', 'Error');
  }
}

function bootstrapEventListeners() {
  connectionForm.addEventListener('submit', (event) => event.preventDefault());
  connectLiveBtn.addEventListener('click', connectLive);
  disconnectBtn.addEventListener('click', disconnectLive);

  toggleKeyBtn.addEventListener('click', toggleKeyVisibility);
  downloadIniBtn.addEventListener('click', downloadConfigFile);
  copyKeyBtn.addEventListener('click', copyServerKey);
  regenerateKeyBtns.forEach((btn) => btn.addEventListener('click', regenerateServerKey));

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
  refreshGameStatus();
  setInterval(refreshGameStatus, 4000);
})().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
