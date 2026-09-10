// ===== Elementos del DOM =====
const shellUsername = document.getElementById('shellUsername');
const shellLinkBtn = document.getElementById('shellLinkBtn');
const shellConnectLiveBtn = document.getElementById('shellConnectLiveBtn');
const shellLoadCatalogBtn = document.getElementById('shellLoadCatalogBtn');
const shellDisconnectBtn = document.getElementById('shellDisconnectBtn');
const shellConnectionStatus = document.getElementById('shellConnectionStatusBadge');
const shellConnectionDetails = document.getElementById('shellConnectionDetails');

const shellCupCountInput = document.getElementById('shellCupCountInput');
const shellCupCountValue = document.getElementById('shellCupCountValue');
const shellVotingSecondsInput = document.getElementById('shellVotingSecondsInput');
const shellVotingSecondsValue = document.getElementById('shellVotingSecondsValue');
const shellMixSecondsInput = document.getElementById('shellMixSecondsInput');
const shellMixSecondsValue = document.getElementById('shellMixSecondsValue');
const shellMoveSpeedInput = document.getElementById('shellMoveSpeedInput');
const shellMoveSpeedValue = document.getElementById('shellMoveSpeedValue');
const shellResultSecondsInput = document.getElementById('shellResultSecondsInput');
const shellResultSecondsValue = document.getElementById('shellResultSecondsValue');

const shellModeGiftRulesBtn = document.getElementById('shellModeGiftRulesBtn');
const shellModeCommentConfirmBtn = document.getElementById('shellModeCommentConfirmBtn');
const shellGiftRulesPanel = document.getElementById('shellGiftRulesPanel');
const shellGiftRulesList = document.getElementById('shellGiftRulesList');
const shellCommentConfirmPanel = document.getElementById('shellCommentConfirmPanel');
const shellMinCoinsInput = document.getElementById('shellMinCoinsInput');

const shellStartPauseBtn = document.getElementById('shellStartPauseBtn');
const shellResetBtn = document.getElementById('shellResetBtn');

const shellPhaseLabel = document.getElementById('shellPhaseLabel');
const shellTimerLabel = document.getElementById('shellTimerLabel');
const shellRoundLabel = document.getElementById('shellRoundLabel');
const shellFullscreenBtn = document.getElementById('shellFullscreenBtn');
const shellTableCard = document.querySelector('.table-card');
const shellCupsRow = document.getElementById('shellCupsRow');
const shellGiftLabels = document.getElementById('shellGiftLabels');

const shellActivityList = document.getElementById('shellActivityList');
const shellLeaderboardList = document.getElementById('shellLeaderboardList');

const shellInfoBtn = document.getElementById('shellInfoBtn');
const shellInfoModal = document.getElementById('shellInfoModal');
const shellInfoCloseBtn = document.getElementById('shellInfoCloseBtn');

// ===== Estado persistido (respaldo en backend) =====
let state = {
  cupCount: 3,
  mode: 'gift_rules',
  giftRules: {},
  minCoinsToConfirm: 50,
  timing: { votingSeconds: 15, mixSeconds: 6, moveSpeed: 5, resultSeconds: 4 },
  leaderboard: {},
  history: [],
};

// ===== Estado transitorio (solo en memoria) =====
let isConnected = false;
let liveEventsSource = null;
let catalogGifts = [];
const liveGiftProgress = new Map();

let isRunning = false;
let phase = 'idle'; // idle | reveal | cover | betting | result
let level = 0;
let roundsPlayed = 0;
let ballSlotIndex = 0;
let slotOccupant = [];
let cupElements = [];
let currentRoundBets = [];
let pendingPicks = {};

const MAX_LEVEL = 15;
const REVEAL_MS = 1500;
const COVER_MS = 450;

const CUP_SVG_MARKUP = `
  <svg class="shell-cup-svg" viewBox="0 0 96 130" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shellCupGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a855f7" />
        <stop offset="55%" stop-color="#7c5cff" />
        <stop offset="100%" stop-color="#22d3ee" />
      </linearGradient>
    </defs>
    <ellipse class="shell-cup-body" cx="48" cy="20" rx="40" ry="12" fill="url(#shellCupGradient)" />
    <path class="shell-cup-body" d="M8 20 L24 118 Q48 130 72 118 L88 20 Z" fill="url(#shellCupGradient)" />
    <ellipse cx="48" cy="20" rx="40" ry="12" fill="rgba(255,255,255,0.14)" />
  </svg>
`;

