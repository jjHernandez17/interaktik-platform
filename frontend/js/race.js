// UI Elements
const participantNameInput = document.getElementById('participantNameInput');
const addParticipantBtn = document.getElementById('addParticipantBtn');
const participantsList = document.getElementById('participantsList');
const participantsHint = document.getElementById('participantsHint');
const resetRaceBtn = document.getElementById('resetRaceBtn');
const clearParticipantsBtn = document.getElementById('clearParticipantsBtn');
const raceFullscreenBtn = document.getElementById('raceFullscreenBtn');
const raceTrack = document.getElementById('raceTrack');
const raceHistoryList = document.getElementById('raceHistoryList');
const raceUsername = document.getElementById('raceUsername');
const raceLinkBtn = document.getElementById('raceLinkBtn');
const raceConnectLiveBtn = document.getElementById('raceConnectLiveBtn');
const raceLoadCatalogBtn = document.getElementById('raceLoadCatalogBtn');
const raceConnectionForm = document.getElementById('raceConnectionForm');
const raceDisconnectBtn = document.getElementById('raceDisconnectBtn');
const raceLiveIndicator = document.getElementById('raceLiveIndicatorBadge');
const raceConnectionStatus = document.getElementById('raceConnectionStatusBadge');
const raceConnectionDetails = document.getElementById('raceConnectionDetails');
const raceHero = document.querySelector('.race-hero');
const raceControls = document.querySelector('.race-controls');
const trackSection = document.getElementById('trackSection');
const raceLapsLimitInput = document.getElementById('raceLapsLimit');
const raceWinnerModal = document.getElementById('raceWinnerModal');
const raceWinnerCloseBtn = document.getElementById('raceWinnerCloseBtn');
const raceInfoBtn = document.getElementById('raceInfoBtn');
const raceInfoModal = document.getElementById('raceInfoModal');
const raceInfoCloseBtn = document.getElementById('raceInfoCloseBtn');
const raceLikesEnabledToggle = document.getElementById('raceLikesEnabledToggle');
const raceLikesPerMoveInput = document.getElementById('raceLikesPerMoveInput');
const raceLikesMovePercentInput = document.getElementById('raceLikesMovePercentInput');
const raceLikesMovePercentValue = document.getElementById('raceLikesMovePercentValue');

// State
let participants = [];
let carPositions = {};
let finishCounts = {};
let history = [];

let isConnected = false;
let viewerBindings = {};
let liveEventsSource = null;
let winnerParticipantId = null;
const liveGiftProgress = new Map();
const viewerLikeCounts = new Map();
const laneElements = new Map();

const MAX_PARTICIPANTS = 20;
const COINS_PER_LAP = 200;
const COMMENT_COINS = 0.5;
const HISTORY_LIMIT = 50;
let raceLapsLimit = 5;
let likesConfig = { enabled: false, likesPerMove: 50, movePercent: 5 };

function normalizeLikesConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled === true,
    likesPerMove: Math.max(1, Math.min(100000, Number(source.likesPerMove) || 50)),
    movePercent: Math.max(0, Math.min(100, Number(source.movePercent) || 0)),
  };
}

function applyLikesConfigToInputs() {
  if (raceLikesEnabledToggle) raceLikesEnabledToggle.checked = likesConfig.enabled;
  if (raceLikesPerMoveInput) raceLikesPerMoveInput.value = likesConfig.likesPerMove;
  if (raceLikesMovePercentInput) raceLikesMovePercentInput.value = likesConfig.movePercent;
  if (raceLikesMovePercentValue) raceLikesMovePercentValue.textContent = `${likesConfig.movePercent}%`;
}

function lockRaceUsernameInput() {
  if (raceUsername) raceUsername.disabled = true;
  if (raceLinkBtn) raceLinkBtn.disabled = true;
  if (raceConnectLiveBtn) raceConnectLiveBtn.disabled = false;
}

function unlockRaceUsernameInput() {
  if (raceUsername) raceUsername.disabled = false;
  if (raceLinkBtn) raceLinkBtn.disabled = false;
  if (raceConnectLiveBtn) raceConnectLiveBtn.disabled = true;
}

function normalizeParticipantName(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');
}

function getLeaderParticipantIds() {
  if (participants.length === 0) return [];
  const maxFinishes = Math.max(...participants.map(p => finishCounts[p.id] || 0));
  return participants.filter(p => (finishCounts[p.id] || 0) === maxFinishes).map(p => p.id);
}

function showWinnerModal(participantId) {
  const winner = participants.find(p => p.id === participantId);
  if (!winner) return;
  winnerParticipantId = participantId;
  const winnerNameEl = document.getElementById('raceWinnerName');
  const winnerAvatarEl = document.getElementById('raceWinnerAvatar');

  if (winnerNameEl) {
    winnerNameEl.textContent = winner.name;
  }

  if (winnerAvatarEl) {
    winnerAvatarEl.src = winner.avatarData || `/assets/images/car${winner.carNumber || 1}.png`;
    winnerAvatarEl.style.display = 'block';
  }

  if (raceWinnerModal) {
    raceWinnerModal.classList.remove('hidden');
    raceWinnerModal.setAttribute('aria-hidden', 'false');
  }
}

function hideWinnerModal() {
  if (raceWinnerModal) {
    raceWinnerModal.classList.add('hidden');
    raceWinnerModal.setAttribute('aria-hidden', 'true');
  }
}

