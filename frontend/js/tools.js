// Seccion "Herramientas": lector de comentarios en voz alta.
//
// Usa la voz del navegador (speechSynthesis) y escucha los comentarios de la conexion de TikTok Live de los overlays
// (gameType "overlay"): el mismo canal /events que usan los juegos.
// Todo lo que llega es texto de desconocidos, asi que solo se lee (nunca se interpreta como HTML ni como comando).
//
// A quien se lee: a todos, o solo a quienes cumplan ALGUNA de las condiciones marcadas (comunidad, seguidores, comando
// personalizado, regalo de mas de X monedas). El servidor adjunta a cada comentario lo que se sabe de quien comenta:
// comment.identity (sigue al streamer, etc.) y comment.viewer (regalos que ha mandado).

(function commentReader() {
  const section = document.getElementById('toolsSection');
  if (!section) return;

  const $ = (id) => document.getElementById(id);
  const els = {
    toggle: $('readerToggle'),
    toggleLabel: $('readerToggleLabel'),
    status: $('readerStatus'),
    statusText: $('readerStatusText'),
    goOverlays: $('readerGoOverlaysBtn'),
    voice: $('readerVoiceSelect'),
    rate: $('readerRateInput'),
    rateValue: $('readerRateValue'),
    pitch: $('readerPitchInput'),
    pitchValue: $('readerPitchValue'),
    volume: $('readerVolumeInput'),
    volumeValue: $('readerVolumeValue'),
    test: $('readerTestBtn'),
    name: $('readerNameToggle'),
    commands: $('readerCommandsToggle'),
    links: $('readerLinksToggle'),
    maxChars: $('readerMaxCharsInput'),
    blockedWords: $('readerBlockedWordsInput'),
    mutedUsers: $('readerMutedUsersInput'),
    audienceRadios: Array.from(section.querySelectorAll('input[name="readerAudience"]')),
    conditions: $('readerConditions'),
    condCommunity: $('readerCondCommunity'),
    condFollowers: $('readerCondFollowers'),
    condCommand: $('readerCondCommand'),
    commandText: $('readerCommandText'),
    condGift: $('readerCondGift'),
    giftMinCoins: $('readerGiftMinCoins'),
    conditionsWarning: $('readerConditionsWarning'),
  };

  const STORAGE_KEY = 'ik:tools:comment-reader';
  const GAME_TYPE = 'overlay';
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

  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let settings = loadSettings();
  let enabled = false;
  let source = null;
  let connectionState = 'unknown'; // unknown | connected | waiting
  let connectedAs = '';
  let voices = [];
  let speaking = false;
  let speakingTimer = null;
  const queue = [];
  const recent = new Map(); // "usuario|texto" -> hora del ultimo comentario igual (anti repeticion)

  // ---------- ajustes (solo de este navegador: las voces cambian de un equipo a otro) ----------

  function loadSettings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
    } catch (_error) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_error) {
      // sin almacenamiento: los ajustes solo duran mientras la pagina esta abierta
    }
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function selectedAudience() {
    const checked = els.audienceRadios.find((radio) => radio.checked);
    return checked && checked.value === 'conditions' ? 'conditions' : 'all';
  }

  function readFormIntoSettings() {
    settings = {
      voiceURI: els.voice.value || '',
      rate: clampNumber(els.rate.value, 0.6, 1.6, 1),
      pitch: clampNumber(els.pitch.value, 0.5, 1.5, 1),
      volume: clampNumber(els.volume.value, 0, 100, 100),
      readName: els.name.checked,
      ignoreCommands: els.commands.checked,
      replaceLinks: els.links.checked,
      maxChars: Math.round(clampNumber(els.maxChars.value, 20, 300, 150)),
      blockedWords: els.blockedWords.value,
      mutedUsers: els.mutedUsers.value,
      audience: selectedAudience(),
      condCommunity: els.condCommunity.checked,
      condFollowers: els.condFollowers.checked,
      condCommand: els.condCommand.checked,
      commandText: els.commandText.value.slice(0, 30),
      condGift: els.condGift.checked,
      giftMinCoins: Math.round(clampNumber(els.giftMinCoins.value, 0, 1000000, 100)),
    };
    saveSettings();
    paintValues();
  }

  function paintValues() {
    els.rateValue.textContent = `${settings.rate.toFixed(1)}x`;
    els.pitchValue.textContent = settings.pitch.toFixed(1);
    els.volumeValue.textContent = `${Math.round(settings.volume)}%`;

    // Las condiciones solo cuentan si se eligio "solo a quienes cumplan una condicion"
    const onlyConditions = settings.audience === 'conditions';
    els.conditions.classList.toggle('is-off', !onlyConditions);
    els.conditions.querySelectorAll('input').forEach((input) => { input.disabled = !onlyConditions; });

    const anyChecked = settings.condCommunity || settings.condFollowers || settings.condCommand || settings.condGift;
    els.conditionsWarning.classList.toggle('hidden', !(onlyConditions && !anyChecked));
  }

  function writeSettingsToForm() {
    els.rate.value = settings.rate;
    els.pitch.value = settings.pitch;
    els.volume.value = settings.volume;
    els.name.checked = settings.readName;
    els.commands.checked = settings.ignoreCommands;
    els.links.checked = settings.replaceLinks;
    els.maxChars.value = settings.maxChars;
    els.blockedWords.value = settings.blockedWords;
    els.mutedUsers.value = settings.mutedUsers;
    els.audienceRadios.forEach((radio) => { radio.checked = radio.value === settings.audience; });
    els.condCommunity.checked = settings.condCommunity;
    els.condFollowers.checked = settings.condFollowers;
    els.condCommand.checked = settings.condCommand;
    els.commandText.value = settings.commandText;
    els.condGift.checked = settings.condGift;
    els.giftMinCoins.value = settings.giftMinCoins;
    paintValues();
  }

  // ---------- voces ----------

  function fillVoices() {
    voices = window.speechSynthesis.getVoices();

    // Primero las voces en espanol, luego el resto por nombre
    const sorted = voices.slice().sort((a, b) => {
      const aEs = /^es\b|^es[-_]/i.test(a.lang) ? 0 : 1;
      const bEs = /^es\b|^es[-_]/i.test(b.lang) ? 0 : 1;
      return aEs - bEs || a.name.localeCompare(b.name);
    });

    els.voice.innerHTML = '';
    if (!sorted.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Voz predeterminada del navegador';
      els.voice.appendChild(option);
      return;
    }

    for (const voice of sorted) {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      els.voice.appendChild(option);
    }

    const saved = sorted.find((voice) => voice.voiceURI === settings.voiceURI);
    const firstSpanish = sorted.find((voice) => /^es\b|^es[-_]/i.test(voice.lang));
    els.voice.value = (saved || firstSpanish || sorted[0]).voiceURI;
  }

  function currentVoice() {
    return voices.find((voice) => voice.voiceURI === els.voice.value) || null;
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
    let allowed = settings.audience !== 'conditions';

    if (settings.audience === 'conditions') {
      const command = matchCustomCommand(original);
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
    const finish = (blocked) => {
      if (done) return;
      done = true;
      clearTimeout(speakingTimer);
      onFinish(blocked);
    };

    utterance.onend = () => finish(false);
    utterance.onerror = (event) => finish(event && event.error === 'not-allowed');

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
    if (speaking || !enabled || !queue.length) return;

    const job = queue.shift();
    speaking = true;
    speak(job.speech, (blocked) => {
      speaking = false;
      if (blocked) {
        setStatus('El navegador bloqueó el audio. Haz clic en cualquier parte de la página y vuelve a probar la voz.', 'warn');
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

  // ---------- conexion con los comentarios del live ----------

  function setStatus(text, tone = 'info', showGoOverlays = false) {
    els.statusText.textContent = text;
    els.status.dataset.tone = tone;
    els.goOverlays.classList.toggle('hidden', !showGoOverlays);
  }

  function paintConnectionStatus() {
    if (!enabled) return;
    if (connectionState === 'connected') {
      setStatus(`Escuchando los comentarios${connectedAs ? ` de @${connectedAs}` : ''}.`, 'ok');
    } else {
      setStatus('Encendido, pero tu TikTok Live no está conectado todavía. Conéctalo en Overlays (o activa la conexión automática) y empezará a leer.', 'warn', true);
    }
  }

  function closeSource() {
    if (source) {
      source.close();
      source = null;
    }
  }

  async function openSource() {
    closeSource();
    connectionState = 'unknown';

    // Pedir el estado primero deja guardada la clave firmada del canal (runtime.js), igual que en las paginas de juegos
    try { await fetch(`/api/status?gameType=${GAME_TYPE}`); } catch (_error) { /* se intenta igual */ }
    if (!enabled) return;

    source = new EventSource(`/events?gameType=${GAME_TYPE}`);

    source.addEventListener('status', (event) => {
      try {
        const payload = JSON.parse(event.data);
        connectionState = payload.status === 'connected' ? 'connected' : 'waiting';
        connectedAs = payload.uniqueId || '';
        paintConnectionStatus();
      } catch (_error) { /* mensaje raro: se ignora */ }
    });

    source.addEventListener('comment', (event) => {
      if (!enabled) return;
      try {
        handleComment(JSON.parse(event.data));
      } catch (_error) { /* mensaje raro: se ignora */ }
    });

    source.addEventListener('error', () => {
      if (enabled && source && source.readyState === EventSource.CONNECTING) {
        setStatus('Se cortó la conexión con el servidor. Reconectando…', 'warn');
      }
    });

    source.addEventListener('open', () => paintConnectionStatus());
  }

  function setEnabled(value) {
    enabled = value;
    els.toggle.checked = value;
    els.toggleLabel.textContent = value ? 'Encendido' : 'Apagado';

    if (value) {
      setStatus('Conectando con tus comentarios…', 'info');
      openSource();
    } else {
      closeSource();
      stopSpeaking();
      setStatus('Apagado. Enciéndelo cuando estés por empezar tu live.', 'info');
    }
  }

  function testVoice() {
    try { window.speechSynthesis.cancel(); } catch (_error) { /* nada */ }
    speaking = false;
    speak(settings.readName ? 'Ana dice: hola a todos, así sonará el lector de comentarios.' : 'Hola a todos, así sonará el lector de comentarios.', (blocked) => {
      if (blocked) setStatus('El navegador bloqueó el audio. Haz clic en cualquier parte de la página y vuelve a probar la voz.', 'warn');
    });
  }

  // ---------- arranque ----------

  if (!supported) {
    els.toggle.disabled = true;
    els.test.disabled = true;
    setStatus('Tu navegador no puede leer en voz alta. Prueba con Chrome, Edge o Safari actualizados.', 'warn');
    return;
  }

  writeSettingsToForm();
  fillVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = fillVoices;
  }

  [
    els.voice, els.rate, els.pitch, els.volume, els.name, els.commands, els.links, els.maxChars, els.blockedWords, els.mutedUsers,
    els.condCommunity, els.condFollowers, els.condCommand, els.commandText, els.condGift, els.giftMinCoins,
    ...els.audienceRadios,
  ].forEach((input) => {
    input.addEventListener('input', readFormIntoSettings);
    input.addEventListener('change', readFormIntoSettings);
  });
  readFormIntoSettings();

  els.toggle.addEventListener('change', () => setEnabled(els.toggle.checked));
  els.test.addEventListener('click', testVoice);
  els.goOverlays.addEventListener('click', () => {
    if (typeof window.showSection === 'function') window.showSection('overlaysSection');
  });

  // Se enciende siempre a mano: los navegadores no dejan hablar a una pagina que todavia no recibio un clic
  window.addEventListener('beforeunload', () => {
    try { window.speechSynthesis.cancel(); } catch (_error) { /* nada */ }
  });
})();