// ===== Catálogo de regalos (calcado de roblox-dance.js) =====
function pickFirstUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return pickFirstUrl(value[0]);

  if (typeof value === 'object') {
    return (
      pickFirstUrl(value.url) ||
      pickFirstUrl(value.urlList) ||
      pickFirstUrl(value.url_list) ||
      pickFirstUrl(value.urls) ||
      pickFirstUrl(value.uri) ||
      ''
    );
  }

  return '';
}

function getGiftImageUrl(gift) {
  return (
    pickFirstUrl(gift?.imageUrl) ||
    pickFirstUrl(gift?.giftImage) ||
    pickFirstUrl(gift?.previewImage) ||
    pickFirstUrl(gift?.icon) ||
    pickFirstUrl(gift?.giftLabelIcon) ||
    pickFirstUrl(gift?.image) ||
    pickFirstUrl(gift?.staticImage) ||
    pickFirstUrl(gift?.dynamicImage) ||
    ''
  );
}

function sanitizeGiftCatalog(rawGifts) {
  return (Array.isArray(rawGifts) ? rawGifts : []).map((gift) => ({
    id: String(gift.id),
    name: gift.name || gift.giftName || `Regalo ID ${gift.id}`,
    diamondCount: Number(gift.diamondCount || gift.diamond_count || 1) || 1,
    imageUrl: gift.imageUrl || getGiftImageUrl(gift),
  }));
}

// ===== Helpers de espectador (calcados de race.js) =====
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
  return String(
    payload?.user?.nickname || payload?.user?.uniqueId || payload?.user?.userId ||
    payload?.nickname || payload?.uniqueId || payload?.userId || 'Usuario',
  );
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

// Devuelve cuántas unidades NUEVAS de este regalo llegaron desde el ultimo
// tick del mismo combo (evita contar la misma apuesta varias veces mientras
// el espectador mantiene presionado el boton del regalo).
function extractAppliedGiftCount(payload) {
  const diamondCount = Number(payload.diamondCount || 0) || 0;
  const repeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
  const repeatEnd = payload.repeatEnd === true || payload.repeatEnd === 1 || payload.repeatEnd === '1';

  if (diamondCount <= 0) return 0;

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
    if (repeatEnd) liveGiftProgress.delete(progressKey);
    return 0;
  }

  liveGiftProgress.set(progressKey, { repeatCount, receivedAt: now });
  if (repeatEnd) liveGiftProgress.delete(progressKey);

  return appliedCount;
}

// ===== Mesa de juego: posicionamiento y animación =====
function computeSlotLeftPercent(index, cupCount) {
  return ((index + 0.5) / cupCount) * 100;
}

function layoutCups() {
  shellCupsRow.innerHTML = '';
  cupElements = [];

  for (let i = 0; i < state.cupCount; i++) {
    const label = document.createElement('div');
    label.className = 'shell-slot-label';
    label.style.left = `${computeSlotLeftPercent(i, state.cupCount)}%`;
    label.textContent = String(i + 1);
    shellCupsRow.appendChild(label);
  }

  for (let i = 0; i < state.cupCount; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'shell-cup-slot';
    wrap.style.left = `${computeSlotLeftPercent(i, state.cupCount)}%`;
    wrap.innerHTML = CUP_SVG_MARKUP;
    shellCupsRow.appendChild(wrap);
    cupElements.push(wrap);
  }

  const ball = document.createElement('div');
  ball.className = 'shell-ball';
  ball.id = 'shellBallEl';
  shellCupsRow.appendChild(ball);

  resetSlotOccupants();
}

function getBallEl() {
  return document.getElementById('shellBallEl');
}

function resetSlotOccupants() {
  slotOccupant = cupElements.map((_, i) => i);
  cupElements.forEach((el, i) => {
    el.style.transition = 'none';
    el.style.left = `${computeSlotLeftPercent(i, state.cupCount)}%`;
    el.classList.remove('lifted');
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.style.transition = '';
  });
}

function swapSlots(a, b) {
  const idA = slotOccupant[a];
  const idB = slotOccupant[b];
  cupElements[idA].style.left = `${computeSlotLeftPercent(b, state.cupCount)}%`;
  cupElements[idB].style.left = `${computeSlotLeftPercent(a, state.cupCount)}%`;
  slotOccupant[a] = idB;
  slotOccupant[b] = idA;

  if (ballSlotIndex === a) ballSlotIndex = b;
  else if (ballSlotIndex === b) ballSlotIndex = a;
}

function liftCupAtSlot(slotIndex) {
  const el = cupElements[slotOccupant[slotIndex]];
  if (el) el.classList.add('lifted');
}

function lowerCupAtSlot(slotIndex) {
  const el = cupElements[slotOccupant[slotIndex]];
  if (el) el.classList.remove('lifted');
}

