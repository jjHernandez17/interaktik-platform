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

function bindExtrasUI() {
  bindEffectsUI();
  bindTopDonorUI();
}
