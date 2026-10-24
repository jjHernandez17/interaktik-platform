// Impresora de fotos: una impresora dibuja, en una cinta de hoja infinita, la foto de perfil de quien manda un regalo de las reglas.

const ppUsername = document.getElementById('ppUsername');
const ppConnectLiveBtn = document.getElementById('ppConnectLiveBtn');
const ppDisconnectBtn = document.getElementById('ppDisconnectBtn');
const ppConnectionStatus = document.getElementById('ppConnectionStatusBadge');
const ppConnectionDetails = document.getElementById('ppConnectionDetails');

const ppStage = document.getElementById('ppStage');
const ppQueueBadge = document.getElementById('ppQueueBadge');
const ppNo3d = document.getElementById('ppNo3d');
const ppCamBtn = document.getElementById('ppCamBtn');
const ppCamLabel = document.getElementById('ppCamLabel');

const ppTestBtn = document.getElementById('ppTestBtn');
const ppLogoBtn = document.getElementById('ppLogoBtn');
const ppClearBtn = document.getElementById('ppClearBtn');
const ppCleanBtn = document.getElementById('ppCleanBtn');
const ppExitCleanBtn = document.getElementById('ppExitCleanBtn');

const ppGiftChips = document.getElementById('ppGiftChips');
const ppGiftPickerHost = document.getElementById('ppGiftPickerHost');
const ppAnyGift = document.getElementById('ppAnyGift');
const ppShowName = document.getElementById('ppShowName');
const ppShowGift = document.getElementById('ppShowGift');
const ppSound = document.getElementById('ppSound');
const ppTopDonor = document.getElementById('ppTopDonor');
const ppTopMedal = document.getElementById('ppTopMedal');
const ppSaveNote = document.getElementById('ppSaveNote');

const PRINT_MS = { slow: 6500, normal: 3800, fast: 2000, turbo: 900 }; // lo que tarda en salir cada foto
const GAP_BETWEEN_JOBS_MS = 450;
const MAX_GIFTS = 40;

// ===== Estado persistido =====
let state = {
  giftRules: [],
  anyGift: false,
  giftEffects: {}, // regla fija de cada regalo (por nombre): 'wanted', 'top', 'kiss'... (ver PhotoPrinterLooks.EFFECTS)
  defaultEffect: 'none', // regla de los regalos que no tienen una propia (cuando se imprime con "cualquier regalo")
  options: { speed: 'normal', paper: 'white', shape: 'rounded', showName: true, showGift: true, sound: true, topDonor: true, topMedal: true },
};

// ===== Estado transitorio =====
let isConnected = false;
let liveEventsSource = null;
let saveTimeout = null;
let giftCatalog = [];
let giftCatalogState = 'idle'; // idle | loading | ready | error
let giftCatalogSource = ''; // live | saved | file-cache: de donde salio el catalogo que se muestra
let giftCatalogLoadedAt = 0;
let giftCatalogRefreshing = false;
const seenGiftEvents = new Set();
const queue = [];
let printing = false;
let sheetCount = 0;
let engine = null; // la escena 3D (photo-printer-3d.js)

const norm = (value) => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Solo fotos de https (la foto del espectador sale del CDN de TikTok) o imagenes generadas aqui mismo
function safeImageUrl(value) {
  const url = String(value || '').trim();
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(url) && url.length < 400000) return url;
  return /^https:\/\//i.test(url) && url.length <= 700 && !/[\s"'<>]/.test(url) ? url : '';
}

// ======================================================================================================================
// Avatares dibujados (para la prueba y para quien no tiene foto)
// ======================================================================================================================

