const navButtons = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.content-card');
const logoutBtn = document.getElementById('logoutBtn');

const userMenuToggle = document.getElementById('userMenuToggle');
const userMenuPopover = document.getElementById('userMenuPopover');
const sidebarUserName = document.getElementById('sidebarUserName');
const sidebarUserPlan = document.getElementById('sidebarUserPlan');

// Fondo decorativo del menu lateral (version en miniatura del de la landing
// / login): puntitos sembrados al azar en un lienzo virtual angosto que
// coincide con el ancho tipico del sidebar, para que no se desperdicien
// estrellas fuera de vista.
(function initSidebarStarfield() {
  const el = document.getElementById('sidebarStars');
  if (!el) return;

  const colors = ['#fff', '#fff', '#fff', '#c4b5fd', '#67e8f9'];
  const parts = [];
  for (let i = 0; i < 45; i++) {
    const x = Math.floor(Math.random() * 300);
    const y = Math.floor(Math.random() * 1200);
    const color = colors[Math.floor(Math.random() * colors.length)];
    parts.push(`${x}px ${y}px ${color}`);
  }
  el.style.setProperty('--sidebar-star-shadow', parts.join(', '));
})();

// Menu lateral colapsable: preferencia puramente visual de este navegador,
// asi que localStorage es suficiente (no necesita persistir en el servidor
// ni sincronizarse entre dispositivos).
const platformShell = document.querySelector('.platform-shell');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

function applySidebarCollapsed(collapsed) {
  if (!platformShell) return;
  platformShell.classList.toggle('sidebar-collapsed', collapsed);
  if (sidebarToggleBtn) {
    sidebarToggleBtn.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Contraer menu');
    sidebarToggleBtn.title = collapsed ? 'Expandir menu' : 'Contraer menu';
  }
}

(function initSidebarCollapsed() {
  // Por defecto el menu arranca cerrado; solo se abre solo si el usuario lo
  // dejo abierto a proposito (preferencia guardada en '0').
  let collapsed = true;
  try {
    collapsed = window.localStorage.getItem('interaktik.sidebarCollapsed') !== '0';
  } catch (_error) {
    collapsed = true;
  }
  applySidebarCollapsed(collapsed);
})();

