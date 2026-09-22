// PlayTik Live — Fondo decorativo compartido (aurora + estrellas + parallax
// + scroll suave). Usado por la landing, login y registro. Requiere el
// marcado de .aurora-layer (con .aurora-blob, .shooting-star, #stars/
// #stars2/#stars3 dentro de .starfield-layer) y assets/css/bg-effects.css.

// Genera una lista de "x px y px color" al estilo box-shadow, esparcida al
// azar dentro de un lienzo virtual de 2000x2000px (mismo tamaño que usa la
// animacion de caida en bg-effects.css, para que el loop encaje perfecto).
// Colores: mayormente blanco, con un toque de los acentos morado/cian de la
// marca en vez de puntos genericos.
function generateStarShadow(count) {
  const colors = ['#fff', '#fff', '#fff', '#fff', '#c4b5fd', '#67e8f9'];
  const parts = [];

  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 2000);
    const y = Math.floor(Math.random() * 2000);
    const color = colors[Math.floor(Math.random() * colors.length)];
    parts.push(`${x}px ${y}px ${color}`);
  }

  return parts.join(', ');
}

function initStarfield() {
  const layers = [
    { id: 'stars', varName: '--star-shadow-sm', count: 260 },
    { id: 'stars2', varName: '--star-shadow-md', count: 130 },
    { id: 'stars3', varName: '--star-shadow-lg', count: 70 },
  ];

  layers.forEach(({ id, varName, count }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty(varName, generateStarShadow(count));
  });
}

// Efecto parallax "3D": cada capa de estrellas tiene su propio --depth
// (ver el atributo data-depth en el HTML) y se desplaza hacia arriba una
// fraccion del scroll — las capas con puntos mas grandes ("cercanas") se
// mueven mas rapido que las de puntos chicos ("lejanas"), dando sensacion
// de profundidad al hacer scroll. rAF-throttled para no recalcular en cada
// evento de scroll.
function initStarfieldParallax() {
  const layers = Array.from(document.querySelectorAll('.starfield-layer')).map((layer) => ({
    el: layer,
    depth: Number(layer.dataset.depth) || 0.1,
  }));

  if (layers.length === 0) return;

  let ticking = false;

  function applyParallax() {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    layers.forEach(({ el, depth }) => {
      el.style.transform = `translateY(${-scrollY * depth}px)`;
    });
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(applyParallax);
  }, { passive: true });

  applyParallax();
}

// Suaviza el scroll de la ruedita del mouse: en vez de saltar de golpe a la
// nueva posicion, la acerca poco a poco cada frame (lerp) para que se
// sienta con inercia, como en sitios "premium". Solo intercepta la rueda
// — scroll por teclado, barra o gestos tactiles sigue siendo nativo, y si
// alguno de esos mueve la pagina mientras no estamos animando, se
// resincroniza para no pegar un salto raro en la siguiente rueda.
function initSmoothWheelScroll() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

  let current = window.scrollY;
  let target = window.scrollY;
  let animating = false;

  function resync() {
    if (animating) return;
    current = window.scrollY;
    target = window.scrollY;
  }
  window.addEventListener('scroll', resync, { passive: true });

  function step() {
    current += (target - current) * 0.1;

    if (Math.abs(target - current) < 0.4) {
      current = target;
      animating = false;
      window.scrollTo(0, current);
      return;
    }

    window.scrollTo(0, current);
    requestAnimationFrame(step);
  }

  window.addEventListener('wheel', (event) => {
    event.preventDefault();
    target = Math.max(0, Math.min(target + event.deltaY, maxScroll()));

    if (!animating) {
      animating = true;
      requestAnimationFrame(step);
    }
  }, { passive: false });
}

// Actualiza --mx/--my (posicion del cursor en % dentro de cada tarjeta) para
// el brillo que la sigue por CSS. Solo mueve variables CSS, nunca toca el
// layout. `selector` es configurable porque cada pagina tiene sus propias
// tarjetas (info-card/hero-stats en la landing, auth-card en login/registro).
function initSpotlightCards(selector) {
  const cards = document.querySelectorAll(selector);

  cards.forEach((card) => {
    card.addEventListener('mousemove', (event) => {
      const rect = card.getBoundingClientRect();
      const mx = ((event.clientX - rect.left) / rect.width) * 100;
      const my = ((event.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', `${mx}%`);
      card.style.setProperty('--my', `${my}%`);
    });
  });
}

// Punto de entrada unico: llama todo lo de arriba con un solo call desde
// cada pagina. `spotlightSelector` es opcional (por defecto no activa el
// brillo de cursor en ninguna tarjeta si no se pasa).
function initBackgroundEffects(spotlightSelector) {
  initStarfield();
  initStarfieldParallax();
  initSmoothWheelScroll();
  if (spotlightSelector) initSpotlightCards(spotlightSelector);
}
