const GAME_TYPE = 'aihost';

const $ = (id) => document.getElementById(id);

const el = {
  stage: $('stage'),
  character: $('character'),
  characterWrap: $('characterWrap'),
  fx: $('fx'),
  subtitle: $('subtitle'),
  subName: $('subName'),
  subText: $('subText'),
  alerts: $('alerts'),
  chat: $('chat'),
  veil: $('ahVoiceVeil'),
  chipTiktok: $('ahChipTiktok'),
  chipAI: $('ahChipAI'),
  chipVoice: $('ahChipVoice'),
  togglePanel: $('ahTogglePanel'),
  clean: $('ahClean'),
  fullscreen: $('ahFullscreen'),

  enabled: $('ahEnabled'),
  enabledLabel: $('ahEnabledLabel'),
  connectionDetails: $('ahConnectionDetails'),
  statusBadge: $('ahConnectionStatusBadge'),
  connectionForm: $('ahConnectionForm'),
  username: $('ahUsernameInput'),
  connectBtn: $('ahConnectLiveBtn'),
  disconnectBtn: $('ahDisconnectBtn'),

  form: $('ahForm'),
  character_: $('ahCharacter'),
  background: $('ahBackground'),
  accent: $('ahAccent'),
  showChat: $('ahShowChat'),
  agentName: $('ahAgentName'),
  language: $('ahLanguage'),
  tone: $('ahTone'),
  persona: $('ahPersona'),
  about: $('ahAbout'),
  replyMode: $('ahReplyMode'),
  thankGifts: $('ahThankGifts'),
  minGift: $('ahMinGift'),
  greetFollowers: $('ahGreetFollowers'),
  greetViewers: $('ahGreetViewers'),
  proactive: $('ahProactive'),
  proactiveMinutes: $('ahProactiveMinutes'),
  cadence: $('ahCadence'),
  maxChars: $('ahMaxChars'),
  banned: $('ahBanned'),
  voice: $('ahVoice'),
  rate: $('ahRate'),
  pitch: $('ahPitch'),
  volume: $('ahVolume'),
  rateOut: $('ahRateOut'),
  pitchOut: $('ahPitchOut'),
  volumeOut: $('ahVolumeOut'),
  speakHere: $('ahSpeakHere'),
  testVoice: $('ahTestVoiceBtn'),
  voiceMode: $('ahVoiceMode'),
  voiceModeHint: $('ahVoiceModeHint'),
  voiceBrowserField: $('ahVoiceBrowserField'),
  voiceNote: $('ahVoiceNote'),
  model: $('ahModel'),
  modelHint: $('ahModelHint'),
  saveBtn: $('ahSaveBtn'),
  saveState: $('ahSaveState'),

  statCalls: $('ahStatCalls'),
  statCap: $('ahStatCap'),
  statQueue: $('ahStatQueue'),
  statCost: $('ahStatCost'),
  statTokens: $('ahStatTokens'),
  statTokensNote: $('ahStatTokensNote'),
  statusNote: $('ahStatusNote'),
  feed: $('ahFeed'),
  testText: $('ahTestText'),
  testComment: $('ahTestCommentBtn'),
  testGift: $('ahTestGiftBtn'),
  testFollow: $('ahTestFollowBtn'),
  reset: $('ahResetBtn'),

  actionBtns: $('ahActionBtns'),
  emotionBtns: $('ahEmotionBtns'),
  demoBtn: $('ahDemoBtn'),
};

const MODEL_HINTS = {
  'claude-haiku-5-5': 'Haiku responde en menos de un segundo y cuesta unas centésimas de centavo por respuesta (unos 30 centavos de dólar en un live de 3 horas).',
  'claude-sonnet-5-5': 'Sonnet entiende mejor los chistes y el contexto, pero cuesta unas 20 veces más (unos 5 dólares en un live de 3 horas).',
};

const TONE_LABELS = { amigable: 'Amigable y cercano', divertido: 'Divertido y ocurrente', motivador: 'Motivador y enérgico', tranquilo: 'Tranquilo y relajado', profesional: 'Profesional y claro', picaro: 'Pícaro y bromista' };
const LANGUAGE_LABELS = { es: 'Español', en: 'English', pt: 'Português' };
const ACTION_LABELS = { saludar: '👋 Saludar', aplaudir: '👏 Aplaudir', bailar: '💃 Bailar', saltar: '🦘 Saltar', celebrar: '🎉 Celebrar', pensar: '🤔 Pensar', encogerse: '🤷 Encogerse', senalar: '👉 Señalar', asentir: '👍 Asentir', negar: '🙅 Negar', corazon: '💖 Corazón' };
const EMOTION_LABELS = { neutral: 'Neutral', feliz: '😊 Feliz', emocionado: '🤩 Emocionado', sorprendido: '😮 Sorprendido', pensando: '🧐 Pensando', risa: '😂 Risa', carino: '😍 Cariño', picaro: '😏 Pícaro', triste: '😢 Triste' };

