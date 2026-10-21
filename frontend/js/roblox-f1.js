const GAME_TYPE = 'robloxf1';

// Cuando el juego este publicado en Roblox, su enlace va aqui y aparece el boton "Abrir en Roblox".
const ROBLOX_GAME_URL = '';

// Mismos poderes y objetivos que entiende el servidor (backend/src/services/robloxF1Service.js) y el juego de Roblox.
const POWER_CATALOG = {
  turbo: { label: 'Turbo', def: 8, category: 'boost', help: 'El carro acelera un 45 % durante unos segundos y deja una estela de fuego azul.', defTarget: 'self' },
  shield: { label: 'Escudo', def: 10, category: 'support', help: 'El carro queda protegido: el aceite de los demás no lo frena.', defTarget: 'self' },
  slow: { label: 'Aceite', def: 6, category: 'attack', help: 'Un charco de aceite: el carro afectado va a la mitad de velocidad.', defTarget: 'leader' },
};

const TARGET_CATALOG = {
  self: 'El carro de quien manda el regalo',
  leader: 'El que va primero',
  last: 'El que va último',
  random: 'Uno al azar',
};

const connectionForm = document.getElementById('f1ConnectionForm');
const usernameInput = document.getElementById('f1UsernameInput');
const statusBadge = document.getElementById('f1ConnectionStatusBadge');
const connectionDetails = document.getElementById('f1ConnectionDetails');
const connectLiveBtn = document.getElementById('f1ConnectLiveBtn');
const disconnectBtn = document.getElementById('f1DisconnectBtn');

const linkForm = document.getElementById('f1LinkForm');
const robloxUserIdInput = document.getElementById('f1UserIdInput');
const linkAccountBtn = document.getElementById('f1LinkAccountBtn');
const linkStatus = document.getElementById('f1LinkStatus');
const heroTiktok = document.getElementById('f1HeroTiktok');
const heroRoblox = document.getElementById('f1HeroRoblox');
const openRobloxLink = document.getElementById('f1OpenRoblox');

const settingsForm = document.getElementById('f1SettingsForm');
const keywordInput = document.getElementById('f1Keyword');
const keywordHint = document.getElementById('f1KeywordHint');
const lapsInput = document.getElementById('f1Laps');
const lobbyInput = document.getElementById('f1LobbySeconds');
const settingsSaveBtn = document.getElementById('f1SettingsSaveBtn');
const saveState = document.getElementById('f1SaveState');
const stepWord = document.getElementById('f1StepWord');
const testJoinBtn = document.getElementById('f1TestJoinBtn');

const leaderboardEl = document.getElementById('f1Leaderboard');
const racesPlayedEl = document.getElementById('f1RacesPlayed');
const resetScoreBtn = document.getElementById('f1ResetScoreBtn');

const loadGiftsBtn = document.getElementById('f1LoadGiftsBtn');
const ruleForm = document.getElementById('f1RuleForm');
const giftPicker = document.getElementById('f1GiftPicker');
const giftPickerToggle = document.getElementById('f1GiftPickerToggle');
const giftPickerSelected = document.getElementById('f1GiftPickerSelected');
const giftPickerPanel = document.getElementById('f1GiftPickerPanel');
const giftPickerList = document.getElementById('f1GiftPickerList');
const giftFilterName = document.getElementById('f1GiftFilterName');
const giftFilterCoinsMin = document.getElementById('f1GiftFilterCoinsMin');
const giftFilterCoinsMax = document.getElementById('f1GiftFilterCoinsMax');
const rulePowerSelect = document.getElementById('f1RulePowerSelect');
const ruleTargetSelect = document.getElementById('f1RuleTargetSelect');
const powerHelp = document.getElementById('f1PowerHelp');
const ruleSecondsInput = document.getElementById('f1RuleSecondsInput');
const ruleSaveBtn = document.getElementById('f1RuleSaveBtn');
const rulesList = document.getElementById('f1RulesList');
const ruleCount = document.getElementById('f1RuleCount');

