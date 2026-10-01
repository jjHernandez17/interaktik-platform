// ===== Elementos del DOM =====
const bvgUsername = document.getElementById('bvgUsername');
const bvgConnectLiveBtn = document.getElementById('bvgConnectLiveBtn');
const bvgDisconnectBtn = document.getElementById('bvgDisconnectBtn');
const bvgConnectionStatus = document.getElementById('bvgConnectionStatusBadge');
const bvgConnectionDetails = document.getElementById('bvgConnectionDetails');

const bvgResetBtn = document.getElementById('bvgResetBtn');

const bvgGirlsWinsEl = document.getElementById('bvgGirlsWins');
const bvgBoysWinsEl = document.getElementById('bvgBoysWins');
const bvgField = document.getElementById('bvgField');
const bvgZoneGirls = document.getElementById('bvgZoneGirls');
const bvgZoneBoys = document.getElementById('bvgZoneBoys');
const bvgWall = document.getElementById('bvgWall');
const bvgGirlChar = document.getElementById('bvgGirlChar');
const bvgBoyChar = document.getElementById('bvgBoyChar');

const bvgGiftRulesTable = document.getElementById('bvgGiftRulesTable');
const bvgAddGiftRuleBtn = document.getElementById('bvgAddGiftRuleBtn');
const bvgSaveGiftRulesBtn = document.getElementById('bvgSaveGiftRulesBtn');
const bvgGiftTicker = document.getElementById('bvgGiftTicker');

// Nombres de archivo calcados tal cual del disco (mayúsculas mezcladas):
// en producción el hosting es case-sensitive, así que hay que respetar
// exactamente cómo están guardados.
const IMG_GIRL_WINNING = 'assets/images/Girl-winning.png';
const IMG_GIRL_LOSSING = 'assets/images/girl-lossing.png';
const IMG_MEN_WINNING = 'assets/images/men-winning.png';
const IMG_MEN_LOSSING = 'assets/images/Men-lossing.png';

const DEFAULT_GIFT_RULE_ID = 'binding-gift-default';

// ===== Estado persistido (respaldo en backend) =====
let state = {
  girlsPercent: 50,
  girlsWins: 0,
  boysWins: 0,
  pushingSide: null, // 'girls' | 'boys' | null (null = en reposo, nadie empujó todavía)
  giftRules: [{ id: DEFAULT_GIFT_RULE_ID, giftName: '', percent: 1 }],
  teamBindings: {}, // viewerKey -> 'girls' | 'boys' (se une comentando "G"/"B", puede cambiar de bando cuando quiera)
};

// ===== Estado transitorio (solo en memoria) =====
let isConnected = false;
let liveEventsSource = null;
let saveTimeout = null;
let bvgGiftCatalog = [];
let bvgGiftCatalogLoaded = false;
let bvgGiftCatalogLoading = false;
const liveGiftProgress = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

// ===== Catálogo de regalos (calcado de dominance.js/shell-game.js) =====
function pickFirstUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return pickFirstUrl(value[0]);

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

function sanitizeBvgGiftCatalog(rawGifts) {
  return (Array.isArray(rawGifts) ? rawGifts : []).map((gift) => ({
    id: String(gift?.id ?? gift?.giftId ?? ''),
    name: String(gift?.name || gift?.giftName || `Regalo ${gift?.id ?? ''}`).trim(),
    diamondCount: Number(gift?.diamondCount || gift?.diamond_count || 1) || 1,
    imageUrl: getGiftImageUrl(gift),
  }));
}

async function loadGiftCatalog() {
  if (bvgGiftCatalogLoading) return bvgGiftCatalog;
  bvgGiftCatalogLoading = true;

  try {
    const response = await fetch('/api/gifts?gameType=boyvsgirl');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo cargar el catálogo.');

    bvgGiftCatalog = sanitizeBvgGiftCatalog(result.gifts);
    bvgGiftCatalogLoaded = true;
    renderGiftRulesConfig();
    return bvgGiftCatalog;
  } catch (error) {
    console.error('[BoyVsGirl] Error cargando catálogo de regalos:', error.message);
    return bvgGiftCatalog;
  } finally {
    bvgGiftCatalogLoading = false;
  }
}