let liveEventsSource = null;
let currentConfig = null;
let statusTimer = null;
let voices = [];
let rig = null;
let userGesture = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function showAlert(message, title = 'Aviso') {
  if (window.showAppAlert) return window.showAppAlert(message, title);
  window.alert(message);
}

async function showConfirm(message, title = 'Confirmacion') {
  if (window.showAppConfirm) return window.showAppConfirm(message, title);
  return window.confirm(message);
}

async function api(path, options = {}) {
  const response = await fetch(`/api/ai-host${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Bloqueado por plan (prueba gratuita, pase de 2 dias, tokens agotados): se vuelve a la plataforma a ver los planes
    if (data.code === 'AI_LOCKED') {
      window.location.replace(`platform.html?aiLocked=${encodeURIComponent(data.reason || 'plan')}`);
    }
    const error = new Error(data.error || 'Algo salió mal.');
    error.code = data.code;
    throw error;
  }
  return data;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================================================================
// Escenario: efectos
// =============================================================================================================================

const FX_COLORS = ['#ff4d6d', '#ffd23f', '#3ddc97', '#4cc9f0', '#b388ff', '#ff9f1c'];

function headPoint() {
  const stage = el.stage.getBoundingClientRect();
  const wrap = el.characterWrap.getBoundingClientRect();
  return { x: wrap.left - stage.left + wrap.width * 0.5, y: wrap.top - stage.top + wrap.height * 0.34, w: wrap.width, h: wrap.height };
}

function spawn(className, styles, content, lifetimeMs) {
  const node = document.createElement('div');
  node.className = className;
  Object.entries(styles).forEach(([key, value]) => node.style.setProperty(key, value));
  if (content) node.textContent = content;
  el.fx.appendChild(node);
  setTimeout(() => node.remove(), lifetimeMs);
  return node;
}

function confetti(amount = 70) {
  const stage = el.stage.getBoundingClientRect();
  for (let i = 0; i < amount; i += 1) {
    const duration = 2.2 + Math.random() * 1.6;
    spawn('ah-confetti', {
      left: `${Math.random() * stage.width}px`,
      top: `${-20 - Math.random() * 120}px`,
      background: FX_COLORS[i % FX_COLORS.length],
      '--dx': `${(Math.random() - 0.5) * 220}px`,
      '--dy': `${stage.height * (0.75 + Math.random() * 0.35)}px`,
      '--r': `${300 + Math.random() * 600}deg`,
      '--d': `${duration}s`,
      'animation-delay': `${Math.random() * 0.5}s`,
    }, '', (duration + 0.6) * 1000);
  }
}

function hearts(amount = 14) {
  const head = headPoint();
  for (let i = 0; i < amount; i += 1) {
    const duration = 1.8 + Math.random() * 1.4;
    spawn('ah-heart', {
      left: `${head.x + (Math.random() - 0.5) * head.w * 0.7}px`,
      top: `${head.y + (Math.random() - 0.3) * head.h * 0.25}px`,
      '--dx': `${(Math.random() - 0.5) * 120}px`,
      '--s': `${22 + Math.random() * 30}px`,
      '--d': `${duration}s`,
      'animation-delay': `${Math.random() * 0.9}s`,
    }, ['💖', '💜', '💗', '💕'][i % 4], (duration + 1) * 1000);
  }
}

function sparkles(amount = 8) {
  const head = headPoint();
  for (let i = 0; i < amount; i += 1) {
    spawn('ah-star', {
      left: `${head.x + (Math.random() - 0.5) * head.w * 0.95}px`,
      top: `${head.y + (Math.random() - 0.5) * head.h * 0.5}px`,
      '--s': `${16 + Math.random() * 22}px`,
      'animation-delay': `${Math.random() * 0.5}s`,
    }, ['✨', '⭐', '✦'][i % 3], 1900);
  }
}

function thought() {
  const head = headPoint();
  spawn('ah-thought', { left: `${head.x + head.w * 0.22}px`, top: `${head.y - head.h * 0.2}px` }, '¿?…', 2600);
}

function handleEffect(name) {
  if (name === 'confetti') confetti(80);
  else if (name === 'hearts') hearts(16);
  else if (name === 'sparkles') sparkles(8);
  else if (name === 'thought') thought();
}

// =============================================================================================================================
// Escenario: subtitulos, voz y habla del personaje
// =============================================================================================================================

const speech = { queue: [], active: false, hideTimer: null };

function loadVoices() {
  voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  fillVoiceSelect();
}

function fillVoiceSelect() {
  const language = currentConfig?.language || 'es';
  const wanted = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
  const rest = voices.filter((voice) => !voice.lang.toLowerCase().startsWith(language));
  const option = (voice) => `<option value="${escapeHtml(voice.name)}">${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>`;
  const selected = currentConfig?.voiceName || '';

  el.voice.innerHTML = `<option value="">Automática (la mejor para el idioma)</option>${wanted.map(option).join('')}${rest.length ? `<optgroup label="Otros idiomas">${rest.map(option).join('')}</optgroup>` : ''}`;
  el.voice.value = voices.some((voice) => voice.name === selected) ? selected : '';
  el.voiceNote.textContent = !window.speechSynthesis ? 'Tu navegador no tiene voz. Usa Chrome o Edge.' : voices.length === 0 ? 'Cargando voces...' : '';
  paintChips();
}

function pickVoice() {
  const name = el.voice.value;
  if (name) {
    const exact = voices.find((voice) => voice.name === name);
    if (exact) return exact;
  }
  const language = el.language.value || 'es';
  const candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
  return candidates.find((voice) => /natural|online|neural|google/i.test(voice.name)) || candidates[0] || null;
}

// ---- Voz realista con IA (gasta tokens) ----
// Pide el audio al servidor y lo reproduce moviendo la boca al ritmo del sonido. Si falla (sin clave, sin tokens, red), devuelve false y
// se usa la "voz sin costo" del navegador.
let aiVoiceBlocked = false; // true cuando el servidor dijo que no hay voz IA disponible: no se vuelve a intentar hasta recargar
let voiceAudio = null;

function voiceMode() {
  return el.voiceMode?.value === 'ai' ? 'ai' : 'free';
}

// El tipo de voz se guarda en este navegador (no en el servidor). Por defecto es la voz sin costo, para no gastar tokens sin que lo elijas.
function paintVoiceMode() {
  const ai = voiceMode() === 'ai';
  el.voiceBrowserField.hidden = ai;
  el.voiceModeHint.textContent = ai
    ? 'Suena natural y con el carácter de tu personaje. Cada frase gasta tokens de tu plan (si no hay, usa la voz sin costo).'
    : 'Gratis: usa la voz de tu navegador. Suena más robótica.';
}

function initVoiceMode() {
  try { el.voiceMode.value = localStorage.getItem('ah.voiceMode') === 'ai' ? 'ai' : 'free'; } catch (error) { /* sin almacenamiento */ }
  paintVoiceMode();
  el.voiceMode.addEventListener('change', () => {
    aiVoiceBlocked = false;
    try { localStorage.setItem('ah.voiceMode', el.voiceMode.value); } catch (error) { /* sin almacenamiento */ }
    paintVoiceMode();
  });
}

async function sayWithAiVoice(text) {
  if (aiVoiceBlocked || !userGesture || el.volume.value === '0') return false;
  let blobUrl = null;
  try {
    const response = await fetch('/api/ai-host/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speed: Number(el.rate.value) || 1 }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (['NO_VOICE_KEY', 'NO_TOKENS'].includes(data.code)) {
        aiVoiceBlocked = true;
        showNotice(data.code === 'NO_TOKENS' ? 'Ya no te quedan tokens para la voz con IA: se usa la voz sin costo.' : 'La voz con IA todavía no está disponible: se usa la voz sin costo.', 'warn');
      }
      return false;
    }
    const left = response.headers.get('X-Voice-Tokens-Left');
    const blob = await response.blob();
    blobUrl = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
      const audio = new Audio(blobUrl);
      voiceAudio = audio;
      audio.volume = Number(el.volume.value);
      let timer = null;
      const done = () => { clearInterval(timer); resolve(); };
      audio.onended = done;
      audio.onpause = done;
      audio.onerror = () => { clearInterval(timer); reject(new Error('audio')); };
      // la boca late mientras suena (no hay "limites de palabra" como en la voz del navegador)
      audio.onplaying = () => { timer = setInterval(() => rig?.pulseWord(0.7 + Math.random() * 0.6), 180); };
      audio.play().catch(reject);
    });
    if (left !== null && left !== '') paintTokens({ tokensRemaining: Number(left), approxResponses: { haiku: Math.floor(Number(left) / 1500), sonnet: Math.floor(Number(left) / 30000) } });
    return true;
  } catch (error) {
    return false;
  } finally {
    voiceAudio = null;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

// Dice el texto; devuelve una promesa que termina cuando acaba la voz (o el tiempo estimado si no hay voz)
async function say(text, estimatedMs) {
  if (voiceMode() === 'ai' && el.speakHere.checked && (await sayWithAiVoice(text))) return;
  return sayFree(text, estimatedMs);
}

// "Voz sin costo": la voz del navegador (Web Speech)
function sayFree(text, estimatedMs) {
  const fallbackMs = Math.max(1500, Number(estimatedMs) || text.length * 62 + 700);
  if (!window.speechSynthesis || !el.speakHere.checked || !userGesture || el.volume.value === '0') return wait(fallbackMs);

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = el.language.value === 'en' ? 'en-US' : el.language.value === 'pt' ? 'pt-BR' : 'es-MX';
    }
    utterance.rate = Number(el.rate.value);
    utterance.pitch = Number(el.pitch.value);
    utterance.volume = Number(el.volume.value);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      resolve();
    };
    // seguro por si el navegador nunca avisa que termino
    const guard = setTimeout(finish, Math.min(40000, fallbackMs * 2 + 3000));
    utterance.onboundary = () => rig?.pulseWord(0.8 + Math.random() * 0.4);
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  });
}

function showSubtitle(item) {
  clearTimeout(speech.hideTimer);
  el.subName.textContent = item.agentName || currentConfig?.agentName || 'Nova';
  el.subText.textContent = item.text;
  el.subtitle.classList.add('visible');
}

function hideSubtitle(delayMs = 2200) {
  clearTimeout(speech.hideTimer);
  speech.hideTimer = setTimeout(() => {
    if (!speech.active) el.subtitle.classList.remove('visible');
  }, delayMs);
}

async function runTalk(item) {
  speech.active = true;
  const estimated = Math.max(1500, Number(item.estimatedMs) || item.text.length * 62 + 700);

  showSubtitle(item);
  rig?.setExpression(item.emotion || 'feliz', estimated + 1600);
  if (item.action) rig?.play(item.action);
  rig?.startSpeaking(estimated * 2 + 2000);

  await say(item.text, estimated);

  rig?.stopSpeaking();
  speech.active = false;
  if (speech.queue.length > 0) {
    runTalk(speech.queue.shift());
  } else {
    hideSubtitle(2400);
    setTimeout(() => {
      if (!speech.active) rig?.setExpression('neutral');
    }, 1400);
  }
}

function enqueueTalk(item) {
  if (!item || !item.text) return;
  // si el chat va muy rapido no se acumulan mensajes viejos
  if (speech.queue.length >= 3) speech.queue.shift();
  speech.queue.push(item);
  if (!speech.active) runTalk(speech.queue.shift());
}

// =============================================================================================================================
// Escenario: alertas, chat y reacciones inmediatas
// =============================================================================================================================

function showAlertCard(data) {
  const icons = { gift: '🎁', follow: '💜', share: '🔁' };
  const who = escapeHtml(data.nickname || 'Alguien');
  let title;
  let detail;
  if (data.kind === 'gift') {
    title = `${who} envió ${escapeHtml(data.giftName)}${data.count > 1 ? ` x${data.count}` : ''}`;
    detail = data.coins ? `${data.coins} monedas` : '¡Gracias!';
  } else if (data.kind === 'follow') {
    title = `${who} te sigue`;
    detail = '¡Nuevo seguidor!';
  } else {
    title = `${who} compartió el live`;
    detail = '¡Gracias por compartir!';
  }

  const card = document.createElement('div');
  card.className = 'ah-alert';
  card.dataset.kind = data.kind;
  card.innerHTML = `<div class="ah-alert-icon">${icons[data.kind] || '✨'}</div><div><b>${title}</b><span>${detail}</span></div>`;
  el.alerts.prepend(card);
  while (el.alerts.children.length > 3) el.alerts.lastElementChild.remove();
  setTimeout(() => card.remove(), 5300);
}

// El personaje reacciona de inmediato a un regalo o seguidor; si luego la IA dice algo, su respuesta toma el control
function reactToEvent(data) {
  if (!rig) return;
  if (data.kind === 'gift') {
    const action = data.coins >= 100 ? 'celebrar' : data.coins >= 20 ? 'bailar' : 'saltar';
    if (!speech.active) {
      rig.setExpression('emocionado', 2600);
      rig.play(action);
    }
    if (data.coins >= 100) confetti(60);
    else sparkles(6);
  } else if (data.kind === 'follow') {
    if (!speech.active) {
      rig.setExpression('feliz', 2400);
      rig.play('saludar');
    }
    sparkles(5);
  } else if (data.kind === 'share') {
    if (!speech.active) {
      rig.setExpression('feliz', 2000);
      rig.play('aplaudir');
    }
  }
}

function addChatLine(data) {
  if (!currentConfig?.showChat) return;
  const line = document.createElement('div');
  line.className = 'ah-chat-line';
  line.innerHTML = `<b>${escapeHtml(data.nickname || data.uniqueId || '')}</b>${escapeHtml(data.text)}`;
  el.chat.appendChild(line);
  while (el.chat.children.length > 6) el.chat.firstElementChild.remove();
  setTimeout(() => line.remove(), 22000);
}

// =============================================================================================================================
// Conexión con TikTok y eventos en vivo
// =============================================================================================================================

function setStatus(status, message = '') {
  const labels = { unlinked: 'Desvinculado', linked: 'Vinculado', connecting: 'Conectando...', connected: 'Conectado', error: 'Error', disconnected: 'Desconectado' };
  el.statusBadge.textContent = labels[status] || status;
  el.statusBadge.className = `status-badge ${status}`;
  el.chipTiktok.dataset.state = status === 'connected' ? 'on' : status === 'linked' || status === 'connecting' ? 'warn' : 'off';
  if (message) el.connectionDetails.textContent = message;
}

async function restoreTiktokConnection() {
  el.username.disabled = true;
  el.connectBtn.disabled = true;
  try {
    const response = await fetch(`/api/tiktok-connection/${GAME_TYPE}`);
    if (!response.ok) return setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      el.username.value = `@${data.tiktok_username}`;
      el.connectBtn.disabled = false;
      setStatus('linked', `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
      window.interaktikResumeLive?.(GAME_TYPE, (info) => setStatus('connected', info.message || `Conectado a @${data.tiktok_username}.`));
    } else {
      setStatus('unlinked', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    setStatus('unlinked', 'No has vinculado un ID de TikTok Live.');
  }
}

async function connectLive() {
  const uniqueId = el.username.value.trim().replace(/^@/, '');
  if (!uniqueId) return setStatus('error', 'Primero vincula y guarda tu cuenta de TikTok.');

  el.connectBtn.disabled = true;
  setStatus('connecting', `Conectando a @${uniqueId}...`);
  try {
    const response = await fetch('/api/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uniqueId, gameType: GAME_TYPE }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo conectar.');
    setStatus(payload.status || 'connected', payload.message || 'Conectado al live.');
  } catch (error) {
    setStatus('error', error.message || 'No se pudo conectar.');
  } finally {
    el.connectBtn.disabled = false;
  }
}

async function disconnectLive() {
  el.disconnectBtn.disabled = true;
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    setStatus('disconnected', 'Conexion cerrada.');
  } finally {
    el.disconnectBtn.disabled = false;
  }
}

function connectEvents() {
  if (liveEventsSource) liveEventsSource.close();
  liveEventsSource = new EventSource(`/events?gameType=${GAME_TYPE}`);

  const on = (name, handler) => liveEventsSource.addEventListener(name, (event) => {
    try {
      handler(JSON.parse(event.data));
    } catch (error) {
      console.error(`[AIHOST] Evento ${name} ilegible:`, error);
    }
  });

  on('status', (payload) => {
    const known = ['connected', 'connecting', 'disconnected', 'error'];
    const status = payload.status === 'live_off' ? 'error' : (known.includes(payload.status) ? payload.status : 'disconnected');
    setStatus(status, payload.status === 'live_off' ? 'El live está apagado.' : (payload.message || ''));
  });
  on('ai-host-say', (payload) => {
    addFeed(payload);
    enqueueTalk(payload);
    refreshStatus();
  });
  on('ai-host-event', (payload) => {
    showAlertCard(payload);
    reactToEvent(payload);
  });
  on('ai-host-chat', addChatLine);
  on('ai-host-status', (payload) => {
    showNotice(payload.message, ['error', 'limit', 'no_key', 'tokens', 'low_tokens'].includes(payload.state) ? 'warn' : 'info');
    if (['tokens', 'low_tokens', 'model_fallback'].includes(payload.state)) refreshStatus();
  });
}

// =============================================================================================================================
// Panel: feed, estado, configuración
// =============================================================================================================================

function addFeed(data) {
  el.feed.querySelector('.ah-feed-empty')?.remove();
  const targets = Array.isArray(data.to) && data.to.length ? `<span>para ${escapeHtml(data.to.join(', '))}</span>` : '';
  const kinds = (data.kinds || []).map((kind) => ({ gift: 'regalo', follow: 'seguidor', comment: 'chat', share: 'compartido', member: 'entrada' }[kind] || kind));
  const tag = data.idle ? 'por iniciativa propia' : kinds.join(' · ');
  const item = document.createElement('li');
  item.className = 'ah-feed-item';
  item.innerHTML = `<div class="ah-feed-meta"><b>${escapeHtml(data.agentName || 'Agente')}</b>${targets}<span class="ah-feed-tag">${escapeHtml(tag)}</span><time>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div><p>${escapeHtml(data.text)}</p>`;
  el.feed.prepend(item);
  while (el.feed.children.length > 30) el.feed.lastElementChild.remove();
}

function showNotice(message, tone = 'info') {
  el.statusNote.hidden = !message;
  if (!message) return;
  el.statusNote.textContent = message;
  el.statusNote.dataset.tone = tone;
}

async function refreshStatus() {
  try {
    const status = await api('/status');
    el.statCalls.textContent = status.usage.calls;
    el.statCap.textContent = `de ${status.usage.cap}`;
    el.statQueue.textContent = status.queue;
    el.statCost.textContent = status.usage.costUsd > 0 && status.usage.costUsd < 0.01 ? '<$0.01' : `$${status.usage.costUsd.toFixed(2)}`;
    el.chipAI.dataset.state = !status.hasApiKey ? 'off' : status.enabled ? 'on' : 'warn';
    paintTokens(status.credit);

    if (!status.hasApiKey) showNotice('El servidor todavía no tiene la clave de la IA. Hay que agregar ANTHROPIC_API_KEY en el servidor para que el agente responda.', 'warn');
    else if (status.paused) showNotice('La IA no respondió varias veces seguidas. Reintentando en un momento...', 'warn');
    else if (status.lastError) showNotice(`Último error: ${status.lastError}`, 'warn');
    else if (status.usage.calls >= status.usage.cap) showNotice('Llegaste al tope de respuestas de hoy. Se reinicia mañana.', 'warn');
    else showNotice('');
  } catch (error) {
    // se vuelve a pedir en unos segundos
  }
}

// Tokens del plan (el superusuario no tiene limite)
function paintTokens(credit) {
  if (!credit) return;
  if (credit.unlimited) {
    el.statTokens.textContent = '∞';
    el.statTokensNote.textContent = 'sin límite';
    return;
  }
  const n = Number(credit.tokensRemaining) || 0;
  el.statTokens.textContent = n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} M` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n);
  const approx = credit.approxResponses || { haiku: 0, sonnet: 0 };
  el.statTokensNote.textContent = `≈ ${approx.haiku.toLocaleString('es')} con Haiku · ${approx.sonnet.toLocaleString('es')} con Sonnet`;
}

function startStatusPolling() {
  if (statusTimer) return;
  statusTimer = setInterval(() => {
    if (!document.hidden) refreshStatus();
  }, 6000);
}

function paintChips() {
  el.chipVoice.dataset.state = !window.speechSynthesis || voices.length === 0 ? 'off' : !el.speakHere.checked ? 'off' : userGesture ? 'on' : 'warn';
}

function fillSelect(select, entries) {
  select.innerHTML = entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
}

function paintEnabled(enabled) {
  el.enabledLabel.textContent = enabled ? 'Agente encendido' : 'Agente apagado';
}

function paintSliders() {
  el.rateOut.textContent = Number(el.rate.value).toFixed(2).replace(/0$/, '');
  el.pitchOut.textContent = Number(el.pitch.value).toFixed(2).replace(/0$/, '');
  el.volumeOut.textContent = `${Math.round(Number(el.volume.value) * 100)}%`;
}

// Aplica al escenario lo que depende de la configuración
function paintStage() {
  const accent = el.accent.value || '#7c5cff';
  document.documentElement.style.setProperty('--ah-accent', accent);
  el.stage.dataset.bg = el.background.value || 'studio';
  el.chat.hidden = !el.showChat.checked;
  el.subName.textContent = el.agentName.value.trim() || 'Nova';
  rig?.setAccent(accent);
}

function ensureRig() {
  const characterId = el.character_.value || 'mochi';
  if (rig && rig.characterId === characterId) return;
  rig?.destroy();
  rig = window.AiCharacter.create(el.character, { character: characterId, accent: el.accent.value || '#7c5cff', onEffect: handleEffect });
  rig.characterId = characterId;
}

function applyConfig(config) {
  currentConfig = config;
  el.enabled.checked = config.enabled;
  paintEnabled(config.enabled);
  el.character_.value = config.character;
  el.background.value = config.background;
  el.accent.value = config.accentColor;
  el.showChat.checked = config.showChat;
  el.agentName.value = config.agentName;
  el.language.value = config.language;
  el.tone.value = config.tone;
  el.persona.value = config.persona;
  el.about.value = config.aboutStreamer;
  el.replyMode.value = config.replyMode;
  el.thankGifts.checked = config.thankGifts;
  el.minGift.value = config.minGiftCoins;
  el.greetFollowers.checked = config.greetFollowers;
  el.greetViewers.checked = config.greetViewers;
  el.proactive.checked = config.proactive;
  el.proactiveMinutes.value = config.proactiveMinutes;
  el.cadence.value = config.cadenceSeconds;
  el.maxChars.value = config.maxChars;
  el.banned.value = config.bannedWords;
  el.rate.value = config.voiceRate;
  el.pitch.value = config.voicePitch;
  el.volume.value = config.voiceVolume;
  el.model.value = config.model;
  el.modelHint.textContent = MODEL_HINTS[config.model] || '';
  paintSliders();
  fillVoiceSelect();
  ensureRig();
  paintStage();
}

function readForm() {
  return {
    enabled: el.enabled.checked,
    character: el.character_.value,
    background: el.background.value,
    accentColor: el.accent.value,
    showChat: el.showChat.checked,
    agentName: el.agentName.value,
    language: el.language.value,
    tone: el.tone.value,
    persona: el.persona.value,
    aboutStreamer: el.about.value,
    replyMode: el.replyMode.value,
    thankGifts: el.thankGifts.checked,
    minGiftCoins: Number(el.minGift.value),
    greetFollowers: el.greetFollowers.checked,
    greetViewers: el.greetViewers.checked,
    proactive: el.proactive.checked,
    proactiveMinutes: Number(el.proactiveMinutes.value),
    cadenceSeconds: Number(el.cadence.value),
    maxChars: Number(el.maxChars.value),
    bannedWords: el.banned.value,
    voiceName: el.voice.value,
    voiceRate: Number(el.rate.value),
    voicePitch: Number(el.pitch.value),
    voiceVolume: Number(el.volume.value),
    model: el.model.value,
  };
}

function showSaveState(text, tone = '') {
  el.saveState.textContent = text;
  el.saveState.dataset.tone = tone;
  if (text) setTimeout(() => { if (el.saveState.textContent === text) el.saveState.textContent = ''; }, 3500);
}

async function loadConfig() {
  const data = await api('/config');
  fillSelect(el.language, Object.keys(data.languages).map((code) => [code, LANGUAGE_LABELS[code] || data.languages[code]]));
  fillSelect(el.tone, data.tones.map((tone) => [tone, TONE_LABELS[tone] || tone]));
  fillSelect(el.model, Object.entries(data.models));
  fillSelect(el.character_, Object.entries(data.characters));
  fillSelect(el.background, Object.entries(data.backgrounds));
  applyConfig(data.config);
}

async function saveConfig(event) {
  event?.preventDefault();
  el.saveBtn.disabled = true;
  showSaveState('Guardando...');
  try {
    const data = await api('/config', { method: 'PUT', body: JSON.stringify(readForm()) });
    applyConfig(data.config);
    showSaveState('Guardado. El agente usa los cambios desde su próxima respuesta.', 'ok');
  } catch (error) {
    showSaveState('');
    await showAlert(error.message, 'No se guardó');
  } finally {
    el.saveBtn.disabled = false;
  }
}

// El interruptor principal guarda al instante (es lo que se usa en vivo)
async function toggleEnabled() {
  paintEnabled(el.enabled.checked);
  try {
    const data = await api('/config', { method: 'PUT', body: JSON.stringify({ ...readForm(), enabled: el.enabled.checked }) });
    currentConfig = data.config;
    refreshStatus();
  } catch (error) {
    el.enabled.checked = !el.enabled.checked;
    paintEnabled(el.enabled.checked);
    await showAlert(error.message, 'No se pudo cambiar');
  }
}

async function sendTest(payload) {
  try {
    await api('/test', { method: 'POST', body: JSON.stringify(payload) });
  } catch (error) {
    await showAlert(error.message, 'No se pudo probar');
  }
}

async function resetMemory() {
  await api('/reset-memory', { method: 'POST', body: '{}' }).catch(() => {});
  el.feed.innerHTML = '<li class="ah-feed-empty">Memoria borrada. El agente empieza de cero.</li>';
}

// =============================================================================================================================
// Estudio de animación y demostración (todo local, sin IA)
// =============================================================================================================================

const DEMO_SCRIPT = [
  { text: '¡Hola a todos! Qué alegría tenerlos aquí en el live. Yo soy tu co-anfitrión y hoy nos vamos a divertir mucho.', emotion: 'feliz', action: 'saludar' },
  { event: { kind: 'gift', nickname: 'Ana', giftName: 'Rosa', count: 3, coins: 3 }, text: '¡Ana! Gracias por esas rosas, eres un sol. Me hiciste el día.', emotion: 'carino', action: 'corazon' },
  { chat: { nickname: 'Luis', text: '¿Qué juego vamos a jugar hoy?' }, text: 'Buena pregunta, Luis. Déjame pensar... creo que algo con muchas risas y poca presión.', emotion: 'pensando', action: 'pensar' },
  { event: { kind: 'gift', nickname: 'Carlos', giftName: 'León', count: 1, coins: 500 }, text: '¡No puede ser! ¡Un león! Carlos, eres una leyenda. ¡Esto hay que celebrarlo!', emotion: 'emocionado', action: 'celebrar' },
  { event: { kind: 'follow', nickname: 'María' }, text: 'Bienvenida a la familia, María. Qué gusto tenerte por aquí.', emotion: 'feliz', action: 'saludar' },
  { text: 'Jajaja, ustedes me hacen reír. Y recuerden: respiren hondo, que todo sale mejor con calma.', emotion: 'risa', action: 'asentir' },
  { text: 'Y ahora, un baile para animar el chat. ¡Vamos!', emotion: 'emocionado', action: 'bailar' },
];

let demoTimer = null;
let demoIndex = 0;

async function demoStep() {
  const step = DEMO_SCRIPT[demoIndex % DEMO_SCRIPT.length];
  demoIndex += 1;
  if (step.event) { showAlertCard(step.event); reactToEvent(step.event); await wait(900); }
  if (step.chat) { addChatLine(step.chat); await wait(700); }
  enqueueTalk({ text: step.text, emotion: step.emotion, action: step.action, agentName: currentConfig?.agentName });
  demoTimer = setTimeout(demoStep, 4000 + step.text.length * 70);
}

function toggleDemo() {
  if (demoTimer) {
    clearTimeout(demoTimer);
    demoTimer = null;
    el.demoBtn.textContent = 'Demostración con frases de ejemplo';
    return;
  }
  unlockSpeech();
  el.demoBtn.textContent = 'Detener demostración';
  demoStep();
}

function buildStudio() {
  const actions = Object.keys(ACTION_LABELS);
  el.actionBtns.innerHTML = actions.map((name) => `<button type="button" data-action="${name}">${ACTION_LABELS[name]}</button>`).join('');
  el.emotionBtns.innerHTML = Object.keys(EMOTION_LABELS).map((name) => `<button type="button" data-emotion="${name}">${EMOTION_LABELS[name]}</button>`).join('');
  el.actionBtns.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) rig?.play(button.dataset.action);
  });
  el.emotionBtns.addEventListener('click', (event) => {
    const button = event.target.closest('[data-emotion]');
    if (button) rig?.setExpression(button.dataset.emotion, 4000);
  });
}

// =============================================================================================================================
// Interfaz: panel, modo transmisión, voz
// =============================================================================================================================

function unlockSpeech() {
  if (userGesture) return;
  userGesture = true;
  el.veil.hidden = true;
  if (window.speechSynthesis) {
    const warmup = new SpeechSynthesisUtterance(' ');
    warmup.volume = 0;
    window.speechSynthesis.speak(warmup);
  }
  paintChips();
}

function setPanel(open) {
  document.body.classList.toggle('panel-open', open);
  try { localStorage.setItem('ah.panel', open ? '1' : '0'); } catch (error) { /* sin almacenamiento */ }
}

let panelBeforeClean = true;
function setClean(on) {
  if (on) panelBeforeClean = document.body.classList.contains('panel-open');
  document.body.classList.toggle('clean', on);
  if (!on) setPanel(panelBeforeClean);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function typing(target) {
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

function testVoice() {
  unlockSpeech();
  window.speechSynthesis?.cancel();
  voiceAudio?.pause();
  const name = el.agentName.value.trim() || 'Nova';
  const text = el.language.value === 'en' ? `Hi everyone! I'm ${name}, and I'll be reading your chat today.` : el.language.value === 'pt' ? `Oi pessoal! Eu sou ${name} e vou ler o chat de vocês hoje.` : `¡Hola a todos! Soy ${name} y hoy voy a leer el chat con ustedes.`;
  enqueueTalk({ text, emotion: 'feliz', action: 'saludar', agentName: name });
}

function bindEvents() {
  el.connectionForm.addEventListener('submit', (event) => event.preventDefault());
  el.connectBtn.addEventListener('click', connectLive);
  el.disconnectBtn.addEventListener('click', disconnectLive);

  el.form.addEventListener('submit', saveConfig);
  el.enabled.addEventListener('change', toggleEnabled);
  el.language.addEventListener('change', fillVoiceSelect);
  el.model.addEventListener('change', () => { el.modelHint.textContent = MODEL_HINTS[el.model.value] || ''; });
  for (const input of [el.rate, el.pitch, el.volume]) input.addEventListener('input', paintSliders);
  for (const input of [el.character_, el.background, el.accent, el.showChat, el.agentName]) {
    input.addEventListener('input', () => { ensureRig(); paintStage(); });
    input.addEventListener('change', () => { ensureRig(); paintStage(); });
  }
  el.speakHere.addEventListener('change', paintChips);
  initVoiceMode();
  el.testVoice.addEventListener('click', testVoice);

  el.testComment.addEventListener('click', () => {
    unlockSpeech();
    const text = el.testText.value.trim();
    if (text.length < 2) return el.testText.focus();
    sendTest({ kind: 'comment', text });
  });
  el.testText.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      el.testComment.click();
    }
  });
  el.testGift.addEventListener('click', () => { unlockSpeech(); sendTest({ kind: 'gift', giftName: 'Rosa', coins: 5 }); });
  el.testFollow.addEventListener('click', () => { unlockSpeech(); sendTest({ kind: 'follow' }); });
  el.reset.addEventListener('click', resetMemory);
  el.demoBtn.addEventListener('click', toggleDemo);

  el.togglePanel.addEventListener('click', () => setPanel(!document.body.classList.contains('panel-open')));
  el.clean.addEventListener('click', () => setClean(true));
  el.fullscreen.addEventListener('click', toggleFullscreen);
  el.veil.addEventListener('click', unlockSpeech);
  document.addEventListener('pointerdown', unlockSpeech, { once: true });
  document.addEventListener('keydown', (event) => {
    if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'h' || event.key === 'H') setClean(!document.body.classList.contains('clean'));
    else if (event.key === 'f' || event.key === 'F') toggleFullscreen();
  });
  // en modo transmision un clic o Escape devuelve el panel
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.body.classList.contains('clean')) setClean(false); });

  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  } else {
    el.voiceNote.textContent = 'Tu navegador no tiene voz. Usa Chrome o Edge.';
  }
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  let panelOpen = true;
  try { panelOpen = localStorage.getItem('ah.panel') !== '0'; } catch (error) { /* sin almacenamiento */ }
  document.body.classList.toggle('panel-open', panelOpen);
  if (params.get('clean') === '1') { panelBeforeClean = panelOpen; document.body.classList.add('clean'); }

  buildStudio();
  bindEvents();
  try {
    await loadConfig();
  } catch (error) {
    ensureRig();
    await showAlert(error.message, 'No se pudo cargar');
  }
  connectEvents();
  await restoreTiktokConnection();
  await refreshStatus();
  startStatusPolling();
  if (params.get('demo') === '1') toggleDemo();
})().finally(() => document.getElementById('pageLoader')?.setAttribute('hidden', ''));