function showBallAtCurrentSlot() {
  const ball = getBallEl();
  if (!ball) return;
  ball.style.left = `${computeSlotLeftPercent(ballSlotIndex, state.cupCount)}%`;
  ball.classList.add('visible');
}

function hideBall() {
  const ball = getBallEl();
  if (ball) ball.classList.remove('visible');
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function setPhase(next) {
  phase = next;
  const labels = {
    idle: 'Esperando inicio',
    reveal: '👀 Mostrando la bola',
    cover: 'Cubriendo...',
    voting: '🗳️ ¡Elige tu vaso!',
    mixing: '🔀 Mezclando...',
    result: '🏆 Resultado',
  };
  shellPhaseLabel.textContent = labels[next] || next;
  shellRoundLabel.textContent = `Ronda ${roundsPlayed} · Nivel ${level}`;
}

// Duracion (ms) de la transicion de cada vaso al moverse durante la mezcla.
// El slider de velocidad (1 lento - 10 rapido) fija la base; el nivel la
// acelera un poco mas rondas, hasta un piso minimo para que siga siendo
// visible.
function computeSwapDurationMs(moveSpeed, currentLevel) {
  const base = 620 - (moveSpeed - 1) * 50;
  const levelReduction = Math.min(currentLevel * 6, 120);
  return Math.max(110, base - levelReduction);
}

function computeSwapCount(mixMs, swapDurationMs) {
  return Math.max(4, Math.round(mixMs / swapDurationMs));
}

async function runMixSequence(mixMs, swapDurationMs) {
  cupElements.forEach((el) => {
    el.style.transitionDuration = `${swapDurationMs}ms`;
  });

  const swapCount = computeSwapCount(mixMs, swapDurationMs);
  for (let i = 0; i < swapCount; i++) {
    if (!isRunning) return;
    const a = Math.floor(Math.random() * state.cupCount);
    let b = Math.floor(Math.random() * state.cupCount);
    while (b === a) b = Math.floor(Math.random() * state.cupCount);
    swapSlots(a, b);
    await delay(swapDurationMs);
  }

  cupElements.forEach((el) => {
    el.style.transitionDuration = '';
  });
}

function isBettingOpen() {
  return isRunning && phase === 'voting';
}

async function runVotingCountdown(seconds) {
  shellTimerLabel.classList.remove('hidden');
  for (let remaining = seconds; remaining > 0; remaining--) {
    if (!isRunning) {
      shellTimerLabel.classList.add('hidden');
      return;
    }
    shellTimerLabel.textContent = `${remaining}s`;
    await delay(1000);
  }
  shellTimerLabel.classList.add('hidden');
}

async function runRound() {
  level = Math.min(level + 1, MAX_LEVEL);
  roundsPlayed += 1;

  ballSlotIndex = Math.floor(Math.random() * state.cupCount);
  resetSlotOccupants();

  setPhase('reveal');
  showBallAtCurrentSlot();
  liftCupAtSlot(ballSlotIndex);
  await delay(REVEAL_MS);
  if (!isRunning) return;

  setPhase('cover');
  lowerCupAtSlot(ballSlotIndex);
  hideBall();
  await delay(COVER_MS);
  if (!isRunning) return;

  // Mezcla: los vasos se revuelven. Todavia no se aceptan apuestas.
  currentRoundBets = [];
  pendingPicks = {};
  setPhase('mixing');
  const swapDurationMs = computeSwapDurationMs(state.timing.moveSpeed, level);
  const mixMs = state.timing.mixSeconds * 1000;
  await runMixSequence(mixMs, swapDurationMs);
  if (!isRunning) return;

  // Tiempo de eleccion: los vasos ya quedaron quietos (revueltos) y la
  // bola sigue escondida mientras se aceptan apuestas.
  setPhase('voting');
  await runVotingCountdown(state.timing.votingSeconds);
  if (!isRunning) return;

  setPhase('result');
  const winningCupNumber = ballSlotIndex + 1;
  liftCupAtSlot(ballSlotIndex);
  showBallAtCurrentSlot();
  resolveBets(winningCupNumber);
  renderLeaderboard();
  await delay(state.timing.resultSeconds * 1000);
  if (!isRunning) return;

  lowerCupAtSlot(ballSlotIndex);
  hideBall();
}

async function gameLoop() {
  while (isRunning) {
    // eslint-disable-next-line no-await-in-loop
    await runRound();
  }
}

function startGame() {
  if (isRunning) return;
  isRunning = true;
  shellStartPauseBtn.textContent = 'Pausar juego';
  gameLoop();
}

function pauseGame() {
  isRunning = false;
  setPhase('idle');
  shellTimerLabel.classList.add('hidden');
  shellStartPauseBtn.textContent = 'Iniciar juego';
}

function resetGame() {
  pauseGame();
  level = 0;
  roundsPlayed = 0;
  state.leaderboard = {};
  state.history = [];
  currentRoundBets = [];
  pendingPicks = {};
  resetSlotOccupants();
  hideBall();
  shellRoundLabel.textContent = 'Ronda 0';
  shellPhaseLabel.textContent = 'Esperando inicio';
  renderLeaderboard();
  renderActivityEmpty();
  scheduleSave();
}

// ===== Apuestas =====
function addActivityEntry(message, correct = false) {
  const entry = document.createElement('p');
  entry.className = `activity-entry${correct ? ' correct' : ''}`;
  entry.textContent = message;
  if (shellActivityList.firstElementChild?.classList.contains('muted')) {
    shellActivityList.innerHTML = '';
  }
  shellActivityList.prepend(entry);
  while (shellActivityList.children.length > 40) {
    shellActivityList.removeChild(shellActivityList.lastElementChild);
  }
}

function renderActivityEmpty() {
  shellActivityList.innerHTML = '<p class="muted">Aún no se ha detectado ninguna apuesta.</p>';
}

function resolveBets(winningCupNumber) {
  currentRoundBets.forEach((bet) => {
    const isCorrect = bet.cup === winningCupNumber;
    const coins = Math.max(0, Math.round(bet.coins || 0));

    if (isCorrect) {
      const entry = state.leaderboard[bet.viewerKey] || { nickname: bet.nickname, points: 0, correctGuesses: 0 };
      entry.nickname = bet.nickname || entry.nickname;
      entry.points += coins;
      entry.correctGuesses += 1;
      state.leaderboard[bet.viewerKey] = entry;
    }

    addActivityEntry(
      `${bet.nickname} apostó al vaso ${bet.cup}${isCorrect ? ` — ¡ACERTÓ! (+${coins} pts)` : ''}`,
      isCorrect,
    );
  });

  const message = currentRoundBets.length === 0
    ? `Ronda ${roundsPlayed}: la bola estaba en el vaso ${winningCupNumber}. Nadie apostó.`
    : `Ronda ${roundsPlayed}: la bola estaba en el vaso ${winningCupNumber}.`;

  state.history.unshift({
    id: `round-${Date.now()}`,
    message,
    winningCup: winningCupNumber,
    createdAt: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 50);
  scheduleSave();
}

function renderLeaderboard() {
  const entries = Object.values(state.leaderboard)
    .filter((entry) => entry.points > 0)
    .sort((a, b) => (b.points - a.points) || (b.correctGuesses - a.correctGuesses))
    .slice(0, 10);

  if (entries.length === 0) {
    shellLeaderboardList.innerHTML = '<p class="muted">Aún no hay puntajes.</p>';
    return;
  }

  shellLeaderboardList.innerHTML = entries.map((entry, index) => `
    <div class="leaderboard-item">
      <span class="leaderboard-rank">${index + 1}</span>
      <span class="leaderboard-name">${escapeHtml(entry.nickname)} <small class="leaderboard-hits">(${entry.correctGuesses} acierto${entry.correctGuesses === 1 ? '' : 's'})</small></span>
      <span class="leaderboard-score">${entry.points} pts</span>
    </div>
  `).join('');
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

function handleLiveComment(payload) {
  if (state.mode !== 'comment_confirm' || !isBettingOpen()) return;

  const rawComment = String(payload.comment || payload.commentText || '').trim();
  if (!rawComment) return;

  const match = rawComment.match(/\d+/);
  if (!match) return;

  const cup = Number(match[0]);
  if (!Number.isFinite(cup) || cup < 1 || cup > state.cupCount) return;

  const viewerKey = normalizeViewerKey(payload);
  if (!viewerKey) return;

  pendingPicks[viewerKey] = { cup, nickname: viewerDisplayName(payload) };
}

function handleLiveGift(payload) {
  if (!isBettingOpen()) return;

  const viewerKey = normalizeViewerKey(payload);
  if (!viewerKey) return;

  const nickname = viewerDisplayName(payload);

  if (state.mode === 'gift_rules') {
    const appliedCount = extractAppliedGiftCount(payload);
    if (appliedCount <= 0) return;

    const giftName = String(payload.giftName || '').trim().toLowerCase();
    const rule = state.giftRules[giftName];
    if (!rule || rule.cup < 1 || rule.cup > state.cupCount) return;

    const diamondCount = Number(payload.diamondCount || 0) || 0;
    const coins = diamondCount * appliedCount;

    currentRoundBets.push({ viewerKey, nickname, cup: rule.cup, coins });
    addActivityEntry(`${nickname} apostó al vaso ${rule.cup} con ${payload.giftName || 'un regalo'} (x${appliedCount}, ${coins} monedas).`);
  } else {
    const repeatEnd = payload.repeatEnd === true || payload.repeatEnd === 1 || payload.repeatEnd === '1';
    if (!repeatEnd) return;

    const diamondCount = Number(payload.diamondCount || 0) || 0;
    const repeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
    const totalCoins = diamondCount * repeatCount;
    if (totalCoins < state.minCoinsToConfirm) return;

    const pending = pendingPicks[viewerKey];
    if (!pending) return;

    currentRoundBets.push({ viewerKey, nickname, cup: pending.cup, coins: totalCoins });
    addActivityEntry(`${nickname} confirmó su apuesta al vaso ${pending.cup} con ${payload.giftName || 'un regalo'} (${totalCoins} monedas).`);
  }
}

// ===== Configuración: UI =====
function applyStateToControls() {
  shellCupCountInput.value = state.cupCount;
  shellCupCountValue.textContent = state.cupCount;
  shellVotingSecondsInput.value = state.timing.votingSeconds;
  shellVotingSecondsValue.textContent = `${state.timing.votingSeconds}s`;
  shellMixSecondsInput.value = state.timing.mixSeconds;
  shellMixSecondsValue.textContent = `${state.timing.mixSeconds}s`;
  shellMoveSpeedInput.value = state.timing.moveSpeed;
  shellMoveSpeedValue.textContent = state.timing.moveSpeed;
  shellResultSecondsInput.value = state.timing.resultSeconds;
  shellResultSecondsValue.textContent = `${state.timing.resultSeconds}s`;
  shellMinCoinsInput.value = state.minCoinsToConfirm;
  setModeUI(state.mode);
  renderGiftRulesPanel();
  renderLeaderboard();
}

function setModeUI(mode) {
  state.mode = mode;
  shellModeGiftRulesBtn.classList.toggle('active', mode === 'gift_rules');
  shellModeCommentConfirmBtn.classList.toggle('active', mode === 'comment_confirm');
  shellGiftRulesPanel.classList.toggle('hidden', mode !== 'gift_rules');
  shellCommentConfirmPanel.classList.toggle('hidden', mode !== 'comment_confirm');
  renderCupGiftImages();
}

// state.giftRules es { [giftNameLower]: { cup, giftName, imageUrl } } — la
// clave es el nombre del regalo (para resolver rapido cuando llega un
// regalo en vivo) y el valor guarda a que POSICION quedo asignado, junto
// con el nombre/imagen originales para poder mostrarlos sin depender de
// que el catalogo siga cargado (se persisten con el resto del estado).
function getGiftRuleForCup(cupNumber) {
  for (const [giftNameLower, rule] of Object.entries(state.giftRules)) {
    if (rule?.cup === cupNumber) return { giftNameLower, ...rule };
  }
  return null;
}

function setGiftRuleForCup(cupNumber, giftNameLower, giftName, imageUrl) {
  for (const key of Object.keys(state.giftRules)) {
    if (state.giftRules[key]?.cup === cupNumber) delete state.giftRules[key];
  }
  if (giftNameLower) {
    state.giftRules[giftNameLower] = { cup: cupNumber, giftName: giftName || giftNameLower, imageUrl: imageUrl || '' };
  }
  scheduleSave();
  renderCupGiftImages();
}

function renderGiftRulesPanel() {
  shellGiftRulesList.innerHTML = '';

  for (let cup = 1; cup <= state.cupCount; cup++) {
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = `Vaso ${cup}`;

    const select = document.createElement('select');
    select.dataset.cup = String(cup);

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = catalogGifts.length === 0 ? 'Carga el catálogo primero' : 'Sin asignar';
    select.appendChild(emptyOption);

    const currentRule = getGiftRuleForCup(cup);
    let matched = false;

    catalogGifts.forEach((gift) => {
      const value = String(gift.name || '').trim().toLowerCase();
      const option = document.createElement('option');
      option.value = value;
      option.textContent = gift.name;
      option.dataset.name = gift.name;
      option.dataset.image = gift.imageUrl || '';
      if (currentRule && value === currentRule.giftNameLower) {
        option.selected = true;
        matched = true;
      }
      select.appendChild(option);
    });

    if (!matched && currentRule) {
      const fallbackOption = document.createElement('option');
      fallbackOption.value = currentRule.giftNameLower;
      fallbackOption.textContent = currentRule.giftName;
      fallbackOption.dataset.name = currentRule.giftName;
      fallbackOption.dataset.image = currentRule.imageUrl || '';
      fallbackOption.selected = true;
      select.appendChild(fallbackOption);
    }

    select.addEventListener('change', () => {
      const chosen = select.selectedOptions[0];
      setGiftRuleForCup(cup, select.value || '', chosen?.dataset.name || '', chosen?.dataset.image || '');
    });

    label.appendChild(select);
    shellGiftRulesList.appendChild(label);
  }
}

// Dibuja, debajo de cada POSICION (no del vaso que se mueve), la imagen del
// regalo asignado en el modo "Reglas por regalo".
function renderCupGiftImages() {
  shellGiftLabels.innerHTML = '';
  if (state.mode !== 'gift_rules') return;

  for (let cup = 1; cup <= state.cupCount; cup++) {
    const rule = getGiftRuleForCup(cup);
    if (!rule || !rule.imageUrl) continue;

    const img = document.createElement('img');
    img.className = 'shell-gift-label-img';
    img.src = rule.imageUrl;
    img.alt = rule.giftName || '';
    img.style.left = `${computeSlotLeftPercent(cup - 1, state.cupCount)}%`;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    shellGiftLabels.appendChild(img);
  }
}

// ===== Persistencia =====
let saveTimeout = null;
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 600);
}

function saveState() {
  fetch('/api/shell-game/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }).catch((error) => {
    console.error('[ShellGame] Error saving state:', error.message);
  });
}

