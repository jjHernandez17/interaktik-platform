const GAME_TYPE = 'roblox';

const robloxConnectionForm = document.getElementById('robloxConnectionForm');
const usernameInput = document.getElementById('robloxUsernameInput');
const statusBadge = document.getElementById('robloxConnectionStatusBadge');
const connectionDetails = document.getElementById('robloxConnectionDetails');
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
const downloadTemplateBtn = document.getElementById('robloxDownloadTemplateBtn');
const ruleCount = document.getElementById('robloxRuleCount');
const heroTiktok = document.getElementById('robloxHeroTiktok');
const heroRoblox = document.getElementById('robloxHeroRoblox');

// Botones con icono: actualizar solo el texto sin perder el SVG
function setBtnLabel(button, iconId, label, size = 14) {
  button.innerHTML = `<svg width="${size}" height="${size}"><use href="#${iconId}" /></svg>${label}`;
}

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
  if (heroTiktok) heroTiktok.dataset.state = (status === 'connected' || status === 'linked') ? 'on' : 'off';
  if (message) connectionDetails.textContent = message;
}

function lockUsernameInput() {
  usernameInput.disabled = true;
  connectLiveBtn.disabled = false;
}

function unlockUsernameInput() {
  usernameInput.disabled = true;
  connectLiveBtn.disabled = true;
}