function hashSeed(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCartoonAvatar(seed) {
  const rnd = seededRandom(hashSeed(seed));
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const g = canvas.getContext('2d');
  const hue = Math.floor(rnd() * 360);

  const bg = g.createLinearGradient(0, 0, 320, 320);
  bg.addColorStop(0, `hsl(${hue}, 85%, 72%)`);
  bg.addColorStop(1, `hsl(${(hue + 50) % 360}, 80%, 48%)`);
  g.fillStyle = bg;
  g.fillRect(0, 0, 320, 320);

  const skins = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5e3c26'];
  const skin = skins[Math.floor(rnd() * skins.length)];
  const hair = ['#2b1d14', '#5a3a22', '#b5651d', '#e8c26a', '#d4352f', '#1b1b22', '#6b3fa0'][Math.floor(rnd() * 7)];
  const shirt = `hsl(${(hue + 160) % 360}, 65%, 45%)`;

  g.fillStyle = shirt;
  g.beginPath();
  g.ellipse(160, 345, 125, 100, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = skin;
  g.fillRect(138, 205, 44, 50); // cuello

  // pelo de atras
  g.fillStyle = hair;
  g.beginPath();
  g.ellipse(160, 150, 92, 98, 0, 0, Math.PI * 2);
  g.fill();

  // cara
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(160, 160, 76, 86, 0, 0, Math.PI * 2);
  g.fill();

  // flequillo
  g.fillStyle = hair;
  g.beginPath();
  g.ellipse(160, 108, 80, 42, 0, Math.PI, Math.PI * 2);
  g.fill();

  // ojos
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(132, 160, 15, 18, 0, 0, Math.PI * 2);
  g.ellipse(188, 160, 15, 18, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#20232f';
  g.beginPath();
  g.arc(134, 163, 8, 0, Math.PI * 2);
  g.arc(190, 163, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(137, 160, 3, 0, Math.PI * 2);
  g.arc(193, 160, 3, 0, Math.PI * 2);
  g.fill();

  // mejillas y sonrisa
  g.fillStyle = 'rgba(255, 90, 120, 0.28)';
  g.beginPath();
  g.ellipse(112, 192, 14, 9, 0, 0, Math.PI * 2);
  g.ellipse(208, 192, 14, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#7a2f2f';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(160, 190, 30, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();

  return canvas.toDataURL('image/png');
}

function makeInitialAvatar(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const g = canvas.getContext('2d');
  const hue = hashSeed(name) % 360;
  const bg = g.createLinearGradient(0, 0, 320, 320);
  bg.addColorStop(0, `hsl(${hue}, 75%, 62%)`);
  bg.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 42%)`);
  g.fillStyle = bg;
  g.fillRect(0, 0, 320, 320);
  g.fillStyle = '#fff';
  g.font = '800 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const initial = (String(name).replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase();
  g.fillText(initial, 160, 168);
  return canvas.toDataURL('image/png');
}

// ======================================================================================================================
// Sonido de impresora (sintetizado: no hay archivos de audio)
// ======================================================================================================================

const printerSound = (() => {
  let context = null;
  let running = null;

  function ensure() {
    if (!context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      context = new AudioCtx();
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function noiseBuffer(c) {
    const buffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function start() {
    if (!state.options.sound) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    stop();

    const master = c.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.45, c.currentTime + 0.12);
    master.connect(c.destination);

    // motor de la hoja: zumbido grave
    const motor = c.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 56;
    const motorFilter = c.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 240;
    const motorGain = c.createGain();
    motorGain.gain.value = 0.08;
    motor.connect(motorFilter);
    motorFilter.connect(motorGain);
    motorGain.connect(master);

    // carro de tinta: ruido que pulsa cada vez que cruza la hoja
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c);
    noise.loop = true;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2300;
    band.Q.value = 0.9;
    const noiseGain = c.createGain();
    noiseGain.gain.value = 0.06;
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(master);
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 11.5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(noiseGain.gain);

    motor.start();
    noise.start();
    lfo.start();
    running = { master, sources: [motor, noise, lfo] };
  }

  function stop() {
    if (!running || !context) return;
    const { master, sources } = running;
    running = null;
    try {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0, context.currentTime, 0.05);
    } catch (error) { /* ya estaba detenido */ }
    setTimeout(() => sources.forEach((source) => { try { source.stop(); } catch (error) { /* ya detenido */ } }), 350);
  }

  function tone(c, frequency, delay, duration, volume = 0.18, type = 'sine') {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    const t0 = c.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // sonido corto cuando termina de imprimir una foto (cada estilo puede elegir el suyo)
  function ding(kind = 'default') {
    if (!state.options.sound) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    if (kind === 'bell') {
      tone(c, 1568, 0, 0.55);
      tone(c, 2093, 0.14, 0.7);
    } else if (kind === 'fanfare') {
      [523, 659, 784, 1047].forEach((frequency, index) => tone(c, frequency, index * 0.11, 0.38, 0.16, 'triangle'));
    } else if (kind === 'coin') {
      tone(c, 1760, 0, 0.12, 0.08, 'square');
      tone(c, 2349, 0.09, 0.45, 0.08, 'square');
    } else {
      tone(c, 1318, 0, 0.5);
    }
  }

  // "muah": un chasquido corto con una caida de tono
  function kiss() {
    if (!state.options.sound) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    const t0 = c.currentTime;
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 1.2;
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(c.destination);
    noise.start(t0);
    noise.stop(t0 + 0.15);
    const osc = c.createOscillator();
    const oscGain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t0);
    osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.14);
    oscGain.gain.setValueAtTime(0.0001, t0);
    oscGain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(oscGain);
    oscGain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  // papel que se rasga: ruido que crepita (rafagas cortas de volumen irregular) mientras sube el tono del filtro
  function tear() {
    if (!state.options.sound) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    const t0 = c.currentTime;
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c);
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, t0);
    filter.frequency.linearRampToValueAtTime(4200, t0 + 0.7);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    for (let step = 0; step < 28; step += 1) {
      const at = t0 + step * 0.026;
      gain.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.3, at + 0.008);
      gain.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.06, at + 0.02);
    }
    gain.gain.linearRampToValueAtTime(0.0001, t0 + 0.85);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    noise.start(t0);
    noise.stop(t0 + 0.9);
  }

  return { unlock: ensure, start, stop, ding, kiss, tear };
})();

// Los navegadores solo dejan sonar despues de que el usuario toca la pagina
['pointerdown', 'keydown'].forEach((name) => document.addEventListener(name, () => printerSound.unlock(), { once: true }));

// ======================================================================================================================
// Impresora: cola de trabajos y dibujo de cada foto en la hoja
// ======================================================================================================================

function setPrinterDisplay(stateText, nameText, busy) {
  engine?.setDisplay(stateText, nameText, busy);
}

function updateQueueBadge() {
  if (queue.length > 0) {
    ppQueueBadge.hidden = false;
    ppQueueBadge.textContent = `En cola: ${queue.length}`;
  } else {
    ppQueueBadge.hidden = true;
  }
}

function updateEmptyHint() {
  let text;
  if (state.anyGift) {
    text = 'Aquí se imprimirán las fotos de perfil de quienes manden cualquier regalo.';
  } else if (state.giftRules.length > 0) {
    const names = state.giftRules.slice(0, 4).join(', ');
    text = `Aquí se imprimirán las fotos de perfil de quienes manden: ${names}${state.giftRules.length > 4 ? '…' : ''}.`;
  } else {
    text = 'Elige abajo los regalos que imprimen la foto de perfil de quien los manda.';
  }
  engine?.setEmptyHint(text);
}

// ----- imagenes para el 3D: el 3D usa las fotos como textura, y WebGL no acepta imagenes de otro dominio (el CDN de TikTok
// no las deja usar). Se piden por nuestro proxy (/api/image-proxy), que las entrega como si fueran nuestras. -----

function imageFromUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadCanvasImage(url, timeoutMs = 5000) {
  if (!url) return null;
  if (url.startsWith('data:')) return imageFromUrl(url);
  const attempt = (async () => {
    try {
      const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
      if (!response.ok) return null;
      return await createImageBitmap(await response.blob());
    } catch (error) {
      return null;
    }
  })();
  return Promise.race([attempt, sleep(timeoutMs).then(() => null)]);
}

async function printOne(job) {
  const giftInfo = findGift(job.giftName);
  const [avatar, giftIcon] = await Promise.all([
    loadCanvasImage(safeImageUrl(job.avatar)),
    giftInfo && safeImageUrl(giftInfo.imageUrl) ? loadCanvasImage(giftInfo.imageUrl, 3000) : null,
  ]);
  // sin foto (o si no cargo) se imprime una con la inicial del nombre
  const img = avatar || (await loadCanvasImage(makeInitialAvatar(job.nickname)));

  setPrinterDisplay('IMPRIMIENDO', job.nickname, true);
  printerSound.start();
  await engine.print(job, img, giftIcon, PRINT_MS[state.options.speed] || PRINT_MS.normal);
  printerSound.stop();
  printerSound.ding(job.style && job.style.sound);
  sheetCount += 1;
  setPrinterDisplay('LISTO', job.nickname, false);
}

async function pump() {
  if (printing) return;
  printing = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      updateQueueBadge();
      try {
        await printOne(job);
      } catch (error) {
        console.error('[PhotoPrinter] Error imprimiendo:', error.message);
        printerSound.stop();
      }
      await sleep(state.options.speed === 'turbo' ? 120 : GAP_BETWEEN_JOBS_MS);
    }
  } finally {
    printing = false;
    setPrinterDisplay('LISTA', 'Esperando regalos', false);
  }
}

// Ningun regalo se pierde: si llegan muchos a la vez esperan su turno en la cola
function enqueue(job) {
  if (job.style && job.style.priority) {
    // los de prioridad pasan delante de los normales (pero respetan el orden entre ellos y no cortan el que ya se imprime)
    let index = 0;
    while (index < queue.length && queue[index].style && queue[index].style.priority) index += 1;
    queue.splice(index, 0, job);
  } else {
    queue.push(job);
  }
  updateQueueBadge();
  pump();
}

function clearSheet() {
  queue.length = 0;
  updateQueueBadge();
  engine?.clear();
  sheetCount = 0;
}

// ======================================================================================================================
// Regalos
// ======================================================================================================================

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
  return key ? giftCatalog.find((gift) => norm(gift.name) === key) || null : null;
}

// El catalogo cambia segun la situacion: sin conexion es el guardado (o la lista base del servidor); conectado al live es el
// catalogo REAL y completo de TikTok. Por eso se junta todo (el del live manda) en vez de quedarse con lo primero que llego.
const CATALOG_RANK = { 'file-cache': 1, saved: 2, live: 3 };

// Se junta por id: hay regalos distintos con el mismo nombre (por ejemplo "Balloons" de 10 y de 200 monedas) y no deben fundirse
function catalogKey(gift) {
  return gift.id ? `id:${gift.id}` : `name:${norm(gift.name)}`;
}

function mergeCatalog(incoming, source) {
  const merged = new Map(giftCatalog.map((gift) => [catalogKey(gift), gift]));
  for (const gift of incoming) {
    const key = catalogKey(gift);
    const previous = merged.get(key);
    merged.set(key, previous ? { ...previous, ...gift, imageUrl: gift.imageUrl || previous.imageUrl } : gift);
  }
  giftCatalog = [...merged.values()].sort((a, b) => a.diamondCount - b.diamondCount || a.name.localeCompare(b.name));
  if ((CATALOG_RANK[source] || 0) >= (CATALOG_RANK[giftCatalogSource] || 0)) giftCatalogSource = source || giftCatalogSource;
}

function applyCatalog(raw, source) {
  const incoming = sanitizeCatalog(raw);
  if (incoming.length === 0) return false;
  mergeCatalog(incoming, source);
  giftCatalogState = 'ready';
  giftCatalogLoadedAt = Date.now();
  renderGiftRules();
  return true;
}

async function loadGiftCatalog({ force = false } = {}) {
  if (giftCatalogRefreshing) return;
  if (giftCatalogState === 'ready' && !force) return;
  giftCatalogRefreshing = true;
  if (giftCatalogState !== 'ready') giftCatalogState = 'loading';
  try {
    const response = await fetch('/api/gifts?gameType=photoprinter');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo.');
    mergeCatalog(sanitizeCatalog(data.gifts), data.source);
    giftCatalogState = 'ready';
    giftCatalogLoadedAt = Date.now();
  } catch (error) {
    if (giftCatalogState !== 'ready') giftCatalogState = 'error';
  } finally {
    giftCatalogRefreshing = false;
  }
  renderGiftRules();
}

function giftCatalogNote() {
  if (giftCatalogState !== 'ready') return '';
  const total = `${giftCatalog.length} regalos`;
  if (giftCatalogSource === 'live') return `${total} · catálogo en vivo de TikTok`;
  if (giftCatalogSource === 'saved') return `${total} · catálogo guardado de tu último live. Conéctate al live para cargar todos los regalos actuales.`;
  return `${total} · catálogo base. Conéctate al live para cargar todos los regalos actuales de TikTok.`;
}

// Un regalo (real o de prueba): siempre suma monedas a quien lo mando; imprime si esta en las reglas (o si es de prueba)
function processGift(payload, { force = false, test = false, effect = '' } = {}) {
  const giftName = String(payload.giftName || '').trim();
  if (!giftName) return;
  const user = payload.user || {};
  const nickname = String(user.nickname || user.uniqueId || 'Alguien').slice(0, 40);
  const count = Math.max(1, Math.round(Number(payload.repeatCount) || 1));
  const unitCoins = Number(payload.diamondCount) || findGift(giftName)?.diamondCount || 0;
  const coins = unitCoins * count;
  const donorKey = String(user.uniqueId || user.nickname || '').trim().toLowerCase();

  registerDonation({ key: donorKey, nickname, avatar: user.avatar || '', coins, test });
  if (!force && !giftQualifies(giftName, coins)) return;

  // la regla fija del regalo (o la que se pidio en una prueba)
  const baseStyle = effect ? ppLooks.effectStyle(effect) : resolveJobStyle(giftName);
  enqueue({
    nickname,
    avatar: user.avatar || '',
    giftName,
    count,
    coins,
    style: baseStyle,
    isTop: Boolean(state.options.topMedal && donorKey && donorKey === currentTopDonorKey()),
  });
}

function handleLiveGift(payload) {
  if (!payload) return;
  // un replay del servidor (si el canal se corto un momento) no vuelve a imprimir lo ya impreso
  if (payload.eventId) {
    if (seenGiftEvents.has(payload.eventId)) return;
    seenGiftEvents.add(payload.eventId);
    if (seenGiftEvents.size > 400) seenGiftEvents.delete(seenGiftEvents.values().next().value);
  }
  processGift(payload);
}

// ======================================================================================================================
// Reglas de regalos (chips + selector con imagen y monedas) y opciones
// ======================================================================================================================

function chipMarkup(name) {
  const gift = findGift(name);
  const key = ppGiftEffectKey(name);
  const effect = key ? state.giftEffects[key] : 'none';
  return `
    <span class="pp-gift-chip${effect !== 'none' ? ' has-effect' : ''}">
      ${gift && gift.imageUrl ? `<img src="${esc(gift.imageUrl)}" alt="" onerror="this.style.visibility='hidden'" />` : ''}
      <span>${esc(name)}</span>
      ${gift ? `<span class="pp-gift-chip-coins">${gift.diamondCount}</span>` : ''}
      <select class="pp-effect-select" data-effect-gift="${esc(name)}" aria-label="Regla de ${esc(name)}">${effectOptionsMarkup(effect)}</select>
      <button type="button" data-remove-gift="${esc(name)}" aria-label="Quitar ${esc(name)}">✕</button>
    </span>`;
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
        <p class="gift-picker-note" data-gift-note></p>
      </div>
    </div>`;
}

function pickerListMarkup() {
  const picker = ppGiftPickerHost.querySelector('[data-gift-picker]');
  if (!picker) return '';
  if (giftCatalogState === 'loading' || giftCatalogState === 'idle') return '<p class="muted">Cargando regalos...</p>';
  if (giftCatalog.length === 0) return '<p class="muted">No se pudo cargar el catálogo. Escribe el nombre del regalo arriba y pulsa Enter.</p>';

  const filter = norm(picker.querySelector('.gift-picker-filter-name').value);
  const minRaw = picker.querySelector('.gift-picker-filter-min').value;
  const maxRaw = picker.querySelector('.gift-picker-filter-max').value;
  const min = minRaw === '' ? null : Number(minRaw);
  const max = maxRaw === '' ? null : Number(maxRaw);
  const taken = new Set(state.giftRules.map(norm));

  const filtered = giftCatalog.filter((gift) => {
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

function refreshPickerList() {
  const list = ppGiftPickerHost.querySelector('.gift-picker-list');
  if (list) list.innerHTML = pickerListMarkup();
  const note = ppGiftPickerHost.querySelector('[data-gift-note]');
  if (note) note.textContent = giftCatalogNote();
}

function renderGiftRules() {
  ppGiftChips.innerHTML = state.giftRules.length
    ? state.giftRules.map(chipMarkup).join('')
    : '<p class="muted">Ningún regalo elegido: la impresora está en reposo.</p>';
  ppAnyGift.checked = state.anyGift;
  ppGiftChips.style.opacity = state.anyGift ? '0.45' : '';

  // el selector se arma una sola vez (si se rehiciera se cerraria mientras el usuario escribe)
  if (!ppGiftPickerHost.querySelector('[data-gift-picker]')) {
    ppGiftPickerHost.innerHTML = pickerMarkup();
    loadGiftCatalog();
  }
  refreshPickerList();
  updateEmptyHint();
}

function addGift(name) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return;
  const key = norm(clean);
  const existing = state.giftRules.findIndex((item) => norm(item) === key);
  if (existing !== -1) {
    ppRemoveGiftEffect(state.giftRules[existing]);
    state.giftRules.splice(existing, 1); // volver a tocarlo lo quita
  } else {
    if (state.giftRules.length >= MAX_GIFTS) {
      showAppAlert(`Máximo ${MAX_GIFTS} regalos.`, 'Impresora de fotos');
      return;
    }
    state.giftRules.push(findGift(clean)?.name || clean);
  }
  renderGiftRules();
  scheduleSave();
}

function bindGiftRulesUI() {
  document.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-gift]');

    if (remove) {
      const key = norm(remove.dataset.removeGift);
      ppRemoveGiftEffect(remove.dataset.removeGift);
      state.giftRules = state.giftRules.filter((name) => norm(name) !== key);
      renderGiftRules();
      scheduleSave();
      return;
    }

    const toggle = event.target.closest('.gift-picker-toggle');
    if (toggle) {
      const picker = toggle.closest('[data-gift-picker]');
      const panel = picker.querySelector('.gift-picker-panel');
      const open = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !open);
      toggle.classList.toggle('open', open);
      if (open) {
        // al abrir se refresca el catalogo si fallo o si ya paso un rato (por si te conectaste al live despues)
        if (giftCatalogState === 'error' || Date.now() - giftCatalogLoadedAt > 20000) loadGiftCatalog({ force: true });
        refreshPickerList();
        picker.querySelector('.gift-picker-filter-name').focus();
      }
      return;
    }

    const item = event.target.closest('.gift-picker-item');
    if (item) {
      addGift(item.dataset.giftName);
      return;
    }

    // clic afuera: se cierra el selector
    if (!event.target.closest('[data-gift-picker]')) {
      document.querySelectorAll('.gift-picker-panel').forEach((panel) => panel.classList.add('hidden'));
      document.querySelectorAll('.gift-picker-toggle').forEach((toggleBtn) => toggleBtn.classList.remove('open'));
    }
  });

  ppGiftPickerHost.addEventListener('input', (event) => {
    if (event.target.closest('.gift-picker-filters')) refreshPickerList();
  });

  // Enter en el filtro: agrega el regalo escrito (sirve si el catalogo no cargo)
  ppGiftPickerHost.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.classList.contains('gift-picker-filter-name')) return;
    event.preventDefault();
    const typed = event.target.value;
    const exact = findGift(typed);
    const key = norm(exact ? exact.name : typed);
    if (key && !state.giftRules.some((name) => norm(name) === key)) addGift(exact ? exact.name : typed);
  });

  ppAnyGift.addEventListener('change', () => {
    state.anyGift = ppAnyGift.checked;
    renderGiftRules();
    scheduleSave();
  });
}