async function loadState() {
  try {
    const response = await fetch('/api/shell-game/state');
    if (!response.ok) return;
    const data = await response.json();
    state = {
      cupCount: Math.max(3, Math.min(8, Number(data.cupCount) || 3)),
      mode: data.mode === 'comment_confirm' ? 'comment_confirm' : 'gift_rules',
      giftRules: data.giftRules || {},
      minCoinsToConfirm: Math.max(1, Number(data.minCoinsToConfirm) || 50),
      timing: {
        votingSeconds: Math.max(5, Math.min(60, Number(data.timing?.votingSeconds) || 15)),
        mixSeconds: Math.max(3, Math.min(20, Number(data.timing?.mixSeconds) || 6)),
        moveSpeed: Math.max(1, Math.min(10, Number(data.timing?.moveSpeed) || 5)),
        resultSeconds: Math.max(2, Math.min(15, Number(data.timing?.resultSeconds) || 4)),
      },
      leaderboard: data.leaderboard || {},
      history: Array.isArray(data.history) ? data.history : [],
    };
  } catch (error) {
    console.error('[ShellGame] Error loading state:', error.message);
  }
}

// ===== Conexión TikTok Live =====
function lockShellUsernameInput() {
  if (shellUsername) shellUsername.disabled = true;
  if (shellLinkBtn) shellLinkBtn.disabled = true;
  if (shellConnectLiveBtn) shellConnectLiveBtn.disabled = false;
}

