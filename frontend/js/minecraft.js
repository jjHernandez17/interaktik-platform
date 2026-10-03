// Minecraft interactivo: conexion TikTok, usuario de Minecraft, llave del plugin y reglas
// regalo -> accion. Mismo patron que roblox-parkour.js.
const GAME_TYPE = 'minecraft';

const connectionForm = document.getElementById('mcConnectionForm');
const usernameInput = document.getElementById('mcUsernameInput');
const statusBadge = document.getElementById('mcConnectionStatusBadge');
const connectionDetails = document.getElementById('mcConnectionDetails');
const connectLiveBtn = document.getElementById('mcConnectLiveBtn');
const disconnectBtn = document.getElementById('mcDisconnectBtn');
const heroTiktok = document.getElementById('mcHeroTiktok');
const heroServer = document.getElementById('mcHeroServer');

const bedrockBadge = document.getElementById('mcBedrockBadge');
const javaBadge = document.getElementById('mcJavaBadge');
const tabBedrock = document.getElementById('mcTabBedrock');
const tabJava = document.getElementById('mcTabJava');
const panelBedrock = document.getElementById('mcPanelBedrock');
const panelJava = document.getElementById('mcPanelJava');
const connectCommandInput = document.getElementById('mcConnectCommandInput');
const toggleCommandBtn = document.getElementById('mcToggleCommandBtn');
const copyCommandBtn = document.getElementById('mcCopyCommandBtn');
const modCommandInput = document.getElementById('mcModCommandInput');
const toggleModCommandBtn = document.getElementById('mcToggleModCommandBtn');
const copyModCommandBtn = document.getElementById('mcCopyModCommandBtn');
const regenerateKeyBtns = document.querySelectorAll('.mc-regenerate');

const userForm = document.getElementById('mcUserForm');
const minecraftUserInput = document.getElementById('mcMinecraftUserInput');
const saveUserBtn = document.getElementById('mcSaveUserBtn');
const userStatus = document.getElementById('mcUserStatus');

const serverKeyInput = document.getElementById('mcServerKeyInput');
const toggleKeyBtn = document.getElementById('mcToggleKeyBtn');
const copyKeyBtn = document.getElementById('mcCopyKeyBtn');

const loadGiftsBtn = document.getElementById('mcLoadGiftsBtn');
const ruleForm = document.getElementById('mcRuleForm');
const giftPicker = document.getElementById('mcGiftPicker');
const giftPickerToggle = document.getElementById('mcGiftPickerToggle');
const giftPickerSelected = document.getElementById('mcGiftPickerSelected');
const giftPickerPanel = document.getElementById('mcGiftPickerPanel');
const giftPickerList = document.getElementById('mcGiftPickerList');
const giftFilterName = document.getElementById('mcGiftFilterName');
const giftFilterCoinsMin = document.getElementById('mcGiftFilterCoinsMin');
const giftFilterCoinsMax = document.getElementById('mcGiftFilterCoinsMax');
const actionSelect = document.getElementById('mcActionSelect');
const amountField = document.getElementById('mcAmountField');
const amountLabel = document.getElementById('mcAmountLabel');
const amountInput = document.getElementById('mcAmountInput');
const amountHint = document.getElementById('mcAmountHint');
const ruleSaveBtn = document.getElementById('mcRuleSaveBtn');
const rulesList = document.getElementById('mcRulesList');
const ruleCount = document.getElementById('mcRuleCount');

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
    console.error('[MINECRAFT] Error restaurando conexion TikTok:', error.message);
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

// ===== Usuario de Minecraft y llave del plugin =====
function setUserStatus(minecraftUsername) {
  userStatus.innerHTML = minecraftUsername
    ? `Las acciones se aplican a <strong>${escapeHtml(minecraftUsername)}</strong>. Puedes cambiarlo cuando quieras.`
    : 'Escribe el nombre con el que juegas en tu servidor. Las acciones se aplican a ese jugador.';
}

