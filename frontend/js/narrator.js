// Narrador de comentarios: lee en voz alta los comentarios del live con la voz del navegador.
//
// Este archivo se carga en el panel Y en todas las paginas de juego: el narrador sigue funcionando mientras el streamer
// cambia de seccion o entra a cualquier juego. Para eso:
//  - "encendido" se guarda en este navegador (localStorage) y cada pagina que carga lo retoma sola;
//  - escucha los comentarios de la conexion de overlays Y de la conexion del juego en el que esta (el live puede estar
//    conectado por cualquiera de las dos);
//  - solo UNA pestana narra a la vez (Web Locks): si hay otra pestana abierta no se lee todo dos veces;
//  - si el navegador no deja hablar a una pagina recien abierta (necesita un clic), aparece un aviso para activarlo.
//
// Todo lo que llega es texto de desconocidos: solo se lee, nunca se interpreta como HTML ni como comando.
//
// A quien se lee: a todos, o solo a quienes cumplan ALGUNA de las condiciones marcadas (comunidad, seguidores, comando
// personalizado, regalo de mas de X monedas). El servidor adjunta a cada comentario lo que se sabe de quien comenta:
// comment.identity (sigue al streamer, etc.) y comment.viewer (regalos que ha mandado).
//
// La interfaz de ajustes vive en la seccion Herramientas (js/tools.js) y habla con este motor por window.IkNarrator.