function applyOptions() {
  ppStage.dataset.paper = state.options.paper;
  ppStage.dataset.shape = state.options.shape;
  engine?.setTheme(state.options);
  document.querySelectorAll('[data-option]').forEach((group) => {
    const current = state.options[group.dataset.option];
    group.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.value === current));
  });
  ppShowName.checked = state.options.showName;
  ppShowGift.checked = state.options.showGift;
  ppSound.checked = state.options.sound;
  ppTopDonor.checked = state.options.topDonor;
  ppTopMedal.checked = state.options.topMedal;
}

function bindOptionsUI() {
  document.querySelectorAll('[data-option]').forEach((group) => {
    group.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      state.options[group.dataset.option] = button.dataset.value;
      applyOptions();
      scheduleSave();
    });
  });
  [[ppShowName, 'showName'], [ppShowGift, 'showGift'], [ppSound, 'sound'], [ppTopDonor, 'topDonor'], [ppTopMedal, 'topMedal']].forEach(([input, key]) => {
    input.addEventListener('change', () => {
      state.options[key] = input.checked;
      if (key === 'sound' && input.checked) printerSound.unlock();
      if (key === 'topDonor') refreshTopDonorDisplay();
      scheduleSave();
    });
  });
}

// ======================================================================================================================
// Guardado
// ======================================================================================================================

