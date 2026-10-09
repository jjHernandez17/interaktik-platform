const GAME_TYPE = 'robloxparkour';

const connectionForm = document.getElementById('parkourConnectionForm');
const usernameInput = document.getElementById('parkourUsernameInput');
const statusBadge = document.getElementById('parkourConnectionStatusBadge');
const connectionDetails = document.getElementById('parkourConnectionDetails');
const connectLiveBtn = document.getElementById('parkourConnectLiveBtn');
const disconnectBtn = document.getElementById('parkourDisconnectBtn');

const linkForm = document.getElementById('parkourLinkForm');
const robloxUserIdInput = document.getElementById('parkourUserIdInput');
const linkAccountBtn = document.getElementById('parkourLinkAccountBtn');
const linkStatus = document.getElementById('parkourLinkStatus');

const loadGiftsBtn = document.getElementById('parkourLoadGiftsBtn');
const ruleForm = document.getElementById('parkourRuleForm');
const giftPicker = document.getElementById('parkourGiftPicker');
const giftPickerToggle = document.getElementById('parkourGiftPickerToggle');
const giftPickerSelected = document.getElementById('parkourGiftPickerSelected');
const giftPickerPanel = document.getElementById('parkourGiftPickerPanel');
const giftPickerList = document.getElementById('parkourGiftPickerList');
const giftFilterName = document.getElementById('parkourGiftFilterName');
const giftFilterCoinsMin = document.getElementById('parkourGiftFilterCoinsMin');
const giftFilterCoinsMax = document.getElementById('parkourGiftFilterCoinsMax');
const rulePowerSelect = document.getElementById('parkourRulePowerSelect');
const nyanFields = document.getElementById('parkourNyanFields');
const superFields = document.getElementById('parkourSuperFields');
const ruleDurationInput = document.getElementById('parkourRuleDurationInput');
const ruleActionSelect = document.getElementById('parkourRuleActionSelect');
const ruleStairsInput = document.getElementById('parkourRuleStairsInput');
const ruleSaveBtn = document.getElementById('parkourRuleSaveBtn');
const rulesList = document.getElementById('parkourRulesList');
const ruleCount = document.getElementById('parkourRuleCount');
const heroTiktok = document.getElementById('parkourHeroTiktok');
const heroRoblox = document.getElementById('parkourHeroRoblox');

// En la base de datos el "power" guardado es la acción del Nyan Cat (subir / bajar)
// o "super_salto".
function ruleChip(rule) {
  if (rule.power === 'super_salto') {
    return `<span class="pk-chip pk-chip--jump"><svg width="13" height="13"><use href="#i-bolt" /></svg>Super salto · ${escapeHtml(rule.duration_seconds)} s</span>`;
  }
  const kinds = { goku_: 'Goku', puno_: 'Puño', capa_: 'Capa voladora', tung_: 'Tung Tung Sahur' };
  const kind = kinds[String(rule.power).slice(0, 5)] || 'Nyan Cat';
  const down = String(rule.power).endsWith('bajar');
  const n = Number(rule.stairs);
  return `<span class="pk-chip ${down ? 'pk-chip--down' : 'pk-chip--up'}"><svg width="13" height="13"><use href="#${down ? 'i-down' : 'i-up'}" /></svg>${kind} · ${down ? 'baja' : 'sube'} ${escapeHtml(n)} ${n === 1 ? 'escalera' : 'escaleras'}</span>`;
}

// Botones con icono: actualizar solo el texto sin perder el SVG
function setBtnLabel(button, iconId, label) {
  button.innerHTML = `<svg width="${button === ruleSaveBtn ? 16 : 14}" height="${button === ruleSaveBtn ? 16 : 14}"><use href="#${iconId}" /></svg>${label}`;
}

// Cada poder muestra solo sus propios campos.
function syncPowerFields() {
  // Nyan Cat y Puño comparten campos: acción (subir/bajar) y cantidad de escaleras.
  nyanFields.hidden = !['nyan_cat', 'puno', 'goku', 'capa', 'tung'].includes(rulePowerSelect.value);
  superFields.hidden = rulePowerSelect.value !== 'super_salto';
}