function unlockShellUsernameInput() {
  if (shellUsername) shellUsername.disabled = false;
  if (shellLinkBtn) shellLinkBtn.disabled = false;
  if (shellConnectLiveBtn) shellConnectLiveBtn.disabled = true;
}

function setShellConnectionStatus(status, details = '', error = '') {
  if (!shellConnectionStatus) return;

  const uniqueId = shellUsername ? shellUsername.value.trim().replace(/^@/, '') : '';
  let displayStatus = status === 'disconnected' ? 'linked' : status;
  if (!uniqueId) displayStatus = 'unlinked';

  const labels = {
    unlinked: 'Desvinculado',
    linked: 'Vinculado',
    connecting: 'cargando...',
    connected: 'conectado',
    live_off: 'live apagado',
  };

  if (!labels[displayStatus]) displayStatus = 'error';
  shellConnectionStatus.textContent = labels[displayStatus] || 'error al conectar live';
  shellConnectionStatus.className = `status-badge ${displayStatus}`;

  if (!shellConnectionDetails) return;
  if (displayStatus === 'error') {
    shellConnectionDetails.textContent = 'error al conectar live, por favor contactate con un desarrollador';
  } else if (details) {
    shellConnectionDetails.textContent = details;
  } else if (displayStatus === 'unlinked') {
    shellConnectionDetails.textContent = 'No has vinculado un ID de TikTok Live.';
  } else if (displayStatus === 'linked') {
    shellConnectionDetails.textContent = `Cuenta vinculada: @${uniqueId}.`;
  } else if (displayStatus === 'connected') {
    shellConnectionDetails.textContent = `Conectado a @${uniqueId}.`;
  }
}