function sanitizeLoaded(data) {
  const options = data?.options && typeof data.options === 'object' ? data.options : {};
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  return {
    giftRules: Array.isArray(data?.giftRules) ? data.giftRules.map((name) => String(name)).slice(0, MAX_GIFTS) : [],
    anyGift: Boolean(data?.anyGift),
    giftEffects: Object.fromEntries(
      Object.entries(data?.giftEffects && typeof data.giftEffects === 'object' ? data.giftEffects : {})
        .filter(([, effect]) => ppLooks.EFFECT_IDS.includes(effect) && effect !== 'none')
        .slice(0, MAX_GIFTS),
    ),
    defaultEffect: ppLooks.EFFECT_IDS.includes(data?.defaultEffect) ? data.defaultEffect : 'none',
    options: {
      speed: pick(options.speed, ['slow', 'normal', 'fast', 'turbo'], 'normal'),
      paper: pick(options.paper, ['white', 'cream', 'kraft', 'pink', 'mint', 'blue'], 'white'),
      shape: pick(options.shape, ['rounded', 'circle', 'polaroid'], 'rounded'),
      showName: options.showName === undefined ? true : Boolean(options.showName),
      showGift: options.showGift === undefined ? true : Boolean(options.showGift),
      sound: options.sound === undefined ? true : Boolean(options.sound),
      topDonor: options.topDonor === undefined ? true : Boolean(options.topDonor),
      topMedal: options.topMedal === undefined ? true : Boolean(options.topMedal),
    },
  };
}

