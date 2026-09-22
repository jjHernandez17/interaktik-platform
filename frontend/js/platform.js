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
  let collapsed = false;
  try {
    collapsed = window.localStorage.getItem('interaktik.sidebarCollapsed') === '1';
  } catch (_error) {
    collapsed = false;
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

let overlayKeyLoaded = false;

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
  } catch (error) {
    console.warn('[PLATFORM] Access status unavailable:', error.message);
  }
}

// Mapa minimo region -> moneda, para estimar en que moneda mostrar el precio
// segun el idioma/region del navegador. Es solo para mostrar un estimado: el
// cobro real de Wompi siempre es en COP, sin importar lo que se muestre aqui.
const REGION_TO_CURRENCY = {
  CO: 'COP', US: 'USD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', PE: 'PEN',
  EC: 'USD', VE: 'USD', UY: 'USD', PY: 'USD', BO: 'USD', GB: 'GBP', CA: 'CAD',
  ES: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR',
};

function detectUserCurrency() {
  try {
    const locale = navigator.language || navigator.languages?.[0] || 'en-US';
    const region = locale.split('-')[1]?.toUpperCase();
    return REGION_TO_CURRENCY[region] || 'USD';
  } catch (_error) {
    return 'USD';
  }
}

function formatPrice(amount, currency) {
  try {
    return new Intl.NumberFormat(navigator.language || 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: currency === 'COP' ? 0 : 2,
    }).format(amount);
  } catch (_error) {
    return `${currency || 'USD'} ${Number(amount || 0).toFixed(2)}`;
  }
}

// Beneficios y estilo por plan — los planes en si (nombre/precio/duracion)
// vienen del backend, pero los puntos de venta y el acento de color son
// puramente de presentacion, asi que se definen aca en vez de agregar
// columnas nuevas a la tabla `plans`.
const PLAN_BENEFITS = {
  pass_2d: [
    'Acceso completo a todos los juegos por 2 dias',
    'Sin limite de partidas ni espectadores',
    'Ideal para probar la plataforma antes de un live grande',
  ],
  monthly: [
    'Acceso completo a todos los juegos por 30 dias',
    'Overlays personalizables para OBS incluidos',
    'Soporte prioritario por Discord',
    'Cancela cuando quieras',
  ],
  yearly: [
    'Acceso completo a todos los juegos por 1 año',
    'Overlays personalizables para OBS incluidos',
    'El precio mas bajo por mes de todos los planes',
    'Soporte prioritario por Discord',
  ],
};

const PLAN_ACCENTS = {
  pass_2d: 'cyan',
  monthly: 'violet',
  yearly: 'gold',
};

const PLAN_POPULAR_ID = 'yearly';

