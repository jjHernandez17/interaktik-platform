// Cubo Gigante de Minecraft: conexion TikTok, llave, control del cubo (medidas, material, crear/reiniciar/quitar)
// y reglas regalo -> bloques. Mismo patron que minecraft.js.
const GAME_TYPE = 'minecraftcubo';

const $ = (id) => document.getElementById(id);

const connectionForm = $('cbConnectionForm');
const usernameInput = $('cbUsernameInput');
const statusBadge = $('cbConnectionStatusBadge');
const connectionDetails = $('cbConnectionDetails');
const connectLiveBtn = $('cbConnectLiveBtn');
const disconnectBtn = $('cbDisconnectBtn');
const heroTiktok = $('cbHeroTiktok');
const heroServer = $('cbHeroServer');
const javaBadge = $('cbJavaBadge');

const serverKeyInput = $('cbServerKeyInput');
const toggleKeyBtn = $('cbToggleKeyBtn');
const copyKeyBtn = $('cbCopyKeyBtn');
const regenerateBtn = $('cbRegenerateBtn');
const modCommandInput = $('cbModCommandInput');
const toggleModCommandBtn = $('cbToggleModCommandBtn');
const copyModCommandBtn = $('cbCopyModCommandBtn');

const widthInput = $('cbWidth');
const heightInput = $('cbHeight');
const lengthInput = $('cbLength');
const blockSelect = $('cbBlock');
const countdownInput = $('cbCountdown');
const goalInput = $('cbGoal');
const winsNowInput = $('cbWinsNow');
const winsBtn = $('cbWinsBtn');
const totalBlocks = $('cbTotalBlocks');
const sizeHint = $('cbSizeHint');
const startBtn = $('cbStartBtn');
const restartBtn = $('cbRestartBtn');
const stopBtn = $('cbStopBtn');

const loadGiftsBtn = $('cbLoadGiftsBtn');
const ruleForm = $('cbRuleForm');
const giftPicker = $('cbGiftPicker');
const giftPickerToggle = $('cbGiftPickerToggle');
const giftPickerSelected = $('cbGiftPickerSelected');
const giftPickerPanel = $('cbGiftPickerPanel');
const giftPickerList = $('cbGiftPickerList');
const giftFilterName = $('cbGiftFilterName');
const giftFilterCoinsMin = $('cbGiftFilterCoinsMin');
const giftFilterCoinsMax = $('cbGiftFilterCoinsMax');
const blocksInput = $('cbBlocksInput');
const powerSelect = $('cbPowerSelect');
const amountLabel = $('cbAmountLabel');
const amountHint = $('cbAmountHint');

// Poder de cada regla: que pone la cantidad que escribe el streamer
const POWER_INFO = {
  blocks: { label: 'Bloques por regalo', min: 1, max: 100000, def: 10, hint: 'Entre 1 y 100 000. Ejemplo: una rosa = 5 bloques, un león = 5 000.', chip: (n) => `+${formatNumber(n)} bloques`, icon: 'i-cube', tone: 'up' },
  tnt: { label: 'TNT por regalo', min: 1, max: 500, def: 5, hint: 'Entre 1 y 500. Caen desde arriba del cubo en zonas al azar y explotan al tocar un bloque.', chip: (n) => `${formatNumber(n)} TNT`, icon: 'i-bolt', tone: 'down' },
  lightning: { label: 'Fuerza del rayo (1 a 10)', min: 1, max: 10, def: 3, hint: 'Cae sobre lo que has construido. Fuerza 1 rompe unos pocos bloques; fuerza 10 abre un gran hueco. Un combo lanza varios rayos.', chip: (n) => `Rayo fuerza ${n}`, icon: 'i-bolt', tone: 'down' },
};

function syncPowerField() {
  const info = POWER_INFO[powerSelect.value] || POWER_INFO.blocks;
  amountLabel.textContent = info.label;
  amountHint.textContent = info.hint;
  blocksInput.min = String(info.min);
  blocksInput.max = String(info.max);
  blocksInput.value = String(info.def);
}
const ruleSaveBtn = $('cbRuleSaveBtn');
const rulesList = $('cbRulesList');
const ruleCount = $('cbRuleCount');

let liveEventsSource = null;
let giftCatalog = [];
let selectedGift = null;
let limits = { maxSide: 100, minSides: { width: 3, height: 2, length: 3 }, maxBlocks: 400000, maxRuleBlocks: 100000 };

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