async function loadState() {
  try {
    const response = await fetch('/api/photo-printer/state');
    if (!response.ok) throw new Error('No se pudo cargar la configuración.');
    state = sanitizeLoaded(await response.json());
  } catch (error) {
    console.error('[PhotoPrinter] Error cargando estado:', error.message);
  }
}

function scheduleSave() {
  ppSaveNote.textContent = 'Guardando...';
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const response = await fetch('/api/photo-printer/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftRules: state.giftRules, anyGift: state.anyGift, giftEffects: state.giftEffects, defaultEffect: state.defaultEffect, options: state.options }),
      });
      if (!response.ok) throw new Error('No se pudo guardar.');
      ppSaveNote.textContent = 'Guardado ✓';
    } catch (error) {
      ppSaveNote.textContent = 'No se pudo guardar los cambios. Revisa tu conexión.';
    }
  }, 700);
}

// ======================================================================================================================
// Conexión TikTok Live (mismo patrón que el resto de los juegos)
// ======================================================================================================================

function setConnectionStatus(status, details = '', error = '') {
  const displayStatus = error ? 'error' : status;
  const labels = { unlinked: 'Sin vincular', disconnected: 'Desconectado', connecting: 'Conectando...', connected: 'Conectado', error: 'Error' };
  ppConnectionStatus.textContent = labels[displayStatus] || labels.disconnected;
  ppConnectionStatus.className = `status-badge ${displayStatus}`;

  if (!ppConnectionDetails) return;
  if (displayStatus === 'error') {
    ppConnectionDetails.textContent = error || 'Error al conectar al live, por favor contactate con un desarrollador.';
  } else if (details) {
    ppConnectionDetails.textContent = details;
  } else if (displayStatus === 'unlinked' || displayStatus === 'disconnected') {
    ppConnectionDetails.textContent = 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.';
  }
}