(function narratorEngine() {
  if (window.IkNarrator) return;

  const SETTINGS_KEY = 'ik:tools:comment-reader';
  const ENABLED_KEY = 'ik:narrator:enabled';
  const LOCK_NAME = 'ik-narrator';
  const OVERLAY_TYPE = 'overlay';
  // Regalo con el que los espectadores se unen a la comunidad del streamer (no se puede cambiar)
  const COMMUNITY_GIFT = 'Quiéreme';
  const MAX_QUEUE = 6; // si llegan mas de los que se alcanzan a leer, se descartan los mas viejos para no ir atrasados
  const DUPLICATE_WINDOW_MS = 30000;

  const DEFAULTS = {
    voiceURI: '',
    rate: 1,
    pitch: 1,
    volume: 100,
    readName: true,
    ignoreCommands: true,
    replaceLinks: true,
    maxChars: 150,
    blockedWords: '',
    mutedUsers: '',
    audience: 'all', // all | conditions
    condCommunity: false,
    condFollowers: false,
    condCommand: false,
    commandText: '!lee',
    condGift: false,
    giftMinCoins: 100,
  };

  // Pagina -> tipo de conexion del juego (igual que runtime.js). El panel no es un juego: solo usa la de overlays.
  const PAGE_GAME_TYPES = {
    'snake-vs-snake': 'snake', 'gta-rampa': 'gtarampa', 'minecraft-cubo': 'minecraftcubo', 'roblox-dance': 'roblox',
    'roblox-parkour': 'robloxparkour', 'roblox-fighters': 'robloxfighters', 'roblox-f1': 'robloxf1', 'shell-game': 'shellgame', 'boy-vs-girl': 'boyvsgirl',
    kingdoms: 'kingdoms', dominance: 'dominance', race: 'race', gta: 'gta', minecraft: 'minecraft', app: 'app',
  };

  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const pageName = window.location.pathname.toLowerCase().replace(/\.html$/, '').split('/').pop();
  const pageGameType = PAGE_GAME_TYPES[pageName] || '';
  const isPanel = pageName === 'platform';

  let settings = loadSettings();
  let enabled = readEnabled();
  let holdsLock = false;
  let lockAbort = null;
  let releaseLock = null;
  const sources = new Map(); // gameType -> EventSource
  let overlayState = { status: 'unknown', uniqueId: '' };
  let gameState = { status: 'unknown', uniqueId: '' };
  let voices = [];
  let speaking = false;
  let blocked = false;
  let speakingTimer = null;
  const queue = [];
  const recent = new Map(); // "usuario|texto" -> hora del ultimo comentario igual (tambien evita leer dos veces el mismo comentario que llega por dos conexiones)
  const subscribers = new Set();
  let reconnecting = false;

  // ---------- ajustes y estado guardados (solo de este navegador: las voces cambian de un equipo a otro) ----------

  function loadSettings() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
    } catch (_error) {
      return { ...DEFAULTS };
    }
  }

  function readEnabled() {
    try {
      return window.localStorage.getItem(ENABLED_KEY) === '1';
    } catch (_error) {
      return false;
    }
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function cleanSettings(input) {
    return {
      voiceURI: String(input.voiceURI || ''),
      rate: clampNumber(input.rate, 0.6, 1.6, 1),
      pitch: clampNumber(input.pitch, 0.5, 1.5, 1),
      volume: clampNumber(input.volume, 0, 100, 100),
      readName: input.readName !== false,
      ignoreCommands: input.ignoreCommands !== false,
      replaceLinks: input.replaceLinks !== false,
      maxChars: Math.round(clampNumber(input.maxChars, 20, 300, 150)),
      blockedWords: String(input.blockedWords || '').slice(0, 1000),
      mutedUsers: String(input.mutedUsers || '').slice(0, 1000),
      audience: input.audience === 'conditions' ? 'conditions' : 'all',
      condCommunity: Boolean(input.condCommunity),
      condFollowers: Boolean(input.condFollowers),
      condCommand: Boolean(input.condCommand),
      commandText: String(input.commandText || '').slice(0, 30),
      condGift: Boolean(input.condGift),
      giftMinCoins: Math.round(clampNumber(input.giftMinCoins, 0, 1000000, 100)),
    };
  }

  function setSettings(partial) {
    settings = cleanSettings({ ...settings, ...partial });
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_error) {
      // sin almacenamiento: los ajustes solo duran mientras la pagina esta abierta
    }
    notify();
    return { ...settings };
  }

  // ---------- voces ----------

  function sortedVoices() {
    // Primero las voces en espanol, luego el resto por nombre
    return voices.slice().sort((a, b) => {
      const aEs = /^es\b|^es[-_]/i.test(a.lang) ? 0 : 1;
      const bEs = /^es\b|^es[-_]/i.test(b.lang) ? 0 : 1;
      return aEs - bEs || a.name.localeCompare(b.name);
    });
  }

  function currentVoice() {
    const list = sortedVoices();
    return list.find((voice) => voice.voiceURI === settings.voiceURI)
      || list.find((voice) => /^es\b|^es[-_]/i.test(voice.lang))
      || list[0]
      || null;
  }

  function refreshVoices() {
    if (!supported) return;
    voices = window.speechSynthesis.getVoices();
    notify();
  }

  // ---------- limpieza y filtros ----------

  function fold(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function splitList(text) {
    return String(text || '')
      .split(/[,\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function containsBlockedWord(text) {
    const haystack = fold(text);
    return splitList(settings.blockedWords).some((word) => {
      const needle = fold(word).trim();
      if (!needle) return false;
      // Palabra completa (o frase): "ass" no bloquea "class"
      return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(haystack);
    });
  }

  function isMutedUser(user) {
    const id = fold(user?.uniqueId).replace(/^@/, '');
    if (!id) return false;
    return splitList(settings.mutedUsers).some((entry) => fold(entry).replace(/^@/, '') === id);
  }

  // Quita emojis y simbolos (la voz los lee como "cara sonriente..."), acorta letras repetidas y arregla enlaces
  function cleanText(raw) {
    let text = String(raw || '');
    if (settings.replaceLinks) {
      text = text.replace(/(?:https?:\/\/|www\.)\S+/gi, ' enlace ');
    }
    return text
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}‍️]/gu, ' ')
      .replace(/(.)\1{3,}/gu, '$1$1$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function speakableName(user) {
    const nickname = String(user?.nickname || '').replace(/[^\p{L}\p{N}\s'’.-]/gu, ' ').replace(/\s+/g, ' ').trim();
    const fallback = String(user?.uniqueId || '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (nickname || fallback || 'alguien').slice(0, 30);
  }

  // ---------- a quien se lee ----------

  // "!lee hola bro" con el comando "!lee" -> { text: 'hola bro' }; si no empieza con el comando, null.
  // El comando solo cuenta si va seguido de un espacio (o es todo el mensaje): "!leer" no activa a "!lee".
  function matchCustomCommand(original) {
    if (!settings.condCommand) return null;
    const command = settings.commandText.trim();
    if (!command) return null;

    if (fold(original.slice(0, command.length)) !== fold(command)) return null;
    const next = original.charAt(command.length);
    if (next && !/\s/.test(next)) return null;

    return { text: original.slice(command.length).trim() };
  }

  function sentGiftMatching(viewer, giftName) {
    const needle = fold(giftName).trim();
    if (!needle) return false;
    return (viewer?.gifts || []).some((gift) => fold(gift.name).includes(needle));
  }

  // true si, con las condiciones marcadas, a esta persona se le lee (basta con cumplir una)
  function meetsAnyCondition(comment) {
    const identity = comment.identity || {};
    const viewer = comment.viewer || {};

    if (settings.condFollowers && (identity.follower || viewer.followedLive)) return true;
    if (settings.condCommunity && sentGiftMatching(viewer, COMMUNITY_GIFT)) return true;
    if (settings.condGift && Number(viewer.maxGiftCoins) > settings.giftMinCoins) return true;
    return false;
  }

  // Devuelve { speech } si se lee, o { skip: 'motivo' } si se omite
  function evaluate(comment) {
    const original = String(comment?.comment || '').trim();
    if (!original) return { skip: 'vacío' };

    let body = original;

    if (settings.audience === 'conditions') {
      const command = matchCustomCommand(original);
      let allowed;
      if (command) {
        // Con el comando personalizado se lee solo lo que viene despues de el
        if (!command.text) return { skip: 'comando sin mensaje' };
        body = command.text;
        allowed = true;
      } else {
        allowed = meetsAnyCondition(comment);
      }
      if (!allowed) return { skip: 'no cumple las condiciones' };
    }

    if (settings.ignoreCommands && /^[!/]/.test(body)) return { skip: 'comando' };
    if (isMutedUser(comment.user)) return { skip: 'usuario silenciado' };
    if (containsBlockedWord(body)) return { skip: 'palabra bloqueada' };

    let text = cleanText(body);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return { skip: 'solo emojis o símbolos' };

    // La misma persona repitiendo lo mismo en poco tiempo (spam) se lee una sola vez
    const now = Date.now();
    const key = `${fold(comment.user?.uniqueId)}|${fold(text)}`;
    for (const [oldKey, at] of recent) {
      if (now - at > DUPLICATE_WINDOW_MS) recent.delete(oldKey);
    }
    if (recent.has(key)) return { skip: 'repetido' };
    recent.set(key, now);

    if (text.length > settings.maxChars) {
      text = `${text.slice(0, settings.maxChars).replace(/\s+\S*$/, '')}…`;
    }

    return { speech: settings.readName ? `${speakableName(comment.user)} dice: ${text}` : text };
  }

  // ---------- hablar ----------

  function stopSpeaking() {
    queue.length = 0;
    speaking = false;
    clearTimeout(speakingTimer);
    try { window.speechSynthesis.cancel(); } catch (_error) { /* nada */ }
  }

  function speak(speech, onFinish) {
    const utterance = new SpeechSynthesisUtterance(speech);
    const voice = currentVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'es-ES';
    }
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume / 100;

    let done = false;
    const finish = (wasBlocked) => {
      if (done) return;
      done = true;
      clearTimeout(speakingTimer);
      onFinish(wasBlocked);
    };

    utterance.onend = () => finish(false);
    utterance.onerror = (event) => finish(Boolean(event && event.error === 'not-allowed'));

    // Red de seguridad: en algunos navegadores una frase puede quedarse trabada sin avisar; se corta y se sigue
    clearTimeout(speakingTimer);
    speakingTimer = setTimeout(() => {
      try { window.speechSynthesis.cancel(); } catch (_error) { /* nada */ }
      finish(false);
    }, 6000 + speech.length * 140);

    try {
      window.speechSynthesis.speak(utterance);
    } catch (_error) {
      finish(false);
    }
  }

  function speakNext() {
    if (speaking || blocked || !enabled || !holdsLock || !queue.length) return;

    const job = queue.shift();
    speaking = true;
    speak(job.speech, (wasBlocked) => {
      speaking = false;
      if (wasBlocked) {
        // El navegador no deja hablar a una pagina sin clic: el comentario se conserva y se lee en cuanto el streamer haga clic
        queue.unshift(job);
        setBlocked(true);
        return;
      }
      setTimeout(speakNext, 150);
    });
  }

  function handleComment(comment) {
    const outcome = evaluate(comment);
    if (outcome.skip) return;

    queue.push({ speech: outcome.speech });
    while (queue.length > MAX_QUEUE) queue.shift();
    speakNext();
  }

  // Un clic en cualquier parte de la pagina vale como permiso: se retoma lo que estaba esperando
  function setBlocked(value) {
    if (blocked === value) return;
    blocked = value;
    notify();
    if (value) {
      const resume = () => {
        window.removeEventListener('pointerdown', resume, true);
        window.removeEventListener('keydown', resume, true);
        setBlocked(false);
        speakNext();
      };
      window.addEventListener('pointerdown', resume, true);
      window.addEventListener('keydown', resume, true);
    }
  }

  // Con el primer clic o tecla de la pagina se "desbloquea" la voz de antemano, asi no hace falta un clic extra despues
  let unlockArmed = false;
  function armUnlock() {
    if (unlockArmed || !supported) return;
    unlockArmed = true;
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      try {
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      } catch (_error) { /* nada */ }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  // ---------- conexion con los comentarios del live ----------

  function listeningTypes() {
    // En un juego: su propia conexion y la de overlays (el live puede estar conectado por cualquiera de las dos).
    // En el panel: la de overlays.
    return pageGameType ? [pageGameType, OVERLAY_TYPE] : [OVERLAY_TYPE];
  }

  function closeSources() {
    for (const source of sources.values()) source.close();
    sources.clear();
  }

  function onStatus(gameType, payload) {
    const state = { status: String(payload?.status || 'unknown'), uniqueId: String(payload?.uniqueId || '') };
    if (gameType === OVERLAY_TYPE) overlayState = state;
    else gameState = state;
    notify();
  }

  async function openSources() {
    closeSources();
    if (!enabled || !holdsLock) return;

    for (const gameType of listeningTypes()) {
      // Pedir el estado primero deja guardada la clave firmada del canal (runtime.js), igual que en las paginas de juegos
      try { await fetch(`/api/status?gameType=${gameType}`); } catch (_error) { /* se intenta igual */ }
      if (!enabled || !holdsLock) return;

      const source = new EventSource(`/events?gameType=${gameType}`);
      sources.set(gameType, source);

      source.addEventListener('status', (event) => {
        try { onStatus(gameType, JSON.parse(event.data)); } catch (_error) { /* mensaje raro: se ignora */ }
      });
      source.addEventListener('comment', (event) => {
        if (!enabled || !holdsLock) return;
        try { handleComment(JSON.parse(event.data)); } catch (_error) { /* mensaje raro: se ignora */ }
      });
      source.addEventListener('error', () => {
        reconnecting = source.readyState === EventSource.CONNECTING;
        notify();
      });
      source.addEventListener('open', () => {
        reconnecting = false;
        notify();
      });
    }
  }

  // ---------- una sola pestana narra a la vez ----------

  function acquireLock() {
    if (holdsLock || lockAbort) return;

    if (!navigator.locks || typeof navigator.locks.request !== 'function') {
      holdsLock = true; // sin Web Locks no hay forma de coordinar: se narra en esta pagina
      openSources();
      notify();
      return;
    }

    lockAbort = new AbortController();
    navigator.locks.request(LOCK_NAME, { signal: lockAbort.signal }, () => new Promise((resolve) => {
      holdsLock = true;
      releaseLock = resolve;
      lockAbort = null;
      openSources();
      notify();
    })).catch(() => { /* cancelado al apagar el narrador */ });
    notify();
  }

  function dropLock() {
    if (lockAbort) {
      lockAbort.abort();
      lockAbort = null;
    }
    if (releaseLock) {
      releaseLock();
      releaseLock = null;
    }
    holdsLock = false;
  }

  // ---------- encender / apagar ----------

  function applyEnabled() {
    if (enabled && supported) {
      armUnlock();
      acquireLock();
    } else {
      dropLock();
      closeSources();
      stopSpeaking();
      setBlocked(false);
    }
    notify();
  }

  function setEnabled(value) {
    enabled = Boolean(value) && supported;
    try {
      window.localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
    } catch (_error) { /* sin almacenamiento: solo vale para esta pagina */ }
    applyEnabled();
  }

  function testVoice() {
    try { window.speechSynthesis.cancel(); } catch (_error) { /* nada */ }
    speaking = false;
    speak(settings.readName ? 'Ana dice: hola a todos, así sonará el lector de comentarios.' : 'Hola a todos, así sonará el lector de comentarios.', (wasBlocked) => {
      if (wasBlocked) setBlocked(true);
    });
  }

  // ---------- estado para la interfaz ----------

  // Lo que se muestra: la conexion que este activa (la del juego o la de overlays)
  function connectionInfo() {
    if (gameState.status === 'connected') return gameState;
    if (overlayState.status === 'connected') return overlayState;
    return overlayState.status !== 'unknown' ? overlayState : gameState;
  }

  function snapshot() {
    const connection = connectionInfo();
    const connected = connection.status === 'connected';
    let status;

    if (!supported) {
      status = { text: 'Tu navegador no puede leer en voz alta. Prueba con Chrome, Edge o Safari actualizados.', tone: 'warn', goOverlays: false };
    } else if (!enabled) {
      status = { text: 'Apagado. Enciéndelo cuando estés por empezar tu live.', tone: 'info', goOverlays: false };
    } else if (!holdsLock) {
      status = { text: 'El narrador ya está funcionando en otra pestaña de este navegador. Aquí queda en espera.', tone: 'info', goOverlays: false };
    } else if (blocked) {
      status = { text: 'El navegador bloqueó el audio. Haz clic en cualquier parte de la página para activarlo.', tone: 'warn', goOverlays: false };
    } else if (reconnecting) {
      status = { text: 'Se cortó la conexión con el servidor. Reconectando…', tone: 'warn', goOverlays: false };
    } else if (connected) {
      status = { text: `Escuchando los comentarios${connection.uniqueId ? ` de @${connection.uniqueId}` : ''}.`, tone: 'ok', goOverlays: false };
    } else if (connection.status === 'unknown') {
      status = { text: 'Conectando con tus comentarios…', tone: 'info', goOverlays: false };
    } else {
      status = { text: 'Encendido, pero tu TikTok Live no está conectado todavía. Conéctalo en Overlays (o activa la conexión automática) y empezará a leer.', tone: 'warn', goOverlays: true };
    }

    return {
      supported,
      enabled,
      active: enabled && holdsLock,
      blocked,
      status,
      live: { status: overlayState.status === 'unknown' ? gameState.status : overlayState.status, uniqueId: overlayState.uniqueId || gameState.uniqueId },
      connection,
      settings: { ...settings },
      voices: sortedVoices().map((voice) => ({ voiceURI: voice.voiceURI, name: voice.name, lang: voice.lang })),
      currentVoiceURI: currentVoice()?.voiceURI || '',
    };
  }

  function notify() {
    updatePill();
    const state = snapshot();
    subscribers.forEach((callback) => {
      try { callback(state); } catch (_error) { /* un oyente roto no afecta a los demas */ }
    });
  }

  function subscribe(callback) {
    subscribers.add(callback);
    callback(snapshot());
    return () => subscribers.delete(callback);
  }

  // ---------- aviso flotante dentro de los juegos ----------
  // En el panel el estado se ve en Herramientas; dentro de un juego, un avisito discreto muestra que el narrador sigue
  // activo y deja apagarlo (o activar el audio si el navegador lo bloqueo).

  let pill = null;

  function ensurePill() {
    if (pill || isPanel || !document.body) return;

    if (!document.getElementById('ikNarratorStyle')) {
      const style = document.createElement('style');
      style.id = 'ikNarratorStyle';
      style.textContent = `
        .ik-narrator-pill{position:fixed;left:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:10px;max-width:min(92vw,420px);
          padding:8px 10px 8px 14px;border-radius:999px;border:1px solid rgba(148,163,184,.35);background:rgba(15,19,32,.94);color:#e2e8f0;
          font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)}
        .ik-narrator-pill[data-tone="ok"]{border-color:rgba(34,197,94,.45)}
        .ik-narrator-pill[data-tone="warn"]{border-color:rgba(245,158,11,.55)}
        .ik-narrator-pill .ik-narrator-dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#94a3b8}
        .ik-narrator-pill[data-tone="ok"] .ik-narrator-dot{background:#4ade80;box-shadow:0 0 0 3px rgba(34,197,94,.22)}
        .ik-narrator-pill[data-tone="warn"] .ik-narrator-dot{background:#fbbf24}
        .ik-narrator-pill .ik-narrator-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ik-narrator-pill button{flex:0 0 auto;cursor:pointer;border:1px solid rgba(148,163,184,.4);background:transparent;color:inherit;border-radius:999px;
          padding:5px 11px;font:600 12px system-ui,sans-serif}
        .ik-narrator-pill button:hover{background:rgba(148,163,184,.16)}
      `;
      document.head.appendChild(style);
    }

    pill = document.createElement('div');
    pill.className = 'ik-narrator-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.hidden = true;
    pill.innerHTML = '<span class="ik-narrator-dot" aria-hidden="true"></span><span class="ik-narrator-text"></span><button type="button">Apagar</button>';
    pill.querySelector('button').addEventListener('click', () => setEnabled(false));
    document.body.appendChild(pill);
  }

  function updatePill() {
    if (isPanel) return;
    if (!enabled || !supported) {
      if (pill) pill.hidden = true;
      return;
    }

    ensurePill();
    if (!pill) return;

    const state = snapshot();
    let text = '🔊 Narrador encendido';
    if (!holdsLock) text = '🔊 Narrador activo en otra pestaña';
    else if (blocked) text = '🔊 Haz clic para activar el audio del narrador';
    else if (state.connection.status === 'connected') text = `🔊 Narrador leyendo${state.connection.uniqueId ? ` · @${state.connection.uniqueId}` : ''}`;
    else if (state.connection.status !== 'unknown') text = '🔊 Narrador encendido · sin live conectado';

    pill.querySelector('.ik-narrator-text').textContent = text;
    pill.dataset.tone = blocked || (holdsLock && state.connection.status !== 'connected' && state.connection.status !== 'unknown') ? 'warn' : (state.connection.status === 'connected' ? 'ok' : 'info');
    pill.hidden = false;
  }

  // ---------- arranque ----------

  if (supported) {
    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } else {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }

  // Si el narrador se enciende o apaga (o cambian los ajustes) en otra pestana, esta pagina se entera
  window.addEventListener('storage', (event) => {
    if (event.key === ENABLED_KEY) {
      const next = event.newValue === '1';
      if (next !== enabled) {
        enabled = next && supported;
        applyEnabled();
      }
    } else if (event.key === SETTINGS_KEY) {
      settings = loadSettings();
      notify();
    }
  });

  // Al salir de la pagina se corta lo que se estaba diciendo; la pagina siguiente retoma el narrador sola
  window.addEventListener('pagehide', () => {
    try { window.speechSynthesis.cancel(); } catch (_error) { /* nada */ }
  });

  window.IkNarrator = {
    supported,
    subscribe,
    getState: snapshot,
    setEnabled,
    setSettings,
    testVoice,
    // Para pruebas: procesa un comentario como si hubiera llegado del live
    _handleComment: handleComment,
  };

  const start = () => {
    if (enabled) applyEnabled();
    else notify();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
