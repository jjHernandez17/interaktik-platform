(function () {
  let apiBaseUrl = window.API_BASE_URL || window.__INTERAKTIK_API_BASE_URL__ || '';

  // Si no está definida o está vacía, construir dinámicamente
  if (!apiBaseUrl) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.host;
    apiBaseUrl = `${protocol}//${host}`;
  }

  function withBase(url) {
    if (typeof url !== 'string') {
      return url;
    }

    // /api/* se deja relativa a propósito: en produccion, vercel.json la
    // reescribe hacia el backend de Railway por detras sin que el navegador
    // note que son dominios distintos, para que la cookie de sesion sea de
    // PRIMERA parte (si no, Incognito/Safari con bloqueo de cookies de
    // terceros la descarta y el login queda en loop). /events NO pasa por
    // ese proxy (son conexiones SSE largas, mal soportadas por el proxy de
    // Vercel) y sigue yendo directo a Railway con la URL completa.
    if (url.startsWith('/events')) {
      return `${apiBaseUrl}${url}`;
    }

    return url;
  }

  function isFrontendAssetOrPage(url) {
    return typeof url === 'string' && (
      url.startsWith('/') && (
        url.endsWith('.html') ||
        url.endsWith('.css') ||
        url.endsWith('.js') ||
        url.includes('/assets/')
      )
    );
  }

  // ===== Acceso firmado al canal de eventos (/events) =====
  // /events va directo a Railway (otro dominio), asi que en muchos navegadores llega SIN la cookie de sesion y el servidor
  // lo toma por un visitante nuevo: el juego aparece "desconectado" y NO recibe regalos aunque el live este conectado.
  // El servidor entrega, en /api/connect, /api/status y /api/tiktok-connection/*, la clave de la conexion del usuario con
  // una firma que solo el sabe generar; aqui se guarda y se manda al abrir el canal para no depender de la cookie.
  const ACCESS_STORAGE_PREFIX = 'ik:events-access:';
  const eventsAccess = {};

  function readStoredAccess(gameType) {
    try {
      const raw = window.localStorage.getItem(ACCESS_STORAGE_PREFIX + gameType);
      if (!raw) return null;
      const value = JSON.parse(raw);
      return value && value.ownerKey && value.eventsToken ? value : null;
    } catch (error) {
      return null;
    }
  }

  function rememberEventsAccess(gameType, data) {
    if (!gameType || !data || !data.ownerKey || !data.eventsToken) return;
    const value = { ownerKey: String(data.ownerKey), eventsToken: String(data.eventsToken) };
    eventsAccess[gameType] = value;
    try { window.localStorage.setItem(ACCESS_STORAGE_PREFIX + gameType, JSON.stringify(value)); } catch (error) { /* sin almacenamiento */ }
  }

  function getEventsAccess(gameType) {
    if (!eventsAccess[gameType]) {
      const stored = readStoredAccess(gameType);
      if (stored) eventsAccess[gameType] = stored;
    }
    return eventsAccess[gameType] || null;
  }

  // Al iniciar/cerrar sesion se descartan las claves guardadas (podria entrar otra cuenta en este mismo navegador)
  if (/\/(login|register|forgot-password|reset-password)(\.html)?$/i.test(window.location.pathname)) {
    try {
      Object.keys(window.localStorage).forEach((key) => {
        if (key.indexOf(ACCESS_STORAGE_PREFIX) === 0 || key.indexOf('ik:last-gift:') === 0) window.localStorage.removeItem(key);
      });
    } catch (error) { /* sin almacenamiento */ }
  }

  function gameTypeFromApiUrl(calledUrl) {
    let match = /\/api\/tiktok-connection\/([a-z0-9-]+)/i.exec(calledUrl);
    if (match) return match[1].toLowerCase();
    match = /[?&]gameType=([a-z0-9-]+)/i.exec(calledUrl);
    return match ? match[1].toLowerCase() : '';
  }

  // ===== Ultima conexion pedida desde esta pagina (para reconectar sola si el live se corta) =====
  let lastConnectRequest = null; // { gameType, body }

  function noteLiveAction(calledUrl, init) {
    if (/\/api\/disconnect\b/.test(calledUrl)) {
      window.__interaktikLiveActionAt = Date.now();
      lastConnectRequest = null; // el streamer lo cerro: no se reconecta
      return;
    }

    if (/\/api\/connect\b/.test(calledUrl)) {
      window.__interaktikLiveActionAt = Date.now();
      try {
        if (init && typeof init.body === 'string') {
          const parsed = JSON.parse(init.body);
          if (parsed && parsed.uniqueId && parsed.gameType) {
            lastConnectRequest = { gameType: String(parsed.gameType).toLowerCase(), body: init.body };
          }
        }
      } catch (error) { /* cuerpo que no es JSON */ }
      return;
    }

    if (/\/api\/tiktok-connection\//.test(calledUrl)) {
      window.__interaktikLiveActionAt = Date.now();
      if (init && String(init.method || '').toUpperCase() === 'DELETE') lastConnectRequest = null;
    }
  }

  const originalFetch = window.fetch.bind(window);

  // Guarda la clave firmada que el servidor devuelve en sus respuestas de conexion/estado
  function trackApiResponse(calledUrl, promise) {
    if (!/\/api\/(status|connect|tiktok-connection\/)/.test(calledUrl)) return promise;

    return promise.then((response) => {
      try {
        const type = (response && response.headers && response.headers.get('content-type')) || '';
        if (response && response.ok && /json/i.test(type)) {
          response.clone().json().then((data) => {
            rememberEventsAccess(String((data && data.gameType) || gameTypeFromApiUrl(calledUrl)).toLowerCase(), data);
          }).catch(() => {});
        }
      } catch (error) { /* es solo informativo */ }
      return response;
    });
  }

  // Peticion propia de este archivo hacia la API (no cuenta como accion del streamer)
  function apiRequest(path, options) {
    const target = withBase(path);
    return originalFetch(target, Object.assign({ credentials: 'include' }, options || {}))
      .then((response) => trackApiResponse(path, Promise.resolve(response)));
  }

  window.fetch = function fetchWithApiBase(input, init = {}) {
    let calledUrl = '';
    try {
      calledUrl = typeof input === 'string' ? input : (input && input.url) || '';
      noteLiveAction(calledUrl, init);
    } catch (error) { /* solo es una marca informativa */ }

    let promise;

    if (typeof input === 'string') {
      const targetUrl = withBase(input);

      // Cookies cross-origin solo hacia nuestra propia API (frontend y backend
      // pueden vivir en dominios distintos, ej. Vercel + Railway) — nunca hacia
      // un origen ajeno que la página llame a fetch (ej. herramientas de dev).
      if (targetUrl.startsWith(apiBaseUrl)) {
        init.credentials = init.credentials || 'include';
      }

      if (targetUrl !== input) {
        console.info(`[fetch] API request: ${input} -> ${targetUrl}`);
      } else if (isFrontendAssetOrPage(input)) {
        console.debug(`[fetch] Frontend request passthrough: ${input}`);
      }

      promise = originalFetch(targetUrl, init);
    } else if (input && typeof input.url === 'string') {
      const targetUrl = withBase(input.url);

      if (targetUrl.startsWith(apiBaseUrl)) {
        init.credentials = init.credentials || 'include';
      }

      if (targetUrl !== input.url) {
        console.info(`[fetch] API request: ${input.url} -> ${targetUrl}`);
      } else if (isFrontendAssetOrPage(input.url)) {
        console.debug(`[fetch] Frontend request passthrough: ${input.url}`);
      }

      const request = new Request(targetUrl, input);
      promise = originalFetch(request, init);
    } else {
      promise = originalFetch(input, init);
    }

    return trackApiResponse(calledUrl, promise);
  };

  // ===== Canal de eventos: acceso firmado, reanudacion y regalos sin repetir =====
  // Juegos cuya pagina aplica los regalos ella misma: al reabrir el canal piden lo que se perdio desde el ultimo regalo recibido
  const RESUME_GAME_TYPES = ['snake', 'race', 'dominance', 'shellgame', 'boyvsgirl', 'app', 'kingdoms'];
  const RESUME_MAX_AGE_MS = 3 * 60 * 1000;

  function readResumeId(gameType) {
    try {
      const raw = window.localStorage.getItem('ik:last-gift:' + gameType);
      if (!raw) return '';
      const value = JSON.parse(raw);
      if (!value || !value.id || Date.now() - Number(value.at || 0) > RESUME_MAX_AGE_MS) return '';
      return String(value.id);
    } catch (error) {
      return '';
    }
  }

  function saveResumeId(gameType, id) {
    try { window.localStorage.setItem('ik:last-gift:' + gameType, JSON.stringify({ id: String(id), at: Date.now() })); } catch (error) { /* sin almacenamiento */ }
  }

  const OriginalEventSource = window.EventSource;
  window.EventSource = function EventSourceWithApiBase(url, config = {}) {
    let targetUrl = withBase(url);

    if (targetUrl.startsWith(apiBaseUrl)) {
      config.withCredentials = true;
    }

    let gameType = '';
    try {
      const parsed = new URL(targetUrl, window.location.href);
      if (parsed.pathname === '/events') {
        gameType = (parsed.searchParams.get('gameType') || 'app').toLowerCase();

        if (!parsed.searchParams.get('ownerKey')) {
          const access = getEventsAccess(gameType);
          if (access) {
            parsed.searchParams.set('ownerKey', access.ownerKey);
            parsed.searchParams.set('token', access.eventsToken);
          }
        }

        if (RESUME_GAME_TYPES.indexOf(gameType) !== -1 && !parsed.searchParams.get('lastEventId')) {
          const resumeId = readResumeId(gameType);
          if (resumeId) parsed.searchParams.set('lastEventId', resumeId);
        }

        targetUrl = parsed.toString();
      }
    } catch (error) { /* url rara: se usa tal cual */ }

    console.info(`[sse] EventSource request: ${url} -> ${targetUrl}`);
    const source = new OriginalEventSource(targetUrl, config);

    // Cada oyente de 'gift' recibe cada regalo una sola vez (un reenvio tras un corte no lo duplica) y se recuerda el ultimo id
    if (gameType) {
      const originalAdd = source.addEventListener.bind(source);
      source.addEventListener = function (type, listener, options) {
        if (type !== 'gift' || typeof listener !== 'function') {
          return originalAdd(type, listener, options);
        }

        const seen = new Set();
        return originalAdd(type, function (event) {
          const id = event && event.lastEventId;
          if (id) {
            if (seen.has(id)) return undefined;
            seen.add(id);
            if (seen.size > 500) seen.delete(seen.values().next().value);
            saveResumeId(gameType, id);
          }
          return listener.call(this, event);
        }, options);
      };
    }

    try { watchLiveSource(source, targetUrl); } catch (error) { console.warn('[live-alert] no se pudo vigilar el live:', error); }
    return source;
  };

  // ===== Aviso de live desconectado =====
  // Si un live que estaba conectado se corta (se acabo la transmision, TikTok cerro la conexion, el servidor se reinicio...)
  // y no fue el streamer quien pulso Desconectar, aparece una alerta con sonido hasta que la cierre, y se intenta reconectar solo.
  const GAME_LABELS = {
    app: 'Torres', race: 'Carrera', snake: 'Snake vs Snake', dominance: 'Dominance', shellgame: 'Dónde está la bola',
    boyvsgirl: 'Chicos vs Chicas', kingdoms: 'Battle of Kingdoms', gta: 'GTA V', gtarampa: 'Montaña Imposible',
    minecraft: 'Minecraft', minecraftcubo: 'Cubecraft', roblox: 'Roblox', robloxparkour: 'Roblox Parkour', robloxfighters: 'Pelea Callejera',
    overlay: 'Overlays',
  };
  const LIVE_GONE_STATES = ['disconnected', 'error', 'live_off'];
  const wasConnected = {};
  let alertEl = null;
  let alertGame = '';
  let alertNote = null;
  let alertTimer = null;
  let alertMuted = false;
  let audioCtx = null;
  const originalTitle = document.title;

  function ensureAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (error) {
      audioCtx = null;
    }
    return audioCtx;
  }

  // Los navegadores solo dejan sonar el audio despues de un gesto del usuario (pulsar Conectar ya cuenta)
  ['pointerdown', 'keydown', 'touchstart'].forEach((name) => {
    window.addEventListener(name, ensureAudio, { passive: true });
  });

  function beep(ctx, start, freq, length) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  function playAlarm() {
    if (alertMuted) return;
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    beep(ctx, now, 880, 0.22);
    beep(ctx, now + 0.28, 660, 0.22);
    beep(ctx, now + 0.56, 880, 0.22);
    beep(ctx, now + 0.84, 660, 0.22);
  }

  function ensureAlertStyles() {
    if (document.getElementById('interaktikLiveAlertStyles')) return;
    const style = document.createElement('style');
    style.id = 'interaktikLiveAlertStyles';
    style.textContent = `
      .ik-live-alert { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483000;
        width: min(560px, calc(100vw - 32px)); box-sizing: border-box; padding: 14px 16px; border-radius: 14px;
        background: #b3261e; color: #fff; font: 600 15px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif;
        box-shadow: 0 12px 40px rgba(0,0,0,.45), 0 0 0 2px rgba(255,255,255,.35) inset; display: flex; gap: 12px; align-items: flex-start;
        animation: ikLiveAlertPulse 1.2s ease-in-out infinite; }
      .ik-live-alert__icon { font-size: 26px; line-height: 1; }
      .ik-live-alert__body { flex: 1; min-width: 0; }
      .ik-live-alert__title { font-size: 17px; font-weight: 800; margin: 0 0 2px; }
      .ik-live-alert__text { margin: 0; font-weight: 500; opacity: .96; }
      .ik-live-alert__note { margin: 6px 0 0; font-weight: 700; font-size: 13px; color: #ffe08a; }
      .ik-live-alert__actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
      .ik-live-alert button { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 12px; font: 700 13px system-ui, sans-serif; }
      .ik-live-alert__ok { background: #fff; color: #7a130d; }
      .ik-live-alert__mute { background: rgba(255,255,255,.18); color: #fff; }
      @keyframes ikLiveAlertPulse { 0%, 100% { box-shadow: 0 12px 40px rgba(0,0,0,.45), 0 0 0 2px rgba(255,255,255,.35) inset; }
        50% { box-shadow: 0 12px 48px rgba(179,38,30,.85), 0 0 0 2px rgba(255,255,255,.7) inset; } }
      @media (prefers-reduced-motion: reduce) { .ik-live-alert { animation: none; } }
    `;
    document.head.appendChild(style);
  }

  function dismissLiveAlert() {
    if (alertTimer) { clearInterval(alertTimer); alertTimer = null; }
    if (alertEl && alertEl.parentNode) alertEl.parentNode.removeChild(alertEl);
    alertEl = null;
    alertNote = null;
    alertGame = '';
    alertMuted = false;
    document.title = originalTitle;
  }

  function setAlertNote(text) {
    if (alertNote) alertNote.textContent = text || '';
  }

  function showLiveAlert(gameType, who, reason) {
    if (!document.body) return;
    ensureAlertStyles();
    dismissLiveAlert();
    alertGame = gameType;

    const label = GAME_LABELS[gameType] || 'el juego';
    const account = who && typeof who === 'string' ? ` (@${who.replace(/^@/, '')})` : '';
    const detail = reason === 'live_off'
      ? 'TikTok indica que el live está apagado.'
      : reason === 'error'
        ? 'Hubo un error en la conexión con TikTok.'
        : 'La transmisión terminó o se cortó la conexión.';

    const box = document.createElement('div');
    box.className = 'ik-live-alert';
    box.setAttribute('role', 'alert');
    box.setAttribute('aria-live', 'assertive');

    const icon = document.createElement('div');
    icon.className = 'ik-live-alert__icon';
    icon.textContent = '⚠️';

    const body = document.createElement('div');
    body.className = 'ik-live-alert__body';
    const title = document.createElement('p');
    title.className = 'ik-live-alert__title';
    title.textContent = 'Se desconectó tu live';
    const text = document.createElement('p');
    text.className = 'ik-live-alert__text';
    text.textContent = `${label}${account}: ${detail} Los regalos no llegarán hasta que vuelva la conexión.`;
    const note = document.createElement('p');
    note.className = 'ik-live-alert__note';

    const actions = document.createElement('div');
    actions.className = 'ik-live-alert__actions';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'ik-live-alert__ok';
    ok.textContent = 'Entendido';
    ok.addEventListener('click', dismissLiveAlert);
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'ik-live-alert__mute';
    mute.textContent = 'Silenciar sonido';
    mute.addEventListener('click', () => { alertMuted = true; mute.disabled = true; mute.textContent = 'Sonido silenciado'; });
    actions.appendChild(ok);
    actions.appendChild(mute);

    body.appendChild(title);
    body.appendChild(text);
    body.appendChild(note);
    body.appendChild(actions);
    box.appendChild(icon);
    box.appendChild(body);
    document.body.appendChild(box);
    alertEl = box;
    alertNote = note;

    document.title = '⚠ LIVE DESCONECTADO - ' + originalTitle;
    playAlarm();
    alertTimer = setInterval(playAlarm, 3000);
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (error) { /* no todos los dispositivos vibran */ }
  }

  // Reconexion desde la pagina: cubre lo que el servidor no puede (por ejemplo, si el propio servidor se reinicio y perdio la conexion)
  const clientReconnecting = {};
  const CLIENT_RECONNECT_DELAYS_MS = [10000, 15000, 25000, 40000, 60000, 60000];

  function startClientReconnect(gameType) {
    if (clientReconnecting[gameType] || !lastConnectRequest || lastConnectRequest.gameType !== gameType) return;
    clientReconnecting[gameType] = true;
    let attempt = 0;

    function finish() { clientReconnecting[gameType] = false; }

    function scheduleNext() {
      if (attempt >= CLIENT_RECONNECT_DELAYS_MS.length) {
        setAlertNote('No se pudo reconectar solo. Pulsa Conectar para volver a intentarlo.');
        finish();
        return;
      }
      setTimeout(run, CLIENT_RECONNECT_DELAYS_MS[attempt]);
    }

    async function run() {
      attempt += 1;
      if (!lastConnectRequest || lastConnectRequest.gameType !== gameType) { finish(); return; } // el streamer lo desconecto a mano
      if (wasConnected[gameType]) { finish(); return; } // ya volvio

      try {
        setAlertNote(`Reconectando automáticamente (intento ${attempt})...`);
        const statusResponse = await apiRequest(`/api/status?gameType=${encodeURIComponent(gameType)}`);
        const status = statusResponse.ok ? await statusResponse.json() : null;

        if (status && status.status === 'connected') {
          wasConnected[gameType] = status.uniqueId || true;
          if (alertEl && alertGame === gameType) dismissLiveAlert();
          finish();
          return;
        }

        if (!status || status.status !== 'connecting') {
          await apiRequest('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: lastConnectRequest.body,
          });
        }
      } catch (error) {
        console.warn('[live-alert] intento de reconexion fallido:', error);
      }

      scheduleNext();
    }

    scheduleNext();
  }

  function liveWentAway(gameType, reason) {
    const who = wasConnected[gameType];
    if (!who) return;
    wasConnected[gameType] = false;

    // Si el streamer acaba de pulsar Conectar/Desconectar, no es una caida: lo pidio el
    if (Date.now() - (window.__interaktikLiveActionAt || 0) < 15000) return;
    showLiveAlert(gameType, who, reason);
    startClientReconnect(gameType);
  }

  function watchLiveSource(source, targetUrl) {
    const parsed = new URL(targetUrl, window.location.href);
    // Solo el canal de eventos de los juegos; los overlays de OBS (/events/overlay) no avisan
    if (parsed.pathname !== '/events') return;
    const gameType = (parsed.searchParams.get('gameType') || 'app').toLowerCase();

    source.addEventListener('status', (event) => {
      let payload = null;
      try { payload = JSON.parse(event.data); } catch (error) { return; }
      if (!payload || !payload.status) return;

      if (payload.status === 'connected') {
        wasConnected[gameType] = payload.uniqueId || true;
        // Se recuerda a quien reconectar si despues se corta (aunque la pagina se haya recargado con el live ya conectado)
        if (!lastConnectRequest && payload.uniqueId) {
          lastConnectRequest = { gameType, body: JSON.stringify({ uniqueId: payload.uniqueId, gameType }) };
        }
        if (alertEl && alertGame === gameType) dismissLiveAlert(); // ya volvio: la alerta sobra
        return;
      }

      if (payload.status === 'connecting') {
        if (alertEl && alertGame === gameType) setAlertNote(payload.message || 'Reconectando...');
        return;
      }

      if (LIVE_GONE_STATES.indexOf(payload.status) !== -1) liveWentAway(gameType, payload.status);
    });

    source.addEventListener('streamEnd', () => liveWentAway(gameType, 'disconnected'));
  }

  // ===== Clave del canal lista antes de que la pagina abra su conexion =====
  // Las paginas de juego piden su clave firmada nada mas cargar (si no la tenian guardada de otra visita)
  const PAGE_GAME_TYPES = [
    ['snake-vs-snake', 'snake'], ['gta-rampa', 'gtarampa'], ['minecraft-cubo', 'minecraftcubo'], ['roblox-dance', 'roblox'],
    ['roblox-parkour', 'robloxparkour'], ['roblox-fighters', 'robloxfighters'], ['shell-game', 'shellgame'], ['boy-vs-girl', 'boyvsgirl'], ['kingdoms', 'kingdoms'],
    ['dominance', 'dominance'], ['race', 'race'], ['gta', 'gta'], ['minecraft', 'minecraft'], ['app', 'app'],
  ];

  function gameTypeOfThisPage() {
    const path = window.location.pathname.toLowerCase().replace(/\.html$/, '');
    const name = path.split('/').pop();
    for (let i = 0; i < PAGE_GAME_TYPES.length; i += 1) {
      if (name === PAGE_GAME_TYPES[i][0]) return PAGE_GAME_TYPES[i][1];
    }
    return '';
  }

  const pageGameType = gameTypeOfThisPage();
  if (pageGameType) {
    apiRequest(`/api/status?gameType=${encodeURIComponent(pageGameType)}`).catch(() => {});
  }

  // Si la pagina se recargo mientras el live seguia conectado en el servidor, la pagina lo retoma sin que haya que pulsar Conectar
  window.interaktikResumeLive = async function interaktikResumeLive(gameType, onConnected) {
    try {
      const response = await apiRequest(`/api/status?gameType=${encodeURIComponent(gameType)}`);
      if (!response.ok) return false;
      const status = await response.json();
      if (status && status.status === 'connected') {
        if (typeof onConnected === 'function') onConnected(status);
        return true;
      }
    } catch (error) {
      console.warn('[live] no se pudo comprobar el estado del live:', error);
    }
    return false;
  };

  window.apiBaseUrl = apiBaseUrl;
})();