if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', () => {
    const collapsed = !platformShell.classList.contains('sidebar-collapsed');
    applySidebarCollapsed(collapsed);
    try {
      window.localStorage.setItem('interaktik.sidebarCollapsed', collapsed ? '1' : '0');
    } catch (_error) {
      // Sin localStorage disponible (modo privado, etc.) simplemente no persiste.
    }
  });
}
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const changePasswordForm = document.getElementById('changePasswordForm');
const currentPasswordInput = document.getElementById('currentPasswordInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
const changePasswordBtn = document.getElementById('changePasswordBtn');

const adminNavItem = document.getElementById('adminNavItem');
const refreshUsersBtn = document.getElementById('refreshUsersBtn');
const adminUsersMeta = document.getElementById('adminUsersMeta');
const adminUsersList = document.getElementById('adminUsersList');
const adminEditModal = document.getElementById('adminEditModal');
const adminEditForm = document.getElementById('adminEditForm');
const adminEditUserId = document.getElementById('adminEditUserId');
const adminEditName = document.getElementById('adminEditName');
const adminEditEmail = document.getElementById('adminEditEmail');
const adminEditConnections = document.getElementById('adminEditConnections');
const adminEditCloseBtn = document.getElementById('adminEditCloseBtn');
const adminEditCancelBtn = document.getElementById('adminEditCancelBtn');
const adminEditSaveBtn = document.getElementById('adminEditSaveBtn');
const adminPlanModal = document.getElementById('adminPlanModal');
const adminPlanUserId = document.getElementById('adminPlanUserId');
const adminPlanUserName = document.getElementById('adminPlanUserName');
const adminPlanUserEmail = document.getElementById('adminPlanUserEmail');
const adminPlanCurrentStatus = document.getElementById('adminPlanCurrentStatus');
const adminPlanAddForm = document.getElementById('adminPlanAddForm');
const adminPlanAddDays = document.getElementById('adminPlanAddDays');
const adminPlanAddHours = document.getElementById('adminPlanAddHours');
const adminPlanAddBtn = document.getElementById('adminPlanAddBtn');
const adminPlanSubtractForm = document.getElementById('adminPlanSubtractForm');
const adminPlanSubtractDays = document.getElementById('adminPlanSubtractDays');
const adminPlanSubtractHours = document.getElementById('adminPlanSubtractHours');
const adminPlanSubtractBtn = document.getElementById('adminPlanSubtractBtn');
const adminPlanRevokeBtn = document.getElementById('adminPlanRevokeBtn');
const adminPlanCloseBtn = document.getElementById('adminPlanCloseBtn');
const adminInfoModal = document.getElementById('adminInfoModal');
const adminInfoContent = document.getElementById('adminInfoContent');
const adminInfoCloseBtn = document.getElementById('adminInfoCloseBtn');

const overlayPreviewFrame = document.getElementById('overlayPreviewFrame');
const overlayCardToggle = document.getElementById('overlayCardToggle');
const overlayConfigModal = document.getElementById('overlayConfigModal');
const overlayConfigCloseBtn = document.getElementById('overlayConfigCloseBtn');
const overlayLinkInput = document.getElementById('overlayLinkInput');
const overlayCopyLinkBtn = document.getElementById('overlayCopyLinkBtn');
const overlayRegenerateBtn = document.getElementById('overlayRegenerateBtn');
const overlayLinkHint = document.getElementById('overlayLinkHint');
const overlayEnabledToggle = document.getElementById('overlayEnabledToggle');
const overlayDurationInput = document.getElementById('overlayDurationInput');
const overlayDurationValue = document.getElementById('overlayDurationValue');
const overlayMinCoinsInput = document.getElementById('overlayMinCoinsInput');
const overlaySoundSelect = document.getElementById('overlaySoundSelect');
const overlaySoundPreviewBtn = document.getElementById('overlaySoundPreviewBtn');
const overlaySaveBtn = document.getElementById('overlaySaveBtn');
const overlayTestGiftBtn = document.getElementById('overlayTestGiftBtn');

const goalBarPreviewFrame = document.getElementById('goalBarPreviewFrame');
const goalBarCardToggle = document.getElementById('goalBarCardToggle');
const goalBarConfigModal = document.getElementById('goalBarConfigModal');
const goalBarConfigCloseBtn = document.getElementById('goalBarConfigCloseBtn');
const goalBarLinkInput = document.getElementById('goalBarLinkInput');
const goalBarCopyLinkBtn = document.getElementById('goalBarCopyLinkBtn');
const goalBarRegenerateBtn = document.getElementById('goalBarRegenerateBtn');
const goalBarLinkHint = document.getElementById('goalBarLinkHint');
const goalBarEnabledToggle = document.getElementById('goalBarEnabledToggle');
const goalBarLabelInput = document.getElementById('goalBarLabelInput');
const goalBarTargetInput = document.getElementById('goalBarTargetInput');
const goalBarCurrentValue = document.getElementById('goalBarCurrentValue');
const goalBarSaveBtn = document.getElementById('goalBarSaveBtn');
const goalBarTestGiftBtn = document.getElementById('goalBarTestGiftBtn');
const goalBarResetBtn = document.getElementById('goalBarResetBtn');

const topGiftersPreviewFrame = document.getElementById('topGiftersPreviewFrame');
const topGiftersCardToggle = document.getElementById('topGiftersCardToggle');
const topGiftersConfigModal = document.getElementById('topGiftersConfigModal');
const topGiftersConfigCloseBtn = document.getElementById('topGiftersConfigCloseBtn');
const topGiftersLinkInput = document.getElementById('topGiftersLinkInput');
const topGiftersCopyLinkBtn = document.getElementById('topGiftersCopyLinkBtn');
const topGiftersRegenerateBtn = document.getElementById('topGiftersRegenerateBtn');
const topGiftersLinkHint = document.getElementById('topGiftersLinkHint');
const topGiftersEnabledToggle = document.getElementById('topGiftersEnabledToggle');
const topGiftersTitleInput = document.getElementById('topGiftersTitleInput');
const topGiftersMaxEntriesInput = document.getElementById('topGiftersMaxEntriesInput');
const topGiftersMaxEntriesValue = document.getElementById('topGiftersMaxEntriesValue');
const topGiftersSaveBtn = document.getElementById('topGiftersSaveBtn');
const topGiftersTestGiftBtn = document.getElementById('topGiftersTestGiftBtn');
const topGiftersResetBtn = document.getElementById('topGiftersResetBtn');

const likeCounterPreviewFrame = document.getElementById('likeCounterPreviewFrame');
const likeCounterCardToggle = document.getElementById('likeCounterCardToggle');
const likeCounterConfigModal = document.getElementById('likeCounterConfigModal');
const likeCounterConfigCloseBtn = document.getElementById('likeCounterConfigCloseBtn');
const likeCounterLinkInput = document.getElementById('likeCounterLinkInput');
const likeCounterCopyLinkBtn = document.getElementById('likeCounterCopyLinkBtn');
const likeCounterRegenerateBtn = document.getElementById('likeCounterRegenerateBtn');
const likeCounterLinkHint = document.getElementById('likeCounterLinkHint');
const likeCounterEnabledToggle = document.getElementById('likeCounterEnabledToggle');
const likeCounterLabelInput = document.getElementById('likeCounterLabelInput');
const likeCounterCurrentValue = document.getElementById('likeCounterCurrentValue');
const likeCounterSaveBtn = document.getElementById('likeCounterSaveBtn');
const likeCounterTestBtn = document.getElementById('likeCounterTestBtn');
const likeCounterResetBtn = document.getElementById('likeCounterResetBtn');

const topLikersPreviewFrame = document.getElementById('topLikersPreviewFrame');
const topLikersCardToggle = document.getElementById('topLikersCardToggle');
const topLikersConfigModal = document.getElementById('topLikersConfigModal');
const topLikersConfigCloseBtn = document.getElementById('topLikersConfigCloseBtn');
const topLikersLinkInput = document.getElementById('topLikersLinkInput');
const topLikersCopyLinkBtn = document.getElementById('topLikersCopyLinkBtn');
const topLikersRegenerateBtn = document.getElementById('topLikersRegenerateBtn');
const topLikersLinkHint = document.getElementById('topLikersLinkHint');
const topLikersEnabledToggle = document.getElementById('topLikersEnabledToggle');
const topLikersTitleInput = document.getElementById('topLikersTitleInput');
const topLikersMaxEntriesInput = document.getElementById('topLikersMaxEntriesInput');
const topLikersMaxEntriesValue = document.getElementById('topLikersMaxEntriesValue');
const topLikersSaveBtn = document.getElementById('topLikersSaveBtn');
const topLikersTestBtn = document.getElementById('topLikersTestBtn');
const topLikersResetBtn = document.getElementById('topLikersResetBtn');

const followAlertPreviewFrame = document.getElementById('followAlertPreviewFrame');
const followAlertCardToggle = document.getElementById('followAlertCardToggle');
const followAlertConfigModal = document.getElementById('followAlertConfigModal');
const followAlertConfigCloseBtn = document.getElementById('followAlertConfigCloseBtn');
const followAlertLinkInput = document.getElementById('followAlertLinkInput');
const followAlertCopyLinkBtn = document.getElementById('followAlertCopyLinkBtn');
const followAlertRegenerateBtn = document.getElementById('followAlertRegenerateBtn');
const followAlertLinkHint = document.getElementById('followAlertLinkHint');
const followAlertEnabledToggle = document.getElementById('followAlertEnabledToggle');
const followAlertDurationInput = document.getElementById('followAlertDurationInput');
const followAlertDurationValue = document.getElementById('followAlertDurationValue');
const followAlertSoundSelect = document.getElementById('followAlertSoundSelect');
const followAlertSoundPreviewBtn = document.getElementById('followAlertSoundPreviewBtn');
const followAlertSaveBtn = document.getElementById('followAlertSaveBtn');
const followAlertTestBtn = document.getElementById('followAlertTestBtn');

const overlayConnectionForm = document.getElementById('overlayConnectionForm');
const overlayConnectionStatusBadge = document.getElementById('overlayConnectionStatusBadge');
const overlayConnectionDetails = document.getElementById('overlayConnectionDetails');
const overlayTiktokUsernameInput = document.getElementById('overlayTiktokUsernameInput');
const overlayConnectTiktokBtn = document.getElementById('overlayConnectTiktokBtn');
const overlayDisconnectTiktokBtn = document.getElementById('overlayDisconnectTiktokBtn');

const gamesConnectionForm = document.getElementById('gamesConnectionForm');
const gamesConnectionStatusBadge = document.getElementById('gamesConnectionStatusBadge');
const gamesConnectionDetails = document.getElementById('gamesConnectionDetails');
const gamesTiktokUsernameInput = document.getElementById('gamesTiktokUsernameInput');
const gamesLinkTiktokBtn = document.getElementById('gamesLinkTiktokBtn');
const gamesLoadCatalogBtn = document.getElementById('gamesLoadCatalogBtn');

let overlayKeyLoaded = false;

const statsSessionsList = document.getElementById('statsSessionsList');
const statsPager = document.getElementById('statsPager');
const statsPrevBtn = document.getElementById('statsPrevBtn');
const statsNextBtn = document.getElementById('statsNextBtn');
const statsPagerLabel = document.getElementById('statsPagerLabel');

// Los eventos "error" de <img> no burbujean, pero sí se ven en la fase de
// captura de un ancestro — un solo listener delegado aquí reemplaza el
// onerror="..." inline que el CSP del sitio bloquea (script-src-attr 'none').
if (statsSessionsList) {
  statsSessionsList.addEventListener('error', (event) => {
    const target = event.target;
    const fallback = target?.dataset?.fallbackAvatar;
    if (target?.tagName === 'IMG' && fallback && target.src !== fallback) {
      target.src = fallback;
    }
  }, true);

  // Paginador: cuenta de la transmisión visible y botones anterior / siguiente.
  statsSessionsList.addEventListener('scroll', () => syncStatsPager(), { passive: true });
  statsPrevBtn?.addEventListener('click', () => {
    statsSessionsList.scrollBy({ top: -statsSessionsList.clientHeight, behavior: 'smooth' });
  });
  statsNextBtn?.addEventListener('click', () => {
    statsSessionsList.scrollBy({ top: statsSessionsList.clientHeight, behavior: 'smooth' });
  });
}

// Cantidad de juegos jugables de cada categoria (las tarjetas "Próximamente" no cuentan).
document.querySelectorAll('.games-category').forEach((category) => {
  const counter = category.querySelector('.games-category-count');
  if (!counter) return;
  const total = category.querySelectorAll('.game-card:not(.disabled)').length;
  counter.textContent = total === 1 ? '1 juego' : `${total} juegos`;
});

// Cantidad de overlays de cada seccion de la pestaña Overlays.
document.querySelectorAll('.overlay-category').forEach((category) => {
  const counter = category.querySelector('.overlay-category-count');
  if (!counter) return;
  const total = category.querySelectorAll('.overlay-card').length;
  counter.textContent = total === 1 ? '1 overlay' : `${total} overlays`;
});

document.getElementById('accountGoPlansBtn')?.addEventListener('click', () => showSection('plansSection'));

// Requisitos de la contraseña nueva: se marcan en vivo mientras escribe.
const newPasswordInputEl = document.getElementById('newPasswordInput');
const passwordRulesList = document.getElementById('passwordRules');

function syncPasswordRules() {
  if (!newPasswordInputEl || !passwordRulesList) return;
  const value = newPasswordInputEl.value;
  const checks = {
    length: value.length > 5,
    letter: /[A-Za-z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
  passwordRulesList.querySelectorAll('li').forEach((item) => {
    item.classList.toggle('met', Boolean(checks[item.dataset.rule]));
  });
}

newPasswordInputEl?.addEventListener('input', syncPasswordRules);
document.getElementById('changePasswordForm')?.addEventListener('reset', () => setTimeout(syncPasswordRules, 0));

const accessStatusBanner = document.getElementById('accessStatusBanner');
const plansAccessStatus = document.getElementById('plansAccessStatus');
const plansGrid = document.getElementById('plansGrid');
const plansGatewayNotice = document.getElementById('plansGatewayNotice');

const GAME_LABELS = {
  app: 'Contador de puntos',
  snake: 'Snake Vs Snake',
  race: 'Carrera de Colegas',
  dominance: 'Dominance',
  roblox: 'Roblox Dance',
  robloxparkour: 'Roblox Parkour',
  minecraft: 'Survivaltik',
  minecraftcubo: 'Cubecraft',
  gta: 'Modo historia',
  gtarampa: 'Montaña Imposible',
  kingdoms: 'Batalla de Reinos',
};

let currentUser = null;
let adminUsers = [];
let adminUsersLoaded = false;
let adminEditAccountName = null;
let adminEditAccountEmail = null;
let adminSearchInput = null;
let adminEmailFilter = '';
let gameAvailability = {};
let accessStatus = null;
let availablePlans = [];
let availableGateways = { stripe: false, mercadopago: false, wompi: false };

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length <= 5) {
    return 'La contraseña debe tener mas de 5 caracteres.';
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return 'La contraseña debe incluir al menos una letra, un numero y un caracter especial.';
  }
  return '';
}

function setupAdminSearch() {
  if (!adminUsersList || document.getElementById('adminEmailSearch')) {
    adminSearchInput = document.getElementById('adminEmailSearch');
    return;
  }

  const searchBox = document.createElement('label');
  searchBox.className = 'admin-search';
  searchBox.innerHTML = `
    <span>Buscar por correo electronico</span>
    <input id="adminEmailSearch" type="search" placeholder="correo@ejemplo.com" autocomplete="off" />
  `;

  adminUsersList.before(searchBox);
  adminSearchInput = document.getElementById('adminEmailSearch');
  adminSearchInput.addEventListener('input', () => {
    adminEmailFilter = adminSearchInput.value.trim().toLowerCase();
    renderAdminUsers();
  });
}

function gameTypeFromHref(href = '') {
  if (href.includes('snake-vs-snake')) return 'snake';
  if (href.includes('roblox-dance')) return 'roblox';
  if (href.includes('roblox-parkour')) return 'robloxparkour';
  if (href.includes('minecraft-cubo')) return 'minecraftcubo';
  if (href.includes('minecraft')) return 'minecraft';
  if (href.includes('gta-rampa')) return 'gtarampa';
  if (href.includes('gta')) return 'gta';
  if (href.includes('kingdoms')) return 'kingdoms';
  if (href.includes('shell-game')) return 'shellgame';
  if (href.includes('boy-vs-girl')) return 'boyvsgirl';
  if (href.includes('race')) return 'race';
  if (href.includes('dominance')) return 'dominance';
  if (href.includes('app')) return 'app';
  return '';
}

function applyGameAvailabilityToCards() {
  document.querySelectorAll('.game-card').forEach((card) => {
    const link = card.querySelector('a.start-btn');
    if (!link) return;

    const gameType = gameTypeFromHref(link.getAttribute('href') || '');
    const availability = gameAvailability[gameType];
    const disabled = availability && availability.isEnabled === false && !currentUser?.isSuperUser;

    card.classList.toggle('game-disabled-by-admin', Boolean(disabled));
    let message = card.querySelector('.game-disabled-message');

    if (disabled) {
      if (!message) {
        message = document.createElement('p');
        message.className = 'game-disabled-message';
        card.appendChild(message);
      }
      message.textContent = 'estamos trabajando para darte el mejor servicio, pronto volveremos a activar este juego';
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
    } else {
      if (message) message.remove();
      link.removeAttribute('aria-disabled');
      link.tabIndex = 0;
    }
  });

  applyPlanLockToCards();
}

// Bloquea las tarjetas de juego cuando el usuario no tiene una prueba/plan
// activos. Es independiente del bloqueo por admin (applyGameAvailabilityToCards);
// una tarjeta puede estar bloqueada por cualquiera de los dos motivos.
function applyPlanLockToCards() {
  const locked = accessStatus !== null && accessStatus.hasAccess === false && !currentUser?.isSuperUser;

  document.querySelectorAll('.game-card').forEach((card) => {
    const link = card.querySelector('a.start-btn');
    if (!link) return;

    if (card.classList.contains('game-disabled-by-admin')) {
      // ya esta bloqueada por el admin; no pisar ese mensaje con el de plan
      card.classList.remove('game-locked-by-plan');
      return;
    }

    card.classList.toggle('game-locked-by-plan', locked);
    let message = card.querySelector('.game-locked-message');

    if (locked) {
      if (!message) {
        message = document.createElement('p');
        message.className = 'game-locked-message';
        card.appendChild(message);
      }
      message.innerHTML = '🔒 Tu prueba gratuita o plan vencio. <a href="#" data-go-to-plans>Ver planes</a>';
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;

      const plansLink = message.querySelector('[data-go-to-plans]');
      if (plansLink) {
        plansLink.addEventListener('click', (event) => {
          event.preventDefault();
          showSection('plansSection');
        });
      }
    } else if (message) {
      message.remove();
      link.removeAttribute('aria-disabled');
      link.tabIndex = 0;
    }
  });
}

// Igual que applyPlanLockToCards() pero para los ejemplos de overlay: la
// tarjeta se sigue viendo (para que el usuario sepa que el overlay existe),
// pero no abre su modal de configuracion mientras no tenga plan/prueba
// activos. El bloqueo real del click es CSS (pointer-events: none sobre
// .overlay-preview-stage); aca solo togglea clases/mensaje y el foco por
// teclado (tabIndex).
function applyOverlayPlanLockToCards() {
  const locked = accessStatus !== null && accessStatus.hasAccess === false && !currentUser?.isSuperUser;

  document.querySelectorAll('.overlay-card').forEach((card) => {
    const toggle = card.querySelector('.overlay-preview-stage');
    if (!toggle) return;

    card.classList.toggle('overlay-locked-by-plan', locked);
    let message = card.querySelector('.overlay-locked-message');

    if (locked) {
      toggle.tabIndex = -1;
      toggle.setAttribute('aria-disabled', 'true');

      if (!message) {
        message = document.createElement('p');
        message.className = 'overlay-locked-message';
        card.appendChild(message);
      }
      message.innerHTML = '🔒 Necesitas un plan o prueba activos para usar este overlay. <a href="#" data-go-to-plans>Ver planes</a>';

      const plansLink = message.querySelector('[data-go-to-plans]');
      if (plansLink) {
        plansLink.addEventListener('click', (event) => {
          event.preventDefault();
          showSection('plansSection');
        });
      }
    } else {
      toggle.tabIndex = 0;
      toggle.removeAttribute('aria-disabled');
      if (message) message.remove();
    }
  });
}

function renderAccountProfile() {
  const avatar = document.getElementById('accountAvatar');
  const badge = document.getElementById('accountPlanBadge');
  const detail = document.getElementById('accountPlanDetail');
  const plansBtn = document.getElementById('accountGoPlansBtn');
  if (!badge) return;

  const seed = (currentUser?.name || currentUser?.email || '?').trim();
  if (avatar) avatar.textContent = seed.charAt(0).toUpperCase() || '?';

  let tone = '';
  let label = '-';
  let note = '';
  let showPlans = true;

  if (currentUser?.isSuperUser) {
    label = 'Superusuario';
    note = 'Acceso total a la plataforma';
    showPlans = false;
  } else if (accessStatus) {
    if (accessStatus.hasAccess) {
      const days = accessStatus.daysRemaining;
      tone = 'ok';
      label = accessStatus.planLabel || (accessStatus.isTrial ? 'Prueba gratuita' : 'Plan activo');
      note = `Te ${days === 1 ? 'queda 1 día' : `quedan ${days} días`}`;
    } else {
      tone = 'warn';
      label = 'Sin plan activo';
      note = accessStatus.accessExpiresAt ? 'Tu acceso venció' : 'Elige un plan para seguir jugando';
    }
  }

  badge.textContent = label;
  badge.classList.toggle('ok', tone === 'ok');
  badge.classList.toggle('warn', tone === 'warn');
  if (detail) detail.textContent = note;
  if (plansBtn) plansBtn.hidden = !showPlans;
}

function formatAccessMessage(status) {
  if (!status) return '';

  if (status.hasAccess) {
    const label = status.isTrial ? 'prueba gratuita' : 'plan activo';
    const days = status.daysRemaining;
    const daysLabel = days === 1 ? '1 dia' : `${days} dias`;
    return `Tienes tu ${label} activa: te quedan ${daysLabel}.`;
  }

  return status.accessExpiresAt
    ? 'Tu prueba gratuita o plan vencio. Elige un plan para seguir jugando.'
    : 'Aun no tienes un plan activo.';
}

function renderAccessBanners() {
  renderAccountProfile();

  if (currentUser?.isSuperUser) {
    if (accessStatusBanner) accessStatusBanner.classList.add('hidden');
    if (plansAccessStatus) plansAccessStatus.classList.add('hidden');
    return;
  }

  if (sidebarUserPlan) sidebarUserPlan.textContent = accessStatus?.planLabel || '-';

  const message = formatAccessMessage(accessStatus);
  const isWarning = !accessStatus?.hasAccess;

  [accessStatusBanner, plansAccessStatus].forEach((banner) => {
    if (!banner) return;
    banner.textContent = message;
    banner.classList.remove('hidden');
    banner.classList.toggle('warning', isWarning);
    banner.classList.toggle('ok', !isWarning);
  });
}

async function loadAccessStatus() {
  try {
    const response = await fetch('/api/account/access');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar tu estado de acceso.');

    accessStatus = data;
    renderAccessBanners();
    applyPlanLockToCards();
    applyOverlayPlanLockToCards();
  } catch (error) {
    console.warn('[PLATFORM] Access status unavailable:', error.message);
  }
}

// REGION_TO_CURRENCY, detectUserCurrency, formatPrice, PLAN_BENEFITS,
// PLAN_ACCENTS, PLAN_POPULAR_ID, PLAN_DISCOUNT_PERCENT y buildPlanCardHtml
// viven en js/plans-shared.js (compartido con la landing) — cargado antes
// que este archivo en platform.html.

function renderPlanCards() {
  if (!plansGrid) return;

  if (!availablePlans.length) {
    plansGrid.innerHTML = '<p class="muted">No hay planes disponibles por el momento.</p>';
    return;
  }

  const anyGatewayReady = availableGateways.mercadopago || availableGateways.wompi;

  if (plansGatewayNotice) {
    plansGatewayNotice.classList.toggle('hidden', anyGatewayReady);
    plansGatewayNotice.textContent = 'Los pagos todavia no estan habilitados. Vuelve pronto.';
  }

  plansGrid.innerHTML = availablePlans.map((plan) => {
    const actionsHtml = `
      <button class="btn primary" type="button" data-checkout data-plan-id="${escapeHtml(plan.id)}" data-gateway="wompi" ${availableGateways.wompi ? '' : 'disabled'}>
        Pagar con Wompi
      </button>
      <button class="btn secondary" type="button" data-checkout data-plan-id="${escapeHtml(plan.id)}" data-gateway="mercadopago" ${availableGateways.mercadopago ? '' : 'disabled'}>
        Pagar con MercadoPago
      </button>
    `;
    return buildPlanCardHtml(plan, actionsHtml);
  }).join('');

  plansGrid.querySelectorAll('[data-checkout]').forEach((button) => {
    button.addEventListener('click', () => {
      startCheckout(button.dataset.planId, button.dataset.gateway, button);
    });
  });

  if (currentUser?.isSuperUser) {
    setupAdminPlanPriceControls();
  }
}

let adminPriceMinimums = { wompiCop: 1500, mercadopagoCop: 1500 };

// Inyecta, solo para el superusuario, un mini formulario de precio real
// dentro de cada tarjeta de plan (mismo criterio que el toggle de
// habilitar/deshabilitar juego: el control admin vive sobre la tarjeta que
// ya ve todo el mundo, no en una pantalla CRUD aparte).
async function setupAdminPlanPriceControls() {
  if (!plansGrid) return;

  let adminPlans = {};
  try {
    const response = await fetch('/api/admin/plans');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los precios.');

    adminPlans = (data.plans || []).reduce((accumulator, plan) => {
      accumulator[plan.id] = plan;
      return accumulator;
    }, {});
    adminPriceMinimums = data.minimums || adminPriceMinimums;
  } catch (error) {
    console.warn('[PLATFORM] Admin plan prices unavailable:', error.message);
    return;
  }

  plansGrid.querySelectorAll('.plan-card').forEach((card) => {
    const planId = card.dataset.planId;
    const plan = adminPlans[planId];
    if (!plan) return;

    const existingForm = card.querySelector('[data-admin-price-form]');
    if (existingForm) existingForm.remove();

    const usdValue = (plan.price_usd_cents / 100).toFixed(2);
    const copEstimateText = plan.wompiEstimateCop
      ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(plan.wompiEstimateCop.amount)
      : '—';

    const form = document.createElement('form');
    form.className = 'admin-plan-price-form';
    form.dataset.adminPriceForm = planId;
    form.innerHTML = `
      <p class="admin-plan-price-title">Precio real (admin) — solo USD</p>
      <label>
        <span>USD</span>
        <input type="number" step="0.01" min="0.01" name="priceUsd" value="${usdValue}" required />
      </label>
      <p class="admin-plan-price-hint">
        ≈ ${escapeHtml(copEstimateText)} COP hoy (Wompi/MercadoPago convierten en vivo al momento del pago)<br />
        Minimo: $${escapeHtml(String(adminPriceMinimums.wompiCop))} COP (Wompi) · $${escapeHtml(String(adminPriceMinimums.mercadopagoCop))} COP (MercadoPago)
      </p>
      <button class="btn small secondary" type="submit">Guardar precio</button>
      <p class="admin-plan-price-error hidden"></p>
    `;

    card.appendChild(form);

    form.addEventListener('click', (event) => event.stopPropagation());

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const errorEl = form.querySelector('.admin-plan-price-error');
      errorEl.classList.add('hidden');
      errorEl.textContent = '';

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        const response = await fetch(`/api/admin/plans/${encodeURIComponent(planId)}/price`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            priceUsdCents: Math.round(Number(form.priceUsd.value) * 100),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el precio.');

        await loadPlans();
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
      }
    });
  });
}

