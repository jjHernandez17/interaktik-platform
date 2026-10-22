// Reglas de regalos del Co-anfitrion IA: el streamer elige que regalos activan cada accion del agente.
// El selector de regalos es el mismo de los demas juegos (imagen + nombre + monedas, con filtro por nombre y por precio).
// Expone window.AiHostGiftRules para que ai-host.js lo lea al guardar (get) y lo llene al cargar (set).
(function () {
  const RULES = [
    { key: 'priority', icon: '⭐', title: 'Dar prioridad a su mensaje', help: 'Si mandan este regalo, el agente no lo agradece al momento: espera el mensaje de esa persona, lo agradece entonces y lo responde primero (si no escribe en 2 minutos, lo agradece igual).' },
    { key: 'advice', icon: '💡', title: 'Mencionarlo y darle un consejo', help: 'El agente dice su nombre y le da un consejo breve y positivo.' },
    { key: 'joke', icon: '😂', title: 'Contarle un chiste', help: 'El agente cuenta un chiste corto y sano.' },
    { key: 'flatter', icon: '💖', title: 'Mencionarlo y halagarlo', help: 'El agente dice su nombre y le dedica un halago creativo, distinto cada vez.' },
  ];
  const MAX_PER_RULE = 8;

  const root = document.getElementById('ahGiftRules');
  if (!root) return;

  let state = { priority: [], advice: [], joke: [], flatter: [] };
  let catalog = [];
  let catalogState = 'idle'; // idle | loading | ready | error

  const norm = (value) => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function pickUrl(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return pickUrl(value[0]);
    if (Array.isArray(value.urlList)) return pickUrl(value.urlList[0]);
    if (Array.isArray(value.url_list)) return pickUrl(value.url_list[0]);
    return pickUrl(value.url || value.uri || '');
  }

  function sanitizeCatalog(raw) {
    return (Array.isArray(raw) ? raw : [])
      .map((gift) => ({
        id: String(gift?.id ?? gift?.giftId ?? ''),
        name: String(gift?.name || gift?.giftName || '').trim(),
        diamondCount: Number(gift?.diamondCount || gift?.diamond_count || 0) || 0,
        imageUrl: pickUrl(gift?.imageUrl) || pickUrl(gift?.giftImage) || pickUrl(gift?.previewImage) || pickUrl(gift?.icon) || pickUrl(gift?.image) || '',
      }))
      .filter((gift) => gift.name)
      .sort((a, b) => a.diamondCount - b.diamondCount || a.name.localeCompare(b.name));
  }

  function findGift(name) {
    const key = norm(name);
    return key ? catalog.find((gift) => norm(gift.name) === key) || null : null;
  }

  async function loadCatalog() {
    if (catalogState === 'loading' || catalogState === 'ready') return;
    catalogState = 'loading';
    try {
      const response = await fetch('/api/gifts?gameType=aihost');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo.');
      catalog = sanitizeCatalog(data.gifts);
      catalogState = 'ready';
    } catch (error) {
      catalogState = 'error';
    }
    render(true);
  }

  // ----- selector (mismo diseño y clases que en los otros juegos) -----
  function listMarkup(ruleKey, nameFilter, min, max) {
    if (catalogState === 'loading' || catalogState === 'idle') return '<p class="muted">Cargando regalos...</p>';
    if (catalog.length === 0) return '<p class="muted">No se pudo cargar el catálogo. Escribe el nombre del regalo arriba y pulsa Enter.</p>';
    const filter = norm(nameFilter);
    const taken = new Set(state[ruleKey].map(norm));
    const filtered = catalog.filter((gift) => {
      if (filter && !norm(gift.name).includes(filter)) return false;
      if (min !== null && gift.diamondCount < min) return false;
      if (max !== null && gift.diamondCount > max) return false;
      return true;
    });
    if (filtered.length === 0) return '<p class="muted">Sin resultados para ese filtro.</p>';
    return filtered.map((gift) => `
      <button type="button" class="gift-picker-item${taken.has(norm(gift.name)) ? ' selected' : ''}" data-gift-name="${esc(gift.name)}">
        <img class="gift-picker-item-image" src="${esc(gift.imageUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
        <span class="gift-picker-item-name">${esc(gift.name)}</span>
        <span class="gift-picker-item-coins">${gift.diamondCount}</span>
      </button>`).join('');
  }

  function pickerMarkup() {
    return `
      <div class="gift-picker" data-gift-picker>
        <button type="button" class="gift-picker-toggle">
          <span class="gift-picker-selected placeholder">＋ Agregar regalo...</span>
          <svg class="gift-picker-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 4.5L7 9L11.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <div class="gift-picker-panel hidden">
          <div class="gift-picker-filters">
            <input type="text" class="gift-picker-filter-name" placeholder="Buscar por nombre..." autocomplete="off" maxlength="40" />
            <div class="gift-picker-coins-filter">
              <input type="number" min="0" class="gift-picker-filter-min" placeholder="Monedas mín." />
              <input type="number" min="0" class="gift-picker-filter-max" placeholder="Monedas máx." />
            </div>
          </div>
          <div class="gift-picker-list"></div>
        </div>
      </div>`;
  }

  function chipMarkup(name, ruleKey) {
    const gift = findGift(name);
    return `
      <span class="ah-gift-chip">
        ${gift ? `<img class="ah-gift-chip-img" src="${esc(gift.imageUrl)}" alt="" onerror="this.style.visibility='hidden'" />` : ''}
        <span class="ah-gift-chip-name">${esc(name)}</span>
        ${gift ? `<span class="ah-gift-chip-coins">${gift.diamondCount}</span>` : ''}
        <button type="button" data-remove-gift="${esc(name)}" data-rule="${ruleKey}" aria-label="Quitar ${esc(name)}">✕</button>
      </span>`;
  }

  // keepOpen: cuando llega el catalogo con un selector abierto, solo se actualiza su lista (no se cierra mientras se escribe)
  function render(keepOpen = false) {
    if (keepOpen && root.querySelector('.gift-picker-panel:not(.hidden)')) {
      root.querySelectorAll('.ah-gift-rule').forEach((box) => refreshPicker(box));
      return;
    }
    root.innerHTML = RULES.map((rule) => `
      <div class="ah-gift-rule" data-rule="${rule.key}">
        <div class="ah-gift-head">
          <span class="ah-gift-ico" aria-hidden="true">${rule.icon}</span>
          <div><strong>${esc(rule.title)}</strong><small>${esc(rule.help)}</small></div>
        </div>
        <div class="ah-gift-chips">${state[rule.key].length
          ? state[rule.key].map((name) => chipMarkup(name, rule.key)).join('')
          : '<span class="pk-hint">Ningún regalo: esta acción está desactivada.</span>'}</div>
        ${state[rule.key].length >= MAX_PER_RULE ? '<span class="pk-hint">Máximo 8 regalos por acción.</span>' : pickerMarkup()}
      </div>`).join('');
  }

  function refreshPicker(box) {
    const picker = box.querySelector('[data-gift-picker]');
    if (!picker) return;
    const min = picker.querySelector('.gift-picker-filter-min').value;
    const max = picker.querySelector('.gift-picker-filter-max').value;
    picker.querySelector('.gift-picker-list').innerHTML = listMarkup(
      box.dataset.rule,
      picker.querySelector('.gift-picker-filter-name').value,
      min !== '' ? Number(min) : null,
      max !== '' ? Number(max) : null,
    );
  }

  function closeAll() {
    root.querySelectorAll('.gift-picker-panel').forEach((panel) => panel.classList.add('hidden'));
    root.querySelectorAll('.gift-picker-toggle').forEach((toggle) => toggle.classList.remove('open'));
  }

  function changed() {
    document.dispatchEvent(new CustomEvent('ai-host-gift-rules-changed'));
  }

  function addGift(ruleKey, name) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean || state[ruleKey].length >= MAX_PER_RULE) return;
    if (state[ruleKey].some((item) => norm(item) === norm(clean))) return;
    state[ruleKey].push(clean);
    closeAll();
    render();
    changed();
  }

  root.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-gift]');
    if (remove) {
      const key = remove.dataset.rule;
      state[key] = state[key].filter((item) => item !== remove.dataset.removeGift);
      render();
      changed();
      return;
    }

    const toggle = event.target.closest('.gift-picker-toggle');
    if (toggle) {
      const picker = toggle.closest('.gift-picker');
      const wasOpen = !picker.querySelector('.gift-picker-panel').classList.contains('hidden');
      closeAll();
      if (!wasOpen) {
        loadCatalog();
        picker.querySelector('.gift-picker-panel').classList.remove('hidden');
        toggle.classList.add('open');
        refreshPicker(toggle.closest('.ah-gift-rule'));
        picker.querySelector('.gift-picker-filter-name').focus();
      }
      return;
    }

    const item = event.target.closest('.gift-picker-item');
    if (item) addGift(item.closest('.ah-gift-rule').dataset.rule, item.dataset.giftName);
  });

  root.addEventListener('input', (event) => {
    if (event.target.closest('.gift-picker-filters')) refreshPicker(event.target.closest('.ah-gift-rule'));
  });

  // Enter en el filtro: si no hay catalogo (o el regalo no esta), se agrega lo escrito tal cual
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.classList.contains('gift-picker-filter-name')) return;
    event.preventDefault();
    const box = event.target.closest('.ah-gift-rule');
    const typed = event.target.value;
    const exact = findGift(typed);
    addGift(box.dataset.rule, exact ? exact.name : typed);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-gift-picker]')) closeAll();
  });

  window.AiHostGiftRules = {
    get: () => JSON.parse(JSON.stringify(state)),
    set(rules) {
      state = { priority: [], advice: [], joke: [], flatter: [] };
      for (const rule of RULES) if (Array.isArray(rules?.[rule.key])) state[rule.key] = rules[rule.key].slice(0, MAX_PER_RULE);
      closeAll();
      render();
      loadCatalog(); // para mostrar la imagen y las monedas de los regalos ya elegidos
    },
    // el primer regalo configurado (para el boton "Regalo de prueba")
    firstGift: () => RULES.map((rule) => state[rule.key][0]).find(Boolean) || '',
    // para la imagen descargable de las reglas
    findGift,
    async ensureCatalog() {
      if (catalogState === 'idle') await loadCatalog();
      while (catalogState === 'loading') await new Promise((resolve) => setTimeout(resolve, 100));
    },
  };

  render();
})();
