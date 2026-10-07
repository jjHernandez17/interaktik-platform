// Batalla de Reinos — interfaz, configuración, regalos del live y persistencia.
// El motor (tropas, torres, combate, dibujo) está en kingdoms-engine.js.

const { UNITS, SPELLS } = KingdomsEngine;

// ===== Elementos del DOM =====
const $ = (id) => document.getElementById(id);

const kdUsername = $('kdUsername');
const kdConnectLiveBtn = $('kdConnectLiveBtn');
const kdDisconnectBtn = $('kdDisconnectBtn');
const kdConnectionStatus = $('kdConnectionStatusBadge');
const kdConnectionDetails = $('kdConnectionDetails');

const kdStage = $('kdStage');
const kdCanvas = $('kdCanvas');
const kdFeed = $('kdFeed');
const kdBanner = $('kdBanner');
const kdJoinHint = $('kdJoinHint');

const kdGiftRulesTable = $('kdGiftRulesTable');

const DEFAULT_RULE_ID = 'binding-gift-default';

// ===== Estado persistido =====
function defaultState() {
  return {
    teams: {
      left: { name: 'Dragones', color: '#ef4444', keyword: '1' },
      right: { name: 'Grifos', color: '#3b82f6', keyword: '2' },
    },
    settings: { matchSeconds: 180, towerHpPercent: 100, maxUnitsPerSide: 120, gameSpeed: 1, restartSeconds: 8, autoJoin: true },
    wins: { left: 0, right: 0 },
    giftRules: [{ id: DEFAULT_RULE_ID, giftName: '', unit: 'squire', amount: 1, level: 1, perCoin: true }],
    teamBindings: {},
  };
}

let state = defaultState();

// ===== Estado transitorio =====
let isConnected = false;
let liveEventsSource = null;
let saveTimeout = null;
let giftCatalog = [];
let giftCatalogLoaded = false;
let giftCatalogLoading = false;
const liveGiftProgress = new Map();
let engine = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

const itemName = (id) => (UNITS[id] ? UNITS[id].name : SPELLS[id] ? SPELLS[id].name : id);
const isValidItem = (id) => Boolean(UNITS[id] || SPELLS[id]);

// ===== Catálogo de regalos (mismo patrón que Boy vs Girl) =====
function pickFirstUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return pickFirstUrl(value[0]);
  if (typeof value === 'object') {
    return pickFirstUrl(value.url) || pickFirstUrl(value.urlList) || pickFirstUrl(value.url_list) || pickFirstUrl(value.urls) || pickFirstUrl(value.uri) || '';
  }
  return '';
}

function getGiftImageUrl(gift) {
  return (
    pickFirstUrl(gift?.imageUrl) || pickFirstUrl(gift?.giftImage) || pickFirstUrl(gift?.previewImage) || pickFirstUrl(gift?.icon)
    || pickFirstUrl(gift?.giftLabelIcon) || pickFirstUrl(gift?.image) || pickFirstUrl(gift?.staticImage) || pickFirstUrl(gift?.dynamicImage) || ''
  );
}

function sanitizeGiftCatalog(rawGifts) {
  return (Array.isArray(rawGifts) ? rawGifts : []).map((gift) => ({
    id: String(gift?.id ?? gift?.giftId ?? ''),
    name: String(gift?.name || gift?.giftName || `Regalo ${gift?.id ?? ''}`).trim(),
    diamondCount: Number(gift?.diamondCount || gift?.diamond_count || 1) || 1,
    imageUrl: getGiftImageUrl(gift),
  }));
}

async function loadGiftCatalog() {
  if (giftCatalogLoading) return giftCatalog;
  giftCatalogLoading = true;
  try {
    const response = await fetch('/api/gifts?gameType=kingdoms');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo cargar el catálogo.');
    giftCatalog = sanitizeGiftCatalog(result.gifts);
    giftCatalogLoaded = true;
    renderGiftRulesConfig();
    return giftCatalog;
  } catch (error) {
    console.error('[Reinos] Error cargando catálogo de regalos:', error.message);
    return giftCatalog;
  } finally {
    giftCatalogLoading = false;
  }
}

function findGiftInCatalogByName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;
  return giftCatalog.find((gift) => gift.name.toLowerCase() === normalized) || null;
}

// ===== Espectadores y combos de regalos =====
function normalizeViewerKey(payload) {
  const userId = String(payload?.user?.userId || payload?.userId || '').trim();
  if (userId) return `id:${userId}`;
  const uniqueId = String(payload?.user?.uniqueId || payload?.uniqueId || '').trim().toLowerCase();
  if (uniqueId) return `uid:${uniqueId}`;
  const nickname = String(payload?.user?.nickname || payload?.nickname || '').trim().toLowerCase();
  if (nickname) return `nick:${nickname}`;
  return '';
}

function viewerName(payload) {
  return String(payload?.user?.nickname || payload?.nickname || payload?.user?.uniqueId || payload?.uniqueId || 'Espectador').slice(0, 24);
}

function pruneLiveGiftProgress(now = Date.now()) {
  for (const [key, entry] of liveGiftProgress.entries()) {
    const receivedAt = Number(entry?.receivedAt || 0) || 0;
    if (!receivedAt || now - receivedAt > 15000) liveGiftProgress.delete(key);
  }
}

