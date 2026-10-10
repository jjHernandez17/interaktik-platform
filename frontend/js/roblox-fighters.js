const GAME_TYPE = 'robloxfighters';

// Cuando el juego este publicado en Roblox, su enlace va aqui y aparece el boton "Abrir en Roblox".
const ROBLOX_GAME_URL = 'https://www.roblox.com/games/70535718261477';

// Mismos poderes y estilos que entiende el servidor (backend/src/services/robloxFightersService.js) y el juego de Roblox.
const POWER_CATALOG = {
  golpe: { label: 'Golpe fuerte', kind: 'amount', unit: 'de daño', def: 60, category: 'attack', help: 'Un golpe directo al rival: el luchador corre hacia él y le pega.' },
  hadouken: { label: 'Bola de energía', kind: 'amount', unit: 'de daño', def: 90, category: 'attack', help: 'El luchador lanza una bola de energía que cruza la arena.' },
  super: { label: 'Súper ataque', kind: 'amount', unit: 'de daño', def: 300, category: 'attack', help: 'El golpe final: pantalla en cámara lenta y un ataque devastador.' },
  meteoros: { label: 'Lluvia de meteoros', kind: 'amount', unit: 'meteoros', def: 6, category: 'attack', help: 'Caen meteoros del cielo sobre el rival (cada uno quita un poco de vida).' },
  curar: { label: 'Curar', kind: 'amount', unit: 'de vida', def: 150, category: 'support', help: 'Le devuelve vida al luchador del espectador.' },
  escudo: { label: 'Escudo', kind: 'amount', unit: 'de protección', def: 200, category: 'support', help: 'Un escudo que absorbe el daño antes de tocar su vida.' },
  furia: { label: 'Furia', kind: 'duration', unit: 's de doble daño', def: 10, category: 'boost', help: 'Durante unos segundos pega el doble de fuerte.' },
  velocidad: { label: 'Velocidad', kind: 'duration', unit: 's más rápido', def: 10, category: 'boost', help: 'Durante unos segundos se mueve y ataca mucho más rápido.' },
  congelar: { label: 'Congelar al rival', kind: 'duration', unit: 's congelado', def: 3, category: 'control', help: 'El rival queda congelado y no puede hacer nada.' },
  estilo: { label: 'Cambiar estilo de pelea', kind: 'style', unit: '', def: 0, category: 'style', help: 'El luchador cambia a otro estilo de pelea con sus propios golpes.' },
};

const STYLE_CATALOG = {
  boxeador: { label: 'Boxeador', note: 'Golpes rápidos y ganchos, con muy buena defensa.' },
  karateka: { label: 'Karateka', note: 'Equilibrado: patadas, uppercut y bola de energía.' },
  luchador: { label: 'Luchador', note: 'Lento pero muy fuerte: agarres y golpes de gran daño.' },
  ninja: { label: 'Ninja', note: 'Veloz: saltos, esquives y lluvia de shurikens.' },
  taekwondo: { label: 'Taekwondista', note: 'Patadas de largo alcance y giros que barren la arena.' },
};


const connectionForm = document.getElementById('pfConnectionForm');
const usernameInput = document.getElementById('pfUsernameInput');
const statusBadge = document.getElementById('pfConnectionStatusBadge');
const connectionDetails = document.getElementById('pfConnectionDetails');
const connectLiveBtn = document.getElementById('pfConnectLiveBtn');
const disconnectBtn = document.getElementById('pfDisconnectBtn');

const linkForm = document.getElementById('pfLinkForm');
const robloxUserIdInput = document.getElementById('pfUserIdInput');
const linkAccountBtn = document.getElementById('pfLinkAccountBtn');
const linkStatus = document.getElementById('pfLinkStatus');
const heroTiktok = document.getElementById('pfHeroTiktok');
const heroRoblox = document.getElementById('pfHeroRoblox');
const openRobloxLink = document.getElementById('pfOpenRoblox');

const sideInputs = {
  left: {
    card: document.querySelector('.pf-side-card[data-side="left"]'),
    name: document.getElementById('pfLeftName'),
    color: document.getElementById('pfLeftColor'),
    style: document.getElementById('pfLeftStyle'),
    note: document.getElementById('pfLeftStyleNote'),
    joinHint: document.getElementById('pfLeftJoinHint'),
  },
  right: {
    card: document.querySelector('.pf-side-card[data-side="right"]'),
    name: document.getElementById('pfRightName'),
    color: document.getElementById('pfRightColor'),
    style: document.getElementById('pfRightStyle'),
    note: document.getElementById('pfRightStyleNote'),
    joinHint: document.getElementById('pfRightJoinHint'),
  },
};