// ===== Helpers de espectador (calcados de shell-game.js) =====
function normalizeViewerKey(payload) {
  const userId = String(payload?.user?.userId || payload?.userId || '').trim();
  if (userId) return `id:${userId}`;

  const uniqueId = String(payload?.user?.uniqueId || payload?.uniqueId || '').trim().toLowerCase();
  if (uniqueId) return `uid:${uniqueId}`;

  const nickname = String(payload?.user?.nickname || payload?.nickname || '').trim().toLowerCase();
  if (nickname) return `nick:${nickname}`;

  return '';
}

function getLiveGiftProgressKey(payload) {
  const viewerKey = normalizeViewerKey(payload);
  const giftId = String(payload.giftId || '').trim();
  const giftName = String(payload.giftName || '').trim().toLowerCase();
  return [viewerKey, giftId || giftName].join('|');
}

function pruneLiveGiftProgress(now = Date.now()) {
  const ttlMs = 15000;
  for (const [key, entry] of liveGiftProgress.entries()) {
    const receivedAt = Number(entry?.receivedAt || 0) || 0;
    if (!receivedAt || now - receivedAt > ttlMs) {
      liveGiftProgress.delete(key);
    }
  }
}

function extractAppliedGiftCount(payload) {
  const diamondCount = Number(payload.diamondCount || 0) || 0;
  const repeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
  const repeatEnd = payload.repeatEnd === true || payload.repeatEnd === 1 || payload.repeatEnd === '1';

  if (diamondCount <= 0) return 0;

  const now = Date.now();
  pruneLiveGiftProgress(now);

  const progressKey = getLiveGiftProgressKey(payload);
  const previous = liveGiftProgress.get(progressKey);
  let appliedCount = repeatCount;

  if (previous) {
    const previousCount = Number(previous.repeatCount || 0) || 0;
    const previousReceivedAt = Number(previous.receivedAt || 0) || 0;
    const sameWindow = !previousReceivedAt || now - previousReceivedAt <= 8000;

    if (sameWindow && repeatCount >= previousCount) {
      appliedCount = Math.max(0, repeatCount - previousCount);
    }
  }

  if (appliedCount === 0) {
    if (repeatEnd) liveGiftProgress.delete(progressKey);
    return 0;
  }

  liveGiftProgress.set(progressKey, { repeatCount, receivedAt: now });
  if (repeatEnd) liveGiftProgress.delete(progressKey);

  return appliedCount;
}

// ===== Render =====
function updateCharacterSprites() {
  if (state.pushingSide === 'boys') {
    bvgGirlChar.src = IMG_GIRL_LOSSING;
    bvgBoyChar.src = IMG_MEN_WINNING;
  } else if (state.pushingSide === 'girls') {
    bvgGirlChar.src = IMG_GIRL_WINNING;
    bvgBoyChar.src = IMG_MEN_LOSSING;
  } else {
    bvgGirlChar.src = IMG_GIRL_WINNING;
    bvgBoyChar.src = IMG_MEN_WINNING;
  }
}

function render() {
  const girlsPercent = state.girlsPercent;
  const boysPercent = 100 - girlsPercent;

  bvgZoneGirls.style.width = `${girlsPercent}%`;
  bvgZoneBoys.style.left = `${girlsPercent}%`;
  bvgZoneBoys.style.width = `${boysPercent}%`;
  bvgWall.style.left = `${girlsPercent}%`;

  // Cada personaje se queda cerca de la pared por su lado (no al centro de
  // su zona, para que se vea que están empujando), pero con suficiente
  // separación entre ellos y el muro para que no se encimen ni lo atraviesen
  // ahora que son más chicos.
  const girlLeft = Math.max(10, girlsPercent - 15);
  const boyLeft = Math.min(90, girlsPercent + 15);
  bvgGirlChar.style.left = `${girlLeft}%`;
  bvgBoyChar.style.left = `${boyLeft}%`;

  bvgGirlsWinsEl.textContent = String(state.girlsWins);
  bvgBoysWinsEl.textContent = String(state.boysWins);

  updateCharacterSprites();
}

