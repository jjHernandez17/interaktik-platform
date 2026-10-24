// Impresora de fotos: reglas de regalo FIJAS (cada regalo tiene una de la lista, no se editan) y el top donador.
// Se carga antes de photo-printer.js; usa `state`, `norm`, `engine`, etc. de ese archivo (siempre en el momento de usarlas).

const ppLooks = window.PhotoPrinterLooks;

// ======================================================================================================================
// Reglas fijas: que efecto le toca a cada regalo
// ======================================================================================================================

function ppGiftEffectKey(name) {
  const key = norm(name);
  return Object.keys(state.giftEffects || {}).find((item) => norm(item) === key) || null;
}

// el efecto de un regalo: el suyo si tiene, y si no el de "los demas regalos"
function ppGiftEffect(name) {
  const key = ppGiftEffectKey(name);
  return key ? state.giftEffects[key] : state.defaultEffect || 'none';
}

function ppSetGiftEffect(name, effect) {
  const key = ppGiftEffectKey(name) || name;
  if (!effect || effect === 'none') delete state.giftEffects[key];
  else state.giftEffects[key] = effect;
}

function ppRemoveGiftEffect(name) {
  const key = ppGiftEffectKey(name);
  if (key) delete state.giftEffects[key];
}

function effectOptionsMarkup(selected) {
  return ppLooks.EFFECTS.map((effect) => `<option value="${effect.id}"${effect.id === selected ? ' selected' : ''}>${esc(effect.label)}</option>`).join('');
}

// el estilo ya resuelto que usa el 3D para imprimir
function resolveJobStyle(giftName) {
  return ppLooks.effectStyle(ppGiftEffect(giftName));
}

// un regalo imprime si esta en la lista o si se eligio "cualquier regalo"
function giftQualifies(giftName) {
  if (state.anyGift) return true;
  const key = norm(giftName);
  return Boolean(key) && state.giftRules.some((name) => norm(name) === key);
}

function bindEffectsUI() {
  // el selector que hay junto a cada regalo (se rehace al redibujar la lista, por eso se escucha en el documento)
  document.addEventListener('change', (event) => {
    const select = event.target.closest('[data-effect-gift]');
    if (select) {
      ppSetGiftEffect(select.dataset.effectGift, select.value);
      scheduleSave();
      return;
    }
    if (event.target.id === 'ppDefaultEffect') {
      state.defaultEffect = ppLooks.EFFECT_IDS.includes(event.target.value) ? event.target.value : 'none';
      scheduleSave();
    }
  });
  const defaultSelect = document.getElementById('ppDefaultEffect');
  if (defaultSelect) defaultSelect.innerHTML = effectOptionsMarkup(state.defaultEffect);
  // un boton de prueba por cada regla (junto al escenario)
  const tests = document.getElementById('ppRuleTests');
  if (tests) {
    tests.innerHTML = `<span class="pp-rule-tests-label">Probar regla:</span>${ppLooks.EFFECTS.filter((effect) => effect.id !== 'none')
      .map((effect) => `<button type="button" class="btn ghost pp-rule-test" data-test-effect="${effect.id}" title="${esc(effect.label)}">${esc(effect.short || effect.label)}</button>`)
      .join('')}`;
  }
}

function syncEffectsUI() {
  const defaultSelect = document.getElementById('ppDefaultEffect');
  if (defaultSelect) defaultSelect.value = state.defaultEffect;
}

// ======================================================================================================================
// Top donador: quien mas monedas ha mandado sale en la pantalla del escritorio hasta que alguien lo supere
// ======================================================================================================================

const DONORS_KEY = 'ppDonors:v1';
const MAX_DONORS = 80;
let donors = {};
let topDonorKey = '';
let topDonorToken = 0;

function loadDonors() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DONORS_KEY) || '{}');
    donors = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    donors = {};
  }
  for (const key of Object.keys(donors)) {
    const entry = donors[key];
    if (!entry || !(Number(entry.coins) > 0)) delete donors[key];
    else entry.coins = Math.round(Number(entry.coins));
  }
  recomputeTopDonor();
}