async function saveTiktokConnectionToDB(uniqueId) {
  const response = await fetch('/api/tiktok-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameType: 'shellgame', tiktokUsername: uniqueId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'No se pudo guardar la cuenta.');
  }
}

async function restoreTiktokConnection() {
  try {
    const response = await fetch('/api/tiktok-connection/shellgame');
    if (!response.ok) return;
    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      shellUsername.value = `@${data.tiktok_username}`;
      lockShellUsernameInput();
      setShellConnectionStatus('disconnected', `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
    } else {
      shellUsername.value = '';
      unlockShellUsernameInput();
      setShellConnectionStatus('disconnected', 'Ingresa el nombre de usuario de TikTok que está transmitiendo en vivo.');
    }
  } catch (error) {
    console.error('[ShellGame] Error restoring TikTok connection:', error.message);
  }
}

function connectToEvents() {
  if (liveEventsSource) liveEventsSource.close();

  liveEventsSource = new EventSource('/events?gameType=shellgame');

  liveEventsSource.addEventListener('status', (event) => {
    const payload = JSON.parse(event.data);
    isConnected = payload.status === 'connected';
    setShellConnectionStatus(payload.status || 'disconnected', payload.message || '', payload.error || '');
  });

  liveEventsSource.addEventListener('gift', (event) => {
    try {
      handleLiveGift(JSON.parse(event.data));
    } catch (error) {
      console.error('[ShellGame] Error handling gift event:', error.message);
    }
  });

  liveEventsSource.addEventListener('comment', (event) => {
    try {
      handleLiveComment(JSON.parse(event.data));
    } catch (error) {
      console.error('[ShellGame] Error handling comment event:', error.message);
    }
  });

  liveEventsSource.addEventListener('error', () => {
    if (isConnected) {
      setShellConnectionStatus('connecting', 'Reconectando eventos del servidor...');
    }
  });
}

if (shellLinkBtn) {
  shellLinkBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const uniqueId = shellUsername.value.trim().replace(/^@/, '');
    if (!uniqueId) {
      showAppAlert('Por favor ingresa un usuario de TikTok.', 'Usuario requerido');
      return;
    }

    const confirmed = await showAppConfirm(
      `¿Estás seguro de que quieres vincular el juego a @${uniqueId}?\n\nNo podrás cambiar esta cuenta después.`,
      'Vincular cuenta',
    );
    if (!confirmed) return;

    try {
      await saveTiktokConnectionToDB(uniqueId);
      shellUsername.value = `@${uniqueId}`;
      lockShellUsernameInput();
      setShellConnectionStatus('disconnected', `Cuenta vinculada a @${uniqueId}. Ahora puedes conectar el live.`);
    } catch (error) {
      showAppAlert(error.message, 'Error al guardar la cuenta');
    }
  });
}

if (shellConnectLiveBtn) {
  shellConnectLiveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const uniqueId = shellUsername.value.trim().replace(/^@/, '');
    if (!uniqueId) {
      showAppAlert('Primero vincula y guarda tu cuenta de TikTok.', 'Cuenta requerida');
      return;
    }

    try {
      setShellConnectionStatus('connecting', 'cargando...');
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueId, gameType: 'shellgame' }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo conectar a TikTok Live');
      }

      isConnected = payload.status === 'connected';
      setShellConnectionStatus(payload.status || 'connected', payload.message || '', payload.error || '');
      if (isConnected) connectToEvents();
    } catch (error) {
      setShellConnectionStatus('error', '', error.message);
    }
  });
}

if (shellDisconnectBtn) {
  shellDisconnectBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
      isConnected = false;
      if (liveEventsSource) {
        liveEventsSource.close();
        liveEventsSource = null;
      }
      setShellConnectionStatus('disconnected', 'Desconectado de TikTok Live. La cuenta vinculada permanece guardada.');
    } catch (error) {
      showAppAlert(error.message, 'Error al desconectar');
    }
  });
}

if (shellLoadCatalogBtn) {
  shellLoadCatalogBtn.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/gifts');
      if (!response.ok) throw new Error('No se pudo cargar el catálogo');
      const payload = await response.json();
      const rawGifts = Array.isArray(payload) ? payload : (Array.isArray(payload.gifts) ? payload.gifts : []);
      catalogGifts = sanitizeGiftCatalog(rawGifts);
      renderGiftRulesPanel();
      showAppAlert(`Se cargaron ${catalogGifts.length} regalos de TikTok.`, 'Catálogo actualizado');
    } catch (error) {
      showAppAlert(error.message, 'Error al cargar catálogo');
    }
  });
}

// ===== Controles de configuración =====
shellCupCountInput.addEventListener('input', () => {
  shellCupCountValue.textContent = shellCupCountInput.value;
});

shellCupCountInput.addEventListener('change', () => {
  state.cupCount = Math.max(3, Math.min(8, Number(shellCupCountInput.value) || 3));
  shellCupCountValue.textContent = state.cupCount;
  layoutCups();
  renderGiftRulesPanel();
  renderCupGiftImages();
  scheduleSave();
});

shellVotingSecondsInput.addEventListener('input', () => {
  shellVotingSecondsValue.textContent = `${shellVotingSecondsInput.value}s`;
});

shellVotingSecondsInput.addEventListener('change', () => {
  state.timing.votingSeconds = Math.max(5, Math.min(60, Number(shellVotingSecondsInput.value) || 15));
  shellVotingSecondsValue.textContent = `${state.timing.votingSeconds}s`;
  scheduleSave();
});

shellMixSecondsInput.addEventListener('input', () => {
  shellMixSecondsValue.textContent = `${shellMixSecondsInput.value}s`;
});

shellMixSecondsInput.addEventListener('change', () => {
  state.timing.mixSeconds = Math.max(3, Math.min(20, Number(shellMixSecondsInput.value) || 6));
  shellMixSecondsValue.textContent = `${state.timing.mixSeconds}s`;
  scheduleSave();
});

shellMoveSpeedInput.addEventListener('input', () => {
  shellMoveSpeedValue.textContent = shellMoveSpeedInput.value;
});

shellMoveSpeedInput.addEventListener('change', () => {
  state.timing.moveSpeed = Math.max(1, Math.min(10, Number(shellMoveSpeedInput.value) || 5));
  shellMoveSpeedValue.textContent = state.timing.moveSpeed;
  scheduleSave();
});

shellResultSecondsInput.addEventListener('input', () => {
  shellResultSecondsValue.textContent = `${shellResultSecondsInput.value}s`;
});

shellResultSecondsInput.addEventListener('change', () => {
  state.timing.resultSeconds = Math.max(2, Math.min(15, Number(shellResultSecondsInput.value) || 4));
  shellResultSecondsValue.textContent = `${state.timing.resultSeconds}s`;
  scheduleSave();
});

shellMinCoinsInput.addEventListener('change', () => {
  state.minCoinsToConfirm = Math.max(1, Number(shellMinCoinsInput.value) || 50);
  shellMinCoinsInput.value = state.minCoinsToConfirm;
  scheduleSave();
});

shellModeGiftRulesBtn.addEventListener('click', () => {
  setModeUI('gift_rules');
  scheduleSave();
});

shellModeCommentConfirmBtn.addEventListener('click', () => {
  setModeUI('comment_confirm');
  scheduleSave();
});

shellStartPauseBtn.addEventListener('click', () => {
  if (isRunning) pauseGame();
  else startGame();
});

shellResetBtn.addEventListener('click', async () => {
  const confirmed = await showAppConfirm('¿Seguro que quieres reiniciar el juego? Se borrará el leaderboard actual.', 'Reiniciar juego');
  if (confirmed) resetGame();
});

async function toggleFullscreenTable() {
  if (!shellTableCard) return;

  try {
    if (document.fullscreenElement === shellTableCard) {
      await document.exitFullscreen();
    } else {
      await shellTableCard.requestFullscreen();
    }
  } catch (_error) {
    showAppAlert('No fue posible cambiar a pantalla completa en este navegador.', 'Pantalla completa');
  }
}

if (shellFullscreenBtn) {
  shellFullscreenBtn.addEventListener('click', toggleFullscreenTable);
}

document.addEventListener('fullscreenchange', () => {
  const inFullscreen = document.fullscreenElement === shellTableCard;
  if (shellFullscreenBtn) {
    shellFullscreenBtn.textContent = inFullscreen ? 'Salir pantalla completa' : 'Pantalla completa';
  }
});

if (shellInfoBtn) {
  shellInfoBtn.addEventListener('click', () => {
    shellInfoModal.classList.remove('hidden');
    shellInfoModal.setAttribute('aria-hidden', 'false');
  });
}

if (shellInfoCloseBtn) {
  shellInfoCloseBtn.addEventListener('click', () => {
    shellInfoModal.classList.add('hidden');
    shellInfoModal.setAttribute('aria-hidden', 'true');
  });
}

// ===== Inicialización =====
async function initializeShellGame() {
  await loadState();
  applyStateToControls();
  layoutCups();
  renderActivityEmpty();
  await restoreTiktokConnection();
}

initializeShellGame();