function maybeDeclareWinner() {
  if (winnerParticipantId) {
    return;
  }

  const existingWinner = participants.find((participant) => (finishCounts[participant.id] || 0) >= raceLapsLimit);
  if (existingWinner) {
    showWinnerModal(existingWinner.id);
  }
}

function updateLeaderStyles() {
  const leaderIds = getLeaderParticipantIds();
  participants.forEach(p => {
    const entry = laneElements.get(p.id);
    if (entry && entry.lane) {
      if (leaderIds.includes(p.id)) {
        entry.lane.classList.add('leader');
      } else {
        entry.lane.classList.remove('leader');
      }
    }
  });
}

function updateTrackSizing() {
  if (!trackSection) return;

  const count = Math.max(participants.length, 1);
  const header = trackSection.querySelector('.track-header');
  const footer = trackSection.querySelector('.track-footer');

  const inFullscreen = document.fullscreenElement === trackSection;
  const availableHeight = inFullscreen
    ? Math.max(trackSection.clientHeight - header.offsetHeight - footer.offsetHeight - 8, count * 20)
    : Math.max(Math.floor(window.innerHeight * 0.62), count * 24);

  const laneHeight = Math.max(20, Math.floor(availableHeight / count));
  const carSize = Math.max(14, Math.min(laneHeight - 2, 64));
  let avatarBaseSize;
  if (count <= 5) {
    avatarBaseSize = 168;
  } else if (count <= 12) {
    avatarBaseSize = 128;
  } else {
    avatarBaseSize = 96;
  }

  const avatarSize = Math.max(52, Math.min(Math.floor(laneHeight * 0.98), avatarBaseSize));
  const labelWidth = inFullscreen ? 200 : 140;

  document.documentElement.style.setProperty('--lane-height', `${laneHeight}px`);
  document.documentElement.style.setProperty('--car-size', `${carSize}px`);
  document.documentElement.style.setProperty('--participant-avatar-size', `${avatarSize}px`);
  document.documentElement.style.setProperty('--lane-label-width', `${labelWidth}px`);
}

async function toggleFullscreenTrack() {
  if (!trackSection) return;

  try {
    if (document.fullscreenElement === trackSection) {
      await document.exitFullscreen();
    } else {
      await trackSection.requestFullscreen();
    }
  } catch (_error) {
    showAppAlert('No fue posible cambiar a pantalla completa en este navegador.', 'Pantalla completa');
  }
}