// ===== Mecánica del juego =====
// Mientras se celebra una victoria (la pared ya llegó al límite y está
// esperando para resetearse) se ignoran empujes nuevos, para que no se
// mezclen con el reset — ver WALL_WIN_CELEBRATION_MS más abajo.
let wallCelebratingWin = false;
const WALL_WIN_CELEBRATION_MS = 900;

function pushWall(side, amount = 1) {
  if (wallCelebratingWin) return;

  const safeAmount = Math.abs(Number(amount) || 0);
  if (safeAmount <= 0) return;

  if (side === 'boys') {
    state.girlsPercent = Math.max(0, state.girlsPercent - safeAmount);
    state.pushingSide = 'boys';
  } else {
    state.girlsPercent = Math.min(100, state.girlsPercent + safeAmount);
    state.pushingSide = 'girls';
  }

  render();
  scheduleSave();

  // La pared ya no tiene más espacio para un bando: primero se deja ver
  // que el muñeco la empujó hasta el límite (sin espacio restante para el
  // otro bando) y recién después de un momento se suma el win y se
  // reinicia al centro — en vez de saltar directo al reset en el mismo
  // instante, que hacía que el empuje final nunca se llegara a ver.
  if (state.girlsPercent <= 0 || state.girlsPercent >= 100) {
    const winningSide = state.girlsPercent <= 0 ? 'boys' : 'girls';
    wallCelebratingWin = true;

    setTimeout(() => {
      if (winningSide === 'boys') {
        state.boysWins += 1;
      } else {
        state.girlsWins += 1;
      }
      state.girlsPercent = 50;
      state.pushingSide = null;
      wallCelebratingWin = false;
      render();
      scheduleSave();
    }, WALL_WIN_CELEBRATION_MS);
  }
}

function resetGame() {
  wallCelebratingWin = false;
  state = {
    girlsPercent: 50,
    girlsWins: 0,
    boysWins: 0,
    pushingSide: null,
    giftRules: state.giftRules,
    teamBindings: {},
  };
  render();
  scheduleSave();
}

// ===== Reglas de regalo =====
function findGiftRuleForName(giftName) {
  const normalized = String(giftName || '').trim().toLowerCase();
  const specific = normalized
    ? state.giftRules.find((rule) => rule.id !== DEFAULT_GIFT_RULE_ID && rule.giftName.trim().toLowerCase() === normalized)
    : null;
  if (specific) return specific;
  return state.giftRules.find((rule) => rule.id === DEFAULT_GIFT_RULE_ID) || { percent: 1 };
}

// ===== UI: picker de regalos (imagen + monedas + filtro), calcado de Dominance =====
function findGiftInCatalogByName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;
  return bvgGiftCatalog.find((gift) => gift.name.toLowerCase() === normalized) || null;
}

function renderGiftPickerToggleLabel(giftName) {
  if (!giftName) {
    return '<span class="gift-picker-selected placeholder">Elige un regalo...</span>';
  }

  const gift = findGiftInCatalogByName(giftName);
  if (!gift) {
    return `<span class="gift-picker-selected"><span class="gift-picker-selected-name">${escapeHtml(giftName)}</span></span>`;
  }

  return `
    <span class="gift-picker-selected">
      <img class="gift-picker-selected-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" onerror="this.style.visibility='hidden'" />
      <span class="gift-picker-selected-name">${escapeHtml(gift.name)}</span>
      <span class="gift-picker-selected-coins">${gift.diamondCount}</span>
    </span>
  `;
}