const settingsForm = document.getElementById('pfSettingsForm');
const winGoalInput = document.getElementById('pfWinGoal');
const roundSecondsInput = document.getElementById('pfRoundSeconds');
const maxHealthInput = document.getElementById('pfMaxHealth');
const settingsSaveBtn = document.getElementById('pfSettingsSaveBtn');
const saveState = document.getElementById('pfSaveState');

const scoreLeft = document.getElementById('pfScoreLeft');
const scoreRight = document.getElementById('pfScoreRight');
const scoreLeftName = document.getElementById('pfScoreLeftName');
const scoreRightName = document.getElementById('pfScoreRightName');
const scoreGoal = document.getElementById('pfScoreGoal');
const champLeft = document.getElementById('pfChampLeft');
const champRight = document.getElementById('pfChampRight');
const resetScoreBtn = document.getElementById('pfResetScoreBtn');
const stepLeftWord = document.getElementById('pfStepLeftWord');
const stepRightWord = document.getElementById('pfStepRightWord');

const loadGiftsBtn = document.getElementById('pfLoadGiftsBtn');
const ruleForm = document.getElementById('pfRuleForm');
const giftPicker = document.getElementById('pfGiftPicker');
const giftPickerToggle = document.getElementById('pfGiftPickerToggle');
const giftPickerSelected = document.getElementById('pfGiftPickerSelected');
const giftPickerPanel = document.getElementById('pfGiftPickerPanel');
const giftPickerList = document.getElementById('pfGiftPickerList');
const giftFilterName = document.getElementById('pfGiftFilterName');
const giftFilterCoinsMin = document.getElementById('pfGiftFilterCoinsMin');
const giftFilterCoinsMax = document.getElementById('pfGiftFilterCoinsMax');
const rulePowerSelect = document.getElementById('pfRulePowerSelect');
const powerHelp = document.getElementById('pfPowerHelp');
const amountFields = document.getElementById('pfAmountFields');
const amountLabel = document.getElementById('pfAmountLabel');
const ruleAmountInput = document.getElementById('pfRuleAmountInput');
const durationFields = document.getElementById('pfDurationFields');
const ruleDurationInput = document.getElementById('pfRuleDurationInput');
const styleFields = document.getElementById('pfStyleFields');
const ruleStyleSelect = document.getElementById('pfRuleStyleSelect');
const ruleSaveBtn = document.getElementById('pfRuleSaveBtn');
const rulesList = document.getElementById('pfRulesList');
const ruleCount = document.getElementById('pfRuleCount');

let liveEventsSource = null;
let giftCatalog = [];
let selectedGift = null;
let currentSettings = null;
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