function saveState() {
  const state = {
    participants,
    car_positions: carPositions,
    finish_counts: finishCounts,
    viewer_bindings: viewerBindings,
    history,
    race_laps_limit: raceLapsLimit,
    winner_participant_id: winnerParticipantId,
    likes_config: likesConfig,
  };

  // First, save to localStorage as backup
  localStorage.setItem('raceState', JSON.stringify(state));
  console.log('[Race] Saved to localStorage');

  // Then try to save to database
  fetch('/api/race/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
    .then(response => {
      console.log(`[Race] Server response status: ${response.status}`);
      if (!response.ok) {
        return response.json().then(err => {
          console.error('Server error response:', err);
          throw new Error(`HTTP ${response.status}: ${err.error || response.statusText}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('[Race] Successfully saved to database:', data);
    })
    .catch(err => {
      console.error('[Race] Failed to save to database:', err.message);
    });
}

async function loadState() {
  try {
    const response = await fetch('/api/race/state');
    console.log(`[Race] Load response status: ${response.status}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${err.error || response.statusText}`);
    }

    const state = await response.json();
    console.log('[Race] Loaded race state from database:', state);

    participants = state.participants || [];
    carPositions = state.car_positions || {};
    finishCounts = state.finish_counts || {};
    viewerBindings = state.viewer_bindings || {};
    history = state.history || [];
    raceLapsLimit = Number(state.race_laps_limit) || 5;
    winnerParticipantId = state.winner_participant_id || null;
    likesConfig = normalizeLikesConfig(state.likes_config);
  } catch (error) {
    console.warn('[Race] Failed to load from database, falling back to localStorage:', error.message);
    const stored = localStorage.getItem('raceState');
    if (stored) {
      try {
        const state = JSON.parse(stored);
        console.log('[Race] Loaded race state from localStorage:', state);

        participants = state.participants || [];
        carPositions = state.car_positions || state.carPositions || {};
        finishCounts = state.finish_counts || state.finishCounts || {};
        viewerBindings = state.viewer_bindings || state.viewerBindings || {};
        history = state.history || [];
        raceLapsLimit = Number(state.race_laps_limit || state.raceLapsLimit) || 5;
        winnerParticipantId = state.winner_participant_id || state.winnerParticipantId || null;
        likesConfig = normalizeLikesConfig(state.likes_config || state.likesConfig);
      } catch (parseError) {
        console.error('[Race] Failed to parse localStorage:', parseError);
      }
    } else {
      console.log('[Race] No localStorage fallback available');
    }
  }
  if (raceLapsLimitInput) raceLapsLimitInput.value = raceLapsLimit;
  applyLikesConfigToInputs();

  renderParticipants();
  renderRaceTrack();


  if (winnerParticipantId) {
    showWinnerModal(winnerParticipantId);
  } else {
    maybeDeclareWinner();
  }
}

function addParticipant(name) {
  if (!name.trim()) {
    showAppAlert('Por favor ingresa un nombre.', 'Participante vacío');
    return;
  }

  if (participants.length >= MAX_PARTICIPANTS) {
    showAppAlert(`Máximo ${MAX_PARTICIPANTS} participantes permitidos.`, 'Límite alcanzado');
    return;
  }

  if (participants.some(p => normalizeParticipantName(p.name) === normalizeParticipantName(name))) {
    showAppAlert('Este participante ya existe.', 'Participante duplicado');
    return;
  }

  const id = `participant-${Date.now()}`;
  const usedCarNumbers = new Set(participants.map((p) => p.carNumber));
  let carNumber = 1;
  while (usedCarNumbers.has(carNumber) && carNumber <= 17) {
    carNumber += 1;
  }
  if (carNumber > 17) {
    carNumber = (participants.length % 17) + 1;
  }
  participants.push({ id, name, carNumber });
  carPositions[id] = 0;
  finishCounts[id] = 0;

  participantNameInput.value = '';
  saveState();
  renderParticipants();
  renderRaceTrack();
}

function removeParticipant(id) {
  participants = participants.filter(p => p.id !== id);
  delete carPositions[id];
  delete finishCounts[id];

  Object.keys(viewerBindings).forEach((viewerKey) => {
    if (viewerBindings[viewerKey] === id) {
      delete viewerBindings[viewerKey];
    }
  });

  saveState();
  renderParticipants();
  renderRaceTrack();
}

function renderParticipants() {
  if (!participantsList) return;

  participantsList.innerHTML = '';
  participants.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'participant-item';
    // hidden file input id unique
    const fileInputId = `participant-file-${p.id}`;
    item.innerHTML = `
      <div class="participant-item-name">${p.name}</div>
      <div class="participant-item-controls">
        <button class="participant-adjust-add" type="button" data-id="${p.id}">+</button>
        <button class="participant-adjust-sub" type="button" data-id="${p.id}">-</button>
        <button class="participant-upload-btn" type="button" data-id="${p.id}">Cargar imagen</button>
        <input id="${fileInputId}" class="participant-file-input" type="file" accept="image/*" style="display:none" />
        <button class="participant-item-remove" type="button" data-id="${p.id}">✕</button>
      </div>
    `;
    participantsList.appendChild(item);
  });

  // Wire up controls
  participantsList.querySelectorAll('.participant-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeParticipant(btn.dataset.id));
  });

  participantsList.querySelectorAll('.participant-adjust-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      modifyParticipantCoins(id, 1, `Ajuste manual: +1 moneda para ${participants.find(x => x.id === id)?.name || id}`);
    });
  });

  participantsList.querySelectorAll('.participant-adjust-sub').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      modifyParticipantCoins(id, -1, `Ajuste manual: -1 moneda para ${participants.find(x => x.id === id)?.name || id}`);
    });
  });

  // Upload handlers
  participantsList.querySelectorAll('.participant-upload-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      const input = btn.parentElement.querySelector('.participant-file-input');
      if (input) input.click();
    });
  });

  participantsList.querySelectorAll('.participant-file-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = input.files && input.files[0];
      if (!file) return;
      const id = input.id.replace('participant-file-', '');
      const reader = new FileReader();
      reader.onload = function (ev) {
        const dataUrl = ev.target.result;
        const idx = participants.findIndex(p => p.id === id);
        if (idx === -1) return;
        participants[idx].avatarData = dataUrl;
        saveState();
        renderParticipants();
        renderRaceTrack();
        addHistoryEntry(`${participants[idx].name} actualizó su imagen.`);
      };
      reader.readAsDataURL(file);
    });
  });

  participantsHint.textContent = `${participants.length} / ${MAX_PARTICIPANTS} participantes`;
}

function modifyParticipantCoins(id, deltaCoins, contextNote = '') {
  if (!Object.prototype.hasOwnProperty.call(carPositions, id)) return;

  const prevLaps = Number(finishCounts[id] || 0) || 0;
  const prevPos = Number(carPositions[id] || 0) || 0;
  const totalBefore = prevLaps * COINS_PER_LAP + prevPos;
  const totalAfter = Math.max(0, totalBefore + Number(deltaCoins) || 0);

  const newLaps = Math.floor(totalAfter / COINS_PER_LAP);
  const remainder = totalAfter - newLaps * COINS_PER_LAP;

  const startPercent = Math.min((prevPos / COINS_PER_LAP) * 100, 100);
  const targetPercent = Math.min((remainder / COINS_PER_LAP) * 100, 100);

  const lapsDelta = newLaps - prevLaps;

  // If increasing laps or coins, reuse positive animation path
  if (deltaCoins > 0) {
    applyCoinsToParticipant(id, deltaCoins, contextNote);
    return;
  }

  showDeltaBubble(id, deltaCoins);

  // For negative adjustments: commit lap changes immediately (can't animate backwards multiple laps easily)
  if (lapsDelta < 0) {
    finishCounts[id] = newLaps;
    addHistoryEntry(`${participants.find(p => p.id === id)?.name || id} perdió ${Math.abs(lapsDelta)} vuelta(s). Total: ${finishCounts[id]} vueltas.`);
  }

  // Animate backwards or to lesser percent
  (async () => {
    try {
      const entry = laneElements.get(id);
      if (entry) {
        await animateToPercent(entry.car, startPercent, targetPercent);
      }

      // Commit state
      carPositions[id] = remainder;
      if (lapsDelta < 0) {
        // already adjusted finishCounts
      }
      if (contextNote) addHistoryEntry(contextNote);
      saveState();

      const entryAfter = laneElements.get(id);
      if (entryAfter && entryAfter.finishCount) entryAfter.finishCount.textContent = String(finishCounts[id] || 0);
    } catch (err) {
      // fallback
      carPositions[id] = remainder;
      finishCounts[id] = newLaps;
      if (contextNote) addHistoryEntry(contextNote);
      saveState();
      renderRaceTrack();
    }
  })();
}

function renderRaceTrack() {
  if (!raceTrack) return;

  updateTrackSizing();
  // Reuse existing lane DOM nodes to allow smooth transitions
  const existingIds = new Set(laneElements.keys());
  participants.forEach((p) => {
    existingIds.delete(p.id);

    let entry = laneElements.get(p.id);
    const position = carPositions[p.id] || 0;
    const finishes = finishCounts[p.id] || 0;
    const positionPercent = Math.min((position / COINS_PER_LAP) * 100, 100);
    const carImagePath = `/assets/images/car${p.carNumber}.png`;

    if (!entry) {
      const lane = document.createElement('div');
      lane.className = 'race-lane';

      const label = document.createElement('div');
      label.className = 'lane-label';

      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'participant-avatar-wrap';
      const avatar = document.createElement('img');
      avatar.className = 'participant-avatar';
      if (p.avatarData) {
        avatar.src = p.avatarData;
        avatarWrap.style.display = '';
      } else {
        avatarWrap.style.display = 'none';
      }
      avatarWrap.appendChild(avatar);

      label.appendChild(avatarWrap);

      const run = document.createElement('div');
      run.className = 'lane-run';

      const nameOverlay = document.createElement('div');
      nameOverlay.className = 'lane-name-overlay';
      nameOverlay.textContent = p.name;
      run.appendChild(nameOverlay);

      const car = document.createElement('div');
      car.className = 'car';
      car.style.left = `${positionPercent}%`;

      const img = document.createElement('img');
      img.src = carImagePath;
      img.alt = `Carro de ${p.name}`;
      car.appendChild(img);

      run.appendChild(car);

      const finish = document.createElement('div');
      finish.className = 'lane-finish';
      const finishCount = document.createElement('div');
      finishCount.className = 'lane-finish-count';
      finishCount.textContent = String(finishes || 0);
      finish.appendChild(finishCount);

      lane.appendChild(label);
      lane.appendChild(run);
      lane.appendChild(finish);

      raceTrack.appendChild(lane);

      entry = { lane, label, avatarWrap, avatar, nameOverlay, run, car, img, finish, finishCount };
      laneElements.set(p.id, entry);
    } else {
      // Update texts and image if needed
      if (entry.nameOverlay) entry.nameOverlay.textContent = p.name;
      entry.finishCount.textContent = String(finishes || 0);
      if (entry.img && entry.img.src.indexOf(`/assets/images/car${p.carNumber}.png`) === -1) {
        entry.img.src = carImagePath;
      }

      // avatar wrapper and image
      if (entry.avatarWrap) {
        if (p.avatarData) {
          entry.avatar.src = p.avatarData;
          entry.avatarWrap.style.display = '';
        } else {
          entry.avatarWrap.style.display = 'none';
        }
      }

      // For initial render ensure no sudden transitions
      entry.car.style.transition = 'none';
      entry.car.style.left = `${positionPercent}%`;
      // force reflow
      entry.car.offsetHeight;
      entry.car.style.transition = '';
    }
  });

  // Remove lanes for participants that no longer exist
  for (const removedId of existingIds) {
    const removed = laneElements.get(removedId);
    if (removed) {
      removed.lane.remove();
    }
    laneElements.delete(removedId);
  }
}

function formatDeltaAmount(amount) {
  const rounded = Math.round(Math.abs(amount) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function showDeltaBubble(id, amount) {
  const numericAmount = Number(amount) || 0;
  if (numericAmount === 0) return;

  const entry = laneElements.get(id);
  if (!entry || !entry.run) return;

  const position = Number(carPositions[id] || 0);
  const positionPercent = Math.min((position / COINS_PER_LAP) * 100, 100);

  const bubble = document.createElement('div');
  bubble.className = `race-delta-bubble${numericAmount < 0 ? ' negative' : ''}`;
  bubble.textContent = `${numericAmount < 0 ? '-' : '+'}${formatDeltaAmount(numericAmount)}`;
  bubble.style.left = `${positionPercent}%`;

  entry.run.appendChild(bubble);
  setTimeout(() => bubble.remove(), 950);
}

function animateToPercent(carEl, fromPercent, toPercent, durationSec = null) {
  return new Promise((resolve) => {
    if (fromPercent === toPercent) {
      // El navegador no dispara "transitionend" si el valor no cambia realmente,
      // así que sin esta salida la promesa nunca se resuelve y el conteo de
      // vueltas se queda congelado (pasa siempre que el remanente cae en 0).
      resolve();
      return;
    }

    const delta = Math.abs(toPercent - fromPercent);
    const duration = durationSec != null ? durationSec : Math.max(0.12, delta * 0.02);
    const onEnd = (e) => {
      if (e.propertyName === 'left') {
        carEl.removeEventListener('transitionend', onEnd);
        resolve();
      }
    };

    carEl.addEventListener('transitionend', onEnd);
    carEl.style.transition = `left ${duration}s linear`;
    carEl.style.left = `${toPercent}%`;
  });
}

async function animateCarProgress(id, startPercent, targetPercent, laps = 0) {
  const entry = laneElements.get(id);
  if (!entry) return;
  const carEl = entry.car;

  if (laps <= 0) {
    await animateToPercent(carEl, startPercent, targetPercent);
    return;
  }

  // Animate to end of track
  await animateToPercent(carEl, startPercent, 100);

  // reset to 0 without transition
  carEl.style.transition = 'none';
  carEl.style.left = '0%';
  // force reflow
  carEl.offsetHeight;

  // animate to remainder (targetPercent is percent of COINS_PER_LAP)
  await animateToPercent(carEl, 0, targetPercent);
}

function applyCoinsToParticipant(id, coins, contextNote = '') {
  if (!Object.prototype.hasOwnProperty.call(carPositions, id)) return;

  const normalizedCoins = Number(coins) || 0;
  if (normalizedCoins <= 0) return;

  const participant = participants.find((p) => p.id === id);
  if (!participant) return;

  showDeltaBubble(id, normalizedCoins);

  const currentProgress = Number(carPositions[id] || 0);
  const totalProgress = currentProgress + normalizedCoins;

  // Calculate only NEW laps crossed in this update
  const lapsBeforeUpdate = Math.floor(currentProgress / COINS_PER_LAP);
  const lapsAfterUpdate = Math.floor(totalProgress / COINS_PER_LAP);
  const laps = lapsAfterUpdate - lapsBeforeUpdate;

  const remainder = totalProgress - lapsAfterUpdate * COINS_PER_LAP;

  const startPercent = Math.min((currentProgress / COINS_PER_LAP) * 100, 100);
  const targetPercent = Math.min((remainder / COINS_PER_LAP) * 100, 100);

  // Animate movement. After animation finishes, update state and UI.
  (async () => {
    try {
      await animateCarProgress(id, startPercent, targetPercent, laps);

      // Commit state after animation
      carPositions[id] = Math.max(0, remainder);

      if (laps > 0) {
        finishCounts[id] = (Number(finishCounts[id] || 0) || 0) + laps;
        addHistoryEntry(`${participant.name} cruzó la meta (+${laps}). Total: ${finishCounts[id]} vueltas.`);

        // Check if this participant won
        if (!winnerParticipantId && finishCounts[id] >= raceLapsLimit) {
          winnerParticipantId = id;
          addHistoryEntry(`🏆 ¡${participant.name} GANÓ la carrera!`);
          showWinnerModal(id);
          resetRaceState(`Nueva carrera iniciada automáticamente tras la victoria de ${participant.name}.`);
        }
      }

      if (contextNote) {
        addHistoryEntry(contextNote);
      }

      saveState();

      // Update finish count display and leader styles
      const entry = laneElements.get(id);
      if (entry && entry.finishCount) {
        entry.finishCount.textContent = String(finishCounts[id] || 0);
      }
      updateLeaderStyles();
    } catch (err) {
      // Fallback to immediate update on error
      carPositions[id] = Math.max(0, remainder);
      if (laps > 0) {
        finishCounts[id] = (Number(finishCounts[id] || 0) || 0) + laps;
        addHistoryEntry(`${participant.name} cruzó la meta (+${laps}). Total: ${finishCounts[id]} vueltas.`);

        if (!winnerParticipantId && finishCounts[id] >= raceLapsLimit) {
          winnerParticipantId = id;
          addHistoryEntry(`🏆 ¡${participant.name} GANÓ la carrera!`);
          showWinnerModal(id);
          resetRaceState(`Nueva carrera iniciada automáticamente tras la victoria de ${participant.name}.`);
        }
      }
      if (contextNote) addHistoryEntry(contextNote);
      saveState();
      renderRaceTrack();
    }
  })();
}

function normalizeViewerKey(payload) {
  const userId = String(payload?.user?.userId || payload?.userId || '').trim();
  if (userId) return `id:${userId}`;

  const uniqueId = String(payload?.user?.uniqueId || payload?.uniqueId || '').trim().toLowerCase();
  if (uniqueId) return `uid:${uniqueId}`;

  const nickname = String(payload?.user?.nickname || payload?.nickname || '').trim().toLowerCase();
  if (nickname) return `nick:${nickname}`;

  return '';
}

function viewerDisplayName(payload) {
  return String(payload?.user?.nickname || payload?.user?.uniqueId || payload?.user?.userId || payload?.nickname || payload?.uniqueId || payload?.userId || 'Usuario');
}

function getLiveGiftProgressKey(payload) {
  const viewerKey = normalizeViewerKey(payload);
  const giftId = String(payload.giftId || '').trim();
  const giftName = String(payload.giftName || '').trim().toLowerCase();
  return [viewerKey, giftId || giftName].join('|');
}

function pruneLiveGiftProgress(now = Date.now()) {
  const ttlMs = 15000;
  for (const [key, entry] of liveGiftProgress.entries()) {
    const receivedAt = Number(entry?.receivedAt || 0) || 0;
    if (!receivedAt || now - receivedAt > ttlMs) {
      liveGiftProgress.delete(key);
    }
  }
}

function extractAppliedGiftCoins(payload) {
  const diamondCount = Number(payload.diamondCount || 0) || 0;
  const repeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
  const repeatEnd = payload.repeatEnd === true || payload.repeatEnd === 1 || payload.repeatEnd === '1';

  if (diamondCount <= 0) {
    return 0;
  }

  const now = Date.now();
  pruneLiveGiftProgress(now);

  const progressKey = getLiveGiftProgressKey(payload);
  const previous = liveGiftProgress.get(progressKey);
  let appliedCount = repeatCount;

  if (previous) {
    const previousCount = Number(previous.repeatCount || 0) || 0;
    const previousReceivedAt = Number(previous.receivedAt || 0) || 0;
    const sameWindow = !previousReceivedAt || now - previousReceivedAt <= 8000;

    if (sameWindow && repeatCount >= previousCount) {
      appliedCount = Math.max(0, repeatCount - previousCount);
    }
  }

  if (appliedCount === 0) {
    if (repeatEnd) {
      liveGiftProgress.delete(progressKey);
    }
    return 0;
  }

  liveGiftProgress.set(progressKey, {
    repeatCount,
    receivedAt: now,
  });

  if (repeatEnd) {
    liveGiftProgress.delete(progressKey);
  }

  return diamondCount * appliedCount;
}

function handleLiveComment(payload) {
  const rawComment = String(payload.comment || payload.commentText || '').trim();
  if (!rawComment) return;

  const normalizedComment = normalizeParticipantName(rawComment);
  const participant = participants.find((p) => normalizeParticipantName(p.name) === normalizedComment);
  if (!participant) return;

  const viewerKey = normalizeViewerKey(payload);
  if (!viewerKey) return;

  const sender = viewerDisplayName(payload);
  const previousParticipantId = viewerBindings[viewerKey] || null;
  viewerBindings[viewerKey] = participant.id;

  if (previousParticipantId !== participant.id) {
    addHistoryEntry(`${sender} quedó vinculado a ${participant.name}.`);
  }

  applyCoinsToParticipant(
    participant.id,
    COMMENT_COINS,
    `${sender} comentó "${participant.name}" (+${COMMENT_COINS} monedas).`,
  );
}

function handleLiveGift(payload) {
  const viewerKey = normalizeViewerKey(payload);
  if (!viewerKey) return;

  const participantId = viewerBindings[viewerKey];
  if (!participantId) {
    return;
  }

  const participant = participants.find((p) => p.id === participantId);
  if (!participant) {
    delete viewerBindings[viewerKey];
    return;
  }

  const coins = extractAppliedGiftCoins(payload);
  if (coins <= 0) {
    return;
  }

  const sender = viewerDisplayName(payload);
  const giftName = String(payload.giftName || payload.giftId || 'Regalo');
  applyCoinsToParticipant(
    participant.id,
    coins,
    `${sender} envió ${giftName} (+${coins} monedas para ${participant.name}).`,
  );
}

function handleLiveLike(payload) {
  if (!likesConfig.enabled || likesConfig.movePercent <= 0) return;

  const viewerKey = normalizeViewerKey(payload);
  if (!viewerKey) return;

  const participantId = viewerBindings[viewerKey];
  if (!participantId) return;

  const participant = participants.find((p) => p.id === participantId);
  if (!participant) {
    delete viewerBindings[viewerKey];
    return;
  }

  const likeCount = Math.max(0, Number(payload.likeCount || 1) || 0);
  if (likeCount <= 0) return;

  const previousTotal = viewerLikeCounts.get(viewerKey) || 0;
  const newTotal = previousTotal + likeCount;
  viewerLikeCounts.set(viewerKey, newTotal);

  const thresholdsBefore = Math.floor(previousTotal / likesConfig.likesPerMove);
  const thresholdsAfter = Math.floor(newTotal / likesConfig.likesPerMove);
  const triggers = thresholdsAfter - thresholdsBefore;
  if (triggers <= 0) return;

  const coins = triggers * (likesConfig.movePercent / 100) * COINS_PER_LAP;
  const sender = viewerDisplayName(payload);
  applyCoinsToParticipant(
    participant.id,
    coins,
    `${sender} llegó a ${newTotal} likes (+${likesConfig.movePercent}% de vuelta para ${participant.name}).`,
  );
}

function addHistoryEntry(text) {
  const timestamp = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  history.unshift({ text, timestamp });
  if (history.length > HISTORY_LIMIT) {
    history.pop();
  }
  renderHistory();
}

function renderHistory() {
  if (!raceHistoryList) return;

  raceHistoryList.innerHTML = '';
  history.slice(0, 20).forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<strong>${entry.timestamp}</strong> ${entry.text}`;
    raceHistoryList.appendChild(item);
  });
}

function resetRaceState(historyMessage) {
  participants.forEach(p => {
    carPositions[p.id] = 0;
    finishCounts[p.id] = 0;
  });
  winnerParticipantId = null;
  renderRaceTrack();
  updateLeaderStyles();
  if (historyMessage) addHistoryEntry(historyMessage);
  saveState();
}

function resetRace() {
  hideWinnerModal();
  resetRaceState('Carrera reiniciada');
}

async function clearParticipants() {
  const confirmed = await showAppConfirm('¿Eliminar todos los participantes?', 'Confirmar', 'Eliminar', 'Cancelar');
  if (confirmed) {
    participants = [];
    carPositions = {};
    finishCounts = {};
    viewerBindings = {};
    history = [];
    winnerParticipantId = null;
    hideWinnerModal();
    saveState();
    renderParticipants();
    renderRaceTrack();
    renderHistory();
  }
}

// Event listeners
if (addParticipantBtn) {
  addParticipantBtn.addEventListener('click', () => {
    addParticipant(participantNameInput.value);
  });
}

if (participantNameInput) {
  participantNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addParticipant(participantNameInput.value);
    }
  });
}

if (raceLapsLimitInput) {
  raceLapsLimitInput.addEventListener('change', () => {
    const value = Math.max(1, Math.min(999, Number(raceLapsLimitInput.value) || 5));
    raceLapsLimit = value;
    raceLapsLimitInput.value = value;
    addHistoryEntry(`Meta de vueltas actualizada a ${value}.`);
    saveState();
    maybeDeclareWinner();
  });
}

if (raceLikesEnabledToggle) {
  raceLikesEnabledToggle.addEventListener('change', () => {
    likesConfig.enabled = raceLikesEnabledToggle.checked;
    addHistoryEntry(likesConfig.enabled ? 'Movimiento por likes activado.' : 'Movimiento por likes desactivado.');
    saveState();
  });
}

if (raceLikesPerMoveInput) {
  raceLikesPerMoveInput.addEventListener('change', () => {
    const value = Math.max(1, Math.min(100000, Number(raceLikesPerMoveInput.value) || 50));
    likesConfig.likesPerMove = value;
    raceLikesPerMoveInput.value = value;
    viewerLikeCounts.clear();
    addHistoryEntry(`Ahora cada ${value} likes mueven el carro vinculado.`);
    saveState();
  });
}

if (raceLikesMovePercentInput) {
  raceLikesMovePercentInput.addEventListener('input', () => {
    const value = Math.max(0, Math.min(100, Number(raceLikesMovePercentInput.value) || 0));
    if (raceLikesMovePercentValue) raceLikesMovePercentValue.textContent = `${value}%`;
  });

  raceLikesMovePercentInput.addEventListener('change', () => {
    const value = Math.max(0, Math.min(100, Number(raceLikesMovePercentInput.value) || 0));
    likesConfig.movePercent = value;
    if (raceLikesMovePercentValue) raceLikesMovePercentValue.textContent = `${value}%`;
    addHistoryEntry(`Los likes ahora avanzan el carro un ${value}% de vuelta.`);
    saveState();
  });
}

if (raceWinnerCloseBtn) raceWinnerCloseBtn.addEventListener('click', hideWinnerModal);

if (raceInfoBtn) {
  raceInfoBtn.addEventListener('click', () => {
    if (raceInfoModal) {
      raceInfoModal.classList.remove('hidden');
      raceInfoModal.setAttribute('aria-hidden', 'false');
    }
  });
}

if (raceInfoCloseBtn) {
  raceInfoCloseBtn.addEventListener('click', () => {
    if (raceInfoModal) {
      raceInfoModal.classList.add('hidden');
      raceInfoModal.setAttribute('aria-hidden', 'true');
    }
  });
}

if (resetRaceBtn) resetRaceBtn.addEventListener('click', resetRace);
if (clearParticipantsBtn) clearParticipantsBtn.addEventListener('click', clearParticipants);
if (raceFullscreenBtn) raceFullscreenBtn.addEventListener('click', toggleFullscreenTrack);

if (raceLinkBtn) {
  raceLinkBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const uniqueId = raceUsername.value.trim().replace(/^@/, '');
    if (!uniqueId) {
      showAppAlert('Por favor ingresa un usuario de TikTok.', 'Usuario requerido');
      return;
    }

    if (confirm(`¿Estás seguro de que quieres vincular el juego a @${uniqueId}?\n\nNo podrás cambiar esta cuenta después.`)) {
      try {
        await saveTiktokConnectionRaceToDB(uniqueId);
        raceUsername.value = `@${uniqueId}`;
        lockRaceUsernameInput();
        setRaceConnectionStatus('disconnected', `Cuenta vinculada a @${uniqueId}. Ahora puedes conectar el live.`);
        addHistoryEntry(`Cuenta vinculada a TikTok Live: @${uniqueId}`);
      } catch (error) {
        showAppAlert(error.message, 'Error al guardar la cuenta');
      }
    }
  });
}