function giftPickerListMarkup(selectedName, nameFilter = '', min = null, max = null) {
  if (bvgGiftCatalog.length === 0) {
    return '<p class="muted">Carga el catálogo primero.</p>';
  }

  const normalizedFilter = nameFilter.trim().toLowerCase();
  const normalizedSelected = String(selectedName || '').trim().toLowerCase();

  const filtered = bvgGiftCatalog.filter((gift) => {
    if (normalizedFilter && !gift.name.toLowerCase().includes(normalizedFilter)) return false;
    if (min !== null && !Number.isNaN(min) && gift.diamondCount < min) return false;
    if (max !== null && !Number.isNaN(max) && gift.diamondCount > max) return false;
    return true;
  });

  if (filtered.length === 0) {
    return '<p class="muted">Sin resultados para ese filtro.</p>';
  }

  return filtered.map((gift) => `
    <button type="button" class="gift-picker-item${normalizedSelected === gift.name.toLowerCase() ? ' selected' : ''}" data-gift-name="${escapeHtml(gift.name)}">
      <img class="gift-picker-item-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <span class="gift-picker-item-name">${escapeHtml(gift.name)}</span>
      <span class="gift-picker-item-coins">${gift.diamondCount}</span>
    </button>
  `).join('');
}

function giftPickerMarkup(rule) {
  return `
    <div class="gift-picker" data-gift-picker>
      <button type="button" class="gift-picker-toggle">
        ${renderGiftPickerToggleLabel(rule.giftName)}
        <svg class="gift-picker-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.5 4.5L7 9L11.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
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
    </div>
  `;
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
  if (!bvgGiftCatalogLoaded && !bvgGiftCatalogLoading) {
    void loadGiftCatalog();
  }
  picker.querySelector('.gift-picker-panel')?.classList.remove('hidden');
  picker.querySelector('.gift-picker-toggle')?.classList.add('open');
  refreshGiftPickerList(picker);
}

function selectGiftInPicker(picker, giftName) {
  const hiddenInput = picker.querySelector('[data-field="giftName"]');
  if (hiddenInput) hiddenInput.value = giftName;

  const toggle = picker.querySelector('.gift-picker-toggle');
  const chevron = toggle?.querySelector('.gift-picker-chevron');
  if (toggle && chevron) {
    toggle.innerHTML = renderGiftPickerToggleLabel(giftName) + chevron.outerHTML;
  }
}

// ===== UI: tabla de reglas de regalo =====
function giftRuleRow(rule, { removable }) {
  const giftCell = removable ? giftPickerMarkup(rule) : '<strong>Cualquier otro regalo</strong>';

  return `
    <tr data-rule-id="${rule.id}">
      <td>${giftCell}</td>
      <td><input data-field="percent" type="number" min="0" max="100" step="0.1" value="${Number(rule.percent || 0)}" /></td>
      <td>${removable ? `<button class="power-card-remove" type="button" data-remove-rule="${rule.id}" title="Quitar regla">✕</button>` : ''}</td>
    </tr>
  `;
}