async function loadPlans() {
  try {
    const currency = detectUserCurrency();
    const response = await fetch(`/api/plans?currency=${encodeURIComponent(currency)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los planes.');

    availablePlans = data.plans || [];
    availableGateways = data.gateways || { stripe: false, mercadopago: false, wompi: false };
    renderPlanCards();
  } catch (error) {
    if (plansGrid) {
      plansGrid.innerHTML = `<p class="muted">No se pudieron cargar los planes: ${escapeHtml(error.message)}</p>`;
    }
  }
}

const GATEWAY_LABELS = { wompi: 'Wompi', mercadopago: 'MercadoPago' };

// Aviso previo a salir hacia la pasarela: le explica al usuario que ahi el
// monto va a aparecer en pesos colombianos (COP) sin importar la moneda que
// vio en la tarjeta de plan, y que es el mismo precio, sin cargos extra —
// para que no le sorprenda ni piense que es un error. Barra de progreso de
// `seconds` que redirige sola al terminar; "Continuar ahora" salta la espera.
function showGatewayRedirectNotice(gateway, seconds = 10) {
  const gatewayName = GATEWAY_LABELS[gateway] || 'la pasarela de pago';

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'app-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="app-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="gatewayNoticeTitle" aria-describedby="gatewayNoticeMessage" tabindex="-1">
        <div class="app-dialog-header">
          <div class="app-dialog-icon" aria-hidden="true">💳</div>
          <div class="app-dialog-heading">
            <h2 id="gatewayNoticeTitle" class="app-dialog-title">Antes de continuar</h2>
          </div>
        </div>
        <div id="gatewayNoticeMessage" class="app-dialog-message">
          Vas a completar tu pago en <strong>${escapeHtml(gatewayName)}</strong>. Ahí el monto se mostrará en pesos colombianos (COP): es el mismo precio que viste en la sección de Planes, solo que la pasarela opera únicamente en esa moneda. No se te cobrará nada adicional.
        </div>
        <div class="gateway-notice-progress-track">
          <div class="gateway-notice-progress-fill"></div>
        </div>
        <p class="gateway-notice-countdown">Te llevaremos a ${escapeHtml(gatewayName)} en <span data-countdown>${seconds}</span>s</p>
        <div class="app-dialog-actions">
          <button class="app-dialog-button primary" type="button" data-continue>Continuar ahora</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      const fill = backdrop.querySelector('.gateway-notice-progress-fill');
      fill.style.transitionDuration = `${seconds}s`;
      requestAnimationFrame(() => { fill.style.width = '100%'; });
    });

    const countdownEl = backdrop.querySelector('[data-countdown]');
    let remaining = seconds;
    const tick = setInterval(() => {
      remaining -= 1;
      if (countdownEl) countdownEl.textContent = Math.max(0, remaining);
    }, 1000);

    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      clearInterval(tick);
      clearTimeout(timer);
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 180);
      resolve();
    }

    const timer = setTimeout(finish, seconds * 1000);

    backdrop.querySelector('[data-continue]').addEventListener('click', finish);
  });
}

async function startCheckout(planId, gateway, button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Preparando pago...';
  }

  try {
    const response = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, gateway }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo iniciar el pago.');
    }

    await showGatewayRedirectNotice(gateway);
    window.location.href = data.url;
  } catch (error) {
    await showAlert(error.message, 'Error al iniciar el pago');
    renderPlanCards();
  }
}

// Consulta el estado real del pago en nuestra DB (la fuente de verdad, que
// actualiza el webhook de cada pasarela) esperando un poco si aun no llega:
// algunas pasarelas (Wompi) redirigen de vuelta a la MISMA url sin importar
// si el pago fue aprobado o rechazado, asi que nunca hay que confiar en el
// query param por si solo.
async function pollPaymentStatus(paymentId, attempts = 5, delayMs = 1500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`/api/payments/${paymentId}/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'paid' || data.status === 'failed') {
          return data.status;
        }
      }
    } catch (_error) {
      // reintenta
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return 'pending';
}

async function handlePaymentRedirectParams() {
  const params = new URLSearchParams(window.location.search);
  const paymentStatus = params.get('payment');
  const paymentId = params.get('paymentId');
  const locked = params.get('locked');

  if (paymentStatus === 'success' && paymentId) {
    const realStatus = await pollPaymentStatus(paymentId);
    if (realStatus === 'paid') {
      await loadAccessStatus();
      await showAlert('¡Pago recibido! Tu acceso ya esta activo.', 'Pago exitoso');
    } else if (realStatus === 'failed') {
      await showAlert('El pago fue rechazado por la pasarela. Puedes intentarlo de nuevo con otro medio de pago.', 'Pago rechazado');
    } else {
      await showAlert('Tu pago sigue en proceso. Te confirmaremos por correo apenas se complete; si ya pagaste, recarga esta pagina en un momento.', 'Pago en proceso');
    }
    showSection('plansSection');
  } else if (paymentStatus === 'cancel') {
    await showAlert('El pago no se completo. Puedes intentarlo de nuevo cuando quieras.', 'Pago cancelado');
    showSection('plansSection');
  } else if (locked === '1') {
    showSection('gamesSection');
  }

  if (paymentStatus || locked) {
    params.delete('payment');
    params.delete('paymentId');
    params.delete('locked');
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }
}

function setupAdminGameAvailabilityControls() {
  if (!currentUser?.isSuperUser) {
    return;
  }

  document.querySelectorAll('.game-card').forEach((card) => {
    const link = card.querySelector('a.start-btn');
    if (!link) return;

    const gameType = gameTypeFromHref(link.getAttribute('href') || '');
    if (!gameType || card.querySelector('[data-game-availability]')) return;

    const toggle = document.createElement('label');
    toggle.className = 'admin-game-toggle in-card';
    toggle.innerHTML = `
      <span>Juego habilitado</span>
      <input type="checkbox" data-game-availability="${escapeHtml(gameType)}" />
    `;
    card.appendChild(toggle);

    const input = toggle.querySelector('input');
    input.addEventListener('change', async () => {
      const gameType = input.dataset.gameAvailability;
      const previousValue = !input.checked;
      try {
        const response = await fetch(`/api/admin/games/${gameType}/availability`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isEnabled: input.checked }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo actualizar el juego.');
        }
        gameAvailability[gameType] = {
          gameType,
          isEnabled: data.game?.is_enabled ?? input.checked,
          updatedAt: data.game?.updated_at || null,
        };
        syncAdminGameAvailabilityControls();
        applyGameAvailabilityToCards();
      } catch (error) {
        input.checked = previousValue;
        await showAlert(error.message, 'Error');
      }
    });
  });
}

function syncAdminGameAvailabilityControls() {
  document.querySelectorAll('[data-game-availability]').forEach((input) => {
    const availability = gameAvailability[input.dataset.gameAvailability];
    input.checked = availability ? availability.isEnabled !== false : true;
  });
}

async function loadGameAvailability() {
  try {
    const response = await fetch('/api/games/availability');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar la disponibilidad de juegos.');

    gameAvailability = data.games || {};
    setupAdminGameAvailabilityControls();
    syncAdminGameAvailabilityControls();
    applyGameAvailabilityToCards();
  } catch (error) {
    console.warn('[PLATFORM] Game availability unavailable:', error.message);
  }
}

function setupAdminEditModal() {
  const nameField = adminEditName?.closest('.field');
  const emailField = adminEditEmail?.closest('.field');
  const connectionsBox = adminEditConnections?.closest('.admin-connections-box');

  if (nameField) nameField.hidden = true;
  if (emailField) emailField.hidden = true;
  if (adminEditName) {
    adminEditName.required = false;
    adminEditName.disabled = true;
  }
  if (adminEditEmail) {
    adminEditEmail.required = false;
    adminEditEmail.disabled = true;
  }

  if (!connectionsBox || document.getElementById('adminEditAccountSummary')) {
    return;
  }

  const summary = document.createElement('div');
  summary.id = 'adminEditAccountSummary';
  summary.className = 'admin-account-summary';
  summary.innerHTML = `
    <div>
      <span>Nombre</span>
      <strong id="adminEditAccountName">-</strong>
    </div>
    <div>
      <span>Correo electronico</span>
      <strong id="adminEditAccountEmail">-</strong>
    </div>
  `;

  connectionsBox.before(summary);
  adminEditAccountName = document.getElementById('adminEditAccountName');
  adminEditAccountEmail = document.getElementById('adminEditAccountEmail');
}

// La sección activa vive en el hash de la URL (#accountSection) para que al
// recargar la página el usuario siga donde estaba.
function restoreSectionFromHash() {
  const sectionId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (!sectionId) return;
  if (!Array.from(sections).some((section) => section.id === sectionId)) return;
  if (sectionId === 'adminSection' && !currentUser?.isSuperUser) return;
  showSection(sectionId);
}