// Precio "ancla" tachado junto al precio real — tactica clasica de "antes
// $X, ahora $Y". El descuento es puramente de presentacion (el cobro real
// via Wompi siempre es el precio actual del plan, nunca el tachado).
const PLAN_DISCOUNT_PERCENT = {
  pass_2d: 50,
  monthly: 50,
  yearly: 50,
};

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
    const copPrice = formatPrice(Number(plan.price_cop_cents || 0) / 100, 'COP');
    const mainPrice = plan.display
      ? formatPrice(plan.display.amount, plan.display.currency)
      : formatPrice(Number(plan.price_usd_cents || 0) / 100, 'USD');
    const showUsdHint = plan.display && plan.display.currency !== 'USD';
    const usdHint = showUsdHint ? `<p class="plan-price-hint">≈ ${formatPrice(Number(plan.price_usd_cents || 0) / 100, 'USD')}</p>` : '';

    const accent = PLAN_ACCENTS[plan.id] || 'violet';
    const isPopular = plan.id === PLAN_POPULAR_ID;
    const benefits = PLAN_BENEFITS[plan.id] || [];
    const benefitsHtml = benefits.length
      ? `<ul class="plan-benefits">${benefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join('')}</ul>`
      : '';

    const discountPercent = PLAN_DISCOUNT_PERCENT[plan.id] || 0;
    let discountHtml = '';
    let originalPriceHtml = '';
    if (discountPercent > 0) {
      const rawAmount = plan.display ? plan.display.amount : Number(plan.price_usd_cents || 0) / 100;
      const rawCurrency = plan.display ? plan.display.currency : 'USD';
      const originalAmount = rawAmount / (1 - discountPercent / 100);
      const originalPrice = formatPrice(originalAmount, rawCurrency);
      discountHtml = `<span class="plan-discount-tag">-${discountPercent}% · Oferta por tiempo limitado</span>`;
      originalPriceHtml = `<span class="plan-price-original">${originalPrice}</span>`;
    }

    return `
    <article class="plan-card plan-card--${accent}${isPopular ? ' plan-card--popular' : ''}" data-plan-id="${escapeHtml(plan.id)}">
      ${isPopular ? '<span class="plan-badge">Mas popular</span>' : ''}
      <h3>${escapeHtml(plan.name)}</h3>
      <div class="plan-pricing">
        ${discountHtml}
        <div class="plan-price-line">
          ${originalPriceHtml}
          <p class="plan-price">${mainPrice}</p>
        </div>
      </div>
      ${usdHint}
      <p class="plan-description">${escapeHtml(plan.description)}</p>
      ${benefitsHtml}
      <div class="plan-actions">
        <button class="btn primary" type="button" data-checkout data-plan-id="${escapeHtml(plan.id)}" data-gateway="wompi" ${availableGateways.wompi ? '' : 'disabled'}>
          Pagar con Wompi
        </button>
        <button class="btn secondary" type="button" data-checkout data-plan-id="${escapeHtml(plan.id)}" data-gateway="mercadopago" disabled title="Próximamente: pendiente de un problema en la plataforma de MercadoPago">
          Pagar con MercadoPago
        </button>
      </div>
      <p class="plan-cop-note">Cobro real vía Wompi: ${copPrice}</p>
    </article>
  `;
  }).join('');

  plansGrid.querySelectorAll('[data-checkout]').forEach((button) => {
    button.addEventListener('click', () => {
      startCheckout(button.dataset.planId, button.dataset.gateway, button);
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

async function startCheckout(planId, gateway, button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Redirigiendo...';
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

function showSection(sectionId) {
  sections.forEach((section) => {
    section.classList.toggle('hidden', section.id !== sectionId);
  });

  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });

  if (sectionId === 'adminSection' && currentUser?.isSuperUser) {
    loadAdminUsers();
  }

  if (sectionId === 'overlaysSection') {
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
  }
}

let currentOverlayKey = null;
let currentOverlayState = null;

// Link real, el que se copia para pegar en OBS/Streamlabs/TikTok LIVE Studio
// — ahí SOLO deben verse regalos reales o el de prueba manual. Todos los
// overlays de una cuenta comparten la misma key, solo cambia la página.
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
  if (!currentOverlayKey) return;
  if (overlayPreviewFrame) overlayPreviewFrame.src = buildOverlayPreviewUrl(currentOverlayKey, 'gift-alert');
  if (goalBarPreviewFrame) goalBarPreviewFrame.src = buildOverlayPreviewUrl(currentOverlayKey, 'goal-bar');
  if (topGiftersPreviewFrame) topGiftersPreviewFrame.src = buildOverlayPreviewUrl(currentOverlayKey, 'top-gifters');
  if (likeCounterPreviewFrame) likeCounterPreviewFrame.src = buildOverlayPreviewUrl(currentOverlayKey, 'like-counter');
  if (topLikersPreviewFrame) topLikersPreviewFrame.src = buildOverlayPreviewUrl(currentOverlayKey, 'top-likers');
}

function applyOverlayStateToInputs(state) {
  currentOverlayState = state;

  const giftAlert = state?.giftAlert || {};
  if (overlayEnabledToggle) overlayEnabledToggle.checked = giftAlert.enabled !== false;
  if (overlayDurationInput) overlayDurationInput.value = giftAlert.durationSeconds || 5;
  if (overlayDurationValue) overlayDurationValue.textContent = `${giftAlert.durationSeconds || 5}s`;
  if (overlayMinCoinsInput) overlayMinCoinsInput.value = giftAlert.minCoins || 0;

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
}

async function loadOverlayConfig() {
  try {
    const response = await fetch('/api/overlay/config');
    if (!response.ok) throw new Error('No se pudo cargar la configuración del overlay.');
    const data = await response.json();
    currentOverlayKey = data.overlayKey;
    if (overlayLinkInput) overlayLinkInput.value = buildOverlayUrl(data.overlayKey, 'gift-alert');
    if (goalBarLinkInput) goalBarLinkInput.value = buildOverlayUrl(data.overlayKey, 'goal-bar');
    if (topGiftersLinkInput) topGiftersLinkInput.value = buildOverlayUrl(data.overlayKey, 'top-gifters');
    if (likeCounterLinkInput) likeCounterLinkInput.value = buildOverlayUrl(data.overlayKey, 'like-counter');
    if (topLikersLinkInput) topLikersLinkInput.value = buildOverlayUrl(data.overlayKey, 'top-likers');
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

async function regenerateOverlayKey() {
  const confirmed = await showAppConfirm(
    'Esto invalida TODOS los links de overlay anteriores (alerta de regalos, barra de meta, top de regaladores, contador de likes y top de likes) — tendrás que actualizarlos en tu software de transmisión. ¿Seguro que quieres regenerarlos?',
    'Regenerar links de overlay',
  );
  if (!confirmed) return;

  try {
    const response = await fetch('/api/overlay/regenerate-key', { method: 'POST' });
    if (!response.ok) throw new Error('No se pudo regenerar el link.');
    const data = await response.json();
    currentOverlayKey = data.overlayKey;
    if (overlayLinkInput) overlayLinkInput.value = buildOverlayUrl(data.overlayKey, 'gift-alert');
    if (goalBarLinkInput) goalBarLinkInput.value = buildOverlayUrl(data.overlayKey, 'goal-bar');
    if (topGiftersLinkInput) topGiftersLinkInput.value = buildOverlayUrl(data.overlayKey, 'top-gifters');
    if (likeCounterLinkInput) likeCounterLinkInput.value = buildOverlayUrl(data.overlayKey, 'like-counter');
    if (topLikersLinkInput) topLikersLinkInput.value = buildOverlayUrl(data.overlayKey, 'top-likers');
    reloadOverlayPreviewFrames();
    showAppAlert('Links regenerados. Actualízalos en tu software de transmisión.', 'Overlays');
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

if (overlayRegenerateBtn) {
  overlayRegenerateBtn.addEventListener('click', regenerateOverlayKey);
}

if (goalBarRegenerateBtn) {
  goalBarRegenerateBtn.addEventListener('click', regenerateOverlayKey);
}

if (topGiftersRegenerateBtn) {
  topGiftersRegenerateBtn.addEventListener('click', regenerateOverlayKey);
}

if (likeCounterRegenerateBtn) {
  likeCounterRegenerateBtn.addEventListener('click', regenerateOverlayKey);
}

if (topLikersRegenerateBtn) {
  topLikersRegenerateBtn.addEventListener('click', regenerateOverlayKey);
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

if (overlayDurationInput) {
  overlayDurationInput.addEventListener('input', () => {
    overlayDurationValue.textContent = `${overlayDurationInput.value}s`;
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
            <p class="admin-user-info">Registrado: ${escapeHtml(formatDate(user.created_at))}</p>
          </div>
          <div class="admin-user-actions">
            <button class="btn secondary edit-user" type="button">Editar cuenta</button>
            <button class="btn danger delete-user" type="button">Eliminar cuenta</button>
          </div>
        </div>
        ${renderAdminUserPlanInfo(user)}
      </article>
    `)
    .join('');

  adminUsersList.querySelectorAll('[data-user-id]').forEach((card) => {
    const userId = Number(card.getAttribute('data-user-id'));

    card.querySelector('.edit-user').addEventListener('click', () => {
      openEditModal(userId);
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
    await handlePaymentRedirectParams();

    document.getElementById('pageLoader')?.setAttribute('hidden', '');
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
});

if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', handleChangePassword);
}

loadMe();