function persistDonors() {
  try {
    const keep = Object.entries(donors)
      .filter(([, entry]) => !entry.test) // las pruebas no se guardan
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, MAX_DONORS);
    localStorage.setItem(DONORS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch (error) {
    // sin almacenamiento: el top solo dura mientras la pagina esta abierta
  }
}

function recomputeTopDonor() {
  let bestKey = donors[topDonorKey] ? topDonorKey : '';
  for (const [key, entry] of Object.entries(donors)) {
    // empatar no desplaza a quien ya esta: hay que superarlo
    if (!bestKey || entry.coins > donors[bestKey].coins) bestKey = key;
  }
  topDonorKey = bestKey;
}

function currentTopDonorKey() {
  return topDonorKey;
}

function donorThumb(img) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    ppLooks.drawCoverRect(canvas.getContext('2d'), img, 0, 0, 96, 96);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (error) {
    return '';
  }
}

function updateTopDonorInfo() {
  const info = document.getElementById('ppTopDonorInfo');
  if (!info) return;
  const top = donors[topDonorKey];
  info.textContent = top ? `Top donador ahora: ${top.nickname} (${top.coins} monedas)` : 'Todavía no hay top donador: aparece cuando alguien mande regalos con monedas.';
}

async function refreshTopDonorDisplay() {
  updateTopDonorInfo();
  if (!engine) return;
  const token = ++topDonorToken;
  const top = donors[topDonorKey];
  if (!state.options.topDonor || !top) {
    engine.setTopDonor(null);
    return;
  }
  const img = (await loadCanvasImage(safeImageUrl(top.avatarThumb || top.avatar))) || (await loadCanvasImage(makeInitialAvatar(top.nickname)));
  if (token !== topDonorToken) return;
  engine.setTopDonor({ nickname: top.nickname, coins: top.coins, img });
  // TikTok caduca las direcciones de las fotos: se guarda una miniatura de quien esta en la pantalla
  if (img && !top.avatarThumb && !top.test) {
    top.avatarThumb = donorThumb(img);
    persistDonors();
  }
}

// suma las monedas de un regalo a quien lo mando (cuenta TODOS los regalos, esten o no en las reglas)
function registerDonation({ key, nickname, avatar, coins, test = false }) {
  if (!key || !(coins > 0)) return;
  const previousTop = topDonorKey;
  const entry = donors[key] || (donors[key] = { nickname, coins: 0, avatar: '', test });
  entry.coins += Math.round(coins);
  entry.nickname = nickname || entry.nickname;
  const safeAvatar = safeImageUrl(avatar);
  if (safeAvatar && !safeAvatar.startsWith('data:')) {
    if (entry.avatar !== safeAvatar) entry.avatarThumb = '';
    entry.avatar = safeAvatar;
  } else if (safeAvatar && test) {
    entry.avatar = safeAvatar;
  }
  recomputeTopDonor();
  persistDonors();
  if (topDonorKey !== previousTop || topDonorKey === key) refreshTopDonorDisplay();
}

function resetTopDonor() {
  donors = {};
  topDonorKey = '';
  persistDonors();
  refreshTopDonorDisplay();
}

function bindTopDonorUI() {
  document.getElementById('ppResetDonor').addEventListener('click', async () => {
    if (!topDonorKey) return;
    const confirmed = await showAppConfirm('¿Reiniciar el top donador? Se borran los totales de monedas de todos.', 'Top donador');
    if (confirmed) resetTopDonor();
  });
}

// ======================================================================================================================
// Descargar las reglas de regalo como imagen PNG (fondo transparente, tres columnas) para ponerla en el live
// ======================================================================================================================