async function loadConfig() {
  try {
    const response = await fetch('/api/minecraft/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    serverKeyInput.value = data.serverKey || '';
    connectCommandInput.value = buildConnectCommand(data.serverKey);
    modCommandInput.value = data.serverKey ? `/interaktik conectar ${data.serverKey}` : '';
    setUserStatus(data.minecraftUsername);
    if (data.minecraftUsername) minecraftUserInput.value = data.minecraftUsername;
  } catch (error) {
    serverKeyInput.value = '';
    connectCommandInput.value = '';
    modCommandInput.value = '';
    await showAlert(error.message, 'Error');
  }
}

async function saveMinecraftUser(event) {
  event.preventDefault();

  const minecraftUsername = normalizeText(minecraftUserInput.value);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(minecraftUsername)) {
    await showAlert('El usuario de Minecraft debe tener de 3 a 16 caracteres: letras, números o guion bajo.', 'Usuario inválido');
    return;
  }

  saveUserBtn.disabled = true;
  saveUserBtn.textContent = 'Guardando...';

  try {
    const response = await fetch('/api/minecraft/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minecraftUsername }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el usuario.');

    setUserStatus(data.minecraftUsername);
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    saveUserBtn.disabled = false;
    saveUserBtn.textContent = 'Guardar';
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
const copyConnectCommand = () => copyFromInput(connectCommandInput, copyCommandBtn, 'Copiar comando', 'Copiado ✓');
const copyModCommand = () => copyFromInput(modCommandInput, copyModCommandBtn, 'Copiar comando', 'Copiado ✓');

// Muestra u oculta un campo secreto (el comando lleva la llave dentro)
function toggleSecret(input, button) {
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  button.textContent = hidden ? 'Ocultar' : 'Mostrar';
}

// Comando que se pega en el chat de Bedrock: conecta el juego con la plataforma por WebSocket
function buildConnectCommand(serverKey) {
  if (!serverKey) return '';
  const wsBase = String(API_BASE_URL).replace(/^http/i, 'ws').replace(/\/+$/, '');
  return `/connect ${wsBase}/mc-bridge/${serverKey}`;
}

// ===== Pestañas Bedrock / Java =====
function selectTab(edition) {
  const bedrock = edition === 'bedrock';
  tabBedrock.classList.toggle('is-active', bedrock);
  tabJava.classList.toggle('is-active', !bedrock);
  tabBedrock.setAttribute('aria-selected', String(bedrock));
  tabJava.setAttribute('aria-selected', String(!bedrock));
  panelBedrock.hidden = !bedrock;
  panelJava.hidden = bedrock;
}

// ===== Estado de la conexión del juego (se actualiza solo) =====
function setBadge(badge, state, text) {
  badge.textContent = text;
  badge.className = `status-badge ${state}`;
}

async function refreshGameStatus() {
  if (document.hidden) return;

  try {
    const response = await fetch('/api/minecraft/status');
    if (!response.ok) return;
    const data = await response.json();

    const bedrock = data.bedrock || {};
    const java = data.java || {};

    setBadge(
      bedrockBadge,
      bedrock.connected ? 'connected' : 'disconnected',
      bedrock.connected ? 'Conectado' : 'Sin conexión',
    );

    if (java.connected && java.via === 'mod') {
      setBadge(javaBadge, 'connected', 'Mod conectado');
    } else if (java.connected) {
      setBadge(javaBadge, 'connected', java.playerOnline ? 'Plugin activo · jugador en línea' : 'Plugin activo · jugador fuera');
    } else {
      setBadge(javaBadge, 'disconnected', 'Sin conexión');
    }

    if (heroServer) heroServer.dataset.state = (bedrock.connected || java.connected) ? 'on' : 'off';
  } catch (error) {
    // se reintenta en el siguiente ciclo
  }
}

async function regenerateServerKey() {
  const confirmed = await showConfirm(
    'Se creará una llave nueva y la anterior dejará de funcionar: tendrás que pegar la nueva en el config.yml del plugin. ¿Continuar?',
    'Regenerar llave',
  );
  if (!confirmed) return;

  regenerateKeyBtns.forEach((btn) => { btn.disabled = true; });
  try {
    const response = await fetch('/api/minecraft/regenerate-key', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo regenerar la llave.');

    serverKeyInput.value = data.serverKey;
    connectCommandInput.value = buildConnectCommand(data.serverKey);
    modCommandInput.value = `/interaktik conectar ${data.serverKey}`;
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    regenerateKeyBtns.forEach((btn) => { btn.disabled = false; });
  }
}

// ===== Catálogo de acciones =====
async function loadActions() {
  try {
    const response = await fetch('/api/minecraft/actions');
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

// Cada acción muestra su propia unidad (cantidad, segundos, niveles...) con sus límites
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

// "x4" para cantidades, "40 s" para segundos y "5 niveles" / "30 bloques" para el resto
function formatAmount(amount, unit) {
  if (unit === 'cantidad') return `×${amount}`;
  if (unit === 'segundos') return `${amount} s`;
  return `${amount} ${unit}`;
}

function ruleChip(rule) {
  const action = actionById(rule.action);
  const label = action ? action.label : rule.action;
  const group = action ? action.group : 'annoy';
  const unit = action ? action.unit : '';
  const showAmount = !action || action.min !== action.max;
  const detail = showAmount ? ` · ${escapeHtml(formatAmount(rule.amount, unit))}` : '';

  return `<span class="pk-chip ${group === 'help' ? 'pk-chip--up' : 'pk-chip--down'}"><svg width="13" height="13"><use href="#${group === 'help' ? 'i-heart' : 'i-bolt'}" /></svg>${escapeHtml(label)}${detail}</span>`;
}

// ===== Catálogo de regalos (mismo patrón que roblox-parkour.js) =====
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
    const response = await fetch('/api/minecraft/rules', {
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
    const response = await fetch('/api/minecraft/rules');
    const data = await response.json();
    const rules = Array.isArray(data.rules) ? data.rules : [];

    ruleCount.textContent = String(rules.length);

    if (rules.length === 0) {
      rulesList.innerHTML = `
        <div class="pk-empty">
          <svg><use href="#i-bolt" /></svg>
          <strong>Aún no hay reglas</strong>
          <span>Crea la primera con el formulario: elige un regalo y lo que hace en tu mundo.</span>
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
    const response = await fetch(`/api/minecraft/rules/${ruleId}/test`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar la accion.');
    await showAlert('Acción de prueba enviada. Debería ocurrir en tu juego en un par de segundos (el plugin tiene que estar instalado y tú dentro del servidor).', 'Listo');
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
    await fetch(`/api/minecraft/rules/${ruleId}`, { method: 'DELETE' });
    await loadRules();
  } catch (error) {
    await showAlert('No se pudo eliminar la regla.', 'Error');
  }
}

function bootstrapEventListeners() {
  connectionForm.addEventListener('submit', (event) => event.preventDefault());
  connectLiveBtn.addEventListener('click', connectLive);
  disconnectBtn.addEventListener('click', disconnectLive);

  userForm.addEventListener('submit', saveMinecraftUser);
  toggleKeyBtn.addEventListener('click', toggleKeyVisibility);
  copyKeyBtn.addEventListener('click', copyServerKey);
  regenerateKeyBtns.forEach((btn) => btn.addEventListener('click', regenerateServerKey));
  toggleCommandBtn.addEventListener('click', () => toggleSecret(connectCommandInput, toggleCommandBtn));
  copyCommandBtn.addEventListener('click', copyConnectCommand);
  toggleModCommandBtn.addEventListener('click', () => toggleSecret(modCommandInput, toggleModCommandBtn));
  copyModCommandBtn.addEventListener('click', copyModCommand);
  tabBedrock.addEventListener('click', () => selectTab('bedrock'));
  tabJava.addEventListener('click', () => selectTab('java'));

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
