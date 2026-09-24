// Interaktik — Configuracion y helpers de planes compartidos entre la
// landing (vista publica, botones "Crear cuenta") y el panel (vista
// autenticada, botones de pago real). Los planes en si (nombre/precio/
// duracion) siempre vienen de GET /api/plans; lo de aca es solo
// presentacion (beneficios, color de acento, "oferta" tachada) para no
// tener que agregar columnas nuevas a la tabla `plans` ni duplicar este
// mapeo en dos archivos.

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

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

// Arma el HTML de una tarjeta de plan. `actionsHtml` es el contenido de
// .plan-actions (botones de pago reales en el panel, o un link "Crear
// cuenta" en la landing) — asi la tarjeta se ve identica en ambos lados
// aunque el llamado a la accion sea distinto.
function buildPlanCardHtml(plan, actionsHtml) {
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
        ${actionsHtml}
      </div>
      <p class="plan-cop-note">Cobro real vía Wompi: ${copPrice}</p>
    </article>
  `;
}
