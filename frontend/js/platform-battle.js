// Configuración del overlay "Batalla" dentro de la plataforma (modal del panel
// de Overlays). Se carga DESPUÉS de platform.js y reutiliza sus utilidades
// (showAppAlert, showAppConfirm, makeModalToggle, copyOverlayLink...).
// platform.js solo le pasa el estado guardado con window.applyBattleState().

(function setupBattleConfig() {
  const MAX_GIFTS_PER_SIDE = 20; // mismo tope que BATTLE_MAX_GIFT_RULES en el backend
  const IMAGE_SIZE = 192; // las imágenes se reducen a un cuadrado de este lado
  const MAX_IMAGE_CHARS = 110000; // por debajo del tope del servidor (120000)
  const SIDES = ['A', 'B'];

  const $ = (id) => document.getElementById(id);

  const cardToggle = $('battleCardToggle');
  const modal = $('battleConfigModal');
  const closeBtn = $('battleConfigCloseBtn');
  const linkInput = $('battleLinkInput');
  const copyLinkBtn = $('battleCopyLinkBtn');
  const regenerateBtn = $('battleRegenerateBtn');
  const linkHint = $('battleLinkHint');
  const enabledToggle = $('battleEnabledToggle');
  const titleInput = $('battleTitleInput');
  const loadGiftsBtn = $('battleLoadGiftsBtn');
  const scoreAEl = $('battleScoreA');
  const scoreBEl = $('battleScoreB');
  const resetBtn = $('battleResetBtn');
  const testBtn = $('battleTestBtn');
  const saveBtn = $('battleSaveBtn');

  if (!modal || !$('battleAPicker')) return;

  // Estado por bando
  const sides = {};
  SIDES.forEach((key) => {
    sides[key] = {
      key,
      image: '',
      giftRules: [],
      nameInput: $(`battle${key}NameInput`),
      colorInput: $(`battle${key}ColorInput`),
      imagePreview: $(`battle${key}ImagePreview`),
      imageInput: $(`battle${key}ImageInput`),
      imageBtn: $(`battle${key}ImageBtn`),
      imageClearBtn: $(`battle${key}ImageClearBtn`),
      giftCount: $(`battle${key}GiftCount`),
      picker: $(`battle${key}Picker`),
      pickerToggle: $(`battle${key}PickerToggle`),
      pickerLabel: $(`battle${key}PickerLabel`),
      pickerPanel: $(`battle${key}PickerPanel`),
      pickerSearch: $(`battle${key}PickerSearch`),
      pickerMin: $(`battle${key}PickerMin`),
      pickerMax: $(`battle${key}PickerMax`),
      pickerList: $(`battle${key}PickerList`),
      rulesEl: $(`battle${key}GiftRules`),
    };
  });

  let giftCatalog = [];
  let catalogRequested = false;
  let currentScores = { a: 0, b: 0 };

  const otherSide = (key) => (key === 'A' ? sides.B : sides.A);

  function escape(value) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(value)
      : String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  // ---------- Catálogo de regalos (mismo formato que la ruleta) ----------
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
      SIDES.forEach((key) => {
        sides[key].pickerLabel.textContent = giftCatalog.length === 0
          ? 'Sin regalos disponibles (vincula tu TikTok y carga el catálogo en Juegos)'
          : 'Elegir regalos del catálogo';
        renderPickerList(key);
      });

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

  // ---------- Selector y lista de regalos de cada bando ----------
  function renderGiftRules(key) {
    const side = sides[key];
    side.giftCount.textContent = String(side.giftRules.length);

    if (side.giftRules.length === 0) {
      side.rulesEl.innerHTML = '<p class="rl-empty">Aún no elegiste regalos para este bando.</p>';
      return;
    }

    side.rulesEl.innerHTML = side.giftRules.map((rule) => `
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

  function renderPickerList(key) {
    const side = sides[key];
    const other = otherSide(key);

    if (giftCatalog.length === 0) {
      side.pickerList.innerHTML = '<p class="rl-empty">Carga el catálogo primero.</p>';
      return;
    }

    const nameFilter = side.pickerSearch.value.trim().toLowerCase();
    const min = side.pickerMin.value !== '' ? Number(side.pickerMin.value) : null;
    const max = side.pickerMax.value !== '' ? Number(side.pickerMax.value) : null;
    const chosen = new Set(side.giftRules.map((rule) => rule.giftId));
    const taken = new Set(other.giftRules.map((rule) => rule.giftId));

    const filtered = giftCatalog.filter((gift) => {
      if (nameFilter && !String(gift.name).toLowerCase().includes(nameFilter)) return false;
      if (min !== null && !Number.isNaN(min) && gift.diamondCount < min) return false;
      if (max !== null && !Number.isNaN(max) && gift.diamondCount > max) return false;
      return true;
    });

    if (filtered.length === 0) {
      side.pickerList.innerHTML = '<p class="rl-empty">Sin resultados para ese filtro.</p>';
      return;
    }

    side.pickerList.innerHTML = filtered.map((gift) => {
      const classes = ['rl-picker-item'];
      if (chosen.has(gift.id)) classes.push('is-chosen');
      if (taken.has(gift.id)) classes.push('is-other');
      const title = taken.has(gift.id) ? 'Ya está asignado al otro bando' : '';
      return `
        <button type="button" class="${classes.join(' ')}" data-gift-id="${escape(gift.id)}" title="${title}">
          <img class="rl-gift-img" src="${escape(gift.imageUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
          <span class="rl-gift-name">${escape(gift.name)}</span>
          <span class="rl-gift-coins">${escape(gift.diamondCount)}</span>
        </button>`;
    }).join('');
  }

  function refreshBothPickers() {
    SIDES.forEach((key) => renderPickerList(key));
  }

  function setPickerOpen(key, open) {
    const side = sides[key];
    side.pickerPanel.hidden = !open;
    side.pickerToggle.setAttribute('aria-expanded', String(open));
    side.picker.classList.toggle('is-open', open);
  }

  SIDES.forEach((key) => {
    const side = sides[key];

    side.pickerToggle.addEventListener('click', () => {
      if (giftCatalog.length === 0) {
        loadCatalog(false).then(() => {
          if (giftCatalog.length > 0) setPickerOpen(key, true);
        });
        return;
      }
      setPickerOpen(key, side.pickerPanel.hidden);
    });

    [side.pickerSearch, side.pickerMin, side.pickerMax].forEach((input) => {
      input.addEventListener('input', () => renderPickerList(key));
    });

    side.pickerList.addEventListener('click', async (event) => {
      const item = event.target.closest('[data-gift-id]');
      if (!item) return;

      const gift = giftCatalog.find((entry) => entry.id === item.dataset.giftId);
      if (!gift) return;

      if (side.giftRules.some((rule) => rule.giftId === gift.id)) {
        side.giftRules = side.giftRules.filter((rule) => rule.giftId !== gift.id);
      } else {
        if (otherSide(key).giftRules.some((rule) => rule.giftId === gift.id)) {
          await showAppAlert('Ese regalo ya está asignado al otro bando. Un regalo solo puede sumar para un lado.', 'Regalo repetido');
          return;
        }
        if (side.giftRules.length >= MAX_GIFTS_PER_SIDE) {
          await showAppAlert(`Puedes elegir hasta ${MAX_GIFTS_PER_SIDE} regalos por bando.`, 'Límite alcanzado');
          return;
        }
        side.giftRules.push({
          giftId: gift.id,
          giftName: gift.name,
          giftImageUrl: gift.imageUrl || '',
          diamondCount: gift.diamondCount,
        });
      }

      renderGiftRules(key);
      refreshBothPickers();
    });

    side.rulesEl.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('[data-remove-gift]');
      if (!removeBtn) return;

      side.giftRules = side.giftRules.filter((rule) => rule.giftId !== removeBtn.dataset.removeGift);
      renderGiftRules(key);
      refreshBothPickers();
    });
  });

  document.addEventListener('click', (event) => {
    SIDES.forEach((key) => {
      const side = sides[key];
      if (!side.pickerPanel.hidden && !side.picker.contains(event.target)) setPickerOpen(key, false);
    });
  });

  loadGiftsBtn.addEventListener('click', () => loadCatalog(false));

  // ---------- Imagen del bando ----------
  function renderImage(key) {
    const side = sides[key];
    if (side.image) {
      side.imagePreview.style.backgroundImage = `url("${side.image.replace(/"/g, '%22')}")`;
    } else {
      side.imagePreview.style.backgroundImage = '';
    }
    side.imageClearBtn.hidden = !side.image;
    side.imageBtn.textContent = side.image ? 'Cambiar imagen' : 'Subir imagen';
  }

  function renderColor(key) {
    sides[key].imagePreview.style.setProperty('--bt-color', sides[key].colorInput.value);
  }

  // Reduce la imagen a un cuadrado pequeño (recortando al centro) y la devuelve
  // como data URL: así cabe en la configuración sin hosting aparte.
  function fileToSquareDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Ese archivo no es una imagen válida.'));
        img.onload = () => {
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - side) / 2;
          const sy = (img.naturalHeight - side) / 2;
          const canvas = document.createElement('canvas');
          canvas.width = IMAGE_SIZE;
          canvas.height = IMAGE_SIZE;
          canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, IMAGE_SIZE, IMAGE_SIZE);

          const attempts = [
            ['image/webp', 0.85],
            ['image/webp', 0.6],
            ['image/jpeg', 0.7],
            ['image/jpeg', 0.45],
          ];
          for (const [type, quality] of attempts) {
            const dataUrl = canvas.toDataURL(type, quality);
            if (dataUrl.startsWith(`data:${type}`) && dataUrl.length <= MAX_IMAGE_CHARS) {
              resolve(dataUrl);
              return;
            }
          }
          reject(new Error('La imagen es demasiado pesada. Prueba con otra más simple.'));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  SIDES.forEach((key) => {
    const side = sides[key];

    side.imageBtn.addEventListener('click', () => side.imageInput.click());

    side.imageInput.addEventListener('change', async () => {
      const file = side.imageInput.files?.[0];
      side.imageInput.value = '';
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        await showAppAlert('Elige un archivo de imagen (PNG, JPG, WEBP...).', 'Archivo no válido');
        return;
      }

      try {
        side.image = await fileToSquareDataUrl(file);
        renderImage(key);
      } catch (error) {
        await showAppAlert(error.message, 'No se pudo usar la imagen');
      }
    });

    side.imageClearBtn.addEventListener('click', () => {
      side.image = '';
      renderImage(key);
    });

    side.colorInput.addEventListener('input', () => renderColor(key));
  });

  // ---------- Estado (lo llama platform.js al cargar / guardar) ----------
  function renderScores() {
    scoreAEl.textContent = currentScores.a.toLocaleString('es');
    scoreBEl.textContent = currentScores.b.toLocaleString('es');
  }

  window.applyBattleState = function applyBattleState(state) {
    const battle = state?.battle || {};

    enabledToggle.checked = battle.enabled !== false;
    titleInput.value = battle.title || '';

    SIDES.forEach((key) => {
      const side = sides[key];
      const config = battle[`side${key}`] || {};
      side.nameInput.value = config.name ?? '';
      if (config.color) side.colorInput.value = config.color;
      side.image = config.image || '';
      side.giftRules = (Array.isArray(battle[`giftRules${key}`]) ? battle[`giftRules${key}`] : []).map((rule) => ({
        giftId: String(rule.giftId),
        giftName: rule.giftName || 'Regalo',
        giftImageUrl: rule.giftImageUrl || '',
        diamondCount: Number(rule.diamondCount) || 0,
      }));
      renderImage(key);
      renderColor(key);
      renderGiftRules(key);
    });

    currentScores = { a: Number(battle.scoreA) || 0, b: Number(battle.scoreB) || 0 };
    renderScores();
    refreshBothPickers();
  };

  // ---------- Guardar / probar / reiniciar ----------
  async function saveBattle() {
    const nameA = sides.A.nameInput.value.trim();
    const nameB = sides.B.nameInput.value.trim();

    if (!nameA && !sides.A.image) {
      await showAppAlert('El bando azul necesita un texto o una imagen.', 'Falta identificar un bando');
      return;
    }
    if (!nameB && !sides.B.image) {
      await showAppAlert('El bando rosa necesita un texto o una imagen.', 'Falta identificar un bando');
      return;
    }

    const sideConfig = (key) => ({
      name: sides[key].nameInput.value.trim(),
      image: sides[key].image,
      color: sides[key].colorInput.value,
    });

    try {
      saveBtn.disabled = true;
      const response = await fetch('/api/overlay/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentOverlayState,
          battle: {
            enabled: enabledToggle.checked,
            title: titleInput.value.trim(),
            sideA: sideConfig('A'),
            sideB: sideConfig('B'),
            giftRulesA: sides.A.giftRules,
            giftRulesB: sides.B.giftRules,
            // El servidor conserva siempre el marcador real; esto es solo de relleno.
            scoreA: currentScores.a,
            scoreB: currentScores.b,
          },
        }),
      });
      if (!response.ok) throw new Error('No se pudo guardar la configuración.');

      const data = await response.json();
      applyOverlayStateToInputs(data.state);
      reloadOverlayPreviewFrames();
      showAppAlert('Configuración de la batalla guardada. Refresca la fuente en OBS para ver los cambios.', 'Overlays');
    } catch (error) {
      showAppAlert(error.message, 'Error al guardar');
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function sendTestBattle() {
    testBtn.disabled = true;
    try {
      const response = await fetch('/api/overlay/test-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('No se pudieron enviar los puntos de prueba.');
      const data = await response.json();
      linkHint.textContent = `Puntos de prueba enviados: +${data.coins} para el bando ${data.side === 'A' ? 'azul' : 'rosa'}. Se ven en el link real, no en la vista previa.`;
    } catch (error) {
      showAppAlert(error.message, 'Error');
    } finally {
      testBtn.disabled = false;
    }
  }

  async function resetBattleScores() {
    const confirmed = await showAppConfirm(
      'Esto pone el marcador de los dos bandos en 0. ¿Seguro que quieres reiniciar la batalla?',
      'Reiniciar batalla',
    );
    if (!confirmed) return;

    try {
      resetBtn.disabled = true;
      const response = await fetch('/api/overlay/battle/reset', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo reiniciar la batalla.');

      const data = await response.json();
      currentScores = { a: 0, b: 0 };
      renderScores();
      if (data?.state) currentOverlayState = data.state;
      showAppAlert('Batalla reiniciada: el marcador volvió a 0.', 'Overlays');
    } catch (error) {
      showAppAlert(error.message, 'Error');
    } finally {
      resetBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', saveBattle);
  testBtn.addEventListener('click', sendTestBattle);
  resetBtn.addEventListener('click', resetBattleScores);

  // ---------- Modal y link ----------
  const modalControls = makeModalToggle(cardToggle, modal);
  closeBtn?.addEventListener('click', modalControls.close);

  // El catálogo se pide solo la primera vez que se abre el modal.
  cardToggle?.addEventListener('click', () => {
    if (!catalogRequested) loadCatalog(true);
  });

  copyLinkBtn?.addEventListener('click', copyOverlayLink(linkInput, linkHint));
  regenerateBtn?.addEventListener('click', () => regenerateOverlayKey('battle'));

  SIDES.forEach((key) => {
    renderImage(key);
    renderColor(key);
    renderGiftRules(key);
    renderPickerList(key);
  });
  renderScores();
})();