function renderGiftRulesConfig() {
  if (!bvgGiftRulesTable) return;

  if (!bvgGiftCatalogLoaded && !bvgGiftCatalogLoading) {
    void loadGiftCatalog();
  }

  const defaultRule = state.giftRules.find((rule) => rule.id === DEFAULT_GIFT_RULE_ID) || {
    id: DEFAULT_GIFT_RULE_ID,
    giftName: '',
    percent: 1,
  };
  const specificRules = state.giftRules.filter((rule) => rule.id !== DEFAULT_GIFT_RULE_ID);

  const rows = [
    giftRuleRow(defaultRule, { removable: false }),
    ...specificRules.map((rule) => giftRuleRow(rule, { removable: true })),
  ].join('');

  bvgGiftRulesTable.innerHTML = `
    <table class="power-config-table">
      <thead><tr><th>Regalo</th><th>% que empuja la pared</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  renderGiftTicker();
}

// ===== UI: carrusel de regalos arriba del tablero =====
// Con 5 regalos o menos se muestran quietos y centrados; con más, la pista
// se duplica una vez y se anima en bucle continuo (tipo anuncio LED) para
// que el loop no tenga salto visible cuando la primera copia termina de
// salir y entra la segunda.
function giftTickerItemMarkup(imageUrl) {
  return `<img class="bvg-gift-ticker-item" src="${escapeHtml(imageUrl)}" alt="" onerror="this.style.visibility='hidden'" />`;
}

function renderGiftTicker() {
  if (!bvgGiftTicker) return;

  const imageUrls = state.giftRules
    .filter((rule) => rule.id !== DEFAULT_GIFT_RULE_ID && rule.giftName.trim() && Number(rule.percent) > 0)
    .map((rule) => findGiftInCatalogByName(rule.giftName)?.imageUrl || '')
    .filter(Boolean);

  if (imageUrls.length === 0) {
    bvgGiftTicker.classList.add('hidden');
    bvgGiftTicker.innerHTML = '';
    return;
  }

  bvgGiftTicker.classList.remove('hidden');

  const itemsMarkup = imageUrls.map(giftTickerItemMarkup).join('');

  // Siempre anima, sin importar cuántos regalos haya — nunca se detiene.
  // Se duplica el contenido para que al desplazar -50% del ancho total
  // (que es el doble del contenido real) la pista quede exactamente donde
  // empezó, logrando un loop perfectamente continuo.
  const durationSeconds = Math.max(10, imageUrls.length * 2.4);
  bvgGiftTicker.innerHTML = `
    <div class="bvg-gift-ticker-track scrolling" style="animation-duration:${durationSeconds}s;">
      ${itemsMarkup}
      ${itemsMarkup}
    </div>
  `;
}

function saveGiftRulesFromUI() {
  if (!bvgGiftRulesTable) return;

  const rows = bvgGiftRulesTable.querySelectorAll('tbody tr');
  const rules = [];

  rows.forEach((row) => {
    const ruleId = row.dataset.ruleId;
    const giftName = row.querySelector('[data-field="giftName"]')?.value || '';
    const percent = Number(row.querySelector('[data-field="percent"]')?.value || 0);
    rules.push({ id: ruleId, giftName, percent: Math.max(0, Math.min(100, percent)) });
  });

  state.giftRules = rules;
}

function addGiftRule() {
  state.giftRules.push({
    id: `binding-gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    giftName: '',
    percent: 1,
  });
  renderGiftRulesConfig();
}

function removeGiftRule(ruleId) {
  state.giftRules = state.giftRules.filter((rule) => rule.id !== ruleId);
  renderGiftRulesConfig();
}

async function saveGiftRulesConfig() {
  saveGiftRulesFromUI();
  await saveState();
}

function bindGiftRulesUI() {
  if (bvgGiftRulesTable) {
    bvgGiftRulesTable.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('[data-remove-rule]');
      if (removeBtn) {
        saveGiftRulesFromUI();
        removeGiftRule(removeBtn.dataset.removeRule);
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
        const picker = pickerItem.closest('.gift-picker');
        selectGiftInPicker(picker, pickerItem.dataset.giftName);
        closeAllGiftPickers();
      }
    });

    bvgGiftRulesTable.addEventListener('input', (event) => {
      if (!event.target.matches('.gift-picker-filter-name, .gift-picker-filter-min, .gift-picker-filter-max')) return;
      const picker = event.target.closest('.gift-picker');
      if (picker) refreshGiftPickerList(picker);
    });
  }

  if (bvgAddGiftRuleBtn) {
    bvgAddGiftRuleBtn.addEventListener('click', () => {
      saveGiftRulesFromUI();
      addGiftRule();
    });
  }

  if (bvgSaveGiftRulesBtn) {
    bvgSaveGiftRulesBtn.addEventListener('click', async () => {
      await saveGiftRulesConfig();
      await showAppAlert('Configuración de regalos guardada.', 'Boy vs Girl');
    });
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.gift-picker')) closeAllGiftPickers();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllGiftPickers();
  });
}