function connectToEvents() {
  if (liveEventsSource) liveEventsSource.close();
  liveEventsSource = new EventSource('/events?gameType=photoprinter');

  liveEventsSource.addEventListener('status', (event) => {
    const payload = JSON.parse(event.data);
    isConnected = payload.status === 'connected';
    setConnectionStatus(payload.status || 'disconnected', payload.message || '', payload.error || '');
    if (payload.status === 'connected') {
      applyCatalog(payload.availableGifts, 'live');
      if (Date.now() - giftCatalogLoadedAt > 8000) loadGiftCatalog({ force: true });
    }
  });

  // el servidor manda el catalogo completo del live apenas se conecta
  liveEventsSource.addEventListener('giftCatalog', (event) => {
    try {
      applyCatalog(JSON.parse(event.data).gifts, 'live');
    } catch (error) {
      console.error('[PhotoPrinter] Error leyendo el catálogo de regalos:', error.message);
    }
  });

  liveEventsSource.addEventListener('gift', (event) => {
    try {
      handleLiveGift(JSON.parse(event.data));
    } catch (error) {
      console.error('[PhotoPrinter] Error handling gift event:', error.message);
    }
  });

  liveEventsSource.addEventListener('error', () => {
    if (isConnected) setConnectionStatus('connecting', 'Reconectando eventos del servidor...');
  });
}

