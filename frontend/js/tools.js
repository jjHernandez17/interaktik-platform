// Seccion "Herramientas": interfaz del narrador de comentarios.
//
// El motor (escuchar el live, filtrar y leer en voz alta) vive en js/narrator.js y corre en el panel y en todos los juegos;
// aqui solo estan los controles y lo que se muestra. Todo se guarda en este navegador.

(function narratorSettingsUi() {
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
    live: $('liveConnection'),
    liveName: $('liveConnectionName'),
    liveBadge: $('liveConnectionBadge'),
  };

  const GAME_TYPE = 'overlay';
  const engine = window.IkNarrator;

  // ---------- a que TikTok Live esta conectado (se ve aunque el narrador este apagado) ----------

  const LIVE_BADGES = {
    connected: 'Conectado',
    connecting: 'Conectando…',
    live_off: 'Live apagado',
    error: 'Error',
    disconnected: 'Desconectado',
  };
  let linkedUsername = ''; // cuenta vinculada a los overlays (aunque no este conectada ahora)
  let liveStatus = 'disconnected';
  let liveUsername = '';

  function paintLive() {
    const state = LIVE_BADGES[liveStatus] ? liveStatus : 'disconnected';
    const account = liveUsername || linkedUsername;

    els.live.dataset.state = state;
    els.liveBadge.className = `status-badge ${state}`;
    els.liveBadge.textContent = LIVE_BADGES[state];

    if (state === 'connected' && account) {
      els.liveName.textContent = `@${account}`;
    } else if (account) {
      els.liveName.textContent = `@${account} (vinculada)`;
    } else {
      els.liveName.textContent = 'Sin cuenta vinculada';
    }
  }

  function setLive(status, username) {
    liveStatus = status || 'disconnected';
    liveUsername = status === 'connected' ? String(username || '').replace(/^@/, '') : '';
    paintLive();
  }

  // Pregunta al servidor a quien esta conectado ahora (misma conexion que los overlays) y que cuenta tienes vinculada
  async function refreshLive() {
    try {
      const [connectionRes, statusRes] = await Promise.all([
        fetch('/api/tiktok-connection/overlay'),
        fetch(`/api/status?gameType=${GAME_TYPE}`),
      ]);
      const connection = connectionRes.ok ? await connectionRes.json() : null;
      const status = statusRes.ok ? await statusRes.json() : null;

      linkedUsername = String(connection?.tiktok_username || '').replace(/^@/, '');
      setLive(status?.status || 'disconnected', status?.uniqueId);
    } catch (_error) {
      // Sin respuesta se deja lo que ya se veia
    }
  }

  window.refreshToolsConnection = refreshLive;
  setInterval(() => {
    if (!section.classList.contains('hidden') && !document.hidden) refreshLive();
  }, 15000);
  if (!section.classList.contains('hidden')) refreshLive();
  paintLive();

  // ---------- sin soporte de voz ----------

  if (!engine) {
    els.toggle.disabled = true;
    els.test.disabled = true;
    els.statusText.textContent = 'No se pudo cargar el narrador. Recarga la página.';
    els.status.dataset.tone = 'warn';
    return;
  }

  // ---------- formulario <-> ajustes ----------

  function selectedAudience() {
    const checked = els.audienceRadios.find((radio) => radio.checked);
    return checked && checked.value === 'conditions' ? 'conditions' : 'all';
  }

  function readForm() {
    return {
      voiceURI: els.voice.value || '',
      rate: els.rate.value,
      pitch: els.pitch.value,
      volume: els.volume.value,
      readName: els.name.checked,
      ignoreCommands: els.commands.checked,
      replaceLinks: els.links.checked,
      maxChars: els.maxChars.value,
      blockedWords: els.blockedWords.value,
      mutedUsers: els.mutedUsers.value,
      audience: selectedAudience(),
      condCommunity: els.condCommunity.checked,
      condFollowers: els.condFollowers.checked,
      condCommand: els.condCommand.checked,
      commandText: els.commandText.value,
      condGift: els.condGift.checked,
      giftMinCoins: els.giftMinCoins.value,
    };
  }

  function paintValues(settings) {
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

  function writeForm(settings) {
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
  }

  function fillVoices(state) {
    const signature = state.voices.map((voice) => voice.voiceURI).join('|');
    if (els.voice.dataset.signature !== signature) {
      els.voice.dataset.signature = signature;
      els.voice.innerHTML = '';

      if (!state.voices.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Voz predeterminada del navegador';
        els.voice.appendChild(option);
      }
      for (const voice of state.voices) {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})`;
        els.voice.appendChild(option);
      }
    }
    if (state.currentVoiceURI) els.voice.value = state.currentVoiceURI;
  }

  // ---------- el motor manda el estado y aqui se dibuja ----------

  let formReady = false;

  engine.subscribe((state) => {
    if (!formReady) {
      writeForm(state.settings);
      formReady = true;
    }
    fillVoices(state);
    paintValues(state.settings);

    els.toggle.checked = state.enabled;
    els.toggleLabel.textContent = state.enabled ? 'Encendido' : 'Apagado';
    els.toggle.disabled = !state.supported;
    els.test.disabled = !state.supported;

    els.statusText.textContent = state.status.text;
    els.status.dataset.tone = state.status.tone;
    els.goOverlays.classList.toggle('hidden', !state.status.goOverlays);

    // El estado en vivo del canal tambien actualiza la tarjeta de conexion (sin esperar al siguiente chequeo)
    if (state.enabled && state.live.status && state.live.status !== 'unknown') setLive(state.live.status, state.live.uniqueId);
  });

  [
    els.voice, els.rate, els.pitch, els.volume, els.name, els.commands, els.links, els.maxChars, els.blockedWords, els.mutedUsers,
    els.condCommunity, els.condFollowers, els.condCommand, els.commandText, els.condGift, els.giftMinCoins,
    ...els.audienceRadios,
  ].forEach((input) => {
    const save = () => engine.setSettings(readForm());
    input.addEventListener('input', save);
    input.addEventListener('change', save);
  });

  els.toggle.addEventListener('change', () => engine.setEnabled(els.toggle.checked));
  els.test.addEventListener('click', () => engine.testVoice());
  els.goOverlays.addEventListener('click', () => {
    if (typeof window.showSection === 'function') window.showSection('overlaysSection');
  });

  // Los ajustes cambian en esta pagina o en otra pestana: se repinta con el estado que manda el motor
  window.addEventListener('storage', (event) => {
    if (event.key === 'ik:tools:comment-reader') writeForm(engine.getState().settings);
  });
})();