// El usuario de TikTok se vincula desde la sección "Juegos" del panel (una
// sola vez, para todos los juegos) — ver platform.js. Aca solo se lee lo que
// ya haya quedado vinculado, para reflejarlo en el input bloqueado.
async function restoreTiktokConnection() {
  unlockUsernameInput();

  try {
    const response = await fetch(`/api/tiktok-connection/${GAME_TYPE}`);
    if (!response.ok) {
      setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
      return;
    }

    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      usernameInput.value = `@${data.tiktok_username}`;
      lockUsernameInput();
      setStatus('linked', `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
      window.interaktikResumeLive?.('roblox', (info) => {
        liveConnected = true;
        setStatus('connected', info.message || `Conectado a @${data.tiktok_username}.`);
        connectLiveEvents();
      });
    } else {
      setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    setStatus('unlinked', 'No has vinculado un ID de TikTok Live.');
    console.error('[ROBLOX] Error restaurando conexion TikTok:', error.message);
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

  // El estado real del live llega por este canal: se muestra tal cual (un corte del canal no significa que el live se haya caido,
  // el navegador reintenta solo y el servidor reenvia el estado al volver)
  liveEventsSource.addEventListener('status', (event) => {
    try {
      const payload = JSON.parse(event.data);
      const known = ['connected', 'connecting', 'disconnected', 'error'];
      const status = payload.status === 'live_off' ? 'error' : (known.includes(payload.status) ? payload.status : 'disconnected');
      const message = payload.status === 'live_off' ? 'El live está apagado.' : (payload.message || '');
      liveConnected = payload.status === 'connected';
      setStatus(status, message);
    } catch (error) {
      console.error('[LIVE] Error leyendo el estado del live:', error);
    }
  });
  liveEventsSource.addEventListener('error', () => {
    // EventSource reintenta solo; el estado real llega en el siguiente evento 'status'
  });
}

function setLinkStatus(robloxUsername, robloxUserId) {
  if (heroRoblox) heroRoblox.dataset.state = robloxUserId ? 'on' : 'off';
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

    if (!silent) {
      await showAlert(`Catalogo cargado: ${giftCatalog.length} regalos.`, 'Listo');
    }
  } catch (error) {
    if (!silent) {
      await showAlert(error.message, 'Error');
    }
  } finally {
    loadGiftsBtn.disabled = false;
    setBtnLabel(loadGiftsBtn, 'i-refresh', 'Actualizar regalos');
  }
}

async function saveRule(event) {
  event.preventDefault();

  if (!selectedGift) {
    await showAlert('Primero carga el catalogo y selecciona un regalo.', 'Aviso');
    return;
  }

  ruleSaveBtn.disabled = true;
  setBtnLabel(ruleSaveBtn, 'i-plus', 'Guardando...', 16);

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
    setBtnLabel(ruleSaveBtn, 'i-plus', 'Agregar regla', 16);
  }
}

const POWER_LABELS = {
  fuego: 'Fuego',
  brillo: 'Brillo',
  gigante_principal: 'Gigante principal',
  sesion_fotos: 'Sesión de fotos',
};

const POWER_DESCRIPTIONS = {
  fuego: (seconds) => `Tu personaje se prende en fuego por ${seconds}s`,
  brillo: (seconds) => `Tu personaje brilla por ${seconds}s`,
  gigante_principal: (seconds) => `Un gigante cae encima de todos los players y los manda a volar por ${seconds}s`,
  sesion_fotos: (seconds) => `Tu personaje se hace gigante y la cámara le hace una sesión de fotos por ${seconds}s`,
};

function getPowerDescription(power, seconds) {
  const build = POWER_DESCRIPTIONS[power];
  if (build) return build(seconds);
  return `${POWER_LABELS[power] || power} · ${seconds}s`;
}

const POWER_CHIPS = {
  fuego: { cls: 'fire', icon: 'i-flame' },
  brillo: { cls: 'glow', icon: 'i-sparkle' },
  gigante_principal: { cls: 'giant', icon: 'i-giant' },
  sesion_fotos: { cls: 'photo', icon: 'i-camera' },
};

function powerChip(rule) {
  const chip = POWER_CHIPS[rule.power] || { cls: 'giant', icon: 'i-bolt' };
  return `<span class="pk-chip pk-chip--${chip.cls}"><svg width="13" height="13"><use href="#${chip.icon}" /></svg>${escapeHtml(POWER_LABELS[rule.power] || rule.power)} · ${escapeHtml(rule.duration_seconds)} s</span>`;
}

let currentRules = [];

async function loadRules() {
  try {
    const response = await fetch('/api/roblox-dance/rules');
    const data = await response.json();
    const rules = Array.isArray(data.rules) ? data.rules : [];
    currentRules = rules;

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
          ${powerChip(rule)}
        </div>
        <div class="rule-actions">
          <button class="btn ghost small test-rule-btn" type="button" title="Activar este poder ahora"><svg><use href="#i-play" /></svg>Probar</button>
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

async function loadProxiedImage(url) {
  if (!url) return null;

  try {
    const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      console.warn('[RobloxDance] No se pudo obtener la imagen del regalo:', url, response.status);
      return null;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
      });
      return img;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    console.warn('[RobloxDance] Error cargando imagen del regalo:', url, error);
    return null;
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function downloadRulesTemplate() {
  if (currentRules.length === 0) {
    await showAlert('Primero crea al menos una regla.', 'Aviso');
    return;
  }

  downloadTemplateBtn.disabled = true;
  setBtnLabel(downloadTemplateBtn, 'i-download', 'Generando...');

  try {
    const WIDTH = 860;
    const PADDING = 24;
    const HEADER_HEIGHT = 90;
    const ROW_HEIGHT = 88;
    const ROW_GAP = 12;
    const ICON_SIZE = 60;

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEADER_HEIGHT + currentRules.length * (ROW_HEIGHT + ROW_GAP) + PADDING;
    const ctx = canvas.getContext('2d');

    const images = await Promise.all(currentRules.map((rule) => loadProxiedImage(rule.gift_image_url)));

    // Encabezado
    ctx.fillStyle = 'rgba(15, 18, 28, 0.85)';
    drawRoundedRect(ctx, PADDING, 12, WIDTH - PADDING * 2, HEADER_HEIGHT - 24, 16);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Reglas: regalo → poder', PADDING + 22, 12 + (HEADER_HEIGHT - 24) / 2);

    currentRules.forEach((rule, index) => {
      const y = HEADER_HEIGHT + index * (ROW_HEIGHT + ROW_GAP);

      ctx.fillStyle = 'rgba(15, 18, 28, 0.78)';
      drawRoundedRect(ctx, PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT, 14);
      ctx.fill();

      const img = images[index];
      const iconX = PADDING + 16;
      const iconY = y + (ROW_HEIGHT - ICON_SIZE) / 2;
      if (img) {
        ctx.drawImage(img, iconX, iconY, ICON_SIZE, ICON_SIZE);
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        drawRoundedRect(ctx, iconX, iconY, ICON_SIZE, ICON_SIZE, 8);
        ctx.fill();
      }

      const textX = iconX + ICON_SIZE + 20;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.fillText(rule.gift_name, textX, y + ROW_HEIGHT / 2 - 14);

      ctx.fillStyle = '#bec3ff';
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText(getPowerDescription(rule.power, rule.duration_seconds), textX, y + ROW_HEIGHT / 2 + 14);
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen.');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reglas-regalos.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    await showAlert(error.message || 'No se pudo generar la plantilla.', 'Error');
  } finally {
    downloadTemplateBtn.disabled = false;
    setBtnLabel(downloadTemplateBtn, 'i-download', 'Descargar plantilla (PNG)');
  }
}

function bootstrapEventListeners() {
  if (robloxConnectionForm) {
    robloxConnectionForm.addEventListener('submit', (event) => event.preventDefault());
  }

  connectLiveBtn.addEventListener('click', connectLive);
  disconnectBtn.addEventListener('click', disconnectLive);

  configForm.addEventListener('submit', saveConfig);
  linkForm.addEventListener('submit', linkRobloxAccount);
  testSpawnBtn.addEventListener('click', sendTestSpawn);

  loadGiftsBtn.addEventListener('click', () => loadGiftCatalog());
  ruleForm.addEventListener('submit', saveRule);
  downloadTemplateBtn.addEventListener('click', downloadRulesTemplate);

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