// ===== Efecto visual: el regalo vuela desde el bando de quien lo mandó
// hasta la pared (el "centro de gravedad" del juego) y explota al tocarla,
// con el mismo lenguaje visual que las explosiones de Dominance (onda de
// choque + escombros + flash), pero en los colores del bando que empujó. =====
const BVG_SIDE_COLOR = { girls: '#ec4899', boys: '#3b82f6' };

function spawnGiftExplosion(leftPercent, topPercent, side) {
  if (!bvgField) return;

  const rect = bvgField.getBoundingClientRect();
  const x = (leftPercent / 100) * rect.width;
  const y = (topPercent / 100) * rect.height;
  const color = BVG_SIDE_COLOR[side] || '#ffffff';

  const flash = document.createElement('div');
  flash.className = 'bvg-gift-flash';
  flash.style.left = `${x}px`;
  flash.style.top = `${y}px`;
  flash.style.color = color;
  bvgField.appendChild(flash);
  setTimeout(() => flash.remove(), 300);

  const ring = document.createElement('div');
  ring.className = 'bvg-gift-shockwave';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.color = color;
  bvgField.appendChild(ring);
  setTimeout(() => ring.remove(), 460);

  const debrisCount = 9;
  for (let i = 0; i < debrisCount; i += 1) {
    const angle = ((Math.PI * 2 * i) / debrisCount) + (Math.random() * 0.5 - 0.25);
    const distance = 30 + Math.random() * 24;
    const debris = document.createElement('div');
    debris.className = 'bvg-gift-debris';
    debris.style.left = `${x}px`;
    debris.style.top = `${y}px`;
    debris.style.color = color;
    debris.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    debris.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    bvgField.appendChild(debris);
    setTimeout(() => debris.remove(), 460);
  }
}

// El regalo nace junto al personaje del bando que lo mandó y vuela hasta
// la posición actual de la pared (no la posición final, que todavía no
// existe — la pared se mueve recién cuando el impacto "la empuja", vía
// onImpact). Si el regalo no tiene imagen en el catálogo, se aplica el
// empuje al instante, sin animación.
function spawnGiftProjectile(imageUrl, side, onImpact) {
  if (!bvgField || !imageUrl) {
    onImpact();
    return;
  }

  const startPercent = side === 'girls' ? 8 : 92;
  const targetPercent = state.girlsPercent;
  // Punto aleatorio del eje vertical (lejos de los bordes para que la
  // imagen y la explosión no queden cortadas) — así los regalos no se
  // amontonan siempre en la misma línea horizontal.
  const topPercent = 18 + Math.random() * 64;

  let impacted = false;
  const impact = () => {
    if (impacted) return;
    impacted = true;
    projectile.remove();
    spawnGiftExplosion(targetPercent, topPercent, side);
    onImpact();
  };

  const projectile = document.createElement('img');
  projectile.className = 'bvg-gift-projectile';
  projectile.src = imageUrl;
  projectile.alt = '';
  projectile.style.left = `${startPercent}%`;
  projectile.style.top = `${topPercent}%`;
  projectile.onerror = impact;
  bvgField.appendChild(projectile);

  // Fuerza un reflow antes de mover `left`: si el valor final se asigna en
  // el mismo tick en que se crea el elemento, el navegador no detecta el
  // cambio como una transición y salta directo al final sin animar.
  void projectile.offsetWidth;
  requestAnimationFrame(() => {
    projectile.style.left = `${targetPercent}%`;
  });

  setTimeout(impact, 550);
}

