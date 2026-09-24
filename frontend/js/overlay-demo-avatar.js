// Genera un avatar placeholder (círculo de color + inicial) para las vistas
// previas de demo de los overlays — en modo demo no hay foto real de nadie,
// así que esto da una idea más parecida a como se va a ver de verdad que el
// círculo traslúcido plano que se usa como respaldo cuando una foto real
// falla al cargar. El color es siempre el mismo para el mismo nombre.

const DEMO_AVATAR_COLORS = ['#7c5cff', '#22d3ee', '#fb7185', '#fb923c', '#22c55e', '#38bdf8', '#facc15'];

function hashDemoName(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function generateDemoAvatar(name) {
  const clean = String(name || '?').trim();
  const initial = (clean.charAt(0) || '?').toUpperCase();
  const color = DEMO_AVATAR_COLORS[hashDemoName(clean) % DEMO_AVATAR_COLORS.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<rect width="64" height="64" rx="32" fill="${color}" />` +
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${initial}</text>` +
    `</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

window.generateDemoAvatar = generateDemoAvatar;