async function restoreTiktokConnection() {
  try {
    const response = await fetch('/api/tiktok-connection/photoprinter');
    if (!response.ok) return;
    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      ppUsername.value = `@${data.tiktok_username}`;
      setConnectionStatus('disconnected', `Cuenta vinculada a @${data.tiktok_username}. Presiona "Conectar a live" cuando ya estés transmitiendo.`);
      window.interaktikResumeLive?.('photoprinter', (info) => {
        isConnected = true;
        setConnectionStatus('connected', info.message || '', '');
        connectToEvents();
        loadGiftCatalog({ force: true });
      });
    } else {
      ppUsername.value = '';
      setConnectionStatus('disconnected', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    console.error('[PhotoPrinter] Error restoring TikTok connection:', error.message);
  }
}

ppConnectLiveBtn?.addEventListener('click', async (event) => {
  event.preventDefault();
  const uniqueId = ppUsername.value.trim().replace(/^@/, '');
  if (!uniqueId) {
    showAppAlert('Primero vincula y guarda tu cuenta de TikTok desde la sección "Juegos".', 'Cuenta requerida');
    return;
  }
  try {
    setConnectionStatus('connecting', 'Cargando...');
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, gameType: 'photoprinter' }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo conectar a TikTok Live');
    isConnected = payload.status === 'connected';
    setConnectionStatus(payload.status || 'connected', payload.message || '', payload.error || '');
    if (isConnected) {
      connectToEvents();
      // al conectar, el servidor ya tiene el catalogo completo y real del live
      applyCatalog(payload.availableGifts, 'live');
      loadGiftCatalog({ force: true });
    }
  } catch (error) {
    setConnectionStatus('error', '', error.message);
  }
});

ppDisconnectBtn?.addEventListener('click', async () => {
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    isConnected = false;
    if (liveEventsSource) {
      liveEventsSource.close();
      liveEventsSource = null;
    }
    setConnectionStatus('disconnected', 'Desconectado de TikTok Live. La cuenta vinculada permanece guardada.');
  } catch (error) {
    showAppAlert(error.message, 'Error al desconectar');
  }
});

// ======================================================================================================================
// Botones del escenario
// ======================================================================================================================

const TEST_NAMES = ['Valentina', 'Mateo', 'Sofía', 'Santiago', 'Camila', 'Dylan', 'Luna', 'Nicolás', 'Isabella', 'Samuel', 'Mía', 'Emiliano'];