// ===== Eventos del live =====
// El comentario "G"/"B" une al espectador a un bando; puede cambiarse de
// bando las veces que quiera volviendo a comentar "G" o "B" — no queda
// fijo tras el primer comentario. Los regalos empujan la pared a favor
// del bando al que esté unido en ese momento.
function handleLiveComment(payload) {
  const raw = String(payload.comment || payload.commentText || '').trim().toUpperCase();
  const side = raw === 'G' ? 'girls' : raw === 'B' ? 'boys' : null;
  if (!side) return;

  const viewerKey = normalizeViewerKey(payload);
  if (!viewerKey || state.teamBindings[viewerKey] === side) return;

  state.teamBindings[viewerKey] = side;
  scheduleSave();
}

// Un combo de regalos (ej. 5 rosas mandadas juntas) vuela como 5
// proyectiles independientes, cada uno en su propio punto del eje
// vertical y con un pequeño desfase de lanzamiento, en vez de un único
// proyectil que representa todo el combo — cada unidad empuja la pared
// por separado al impactar (y, como `targetPercent` se calcula recién al
// lanzarse cada una, las siguientes apuntan a la posición ya empujada por
// las anteriores, generando un empuje en cascada).
function handleLiveGift(payload) {
  const viewerKey = normalizeViewerKey(payload);
  if (!viewerKey) return;

  const side = state.teamBindings[viewerKey];
  if (!side) return; // todavía no se unió a ningún bando

  const appliedCount = extractAppliedGiftCount(payload);
  if (appliedCount <= 0) return;

  const rule = findGiftRuleForName(payload.giftName);
  const percent = Number(rule?.percent || 0);
  if (percent <= 0) return;

  const imageUrl = findGiftInCatalogByName(payload.giftName)?.imageUrl || '';

  for (let i = 0; i < appliedCount; i += 1) {
    const launchDelay = i * 90 + Math.random() * 40;
    setTimeout(() => {
      spawnGiftProjectile(imageUrl, side, () => pushWall(side, percent));
    }, launchDelay);
  }
}

// ===== Persistencia =====
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 600);
}

function saveState() {
  fetch('/api/boy-vs-girl/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }).catch((error) => {
    console.error('[BoyVsGirl] Error saving state:', error.message);
  });
}