if (raceConnectLiveBtn) {
  raceConnectLiveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const uniqueId = raceUsername.value.trim().replace(/^@/, '');
    if (!uniqueId) {
      showAppAlert('Primero vincula y guarda tu cuenta de TikTok.', 'Cuenta requerida');
      return;
    }

    try {
      setRaceConnectionStatus('connecting', 'cargando...');
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueId, gameType: 'race' }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo conectar a TikTok Live');
      }

      isConnected = payload.status === 'connected';
      if (raceLiveIndicator) raceLiveIndicator.classList.toggle('hidden', !isConnected);
      setRaceConnectionStatus(payload.status || 'connected', payload.message || '', payload.error || '');
      if (isConnected) {
        addHistoryEntry(`Conectado a TikTok Live: @${uniqueId}`);
        connectToEvents();
      }
    } catch (error) {
      setRaceConnectionStatus('error', '', error.message);
    }
  });
}

if (raceDisconnectBtn) {
  raceDisconnectBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
      isConnected = false;
      if (liveEventsSource) {
        liveEventsSource.close();
        liveEventsSource = null;
      }
      if (raceLiveIndicator) raceLiveIndicator.classList.add('hidden');
      setRaceConnectionStatus('disconnected', 'Desconectado de TikTok Live. La cuenta vinculada permanece guardada.');
      addHistoryEntry('Desconectado de TikTok Live');
    } catch (error) {
      showAppAlert(error.message, 'Error al desconectar');
    }
  });
}