function showSection(sectionId) {
  try {
    if (window.location.hash !== `#${sectionId}`) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${sectionId}`);
    }
  } catch (_error) {
    // Sin history.replaceState simplemente no se recuerda la sección.
  }

  sections.forEach((section) => {
    section.classList.toggle('hidden', section.id !== sectionId);
  });

  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });

  if (sectionId === 'adminSection' && currentUser?.isSuperUser) {
    loadAdminUsers();
  }

  if (sectionId === 'accountSection') {
    loadStreamStats();
  }

  if (sectionId === 'overlaysSection') {
    restoreOverlayTiktokConnection();
    if (!overlayKeyLoaded) {
      overlayKeyLoaded = true;
      loadOverlayConfig();
    } else {
      reloadOverlayPreviewFrames();
    }
  } else {
    // Descarga los iframes al salir de la sección para cortar sus loops de
    // demo en segundo plano (nunca tocan el backend, pero no hace falta que
    // sigan corriendo si el streamer no está mirando la vista previa).
    if (overlayPreviewFrame) overlayPreviewFrame.src = 'about:blank';
    if (goalBarPreviewFrame) goalBarPreviewFrame.src = 'about:blank';
    if (topGiftersPreviewFrame) topGiftersPreviewFrame.src = 'about:blank';
    if (likeCounterPreviewFrame) likeCounterPreviewFrame.src = 'about:blank';
    if (topLikersPreviewFrame) topLikersPreviewFrame.src = 'about:blank';
    if (followAlertPreviewFrame) followAlertPreviewFrame.src = 'about:blank';
    const roulettePreviewFrameEl = document.getElementById('roulettePreviewFrame');
    if (roulettePreviewFrameEl) roulettePreviewFrameEl.src = 'about:blank';
    const battlePreviewFrameEl = document.getElementById('battlePreviewFrame');
    if (battlePreviewFrameEl) battlePreviewFrameEl.src = 'about:blank';
  }
}

let currentOverlayKeys = null;
let currentOverlayState = null;

// Mapea cada widget a su página de overlay y al input/hint de su modal, para
// no repetir un bloque casi idéntico por cada uno.
const OVERLAY_WIDGETS = {
  giftAlert: { page: 'gift-alert', previewFrame: () => overlayPreviewFrame, linkInput: () => overlayLinkInput, linkHint: () => overlayLinkHint },
  goalBar: { page: 'goal-bar', previewFrame: () => goalBarPreviewFrame, linkInput: () => goalBarLinkInput, linkHint: () => goalBarLinkHint },
  topGifters: { page: 'top-gifters', previewFrame: () => topGiftersPreviewFrame, linkInput: () => topGiftersLinkInput, linkHint: () => topGiftersLinkHint },
  likeCounter: { page: 'like-counter', previewFrame: () => likeCounterPreviewFrame, linkInput: () => likeCounterLinkInput, linkHint: () => likeCounterLinkHint },
  topLikers: { page: 'top-likers', previewFrame: () => topLikersPreviewFrame, linkInput: () => topLikersLinkInput, linkHint: () => topLikersLinkHint },
  followAlert: { page: 'follow-alert', previewFrame: () => followAlertPreviewFrame, linkInput: () => followAlertLinkInput, linkHint: () => followAlertLinkHint },
  roulette: {
    page: 'roulette',
    previewFrame: () => document.getElementById('roulettePreviewFrame'),
    linkInput: () => document.getElementById('rouletteLinkInput'),
    linkHint: () => document.getElementById('rouletteLinkHint'),
  },
  battle: {
    page: 'battle',
    previewFrame: () => document.getElementById('battlePreviewFrame'),
    linkInput: () => document.getElementById('battleLinkInput'),
    linkHint: () => document.getElementById('battleLinkHint'),
  },
};

// Link real, el que se copia para pegar en OBS/Streamlabs/TikTok LIVE Studio
// — ahí SOLO deben verse regalos reales o el de prueba manual. Cada overlay
// tiene su PROPIA key (ver overlayService.js) para que regenerar el link de
// uno no invalide los otros ni haya colisiones al pegar varios a la vez.
function buildOverlayUrl(overlayKey, page) {
  return `${window.location.origin}/overlay/${page}.html?key=${overlayKey}`;
}

// Vista previa embebida en la plataforma: mismo overlay, pero con ?demo=1
// para que repita la animación sola de forma enteramente local (ver
// overlay-gift-alert.js / overlay-goal-bar.js) — nunca pasa por el canal
// real de eventos, así que jamás le llega a un overlay real pegado en OBS.
function buildOverlayPreviewUrl(overlayKey, page) {
  return `${buildOverlayUrl(overlayKey, page)}&demo=1`;
}

function reloadOverlayPreviewFrames() {
  if (!currentOverlayKeys) return;

  Object.entries(OVERLAY_WIDGETS).forEach(([widget, config]) => {
    const frame = config.previewFrame();
    const key = currentOverlayKeys[widget];
    if (frame && key) frame.src = buildOverlayPreviewUrl(key, config.page);
  });
}

// Llena los <select> de sonido con el catálogo de overlay-sounds.js — se
// carga antes que platform.js, así que window.OVERLAY_SOUNDS ya existe.
function populateSoundSelects() {
  const sounds = window.OVERLAY_SOUNDS || { none: { label: 'Ninguno' } };
  [overlaySoundSelect, followAlertSoundSelect].forEach((select) => {
    if (!select || select.options.length > 0) return;
    Object.entries(sounds).forEach(([id, { label }]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      select.appendChild(option);
    });
  });
}

populateSoundSelects();

function applyOverlayStateToInputs(state) {
  currentOverlayState = state;

  const giftAlert = state?.giftAlert || {};
  if (overlayEnabledToggle) overlayEnabledToggle.checked = giftAlert.enabled !== false;
  if (overlayDurationInput) overlayDurationInput.value = giftAlert.durationSeconds || 5;
  if (overlayDurationValue) overlayDurationValue.textContent = `${giftAlert.durationSeconds || 5}s`;
  if (overlayMinCoinsInput) overlayMinCoinsInput.value = giftAlert.minCoins || 0;
  if (overlaySoundSelect) overlaySoundSelect.value = giftAlert.sound || 'none';

  const goalBar = state?.goalBar || {};
  if (goalBarEnabledToggle) goalBarEnabledToggle.checked = goalBar.enabled !== false;
  if (goalBarLabelInput) goalBarLabelInput.value = goalBar.label || 'Meta de la transmisión';
  if (goalBarTargetInput) goalBarTargetInput.value = goalBar.targetCoins || 500;
  if (goalBarCurrentValue) goalBarCurrentValue.textContent = goalBar.currentCoins || 0;

  const topGifters = state?.topGifters || {};
  if (topGiftersEnabledToggle) topGiftersEnabledToggle.checked = topGifters.enabled !== false;
  if (topGiftersTitleInput) topGiftersTitleInput.value = topGifters.title || 'Top Regaladores';
  if (topGiftersMaxEntriesInput) topGiftersMaxEntriesInput.value = topGifters.maxEntries || 5;
  if (topGiftersMaxEntriesValue) topGiftersMaxEntriesValue.textContent = topGifters.maxEntries || 5;

  const likeCounter = state?.likeCounter || {};
  if (likeCounterEnabledToggle) likeCounterEnabledToggle.checked = likeCounter.enabled !== false;
  if (likeCounterLabelInput) likeCounterLabelInput.value = likeCounter.label || 'Likes en vivo';
  if (likeCounterCurrentValue) likeCounterCurrentValue.textContent = likeCounter.totalLikes || 0;

  const topLikers = state?.topLikers || {};
  if (topLikersEnabledToggle) topLikersEnabledToggle.checked = topLikers.enabled !== false;
  if (topLikersTitleInput) topLikersTitleInput.value = topLikers.title || 'Top Likes';
  if (topLikersMaxEntriesInput) topLikersMaxEntriesInput.value = topLikers.maxEntries || 5;
  if (topLikersMaxEntriesValue) topLikersMaxEntriesValue.textContent = topLikers.maxEntries || 5;

  const followAlert = state?.followAlert || {};
  if (followAlertEnabledToggle) followAlertEnabledToggle.checked = followAlert.enabled !== false;
  if (followAlertDurationInput) followAlertDurationInput.value = followAlert.durationSeconds || 5;
  if (followAlertDurationValue) followAlertDurationValue.textContent = `${followAlert.durationSeconds || 5}s`;
  if (followAlertSoundSelect) followAlertSoundSelect.value = followAlert.sound || 'none';

  // La ruleta tiene su propio script (js/platform-roulette.js).
  if (window.applyRouletteState) window.applyRouletteState(state);
  // La batalla tambien tiene su propio script (js/platform-battle.js).
  if (window.applyBattleState) window.applyBattleState(state);
}

// Los overlays reciben regalos/likes reales solo si el backend tiene una
// conexión activa a TikTok Live para este usuario (en CUALQUIER gameType,
// incluido este 'overlay' dedicado). Sin esto, un streamer que solo pega
// los overlays en OBS (sin abrir ningún juego) nunca recibe eventos reales
// — el botón "enviar regalo de prueba" sí funciona porque no depende de
// esta conexión, lo cual puede confundir.
function setOverlayConnectionStatus(status, details = '') {
  if (!overlayConnectionStatusBadge || !overlayConnectionDetails) return;

  const labels = {
    disconnected: 'Desconectado',
    connecting: 'cargando...',
    connected: 'Conectado',
    live_off: 'live apagado',
    error: 'Error',
  };

  overlayConnectionStatusBadge.textContent = labels[status] || labels.disconnected;
  overlayConnectionStatusBadge.className = `status-badge ${status}`;
  overlayConnectionDetails.textContent = details || 'Ingresa el nombre de usuario de TikTok que está transmitiendo en vivo.';
}

async function restoreOverlayTiktokConnection() {
  try {
    const [connectionRes, statusRes] = await Promise.all([
      fetch('/api/tiktok-connection/overlay'),
      fetch('/api/status?gameType=overlay'),
    ]);

    const connectionData = connectionRes.ok ? await connectionRes.json() : null;
    if (connectionData?.tiktok_username && overlayTiktokUsernameInput) {
      overlayTiktokUsernameInput.value = `@${connectionData.tiktok_username}`;
    }

    const statusData = statusRes.ok ? await statusRes.json() : null;
    if (statusData?.status === 'connected') {
      setOverlayConnectionStatus('connected', `Conectado a @${statusData.uniqueId}.`);
    } else if (connectionData?.tiktok_username) {
      setOverlayConnectionStatus('disconnected', `Cuenta vinculada a @${connectionData.tiktok_username}. Te conectaremos automáticamente en cuanto salgas en vivo.`);
    } else {
      setOverlayConnectionStatus('disconnected');
    }
  } catch (error) {
    setOverlayConnectionStatus('error', 'No se pudo leer el estado de la conexión.');
  }
}

async function connectOverlayTiktok() {
  const uniqueId = overlayTiktokUsernameInput?.value.trim().replace(/^@/, '');
  if (!uniqueId) return;

  overlayConnectTiktokBtn.disabled = true;
  setOverlayConnectionStatus('connecting');

  try {
    await fetch('/api/tiktok-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'overlay', tiktokUsername: uniqueId }),
    });

    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, gameType: 'overlay' }),
    });
    const payload = await response.json();

    if (payload.status === 'connected') {
      setOverlayConnectionStatus('connected', payload.message || `Conectado a @${uniqueId}.`);
    } else if (payload.status === 'live_off') {
      setOverlayConnectionStatus('live_off', 'live apagado — te conectaremos automáticamente en cuanto salgas en vivo.');
    } else {
      setOverlayConnectionStatus('error', payload.message || payload.error || 'No se pudo conectar.');
    }
  } catch (error) {
    setOverlayConnectionStatus('error', error.message || 'No se pudo conectar.');
  } finally {
    overlayConnectTiktokBtn.disabled = false;
  }
}

async function disconnectOverlayTiktok() {
  overlayDisconnectTiktokBtn.disabled = true;
  try {
    await fetch('/api/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'overlay' }),
    });
    setOverlayConnectionStatus('disconnected', 'Conexión cerrada.');
  } catch (error) {
    setOverlayConnectionStatus('error', 'No se pudo desconectar.');
  } finally {
    overlayDisconnectTiktokBtn.disabled = false;
  }
}

if (overlayConnectTiktokBtn) {
  overlayConnectTiktokBtn.addEventListener('click', connectOverlayTiktok);
}

if (overlayDisconnectTiktokBtn) {
  overlayDisconnectTiktokBtn.addEventListener('click', disconnectOverlayTiktok);
}

if (overlayConnectionForm) {
  overlayConnectionForm.addEventListener('submit', (event) => event.preventDefault());
}

// Mismos gameType que administra el panel de admin (EDITABLE_GAME_TYPES en
// backend/src/routes/admin.js) — vincular desde aca escribe el mismo usuario
// en la conexion de cada uno, para que "un solo usuario de TikTok para toda
// la plataforma" sea real sin tener que migrar la tabla por-juego del backend.
const ALL_GAME_TYPES = ['app', 'snake', 'race', 'dominance', 'roblox', 'robloxparkour', 'minecraft', 'minecraftcubo', 'gta', 'gtarampa', 'kingdoms', 'shellgame', 'boyvsgirl'];

// Una vez vinculado, el usuario de TikTok no se puede cambiar desde aqui:
// el campo y el boton "Vincular" quedan bloqueados.
let gamesLinkLocked = false;

function applyGamesLinkLock(locked) {
  gamesLinkLocked = locked;
  if (gamesTiktokUsernameInput) {
    gamesTiktokUsernameInput.readOnly = locked;
    gamesTiktokUsernameInput.classList.toggle('is-locked', locked);
    gamesTiktokUsernameInput.title = locked ? 'Tu usuario de TikTok ya está vinculado y no se puede cambiar.' : '';
  }
  if (gamesLinkTiktokBtn) {
    gamesLinkTiktokBtn.disabled = locked;
    gamesLinkTiktokBtn.textContent = locked ? 'Vinculado' : 'Vincular';
  }
}

function setGamesConnectionStatus(status, details = '') {
  if (!gamesConnectionStatusBadge || !gamesConnectionDetails) return;

  const labels = {
    disconnected: 'Sin vincular',
    linked: 'Vinculado',
    connecting: 'Vinculando...',
    error: 'Error',
  };

  applyGamesLinkLock(status === 'linked');

  gamesConnectionStatusBadge.textContent = labels[status] || labels.disconnected;
  gamesConnectionStatusBadge.className = `status-badge ${status === 'linked' ? 'connected' : status}`;
  gamesConnectionDetails.textContent = details
    || 'Este usuario queda vinculado para todos tus juegos. Dentro de cada juego solo tendrás que darle a "Conectar a live" cuando ya estés transmitiendo.';
}

async function restoreGamesTiktokConnection() {
  try {
    const response = await fetch('/api/tiktok-connection/app');
    const data = response.ok ? await response.json() : null;

    if (data?.tiktok_username && gamesTiktokUsernameInput) {
      gamesTiktokUsernameInput.value = `@${data.tiktok_username}`;
      setGamesConnectionStatus('linked', `Vinculado a @${data.tiktok_username}.`);
    } else {
      setGamesConnectionStatus('disconnected');
    }
  } catch (error) {
    setGamesConnectionStatus('error', 'No se pudo leer tu usuario vinculado.');
  }
}

async function linkGamesTiktokUsername() {
  if (gamesLinkLocked) return;

  const uniqueId = gamesTiktokUsernameInput?.value.trim().replace(/^@/, '');
  if (!uniqueId) {
    await showAlert('Ingresa un usuario de TikTok.', 'Falta usuario');
    return;
  }

  if (gamesLinkTiktokBtn) gamesLinkTiktokBtn.disabled = true;
  setGamesConnectionStatus('connecting');

  try {
    const responses = await Promise.all(
      ALL_GAME_TYPES.map((gameType) => fetch('/api/tiktok-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, tiktokUsername: uniqueId }),
      })),
    );

    if (responses.some((response) => !response.ok)) {
      throw new Error('No se pudo vincular la cuenta en todos los juegos.');
    }

    gamesTiktokUsernameInput.value = `@${uniqueId}`;
    setGamesConnectionStatus('linked', `Vinculado a @${uniqueId} en todos tus juegos.`);
  } catch (error) {
    setGamesConnectionStatus('error', error.message || 'No se pudo vincular la cuenta.');
  } finally {
    if (gamesLinkTiktokBtn) gamesLinkTiktokBtn.disabled = gamesLinkLocked;
  }
}

async function loadGamesGiftCatalog() {
  if (gamesLoadCatalogBtn) gamesLoadCatalogBtn.disabled = true;

  try {
    const response = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'app' }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo cargar el catálogo.');
    }

    await showAlert(`Se cargaron ${payload.total || 0} regalos de TikTok, ya disponibles en todos tus juegos.`, 'Catálogo actualizado');
  } catch (error) {
    await showAlert(error.message, 'Error al cargar catálogo');
  } finally {
    if (gamesLoadCatalogBtn) gamesLoadCatalogBtn.disabled = false;
  }
}

if (gamesLinkTiktokBtn) {
  gamesLinkTiktokBtn.addEventListener('click', linkGamesTiktokUsername);
}

if (gamesLoadCatalogBtn) {
  gamesLoadCatalogBtn.addEventListener('click', loadGamesGiftCatalog);
}

if (gamesConnectionForm) {
  gamesConnectionForm.addEventListener('submit', (event) => event.preventDefault());
}

async function loadOverlayConfig() {
  try {
    const response = await fetch('/api/overlay/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuración del overlay.');
    const data = await response.json();
    currentOverlayKeys = data.overlayKeys;

    Object.entries(OVERLAY_WIDGETS).forEach(([widget, config]) => {
      const input = config.linkInput();
      const key = currentOverlayKeys?.[widget];
      if (input && key) input.value = buildOverlayUrl(key, config.page);
    });

    applyOverlayStateToInputs(data.state);
    reloadOverlayPreviewFrames();
  } catch (error) {
    if (overlayLinkInput) overlayLinkInput.value = '';
    if (overlayLinkHint) overlayLinkHint.textContent = error.message;
  }
}

// Ambos overlays comparten un solo blob de estado en el backend — guardar
// desde un modal manda TAMBIÉN lo que ya había del otro (tal como está en
// currentOverlayState), para no pisarle la configuración al que no se tocó.
async function saveOverlayConfig() {
  try {
    overlaySaveBtn.disabled = true;
    const response = await fetch('/api/overlay/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentOverlayState,
        giftAlert: {
          enabled: overlayEnabledToggle.checked,
          durationSeconds: Number(overlayDurationInput.value) || 5,
          minCoins: Number(overlayMinCoinsInput.value) || 0,
          sound: overlaySoundSelect?.value || 'none',
        },
      }),
    });
    if (!response.ok) throw new Error('No se pudo guardar la configuración.');
    const data = await response.json();
    applyOverlayStateToInputs(data.state);
    reloadOverlayPreviewFrames();
    showAppAlert('Configuración del overlay guardada.', 'Overlays');
  } catch (error) {
    showAppAlert(error.message, 'Error al guardar');
  } finally {
    overlaySaveBtn.disabled = false;
  }
}

async function saveGoalBarConfig() {
  try {
    goalBarSaveBtn.disabled = true;
    const response = await fetch('/api/overlay/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentOverlayState,
        goalBar: {
          ...(currentOverlayState?.goalBar || {}),
          enabled: goalBarEnabledToggle.checked,
          label: goalBarLabelInput.value || 'Meta de la transmisión',
          targetCoins: Number(goalBarTargetInput.value) || 500,
        },
      }),
    });
    if (!response.ok) throw new Error('No se pudo guardar la configuración.');
    const data = await response.json();
    applyOverlayStateToInputs(data.state);
    reloadOverlayPreviewFrames();
    showAppAlert('Configuración del overlay guardada.', 'Overlays');
  } catch (error) {
    showAppAlert(error.message, 'Error al guardar');
  } finally {
    goalBarSaveBtn.disabled = false;
  }
}

async function saveTopGiftersConfig() {
  try {
    topGiftersSaveBtn.disabled = true;
    const response = await fetch('/api/overlay/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentOverlayState,
        topGifters: {
          ...(currentOverlayState?.topGifters || {}),
          enabled: topGiftersEnabledToggle.checked,
          title: topGiftersTitleInput.value || 'Top Regaladores',
          maxEntries: Number(topGiftersMaxEntriesInput.value) || 5,
        },
      }),
    });
    if (!response.ok) throw new Error('No se pudo guardar la configuración.');
    const data = await response.json();
    applyOverlayStateToInputs(data.state);
    reloadOverlayPreviewFrames();
    showAppAlert('Configuración del overlay guardada.', 'Overlays');
  } catch (error) {
    showAppAlert(error.message, 'Error al guardar');
  } finally {
    topGiftersSaveBtn.disabled = false;
  }
}

async function saveLikeCounterConfig() {
  try {
    likeCounterSaveBtn.disabled = true;
    const response = await fetch('/api/overlay/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentOverlayState,
        likeCounter: {
          ...(currentOverlayState?.likeCounter || {}),
          enabled: likeCounterEnabledToggle.checked,
          label: likeCounterLabelInput.value || 'Likes en vivo',
        },
      }),
    });
    if (!response.ok) throw new Error('No se pudo guardar la configuración.');
    const data = await response.json();
    applyOverlayStateToInputs(data.state);
    reloadOverlayPreviewFrames();
    showAppAlert('Configuración del overlay guardada.', 'Overlays');
  } catch (error) {
    showAppAlert(error.message, 'Error al guardar');
  } finally {
    likeCounterSaveBtn.disabled = false;
  }
}

async function saveTopLikersConfig() {
  try {
    topLikersSaveBtn.disabled = true;
    const response = await fetch('/api/overlay/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentOverlayState,
        topLikers: {
          ...(currentOverlayState?.topLikers || {}),
          enabled: topLikersEnabledToggle.checked,
          title: topLikersTitleInput.value || 'Top Likes',
          maxEntries: Number(topLikersMaxEntriesInput.value) || 5,
        },
      }),
    });
    if (!response.ok) throw new Error('No se pudo guardar la configuración.');
    const data = await response.json();
    applyOverlayStateToInputs(data.state);
    reloadOverlayPreviewFrames();
    showAppAlert('Configuración del overlay guardada.', 'Overlays');
  } catch (error) {
    showAppAlert(error.message, 'Error al guardar');
  } finally {
    topLikersSaveBtn.disabled = false;
  }
}

async function saveFollowAlertConfig() {
  try {
    followAlertSaveBtn.disabled = true;
    const response = await fetch('/api/overlay/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentOverlayState,
        followAlert: {
          enabled: followAlertEnabledToggle.checked,
          durationSeconds: Number(followAlertDurationInput.value) || 5,
          sound: followAlertSoundSelect?.value || 'none',
        },
      }),
    });
    if (!response.ok) throw new Error('No se pudo guardar la configuración.');
    const data = await response.json();
    applyOverlayStateToInputs(data.state);
    reloadOverlayPreviewFrames();
    showAppAlert('Configuración del overlay guardada.', 'Overlays');
  } catch (error) {
    showAppAlert(error.message, 'Error al guardar');
  } finally {
    followAlertSaveBtn.disabled = false;
  }
}

const OVERLAY_WIDGET_LABELS = {
  giftAlert: 'alerta de regalos',
  goalBar: 'barra de meta',
  topGifters: 'top de regaladores',
  likeCounter: 'contador de likes',
  topLikers: 'top de likes',
  followAlert: 'alerta de nuevo seguidor',
  roulette: 'ruleta',
  battle: 'batalla',
};

// Regenera SOLO la key del widget indicado — los otros 4 links siguen
// funcionando igual, cada uno con su propia key independiente.
async function regenerateOverlayKey(widget) {
  const config = OVERLAY_WIDGETS[widget];
  if (!config) return;

  const confirmed = await showAppConfirm(
    `Esto invalida el link anterior de ${OVERLAY_WIDGET_LABELS[widget]} — tendrás que actualizarlo en tu software de transmisión. Los demás overlays no se ven afectados. ¿Seguro que quieres regenerarlo?`,
    'Regenerar link de overlay',
  );
  if (!confirmed) return;

  try {
    const response = await fetch('/api/overlay/regenerate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget }),
    });
    if (!response.ok) throw new Error('No se pudo regenerar el link.');
    const data = await response.json();
    currentOverlayKeys = data.overlayKeys;

    const input = config.linkInput();
    const key = currentOverlayKeys?.[widget];
    if (input && key) input.value = buildOverlayUrl(key, config.page);

    reloadOverlayPreviewFrames();
    showAppAlert('Link regenerado. Actualízalo en tu software de transmisión.', 'Overlays');
  } catch (error) {
    showAppAlert(error.message, 'Error');
  }
}

async function sendOverlayTestGift(hintEl) {
  try {
    const response = await fetch('/api/overlay/test-gift', { method: 'POST' });
    if (!response.ok) throw new Error('No se pudo enviar el regalo de prueba.');
    const data = await response.json();
    if (hintEl) hintEl.textContent = `Regalo de prueba enviado: ${data.giftName} (${data.diamondCount} monedas).`;
  } catch (error) {
    showAppAlert(error.message, 'Error');
  }
}

async function sendOverlayTestLike(hintEl) {
  try {
    const response = await fetch('/api/overlay/test-like', { method: 'POST' });
    if (!response.ok) throw new Error('No se pudieron enviar los likes de prueba.');
    const data = await response.json();
    if (hintEl) hintEl.textContent = `Likes de prueba enviados: +${data.likeCount}.`;
  } catch (error) {
    showAppAlert(error.message, 'Error');
  }
}

async function sendOverlayTestFollow(hintEl) {
  try {
    const response = await fetch('/api/overlay/test-follow', { method: 'POST' });
    if (!response.ok) throw new Error('No se pudo enviar el seguidor de prueba.');
    const data = await response.json();
    if (hintEl) hintEl.textContent = `Seguidor de prueba enviado: ${data.sender}.`;
  } catch (error) {
    showAppAlert(error.message, 'Error');
  }
}

function copyOverlayLink(inputEl, hintEl) {
  return async () => {
    if (!inputEl?.value) return;
    try {
      await navigator.clipboard.writeText(inputEl.value);
      hintEl.textContent = 'Link copiado al portapapeles.';
    } catch (_error) {
      inputEl.select();
      hintEl.textContent = 'Selecciona y copia el link manualmente (Ctrl+C).';
    }
  };
}

if (overlayCopyLinkBtn) {
  overlayCopyLinkBtn.addEventListener('click', copyOverlayLink(overlayLinkInput, overlayLinkHint));
}

if (goalBarCopyLinkBtn) {
  goalBarCopyLinkBtn.addEventListener('click', copyOverlayLink(goalBarLinkInput, goalBarLinkHint));
}

if (topGiftersCopyLinkBtn) {
  topGiftersCopyLinkBtn.addEventListener('click', copyOverlayLink(topGiftersLinkInput, topGiftersLinkHint));
}

if (likeCounterCopyLinkBtn) {
  likeCounterCopyLinkBtn.addEventListener('click', copyOverlayLink(likeCounterLinkInput, likeCounterLinkHint));
}

if (topLikersCopyLinkBtn) {
  topLikersCopyLinkBtn.addEventListener('click', copyOverlayLink(topLikersLinkInput, topLikersLinkHint));
}

if (followAlertCopyLinkBtn) {
  followAlertCopyLinkBtn.addEventListener('click', copyOverlayLink(followAlertLinkInput, followAlertLinkHint));
}

if (overlayRegenerateBtn) {
  overlayRegenerateBtn.addEventListener('click', () => regenerateOverlayKey('giftAlert'));
}

if (goalBarRegenerateBtn) {
  goalBarRegenerateBtn.addEventListener('click', () => regenerateOverlayKey('goalBar'));
}

if (topGiftersRegenerateBtn) {
  topGiftersRegenerateBtn.addEventListener('click', () => regenerateOverlayKey('topGifters'));
}

if (likeCounterRegenerateBtn) {
  likeCounterRegenerateBtn.addEventListener('click', () => regenerateOverlayKey('likeCounter'));
}

if (topLikersRegenerateBtn) {
  topLikersRegenerateBtn.addEventListener('click', () => regenerateOverlayKey('topLikers'));
}

if (followAlertRegenerateBtn) {
  followAlertRegenerateBtn.addEventListener('click', () => regenerateOverlayKey('followAlert'));
}

if (overlaySaveBtn) {
  overlaySaveBtn.addEventListener('click', saveOverlayConfig);
}

if (goalBarSaveBtn) {
  goalBarSaveBtn.addEventListener('click', saveGoalBarConfig);
}

if (topGiftersSaveBtn) {
  topGiftersSaveBtn.addEventListener('click', saveTopGiftersConfig);
}

if (likeCounterSaveBtn) {
  likeCounterSaveBtn.addEventListener('click', saveLikeCounterConfig);
}

if (topLikersSaveBtn) {
  topLikersSaveBtn.addEventListener('click', saveTopLikersConfig);
}

if (followAlertSaveBtn) {
  followAlertSaveBtn.addEventListener('click', saveFollowAlertConfig);
}

if (overlayTestGiftBtn) {
  overlayTestGiftBtn.addEventListener('click', async () => {
    overlayTestGiftBtn.disabled = true;
    await sendOverlayTestGift(overlayLinkHint);
    overlayTestGiftBtn.disabled = false;
  });
}

if (goalBarTestGiftBtn) {
  goalBarTestGiftBtn.addEventListener('click', async () => {
    goalBarTestGiftBtn.disabled = true;
    await sendOverlayTestGift(goalBarLinkHint);
    goalBarTestGiftBtn.disabled = false;
  });
}

if (topGiftersTestGiftBtn) {
  topGiftersTestGiftBtn.addEventListener('click', async () => {
    topGiftersTestGiftBtn.disabled = true;
    await sendOverlayTestGift(topGiftersLinkHint);
    topGiftersTestGiftBtn.disabled = false;
  });
}

if (likeCounterTestBtn) {
  likeCounterTestBtn.addEventListener('click', async () => {
    likeCounterTestBtn.disabled = true;
    await sendOverlayTestLike(likeCounterLinkHint);
    likeCounterTestBtn.disabled = false;
  });
}

if (topLikersTestBtn) {
  topLikersTestBtn.addEventListener('click', async () => {
    topLikersTestBtn.disabled = true;
    await sendOverlayTestLike(topLikersLinkHint);
    topLikersTestBtn.disabled = false;
  });
}

if (followAlertTestBtn) {
  followAlertTestBtn.addEventListener('click', async () => {
    followAlertTestBtn.disabled = true;
    await sendOverlayTestFollow(followAlertLinkHint);
    followAlertTestBtn.disabled = false;
  });
}

if (goalBarResetBtn) {
  goalBarResetBtn.addEventListener('click', async () => {
    const confirmed = await showAppConfirm('¿Reiniciar el progreso de la barra de meta a 0?', 'Reiniciar progreso');
    if (!confirmed) return;
    try {
      const response = await fetch('/api/overlay/goal-bar/reset', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo reiniciar el progreso.');
      const data = await response.json();
      applyOverlayStateToInputs(data.state);
      showAppAlert('Progreso reiniciado.', 'Overlays');
    } catch (error) {
      showAppAlert(error.message, 'Error');
    }
  });
}

if (topGiftersResetBtn) {
  topGiftersResetBtn.addEventListener('click', async () => {
    const confirmed = await showAppConfirm('¿Reiniciar el ranking de top de regaladores?', 'Reiniciar ranking');
    if (!confirmed) return;
    try {
      const response = await fetch('/api/overlay/top-gifters/reset', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo reiniciar el ranking.');
      const data = await response.json();
      applyOverlayStateToInputs(data.state);
      showAppAlert('Ranking reiniciado.', 'Overlays');
    } catch (error) {
      showAppAlert(error.message, 'Error');
    }
  });
}

if (likeCounterResetBtn) {
  likeCounterResetBtn.addEventListener('click', async () => {
    const confirmed = await showAppConfirm('¿Reiniciar el contador de likes a 0?', 'Reiniciar contador');
    if (!confirmed) return;
    try {
      const response = await fetch('/api/overlay/like-counter/reset', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo reiniciar el contador.');
      const data = await response.json();
      applyOverlayStateToInputs(data.state);
      showAppAlert('Contador reiniciado.', 'Overlays');
    } catch (error) {
      showAppAlert(error.message, 'Error');
    }
  });
}

if (topLikersResetBtn) {
  topLikersResetBtn.addEventListener('click', async () => {
    const confirmed = await showAppConfirm('¿Reiniciar el ranking de top de likes?', 'Reiniciar ranking');
    if (!confirmed) return;
    try {
      const response = await fetch('/api/overlay/top-likers/reset', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo reiniciar el ranking.');
      const data = await response.json();
      applyOverlayStateToInputs(data.state);
      showAppAlert('Ranking reiniciado.', 'Overlays');
    } catch (error) {
      showAppAlert(error.message, 'Error');
    }
  });
}

function makeModalToggle(toggleEl, modalEl) {
  function open() {
    if (!modalEl) return;
    modalEl.hidden = false;
  }
  function close() {
    if (!modalEl) return;
    modalEl.hidden = true;
  }

  if (toggleEl) {
    toggleEl.addEventListener('click', open);
    toggleEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  }

  if (modalEl) {
    modalEl.addEventListener('click', (event) => {
      if (event.target === modalEl) close();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalEl && !modalEl.hidden) close();
  });

  return { open, close };
}

// Popover de la tarjeta de usuario, al fondo del sidebar: mismo click-fuera
// / Escape para cerrar que los modales, pero se abre/cierra con el mismo
// boton (toggle) en vez de un boton de cierre dedicado.
function setupUserMenuPopover() {
  if (!userMenuToggle || !userMenuPopover) return null;

  function open() {
    userMenuPopover.hidden = false;
    userMenuToggle.setAttribute('aria-expanded', 'true');
  }

  function close() {
    userMenuPopover.hidden = true;
    userMenuToggle.setAttribute('aria-expanded', 'false');
  }

  userMenuToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (userMenuPopover.hidden) open();
    else close();
  });

  document.addEventListener('click', (event) => {
    if (userMenuPopover.hidden) return;
    if (userMenuPopover.contains(event.target) || userMenuToggle.contains(event.target)) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !userMenuPopover.hidden) close();
  });

  const accountMenuItem = userMenuPopover.querySelector('[data-section="accountSection"]');
  if (accountMenuItem) {
    accountMenuItem.addEventListener('click', () => {
      showSection('accountSection');
      close();
    });
  }

  return { open, close };
}

const userMenuControls = setupUserMenuPopover();

const overlayModalControls = makeModalToggle(overlayCardToggle, overlayConfigModal);
if (overlayConfigCloseBtn) overlayConfigCloseBtn.addEventListener('click', overlayModalControls.close);

const goalBarModalControls = makeModalToggle(goalBarCardToggle, goalBarConfigModal);
if (goalBarConfigCloseBtn) goalBarConfigCloseBtn.addEventListener('click', goalBarModalControls.close);

const topGiftersModalControls = makeModalToggle(topGiftersCardToggle, topGiftersConfigModal);
if (topGiftersConfigCloseBtn) topGiftersConfigCloseBtn.addEventListener('click', topGiftersModalControls.close);

const likeCounterModalControls = makeModalToggle(likeCounterCardToggle, likeCounterConfigModal);
if (likeCounterConfigCloseBtn) likeCounterConfigCloseBtn.addEventListener('click', likeCounterModalControls.close);

const topLikersModalControls = makeModalToggle(topLikersCardToggle, topLikersConfigModal);
if (topLikersConfigCloseBtn) topLikersConfigCloseBtn.addEventListener('click', topLikersModalControls.close);

const followAlertModalControls = makeModalToggle(followAlertCardToggle, followAlertConfigModal);
if (followAlertConfigCloseBtn) followAlertConfigCloseBtn.addEventListener('click', followAlertModalControls.close);

if (overlayDurationInput) {
  overlayDurationInput.addEventListener('input', () => {
    overlayDurationValue.textContent = `${overlayDurationInput.value}s`;
  });
}

if (followAlertDurationInput) {
  followAlertDurationInput.addEventListener('input', () => {
    followAlertDurationValue.textContent = `${followAlertDurationInput.value}s`;
  });
}

if (overlaySoundPreviewBtn) {
  overlaySoundPreviewBtn.addEventListener('click', () => {
    window.playOverlaySound?.(overlaySoundSelect?.value);
  });
}

if (followAlertSoundPreviewBtn) {
  followAlertSoundPreviewBtn.addEventListener('click', () => {
    window.playOverlaySound?.(followAlertSoundSelect?.value);
  });
}

if (topGiftersMaxEntriesInput) {
  topGiftersMaxEntriesInput.addEventListener('input', () => {
    topGiftersMaxEntriesValue.textContent = topGiftersMaxEntriesInput.value;
  });
}

if (topLikersMaxEntriesInput) {
  topLikersMaxEntriesInput.addEventListener('input', () => {
    topLikersMaxEntriesValue.textContent = topLikersMaxEntriesInput.value;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return 'Sin fecha';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return date.toLocaleString('es-ES');
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;

  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

  const totalMinutes = Math.round((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

const STATS_DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23ffffff" opacity="0.25"/></svg>',
);

const STATS_ICONS = {
  coin: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M10 6.2v7.6M12.2 8.2c-.4-.7-1.2-1.1-2.2-1.1-1.2 0-2.2.6-2.2 1.6 0 2.2 4.4.9 4.4 3.1 0 1-1 1.6-2.2 1.6-1 0-1.9-.4-2.3-1.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  heart: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 16.5s-6-3.6-6-8.1A3.4 3.4 0 0 1 10 6.3a3.4 3.4 0 0 1 6 2.1c0 4.5-6 8.1-6 8.1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  follow: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8" cy="7" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 16.5c.8-2.8 2.8-4.2 5.5-4.2s4.7 1.4 5.5 4.2M15.5 6v5M13 8.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4.2l2.6 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  live: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="1.8" stroke="currentColor" stroke-width="1.6"/><path d="M13.8 6.2a5.4 5.4 0 0 1 0 7.6M6.2 13.8a5.4 5.4 0 0 1 0-7.6M16.4 3.6a9 9 0 0 1 0 12.8M3.6 16.4a9 9 0 0 1 0-12.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

function renderStatsTopGroup(kind, label, entries, amountField, amountLabel) {
  const top = Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
  if (!top) return '';

  const avatar = top.avatar || STATS_DEFAULT_AVATAR;
  const amount = Number(top[amountField] || 0).toLocaleString('es');

  // Nada de onerror="..." inline: el CSP del sitio bloquea los atributos de
  // evento en HTML (script-src-attr 'none'), aunque scriptSrc permita
  // 'unsafe-inline' para bloques <script>. El respaldo se maneja con un solo
  // listener delegado en el contenedor (ver loadStreamStats).
  return `
    <div class="stats-top-group stats-top-group--${kind}">
      <img src="${escapeHtml(avatar)}" data-fallback-avatar="${escapeHtml(STATS_DEFAULT_AVATAR)}" alt="" />
      <span class="stats-top-text">
        <small>${label}</small>
        <strong>${escapeHtml(top.nickname)}</strong>
      </span>
      <span class="stats-top-amount">${amount} ${amountLabel}</span>
    </div>
  `;
}

function renderStatsMetric(kind, icon, value, label) {
  return `
    <div class="stats-metric stats-metric--${kind}">
      <span class="stats-metric-icon">${STATS_ICONS[icon]}</span>
      <span class="stats-metric-value">${Number(value || 0).toLocaleString('es')}</span>
      <span class="stats-metric-label">${label}</span>
    </div>
  `;
}

function renderStatsSession(session) {
  const duration = formatDuration(session.started_at, session.ended_at);
  const tops = [
    renderStatsTopGroup('gifter', 'Top regalador', session.top_gifters, 'coins', 'monedas'),
    renderStatsTopGroup('liker', 'Top like', session.top_likers, 'likes', 'likes'),
  ].join('');

  return `
    <article class="stats-session-card">
      <header class="stats-session-header">
        <div>
          <strong>${formatDate(session.ended_at)}</strong>
          ${session.tiktok_username ? `<span class="muted">@${escapeHtml(session.tiktok_username)}</span>` : ''}
        </div>
        ${duration ? `<span class="stats-duration">${STATS_ICONS.clock}${duration}</span>` : ''}
      </header>

      <div class="stats-session-metrics">
        ${renderStatsMetric('coins', 'coin', session.total_coins, 'Monedas')}
        ${renderStatsMetric('likes', 'heart', session.total_likes, 'Likes')}
        ${renderStatsMetric('follows', 'follow', session.new_followers, 'Nuevos seguidores')}
      </div>

      ${tops.trim()
        ? `<div class="stats-session-top">${tops}</div>`
        : '<p class="stats-no-top">Nadie destacó con regalos ni likes en este live.</p>'}
    </article>
  `;
}

function syncStatsPager() {
  if (!statsSessionsList || !statsPager) return;

  const total = statsSessionsList.querySelectorAll('.stats-session-card').length;
  statsPager.hidden = total < 2;
  if (total < 2) return;

  const height = statsSessionsList.clientHeight || 1;
  const index = Math.min(total - 1, Math.max(0, Math.round(statsSessionsList.scrollTop / height)));
  if (statsPagerLabel) statsPagerLabel.textContent = `${index + 1} / ${total}`;
  if (statsPrevBtn) statsPrevBtn.disabled = index === 0;
  if (statsNextBtn) statsNextBtn.disabled = index === total - 1;
}

async function loadStreamStats() {
  if (!statsSessionsList) return;

  statsSessionsList.innerHTML = '<p class="muted loading-row"><span class="pt-orbit pt-orbit--sm"><i><b></b></i><i><b></b></i></span> Cargando lives...</p>';
  syncStatsPager();

  try {
    const response = await fetch('/api/stream-stats');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el resumen de transmisiones.');

    const sessions = (Array.isArray(data.sessions) ? data.sessions : []).slice(0, 3);
    if (sessions.length === 0) {
      statsSessionsList.innerHTML = `
        <div class="acc-empty">
          ${STATS_ICONS.live}
          <strong>Aún no hay lives guardados</strong>
          <span>En cuanto termines tu próximo live, el resumen aparece aquí.</span>
        </div>
      `;
      syncStatsPager();
      return;
    }

    statsSessionsList.innerHTML = sessions.map(renderStatsSession).join('');
    statsSessionsList.scrollTop = 0;
    syncStatsPager();
  } catch (error) {
    statsSessionsList.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    syncStatsPager();
  }
}

async function showAlert(message, title = 'Aviso') {
  if (window.showAppAlert) {
    return window.showAppAlert(message, title);
  }

  window.alert(message);
  return undefined;
}

async function showConfirm(message, title = 'Confirmacion', confirmText = 'Aceptar', cancelText = 'Cancelar') {
  if (window.showAppConfirm) {
    return window.showAppConfirm(message, title, confirmText, cancelText);
  }

  return window.confirm(message);
}

function normalizeConnections(connections = {}) {
  return Object.entries(GAME_LABELS).map(([gameType, label]) => {
    const connection = connections[gameType] || null;

    return {
      gameType,
      label,
      tiktokUsername: connection?.tiktokUsername || connection?.tiktok_username || '',
      isLinked: Boolean(connection?.isLinked ?? connection?.is_linked),
      linkedAt: connection?.linkedAt || connection?.linked_at || null,
    };
  });
}

function renderEditConnections(connections = {}) {
  adminEditConnections.innerHTML = normalizeConnections(connections)
    .map((connection) => {
      const linkedAt = connection.linkedAt ? `Vinculado: ${escapeHtml(formatDate(connection.linkedAt))}` : 'Sin fecha de vinculacion';

      return `
        <label class="admin-connection-edit">
          <span>${escapeHtml(connection.label)}</span>
          <input
            type="text"
            value="${escapeHtml(connection.tiktokUsername)}"
            placeholder="@usuario_tiktok"
            data-game-type="${escapeHtml(connection.gameType)}"
          />
          <small>${connection.isLinked ? 'Activo' : 'No activo'} - ${linkedAt}</small>
        </label>
      `;
    })
    .join('');
}

function formatAdminMoney(amountCents, currency) {
  const amount = Number(amountCents || 0) / 100;
  if (currency === 'COP') {
    return `$${amount.toLocaleString('es-CO')} COP`;
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

const ADMIN_GATEWAY_LABELS = { stripe: 'Stripe', mercadopago: 'MercadoPago', wompi: 'Wompi' };

// Iconos inline (mismo lenguaje visual que .info-icon svg en la landing:
// viewBox 24x24, stroke currentColor 1.7, sin relleno) — los botones de la
// tarjeta de admin son solo-icono, el texto vive en title/aria-label.
const ADMIN_ICONS = {
  edit: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 20h4L18.5 9.5a2.121 2.121 0 00-3-3L5 17v3z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 9.5h17M8 3v3M16 3v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 13v2.6l1.8 1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.3" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="8" r="0.9" fill="currentColor"/></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2M7 7l1 12.5A1.5 1.5 0 009.5 21h5a1.5 1.5 0 001.5-1.5L17 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function renderAdminUserPlanInfo(user) {
  const access = user.access || {};
  const verifiedBadge = user.email_verified
    ? '<span class="admin-badge admin-badge-success">Correo verificado</span>'
    : '<span class="admin-badge admin-badge-warning">Correo sin verificar</span>';

  let accessBadge;
  if (access.hasAccess && access.isTrial) {
    accessBadge = '<span class="admin-badge admin-badge-info">Prueba gratuita activa</span>';
  } else if (access.hasAccess) {
    accessBadge = '<span class="admin-badge admin-badge-success">Acceso activo</span>';
  } else if (access.accessExpiresAt) {
    accessBadge = '<span class="admin-badge admin-badge-danger">Acceso vencido</span>';
  } else {
    accessBadge = '<span class="admin-badge admin-badge-muted">Sin acceso</span>';
  }

  const registeredLine = `<p class="admin-user-info">Registrado: ${escapeHtml(formatDate(user.created_at))}</p>`;

  const expiresLine = access.accessExpiresAt
    ? `<p class="admin-user-info">Vence: ${escapeHtml(formatDate(access.accessExpiresAt))}</p>`
    : '';

  const lastPayment = user.lastPayment;
  const lastPaymentLine = lastPayment
    ? `<p class="admin-user-info">Ultima compra: <strong>${escapeHtml(lastPayment.plan_name)}</strong> por ${formatAdminMoney(lastPayment.amount_cents, lastPayment.currency)} via ${ADMIN_GATEWAY_LABELS[lastPayment.gateway] || escapeHtml(lastPayment.gateway)} (${escapeHtml(formatDate(lastPayment.paid_at))})</p>`
    : '<p class="admin-user-info">Sin compras registradas.</p>';

  const paidCountLine = `<p class="admin-user-info">Pagos completados: ${user.paidPaymentsCount || 0}</p>`;

  return `
    <div class="admin-user-plan-info">
      <div class="admin-user-badges">
        ${accessBadge}
        ${verifiedBadge}
      </div>
      ${registeredLine}
      ${expiresLine}
      ${lastPaymentLine}
      ${paidCountLine}
    </div>
  `;
}

function renderAdminUsers() {
  const filteredUsers = adminEmailFilter
    ? adminUsers.filter((user) => String(user.email || '').toLowerCase().includes(adminEmailFilter))
    : adminUsers;

  adminUsersMeta.textContent = adminEmailFilter
    ? `${filteredUsers.length} coincidencia(s) de ${adminUsers.length} cuenta(s).`
    : `${adminUsers.length} cuenta(s) registrada(s).`;

  if (adminUsers.length === 0) {
    adminUsersList.innerHTML = '<div class="admin-user-card muted">No hay cuentas registradas.</div>';
    return;
  }

  if (filteredUsers.length === 0) {
    adminUsersList.innerHTML = '<div class="admin-user-card muted">No hay cuentas que coincidan con ese correo.</div>';
    return;
  }

  adminUsersList.innerHTML = adminUsers
    .filter((user) => filteredUsers.includes(user))
    .map((user) => `
      <article class="admin-user-card" data-user-id="${user.id}">
        <div class="admin-user-top">
          <div>
            <h3 class="admin-user-name">${escapeHtml(user.name)}</h3>
            <p class="admin-user-email">${escapeHtml(user.email)}</p>
          </div>
          <div class="admin-user-actions">
            <button class="btn icon-btn secondary edit-user" type="button" title="Editar cuenta" aria-label="Editar cuenta">${ADMIN_ICONS.edit}</button>
            <button class="btn icon-btn secondary manage-plan" type="button" title="Administrar plan" aria-label="Administrar plan">${ADMIN_ICONS.plan}</button>
            <button class="btn icon-btn secondary account-info" type="button" title="Información de la cuenta" aria-label="Información de la cuenta">${ADMIN_ICONS.info}</button>
            <button class="btn icon-btn danger delete-user" type="button" title="Eliminar cuenta" aria-label="Eliminar cuenta">${ADMIN_ICONS.delete}</button>
          </div>
        </div>
      </article>
    `)
    .join('');

  adminUsersList.querySelectorAll('[data-user-id]').forEach((card) => {
    const userId = Number(card.getAttribute('data-user-id'));

    card.querySelector('.edit-user').addEventListener('click', () => {
      openEditModal(userId);
    });

    card.querySelector('.manage-plan').addEventListener('click', () => {
      openPlanModal(userId);
    });

    card.querySelector('.account-info').addEventListener('click', () => {
      openInfoModal(userId);
    });

    card.querySelector('.delete-user').addEventListener('click', () => {
      deleteAdminUser(userId);
    });
  });
}

async function loadAdminUsers({ force = false } = {}) {
  if (!currentUser?.isSuperUser || (adminUsersLoaded && !force)) {
    return;
  }

  setupAdminSearch();
  adminUsersMeta.innerHTML = '<span class="pt-orbit pt-orbit--sm"><i><b></b></i><i><b></b></i></span> Cargando cuentas...';
  adminUsersMeta.classList.add('loading-row');
  adminUsersList.innerHTML = '';
  if (refreshUsersBtn) refreshUsersBtn.disabled = true;

  try {
    const response = await fetch('/api/admin/users');
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo cargar la lista de cuentas.');
    }

    adminUsers = Array.isArray(data.users) ? data.users : [];
    adminUsersLoaded = true;
    renderAdminUsers();
  } catch (error) {
    adminUsersMeta.textContent = 'No se pudo cargar la lista de cuentas.';
    adminUsersList.innerHTML = '';
    await showAlert(error.message, 'Error');
  } finally {
    if (refreshUsersBtn) refreshUsersBtn.disabled = false;
  }
}

function openEditModal(userId) {
  setupAdminEditModal();
  const user = adminUsers.find((item) => item.id === userId);
  if (!user) return;

  adminEditUserId.value = String(user.id);
  adminEditName.value = user.name || '';
  adminEditEmail.value = user.email || '';
  if (adminEditAccountName) adminEditAccountName.textContent = user.name || '-';
  if (adminEditAccountEmail) adminEditAccountEmail.textContent = user.email || '-';
  renderEditConnections(user.tiktokConnections);
  adminEditModal.hidden = false;
  const firstConnectionInput = adminEditConnections.querySelector('input[data-game-type]');
  if (firstConnectionInput) {
    firstConnectionInput.focus();
    firstConnectionInput.select();
  }
}

function closeEditModal() {
  adminEditModal.hidden = true;
  adminEditForm.reset();
  adminEditUserId.value = '';
  adminEditConnections.innerHTML = '';
}

async function saveEditedUser(event) {
  event.preventDefault();

  const userId = Number(adminEditUserId.value);
  const payload = {
    tiktokConnections: {},
  };

  adminEditConnections.querySelectorAll('input[data-game-type]').forEach((input) => {
    payload.tiktokConnections[input.dataset.gameType] = input.value.trim();
  });

  if (!userId) {
    await showAlert('No se encontro la cuenta a editar.', 'Cuenta no encontrada');
    return;
  }

  adminEditSaveBtn.disabled = true;
  adminEditSaveBtn.textContent = 'Guardando...';

  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo actualizar la cuenta.');
    }

    adminUsers = adminUsers.map((user) => (user.id === userId ? data.user : user));
    renderAdminUsers();

    closeEditModal();
    await showAlert('TikTok vinculados actualizados correctamente.', 'Cuenta actualizada');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    adminEditSaveBtn.disabled = false;
    adminEditSaveBtn.textContent = 'Guardar cambios';
  }
}

async function deleteAdminUser(userId) {
  const user = adminUsers.find((item) => item.id === userId);
  if (!user) return;

  const confirmed = await showConfirm(
    '¿estas seguro que deseas eliminar esta cuenta de la plataforma?',
    'Eliminar cuenta',
    'Aceptar',
    'Cancelar',
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo eliminar la cuenta.');
    }

    adminUsers = adminUsers.filter((item) => item.id !== userId);
    renderAdminUsers();

    if (currentUser?.id === userId) {
      redirectWithLog('/login.html', 'La cuenta actual fue eliminada');
      return;
    }

    await showAlert(`La cuenta de ${user.name} fue eliminada.`, 'Cuenta eliminada');
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

function formatAdminPlanStatus(access) {
  if (!access) return 'Sin acceso.';
  if (access.hasAccess && access.isTrial) {
    return `Prueba gratuita activa — vence el ${formatDate(access.accessExpiresAt)}.`;
  }
  if (access.hasAccess) {
    return `Plan activo — vence el ${formatDate(access.accessExpiresAt)}.`;
  }
  if (access.accessExpiresAt) {
    return `Acceso vencido el ${formatDate(access.accessExpiresAt)}.`;
  }
  return 'Sin acceso ni prueba activa.';
}

function openPlanModal(userId) {
  const user = adminUsers.find((item) => item.id === userId);
  if (!user) return;

  adminPlanUserId.value = String(user.id);
  if (adminPlanUserName) adminPlanUserName.textContent = user.name || '-';
  if (adminPlanUserEmail) adminPlanUserEmail.textContent = user.email || '-';
  if (adminPlanCurrentStatus) adminPlanCurrentStatus.textContent = formatAdminPlanStatus(user.access);
  if (adminPlanAddDays) adminPlanAddDays.value = '0';
  if (adminPlanAddHours) adminPlanAddHours.value = '0';
  if (adminPlanSubtractDays) adminPlanSubtractDays.value = '0';
  if (adminPlanSubtractHours) adminPlanSubtractHours.value = '0';

  adminPlanModal.hidden = false;
  if (adminPlanAddDays) {
    adminPlanAddDays.focus();
    adminPlanAddDays.select();
  }
}

function closePlanModal() {
  adminPlanModal.hidden = true;
  adminPlanAddForm.reset();
  if (adminPlanSubtractForm) adminPlanSubtractForm.reset();
  adminPlanUserId.value = '';
}

function openInfoModal(userId) {
  const user = adminUsers.find((item) => item.id === userId);
  if (!user || !adminInfoModal) return;

  if (adminInfoContent) adminInfoContent.innerHTML = renderAdminUserPlanInfo(user);
  adminInfoModal.hidden = false;
}

function closeInfoModal() {
  if (adminInfoModal) adminInfoModal.hidden = true;
}

async function addAccessTimeToUser(event) {
  event.preventDefault();

  const userId = Number(adminPlanUserId.value);
  const days = Number(adminPlanAddDays.value) || 0;
  const hours = Number(adminPlanAddHours.value) || 0;

  if (!userId) {
    await showAlert('No se encontro la cuenta.', 'Cuenta no encontrada');
    return;
  }

  if (days <= 0 && hours <= 0) {
    await showAlert('Ingresa al menos un dia o una hora para agregar.', 'Cantidad invalida');
    return;
  }

  adminPlanAddBtn.disabled = true;
  adminPlanAddBtn.textContent = 'Agregando...';

  try {
    const response = await fetch(`/api/admin/users/${userId}/access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, hours }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo agregar tiempo al plan.');
    }

    adminUsers = adminUsers.map((user) => (user.id === userId ? data.user : user));
    renderAdminUsers();
    if (adminPlanCurrentStatus) adminPlanCurrentStatus.textContent = formatAdminPlanStatus(data.user.access);
    if (adminPlanAddDays) adminPlanAddDays.value = '0';
    if (adminPlanAddHours) adminPlanAddHours.value = '0';

    await showAlert('Tiempo agregado correctamente.', 'Plan actualizado');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    adminPlanAddBtn.disabled = false;
    adminPlanAddBtn.textContent = 'Agregar tiempo';
  }
}