function sanitizeGiftRules(rawRules) {
  const list = (Array.isArray(rawRules) ? rawRules : []).map((rule) => ({
    id: String(rule?.id || `binding-gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    giftName: String(rule?.giftName || '').trim(),
    percent: Math.max(0, Math.min(100, Number(rule?.percent) || 0)),
  }));

  if (!list.some((rule) => rule.id === DEFAULT_GIFT_RULE_ID)) {
    list.unshift({ id: DEFAULT_GIFT_RULE_ID, giftName: '', percent: 1 });
  }
  return list;
}

function sanitizeTeamBindings(rawBindings) {
  const result = {};
  if (rawBindings && typeof rawBindings === 'object') {
    Object.entries(rawBindings).forEach(([key, value]) => {
      if (key && ['girls', 'boys'].includes(value)) result[key] = value;
    });
  }
  return result;
}

async function loadState() {
  try {
    const response = await fetch('/api/boy-vs-girl/state');
    if (!response.ok) return;
    const data = await response.json();
    state = {
      girlsPercent: Math.max(0, Math.min(100, Number(data.girlsPercent))) || (data.girlsPercent === 0 ? 0 : 50),
      girlsWins: Math.max(0, Math.round(Number(data.girlsWins) || 0)),
      boysWins: Math.max(0, Math.round(Number(data.boysWins) || 0)),
      pushingSide: ['girls', 'boys'].includes(data.pushingSide) ? data.pushingSide : null,
      giftRules: sanitizeGiftRules(data.giftRules),
      teamBindings: sanitizeTeamBindings(data.teamBindings),
    };
  } catch (error) {
    console.error('[BoyVsGirl] Error cargando estado:', error.message);
  }
}

// ===== Conexión TikTok Live (mismo patrón que el resto de los juegos) =====
function setBvgConnectionStatus(status, details = '', error = '') {
  const displayStatus = error ? 'error' : status;
  const labels = {
    unlinked: 'Sin vincular',
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    connected: 'Conectado',
    error: 'Error',
  };

  bvgConnectionStatus.textContent = labels[displayStatus] || labels.disconnected;
  bvgConnectionStatus.className = `status-badge ${displayStatus}`;

  if (!bvgConnectionDetails) return;
  if (displayStatus === 'error') {
    bvgConnectionDetails.textContent = error || 'Error al conectar al live, por favor contactate con un desarrollador.';
  } else if (details) {
    bvgConnectionDetails.textContent = details;
  } else if (displayStatus === 'unlinked' || displayStatus === 'disconnected') {
    bvgConnectionDetails.textContent = 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.';
  }
}

async function restoreTiktokConnection() {
  try {
    const response = await fetch('/api/tiktok-connection/boyvsgirl');
    if (!response.ok) return;
    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      bvgUsername.value = `@${data.tiktok_username}`;
      setBvgConnectionStatus('disconnected', `Cuenta vinculada a @${data.tiktok_username}. Presiona "Conectar a live" cuando ya estés transmitiendo.`);
    } else {
      bvgUsername.value = '';
      setBvgConnectionStatus('disconnected', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    console.error('[BoyVsGirl] Error restoring TikTok connection:', error.message);
  }
}

function connectToEvents() {
  if (liveEventsSource) liveEventsSource.close();

  liveEventsSource = new EventSource('/events?gameType=boyvsgirl');

  liveEventsSource.addEventListener('status', (event) => {
    const payload = JSON.parse(event.data);
    isConnected = payload.status === 'connected';
    setBvgConnectionStatus(payload.status || 'disconnected', payload.message || '', payload.error || '');
  });

  liveEventsSource.addEventListener('comment', (event) => {
    try {
      handleLiveComment(JSON.parse(event.data));
    } catch (error) {
      console.error('[BoyVsGirl] Error handling comment event:', error.message);
    }
  });

  liveEventsSource.addEventListener('gift', (event) => {
    try {
      handleLiveGift(JSON.parse(event.data));
    } catch (error) {
      console.error('[BoyVsGirl] Error handling gift event:', error.message);
    }
  });

  liveEventsSource.addEventListener('error', () => {
    if (isConnected) {
      setBvgConnectionStatus('connecting', 'Reconectando eventos del servidor...');
    }
  });
}

if (bvgConnectLiveBtn) {
  bvgConnectLiveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const uniqueId = bvgUsername.value.trim().replace(/^@/, '');
    if (!uniqueId) {
      showAppAlert('Primero vincula y guarda tu cuenta de TikTok desde la sección "Juegos".', 'Cuenta requerida');
      return;
    }

    try {
      setBvgConnectionStatus('connecting', 'Cargando...');
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueId, gameType: 'boyvsgirl' }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo conectar a TikTok Live');
      }

      isConnected = payload.status === 'connected';
      setBvgConnectionStatus(payload.status || 'connected', payload.message || '', payload.error || '');
      if (isConnected) connectToEvents();
    } catch (error) {
      setBvgConnectionStatus('error', '', error.message);
    }
  });
}

if (bvgDisconnectBtn) {
  bvgDisconnectBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
      isConnected = false;
      if (liveEventsSource) {
        liveEventsSource.close();
        liveEventsSource = null;
      }
      setBvgConnectionStatus('disconnected', 'Desconectado de TikTok Live. La cuenta vinculada permanece guardada.');
    } catch (error) {
      showAppAlert(error.message, 'Error al desconectar');
    }
  });
}

if (bvgResetBtn) {
  bvgResetBtn.addEventListener('click', async () => {
    const confirmed = await showAppConfirm('¿Reiniciar el marcador y la posición de la pared?', 'Reiniciar juego');
    if (!confirmed) return;
    resetGame();
  });
}

// ===== Inicialización =====
async function initializeBoyVsGirl() {
  bindGiftRulesUI();
  await loadState();
  render();
  renderGiftRulesConfig();
  await restoreTiktokConnection();
}

initializeBoyVsGirl().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