function formatNumber(value) {
  return Number(value).toLocaleString('es');
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
    console.error('[MINECRAFT-CUBO] Error restaurando conexion TikTok:', error.message);
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

// ===== Llave y configuración =====
function setKey(key) {
  serverKeyInput.value = key || '';
  modCommandInput.value = key ? `/interaktik conectar ${key}` : '';
}

async function loadConfig() {
  try {
    const response = await fetch('/api/minecraft-cube/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    setKey(data.serverKey);
    if (data.limits) limits = data.limits;

    blockSelect.innerHTML = (data.blockChoices || []).map((choice) => (
      `<option value="${escapeHtml(choice.id)}">${escapeHtml(choice.label)}</option>`
    )).join('');

    const settings = data.settings || {};
    widthInput.value = settings.width || 10;
    heightInput.value = settings.height || 10;
    lengthInput.value = settings.length || 10;
    blockSelect.value = settings.block || '';
    countdownInput.value = settings.countdown ?? 10;
    goalInput.value = settings.goal ?? 10;
    [widthInput, heightInput, lengthInput].forEach((input) => { input.max = String(limits.maxSide); });
    refreshSizeHint();
  } catch (error) {
    setKey('');
    await showAlert(error.message, 'Error');
  }
}

function toggleSecret(input, button) {
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  button.textContent = hidden ? 'Ocultar' : 'Mostrar';
}

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

async function regenerateKey() {
  const confirmed = await showConfirm(
    'Se creará una llave nueva y la anterior dejará de funcionar: tendrás que ejecutar el instalador otra vez con la nueva. ¿Continuar?',
    'Regenerar llave',
  );
  if (!confirmed) return;

  regenerateBtn.disabled = true;
  try {
    const response = await fetch('/api/minecraft/regenerate-key', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo regenerar la llave.');
    setKey(data.serverKey);
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    regenerateBtn.disabled = false;
  }
}

// ===== Estado del juego =====
function setBadge(badge, state, text) {
  badge.textContent = text;
  badge.className = `status-badge ${state}`;
}

async function refreshGameStatus() {
  if (document.hidden) return;

  try {
    const response = await fetch('/api/minecraft-cube/status');
    if (!response.ok) return;
    const data = await response.json();

    setBadge(javaBadge, data.connected ? 'connected' : 'disconnected', data.connected ? 'Mod conectado' : 'Sin conexión');
    if (heroServer) heroServer.dataset.state = data.connected ? 'on' : 'off';
  } catch (error) {
    // se reintenta en el siguiente ciclo
  }
}

// ===== Control del cubo =====
function readCube() {
  return {
    width: Math.round(Number(widthInput.value)),
    height: Math.round(Number(heightInput.value)),
    length: Math.round(Number(lengthInput.value)),
    block: blockSelect.value,
    countdown: Math.round(Number(countdownInput.value)),
    goal: Math.round(Number(goalInput.value)),
  };
}

function validateCube(cube) {
  const sides = [cube.width, cube.height, cube.length];
  if (sides.some((value) => !Number.isFinite(value) || value > limits.maxSide)) {
    return `Cada medida puede ser de hasta ${limits.maxSide} bloques.`;
  }
  if (!Number.isFinite(cube.countdown) || cube.countdown < 0 || cube.countdown > 3600) return 'La cuenta regresiva debe estar entre 0 y 3600 segundos.';
  if (!Number.isFinite(cube.goal) || Math.abs(cube.goal) > 1000000) return 'El objetivo de wins debe estar entre -1 000 000 y 1 000 000.';
  const min = limits.minSides;
  if (cube.width < min.width || cube.height < min.height || cube.length < min.length) {
    return `Medidas mínimas: ancho ${min.width}, alto ${min.height} y largo ${min.length} (el vidrio ocupa el borde).`;
  }
  if (innerBlocks(cube) > limits.maxBlocks) {
    return `El interior no puede pasar de ${formatNumber(limits.maxBlocks)} bloques.`;
  }
  return '';
}

// El vidrio ocupa el piso y las paredes: se llena solo el interior
function innerBlocks(cube) {
  return Math.max(0, cube.width - 2) * Math.max(0, cube.height - 1) * Math.max(0, cube.length - 2);
}

function refreshSizeHint() {
  const cube = readCube();
  const error = validateCube(cube);
  const total = innerBlocks(cube);
  totalBlocks.textContent = Number.isFinite(total) ? formatNumber(total) : '—';
  sizeHint.textContent = error || `Cada cubo se llena con ${formatNumber(total)} bloques (el vidrio va dentro de esas medidas) y da 1 victoria.`;
  sizeHint.classList.toggle('is-error', Boolean(error));
}

async function setWins() {
  const winsNow = Math.round(Number(winsNowInput.value));
  if (!Number.isFinite(winsNow) || Math.abs(winsNow) > 1000000) {
    await showAlert('Los wins deben estar entre -1 000 000 y 1 000 000.', 'Wins no válidos');
    return;
  }
  winsBtn.disabled = true;
  try {
    const response = await fetch('/api/minecraft-cube/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'wins', winsNow }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar la orden.');
    await showAlert(`Wins fijados en ${winsNow}.`, 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    winsBtn.disabled = false;
  }
}

async function controlCube(action, button, doneMessage) {
  const cube = readCube();
  if (action === 'start') {
    const error = validateCube(cube);
    if (error) {
      await showAlert(error, 'Medidas no válidas');
      return;
    }
  }

  if (action === 'restart' && !(await showConfirm('Se vaciarán todos los cubos y empezarán de nuevo (con sus propias medidas). ¿Continuar?', 'Reiniciar cubos'))) return;
  if (action === 'stop' && !(await showConfirm('Se quitarán todos los cubos del mundo. Las victorias se conservan. ¿Continuar?', 'Quitar cubos'))) return;

  const buttons = [startBtn, restartBtn, stopBtn];
  buttons.forEach((btn) => { btn.disabled = true; });
  try {
    const response = await fetch('/api/minecraft-cube/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...cube }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar la orden.');
    await showAlert(doneMessage, 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    buttons.forEach((btn) => { btn.disabled = false; });
  }
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

// ===== Reglas regalo -> bloques =====
async function saveRule(event) {
  event.preventDefault();

  if (!selectedGift) {
    await showAlert('Primero carga el catalogo y selecciona un regalo.', 'Aviso');
    return;
  }

  const power = powerSelect.value;
  const info = POWER_INFO[power] || POWER_INFO.blocks;
  const amount = Math.round(Number(blocksInput.value));
  if (!Number.isFinite(amount) || amount < info.min || amount > info.max) {
    await showAlert(`${info.label} debe estar entre ${formatNumber(info.min)} y ${formatNumber(info.max)}.`, 'Aviso');
    return;
  }

  ruleSaveBtn.disabled = true;
  setBtnLabel(ruleSaveBtn, 'i-plus', 'Guardando...', 16);

  try {
    const response = await fetch('/api/minecraft-cube/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftImageUrl: selectedGift.imageUrl || '',
        power,
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

function ruleChip(rule) {
  const info = POWER_INFO[rule.power] || POWER_INFO.blocks;
  const amount = rule.amount ?? rule.blocks;
  return `<span class="pk-chip pk-chip--${info.tone}"><svg width="13" height="13"><use href="#${info.icon}" /></svg>${escapeHtml(info.chip(amount))}</span>`;
}

async function loadRules() {
  try {
    const response = await fetch('/api/minecraft-cube/rules');
    const data = await response.json();
    const rules = Array.isArray(data.rules) ? data.rules : [];

    ruleCount.textContent = String(rules.length);

    if (rules.length === 0) {
      rulesList.innerHTML = `
        <div class="pk-empty">
          <svg><use href="#i-cube" /></svg>
          <strong>Aún no hay reglas</strong>
          <span>Crea la primera con el formulario: elige un regalo y cuántos bloques pone.</span>
        </div>`;
      return;
    }

    rulesList.innerHTML = rules.map((rule) => `
      <div class="rule-item" data-rule-id="${rule.id}">
        ${rule.gift_image_url
    ? `<img class="rule-gift" src="${escapeHtml(rule.gift_image_url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), {className: 'rule-gift placeholder'}))" />`
    : '<span class="rule-gift placeholder"><svg><use href="#i-cube" /></svg></span>'}
        <div class="rule-info">
          <strong>${escapeHtml(rule.gift_name)}</strong>
          ${ruleChip(rule)}
        </div>
        <div class="rule-actions">
          <button class="btn ghost small test-rule-btn" type="button" title="Colocar estos bloques en tu cubo ahora"><svg><use href="#i-play" /></svg>Probar</button>
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
    const response = await fetch(`/api/minecraft-cube/rules/${ruleId}/test`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar la regla.');
    await showAlert('Enviado. Los bloques se colocan en tu cubo en un par de segundos (el cubo tiene que estar creado y tú dentro del mundo).', 'Listo');
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
    await fetch(`/api/minecraft-cube/rules/${ruleId}`, { method: 'DELETE' });
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
  copyKeyBtn.addEventListener('click', () => copyFromInput(serverKeyInput, copyKeyBtn, 'Copiar llave', 'Copiada ✓'));
  regenerateBtn.addEventListener('click', regenerateKey);
  toggleModCommandBtn.addEventListener('click', () => toggleSecret(modCommandInput, toggleModCommandBtn));
  copyModCommandBtn.addEventListener('click', () => copyFromInput(modCommandInput, copyModCommandBtn, 'Copiar comando', 'Copiado ✓'));

  [widthInput, heightInput, lengthInput].forEach((input) => input.addEventListener('input', refreshSizeHint));
  $('cbCubeForm').addEventListener('submit', (event) => event.preventDefault());
  startBtn.addEventListener('click', () => controlCube('start', startBtn, 'Cubo nuevo creado frente a ti. Si no lo ves, revisa que estés dentro del mundo.'));
  restartBtn.addEventListener('click', () => controlCube('restart', restartBtn, 'Cubos vaciados: empiezan de nuevo.'));
  stopBtn.addEventListener('click', () => controlCube('stop', stopBtn, 'Se están quitando los cubos.'));

  winsBtn.addEventListener('click', () => setWins());
  powerSelect.addEventListener('change', syncPowerField);
  loadGiftsBtn.addEventListener('click', () => loadGiftCatalog());
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
  await loadGiftCatalog(true);
  refreshGameStatus();
  setInterval(refreshGameStatus, 4000);
})().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