// Igual que en el servidor: minusculas, sin tildes ni signos ("¡Águilas!" -> "aguilas")
function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
// Aquí solo se lee lo que ya esté vinculado.
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
    console.error('[FIGHTERS] Error restaurando conexion TikTok:', error.message);
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
    const response = await fetch('/api/roblox-fighters/link', {
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

// ===== Luchadores y partida =====
function fillStyleSelect(select) {
  select.innerHTML = Object.entries(STYLE_CATALOG)
    .map(([id, style]) => `<option value="${id}">${escapeHtml(style.label)}</option>`)
    .join('');
}

function paintSide(side) {
  const inputs = sideInputs[side];
  const color = /^#[0-9a-fA-F]{6}$/.test(inputs.color.value) ? inputs.color.value : '#888888';
  inputs.card.style.setProperty('--pf-side', color);
  inputs.note.textContent = STYLE_CATALOG[inputs.style.value]?.note || '';
}

// Como se unen los espectadores: el nombre del lado o solo su primera letra (la letra no vale si los dos nombres empiezan igual)
function paintKeywords() {
  const names = {
    left: sideInputs.left.name.value.trim() || 'Rojo',
    right: sideInputs.right.name.value.trim() || 'Azul',
  };
  const initials = {
    left: foldText(names.left).charAt(0),
    right: foldText(names.right).charAt(0),
  };
  const letterWorks = initials.left && initials.right && initials.left !== initials.right;

  for (const side of ['left', 'right']) {
    const hint = sideInputs[side].joinHint;
    if (!hint) continue;
    hint.textContent = letterWorks
      ? `Tus espectadores se unen comentando "${names[side]}" o solo "${initials[side].toUpperCase()}" (sin importar mayúsculas ni tildes).`
      : `Tus espectadores se unen comentando "${names[side]}" (sin importar mayúsculas ni tildes). Con la misma letra inicial en los dos lados hay que escribir el nombre completo.`;
  }
  if (stepLeftWord) stepLeftWord.textContent = names.left;
  if (stepRightWord) stepRightWord.textContent = names.right;
}

function applySettings(settings) {
  currentSettings = settings;

  for (const side of ['left', 'right']) {
    const data = settings[side];
    const inputs = sideInputs[side];
    inputs.name.value = data.name;
    inputs.color.value = data.color;
    inputs.style.value = data.style;
    paintSide(side);
  }

  winGoalInput.value = settings.winGoal;
  roundSecondsInput.value = settings.roundSeconds;
  maxHealthInput.value = settings.maxHealth;

  scoreLeftName.textContent = settings.left.name;
  scoreRightName.textContent = settings.right.name;
  scoreLeftName.parentElement.style.setProperty('--pf-side', settings.left.color);
  scoreRightName.parentElement.style.setProperty('--pf-side', settings.right.color);
  scoreGoal.textContent = settings.winGoal;
  paintKeywords();
}

function applyScore(score) {
  if (!score) return;
  scoreLeft.textContent = score.leftWins;
  scoreRight.textContent = score.rightWins;
  scoreGoal.textContent = score.winGoal;
  champLeft.textContent = score.championsLeft;
  champRight.textContent = score.championsRight;
}

function showSaveState(text, tone = '') {
  saveState.textContent = text;
  saveState.dataset.tone = tone;
  if (text) setTimeout(() => { if (saveState.textContent === text) saveState.textContent = ''; }, 3500);
}

async function loadConfig() {
  try {
    const response = await fetch('/api/roblox-fighters/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuracion.');

    const data = await response.json();
    setLinkStatus(data.robloxUsername, data.robloxUserId);
    if (data.robloxUserId) robloxUserIdInput.value = data.robloxUserId;
    applySettings(data.settings);
    applyScore(data.score);
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

async function saveSettings(event) {
  event.preventDefault();

  settingsSaveBtn.disabled = true;
  showSaveState('Guardando...');

  try {
    const response = await fetch('/api/roblox-fighters/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        left: {
          name: sideInputs.left.name.value,
          color: sideInputs.left.color.value,
          style: sideInputs.left.style.value,
        },
        right: {
          name: sideInputs.right.name.value,
          color: sideInputs.right.color.value,
          style: sideInputs.right.style.value,
        },
        winGoal: Number(winGoalInput.value),
        roundSeconds: Number(roundSecondsInput.value),
        maxHealth: Number(maxHealthInput.value),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');

    applySettings(data.settings);
    applyScore(data.score);
    showSaveState('Cambios guardados. El juego los toma en el siguiente round.', 'ok');
  } catch (error) {
    showSaveState('');
    await showAlert(error.message, 'No se guardó');
  } finally {
    settingsSaveBtn.disabled = false;
  }
}

async function refreshScore() {
  try {
    const response = await fetch('/api/roblox-fighters/score');
    if (!response.ok) return;
    const data = await response.json();
    applyScore(data.score);
  } catch (error) {
    // el marcador se vuelve a pedir en unos segundos
  }
}

function startScorePolling() {
  if (scoreTimer) return;
  scoreTimer = setInterval(() => {
    if (!document.hidden) refreshScore();
  }, 6000);
}

async function resetScore() {
  const confirmed = await showConfirm('¿Poner el marcador en cero? Se borran las victorias y los campeonatos de los dos lados.', 'Reiniciar marcador');
  if (!confirmed) return;

  try {
    const response = await fetch('/api/roblox-fighters/score/reset', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo reiniciar el marcador.');
    applyScore(data.score);
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
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

// ===== Reglas regalo -> poder =====
function fillPowerSelects() {
  rulePowerSelect.innerHTML = '<option value="">Selecciona un poder</option>' + Object.entries(POWER_CATALOG)
    .map(([id, power]) => `<option value="${id}">${escapeHtml(power.label)}</option>`)
    .join('');
  ruleStyleSelect.innerHTML = Object.entries(STYLE_CATALOG)
    .map(([id, style]) => `<option value="${id}">${escapeHtml(style.label)}</option>`)
    .join('');
}

// Cada poder muestra solo sus propios campos
function syncPowerFields() {
  const power = POWER_CATALOG[rulePowerSelect.value];
  amountFields.hidden = !power || power.kind !== 'amount';
  durationFields.hidden = !power || power.kind !== 'duration';
  styleFields.hidden = !power || power.kind !== 'style';
  powerHelp.textContent = power ? power.help : 'Elige qué pasa cuando llega el regalo.';

  if (power && power.kind === 'amount') {
    amountLabel.textContent = `Cantidad (${power.unit})`;
    ruleAmountInput.value = power.def;
  }
  if (power && power.kind === 'duration') {
    ruleDurationInput.value = power.def;
  }
}

function describeRule(rule) {
  const power = POWER_CATALOG[rule.power];
  if (!power) return { text: rule.power, category: 'attack' };

  if (power.kind === 'amount') return { text: `${power.label} · ${rule.amount} ${power.unit}`, category: power.category };
  if (power.kind === 'duration') return { text: `${power.label} · ${rule.duration_seconds} ${power.unit}`, category: power.category };
  return { text: `${power.label} · ${STYLE_CATALOG[rule.param]?.label || rule.param}`, category: power.category };
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
    const response = await fetch('/api/roblox-fighters/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftImageUrl: selectedGift.imageUrl || '',
        power: rulePowerSelect.value,
        amount: Number(ruleAmountInput.value) || power.def,
        durationSeconds: Number(ruleDurationInput.value) || power.def,
        param: ruleStyleSelect.value,
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
    const response = await fetch('/api/roblox-fighters/rules');
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
            <span class="pk-chip pk-chip--${escapeHtml(info.category)}"><svg width="13" height="13"><use href="#i-swords" /></svg>${escapeHtml(info.text)}</span>
          </div>
        </div>
        <div class="rule-actions">
          <button class="btn ghost small test-rule-btn" type="button" data-side="left" title="Enviar este poder al luchador de la izquierda"><svg><use href="#i-play" /></svg>Probar izq.</button>
          <button class="btn ghost small test-rule-btn" type="button" data-side="right" title="Enviar este poder al luchador de la derecha"><svg><use href="#i-play" /></svg>Probar der.</button>
          <button class="btn ghost small icon-only delete-rule-btn" type="button" title="Eliminar regla" aria-label="Eliminar regla"><svg><use href="#i-trash" /></svg></button>
        </div>
      </div>`;
    }).join('');

    rulesList.querySelectorAll('.test-rule-btn').forEach((btn) => {
      btn.addEventListener('click', () => testRule(btn.closest('.rule-item').dataset.ruleId, btn, btn.dataset.side));
    });
    rulesList.querySelectorAll('.delete-rule-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteRule(btn.closest('.rule-item').dataset.ruleId));
    });
  } catch (error) {
    rulesList.innerHTML = '<div class="pk-empty"><strong>No se pudieron cargar las reglas</strong><span>Recarga la página e inténtalo de nuevo.</span></div>';
  }
}

async function testRule(ruleId, button, side) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/roblox-fighters/rules/${ruleId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo probar el poder.');
    await showAlert('Poder de prueba enviado. Debería activarse en tu juego de Roblox en un par de segundos.', 'Listo');
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
    await fetch(`/api/roblox-fighters/rules/${ruleId}`, { method: 'DELETE' });
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

  for (const side of ['left', 'right']) {
    const inputs = sideInputs[side];
    fillStyleSelect(inputs.style);
    inputs.color.addEventListener('input', () => paintSide(side));
    inputs.style.addEventListener('change', () => paintSide(side));
    inputs.name.addEventListener('input', paintKeywords);
  }
  settingsForm.addEventListener('submit', saveSettings);
  resetScoreBtn.addEventListener('click', resetScore);

  fillPowerSelects();
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
    if (!document.hidden) refreshScore();
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
  await loadGiftCatalog(true);
  startScorePolling();
})().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