const TEST_COINS = [1, 5, 30, 99, 299, 999, 1999, 4999];

// La prueba pasa por el mismo camino que un regalo real (su regla fija y el top donador), pero no se guarda el top.
// El selector de al lado permite probar cualquier regla sin tener que asignarla a un regalo.

function runTest({ effect = '' } = {}) {
  printerSound.unlock();
  const name = TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
  const giftName = state.giftRules.length ? state.giftRules[Math.floor(Math.random() * state.giftRules.length)] : 'Rose';
  processGift({
    user: { nickname: name, uniqueId: name.toLowerCase(), avatar: makeCartoonAvatar(`${name}-${Date.now()}`) },
    giftName,
    repeatCount: Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 9) : 1,
    diamondCount: TEST_COINS[Math.floor(Math.random() * TEST_COINS.length)],
  }, { force: true, test: true, effect });
}

// "Imprimir de prueba": un regalo de tu lista con la regla que le toca
ppTestBtn?.addEventListener('click', () => runTest());

// un boton de prueba por cada regla (se arman en photo-printer-extras.js)
document.getElementById('ppRuleTests')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-test-effect]');
  if (button) runTest({ effect: button.dataset.testEffect });
});

// El logo de Interaktik (misma imagen que el icono de la pagina) como foto de prueba. Se pasa a data URL cuadrada y chica para
// que el 3D lo use igual que cualquier avatar.
async function loadLogoDataUrl() {
  const img = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = 'assets/images/favicon.png';
  });
  if (!img) return makeInitialAvatar('Interaktik');
  const size = 384;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

ppLogoBtn?.addEventListener('click', async () => {
  printerSound.unlock();
  ppLogoBtn.disabled = true;
  try {
    processGift({
      user: { nickname: 'Interaktik', uniqueId: 'interaktik', avatar: await loadLogoDataUrl() },
      giftName: state.giftRules[0] || 'Rose',
      repeatCount: 1,
      diamondCount: 100,
    }, { force: true, test: true });
  } finally {
    ppLogoBtn.disabled = false;
  }
});

ppClearBtn?.addEventListener('click', async () => {
  if (sheetCount === 0 && queue.length === 0) return;
  const confirmed = await showAppConfirm('¿Limpiar la hoja, la cola de impresión y las paredes?', 'Limpiar hoja');
  if (confirmed) clearSheet();
});

function setCleanMode(on) {
  document.body.classList.toggle('pp-clean', on);
}

ppCleanBtn?.addEventListener('click', () => setCleanMode(true));
ppExitCleanBtn?.addEventListener('click', () => setCleanMode(false));
// La camara solo se mueve sola si la activas (tecla C o el boton del escenario); por defecto la manejas tu con el mouse
function cameraLabel(manual) {
  return manual ? 'Cámara manual · arrastra para mirar · C: automática' : 'Cámara automática · C: manual';
}

document.addEventListener('keydown', (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (typing) return;
  if ((event.key === 'c' || event.key === 'C') && !event.ctrlKey && !event.metaKey && !event.altKey) engine?.toggleCamera();
  if (event.key === 'Escape') setCleanMode(false);
  if (event.key === 'h' || event.key === 'H') setCleanMode(!document.body.classList.contains('pp-clean'));
});

// ======================================================================================================================
// Inicio
// ======================================================================================================================

async function initializePhotoPrinter() {
  bindGiftRulesUI();
  bindOptionsUI();
  if (window.PhotoPrinter3D) engine = window.PhotoPrinter3D.create(ppStage);
  if (!engine) ppNo3d.hidden = false;
  if (engine) {
    // la camara la mueve el streamer arrastrando con el mouse; este boton la devuelve al modo automatico
    ppCamBtn.hidden = false;
    ppStage.addEventListener('pp-camera-mode', (event) => {
      const manual = Boolean(event.detail?.manual);
      ppCamBtn.classList.toggle('is-manual', manual);
      ppCamLabel.textContent = cameraLabel(manual);
    });
    ppCamBtn.addEventListener('click', () => engine.toggleCamera());
    // el beso: el 3D avisa en el momento exacto en que los labios tocan la foto
    ppStage.addEventListener('pp-kiss', () => printerSound.kiss());
    ppStage.addEventListener('pp-tear', () => printerSound.tear());
    ppCamBtn.classList.toggle('is-manual', engine.isManual());
    ppCamLabel.textContent = cameraLabel(engine.isManual());
  }
  bindExtrasUI();
  await loadState();
  loadDonors();
  applyOptions();
  renderGiftRules();
  syncEffectsUI();
  refreshTopDonorDisplay();
  await restoreTiktokConnection();
}

initializePhotoPrinter().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
