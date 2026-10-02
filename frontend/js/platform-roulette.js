// Configuración del overlay "Ruleta" dentro de la plataforma (modal del panel
// de Overlays). Se carga DESPUÉS de platform.js y reutiliza sus utilidades
// (showAppAlert, makeModalToggle, copyOverlayLink, regenerateOverlayKey...).
// platform.js solo le pasa el estado guardado con window.applyRouletteState().

(function setupRouletteConfig() {
  const MAX_OPTIONS = 12; // mismo tope que ROULETTE_MAX_OPTIONS en el backend
  const MAX_GIFT_RULES = 20; // mismo tope que ROULETTE_MAX_GIFT_RULES
  const MIN_OPTIONS_TO_SPIN = 2;
  const OPTION_COLORS = [
    '#7c5cff', '#22d3ee', '#f472b6', '#fbbf24', '#4ade80', '#fb923c',
    '#38bdf8', '#f87171', '#a78bfa', '#2dd4bf', '#e879f9', '#facc15',
  ];

  const $ = (id) => document.getElementById(id);

  const cardToggle = $('rouletteCardToggle');
  const modal = $('rouletteConfigModal');
  const closeBtn = $('rouletteConfigCloseBtn');
  const linkInput = $('rouletteLinkInput');
  const copyLinkBtn = $('rouletteCopyLinkBtn');
  const regenerateBtn = $('rouletteRegenerateBtn');
  const linkHint = $('rouletteLinkHint');

  const enabledToggle = $('rouletteEnabledToggle');
  const spinPerGiftToggle = $('rouletteSpinPerGiftToggle');
  const titleInput = $('rouletteTitleInput');
  const soundSelect = $('rouletteSoundSelect');
  const soundPreviewBtn = $('rouletteSoundPreviewBtn');
  const spinInput = $('rouletteSpinInput');
  const spinValue = $('rouletteSpinValue');
  const resultInput = $('rouletteResultInput');
  const resultValue = $('rouletteResultValue');

  const optionsList = $('rouletteOptionsList');
  const optionsCount = $('rouletteOptionsCount');
  const addOptionBtn = $('rouletteAddOptionBtn');

  const loadGiftsBtn = $('rouletteLoadGiftsBtn');
  const picker = $('roulettePicker');
  const pickerToggle = $('roulettePickerToggle');
  const pickerLabel = $('roulettePickerLabel');
  const pickerPanel = $('roulettePickerPanel');
  const pickerSearch = $('roulettePickerSearch');
  const pickerMin = $('roulettePickerMin');
  const pickerMax = $('roulettePickerMax');
  const pickerList = $('roulettePickerList');
  const giftRulesEl = $('rouletteGiftRules');

  const testBtn = $('rouletteTestBtn');
  const saveBtn = $('rouletteSaveBtn');

  if (!modal || !optionsList || !giftRulesEl) return;

  let options = []; // [{ label, color }]
  let giftRules = []; // [{ giftId, giftName, giftImageUrl, diamondCount }]
  let giftCatalog = [];
  let catalogRequested = false;

  // ---------- Utilidades ----------
  function escape(value) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(value)
      : String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function nextFreeColor() {
    const used = new Set(options.map((option) => option.color));
    return OPTION_COLORS.find((color) => !used.has(color)) || OPTION_COLORS[options.length % OPTION_COLORS.length];
  }

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

  // ---------- Opciones ----------
  function renderOptions() {
    optionsCount.textContent = `${options.length} / ${MAX_OPTIONS}`;
    optionsCount.classList.toggle('is-warning', options.length < MIN_OPTIONS_TO_SPIN);
    addOptionBtn.disabled = options.length >= MAX_OPTIONS;

    if (options.length === 0) {
      optionsList.innerHTML = '<p class="rl-empty">Aún no hay opciones. Agrega al menos 2 para que la ruleta pueda girar.</p>';
      return;
    }

    optionsList.innerHTML = options.map((option, index) => `
      <div class="rl-option" data-index="${index}">
        <span class="rl-option-num">${index + 1}</span>
        <input class="rl-option-color" type="color" value="${escape(option.color)}" aria-label="Color de la opción ${index + 1}" />
        <input class="rl-option-label" type="text" maxlength="40" value="${escape(option.label)}" placeholder="Texto de la opción ${index + 1}" aria-label="Opción ${index + 1}" />
        <button class="rl-icon-btn" type="button" data-remove-option="${index}" aria-label="Quitar opción ${index + 1}" title="Quitar">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
    `).join('');
  }

  optionsList.addEventListener('input', (event) => {
    const row = event.target.closest('.rl-option');
    if (!row) return;

    const option = options[Number(row.dataset.index)];
    if (!option) return;

    if (event.target.classList.contains('rl-option-label')) option.label = event.target.value;
    if (event.target.classList.contains('rl-option-color')) option.color = event.target.value;
  });

  optionsList.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove-option]');
    if (!removeBtn) return;

    options.splice(Number(removeBtn.dataset.removeOption), 1);
    renderOptions();
  });

  addOptionBtn.addEventListener('click', () => {
    if (options.length >= MAX_OPTIONS) return;

    options.push({ label: '', color: nextFreeColor() });
    renderOptions();

    const labels = optionsList.querySelectorAll('.rl-option-label');
    labels[labels.length - 1]?.focus();
  });

  // ---------- Regalos ----------
  function renderGiftRules() {
    if (giftRules.length === 0) {
      giftRulesEl.innerHTML = '<p class="rl-empty">Todavía no elegiste ningún regalo. Sin regalos, la ruleta solo gira con "Probar giro".</p>';
      return;
    }

    giftRulesEl.innerHTML = giftRules.map((rule) => `
      <div class="rl-gift" data-gift-id="${escape(rule.giftId)}">
        <img class="rl-gift-img" src="${escape(rule.giftImageUrl)}" alt="" onerror="this.style.visibility='hidden'" />
        <span class="rl-gift-name">${escape(rule.giftName)}</span>
        <span class="rl-gift-coins">${escape(rule.diamondCount)}</span>
        <button class="rl-icon-btn" type="button" data-remove-gift="${escape(rule.giftId)}" aria-label="Quitar ${escape(rule.giftName)}" title="Quitar">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
    `).join('');
  }

  giftRulesEl.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove-gift]');
    if (!removeBtn) return;

    giftRules = giftRules.filter((rule) => rule.giftId !== removeBtn.dataset.removeGift);
    renderGiftRules();
    renderPickerList();
  });

  function renderPickerList() {
    if (giftCatalog.length === 0) {
      pickerList.innerHTML = '<p class="rl-empty">Carga el catálogo primero.</p>';
      return;
    }

    const nameFilter = pickerSearch.value.trim().toLowerCase();
    const min = pickerMin.value !== '' ? Number(pickerMin.value) : null;
    const max = pickerMax.value !== '' ? Number(pickerMax.value) : null;
    const chosen = new Set(giftRules.map((rule) => rule.giftId));

    const filtered = giftCatalog.filter((gift) => {
      if (nameFilter && !String(gift.name).toLowerCase().includes(nameFilter)) return false;
      if (min !== null && !Number.isNaN(min) && gift.diamondCount < min) return false;
      if (max !== null && !Number.isNaN(max) && gift.diamondCount > max) return false;
      return true;
    });

    if (filtered.length === 0) {
      pickerList.innerHTML = '<p class="rl-empty">Sin resultados para ese filtro.</p>';
      return;
    }

    pickerList.innerHTML = filtered.map((gift) => `
      <button type="button" class="rl-picker-item${chosen.has(gift.id) ? ' is-chosen' : ''}" data-gift-id="${escape(gift.id)}">
        <img class="rl-gift-img" src="${escape(gift.imageUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
        <span class="rl-gift-name">${escape(gift.name)}</span>
        <span class="rl-gift-coins">${escape(gift.diamondCount)}</span>
      </button>
    `).join('');
  }

  function setPickerOpen(open) {
    pickerPanel.hidden = !open;
    pickerToggle.setAttribute('aria-expanded', String(open));
    picker.classList.toggle('is-open', open);
  }

  pickerToggle.addEventListener('click', () => {
    if (giftCatalog.length === 0) {
      loadCatalog(false);
      return;
    }
    setPickerOpen(pickerPanel.hidden);
  });

  [pickerSearch, pickerMin, pickerMax].forEach((input) => input.addEventListener('input', renderPickerList));

  pickerList.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-gift-id]');
    if (!item) return;

    const gift = giftCatalog.find((entry) => entry.id === item.dataset.giftId);
    if (!gift) return;

    if (giftRules.some((rule) => rule.giftId === gift.id)) {
      giftRules = giftRules.filter((rule) => rule.giftId !== gift.id);
    } else {
      if (giftRules.length >= MAX_GIFT_RULES) {
        await showAppAlert(`Puedes elegir hasta ${MAX_GIFT_RULES} regalos.`, 'Límite alcanzado');
        return;
      }
      giftRules.push({
        giftId: gift.id,
        giftName: gift.name,
        giftImageUrl: gift.imageUrl || '',
        diamondCount: gift.diamondCount,
      });
    }

    renderGiftRules();
    renderPickerList();
  });

  document.addEventListener('click', (event) => {
    if (!pickerPanel.hidden && !picker.contains(event.target)) setPickerOpen(false);
  });

  async function loadCatalog(silent) {
    catalogRequested = true;
    loadGiftsBtn.disabled = true;
    loadGiftsBtn.textContent = 'Cargando...';

    try {
      const response = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'app' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo.');

      giftCatalog = sanitizeGiftCatalog(data.gifts);
      pickerLabel.textContent = giftCatalog.length === 0
        ? 'Sin regalos disponibles (vincula tu TikTok y carga el catálogo en Juegos)'
        : 'Elegir regalos del catálogo';
      renderPickerList();

      if (!silent && giftCatalog.length > 0) setPickerOpen(true);
      if (!silent && giftCatalog.length === 0) {
        await showAppAlert('No hay regalos en el catálogo. Vincula tu usuario de TikTok en "Juegos" y usa "Cargar catálogo".', 'Catálogo vacío');
      }
    } catch (error) {
      if (!silent) await showAppAlert(error.message, 'Error al cargar el catálogo');
    } finally {
      loadGiftsBtn.disabled = false;
      loadGiftsBtn.textContent = 'Cargar catálogo';
    }
  }

  loadGiftsBtn.addEventListener('click', () => loadCatalog(false));

  // ---------- Estado (lo llama platform.js al cargar / guardar) ----------
  window.applyRouletteState = function applyRouletteState(state) {
    const roulette = state?.roulette || {};

    enabledToggle.checked = roulette.enabled !== false;
    spinPerGiftToggle.checked = roulette.spinPerGift === true;
    titleInput.value = roulette.title ?? 'Ruleta';
    soundSelect.value = roulette.sound || 'none';
    spinInput.value = roulette.spinSeconds || 6;
    spinValue.textContent = `${spinInput.value}s`;
    resultInput.value = roulette.resultSeconds || 5;
    resultValue.textContent = `${resultInput.value}s`;

    options = (Array.isArray(roulette.options) ? roulette.options : []).map((option, index) => ({
      label: option.label || '',
      color: option.color || OPTION_COLORS[index % OPTION_COLORS.length],
    }));
    giftRules = (Array.isArray(roulette.giftRules) ? roulette.giftRules : []).map((rule) => ({
      giftId: String(rule.giftId),
      giftName: rule.giftName || 'Regalo',
      giftImageUrl: rule.giftImageUrl || '',
      diamondCount: Number(rule.diamondCount) || 0,
    }));

    renderOptions();
    renderGiftRules();
    renderPickerList();
  };

  // ---------- Guardar / probar ----------
  async function saveRoulette() {
    const cleanOptions = options
      .map((option) => ({ label: option.label.trim(), color: option.color }))
      .filter((option) => option.label);

    if (cleanOptions.length < MIN_OPTIONS_TO_SPIN) {
      await showAppAlert('Escribe al menos 2 opciones para que la ruleta pueda girar.', 'Faltan opciones');
      return;
    }

    try {
      saveBtn.disabled = true;
      const response = await fetch('/api/overlay/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentOverlayState,
          roulette: {
            enabled: enabledToggle.checked,
            title: titleInput.value,
            spinSeconds: Number(spinInput.value) || 6,
            resultSeconds: Number(resultInput.value) || 5,
            sound: soundSelect.value || 'none',
            spinPerGift: spinPerGiftToggle.checked,
            options: cleanOptions,
            giftRules,
          },
        }),
      });
      if (!response.ok) throw new Error('No se pudo guardar la configuración.');

      const data = await response.json();
      applyOverlayStateToInputs(data.state);
      reloadOverlayPreviewFrames();
      showAppAlert('Configuración de la ruleta guardada.', 'Overlays');
    } catch (error) {
      showAppAlert(error.message, 'Error al guardar');
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function sendTestSpin() {
    testBtn.disabled = true;
    try {
      const response = await fetch('/api/overlay/test-roulette', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo enviar el giro de prueba.');
      const data = await response.json();
      linkHint.textContent = `Giro de prueba enviado (${data.sender}). Se ve en el link real, no en la vista previa.`;
    } catch (error) {
      showAppAlert(error.message, 'Error');
    } finally {
      testBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', saveRoulette);
  testBtn.addEventListener('click', sendTestSpin);

  // ---------- Modal, link, sonido ----------
  const modalControls = makeModalToggle(cardToggle, modal);
  closeBtn?.addEventListener('click', modalControls.close);

  // El catálogo se pide solo la primera vez que se abre el modal.
  cardToggle?.addEventListener('click', () => {
    if (!catalogRequested) loadCatalog(true);
  });

  copyLinkBtn?.addEventListener('click', copyOverlayLink(linkInput, linkHint));
  regenerateBtn?.addEventListener('click', () => regenerateOverlayKey('roulette'));

  spinInput.addEventListener('input', () => { spinValue.textContent = `${spinInput.value}s`; });
  resultInput.addEventListener('input', () => { resultValue.textContent = `${resultInput.value}s`; });

  const sounds = window.OVERLAY_SOUNDS || { none: { label: 'Ninguno' } };
  Object.entries(sounds).forEach(([id, { label }]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    soundSelect.appendChild(option);
  });
  soundPreviewBtn?.addEventListener('click', () => window.playOverlaySound?.(soundSelect.value));

  renderOptions();
  renderGiftRules();
  renderPickerList();
})();