if (raceLoadCatalogBtn) {
  raceLoadCatalogBtn.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/gifts');
      if (!response.ok) throw new Error('No se pudo cargar el catálogo');
      const payload = await response.json();
      const gifts = Array.isArray(payload) ? payload : (Array.isArray(payload.gifts) ? payload.gifts : []);
      addHistoryEntry(`Catálogo cargado: ${gifts.length} regalos disponibles`);
      showAppAlert(`Se cargaron ${gifts.length} regalos de TikTok.`, 'Catálogo actualizado');
    } catch (error) {
      showAppAlert(error.message, 'Error al cargar catálogo');
    }
  });
}

async function saveTiktokConnectionRaceToDB(uniqueId) {
  try {
    const response = await fetch('/api/tiktok-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'race', tiktokUsername: uniqueId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'No se pudo guardar la cuenta.');
    }
  } catch (error) {
    console.error('[RACE] Error saving TikTok connection to DB:', error.message);
    throw error;
  }
}

async function restoreTiktokConnectionRace() {
  try {
    const response = await fetch('/api/tiktok-connection/race');
    if (!response.ok) return;

    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      raceUsername.value = `@${data.tiktok_username}`;
      lockRaceUsernameInput();
      setRaceConnectionStatus('disconnected', `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
    } else {
      raceUsername.value = '';
      unlockRaceUsernameInput();
      setRaceConnectionStatus('disconnected', 'Ingresa el nombre de usuario de TikTok que está transmitiendo en vivo.');
    }
  } catch (error) {
    console.error('[RACE] Error restoring TikTok connection from DB:', error.message);
  }
}

async function deleteTiktokConnectionRaceFromDB() {
  try {
    await fetch('/api/tiktok-connection/race', { method: 'DELETE' });
  } catch (error) {
    console.error('[RACE] Error deleting TikTok connection from DB:', error.message);
  }
}

window.addEventListener('resize', () => {
  updateTrackSizing();
});

document.addEventListener('fullscreenchange', () => {
  const inFullscreen = document.fullscreenElement === trackSection;
  raceFullscreenBtn.textContent = inFullscreen ? 'Salir pantalla completa' : 'Pantalla completa';
  updateTrackSizing();
});

function connectToEvents() {
  if (liveEventsSource) {
    liveEventsSource.close();
  }

  liveEventsSource = new EventSource('/events?gameType=race');

  liveEventsSource.addEventListener('status', (event) => {
    const payload = JSON.parse(event.data);
    isConnected = payload.status === 'connected';
    setRaceConnectionStatus(payload.status || 'disconnected', payload.message || '', payload.error || '');
  });

  liveEventsSource.addEventListener('gift', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (participants.length === 0) return;

      handleLiveGift(data);
    } catch (_error) {
      // Ignorar errores de parseo
    }
  });

  liveEventsSource.addEventListener('comment', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (participants.length === 0) return;
      handleLiveComment(data);
    } catch (_error) {
      // Ignorar errores de parseo
    }
  });

  liveEventsSource.addEventListener('like', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (participants.length === 0) return;
      handleLiveLike(data);
    } catch (_error) {
      // Ignorar errores de parseo
    }
  });

  liveEventsSource.addEventListener('error', () => {
    if (isConnected) {
      setRaceConnectionStatus('connecting', 'Reconectando eventos del servidor...');
    }
  });
}

function setRaceConnectionStatus(status, details = '', error = '') {
  if (!raceConnectionStatus) return;

  const uniqueId = raceUsername ? raceUsername.value.trim().replace(/^@/, '') : '';
  let displayStatus = status === 'disconnected' ? 'linked' : status;
  if (!uniqueId) displayStatus = 'unlinked';

  if (displayStatus === 'unlinked') {
    raceConnectionStatus.textContent = 'Desvinculado';
  } else if (displayStatus === 'linked') {
    raceConnectionStatus.textContent = 'Vinculado';
  } else if (displayStatus === 'connecting') {
    raceConnectionStatus.textContent = 'cargando...';
  } else if (displayStatus === 'connected') {
    raceConnectionStatus.textContent = 'conectado';
  } else if (displayStatus === 'live_off') {
    raceConnectionStatus.textContent = 'live apagado';
  } else {
    displayStatus = 'error';
    raceConnectionStatus.textContent = 'error al conectar live';
  }

  raceConnectionStatus.className = `status-badge ${displayStatus}`;

  if (!raceConnectionDetails) return;
  if (displayStatus === 'live_off') {
    raceConnectionDetails.textContent = 'live apagado';
  } else if (displayStatus === 'error') {
    raceConnectionDetails.textContent = 'error al conectar live, por favor contactate con un desarrollador';
  } else if (details) {
    raceConnectionDetails.textContent = details;
  } else if (displayStatus === 'unlinked') {
    raceConnectionDetails.textContent = 'No has vinculado un ID de TikTok Live.';
  } else if (displayStatus === 'linked') {
    raceConnectionDetails.textContent = `Cuenta vinculada: @${uniqueId}.`;
  } else if (displayStatus === 'connecting') {
    raceConnectionDetails.textContent = 'cargando...';
  } else if (displayStatus === 'connected') {
    raceConnectionDetails.textContent = `Conectado a @${uniqueId}.`;
  } else {
    raceConnectionDetails.textContent = 'No has vinculado un ID de TikTok Live.';
  }
}

async function initializeRace() {
  await loadState();
  await restoreTiktokConnectionRace();
}

initializeRace();