let liveEventsSource = null;
let giftCatalog = [];
let selectedGift = null;

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
// El usuario de TikTok se vincula desde la sección "Juegos" del panel (una
// sola vez, para todos los juegos). Aquí solo se lee lo que ya esté vinculado.
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
      window.interaktikResumeLive?.('robloxparkour', (info) => {
        setStatus('connected', info.message || `Conectado a @${data.tiktok_username}.`);
        connectLiveEvents();
      });
    } else {
      setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    setStatus('unlinked', 'No has vinculado un ID de TikTok Live.');
    console.error('[PARKOUR] Error restaurando conexion TikTok:', error.message);
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

// Los regalos se procesan en el servidor (aunque esta pestaña se cierre);
// este stream solo sirve para saber si la conexión sigue viva.
function connectLiveEvents() {
  if (liveEventsSource) liveEventsSource.close();

  liveEventsSource = new EventSource(`/events?gameType=${GAME_TYPE}`);
  // El estado real del live llega por este canal: se muestra tal cual (un corte del canal no significa que el live se haya caido,
  // el navegador reintenta solo y el servidor reenvia el estado al volver)
  liveEventsSource.addEventListener('status', (event) => {
    try {
      const payload = JSON.parse(event.data);
      const known = ['connected', 'connecting', 'disconnected', 'error'];
      const status = payload.status === 'live_off' ? 'error' : (known.includes(payload.status) ? payload.status : 'disconnected');
      const message = payload.status === 'live_off' ? 'El live está apagado.' : (payload.message || '');
      setStatus(status, message);
    } catch (error) {
      console.error('[LIVE] Error leyendo el estado del live:', error);
    }
  });
  liveEventsSource.addEventListener('error', () => {
    // EventSource reintenta solo; el estado real llega en el siguiente evento 'status'
  });
}

// ===== Cuenta de Roblox =====
function setLinkStatus(robloxUsername, robloxUserId) {
  if (heroRoblox) heroRoblox.dataset.state = robloxUserId ? 'on' : 'off';
  if (robloxUserId) {
    linkStatus.innerHTML = `Cuenta vinculada: <strong>${robloxUsername ? escapeHtml(robloxUsername) : 'ID ' + escapeHtml(robloxUserId)}</strong> (ID ${escapeHtml(robloxUserId)}). Puedes volver a vincular otra cuenta cuando quieras.`;
  } else {
    linkStatus.innerHTML = 'Aún no has vinculado ninguna cuenta de Roblox. Busca tu ID numérico en tu perfil de Roblox (roblox.com/users/<strong>TU_ID</strong>/profile).';
  }
}

async function loadConfig() {
  try {
    const response = await fetch('/api/roblox-parkour/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    setLinkStatus(data.robloxUsername, data.robloxUserId);
    if (data.robloxUserId) robloxUserIdInput.value = data.robloxUserId;
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

async function linkRobloxAccount(event) {
  event.preventDefault();

  const robloxUserId = normalizeText(robloxUserIdInput.value);
  if (!/^\d+$/.test(robloxUserId)) {
    await showAlert('Ingresa un ID de Roblox valido (solo numeros).', 'ID invalido');
    return;
  }

  linkAccountBtn.disabled = true;
  linkAccountBtn.textContent = 'Vinculando...';

  try {
    const response = await fetch('/api/roblox-parkour/link', {
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

// ===== Catálogo de regalos (mismo patrón que roblox-dance.js) =====
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

// ===== Reglas regalo -> poder =====
async function saveRule(event) {
  event.preventDefault();

  if (!selectedGift) {
    await showAlert('Primero carga el catalogo y selecciona un regalo.', 'Aviso');
    return;
  }

  const selectedPower = rulePowerSelect.value;
  if (!['nyan_cat', 'puno', 'goku', 'capa', 'tung', 'super_salto'].includes(selectedPower)) {
    await showAlert('Selecciona un poder.', 'Aviso');
    return;
  }

  ruleSaveBtn.disabled = true;
  setBtnLabel(ruleSaveBtn, 'i-plus', 'Guardando...');

  try {
    const response = await fetch('/api/roblox-parkour/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftImageUrl: selectedGift.imageUrl || '',
        power: selectedPower === 'super_salto'
          ? 'super_salto'
          : (['puno', 'goku', 'capa', 'tung'].includes(selectedPower) ? `${selectedPower}_${ruleActionSelect.value}` : ruleActionSelect.value),
        stairs: Number(ruleStairsInput.value) || 5,
        durationSeconds: Number(ruleDurationInput.value) || 10,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la regla.');

    await loadRules();
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    ruleSaveBtn.disabled = false;
    setBtnLabel(ruleSaveBtn, 'i-plus', 'Agregar regla');
  }
}

async function loadRules() {
  try {
    const response = await fetch('/api/roblox-parkour/rules');
    const data = await response.json();
    const rules = Array.isArray(data.rules) ? data.rules : [];

    ruleCount.textContent = String(rules.length);

    if (rules.length === 0) {
      rulesList.innerHTML = `
        <div class="pk-empty">
          <svg><use href="#i-bolt" /></svg>
          <strong>Aún no hay reglas</strong>
          <span>Crea la primera con el formulario: elige un regalo y el poder que activa.</span>
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
          <button class="btn ghost small test-rule-btn" type="button" title="Enviar este poder al juego ahora"><svg><use href="#i-play" /></svg>Probar</button>
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
    const response = await fetch(`/api/roblox-parkour/rules/${ruleId}/test`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar el poder.');
    await showAlert('Poder de prueba enviado. Deberia activarse en tu juego de Roblox en unos segundos.', 'Listo');
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
    await fetch(`/api/roblox-parkour/rules/${ruleId}`, { method: 'DELETE' });
    await loadRules();
  } catch (error) {
    await showAlert('No se pudo eliminar la regla.', 'Error');
  }
}

function bootstrapEventListeners() {
  connectionForm.addEventListener('submit', (event) => event.preventDefault());
  connectLiveBtn.addEventListener('click', connectLive);
  disconnectBtn.addEventListener('click', disconnectLive);

  linkForm.addEventListener('submit', linkRobloxAccount);

  loadGiftsBtn.addEventListener('click', () => loadGiftCatalog());
  ruleForm.addEventListener('submit', saveRule);
  rulePowerSelect.addEventListener('change', syncPowerFields);
  syncPowerFields();

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
})().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
