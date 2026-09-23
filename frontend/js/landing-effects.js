function initLandingScrollReveal() {
  const revealElements = document.querySelectorAll('.scroll-reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      }
    },
    {
      threshold: 0.25,
    },
  );

  revealElements.forEach((element) => observer.observe(element));
}

function initFooterYear() {
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

// Trae los planes reales (mismo endpoint publico que usa el panel) y los
// pinta con el mismo componente visual (buildPlanCardHtml, en
// js/plans-shared.js) — pero como el visitante no tiene sesion todavia, el
// llamado a la accion es "Crear cuenta" en vez de un boton de pago real
// (el checkout siempre exige estar autenticado).
async function initLandingPlans() {
  const grid = document.getElementById('landingPlansGrid');
  if (!grid) return;

  try {
    const currency = detectUserCurrency();
    const response = await fetch(`/api/plans?currency=${encodeURIComponent(currency)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los planes.');

    const plans = data.plans || [];
    if (!plans.length) {
      grid.innerHTML = '<p class="muted">No hay planes disponibles por el momento.</p>';
      return;
    }

    const ctaHtml = `
      <a class="btn primary" href="register.html">Crear cuenta</a>
      <p class="plan-cta-hint muted">2 dias de prueba gratis, sin tarjeta</p>
    `;

    grid.innerHTML = plans.map((plan) => buildPlanCardHtml(plan, ctaHtml)).join('');
  } catch (error) {
    grid.innerHTML = `<p class="muted">No se pudieron cargar los planes: ${escapeHtml(error.message)}</p>`;
  }
}

// Esconde el header deslizandolo hacia arriba cuando el usuario scrollea
// hacia abajo, y lo vuelve a mostrar apenas scrollea hacia arriba (o esta
// cerca del tope). Solo aplica cuando el header esta en position:fixed
// (desktop) — en movil vuelve a su flujo normal (ver landing.css) y ahi no
// tiene sentido esconderlo.
function initNavAutoHide() {
  const nav = document.querySelector('.landing-nav');
  if (!nav) return;

  const showThreshold = nav.offsetHeight + 32;
  let lastScrollY = window.scrollY;
  let ticking = false;

  function update() {
    const isFixed = getComputedStyle(nav).position === 'fixed';
    const scrollY = window.scrollY;

    if (!isFixed || scrollY <= showThreshold) {
      nav.classList.remove('nav-hidden');
    } else if (scrollY > lastScrollY) {
      nav.classList.add('nav-hidden');
    } else {
      nav.classList.remove('nav-hidden');
    }

    lastScrollY = scrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
}

// Notacion abreviada tipo "1.3K" / "52.5M" en vez del numero completo con
// separadores de miles — mas legible para cifras grandes tipo diamantes.
function formatCompactNumber(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.floor(value));
}

// Anima un numero subiendo rapido desde 0 hasta su valor final (data-count-to
// en el HTML), con ease-out para que arranque veloz y frene suave al llegar.
// Usa un "run id" por elemento para que, si se vuelve a llamar mientras una
// animacion anterior sigue corriendo (el usuario entra/sale rapido de la
// seccion), la version vieja se cancele sola en vez de pelear por el mismo
// texto.
function animateCountUp(el, target, duration = 1600) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = formatCompactNumber(target);
    return;
  }

  const runId = (el.dataset.countRunId = String(Number(el.dataset.countRunId || 0) + 1));
  const start = performance.now();

  function tick(now) {
    if (el.dataset.countRunId !== runId) return;

    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = eased * target;
    el.textContent = formatCompactNumber(value);

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = formatCompactNumber(target);
    }
  }

  el.textContent = formatCompactNumber(0);
  requestAnimationFrame(tick);
}

// Dispara el conteo CADA VEZ que el numero entra en pantalla (no solo la
// primera) — vuelve a arrancar desde 0 cada vez que el usuario scrollea
// hasta la seccion. Los valores en si (data-count-to) son fijos/de
// marketing, no datos reales de la plataforma.
function initLiveStatsCounters() {
  const statEls = document.querySelectorAll('.live-stat-value');
  if (!statEls.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.dataset.countTo || 0);
      animateCountUp(el, target);
    });
  }, { threshold: 0.4 });

  statEls.forEach((el) => observer.observe(el));
}

// Los botones/links que apuntan a una seccion de la misma pagina (#planes,
// #sobre-nosotros, etc.) hacen scroll suave y dejan el destino CENTRADO en
// pantalla en vez de pegado arriba (que es lo que hace un <a href="#...">
// nativo aunque scroll-behavior sea smooth). Intercepta el click y usa
// scrollIntoView({block:'center'}) a mano.
function initAnchorCenterScroll() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const hash = link.getAttribute('href');
    if (!hash || hash.length < 2) return;

    const target = document.querySelector(hash);
    if (!target) return;

    link.addEventListener('click', (event) => {
      event.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });

      if (window.history?.pushState) {
        window.history.pushState(null, '', hash);
      }
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initLandingScrollReveal();
  initFooterYear();
  initBackgroundEffects('.info-card, .hero-stats > div');
  initLandingPlans();
  initNavAutoHide();
  initLiveStatsCounters();
  initAnchorCenterScroll();
});