// Un combo llega como varios eventos con repeatCount creciente: solo se aplica lo que se sumó desde el anterior
function extractAppliedGiftCount(payload) {
  const diamondCount = Number(payload.diamondCount || 0) || 0;
  const repeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
  const repeatEnd = payload.repeatEnd === true || payload.repeatEnd === 1 || payload.repeatEnd === '1';
  if (diamondCount <= 0) return 0;

  const now = Date.now();
  pruneLiveGiftProgress(now);

  const progressKey = [normalizeViewerKey(payload), String(payload.giftId || '').trim() || String(payload.giftName || '').trim().toLowerCase()].join('|');
  const previous = liveGiftProgress.get(progressKey);
  let appliedCount = repeatCount;

  if (previous) {
    const previousCount = Number(previous.repeatCount || 0) || 0;
    const previousReceivedAt = Number(previous.receivedAt || 0) || 0;
    const sameWindow = !previousReceivedAt || now - previousReceivedAt <= 8000;
    if (sameWindow && repeatCount >= previousCount) appliedCount = Math.max(0, repeatCount - previousCount);
  }

  if (appliedCount === 0) {
    if (repeatEnd) liveGiftProgress.delete(progressKey);
    return 0;
  }

  liveGiftProgress.set(progressKey, { repeatCount, receivedAt: now });
  if (repeatEnd) liveGiftProgress.delete(progressKey);
  return appliedCount;
}

// ===== Reglas de regalo =====
function findGiftRuleForName(giftName) {
  const normalized = String(giftName || '').trim().toLowerCase();
  const specific = normalized
    ? state.giftRules.find((rule) => rule.id !== DEFAULT_RULE_ID && rule.giftName.trim().toLowerCase() === normalized)
    : null;
  return specific || state.giftRules.find((rule) => rule.id === DEFAULT_RULE_ID) || defaultState().giftRules[0];
}