function wrapRuleText(g, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && g.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Dibuja cada regla (imagen del regalo, nombre y lo que hace) en 3 columnas, sin ningun fondo. El texto lleva contorno oscuro
// para que se lea sobre cualquier video.
async function renderRulesCanvas() {
  const rules = state.giftRules.map((name) => ({ name, gift: findGift(name), effect: ppGiftEffect(name) }));
  if (state.anyGift) rules.push({ name: 'Cualquier otro regalo', gift: null, effect: state.defaultEffect, any: true });
  if (rules.length === 0) return null;

  const COLS = 3;
  const CELL_W = 640;
  const CELL_H = 150;
  const PAD = 24;
  const ICON = 112;
  const rows = Math.ceil(rules.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = PAD * 2 + COLS * CELL_W;
  canvas.height = PAD * 2 + rows * CELL_H;
  const g = canvas.getContext('2d'); // sin fillRect de fondo: queda transparente

  if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});
  const images = await Promise.all(rules.map((rule) => (rule.gift && safeImageUrl(rule.gift.imageUrl) ? loadCanvasImage(rule.gift.imageUrl, 6000) : null)));
  const FONT_FAMILY = '"Poppins", "Segoe UI", system-ui, -apple-system, sans-serif';

  const outlined = (text, x, y) => {
    g.lineJoin = 'round';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(8, 10, 24, 0.92)';
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
  };

  rules.forEach((rule, index) => {
    // se llena por columnas: la primera de arriba a abajo, luego la segunda y la tercera
    const col = Math.floor(index / rows);
    const row = index % rows;
    const x = PAD + col * CELL_W;
    const y = PAD + row * CELL_H;
    const iconY = y + (CELL_H - ICON) / 2;

    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.6)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 3;
    if (images[index]) {
      g.drawImage(images[index], x + 8, iconY, ICON, ICON);
    } else {
      // sin imagen: un circulo con la inicial (o una estrella para "cualquier regalo")
      const gradient = g.createLinearGradient(x, iconY, x + ICON, iconY + ICON);
      gradient.addColorStop(0, '#7c5cff');
      gradient.addColorStop(1, '#12b8ff');
      g.fillStyle = gradient;
      g.beginPath();
      g.arc(x + 8 + ICON / 2, iconY + ICON / 2, ICON / 2 - 6, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = 'transparent';
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 52px ${FONT_FAMILY}`;
      g.fillText(rule.any ? '★' : rule.name.charAt(0).toUpperCase(), x + 8 + ICON / 2, iconY + ICON / 2 + 3);
    }
    g.restore();

    const textX = x + ICON + 30;
    const textW = CELL_W - ICON - 54;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#ffffff';
    g.font = `800 36px ${FONT_FAMILY}`;
    outlined(ppLooks.fitText(g, rule.name, textW), textX, y + 62);

    const effect = ppLooks.EFFECTS.find((item) => item.id === rule.effect) || ppLooks.EFFECTS[0];
    g.fillStyle = '#ffd25e';
    g.font = `700 25px ${FONT_FAMILY}`;
    wrapRuleText(g, effect.action, textW).slice(0, 2).forEach((line, i) => outlined(line, textX, y + 100 + i * 30));
  });
  return canvas;
}

async function downloadRulesPng() {
  const button = document.getElementById('ppDownloadRules');
  if (state.giftRules.length === 0 && !state.anyGift) {
    showAppAlert('Primero agrega regalos a las reglas para poder descargarlas.', 'Descargar reglas');
    return;
  }
  button.disabled = true;
  try {
    const canvas = await renderRulesCanvas();
    if (!canvas) return;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo crear la imagen.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reglas-de-regalos.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (error) {
    showAppAlert(error.message || 'No se pudo descargar la imagen.', 'Descargar reglas');
  } finally {
    button.disabled = false;
  }
}

function bindExtrasUI() {
  bindEffectsUI();
  bindTopDonorUI();
  document.getElementById('ppDownloadRules')?.addEventListener('click', downloadRulesPng);
}