async function subtractAccessTimeFromUser(event) {
  event.preventDefault();

  const userId = Number(adminPlanUserId.value);
  const days = Number(adminPlanSubtractDays.value) || 0;
  const hours = Number(adminPlanSubtractHours.value) || 0;

  if (!userId) {
    await showAlert('No se encontro la cuenta.', 'Cuenta no encontrada');
    return;
  }

  if (days <= 0 && hours <= 0) {
    await showAlert('Ingresa al menos un dia o una hora para quitar.', 'Cantidad invalida');
    return;
  }

  adminPlanSubtractBtn.disabled = true;
  adminPlanSubtractBtn.textContent = 'Quitando...';

  try {
    const response = await fetch(`/api/admin/users/${userId}/access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, hours }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo quitar tiempo del plan.');
    }

    adminUsers = adminUsers.map((user) => (user.id === userId ? data.user : user));
    renderAdminUsers();
    if (adminPlanCurrentStatus) adminPlanCurrentStatus.textContent = formatAdminPlanStatus(data.user.access);
    if (adminPlanSubtractDays) adminPlanSubtractDays.value = '0';
    if (adminPlanSubtractHours) adminPlanSubtractHours.value = '0';

    await showAlert('Tiempo quitado correctamente.', 'Plan actualizado');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    adminPlanSubtractBtn.disabled = false;
    adminPlanSubtractBtn.textContent = 'Quitar tiempo';
  }
}

async function revokeAccessFromUser() {
  const userId = Number(adminPlanUserId.value);
  const user = adminUsers.find((item) => item.id === userId);
  if (!user) return;

  const confirmed = await showConfirm(
    `¿Seguro que quieres quitarle el plan completo a ${user.name}? Perderá el acceso de inmediato, sin importar cuanto tiempo le quedara.`,
    'Quitar plan por completo',
    'Quitar plan',
    'Cancelar',
  );

  if (!confirmed) return;

  adminPlanRevokeBtn.disabled = true;
  adminPlanRevokeBtn.textContent = 'Quitando...';

  try {
    const response = await fetch(`/api/admin/users/${userId}/access`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo quitar el plan.');
    }

    adminUsers = adminUsers.map((item) => (item.id === userId ? data.user : item));
    renderAdminUsers();
    if (adminPlanCurrentStatus) adminPlanCurrentStatus.textContent = formatAdminPlanStatus(data.user.access);

    await showAlert(`Se le quitó el plan a ${user.name}.`, 'Plan actualizado');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    adminPlanRevokeBtn.disabled = false;
    adminPlanRevokeBtn.textContent = 'Quitar plan a esta cuenta';
  }
}

async function loadMe() {
  console.log('Verificando autenticacion...');
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include',
    });

    console.log('Respuesta de /api/auth/me:', response.status, response.statusText);

    if (!response.ok) {
      console.log('Autenticacion fallida, redirigiendo a login');
      redirectWithLog('/login.html', 'Usuario no autenticado en /api/auth/me');
      return;
    }

    const data = await response.json();
    currentUser = data.user || null;

    console.log('Autenticacion exitosa:', currentUser?.email);
    userName.textContent = currentUser?.name || '-';
    userEmail.textContent = currentUser?.email || '-';
    renderAccountProfile();
    if (sidebarUserName) sidebarUserName.textContent = currentUser?.name || '-';
    if (sidebarUserPlan && currentUser?.isSuperUser) sidebarUserPlan.textContent = 'Superusuario';

    if (currentUser?.isSuperUser) {
      adminNavItem.classList.remove('hidden');
    } else {
      adminNavItem.classList.add('hidden');
      if (!document.getElementById('adminSection')?.classList.contains('hidden')) {
        showSection('gamesSection');
      }
    }

    await loadGameAvailability();
    await loadAccessStatus();
    await loadPlans();
    await restoreGamesTiktokConnection();
    restoreSectionFromHash();

    // El loader se oculta ANTES de handlePaymentRedirectParams() a proposito:
    // esa funcion puede mostrar un dialogo (showAlert, z-index 4000) que
    // queda tapado por el loader de pantalla completa (z-index 9999) si
    // sigue visible — el usuario nunca puede hacerle click a "Entendido" y
    // la pantalla se ve trabada en "cargando" para siempre.
    document.getElementById('pageLoader')?.setAttribute('hidden', '');

    await handlePaymentRedirectParams();
  } catch (_error) {
    console.log('Error al verificar autenticacion:', _error);
    redirectWithLog('/login.html', 'Error al cargar datos de usuario');
  }
}

async function handleChangePassword(event) {
  event.preventDefault();

  const currentPassword = currentPasswordInput?.value || '';
  const newPassword = newPasswordInput?.value || '';
  const confirmNewPassword = confirmNewPasswordInput?.value || '';

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    await showAlert('Completa todos los campos de contraseña.', 'Faltan datos');
    return;
  }

  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) {
    await showAlert(strengthError, 'Contraseña invalida');
    return;
  }

  if (newPassword !== confirmNewPassword) {
    await showAlert('La nueva contraseña y su repeticion no coinciden.', 'Contraseñas diferentes');
    return;
  }

  if (newPassword === currentPassword) {
    await showAlert('La nueva contraseña debe ser diferente a la actual.', 'Contraseña repetida');
    return;
  }

  if (changePasswordBtn) {
    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = 'Actualizando...';
  }

  try {
    const response = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo actualizar la contraseña.');
    }

    changePasswordForm.reset();
    await showAlert('La contraseña se actualizo correctamente.', 'Contraseña actualizada');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    if (changePasswordBtn) {
      changePasswordBtn.disabled = false;
      changePasswordBtn.textContent = 'Actualizar contraseña';
    }
  }
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showSection(button.dataset.section);
  });
});

document.querySelectorAll('.game-card a.start-btn').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
    }
  });
});

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  const label = logoutBtn.querySelector('.logout-btn-label');
  if (label) label.textContent = 'Cerrando...';

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    redirectWithLog('/login.html', 'Logout exitoso');
  }
});

if (refreshUsersBtn) {
  refreshUsersBtn.addEventListener('click', () => {
    loadAdminUsers({ force: true });
  });
}

if (adminEditForm) {
  adminEditForm.addEventListener('submit', saveEditedUser);
}

[adminEditCloseBtn, adminEditCancelBtn].forEach((button) => {
  if (button) {
    button.addEventListener('click', closeEditModal);
  }
});

if (adminEditModal) {
  adminEditModal.addEventListener('click', (event) => {
    if (event.target === adminEditModal) {
      closeEditModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && adminEditModal && !adminEditModal.hidden) {
    closeEditModal();
  }
  if (event.key === 'Escape' && adminPlanModal && !adminPlanModal.hidden) {
    closePlanModal();
  }
  if (event.key === 'Escape' && adminInfoModal && !adminInfoModal.hidden) {
    closeInfoModal();
  }
});

if (adminPlanAddForm) {
  adminPlanAddForm.addEventListener('submit', addAccessTimeToUser);
}

if (adminPlanSubtractForm) {
  adminPlanSubtractForm.addEventListener('submit', subtractAccessTimeFromUser);
}

if (adminPlanRevokeBtn) {
  adminPlanRevokeBtn.addEventListener('click', revokeAccessFromUser);
}

if (adminPlanCloseBtn) {
  adminPlanCloseBtn.addEventListener('click', closePlanModal);
}

if (adminPlanModal) {
  adminPlanModal.addEventListener('click', (event) => {
    if (event.target === adminPlanModal) {
      closePlanModal();
    }
  });
}

if (adminInfoCloseBtn) {
  adminInfoCloseBtn.addEventListener('click', closeInfoModal);
}

if (adminInfoModal) {
  adminInfoModal.addEventListener('click', (event) => {
    if (event.target === adminInfoModal) {
      closeInfoModal();
    }
  });
}

if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', handleChangePassword);
}

loadMe();