function sanitizeGiftRules(rawRules) {
  const list = (Array.isArray(rawRules) ? rawRules : []).map((rule) => ({
    id: String(rule?.id || `binding-gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    giftName: String(rule?.giftName || '').trim(),
    unit: isValidItem(rule?.unit) ? rule.unit : 'squire',
    amount: Math.max(1, Math.min(200, Math.round(Number(rule?.amount) || 1))),
    level: Math.max(1, Math.min(10, Math.round(Number(rule?.level) || 1))),
    perCoin: rule?.perCoin === true,
  }));
  if (!list.some((rule) => rule.id === DEFAULT_RULE_ID)) list.unshift(defaultState().giftRules[0]);
  return list;
}

function unitSelectOptions(selected) {
  const troops = Object.entries(UNITS).map(([id, u]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${escapeHtml(u.name)}${u.pack ? ` (trae ${u.pack})` : ''}</option>`).join('');
  const spells = Object.entries(SPELLS).map(([id, s]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
  return `<optgroup label="Tropas">${troops}</optgroup><optgroup label="Hechizos">${spells}</optgroup>`;
}

// ----- selector de regalos (imagen + monedas + filtro), igual que en los otros juegos -----
function renderGiftPickerToggleLabel(giftName) {
  if (!giftName) return '<span class="gift-picker-selected placeholder">Elige un regalo...</span>';
  const gift = findGiftInCatalogByName(giftName);
  if (!gift) return `<span class="gift-picker-selected"><span class="gift-picker-selected-name">${escapeHtml(giftName)}</span></span>`;
  return `
    <span class="gift-picker-selected">
      <img class="gift-picker-selected-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" onerror="this.style.visibility='hidden'" />
      <span class="gift-picker-selected-name">${escapeHtml(gift.name)}</span>
      <span class="gift-picker-selected-coins">${gift.diamondCount}</span>
    </span>`;
}

function giftPickerListMarkup(selectedName, nameFilter = '', min = null, max = null) {
  if (giftCatalog.length === 0) return '<p class="muted">Carga el catálogo primero (conecta tu TikTok una vez).</p>';

  const normalizedFilter = nameFilter.trim().toLowerCase();
  const normalizedSelected = String(selectedName || '').trim().toLowerCase();
  const filtered = giftCatalog.filter((gift) => {
    if (normalizedFilter && !gift.name.toLowerCase().includes(normalizedFilter)) return false;
    if (min !== null && !Number.isNaN(min) && gift.diamondCount < min) return false;
    if (max !== null && !Number.isNaN(max) && gift.diamondCount > max) return false;
    return true;
  });
  if (filtered.length === 0) return '<p class="muted">Sin resultados para ese filtro.</p>';

  return filtered.map((gift) => `
    <button type="button" class="gift-picker-item${normalizedSelected === gift.name.toLowerCase() ? ' selected' : ''}" data-gift-name="${escapeHtml(gift.name)}">
      <img class="gift-picker-item-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <span class="gift-picker-item-name">${escapeHtml(gift.name)}</span>
      <span class="gift-picker-item-coins">${gift.diamondCount}</span>
    </button>`).join('');
}

function giftPickerMarkup(rule) {
  return `
    <div class="gift-picker" data-gift-picker>
      <button type="button" class="gift-picker-toggle">
        ${renderGiftPickerToggleLabel(rule.giftName)}
        <svg class="gift-picker-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 4.5L7 9L11.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div class="gift-picker-panel hidden">
        <div class="gift-picker-filters">
          <input type="text" class="gift-picker-filter-name" placeholder="Buscar por nombre..." autocomplete="off" />
          <div class="gift-picker-coins-filter">
            <input type="number" min="0" class="gift-picker-filter-min" placeholder="Monedas mín." />
            <input type="number" min="0" class="gift-picker-filter-max" placeholder="Monedas máx." />
          </div>
        </div>
        <div class="gift-picker-list"></div>
      </div>
      <input type="hidden" data-field="giftName" value="${escapeHtml(rule.giftName || '')}" />
    </div>`;
}

function closeAllGiftPickers() {
  document.querySelectorAll('.gift-picker-panel').forEach((panel) => panel.classList.add('hidden'));
  document.querySelectorAll('.gift-picker-toggle').forEach((toggle) => toggle.classList.remove('open'));
}

function refreshGiftPickerList(picker) {
  const nameInput = picker.querySelector('.gift-picker-filter-name');
  const minInput = picker.querySelector('.gift-picker-filter-min');
  const maxInput = picker.querySelector('.gift-picker-filter-max');
  const hiddenInput = picker.querySelector('[data-field="giftName"]');
  const listEl = picker.querySelector('.gift-picker-list');
  if (!listEl) return;
  const min = minInput?.value !== '' ? Number(minInput.value) : null;
  const max = maxInput?.value !== '' ? Number(maxInput.value) : null;
  listEl.innerHTML = giftPickerListMarkup(hiddenInput?.value, nameInput?.value || '', min, max);
}

function openGiftPickerPanel(picker) {
  if (!giftCatalogLoaded && !giftCatalogLoading) void loadGiftCatalog();
  picker.querySelector('.gift-picker-panel')?.classList.remove('hidden');
  picker.querySelector('.gift-picker-toggle')?.classList.add('open');
  refreshGiftPickerList(picker);
}

function selectGiftInPicker(picker, giftName) {
  const hiddenInput = picker.querySelector('[data-field="giftName"]');
  if (hiddenInput) hiddenInput.value = giftName;
  const toggle = picker.querySelector('.gift-picker-toggle');
  const chevron = toggle?.querySelector('.gift-picker-chevron');
  if (toggle && chevron) toggle.innerHTML = renderGiftPickerToggleLabel(giftName) + chevron.outerHTML;
}

function giftRuleRow(rule, removable) {
  const giftCell = removable ? giftPickerMarkup(rule) : '<strong>Cualquier otro regalo</strong>';
  return `
    <tr data-rule-id="${escapeHtml(rule.id)}">
      <td>${giftCell}</td>
      <td><select data-field="unit">${unitSelectOptions(rule.unit)}</select></td>
      <td><input data-field="amount" type="number" min="1" max="200" step="1" value="${Number(rule.amount) || 1}" /></td>
      <td><input data-field="level" type="number" min="1" max="10" step="1" value="${Number(rule.level) || 1}" /></td>
      <td class="kd-cell-check"><input data-field="perCoin" type="checkbox" ${rule.perCoin ? 'checked' : ''} title="Multiplica la cantidad por las monedas del regalo" /></td>
      <td>${removable ? `<button class="power-card-remove" type="button" data-remove-rule="${escapeHtml(rule.id)}" title="Quitar regla">✕</button>` : ''}</td>
    </tr>`;
}

function renderGiftRulesConfig() {
  if (!kdGiftRulesTable) return;
  if (!giftCatalogLoaded && !giftCatalogLoading) void loadGiftCatalog();

  const defaultRule = state.giftRules.find((rule) => rule.id === DEFAULT_RULE_ID) || defaultState().giftRules[0];
  const specific = state.giftRules.filter((rule) => rule.id !== DEFAULT_RULE_ID);

  kdGiftRulesTable.innerHTML = `
    <table class="power-config-table">
      <thead><tr><th>Regalo</th><th>Invoca</th><th>Cantidad</th><th>Nivel</th><th title="Multiplica por las monedas del regalo">×valor</th><th></th></tr></thead>
      <tbody>${[giftRuleRow(defaultRule, false), ...specific.map((rule) => giftRuleRow(rule, true))].join('')}</tbody>
    </table>`;
}

function readGiftRulesFromUI() {
  if (!kdGiftRulesTable) return;
  const rules = [];
  kdGiftRulesTable.querySelectorAll('tbody tr').forEach((row) => {
    rules.push({
      id: row.dataset.ruleId,
      giftName: row.querySelector('[data-field="giftName"]')?.value || '',
      unit: row.querySelector('[data-field="unit"]')?.value || 'squire',
      amount: Number(row.querySelector('[data-field="amount"]')?.value || 1),
      level: Number(row.querySelector('[data-field="level"]')?.value || 1),
      perCoin: Boolean(row.querySelector('[data-field="perCoin"]')?.checked),
    });
  });
  state.giftRules = sanitizeGiftRules(rules);
}

function addGiftRule() {
  state.giftRules.push({ id: `binding-gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, giftName: '', unit: 'squire', amount: 5, level: 1, perCoin: false });
  renderGiftRulesConfig();
}

// Propone una escalera de regalos: los baratos invocan tropas simples y los caros las más fuertes
async function suggestRules() {
  readGiftRulesFromUI();
  if (!giftCatalogLoaded) await loadGiftCatalog();
  if (giftCatalog.length === 0) {
    await showAppAlert('Primero conecta tu TikTok una vez para que se cargue el catálogo de regalos.', 'Sin regalos');
    return;
  }

  const ladder = [
    { unit: 'squire', amount: 5 }, { unit: 'archer', amount: 5 }, { unit: 'skeletons', amount: 4 }, { unit: 'knight', amount: 4 },
    { unit: 'wizard', amount: 4 }, { unit: 'healer', amount: 3 }, { unit: 'ogre', amount: 3 }, { unit: 'fireball', amount: 2 },
    { unit: 'dragon', amount: 3 }, { unit: 'ram', amount: 3 }, { unit: 'titan', amount: 4 }, { unit: 'lightning', amount: 3 },
    { unit: 'colossus', amount: 3 }, { unit: 'necromancer', amount: 3 },
  ];

  const confirmed = await showAppConfirm('Se reemplazarán las reglas específicas actuales por unas sugeridas según el valor de tus regalos. ¿Continuar?', 'Sugerir reglas');
  if (!confirmed) return;

  const sorted = [...giftCatalog].sort((a, b) => a.diamondCount - b.diamondCount);
  const count = Math.min(ladder.length, sorted.length);
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    const index = count === 1 ? 0 : Math.round((i * (sorted.length - 1)) / (count - 1));
    const gift = sorted[index];
    if (gift && !picked.some((g) => g.name === gift.name)) picked.push(gift);
  }

  const defaultRule = state.giftRules.find((rule) => rule.id === DEFAULT_RULE_ID) || defaultState().giftRules[0];
  state.giftRules = [defaultRule, ...picked.map((gift, i) => ({
    id: `binding-gift-${Date.now()}-${i}`,
    giftName: gift.name,
    unit: ladder[i].unit,
    amount: ladder[i].amount,
    level: 1 + Math.floor(i / 4),
    perCoin: false,
  }))];
  renderGiftRulesConfig();
}

// ===== Persistencia =====
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 700);
}

function saveState() {
  fetch('/api/kingdoms/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }).catch((error) => console.error('[Reinos] Error guardando estado:', error.message));
}

async function loadState() {
  try {
    const response = await fetch('/api/kingdoms/state');
    if (!response.ok) return;
    const data = await response.json();
    const base = defaultState();
    state = {
      teams: {
        left: { ...base.teams.left, ...(data.teams?.left || {}) },
        right: { ...base.teams.right, ...(data.teams?.right || {}) },
      },
      settings: { ...base.settings, ...(data.settings || {}) },
      wins: { left: Number(data.wins?.left) || 0, right: Number(data.wins?.right) || 0 },
      giftRules: sanitizeGiftRules(data.giftRules),
      teamBindings: data.teamBindings && typeof data.teamBindings === 'object' ? data.teamBindings : {},
    };
  } catch (error) {
    console.error('[Reinos] Error cargando estado:', error.message);
  }
}

// ===== Configuración de equipos y partida =====
const cfgFields = {
  nameLeft: $('kdCfgNameLeft'), colorLeft: $('kdCfgColorLeft'), keywordLeft: $('kdCfgKeywordLeft'),
  nameRight: $('kdCfgNameRight'), colorRight: $('kdCfgColorRight'), keywordRight: $('kdCfgKeywordRight'),
  matchSeconds: $('kdCfgMatchSeconds'), towerHp: $('kdCfgTowerHp'), maxUnits: $('kdCfgMaxUnits'),
  speed: $('kdCfgSpeed'), restart: $('kdCfgRestart'), autoJoin: $('kdCfgAutoJoin'),
};

function fillConfigForm() {
  cfgFields.nameLeft.value = state.teams.left.name;
  cfgFields.colorLeft.value = state.teams.left.color;
  cfgFields.keywordLeft.value = state.teams.left.keyword;
  cfgFields.nameRight.value = state.teams.right.name;
  cfgFields.colorRight.value = state.teams.right.color;
  cfgFields.keywordRight.value = state.teams.right.keyword;
  cfgFields.matchSeconds.value = state.settings.matchSeconds;
  cfgFields.towerHp.value = state.settings.towerHpPercent;
  cfgFields.maxUnits.value = state.settings.maxUnitsPerSide;
  cfgFields.speed.value = state.settings.gameSpeed;
  cfgFields.restart.value = state.settings.restartSeconds;
  cfgFields.autoJoin.checked = state.settings.autoJoin !== false;
}

function num(input, min, max, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readConfigForm() {
  const keyLeft = (cfgFields.keywordLeft.value.trim().toLowerCase() || '1').slice(0, 12);
  let keyRight = (cfgFields.keywordRight.value.trim().toLowerCase() || '2').slice(0, 12);
  if (keyRight === keyLeft) keyRight = keyLeft === '2' ? '3' : '2';

  state.teams = {
    left: { name: cfgFields.nameLeft.value.trim().slice(0, 24) || 'Dragones', color: cfgFields.colorLeft.value || '#ef4444', keyword: keyLeft },
    right: { name: cfgFields.nameRight.value.trim().slice(0, 24) || 'Grifos', color: cfgFields.colorRight.value || '#3b82f6', keyword: keyRight },
  };
  state.settings = {
    matchSeconds: Math.round(num(cfgFields.matchSeconds, 60, 600, 180)),
    towerHpPercent: Math.round(num(cfgFields.towerHp, 25, 400, 100)),
    maxUnitsPerSide: Math.round(num(cfgFields.maxUnits, 30, 250, 120)),
    gameSpeed: num(cfgFields.speed, 0.5, 2, 1),
    restartSeconds: Math.round(num(cfgFields.restart, 3, 60, 8)),
    autoJoin: cfgFields.autoJoin.checked,
  };
}

// ===== HUD =====
const hud = {
  nameLeft: $('kdNameLeft'), nameRight: $('kdNameRight'),
  winsLeft: $('kdWinsLeft'), winsRight: $('kdWinsRight'),
  crownsLeft: $('kdCrownsLeft'), crownsRight: $('kdCrownsRight'),
  barLeft: $('kdBarLeft'), barRight: $('kdBarRight'),
  unitsLeft: $('kdUnitsLeft'), unitsRight: $('kdUnitsRight'),
  timer: $('kdTimer'), status: $('kdStatus'),
  topLeft: $('kdTopLeft'), topRight: $('kdTopRight'),
  teamLeft: $('kdTeamLeft'), teamRight: $('kdTeamRight'),
};

const CROWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18l-1-11 6 4 4-7 4 7 6-4-1 11z" /></svg>';

function crownsMarkup(count) {
  return [0, 1, 2].map((i) => `<span class="kd-crown${i < count ? ' on' : ''}">${CROWN_SVG}</span>`).join('');
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function topMarkup(list, color) {
  if (!list.length) return '';
  return list.map((entry, i) => `
    <div class="kd-top-row"><b style="color:${color}">${i + 1}</b><span>${escapeHtml(entry.name)}</span><em>${entry.damage > 0 ? entry.damage.toLocaleString('es') : '—'}</em></div>`).join('');
}

function reasonText(reason) {
  if (reason === 'king') return 'Destruyó el castillo rival';
  if (reason === 'crowns') return 'Más torres destruidas al acabar el tiempo';
  if (reason === 'health') return 'Más vida de torres al acabar el tiempo';
  return 'Empate';
}

function updateHud() {
  if (!engine) return;
  const data = engine.getHud();
  const { teams } = state;

  hud.nameLeft.textContent = teams.left.name;
  hud.nameRight.textContent = teams.right.name;
  hud.teamLeft.style.setProperty('--team', teams.left.color);
  hud.teamRight.style.setProperty('--team', teams.right.color);
  hud.winsLeft.textContent = state.wins.left;
  hud.winsRight.textContent = state.wins.right;
  hud.crownsLeft.innerHTML = crownsMarkup(Math.min(3, data.crowns.left));
  hud.crownsRight.innerHTML = crownsMarkup(Math.min(3, data.crowns.right));
  hud.barLeft.style.width = `${Math.max(0, data.towerHp.left * 100)}%`;
  hud.barRight.style.width = `${Math.max(0, data.towerHp.right * 100)}%`;

  const queuedText = (side) => (data.queued[side] > 0 ? ` · +${data.queued[side]} en cola` : '');
  hud.unitsLeft.textContent = `${data.units.left} tropas${queuedText('left')}`;
  hud.unitsRight.textContent = `${data.units.right} tropas${queuedText('right')}`;

  hud.timer.textContent = formatTime(data.timeLeft);
  hud.timer.classList.toggle('urgent', data.phase === 'running' && data.timeLeft <= 15);

  if (data.phase === 'waiting') {
    hud.status.textContent = 'Esperando el primer regalo…';
  } else if (data.phase === 'running') {
    hud.status.textContent = '¡Batalla en curso!';
  } else {
    hud.status.textContent = `Nueva partida en ${Math.ceil(data.restartIn)} s`;
  }

  hud.topLeft.innerHTML = topMarkup(data.top.left, teams.left.color);
  hud.topRight.innerHTML = topMarkup(data.top.right, teams.right.color);
  kdJoinHint.innerHTML = `Comenta <strong style="color:${escapeHtml(teams.left.color)}">${escapeHtml(teams.left.keyword)}</strong> para unirte a <strong>${escapeHtml(teams.left.name)}</strong> o `
    + `<strong style="color:${escapeHtml(teams.right.color)}">${escapeHtml(teams.right.keyword)}</strong> para unirte a <strong>${escapeHtml(teams.right.name)}</strong>. Después, tus regalos invocan tropas para tu reino.`;
}

function showFeed(text, side) {
  const line = document.createElement('div');
  line.className = 'kd-feed-line';
  line.style.setProperty('--team', state.teams[side]?.color || '#fff');
  line.textContent = text;
  kdFeed.appendChild(line);
  while (kdFeed.children.length > 6) kdFeed.firstElementChild.remove();
  setTimeout(() => line.remove(), 6500);
}

function showBanner(data) {
  const winnerName = data.winner === 'draw' ? 'Empate' : `¡Gana ${state.teams[data.winner].name}!`;
  const color = data.winner === 'draw' ? '#e2e8f0' : state.teams[data.winner].color;
  kdBanner.style.setProperty('--team', color);
  kdBanner.innerHTML = `<strong>${escapeHtml(winnerName)}</strong><span>${escapeHtml(reasonText(data.reason))}</span>`;
  kdBanner.classList.remove('hidden');
}

// ===== Eventos del juego =====
function onMatchEnd(data) {
  if (data.winner === 'left' || data.winner === 'right') {
    state.wins[data.winner] += 1;
    scheduleSave();
  }
  showBanner(data);
}

// ===== Eventos del live =====
function handleLiveComment(payload) {
  const text = String(payload.comment || payload.commentText || '').trim().toLowerCase();
  if (!text) return;

  const side = text === state.teams.left.keyword ? 'left' : text === state.teams.right.keyword ? 'right' : null;
  if (!side) return;

  const key = normalizeViewerKey(payload);
  if (!key || state.teamBindings[key] === side) return;

  state.teamBindings[key] = side;
  showFeed(`${viewerName(payload)} se unió a ${state.teams[side].name}`, side);
  scheduleSave();
}

function sideForViewer(payload) {
  const key = normalizeViewerKey(payload);
  if (!key) return null;
  if (state.teamBindings[key]) return state.teamBindings[key];
  if (!state.settings.autoJoin) return null;

  let left = 0;
  let right = 0;
  Object.values(state.teamBindings).forEach((side) => { if (side === 'left') left += 1; else right += 1; });
  const side = left < right ? 'left' : right < left ? 'right' : (Math.random() < 0.5 ? 'left' : 'right');
  state.teamBindings[key] = side;
  scheduleSave();
  return side;
}

function summonFromRule(side, rule, count, owner) {
  if (!engine.enqueue(side, rule.unit, count, rule.level, owner)) return;
  const label = SPELLS[rule.unit] ? `${count > 1 ? '×' + count + ' ' : ''}${itemName(rule.unit)}` : `×${count} ${itemName(rule.unit)}`;
  showFeed(`${owner.name} → ${label}`, side);
}

function handleLiveGift(payload) {
  const side = sideForViewer(payload);
  if (!side) return;

  const applied = extractAppliedGiftCount(payload);
  if (applied <= 0) return;

  const rule = findGiftRuleForName(payload.giftName);
  const coins = Math.max(1, Number(payload.diamondCount) || 1);
  const count = Math.min(300, Math.round(rule.amount * applied * (rule.perCoin ? coins : 1)));
  if (count <= 0) return;

  summonFromRule(side, rule, count, { key: normalizeViewerKey(payload), name: viewerName(payload) });
}

// ===== Conexión TikTok Live (mismo patrón que el resto de los juegos) =====
function setConnectionStatus(status, details = '', error = '') {
  const displayStatus = error ? 'error' : status;
  const labels = { unlinked: 'Sin vincular', disconnected: 'Desconectado', connecting: 'Conectando...', connected: 'Conectado', error: 'Error' };

  kdConnectionStatus.textContent = labels[displayStatus] || labels.disconnected;
  kdConnectionStatus.className = `status-badge ${displayStatus}`;

  if (!kdConnectionDetails) return;
  if (displayStatus === 'error') {
    kdConnectionDetails.textContent = error || 'Error al conectar al live, por favor contactate con un desarrollador.';
  } else if (details) {
    kdConnectionDetails.textContent = details;
  } else if (displayStatus === 'unlinked' || displayStatus === 'disconnected') {
    kdConnectionDetails.textContent = 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.';
  }
}

async function restoreTiktokConnection() {
  try {
    const response = await fetch('/api/tiktok-connection/kingdoms');
    if (!response.ok) return;
    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      kdUsername.value = `@${data.tiktok_username}`;
      setConnectionStatus('disconnected', `Cuenta vinculada a @${data.tiktok_username}. Presiona "Conectar a live" cuando ya estés transmitiendo.`);
    } else {
      kdUsername.value = '';
      setConnectionStatus('disconnected', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    console.error('[Reinos] Error restaurando conexión TikTok:', error.message);
  }
}

function connectToEvents() {
  if (liveEventsSource) liveEventsSource.close();
  liveEventsSource = new EventSource('/events?gameType=kingdoms');

  liveEventsSource.addEventListener('status', (event) => {
    const payload = JSON.parse(event.data);
    isConnected = payload.status === 'connected';
    setConnectionStatus(payload.status || 'disconnected', payload.message || '', payload.error || '');
  });
  liveEventsSource.addEventListener('comment', (event) => {
    try { handleLiveComment(JSON.parse(event.data)); } catch (error) { console.error('[Reinos] Error en comentario:', error.message); }
  });
  liveEventsSource.addEventListener('gift', (event) => {
    try { handleLiveGift(JSON.parse(event.data)); } catch (error) { console.error('[Reinos] Error en regalo:', error.message); }
  });
  liveEventsSource.addEventListener('error', () => {
    if (isConnected) setConnectionStatus('connecting', 'Reconectando eventos del servidor...');
  });
}

kdConnectLiveBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const uniqueId = kdUsername.value.trim().replace(/^@/, '');
  if (!uniqueId) {
    showAppAlert('Primero vincula y guarda tu cuenta de TikTok desde la sección "Juegos".', 'Cuenta requerida');
    return;
  }

  try {
    setConnectionStatus('connecting', 'Cargando...');
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, gameType: 'kingdoms' }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo conectar a TikTok Live');

    isConnected = payload.status === 'connected';
    setConnectionStatus(payload.status || 'connected', payload.message || '', payload.error || '');
    if (isConnected) {
      connectToEvents();
      void loadGiftCatalog();
    }
  } catch (error) {
    setConnectionStatus('error', '', error.message);
  }
});

kdDisconnectBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    isConnected = false;
    if (liveEventsSource) { liveEventsSource.close(); liveEventsSource = null; }
    setConnectionStatus('disconnected', 'Desconectado de TikTok Live. La cuenta vinculada permanece guardada.');
  } catch (error) {
    showAppAlert(error.message, 'Error al desconectar');
  }
});

// ===== Catálogo visual =====
function statLine(label, value) {
  return `<span><em>${label}</em>${value}</span>`;
}

function renderCatalog() {
  const host = $('kdCatalog');
  const troopCards = Object.entries(UNITS).map(([id, u]) => {
    const tags = [];
    if (u.flying) tags.push('Vuela');
    if (u.buildingsOnly) tags.push('Solo torres');
    if (u.splash) tags.push('Área');
    if (u.pack) tags.push(`Trae ${u.pack}`);
    if (u.heal) tags.push('Cura');
    if (u.summon) tags.push('Invoca');
    if (u.range > 100) tags.push('A distancia');
    return `
      <article class="kd-unit-card">
        <canvas width="120" height="120" data-preview="${id}"></canvas>
        <div>
          <h4>${escapeHtml(u.name)}</h4>
          <p>${escapeHtml(u.desc)}</p>
          <div class="kd-stats">${statLine('Vida', u.hp)}${statLine('Daño', u.dmg || '—')}${statLine('Alcance', u.range)}${statLine('Velocidad', u.speed)}</div>
          <div class="kd-tags">${tags.map((tag) => `<b>${escapeHtml(tag)}</b>`).join('')}</div>
        </div>
      </article>`;
  }).join('');

  const spellCards = Object.entries(SPELLS).map(([, s]) => `
    <article class="kd-unit-card kd-spell-card" style="--spell:${s.color}">
      <div class="kd-spell-orb"></div>
      <div>
        <h4>${escapeHtml(s.name)}</h4>
        <p>${escapeHtml(s.desc)}</p>
        <div class="kd-tags"><b>Hechizo</b></div>
      </div>
    </article>`).join('');

  host.innerHTML = troopCards + spellCards;

  startCatalogAnimation(host);
}

// Cada ficha muestra al personaje caminando y, de vez en cuando, atacando
let catalogTimer = null;
function startCatalogAnimation(host) {
  if (catalogTimer) clearInterval(catalogTimer);
  const previews = [...host.querySelectorAll('canvas[data-preview]')].map((canvas, i) => ({
    canvas, ctx: canvas.getContext('2d'), id: canvas.dataset.preview, t: Math.random(), offset: i * 0.37,
  }));
  const start = performance.now();

  const paint = (timestamp) => {
    const now = (timestamp - start) / 1000;
    previews.forEach((p) => {
      const meta = KingdomsArt.META[p.id];
      const r = Math.min(84 / meta.hf, (116 * meta.artH) / (meta.w * meta.hf));
      const cycle = (now + p.offset) % 3.6;
      const attacking = cycle > 2.4;
      p.t = (p.t + 0.02) % 1;
      p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
      KingdomsArt.drawUnit(p.ctx, p.id, state.teams.left.color, 60, 100, r, 1, {
        walkT: p.t, attackP: attacking ? (cycle - 2.4) / 1.2 : undefined, moving: !attacking, time: now, phase: p.offset,
        lift: UNITS[p.id].flying ? r * 1.55 : 0,
      });
    });
  };
  paint(performance.now());
  catalogTimer = setInterval(() => { if (!document.hidden) paint(performance.now()); }, 90);
}

// ===== Pruebas manuales =====
function fillTestControls() {
  const sideSelect = $('kdTestSide');
  sideSelect.innerHTML = `<option value="left">${escapeHtml(state.teams.left.name)}</option><option value="right">${escapeHtml(state.teams.right.name)}</option>`;
  $('kdTestUnit').innerHTML = unitSelectOptions('squire');
}

function bindTestControls() {
  $('kdTestSummonBtn').addEventListener('click', () => {
    const side = $('kdTestSide').value;
    const item = $('kdTestUnit').value;
    const count = Math.max(1, Math.min(200, Math.round(Number($('kdTestCount').value) || 1)));
    const level = Math.max(1, Math.min(10, Math.round(Number($('kdTestLevel').value) || 1)));
    summonFromRule(side, { unit: item, level }, count, { key: 'prueba', name: 'Prueba' });
  });

  $('kdTestDemoBtn').addEventListener('click', () => {
    const pool = ['squire', 'archer', 'knight', 'wizard', 'ogre', 'skeletons', 'dragon', 'healer', 'titan', 'ram', 'necromancer', 'colossus'];
    ['left', 'right'].forEach((side) => {
      for (let i = 0; i < 7; i += 1) {
        const item = pool[Math.floor(Math.random() * pool.length)];
        const count = item === 'colossus' || item === 'titan' ? 2 : 4 + Math.floor(Math.random() * 8);
        engine.enqueue(side, item, count, 1 + Math.floor(Math.random() * 3), { key: `demo-${side}-${i}`, name: `Espectador ${i + 1}` });
      }
      engine.enqueue(side, 'fireball', 2, 2, { key: `demo-${side}-spell`, name: 'Hechizo' });
    });
    showFeed('Batalla de demostración', 'left');
  });

  $('kdTestClearBtn').addEventListener('click', () => {
    engine.clearArena();
  });
}

// ===== Controles =====
function bindControls() {
  $('kdFullscreenBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else kdStage.requestFullscreen?.().catch(() => {});
  });

  $('kdRestartMatchBtn').addEventListener('click', async () => {
    const confirmed = await showAppConfirm('¿Reiniciar la partida actual? El marcador de victorias se conserva.', 'Reiniciar partida');
    if (confirmed) engine.resetMatch();
  });

  $('kdResetScoreBtn').addEventListener('click', async () => {
    const confirmed = await showAppConfirm('¿Poner el marcador de victorias en 0 y volver a repartir a los espectadores en los reinos?', 'Reiniciar marcador');
    if (!confirmed) return;
    state.wins = { left: 0, right: 0 };
    state.teamBindings = {};
    scheduleSave();
    engine.resetMatch();
  });

  $('kdSaveConfigBtn').addEventListener('click', async () => {
    readConfigForm();
    fillConfigForm();
    fillTestControls();
    engine.resetMatch();
    saveState();
    await showAppAlert('Configuración guardada. Se reinició la partida con los nuevos valores.', 'Batalla de Reinos');
  });

  // Reglas de regalo
  kdGiftRulesTable.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove-rule]');
    if (removeBtn) {
      readGiftRulesFromUI();
      state.giftRules = state.giftRules.filter((rule) => rule.id !== removeBtn.dataset.removeRule);
      renderGiftRulesConfig();
      return;
    }

    const pickerToggle = event.target.closest('.gift-picker-toggle');
    if (pickerToggle) {
      const picker = pickerToggle.closest('.gift-picker');
      const wasOpen = !picker.querySelector('.gift-picker-panel')?.classList.contains('hidden');
      closeAllGiftPickers();
      if (!wasOpen) openGiftPickerPanel(picker);
      return;
    }

    const pickerItem = event.target.closest('.gift-picker-item');
    if (pickerItem) {
      selectGiftInPicker(pickerItem.closest('.gift-picker'), pickerItem.dataset.giftName);
      closeAllGiftPickers();
    }
  });

  kdGiftRulesTable.addEventListener('input', (event) => {
    if (!event.target.matches('.gift-picker-filter-name, .gift-picker-filter-min, .gift-picker-filter-max')) return;
    const picker = event.target.closest('.gift-picker');
    if (picker) refreshGiftPickerList(picker);
  });

  $('kdAddGiftRuleBtn').addEventListener('click', () => { readGiftRulesFromUI(); addGiftRule(); });
  $('kdSuggestRulesBtn').addEventListener('click', suggestRules);
  $('kdSaveGiftRulesBtn').addEventListener('click', async () => {
    readGiftRulesFromUI();
    saveState();
    await showAppAlert('Reglas de regalo guardadas.', 'Batalla de Reinos');
  });

  document.addEventListener('click', (event) => { if (!event.target.closest('.gift-picker')) closeAllGiftPickers(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAllGiftPickers(); });
}

// ===== Bucle principal =====
function startLoop() {
  let last = performance.now();
  let hudTimer = 0;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (window.__kdPause) { requestAnimationFrame(frame); return; } // solo para pruebas desde la consola
    engine.update(dt);
    engine.draw(now / 1000);

    hudTimer += dt;
    if (hudTimer >= 0.2) { hudTimer = 0; updateHud(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ===== Inicialización =====
async function initializeKingdoms() {
  await loadState();
  fillConfigForm();
  fillTestControls();

  engine = KingdomsEngine.create({
    canvas: kdCanvas,
    getConfig: () => ({ teams: state.teams, settings: state.settings }),
    hooks: {
      onMatchEnd,
      onReset: () => kdBanner.classList.add('hidden'),
    },
  });
  engine.resetMatch();
  engine.warmUp();

  renderCatalog();
  renderGiftRulesConfig();
  bindControls();
  bindTestControls();
  updateHud();
  startLoop();
  await restoreTiktokConnection();

  // Para pruebas desde la consola del navegador
  window.__kingdoms = { engine, state: () => state, handleLiveGift, handleLiveComment, updateHud };
}

initializeKingdoms().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