let liveEventsSource = null;
let giftCatalog = [];
let selectedGift = null;
let scoreTimer = null;

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
function setBtnLabel(button, iconId, label) {
  button.innerHTML = `<svg width="${button === ruleSaveBtn ? 16 : 14}" height="${button === ruleSaveBtn ? 16 : 14}"><use href="#${iconId}" /></svg>${label}`;
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
// El usuario de TikTok se vincula desde la sección "Juegos" del panel (una sola vez, para todos los juegos).
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
      window.interaktikResumeLive?.(GAME_TYPE, (info) => {
        setStatus('connected', info.message || `Conectado a @${data.tiktok_username}.`);
        connectLiveEvents();
      });
    } else {
      setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    setStatus('unlinked', 'No has vinculado un ID de TikTok Live.');
    console.error('[F1] Error restaurando conexion TikTok:', error.message);
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

// Los regalos se procesan en el servidor (aunque esta pestaña se cierre); este canal solo sirve para saber si el live sigue conectado.
function connectLiveEvents() {
  if (liveEventsSource) liveEventsSource.close();

  liveEventsSource = new EventSource(`/events?gameType=${GAME_TYPE}`);
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
    linkStatus.innerHTML = `Cuenta vinculada: <strong>${robloxUsername ? escapeHtml(robloxUsername) : 'ID ' + escapeHtml(robloxUserId)}</strong> (ID ${escapeHtml(robloxUserId)}). Entra al juego con esa cuenta. Puedes volver a vincular otra cuando quieras.`;
  } else {
    linkStatus.innerHTML = 'Aún no has vinculado ninguna cuenta de Roblox. Busca tu ID numérico en tu perfil de Roblox (roblox.com/users/<strong>TU_ID</strong>/profile).';
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
    const response = await fetch('/api/roblox-f1/link', {
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

// ===== Carrera y ranking =====
function paintKeyword() {
  const word = normalizeText(keywordInput.value).toLowerCase().replace(/[^a-z0-9]/g, '') || 'unirme';
  keywordHint.textContent = `Con cuenta de Roblox: "!${word} 123456789" (su ID numérico) y corren con su skin. Sin cuenta: solo "1" y les toca una skin aleatoria.`;
  if (stepWord) stepWord.textContent = `!${word}`;
}

function applySettings(settings) {
  keywordInput.value = settings.joinKeyword;
  lapsInput.value = settings.laps;
  lobbyInput.value = settings.lobbySeconds;
  paintKeyword();
}

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const total = Number(seconds);
  return `${Math.floor(total / 60)}:${(total % 60).toFixed(1).padStart(4, '0')}`;
}

function applyLeaderboard(leaderboard) {
  const list = Array.isArray(leaderboard) ? leaderboard : [];
  if (list.length === 0) {
    leaderboardEl.innerHTML = '<li class="f1-leaderboard-empty">Todavía no hay carreras terminadas.</li>';
    return;
  }

  leaderboardEl.innerHTML = list.map((entry, index) => `
    <li class="f1-leaderboard-row">
      <span class="f1-leaderboard-pos">${index + 1}</span>
      <span class="f1-leaderboard-name">${escapeHtml(entry.nickname || entry.uniqueId)}</span>
      <span class="f1-leaderboard-stats"><b>${escapeHtml(entry.wins)}</b> victorias · ${escapeHtml(entry.podiums)} podios · mejor ${escapeHtml(formatTime(entry.bestTime))}</span>
    </li>`).join('');
}

function showSaveState(text, tone = '') {
  saveState.textContent = text;
  saveState.dataset.tone = tone;
  if (text) setTimeout(() => { if (saveState.textContent === text) saveState.textContent = ''; }, 3500);
}

async function loadConfig() {
  try {
    const response = await fetch('/api/roblox-f1/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    setLinkStatus(data.robloxUsername, data.robloxUserId);
    if (data.robloxUserId) robloxUserIdInput.value = data.robloxUserId;
    applySettings(data.settings);
    racesPlayedEl.textContent = data.racesPlayed ?? 0;
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

async function saveSettings(event) {
  event.preventDefault();

  settingsSaveBtn.disabled = true;
  showSaveState('Guardando...');

  try {
    const response = await fetch('/api/roblox-f1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        joinKeyword: keywordInput.value,
        laps: Number(lapsInput.value),
        lobbySeconds: Number(lobbyInput.value),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');

    applySettings(data.settings);
    showSaveState('Cambios guardados. El juego los toma en la siguiente carrera.', 'ok');
  } catch (error) {
    showSaveState('');
    await showAlert(error.message, 'No se guardó');
  } finally {
    settingsSaveBtn.disabled = false;
  }
}

async function refreshLeaderboard() {
  try {
    const response = await fetch('/api/roblox-f1/leaderboard');
    if (!response.ok) return;
    const data = await response.json();
    applyLeaderboard(data.leaderboard);
  } catch (error) {
    // se vuelve a pedir en unos segundos
  }
}

function startScorePolling() {
  if (scoreTimer) return;
  scoreTimer = setInterval(() => {
    if (!document.hidden) refreshLeaderboard();
  }, 8000);
}

async function resetScore() {
  const confirmed = await showConfirm('¿Borrar el ranking? Se pierden las victorias y podios de todos los espectadores.', 'Reiniciar ranking');
  if (!confirmed) return;

  try {
    const response = await fetch('/api/roblox-f1/score/reset', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo reiniciar el ranking.');
    applyLeaderboard(data.leaderboard);
    racesPlayedEl.textContent = '0';
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

async function testJoin() {
  testJoinBtn.disabled = true;
  try {
    const response = await fetch('/api/roblox-f1/test-join', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar la prueba.');
    await showAlert('Se envió un piloto de prueba. Debería aparecer en la parrilla de tu juego de Roblox en un par de segundos.', 'Listo');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    testJoinBtn.disabled = false;
  }
}

// ===== Catálogo de regalos (mismo patrón que roblox-fighters.js) =====
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
function fillSelects() {
  rulePowerSelect.innerHTML = '<option value="">Selecciona un poder</option>' + Object.entries(POWER_CATALOG)
    .map(([id, power]) => `<option value="${id}">${escapeHtml(power.label)}</option>`)
    .join('');
  ruleTargetSelect.innerHTML = Object.entries(TARGET_CATALOG)
    .map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`)
    .join('');
}

function syncPowerFields() {
  const power = POWER_CATALOG[rulePowerSelect.value];
  powerHelp.textContent = power ? power.help : 'Elige qué pasa cuando llega el regalo.';
  if (power) {
    ruleSecondsInput.value = power.def;
    ruleTargetSelect.value = power.defTarget;
  }
}

function describeRule(rule) {
  const power = POWER_CATALOG[rule.power];
  const target = TARGET_CATALOG[rule.target] || rule.target;
  return {
    text: `${power ? power.label : rule.power} · ${rule.seconds} s`,
    target,
    category: power ? power.category : 'attack',
  };
}

async function saveRule(event) {
  event.preventDefault();

  if (!selectedGift) {
    await showAlert('Primero carga el catalogo y selecciona un regalo.', 'Aviso');
    return;
  }

  const power = POWER_CATALOG[rulePowerSelect.value];
  if (!power) {
    await showAlert('Selecciona un poder.', 'Aviso');
    return;
  }

  ruleSaveBtn.disabled = true;
  setBtnLabel(ruleSaveBtn, 'i-plus', 'Guardando...');

  try {
    const response = await fetch('/api/roblox-f1/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftImageUrl: selectedGift.imageUrl || '',
        power: rulePowerSelect.value,
        target: ruleTargetSelect.value,
        seconds: Number(ruleSecondsInput.value) || power.def,
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
    const response = await fetch('/api/roblox-f1/rules');
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

    rulesList.innerHTML = rules.map((rule) => {
      const info = describeRule(rule);
      return `
      <div class="rule-item" data-rule-id="${rule.id}">
        ${rule.gift_image_url
          ? `<img class="rule-gift" src="${escapeHtml(rule.gift_image_url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), {className: 'rule-gift placeholder'}))" />`
          : '<span class="rule-gift placeholder"><svg><use href="#i-bolt" /></svg></span>'}
        <div class="rule-info">
          <strong>${escapeHtml(rule.gift_name)}</strong>
          <div class="pf-rule-meta">
            <span class="pk-chip pk-chip--${escapeHtml(info.category)}"><svg width="13" height="13"><use href="#i-bolt" /></svg>${escapeHtml(info.text)}</span>
            <span class="pk-hint">→ ${escapeHtml(info.target)}</span>
          </div>
        </div>
        <div class="rule-actions">
          <button class="btn ghost small test-rule-btn" type="button" title="Enviar este poder a tu juego de Roblox"><svg><use href="#i-play" /></svg>Probar</button>
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
    const response = await fetch(`/api/roblox-f1/rules/${ruleId}/test`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar el poder.');
    await showAlert('Poder de prueba enviado. Se aplica cuando la carrera está en marcha (verde); si estás en la parrilla, entra al empezar.', 'Listo');
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
    await fetch(`/api/roblox-f1/rules/${ruleId}`, { method: 'DELETE' });
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

  settingsForm.addEventListener('submit', saveSettings);
  keywordInput.addEventListener('input', paintKeyword);
  resetScoreBtn.addEventListener('click', resetScore);
  testJoinBtn.addEventListener('click', testJoin);

  fillSelects();
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
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshLeaderboard();
  });

  if (ROBLOX_GAME_URL && openRobloxLink) {
    openRobloxLink.href = ROBLOX_GAME_URL;
    openRobloxLink.hidden = false;
  }
}

(async function init() {
  bootstrapEventListeners();
  await loadConfig();
  await restoreTiktokConnection();
  await loadRules();
  await refreshLeaderboard();
  await loadGiftCatalog(true);
  startScorePolling();
})().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
