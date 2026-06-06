const liveIndicator = document.getElementById("snakeLiveIndicator");
const MAX_RULES = 80;
const MAX_HISTORY = 200;
const MAX_HISTORY_RENDER_ITEMS = 40;
const DEFAULT_ROWS = 14;
const DEFAULT_COLS = 14;
const DEFAULT_TICK_MS = 450;
const SPEED_MIN_MS = 60;
const SPEED_MAX_MS = 3000;
const SPEED_STEP_MS = 10;

const state = createDefaultState();
let liveEventsSource = null;
let selectedGiftId = '';
let giftSearchTerm = '';
let saveTimer = null;
let lastPersistedStateHash = '';
let animationFrameId = null;
let lastUpdateTime = 0;
let gameRunning = false;
let historyRenderScheduled = false;
let isHydratingState = false;
let winnerOverlayTimer = null;
let lastProcessedGiftSignature = '';
let lastProcessedGiftAt = 0;
const boardImageCache = { left: null, right: null };
const carryOverApples = { left: 0, right: 0 };

// Gift catalog state variables for LEFT snake
let leftSelectedCatalogGiftId = '';
let leftGiftNameFilter = '';
let leftGiftCoinsFilter = '';

// Gift catalog state variables for RIGHT snake
let rightSelectedCatalogGiftId = '';
let rightGiftNameFilter = '';
let rightGiftCoinsFilter = '';

const snakeConnectionForm = document.getElementById('snakeConnectionForm');
const snakeUsernameInput = document.getElementById('snakeUsername');
const snakeLinkBtn = document.getElementById('snakeLinkBtn');
const snakeConnectLiveBtn = document.getElementById('snakeConnectLiveBtn');
const snakeLoadCatalogBtn = document.getElementById('snakeLoadCatalogBtn');
const snakeDisconnectBtn = document.getElementById('snakeDisconnectBtn');
const snakeResetBtn = document.getElementById('snakeResetBtn');
const snakeConnectionStatus = document.getElementById('snakeConnectionStatusBadge');
const snakeConnectionDetails = document.getElementById('snakeConnectionDetails');
const leaderBadge = document.getElementById('leaderBadge');
const winnerBadge = document.getElementById('winnerBadge');
const leftStats = document.getElementById('leftStats');
const rightStats = document.getElementById('rightStats');
const leftBoard = document.getElementById('leftBoard');
const rightBoard = document.getElementById('rightBoard');
const leftWins = document.getElementById('leftWins');
const rightWins = document.getElementById('rightWins');
const leftApplesCounter = document.getElementById('leftApplesCounter');
const rightApplesCounter = document.getElementById('rightApplesCounter');
const leftAddAppleBtn = document.getElementById('leftAddAppleBtn');
const rightAddAppleBtn = document.getElementById('rightAddAppleBtn');
const snakeGiftSearch = document.getElementById('snakeGiftSearch');
const snakeGiftList = document.getElementById('snakeGiftList');
const snakeGiftPreview = document.getElementById('snakeGiftPreview');
const snakeGiftPreviewName = document.getElementById('snakeGiftPreviewName');
const snakeGiftPreviewMeta = document.getElementById('snakeGiftPreviewMeta');
const snakeRuleSide = document.getElementById('snakeRuleSide');
const snakeRuleApples = document.getElementById('snakeRuleApples');
const snakeAddRuleBtn = document.getElementById('snakeAddRuleBtn');
const snakeRulesList = document.getElementById('snakeRulesList');
const snakeHistoryList = document.getElementById('snakeHistoryList');
const snakeSpeedLabel = document.getElementById('snakeSpeedLabel');
const snakeSpeedValue = document.getElementById('snakeSpeedValue');
const snakeSpeedSlider = document.getElementById('snakeSpeedSlider');
const snakePauseBtn = document.getElementById('snakePauseBtn');
const snakeResumeBtn = document.getElementById('snakeResumeBtn');
const leftSnakeNameInput = document.getElementById('leftSnakeNameInput');
const rightSnakeNameInput = document.getElementById('rightSnakeNameInput');
const leftSnakeColorInput = document.getElementById('leftSnakeColorInput');
const rightSnakeColorInput = document.getElementById('rightSnakeColorInput');
const leftBoardImageInput = document.getElementById('leftBoardImageInput');
const rightBoardImageInput = document.getElementById('rightBoardImageInput');
const leftRuleGiftInput = document.getElementById('leftRuleGiftInput');
const leftRuleApplesInput = document.getElementById('leftRuleApplesInput');
const leftRuleSaveBtn = document.getElementById('leftRuleSaveBtn');
const leftRuleGiftOptions = document.getElementById('leftRuleGiftOptions');
const rightRuleGiftInput = document.getElementById('rightRuleGiftInput');
const rightRuleApplesInput = document.getElementById('rightRuleApplesInput');
const rightRuleSaveBtn = document.getElementById('rightRuleSaveBtn');
const rightRuleGiftOptions = document.getElementById('rightRuleGiftOptions');
const leftConfigSaveBtn = document.getElementById('leftConfigSaveBtn');
const rightConfigSaveBtn = document.getElementById('rightConfigSaveBtn');
const leftConfigStatus = document.getElementById('leftConfigStatus');
const rightConfigStatus = document.getElementById('rightConfigStatus');
const leftConfigRulesList = document.getElementById('leftConfigRulesList');
const rightConfigRulesList = document.getElementById('rightConfigRulesList');
const leftBoardGifts = document.getElementById('leftBoardGifts');
const rightBoardGifts = document.getElementById('rightBoardGifts');
const fullscreenToggleBtn = document.getElementById('fullscreenToggleBtn');
const boardGrid = document.getElementById('boardGrid');

// LEFT gift catalog elements
const leftGiftCatalogToggle = document.getElementById('leftGiftCatalogToggle');
const leftGiftCatalogMenu = document.getElementById('leftGiftCatalogMenu');
const leftGiftSearchInput = document.getElementById('leftGiftSearchInput');
const leftGiftCoinsFilterInput = document.getElementById('leftGiftCoinsFilterInput');
const leftGiftCatalogOptions = document.getElementById('leftGiftCatalogOptions');
const leftGiftCatalogPreviewImage = document.getElementById('leftGiftCatalogPreviewImage');
const leftGiftCatalogPreviewName = document.getElementById('leftGiftCatalogPreviewName');
const leftGiftCatalogPreviewMeta = document.getElementById('leftGiftCatalogPreviewMeta');
const leftGiftCatalogPreview = document.getElementById('leftGiftCatalogPreview');

// RIGHT gift catalog elements
const rightGiftCatalogToggle = document.getElementById('rightGiftCatalogToggle');
const rightGiftCatalogMenu = document.getElementById('rightGiftCatalogMenu');
const rightGiftSearchInput = document.getElementById('rightGiftSearchInput');
const rightGiftCoinsFilterInput = document.getElementById('rightGiftCoinsFilterInput');
const rightGiftCatalogOptions = document.getElementById('rightGiftCatalogOptions');
const rightGiftCatalogPreviewImage = document.getElementById('rightGiftCatalogPreviewImage');
const rightGiftCatalogPreviewName = document.getElementById('rightGiftCatalogPreviewName');
const rightGiftCatalogPreviewMeta = document.getElementById('rightGiftCatalogPreviewMeta');
const rightGiftCatalogPreview = document.getElementById('rightGiftCatalogPreview');
const leftSnakeTitle = document.getElementById('leftSnakeTitle');
const rightSnakeTitle = document.getElementById('rightSnakeTitle');
const winnerOverlay = document.getElementById('winnerOverlay');
const winnerName = document.getElementById('winnerName');

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function createDefaultSnake(side, direction, color, label) {
  return {
    side,
    direction,
    label,
    color,
    boardImage: null,
    headIndex: 2,
    prevHeadIndex: 2,
    length: 3,
    prevLength: 3,
    applesEaten: 0,
    wins: 0,
    finished: false,
    apples: [],
  };
}

function createDefaultState() {
  return {
    settings: {
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      tickMs: DEFAULT_TICK_MS,
    },
    snakes: {
      left: createDefaultSnake('left', 'right', '#8b5cf6', 'Serpiente1'),
      right: createDefaultSnake('right', 'right', '#06b6d4', 'Serpiente2'),
    },
    rules: [],
    history: [],
    catalog: [],
    live: {
      status: 'disconnected',
      uniqueId: '',
      roomId: '',
      message: 'Listo para conectar.',
      error: '',
    },
  };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function buildSerpentinePath(rows, cols, direction) {
  const path = [];

  // Closed Hamiltonian cycle: border-first sweep + serpentine fill of inner area.
  if (rows % 2 === 0) {
    for (let x = 0; x < cols; x += 1) {
      path.push({ x, y: 0 });
    }

    for (let y = 1; y < rows; y += 1) {
      if (y % 2 === 1) {
        for (let x = cols - 1; x >= 1; x -= 1) {
          path.push({ x, y });
        }
      } else {
        for (let x = 1; x < cols; x += 1) {
          path.push({ x, y });
        }
      }
    }

    for (let y = rows - 1; y >= 1; y -= 1) {
      path.push({ x: 0, y });
    }
  } else if (cols % 2 === 0) {
    for (let y = 0; y < rows; y += 1) {
      path.push({ x: 0, y });
    }

    for (let x = 1; x < cols; x += 1) {
      if (x % 2 === 1) {
        for (let y = rows - 1; y >= 1; y -= 1) {
          path.push({ x, y });
        }
      } else {
        for (let y = 1; y < rows; y += 1) {
          path.push({ x, y });
        }
      }
    }

    for (let x = cols - 1; x >= 1; x -= 1) {
      path.push({ x, y: 0 });
    }
  } else {
    // Odd x odd grids have no Hamiltonian cycle; keep deterministic serpentine path as fallback.
    for (let row = 0; row < rows; row += 1) {
      const leftToRight = row % 2 === 0;
      if (leftToRight) {
        for (let col = 0; col < cols; col += 1) {
          path.push({ x: col, y: row });
        }
      } else {
        for (let col = cols - 1; col >= 0; col -= 1) {
          path.push({ x: col, y: row });
        }
      }
    }
  }

  if (direction === 'left') {
    path.reverse();
  }

  return path;
}

function getPathLength() {
  return state.settings.rows * state.settings.cols;
}

function getSnake(side) {
  return side === 'right' ? state.snakes.right : state.snakes.left;
}

function getSnakePath(side) {
  return buildSerpentinePath(state.settings.rows, state.settings.cols, 'right');
}

function rebuildDefaultBoardState() {
  state.snakes.left = createDefaultSnake('left', 'right', '#8b5cf6', 'Serpiente1');
  state.snakes.right = createDefaultSnake('right', 'right', '#06b6d4', 'Serpiente2');
  state.history = [];
  normalizeSnakeState('left');
  normalizeSnakeState('right');
}

function sanitizeLoadedSnake(player, fallback) {
  const defaults = state.snakes[fallback];
  const apples = Array.isArray(player?.apples) ? player.apples : [];

  return {
    side: String(player?.side || defaults.side),
    direction: player?.direction === 'left' ? 'left' : defaults.direction,
    label: String(player?.label || defaults.label),
    color: /^#[0-9a-fA-F]{6}$/.test(String(player?.color || '')) ? String(player.color) : defaults.color,
    boardImage: player?.boardImage ? String(player.boardImage).slice(0, 5000000) : null,
    headIndex: Math.max(0, Number(player?.headIndex || defaults.headIndex) || defaults.headIndex),
    prevHeadIndex: Math.max(0, Number(player?.prevHeadIndex || player?.headIndex || defaults.headIndex) || defaults.headIndex),
    length: Math.max(3, Number(player?.length || defaults.length) || defaults.length),
    prevLength: Math.max(3, Number(player?.prevLength || player?.length || defaults.length) || defaults.length),
    applesEaten: Math.max(0, Number(player?.applesEaten || 0) || 0),
    wins: Math.max(0, Number(player?.wins || 0) || 0),
    finished: Boolean(player?.finished),
    apples: apples.slice(0, 100).map((apple, index) => ({
      id: String(apple?.id || `apple-${index + 1}`),
      index: Math.max(0, Number(apple?.index || 0) || 0),
      value: Math.max(1, Number(apple?.value || 1) || 1),
      source: String(apple?.source || 'manual'),
      giftId: apple?.giftId ? String(apple.giftId) : null,
      giftName: String(apple?.giftName || 'Manzana'),
    })),
  };
}

function sanitizeLoadedRule(rule) {
  return {
    id: String(rule?.id || crypto.randomUUID()),
    giftId: rule?.giftId ? String(rule.giftId) : null,
    giftName: String(rule?.giftName || 'Regalo').slice(0, 180),
    giftImageUrl: String(rule?.giftImageUrl || '').slice(0, 1000),
    giftDiamonds: Math.max(1, Number(rule?.giftDiamonds || 1) || 1),
    side: rule?.side === 'right' ? 'right' : 'left',
    apples: Math.max(1, Number(rule?.apples || 1) || 1),
    active: rule?.active !== false,
  };
}

function sanitizeLoadedHistory(entry) {
  const createdAt = String(entry?.createdAt || new Date().toISOString());

  return {
    id: String(entry?.id || crypto.randomUUID()),
    message: String(entry?.message || 'Evento').slice(0, 240),
    side: entry?.side === 'right' ? 'right' : 'left',
    apples: Math.max(1, Number(entry?.apples || 1) || 1),
    source: String(entry?.source || 'manual').slice(0, 40),
    createdAt,
    timeLabel: String(entry?.timeLabel || new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
  };
}

function sanitizeLoadedState(payload) {
  const settings = payload?.settings || {};
  const snakes = payload?.snakes || payload || {};

  return {
    settings: {
      rows: clamp(settings.rows, 10, 24, DEFAULT_ROWS),
      cols: clamp(settings.cols, 10, 24, DEFAULT_COLS),
      tickMs: clamp(settings.tickMs, SPEED_MIN_MS, SPEED_MAX_MS, DEFAULT_TICK_MS),
    },
    snakes: {
      left: sanitizeLoadedSnake(snakes.left || payload?.left, 'left'),
      right: sanitizeLoadedSnake(snakes.right || payload?.right, 'right'),
    },
    rules: Array.isArray(payload?.rules) ? payload.rules.slice(0, MAX_RULES).map(sanitizeLoadedRule) : [],
    history: Array.isArray(payload?.history) ? payload.history.slice(0, MAX_HISTORY).map(sanitizeLoadedHistory) : [],
  };
}

function normalizeSnakeState(side) {
  const snake = getSnake(side);
  const pathLength = getPathLength();

  snake.headIndex = clamp(snake.headIndex, 0, Math.max(0, pathLength - 1), 0);
  snake.prevHeadIndex = clamp(snake.prevHeadIndex, 0, Math.max(0, pathLength - 1), snake.headIndex);
  snake.length = clamp(snake.length, 3, pathLength, 3);
  snake.prevLength = clamp(snake.prevLength, 3, pathLength, snake.length);

  const usedAppleCells = new Set();
  snake.apples = snake.apples
    .filter((apple) => apple && Number.isFinite(apple.index) && apple.index >= 0 && apple.index < pathLength)
    .filter((apple) => {
      if (usedAppleCells.has(apple.index)) {
        return false;
      }

      usedAppleCells.add(apple.index);
      return true;
    })
    .slice(0, 100);

  if (snake.length >= pathLength) {
    snake.finished = true;
  }
}

function normalizeAllSnakeStates() {
  normalizeSnakeState('left');
  normalizeSnakeState('right');
}

function buildPersistableState() {
  return {
    settings: state.settings,
    snakes: state.snakes,
    rules: state.rules,
    history: state.history,
  };
}

async function saveStateToServer(force = false) {
  const payload = buildPersistableState();
  const payloadHash = JSON.stringify(payload);

  if (!force && payloadHash === lastPersistedStateHash) {
    return;
  }

  const response = await fetch('/api/snake-vs-snake/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: payloadHash,
  });

  if (!response.ok) {
    throw new Error('No se pudo guardar el estado del juego.');
  }

  lastPersistedStateHash = payloadHash;
}

function persistStateImmediately(successMessage = '', errorMessage = 'No se pudo guardar la partida.') {
  if (isHydratingState) {
    return;
  }

  clearTimeout(saveTimer);
  saveStateToServer(true)
    .then(() => {
      if (successMessage) {
        setLiveStatus('running', successMessage);
      }
    })
    .catch((error) => {
      setLiveStatus('error', error.message || errorMessage);
    });
}

function scheduleSaveState() {
  if (isHydratingState) {
    return;
  }

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStateToServer().catch((error) => {
      setLiveStatus('error', error.message || 'No se pudo guardar la partida.');
    });
  }, 1000);
}

async function loadStateFromServer() {
  isHydratingState = true;

  try {
    const response = await fetch('/api/snake-vs-snake/state');
    if (!response.ok) {
      throw new Error('No se pudo cargar el estado inicial.');
    }

    const payload = await response.json();

    const nextState = sanitizeLoadedState(payload);
    state.settings = nextState.settings;
    state.snakes.left = nextState.snakes.left;
    state.snakes.right = nextState.snakes.right;
    state.rules = nextState.rules;
    state.history = nextState.history;
    normalizeAllSnakeStates();
    state.snakes.right.headIndex = state.snakes.left.headIndex;
    state.snakes.right.prevHeadIndex = state.snakes.left.prevHeadIndex;
    lastPersistedStateHash = JSON.stringify(buildPersistableState());
  } catch (error) {
    console.warn(error);
    rebuildDefaultBoardState();
  } finally {
    isHydratingState = false;
  }
}

function setLiveStatus(status, message = '', error = '') {
  state.live = {
    status,
    uniqueId: state.live.uniqueId || snakeUsernameInput?.value?.trim?.().replace(/^@/, '') || '',
    roomId: state.live.roomId || '',
    message,
    error,
  };

  let displayStatus = status === 'disconnected' ? 'linked' : status;
  if (!state.live.uniqueId) displayStatus = 'unlinked';

  if (displayStatus === 'unlinked') {
    snakeConnectionStatus.textContent = 'Desvinculado';
  } else if (displayStatus === 'linked') {
    snakeConnectionStatus.textContent = 'Vinculado';
  } else if (displayStatus === 'connecting') {
    snakeConnectionStatus.textContent = 'cargando...';
  } else if (displayStatus === 'connected') {
    snakeConnectionStatus.textContent = 'conectado';
  } else if (displayStatus === 'live_off') {
    snakeConnectionStatus.textContent = 'live apagado';
  } else {
    displayStatus = 'error';
    snakeConnectionStatus.textContent = 'error al conectar live';
  }

  snakeConnectionStatus.className = `status-badge ${displayStatus}`;

  if (displayStatus === 'live_off') {
    setText(snakeConnectionDetails, 'live apagado');
  } else if (displayStatus === 'error') {
    setText(snakeConnectionDetails, 'error al conectar live, por favor contactate con un desarrollador');
  } else if (message) {
    setText(snakeConnectionDetails, message);
  } else if (displayStatus === 'unlinked') {
    setText(snakeConnectionDetails, 'No has vinculado un ID de TikTok Live.');
  } else if (displayStatus === 'linked') {
    setText(snakeConnectionDetails, `Cuenta vinculada: @${state.live.uniqueId}.`);
  } else if (displayStatus === 'connecting') {
    setText(snakeConnectionDetails, 'cargando...');
  } else if (displayStatus === 'connected') {
    setText(snakeConnectionDetails, `Conectado a @${state.live.uniqueId}${state.live.roomId ? ` - Room ${state.live.roomId}` : ''}.`);
  } else {
    setText(snakeConnectionDetails, 'No has vinculado un ID de TikTok Live.');
  }
}
function lockUsernameInput() {
  snakeUsernameInput.disabled = true;
  if (snakeLinkBtn) snakeLinkBtn.disabled = true;
  if (snakeConnectLiveBtn) snakeConnectLiveBtn.disabled = false;
}

function unlockUsernameInput() {
  snakeUsernameInput.disabled = false;
  if (snakeLinkBtn) snakeLinkBtn.disabled = false;
  if (snakeConnectLiveBtn) snakeConnectLiveBtn.disabled = true;
}

function restoreUsernameInputState() {
  if (snakeUsernameInput.value && snakeUsernameInput.value.trim()) {
    lockUsernameInput();
  } else {
    unlockUsernameInput();
  }
}

function updateConnectionState(nextState) {
  state.live = {
    status: nextState.status || 'disconnected',
    uniqueId: nextState.uniqueId || '',
    roomId: nextState.roomId || '',
    message: nextState.message || 'Listo para conectar.',
    error: nextState.error || '',
  };
  setLiveStatus(state.live.status, state.live.message, state.live.error);

  // Bloquear input cuando se conecta
  if (nextState.status === 'connected') {
    lockUsernameInput();
  }
}

function updateLeaderBadge() {
  const left = state.snakes.left;
  const right = state.snakes.right;

  if (left.applesEaten === right.applesEaten) {
    setText(leaderBadge, 'Empate');
    return;
  }

  setText(leaderBadge, left.applesEaten > right.applesEaten ? left.label : right.label);
}

function updateWinnerBadge() {
  const left = state.snakes.left;
  const right = state.snakes.right;
  const pathLength = getPathLength();

  if (left.length >= pathLength && right.length >= pathLength) {
    setText(winnerBadge, 'Empate final');
    return;
  }

  if (left.length >= pathLength) {
    setText(winnerBadge, `Gana ${left.label}`);
    return;
  }

  if (right.length >= pathLength) {
    setText(winnerBadge, `Gana ${right.label}`);
    return;
  }

  if (!left.finished || !right.finished) {
    setText(winnerBadge, 'La partida sigue en curso.');
    return;
  }

  if (left.applesEaten === right.applesEaten) {
    setText(winnerBadge, 'Empate final');
    return;
  }

  setText(winnerBadge, left.applesEaten > right.applesEaten ? `Gana ${left.label}` : `Gana ${right.label}`);
}

function showWinnerOverlay(label) {
  if (!winnerOverlay || !winnerName) {
    return;
  }

  clearTimeout(winnerOverlayTimer);
  winnerName.textContent = label;
  winnerOverlay.hidden = false;
  winnerOverlayTimer = setTimeout(() => {
    hideWinnerOverlay();
    restartGame({ resetWins: false });
  }, 5000);
}

function hideWinnerOverlay() {
  clearTimeout(winnerOverlayTimer);
  winnerOverlayTimer = null;
  if (winnerOverlay) {
    winnerOverlay.hidden = true;
  }
}

function syncConfigPanelsFromState() {
  const leftRules = state.rules.filter((rule) => rule.side === 'left');
  const rightRules = state.rules.filter((rule) => rule.side === 'right');

  setText(
    leftConfigStatus,
    `Imagen: ${state.snakes.left.boardImage ? 'cargada' : 'sin imagen'} • Reglas: ${leftRules.length} • Wins: ${state.snakes.left.wins || 0}`,
  );
  setText(
    rightConfigStatus,
    `Imagen: ${state.snakes.right.boardImage ? 'cargada' : 'sin imagen'} • Reglas: ${rightRules.length} • Wins: ${state.snakes.right.wins || 0}`,
  );

  renderConfigRulesBySide();
}

function getRuleImageUrl(rule) {
  if (rule?.giftImageUrl) {
    return String(rule.giftImageUrl);
  }

  const byId = state.catalog.find((gift) => String(gift.id) === String(rule?.giftId || ''));
  if (byId) {
    return getGiftImageUrl(byId);
  }

  const byName = state.catalog.find(
    (gift) => normalizeText(gift.name).toLowerCase() === normalizeText(rule?.giftName).toLowerCase(),
  );
  if (byName) {
    return getGiftImageUrl(byName);
  }

  return '';
}

function updateSnakeTitles() {
  setText(leftSnakeTitle, state.snakes.left.label || 'Serpiente1');
  setText(rightSnakeTitle, state.snakes.right.label || 'Serpiente2');

  if (leftSnakeNameInput && document.activeElement !== leftSnakeNameInput) {
    leftSnakeNameInput.value = state.snakes.left.label || 'Serpiente1';
  }

  if (rightSnakeNameInput && document.activeElement !== rightSnakeNameInput) {
    rightSnakeNameInput.value = state.snakes.right.label || 'Serpiente2';
  }

  if (leftSnakeColorInput) {
    leftSnakeColorInput.value = state.snakes.left.color || '#8b5cf6';
  }

  if (rightSnakeColorInput) {
    rightSnakeColorInput.value = state.snakes.right.color || '#06b6d4';
  }

  syncConfigPanelsFromState();
}

function updateSnakeName(side, value) {
  const snake = getSnake(side);
  const fallback = side === 'right' ? 'Serpiente2' : 'Serpiente1';
  snake.label = normalizeText(value).slice(0, 24) || fallback;
  updateSnakeTitles();
  setLiveStatus('running', 'Cambios locales en nombre. Pulsa "Guardar configuración" para persistir.');
}

function updateSnakeColor(side, colorValue) {
  const snake = getSnake(side);
  const hex = String(colorValue || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    snake.color = hex;
    renderBoards();
    setLiveStatus('running', 'Cambios locales en color. Pulsa "Guardar configuración" para persistir.');
  }
}

function handleBoardImageUpload(side, file) {
  if (!file) {
    return;
  }

  const maxSize = 2 * 1024 * 1024; // 2 MB
  if (file.size > maxSize) {
    setLiveStatus('error', 'La imagen es muy grande. Máximo 2 MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target.result;
    const snake = getSnake(side);
    snake.boardImage = base64;

    // Pre-load image into cache
    const img = new Image();
    img.onload = () => {
      boardImageCache[side] = img;
      renderBoards();
    };
    img.onerror = () => {
      setLiveStatus('error', 'No se pudo cargar la imagen.');
    };
    img.src = base64;

    setLiveStatus('running', 'Cambios locales en fondo. Pulsa "Guardar configuración" para persistir.');
  };
  reader.onerror = () => {
    setLiveStatus('error', 'No se pudo leer la imagen.');
  };
  reader.readAsDataURL(file);
}

function addCustomRule(side, giftName, applesCount) {
  const normalizedName = normalizeText(giftName);
  const apples = Math.max(1, Number(applesCount || 1) || 1);
  const catalogGift = findCatalogGiftByInput(normalizedName);
  const finalGiftName = catalogGift?.name || normalizedName;

  if (!normalizedName) {
    setLiveStatus('error', 'El nombre del regalo no puede estar vacío.');
    return;
  }

  const existing = state.rules.find((rule) =>
    normalizeText(rule.giftName).toLowerCase() === finalGiftName.toLowerCase() && rule.side === side
  );

  if (existing) {
    existing.apples = apples;
    existing.giftId = catalogGift?.id || existing.giftId || null;
    existing.giftDiamonds = catalogGift?.diamondCount || existing.giftDiamonds || 0;
    setLiveStatus('running', `Regla actualizada: ${finalGiftName} → ${apples} manzana(s) a serpiente ${side === 'right' ? 'derecha' : 'izquierda'}.`);
  } else {
    state.rules.unshift({
      id: crypto.randomUUID(),
      giftId: catalogGift?.id || null,
      giftName: finalGiftName,
      giftImageUrl: '',
      giftDiamonds: catalogGift?.diamondCount || 0,
      side,
      apples,
      active: true,
    });
    setLiveStatus('running', `Regla creada: ${finalGiftName} → ${apples} manzana(s) a serpiente ${side === 'right' ? 'derecha' : 'izquierda'}.`);
  }

  state.rules = state.rules.slice(0, MAX_RULES);
  scheduleSaveState();
  renderRules();
  setLiveStatus('running', 'Regla añadida y guardada automaticamente.');
}

function addCustomRuleFromGift(side, gift, applesCount) {
  const apples = Math.max(1, Number(applesCount || 1) || 1);
  const finalGiftName = gift?.name || '';

  if (!finalGiftName) {
    setLiveStatus('error', 'El regalo seleccionado no es válido.');
    return;
  }

  const existing = state.rules.find((rule) =>
    normalizeText(rule.giftName).toLowerCase() === normalizeText(finalGiftName).toLowerCase() && rule.side === side
  );

  if (existing) {
    existing.apples = apples;
    existing.giftId = gift.id || existing.giftId || null;
    existing.giftDiamonds = gift.diamondCount || existing.giftDiamonds || 0;
    existing.giftImageUrl = getGiftImageUrl(gift) || existing.giftImageUrl || '';
    setLiveStatus('running', `Regla actualizada: ${finalGiftName} → ${apples} manzana(s) a serpiente ${side === 'right' ? 'derecha' : 'izquierda'}.`);
  } else {
    state.rules.unshift({
      id: crypto.randomUUID(),
      giftId: gift.id || null,
      giftName: finalGiftName,
      giftImageUrl: getGiftImageUrl(gift) || '',
      giftDiamonds: gift.diamondCount || 0,
      side,
      apples,
      active: true,
    });
    setLiveStatus('running', `Regla creada: ${finalGiftName} → ${apples} manzana(s) a serpiente ${side === 'right' ? 'derecha' : 'izquierda'}.`);
  }

  state.rules = state.rules.slice(0, MAX_RULES);
  scheduleSaveState();
  renderRules();
  setLiveStatus('running', 'Regla añadida y guardada automaticamente.');
}

function renderConfigRulesBySide() {
  const targets = [
    { side: 'left', container: leftConfigRulesList, emptyMessage: 'No hay reglas para la serpiente izquierda.' },
    { side: 'right', container: rightConfigRulesList, emptyMessage: 'No hay reglas para la serpiente derecha.' },
  ];

  targets.forEach(({ side, container, emptyMessage }) => {
    if (!container) {
      return;
    }

    const rules = state.rules.filter((rule) => rule.side === side);
    if (!rules.length) {
      container.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    container.innerHTML = rules
      .map((rule) => {
        const statusClass = rule.active ? 'is-active' : 'is-paused';
        const statusText = rule.active ? 'Activa' : 'Pausada';
        const imageUrl = getRuleImageUrl(rule);
        return `
          <article class="config-rule-item">
            <img class="config-rule-thumb" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(rule.giftName)}" onerror="this.style.display='none'" />
            <div class="config-rule-main">
              <strong>${escapeHtml(rule.giftName)}</strong>
              <div class="rule-meta">${escapeHtml(rule.apples)} manzana(s) • ${escapeHtml(rule.giftDiamonds)} monedas${rule.giftId ? ` • ID ${escapeHtml(rule.giftId)}` : ''}</div>
            </div>
            <div class="config-rule-actions">
              <span class="config-rule-badge ${statusClass}">${statusText}</span>
              <button class="btn ghost" type="button" data-delete-config-rule="${escapeHtml(rule.id)}">Eliminar</button>
            </div>
          </article>
        `;
      })
      .join('');
  });
}

async function saveSnakeConfigToServer(side) {
  try {
    const payload = buildPersistableState();
    const response = await fetch('/api/snake-vs-snake/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'No se pudo guardar la configuración.');
    }

    lastPersistedStateHash = JSON.stringify(payload);
    syncConfigPanelsFromState();
    setLiveStatus('running', `Configuración de serpiente ${side === 'right' ? 'derecha' : 'izquierda'} guardada correctamente.`);
  } catch (error) {
    setLiveStatus('error', error.message || 'Error al guardar configuración.');
  }
}

function updateSpeedUI() {
  const currentTick = state.settings.tickMs;
  let label = 'Normal';
  if (currentTick <= 120) {
    label = 'Extrema';
  } else if (currentTick <= 220) {
    label = 'Turbo';
  } else if (currentTick <= 380) {
    label = 'Rapida';
  } else if (currentTick <= 650) {
    label = 'Normal';
  } else if (currentTick <= 1100) {
    label = 'Lenta';
  } else if (currentTick <= 1800) {
    label = 'Muy lenta';
  } else {
    label = 'Tortuga';
  }

  setText(snakeSpeedLabel, label);
  setText(snakeSpeedValue, `${currentTick} ms por movimiento`);

  if (snakeSpeedSlider) {
    snakeSpeedSlider.value = String(currentTick);
  }
}

function formatSnakeSummary(side) {
  const snake = getSnake(side);
  const finishedText = snake.finished ? ' • finalizada' : '';
  return `${snake.applesEaten} manzanas • longitud ${snake.length}${finishedText}`;
}

function renderStats() {
  setText(leftStats, formatSnakeSummary('left'));
  setText(rightStats, formatSnakeSummary('right'));
  setText(leftWins, `Wins: ${state.snakes.left.wins || 0}`);
  setText(rightWins, `Wins: ${state.snakes.right.wins || 0}`);
  setText(leftApplesCounter, String(state.snakes.left.applesEaten || 0));
  setText(rightApplesCounter, String(state.snakes.right.applesEaten || 0));
  updateLeaderBadge();
  updateWinnerBadge();
}

function addManualApple(side) {
  const snake = getSnake(side);
  if (snake.finished) {
    return;
  }

  const created = spawnApples(side, 1, 'manual', {
    giftId: null,
    giftName: 'Manual +',
  });

  if (created > 0) {
    pushGiftActionToHistory(`+ añadió ${created} manzana(s) a ${snake.label}`, side, created, 'manual');
    renderBoards();
  }
}

function drawBoardBackground(ctx, width, height, cellSize, boardImageObj = null) {
  ctx.save();
  ctx.fillStyle = '#0a0f1c';
  ctx.fillRect(0, 0, width, height);

  // Draw background image if available with transparency
  if (boardImageObj && boardImageObj.complete && boardImageObj.naturalWidth > 0) {
    ctx.globalAlpha = 0.25;
    ctx.drawImage(boardImageObj, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#1a2238';
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSnakeTube(ctx, points, snakeColor = '#ff4fa3') {
  if (!points.length) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }

  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = snakeColor;
  ctx.shadowColor = snakeColor;
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.restore();
}

function getHeadDirection(path, headIndex) {
  const current = getPathPoint(path, headIndex);
  const previous = getPathPoint(path, headIndex - 1) || current;
  const dx = Math.sign(current.x - previous.x);
  const dy = Math.sign(current.y - previous.y);

  if (dx === 0 && dy === 0) {
    return { dx: 1, dy: 0 };
  }

  return { dx, dy };
}

function drawSnakeHead(ctx, headPoint, direction, cellSize, snakeColor = '#ff4fa3') {
  const centerX = headPoint.x;
  const centerY = headPoint.y;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
  ctx.fillStyle = snakeColor;
  ctx.shadowColor = snakeColor;
  ctx.shadowBlur = 20;
  ctx.fill();
  ctx.restore();

  const perpX = -direction.dy;
  const perpY = direction.dx;
  const eyeBaseX = centerX + direction.dx * 2;
  const eyeBaseY = centerY + direction.dy * 2;

  const leftEye = { x: eyeBaseX + perpX * 4, y: eyeBaseY + perpY * 4 };
  const rightEye = { x: eyeBaseX - perpX * 4, y: eyeBaseY - perpY * 4 };

  ctx.save();
  ctx.shadowBlur = 0;

  [leftEye, rightEye].forEach((eye) => {
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(eye.x + direction.dx * 1.2, eye.y + direction.dy * 1.2, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
  });

  ctx.restore();
}

function drawFood(ctx, apples, path, cellSize) {
  ctx.save();
  ctx.fillStyle = '#ff8c00';
  ctx.shadowColor = '#ff8c00';
  ctx.shadowBlur = 12;

  apples.forEach((apple) => {
    const point = path[apple.index];
    if (!point) {
      return;
    }

    const x = point.x * cellSize + cellSize / 2;
    const y = point.y * cellSize + cellSize / 2;

    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function getPathPoint(path, index) {
  if (!path.length) {
    return null;
  }

  const safeIndex = ((index % path.length) + path.length) % path.length;
  return path[safeIndex];
}

function buildInterpolatedSnakePoints(path, snake, cellSize, alpha) {
  if (!path.length) {
    return [];
  }

  const points = [];

  for (let offset = 0; offset < snake.length; offset += 1) {
    const distanceFromHead = snake.length - 1 - offset;
    const prevDistanceFromHead = Math.min(distanceFromHead, Math.max(0, snake.prevLength - 1));

    const currentPoint = getPathPoint(path, snake.headIndex - distanceFromHead);
    if (!currentPoint) {
      continue;
    }

    const previousPoint = getPathPoint(path, snake.prevHeadIndex - prevDistanceFromHead) || currentPoint;
    const segment = {
      x: currentPoint.x * cellSize + cellSize / 2,
      y: currentPoint.y * cellSize + cellSize / 2,
      prevX: previousPoint.x * cellSize + cellSize / 2,
      prevY: previousPoint.y * cellSize + cellSize / 2,
    };

    points.push({
      x: segment.prevX + (segment.x - segment.prevX) * alpha,
      y: segment.prevY + (segment.y - segment.prevY) * alpha,
    });
  }

  return points;
}

function renderBoard(side, alpha = 1) {
  const CELL_SIZE = 30;
  const snake = getSnake(side);
  const board = side === 'left' ? leftBoard : rightBoard;
  const path = getSnakePath(side);

  const boardWidth = state.settings.cols * CELL_SIZE;
  const boardHeight = state.settings.rows * CELL_SIZE;

  board.style.width = `${boardWidth}px`;
  board.style.height = `${boardHeight}px`;
  board.width = boardWidth;
  board.height = boardHeight;

  const ctx = board.getContext('2d');
  if (!ctx) {
    return;
  }

  // Use cached image if boarding image is set but not yet cached
  let boardImageObj = boardImageCache[side];
  if (snake.boardImage && !boardImageObj) {
    const img = new Image();
    img.onload = () => {
      boardImageCache[side] = img;
      renderBoards();
    };
    img.src = snake.boardImage;
  }

  drawBoardBackground(ctx, boardWidth, boardHeight, CELL_SIZE, boardImageObj);

  const snakePoints = buildInterpolatedSnakePoints(path, snake, CELL_SIZE, alpha);

  drawSnakeTube(ctx, snakePoints, snake.color);

  if (snakePoints.length) {
    const headPoint = snakePoints[snakePoints.length - 1];
    const prevHeadPoint = snakePoints[Math.max(0, snakePoints.length - 2)] || headPoint;
    const dx = Math.sign(headPoint.x - prevHeadPoint.x);
    const dy = Math.sign(headPoint.y - prevHeadPoint.y);
    const headDirection = dx === 0 && dy === 0 ? getHeadDirection(path, snake.headIndex) : { dx, dy };
    drawSnakeHead(ctx, headPoint, headDirection, CELL_SIZE, snake.color);
  }

  drawFood(ctx, snake.apples, path, CELL_SIZE);
}

function renderBoards(alpha = 1) {
  renderBoard('left', alpha);
  renderBoard('right', alpha);
  renderStats();
  renderBoardGifts();
}

function restartGameLoop() {
  lastUpdateTime = performance.now();
  gameRunning = true;
}

function gameLoop(currentTime) {
  const tickDuration = state.settings.tickMs;

  if (!lastUpdateTime) {
    lastUpdateTime = currentTime;
  }

  if (gameRunning) {
    while (currentTime - lastUpdateTime >= tickDuration) {
      tickGame();
      lastUpdateTime += tickDuration;

      if (!gameRunning) {
        break;
      }
    }
  }

  let alpha = (currentTime - lastUpdateTime) / tickDuration;
  alpha = Math.min(Math.max(alpha, 0), 1);
  renderBoards(alpha);

  animationFrameId = requestAnimationFrame(gameLoop);
}

function addHistoryEntry(message, side, apples, source = 'manual') {
  const createdAt = new Date().toISOString();

  state.history.unshift({
    id: crypto.randomUUID(),
    message,
    side,
    apples,
    source,
    createdAt,
    timeLabel: new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  state.history = state.history.slice(0, MAX_HISTORY);
}

function scheduleHistoryRender() {
  if (historyRenderScheduled) {
    return;
  }

  historyRenderScheduled = true;
  requestAnimationFrame(() => {
    historyRenderScheduled = false;
    renderHistory();
  });
}

function renderHistory() {
  if (!state.history.length) {
    snakeHistoryList.innerHTML = '<div class="empty">Aun no hay eventos registrados.</div>';
    return;
  }

  snakeHistoryList.innerHTML = state.history
    .slice(0, MAX_HISTORY_RENDER_ITEMS)
    .map((entry) => {
      const sideLabel = entry.side === 'right' ? 'Derecha' : 'Izquierda';
      const sourceLabel = entry.source === 'live' ? 'TikTok Live' : 'Manual';
      return `
        <article class="history-item">
          <div class="history-main">
            <strong>${escapeHtml(entry.message)}</strong>
            <div class="history-meta">Lado: ${escapeHtml(sideLabel)} • Manzanas: ${escapeHtml(entry.apples)} • Origen: ${escapeHtml(sourceLabel)}</div>
          </div>
          <div class="history-meta">${escapeHtml(entry.timeLabel || '')}</div>
        </article>
      `;
    })
    .join('');
}

function renderRules() {
  if (!state.rules.length) {
    snakeRulesList.innerHTML = '<div class="empty">Aun no hay reglas configuradas.</div>';
    syncConfigPanelsFromState();
    return;
  }

  snakeRulesList.innerHTML = state.rules
    .map((rule) => {
      const sideLabel = rule.side === 'right' ? 'Derecha' : 'Izquierda';
      const imageUrl = getRuleImageUrl(rule);
      return `
        <article class="rule-item">
          <img class="rule-thumb" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(rule.giftName)}" onerror="this.style.display='none'" />
          <div class="rule-main">
            <strong>${escapeHtml(rule.giftName)}</strong>
            <div class="rule-meta">${escapeHtml(rule.apples)} manzana(s) → ${escapeHtml(sideLabel)} • ${escapeHtml(rule.giftDiamonds)} monedas${rule.giftId ? ` • ID ${escapeHtml(rule.giftId)}` : ''}</div>
          </div>
          <div class="rule-actions">
            <button class="btn ghost" type="button" data-toggle-rule="${escapeHtml(rule.id)}">${rule.active ? 'Activa' : 'Pausada'}</button>
            <button class="btn ghost" type="button" data-delete-rule="${escapeHtml(rule.id)}">Eliminar</button>
          </div>
        </article>
      `;
    })
    .join('');

  syncConfigPanelsFromState();
}

function renderBoardGifts() {
  const targets = [
    { side: 'left', container: leftBoardGifts },
    { side: 'right', container: rightBoardGifts },
  ];

  targets.forEach(({ side, container }) => {
    if (!container) return;

    const rules = state.rules.filter((r) => r.side === side && r.active);
    if (!rules.length) {
      container.innerHTML = `<div class="empty">Sin regalos configurados.</div>`;
      return;
    }

    container.innerHTML = rules
      .map((rule) => {
        const imageUrl = getRuleImageUrl(rule);
        return `
          <div class="board-gift-item" title="${escapeHtml(rule.giftName)}">
            <img class="gift-thumb" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(rule.giftName)}" onerror="this.style.display='none'" />
            <div class="gift-multiplier">x${escapeHtml(rule.apples)}</div>
          </div>
        `;
      })
      .join('');
  });
}

function getSelectedGift() {
  return state.catalog.find((gift) => String(gift.id) === String(selectedGiftId));
}

function updateGiftPreview(gift) {
  if (!snakeGiftPreview || !snakeGiftPreviewName || !snakeGiftPreviewMeta) {
    return;
  }

  if (!gift) {
    snakeGiftPreviewName.textContent = 'Ningún regalo seleccionado';
    snakeGiftPreviewMeta.textContent = 'Elige un regalo para configurarlo.';
    snakeGiftPreview.classList.remove('active');
    return;
  }

  snakeGiftPreview.classList.add('active');
  snakeGiftPreviewName.textContent = gift.name;
  snakeGiftPreviewMeta.textContent = `${gift.diamondCount} monedas${gift.id ? ` • ID ${gift.id}` : ''}`;
}

function renderCatalog() {
  if (!snakeGiftList) {
    return;
  }

  const filter = giftSearchTerm.toLowerCase();
  const filteredCatalog = state.catalog.filter((gift) => {
    const haystack = `${gift.name} ${gift.id || ''}`.toLowerCase();
    return !filter || haystack.includes(filter);
  });

  const currentGift = getSelectedGift() || filteredCatalog[0] || state.catalog[0] || null;
  if (currentGift && !selectedGiftId) {
    selectedGiftId = currentGift.id;
  }

  updateGiftPreview(currentGift);

  if (!state.catalog.length) {
    snakeGiftList.innerHTML = '<div class="loading">Cargando catálogo de regalos...</div>';
    return;
  }

  if (!filteredCatalog.length) {
    snakeGiftList.innerHTML = '<div class="empty">No hay coincidencias para ese filtro.</div>';
    return;
  }

  snakeGiftList.innerHTML = filteredCatalog
    .map((gift) => {
      const active = String(gift.id) === String(selectedGiftId) ? 'active' : '';
      const thumb = gift.imageUrl
        ? `<img src="${escapeHtml(gift.imageUrl)}" alt="${escapeHtml(gift.name)}" />`
        : '<div class="gift-icon">GIF</div>';
      return `
        <button class="gift-option ${active}" type="button" data-gift-id="${escapeHtml(gift.id)}">
          ${thumb}
          <span>
            <strong>${escapeHtml(gift.name)}</strong>
            <small>${escapeHtml(gift.diamondCount)} monedas${gift.id ? ` • ${escapeHtml(gift.id)}` : ''}</small>
          </span>
        </button>
      `;
    })
    .join('');

  snakeGiftList.querySelectorAll('[data-gift-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedGiftId = button.getAttribute('data-gift-id') || '';
      renderCatalog();
    });
  });
}

function sanitizeCatalog(payload) {
  return Array.isArray(payload)
    ? payload
      .slice(0, 300)
      .map((gift) => ({
        id: String(gift?.id || gift?.giftId || '').trim(),
        name: String(gift?.name || gift?.giftName || 'Regalo').trim(),
        diamondCount: Math.max(1, Number(gift?.diamondCount || 1) || 1),
        imageUrl: String(gift?.imageUrl || '').trim(),
      }))
      .filter((gift) => gift.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    : [];
}

function updateRuleGiftOptions() {
  if (!leftRuleGiftOptions || !rightRuleGiftOptions) {
    return;
  }

  const optionsMarkup = state.catalog
    .map((gift) => {
      const value = escapeHtml(gift.name);
      const label = `${escapeHtml(gift.diamondCount)} monedas${gift.id ? ` • ID ${escapeHtml(gift.id)}` : ''}`;
      return `<option value="${value}">${label}</option>`;
    })
    .join('');

  leftRuleGiftOptions.innerHTML = optionsMarkup;
  rightRuleGiftOptions.innerHTML = optionsMarkup;
}

function findCatalogGiftByInput(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const byId = state.catalog.find((gift) => String(gift.id) === raw);
  if (byId) {
    return byId;
  }

  const lower = raw.toLowerCase();
  return state.catalog.find((gift) => gift.name.toLowerCase() === lower) || null;
}

async function loadGiftCatalog() {
  try {
    const response = await fetch('/api/gifts');
    if (!response.ok) {
      throw new Error('No se pudo cargar el catálogo guardado.');
    }

    const payload = await response.json();
    state.catalog = sanitizeCatalog(payload.gifts);
    if (!state.catalog.some((gift) => String(gift.id) === String(selectedGiftId))) {
      selectedGiftId = state.catalog[0]?.id || '';
    }
    updateRuleGiftOptions();
    renderCatalog();
    renderLeftGiftCatalogMenu();
    renderRightGiftCatalogMenu();
  } catch (error) {
    updateRuleGiftOptions();
    if (snakeGiftList) {
      snakeGiftList.innerHTML = `<div class="empty">${escapeHtml(error.message || 'No se pudo cargar el catálogo.')}</div>`;
    }
  }
}

async function refreshGiftCatalogFromLive() {
  const uniqueId = normalizeText(snakeUsernameInput.value).replace(/^@/, '');
  if (!uniqueId) {
    setText(snakeConnectionStatus, 'Escribe un usuario de TikTok para refrescar el catálogo.');
    return;
  }

  try {
    const response = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId }),
    });

    const payload = await response.json();
    state.catalog = sanitizeCatalog(payload.gifts || []);
    if (!state.catalog.some((gift) => String(gift.id) === String(selectedGiftId))) {
      selectedGiftId = state.catalog[0]?.id || '';
    }
    updateRuleGiftOptions();
    renderCatalog();
    renderLeftGiftCatalogMenu();
    renderRightGiftCatalogMenu();
    setText(snakeConnectionStatus, payload.message || payload.warning || 'Catálogo actualizado.');
  } catch (error) {
    setText(snakeConnectionStatus, error.message || 'No se pudo actualizar el catálogo.');
  }
}

function getFreeFutureCells(side) {
  const snake = getSnake(side);
  const pathLength = getPathLength();
  const used = new Set(snake.apples.map((apple) => apple.index));
  const occupiedBySnake = new Set();
  const cells = [];

  for (let offset = 0; offset < snake.length; offset += 1) {
    const idx = ((snake.headIndex - offset) % pathLength + pathLength) % pathLength;
    occupiedBySnake.add(idx);
  }

  for (let index = 0; index < pathLength; index += 1) {
    if (!used.has(index) && !occupiedBySnake.has(index)) {
      cells.push(index);
    }
  }

  return cells;
}

function shuffle(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }

  return array;
}

function spawnApples(side, amount, source = 'manual', gift = null) {
  const snake = getSnake(side);
  if (snake.finished) {
    return 0;
  }

  const candidates = shuffle(getFreeFutureCells(side));
  const appleValue = Math.max(1, Number(amount || 1) || 1);
  const index = candidates[0];

  if (!Number.isFinite(index)) {
    scheduleSaveState();
    return 0;
  }

  snake.apples.push({
    id: crypto.randomUUID(),
    index,
    value: appleValue,
    source,
    giftId: gift?.giftId || null,
    giftName: gift?.giftName || 'Manzana',
  });

  scheduleSaveState();
  return appleValue;
}

function pushGiftActionToHistory(text, side, apples, source = 'manual') {
  addHistoryEntry(text, side, apples, source);
  scheduleHistoryRender();
  scheduleSaveState();
}

function queueCarryOverApples(side, amount) {
  const sideKey = side === 'right' ? 'right' : 'left';
  const qty = Math.max(0, Number(amount || 0) || 0);
  if (!qty) {
    return;
  }

  carryOverApples[sideKey] += qty;
}

function applyCarryOverApplesToNewRound() {
  ['left', 'right'].forEach((side) => {
    const pending = Math.max(0, Number(carryOverApples[side] || 0) || 0);
    if (!pending) {
      return;
    }

    const created = spawnApples(side, pending, 'carryover', {
      giftId: null,
      giftName: 'Arrastre ronda anterior',
    });

    carryOverApples[side] = Math.max(0, pending - created);

    if (created > 0) {
      const snakeLabel = getSnake(side).label;
      pushGiftActionToHistory(`Arrastre: ${created} manzana(s) aplicada(s) a ${snakeLabel}`, side, created, 'carryover');
    }
  });
}

function advanceSnake(side) {
  const snake = getSnake(side);
  if (snake.finished) {
    return false;
  }

  const pathLength = getPathLength();

  snake.prevHeadIndex = snake.headIndex;
  snake.prevLength = snake.length;
  snake.headIndex = ((snake.headIndex + 1) % pathLength + pathLength) % pathLength;
  let changed = true;
  const appleIndex = snake.apples.findIndex((apple) => apple.index === snake.headIndex);

  if (appleIndex >= 0) {
    const apple = snake.apples.splice(appleIndex, 1)[0];
    const apples = Math.max(1, Number(apple.value || 1) || 1);
    snake.applesEaten += apples;
    snake.length = Math.min(pathLength, snake.length + apples);
    pushGiftActionToHistory(`${snake.label} comió ${apples} manzana(s)`, side, apples, apple.source || 'auto');
  }

  if (snake.length >= pathLength) {
    snake.finished = true;
  }

  return changed;
}

function tickGame() {
  const movedLeft = advanceSnake('left');
  const movedRight = advanceSnake('right');

  if (movedLeft || movedRight) {
    scheduleSaveState();
  }

  const pathLength = getPathLength();
  const leftWonByFill = state.snakes.left.length >= pathLength;
  const rightWonByFill = state.snakes.right.length >= pathLength;

  if (leftWonByFill || rightWonByFill) {
    if (leftWonByFill && rightWonByFill) {
      setLiveStatus('finished', 'Empate: ambas serpientes llenaron el tablero.');
      showWinnerOverlay('Empate');
    } else if (leftWonByFill) {
      state.snakes.left.wins += 1;
      setLiveStatus('finished', `${state.snakes.left.label} llenó el tablero y ganó.`);
      showWinnerOverlay(state.snakes.left.label);
    } else {
      state.snakes.right.wins += 1;
      setLiveStatus('finished', `${state.snakes.right.label} llenó el tablero y ganó.`);
      showWinnerOverlay(state.snakes.right.label);
    }
    renderBoards(1);
    scheduleSaveState();
    gameRunning = false;
  }
}

function startGameLoop() {
  restartGameLoop();
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function setGameSpeed(nextTickMs) {
  state.settings.tickMs = clamp(nextTickMs, SPEED_MIN_MS, SPEED_MAX_MS, DEFAULT_TICK_MS);
  restartGameLoop();
  updateSpeedUI();
  scheduleSaveState();
}

function restartGame(options = {}) {
  const resetWins = options.resetWins !== false;
  const leftName = state.snakes.left.label || 'Serpiente1';
  const rightName = state.snakes.right.label || 'Serpiente2';
  const leftColor = state.snakes.left.color || '#8b5cf6';
  const rightColor = state.snakes.right.color || '#06b6d4';
  const leftBoardImage = state.snakes.left.boardImage || null;
  const rightBoardImage = state.snakes.right.boardImage || null;
  const leftWinsValue = resetWins ? 0 : (state.snakes.left.wins || 0);
  const rightWinsValue = resetWins ? 0 : (state.snakes.right.wins || 0);

  state.snakes.left = createDefaultSnake('left', 'right', leftColor, leftName);
  state.snakes.right = createDefaultSnake('right', 'right', rightColor, rightName);
  state.snakes.left.wins = leftWinsValue;
  state.snakes.right.wins = rightWinsValue;
  state.snakes.left.boardImage = leftBoardImage;
  state.snakes.right.boardImage = rightBoardImage;
  if (resetWins) {
    carryOverApples.left = 0;
    carryOverApples.right = 0;
  }
  state.history = [];
  normalizeAllSnakeStates();
  if (!resetWins) {
    applyCarryOverApplesToNewRound();
  }
  hideWinnerOverlay();
  renderBoards();
  renderStats();
  renderHistory();
  persistStateImmediately('Juego reiniciado con wins en 0 y guardado en la base de datos.', 'No se pudo guardar el reinicio en la base de datos.');
  restartGameLoop();
}

function pauseGame() {
  if (!gameRunning) {
    return;
  }

  gameRunning = false;
  setLiveStatus('paused', 'Juego pausado.');
}

function resumeGame() {
  const pathLength = getPathLength();
  if (state.snakes.left.length >= pathLength || state.snakes.right.length >= pathLength) {
    return;
  }

  restartGameLoop();
  setLiveStatus('running', 'Juego reanudado.');
}

function findRuleForGift(payload) {
  const giftId = String(payload?.giftId || '').trim();
  const giftName = normalizeText(payload?.giftName).toLowerCase();

  return state.rules.find((rule) => {
    if (!rule.active) {
      return false;
    }

    if (rule.giftId && giftId && String(rule.giftId) === giftId) {
      return true;
    }

    return normalizeText(rule.giftName).toLowerCase() === giftName;
  });
}

function getGiftRepeatCount(payload) {
  return Math.max(1, Number(payload?.repeatCount ?? payload?.giftCount ?? 1) || 1);
}

function applyRuleToSnake(rule, payload) {
  const totalApples = Math.max(1, Number(rule.apples || 1) || 1);
  const snakeLabel = getSnake(rule.side).label;
  const created = spawnApples(rule.side, totalApples, 'live', {
    giftId: payload?.giftId || rule.giftId,
    giftName: payload?.giftName || rule.giftName,
  });

  if (created > 0) {
    pushGiftActionToHistory(`${payload?.giftName || rule.giftName} añadió ${created} manzana(s) a ${snakeLabel}`, rule.side, created, 'live');
    renderBoards();
  }

  const overflow = Math.max(0, totalApples - created);
  if (overflow > 0) {
    queueCarryOverApples(rule.side, overflow);
    setLiveStatus('running', `Se acumularon ${overflow} manzana(s) para la siguiente ronda.`);
  }
}

function handleLiveGift(payload) {
  console.log("🎁 Gift recibido:", payload);

  const giftSignature = [
    String(payload?.giftId || '').trim(),
    normalizeText(payload?.giftName || '').toLowerCase(),
    String(payload?.user?.uniqueId || '').trim().toLowerCase(),
    String(payload?.repeatCount ?? payload?.giftCount ?? 1),
    String(Boolean(payload?.repeatEnd)),
  ].join('|');

  const now = Date.now();
  if (giftSignature === lastProcessedGiftSignature && now - lastProcessedGiftAt < 1200) {
    console.log("⏭️ Gift duplicado ignorado:", giftSignature);
    return;
  }

  if (Number(payload?.repeatCount || payload?.giftCount || 1) > 1 && !payload?.repeatEnd) {
    console.log("⏭️ Gift repetido intermedio ignorado hasta repeatEnd:", giftSignature);
    return;
  }

  lastProcessedGiftSignature = giftSignature;
  lastProcessedGiftAt = now;

  const rule = findRuleForGift(payload);

  if (!rule) {
    // 🔥 fallback automático
    console.log("⚠️ No hay regla, aplicando fallback");

    const randomSide = Math.random() > 0.5 ? "left" : "right";
    const created = spawnApples(randomSide, getGiftRepeatCount(payload), 'live', {
      giftId: payload?.giftId,
      giftName: payload?.giftName || 'Gift'
    });

    if (created > 0) {
      pushGiftActionToHistory(
        `${payload?.giftName || 'Gift'} añadió ${created} manzana(s)`,
        randomSide,
        created,
        'live'
      );
      renderBoards();
    }

    return;
  }

  console.log("✅ Regla encontrada:", rule);
  applyRuleToSnake(rule, payload);
}

function connectLiveEvents() {
  if (liveEventsSource) {
    liveEventsSource.close();
  }

  liveEventsSource = new EventSource('/events?gameType=snake');
  liveEventsSource.addEventListener('status', (event) => {
    try {
      const payload = JSON.parse(event.data);
      updateConnectionState(payload);
    } catch (_error) {
      // Ignorar.
    }
  });

  liveEventsSource.addEventListener('giftCatalog', (event) => {
    try {
      const payload = JSON.parse(event.data);
      state.catalog = sanitizeCatalog(payload.gifts || []);
      if (!state.catalog.some((gift) => String(gift.id) === String(selectedGiftId))) {
        selectedGiftId = state.catalog[0]?.id || '';
      }
      if (snakeGiftList) {
        renderCatalog();
      }
    } catch (_error) {
      // Ignorar.
    }
  });

  liveEventsSource.addEventListener('gift', (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleLiveGift(payload);
    } catch (_error) {
      // Ignorar.
    }
  });

  liveEventsSource.addEventListener('error', () => {
    setText(snakeConnectionStatus, 'La conexion en vivo se interrumpio.');
  });
}

async function connectTikTok() {
  const uniqueId = normalizeText(snakeUsernameInput.value).replace(/^@/, '');
  if (!uniqueId) {
    setLiveStatus('error', 'Debes indicar un usuario de TikTok.');
    return;
  }

  if (snakeConnectLiveBtn) snakeConnectLiveBtn.disabled = true;
  setLiveStatus('connecting', `Conectando a @${uniqueId}...`);

  try {
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, gameType: 'snake' }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo conectar.');
    }

    updateConnectionState({
      status: payload.status || 'connected',
      uniqueId: payload.uniqueId || uniqueId,
      roomId: payload.roomId || '',
      message: payload.message || '',
      error: payload.error || '',
    });

    if (payload.status === 'connected' && liveIndicator) {
      liveIndicator.classList.remove("hidden");
    }
    if (payload.status === 'connected') connectLiveEvents();
  } catch (error) {
    setLiveStatus('error', error.message || 'No se pudo conectar.');
  } finally {
    if (snakeConnectLiveBtn) {
      snakeConnectLiveBtn.disabled = false;
    }
  }
}

async function disconnectTikTok() {
  snakeDisconnectBtn.disabled = true;
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    updateConnectionState({
      status: 'disconnected',
      uniqueId: '',
      roomId: '',
      message: 'Conexion cerrada.',
      error: '',
    });
  } finally {
    snakeDisconnectBtn.disabled = false;
  }
  if (liveIndicator) {
    liveIndicator.classList.add("hidden");
  }
}


async function saveTiktokConnectionSnakeToDB() {
  try {
    const uniqueId = normalizeText(snakeUsernameInput.value).replace(/^@/, '');
    if (!uniqueId) return;

    const response = await fetch('/api/tiktok-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'snake', tiktokUsername: uniqueId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'No se pudo guardar la cuenta.');
    }
  } catch (error) {
    console.error('[SNAKE] Error saving TikTok connection to DB:', error.message);
    throw error;
  }
}

async function restoreTiktokConnectionSnake() {
  unlockUsernameInput();

  try {
    const response = await fetch('/api/tiktok-connection/snake');
    if (!response.ok) {
      snakeUsernameInput.value = '';
      setLiveStatus('disconnected', 'No has vinculado un ID de TikTok Live.');
      return;
    }

    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      snakeUsernameInput.value = `@${data.tiktok_username}`;
      lockUsernameInput();
      setLiveStatus('disconnected', `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
    } else {
      snakeUsernameInput.value = '';
      unlockUsernameInput();
      setLiveStatus('disconnected', 'Ingresa el nombre de usuario de TikTok que está transmitiendo en vivo.');
    }
  } catch (error) {
    snakeUsernameInput.value = '';
    unlockUsernameInput();
    setLiveStatus('disconnected', 'No has vinculado un ID de TikTok Live.');
    console.error('[SNAKE] Error restoring TikTok connection from DB:', error.message);
  }
}

async function deleteTiktokConnectionSnakeFromDB() {
  try {
    await fetch('/api/tiktok-connection/snake', { method: 'DELETE' });
  } catch (error) {
    console.error('[SNAKE] Error deleting TikTok connection from DB:', error.message);
  }
}

async function linkTiktokUsernameSnake() {
  const uniqueId = normalizeText(snakeUsernameInput.value).replace(/^@/, '');
  if (!uniqueId) {
    setLiveStatus('error', 'Debes indicar un usuario de TikTok.');
    return;
  }

  if (snakeLinkBtn) snakeLinkBtn.disabled = true;
  try {
    await saveTiktokConnectionSnakeToDB();
    snakeUsernameInput.value = `@${uniqueId}`;
    lockUsernameInput();
    setLiveStatus('disconnected', `Cuenta vinculada a @${uniqueId}. Ahora puedes conectar el live.`);
  } catch (error) {
    if (snakeLinkBtn) snakeLinkBtn.disabled = false;
    setLiveStatus('error', error.message || 'No se pudo guardar la cuenta.');
  }
}

async function connectSnakeLiveFromSavedUsername() {
  const uniqueId = normalizeText(snakeUsernameInput.value).replace(/^@/, '');
  if (!uniqueId) {
    setLiveStatus('error', 'Primero vincula y guarda tu cuenta de TikTok.');
    return;
  }

  if (snakeConnectLiveBtn) snakeConnectLiveBtn.disabled = true;
  setLiveStatus('connecting', `Conectando a @${uniqueId}...`);

  try {
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, gameType: 'snake' }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo conectar.');
    }

    updateConnectionState({
      status: payload.status || 'connected',
      uniqueId: payload.uniqueId || uniqueId,
      roomId: payload.roomId || '',
      message: payload.message || '',
      error: payload.error || '',
    });

    if (payload.status === 'connected' && liveIndicator) {
      liveIndicator.classList.remove('hidden');
    }
    if (payload.status === 'connected') connectLiveEvents();
  } catch (error) {
    setLiveStatus('error', error.message || 'No se pudo conectar.');
  } finally {
    if (snakeConnectLiveBtn) snakeConnectLiveBtn.disabled = false;
  }
}

function addRuleFromSelection() {
  const gift = getSelectedGift();
  if (!gift) {
    setLiveStatus('error', 'Selecciona un regalo primero.');
    return;
  }

  const side = snakeRuleSide.value === 'right' ? 'right' : 'left';
  const apples = Math.max(1, Number(snakeRuleApples.value || 1) || 1);

  const existing = state.rules.find((rule) => String(rule.giftId) === String(gift.id) && rule.side === side);
  if (existing) {
    existing.apples = apples;
    existing.giftName = gift.name;
    existing.giftDiamonds = gift.diamondCount;
    existing.giftImageUrl = gift.imageUrl || existing.giftImageUrl;
    existing.active = true;
  } else {
    state.rules.unshift({
      id: crypto.randomUUID(),
      giftId: gift.id,
      giftName: gift.name,
      giftImageUrl: gift.imageUrl || '',
      giftDiamonds: gift.diamondCount,
      side,
      apples,
      active: true,
    });
  }

  state.rules = state.rules.slice(0, MAX_RULES);
  renderRules();
  scheduleSaveState();
  setLiveStatus('running', `Regla guardada para ${gift.name}.`);
}

function syncSelectedGiftSelection() {
  if (!snakeGiftPreview) {
    return;
  }

  const gift = getSelectedGift();
  updateGiftPreview(gift);
}

// ============================================================================
// GIFT CATALOG HELPER FUNCTIONS
// ============================================================================

function pickFirstUrl(value) {
  if (!value) return "";
  
  if (typeof value === "string") {
    return value;
  }
  
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstUrl(item);
      if (picked) return picked;
    }
    return "";
  }
  
  if (typeof value === "object") {
    return (
      pickFirstUrl(value.url) ||
      pickFirstUrl(value.urlList) ||
      pickFirstUrl(value.url_list) ||
      pickFirstUrl(value.urls) ||
      pickFirstUrl(value.uri) ||
      ""
    );
  }
  
  return "";
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
    ""
  );
}

// ============================================================================
// LEFT SIDE GIFT CATALOG FUNCTIONS
// ============================================================================

function setLeftCatalogPreview(gift) {
  if (!gift) {
    if (leftGiftCatalogPreviewImage) leftGiftCatalogPreviewImage.removeAttribute("src");
    if (leftGiftCatalogPreviewImage) leftGiftCatalogPreviewImage.alt = "Vista previa del regalo";
    if (leftGiftCatalogPreviewName) leftGiftCatalogPreviewName.textContent = "Selecciona un regalo";
    if (leftGiftCatalogPreviewMeta) leftGiftCatalogPreviewMeta.textContent = "Se mostrará su imagen y valor en monedas.";
    return;
  }

  const imageUrl = getGiftImageUrl(gift);
  if (leftGiftCatalogPreviewImage) {
    leftGiftCatalogPreviewImage.src = imageUrl || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNjQnIGhlaWdodD0nNjQnIHZpZXdCb3g9JzAgMCA2NCA2NCcgZmlsbD0nbm9uZScgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48cmVjdCB3aWR0aD0nNjQnIGhlaWdodD0nNjQnIHJ4PScxNicgZmlsbD0nIzExMTgyNScvPjxwYXRoIGQ9J00yMiAyOWwxMi04IDEyIDgtMTIgOC0xMiA4LTEyLThaMjIgMjlsMTItOCAxMiA4LTEyIDgtMTIgOC0xMiA4LTEyLThnICcgZmlsbD0nIzk0YTNiOCcvPjwvc3ZnPg==";
    leftGiftCatalogPreviewImage.alt = gift.name;
  }
  if (leftGiftCatalogPreviewName) leftGiftCatalogPreviewName.textContent = gift.name;
  if (leftGiftCatalogPreviewMeta) leftGiftCatalogPreviewMeta.textContent = `${gift.diamondCount} monedas${gift.id ? ` • ID ${gift.id}` : ""}`;
}

function getLeftSelectedCatalogGift() {
  return state.catalog.find((gift) => String(gift.id) === String(leftSelectedCatalogGiftId || ""));
}

function updateLeftGiftCatalogToggle(gift) {
  if (leftGiftCatalogToggle) {
    const label = gift ? gift.name : "Selecciona un regalo";
    const existingSpan = leftGiftCatalogToggle.querySelector('span:first-child');
    if (existingSpan) {
      existingSpan.textContent = label;
    }
  }
}

function closeLeftGiftCatalogMenu() {
  if (leftGiftCatalogMenu) {
    leftGiftCatalogMenu.classList.remove("open");
  }
  if (leftGiftCatalogToggle) {
    leftGiftCatalogToggle.setAttribute("aria-expanded", "false");
  }
}

function openLeftGiftCatalogMenu() {
  if (leftGiftCatalogMenu) {
    leftGiftCatalogMenu.classList.add("open");
  }
  if (leftGiftCatalogToggle) {
    leftGiftCatalogToggle.setAttribute("aria-expanded", "true");
  }
}

function toggleLeftGiftCatalogMenu() {
  if (leftGiftCatalogMenu && leftGiftCatalogMenu.classList.contains("open")) {
    closeLeftGiftCatalogMenu();
  } else {
    openLeftGiftCatalogMenu();
  }
}

function renderLeftGiftCatalogMenu() {
  if (!leftGiftCatalogOptions || !state.catalog.length) {
    if (leftGiftCatalogOptions) {
      leftGiftCatalogOptions.innerHTML = `<div class="empty">No hay regalos disponibles.</div>`;
    }
    updateLeftGiftCatalogToggle(null);
    return;
  }

  const currentGift = getLeftSelectedCatalogGift();
  updateLeftGiftCatalogToggle(currentGift || state.catalog[0]);

  const normalizedNameFilter = leftGiftNameFilter.trim().toLowerCase();
  const coinsFilterNumber = Number(leftGiftCoinsFilter);
  const hasCoinsFilter = leftGiftCoinsFilter.trim() !== "" && Number.isFinite(coinsFilterNumber);

  const filteredCatalog = state.catalog.filter((gift) => {
    const matchesName = !normalizedNameFilter || String(gift.name).toLowerCase().includes(normalizedNameFilter);
    const giftCoins = Number(gift.diamondCount || 0);
    const matchesCoins = !hasCoinsFilter || giftCoins === coinsFilterNumber;
    return matchesName && matchesCoins;
  });

  if (leftGiftSearchInput) leftGiftSearchInput.value = leftGiftNameFilter;
  if (leftGiftCoinsFilterInput) leftGiftCoinsFilterInput.value = leftGiftCoinsFilter;

  if (!filteredCatalog.length) {
    leftGiftCatalogOptions.innerHTML = `<div class="empty">No hay coincidencias para ese filtro.</div>`;
    return;
  }

  leftGiftCatalogOptions.innerHTML = filteredCatalog
    .map((gift) => {
      const imageUrl = getGiftImageUrl(gift);
      const selected = String(gift.id) === String(leftSelectedCatalogGiftId);
      return `
        <button
          type="button"
          class="gift-catalog-option ${selected ? "selected" : ""}"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
          data-gift-id="${escapeHtml(gift.id)}"
        >
          <img class="gift-catalog-option-image" src="${escapeHtml(imageUrl || "")}" alt="${escapeHtml(gift.name)}" onerror="this.style.display='none'" />
          <span class="gift-catalog-option-name">${escapeHtml(gift.name)}</span>
          <span class="gift-catalog-option-meta">${gift.diamondCount} monedas</span>
        </button>
      `;
    })
    .join("");

  leftGiftCatalogOptions.querySelectorAll("[data-gift-id]").forEach((button) => {
    button.addEventListener("click", () => {
      leftSelectedCatalogGiftId = button.getAttribute("data-gift-id") || "";
      const gift = getLeftSelectedCatalogGift();
      updateLeftGiftCatalogToggle(gift);
      setLeftCatalogPreview(gift);
      renderLeftGiftCatalogMenu();
      closeLeftGiftCatalogMenu();
    });
  });
}

// ============================================================================
// RIGHT SIDE GIFT CATALOG FUNCTIONS
// ============================================================================

function setRightCatalogPreview(gift) {
  if (!gift) {
    if (rightGiftCatalogPreviewImage) rightGiftCatalogPreviewImage.removeAttribute("src");
    if (rightGiftCatalogPreviewImage) rightGiftCatalogPreviewImage.alt = "Vista previa del regalo";
    if (rightGiftCatalogPreviewName) rightGiftCatalogPreviewName.textContent = "Selecciona un regalo";
    if (rightGiftCatalogPreviewMeta) rightGiftCatalogPreviewMeta.textContent = "Se mostrará su imagen y valor en monedas.";
    return;
  }

  const imageUrl = getGiftImageUrl(gift);
  if (rightGiftCatalogPreviewImage) {
    rightGiftCatalogPreviewImage.src = imageUrl || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNjQnIGhlaWdodD0nNjQnIHZpZXdCb3g9JzAgMCA2NCA2NCcgZmlsbD0nbm9uZScgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48cmVjdCB3aWR0aD0nNjQnIGhlaWdodD0nNjQnIHJ4PScxNicgZmlsbD0nIzExMTgyNScvPjxwYXRoIGQ9J00yMiAyOWwxMi04IDEyIDgtMTIgOC0xMiA4LTEyIDgtMTItOFonIGZpbGw9JyM5NGEzYjgnLz48L3N2Zz4=";
    rightGiftCatalogPreviewImage.alt = gift.name;
  }
  if (rightGiftCatalogPreviewName) rightGiftCatalogPreviewName.textContent = gift.name;
  if (rightGiftCatalogPreviewMeta) rightGiftCatalogPreviewMeta.textContent = `${gift.diamondCount} monedas${gift.id ? ` • ID ${gift.id}` : ""}`;
}

function getRightSelectedCatalogGift() {
  return state.catalog.find((gift) => String(gift.id) === String(rightSelectedCatalogGiftId || ""));
}

function updateRightGiftCatalogToggle(gift) {
  if (rightGiftCatalogToggle) {
    const label = gift ? gift.name : "Selecciona un regalo";
    const existingSpan = rightGiftCatalogToggle.querySelector('span:first-child');
    if (existingSpan) {
      existingSpan.textContent = label;
    }
  }
}

function closeRightGiftCatalogMenu() {
  if (rightGiftCatalogMenu) {
    rightGiftCatalogMenu.classList.remove("open");
  }
  if (rightGiftCatalogToggle) {
    rightGiftCatalogToggle.setAttribute("aria-expanded", "false");
  }
}

function openRightGiftCatalogMenu() {
  if (rightGiftCatalogMenu) {
    rightGiftCatalogMenu.classList.add("open");
  }
  if (rightGiftCatalogToggle) {
    rightGiftCatalogToggle.setAttribute("aria-expanded", "true");
  }
}

function toggleRightGiftCatalogMenu() {
  if (rightGiftCatalogMenu && rightGiftCatalogMenu.classList.contains("open")) {
    closeRightGiftCatalogMenu();
  } else {
    openRightGiftCatalogMenu();
  }
}

function renderRightGiftCatalogMenu() {
  if (!rightGiftCatalogOptions || !state.catalog.length) {
    if (rightGiftCatalogOptions) {
      rightGiftCatalogOptions.innerHTML = `<div class="empty">No hay regalos disponibles.</div>`;
    }
    updateRightGiftCatalogToggle(null);
    return;
  }

  const currentGift = getRightSelectedCatalogGift();
  updateRightGiftCatalogToggle(currentGift || state.catalog[0]);

  const normalizedNameFilter = rightGiftNameFilter.trim().toLowerCase();
  const coinsFilterNumber = Number(rightGiftCoinsFilter);
  const hasCoinsFilter = rightGiftCoinsFilter.trim() !== "" && Number.isFinite(coinsFilterNumber);

  const filteredCatalog = state.catalog.filter((gift) => {
    const matchesName = !normalizedNameFilter || String(gift.name).toLowerCase().includes(normalizedNameFilter);
    const giftCoins = Number(gift.diamondCount || 0);
    const matchesCoins = !hasCoinsFilter || giftCoins === coinsFilterNumber;
    return matchesName && matchesCoins;
  });

  if (rightGiftSearchInput) rightGiftSearchInput.value = rightGiftNameFilter;
  if (rightGiftCoinsFilterInput) rightGiftCoinsFilterInput.value = rightGiftCoinsFilter;

  if (!filteredCatalog.length) {
    rightGiftCatalogOptions.innerHTML = `<div class="empty">No hay coincidencias para ese filtro.</div>`;
    return;
  }

  rightGiftCatalogOptions.innerHTML = filteredCatalog
    .map((gift) => {
      const imageUrl = getGiftImageUrl(gift);
      const selected = String(gift.id) === String(rightSelectedCatalogGiftId);
      return `
        <button
          type="button"
          class="gift-catalog-option ${selected ? "selected" : ""}"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
          data-gift-id="${escapeHtml(gift.id)}"
        >
          <img class="gift-catalog-option-image" src="${escapeHtml(imageUrl || "")}" alt="${escapeHtml(gift.name)}" onerror="this.style.display='none'" />
          <span class="gift-catalog-option-name">${escapeHtml(gift.name)}</span>
          <span class="gift-catalog-option-meta">${gift.diamondCount} monedas</span>
        </button>
      `;
    })
    .join("");

  rightGiftCatalogOptions.querySelectorAll("[data-gift-id]").forEach((button) => {
    button.addEventListener("click", () => {
      rightSelectedCatalogGiftId = button.getAttribute("data-gift-id") || "";
      const gift = getRightSelectedCatalogGift();
      updateRightGiftCatalogToggle(gift);
      setRightCatalogPreview(gift);
      renderRightGiftCatalogMenu();
      closeRightGiftCatalogMenu();
    });
  });
}

function bootstrapEventListeners() {

  snakeLinkBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const username = normalizeText(snakeUsernameInput.value).replace(/^@/, '');
    if (!username) {
      setLiveStatus('error', 'Debes indicar un usuario de TikTok.');
      return;
    }
    if (confirm(`¿Estás seguro de que quieres vincular el juego a @${username}?\n\nNo podrás cambiar esta cuenta después.`)) {
      linkTiktokUsernameSnake();
    }
  });

  if (snakeConnectLiveBtn) {
    snakeConnectLiveBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await connectSnakeLiveFromSavedUsername();
    });
  }

  snakeLoadCatalogBtn.addEventListener('click', () => {
    refreshGiftCatalogFromLive().catch((error) => {
      setText(snakeConnectionStatus, error.message || 'No se pudo actualizar el catálogo.');
    });
  });

  snakeDisconnectBtn.addEventListener('click', () => {
    disconnectTikTok().catch((error) => {
      setText(snakeConnectionStatus, error.message || 'No se pudo desconectar.');
    });
  });

  snakeResetBtn.addEventListener('click', () => {
    restartGame();
  });

  if (snakePauseBtn) {
    snakePauseBtn.addEventListener('click', () => {
      pauseGame();
    });
  }

  if (snakeResumeBtn) {
    snakeResumeBtn.addEventListener('click', () => {
      resumeGame();
    });
  }

  if (leftAddAppleBtn) {
    leftAddAppleBtn.addEventListener('click', () => {
      addManualApple('left');
    });
  }

  if (rightAddAppleBtn) {
    rightAddAppleBtn.addEventListener('click', () => {
      addManualApple('right');
    });
  }

  if (snakeSpeedSlider) {
    snakeSpeedSlider.min = String(SPEED_MIN_MS);
    snakeSpeedSlider.max = String(SPEED_MAX_MS);
    snakeSpeedSlider.step = String(SPEED_STEP_MS);
    snakeSpeedSlider.value = String(state.settings.tickMs);
    snakeSpeedSlider.addEventListener('input', (event) => {
      setGameSpeed(Number(event.target.value));
    });
  }

  if (snakeGiftSearch) {
    snakeGiftSearch.addEventListener('input', (event) => {
      giftSearchTerm = event.target.value || '';
      renderCatalog();
    });
  }

  if (snakeAddRuleBtn) {
    snakeAddRuleBtn.addEventListener('click', addRuleFromSelection);
  }

  if (leftSnakeNameInput) {
    leftSnakeNameInput.addEventListener('input', (event) => {
      updateSnakeName('left', event.target.value || '');
    });
  }

  if (rightSnakeNameInput) {
    rightSnakeNameInput.addEventListener('input', (event) => {
      updateSnakeName('right', event.target.value || '');
    });
  }

  if (leftSnakeColorInput) {
    leftSnakeColorInput.addEventListener('input', (event) => {
      updateSnakeColor('left', event.target.value || '');
    });
  }

  if (rightSnakeColorInput) {
    rightSnakeColorInput.addEventListener('input', (event) => {
      updateSnakeColor('right', event.target.value || '');
    });
  }

  if (leftBoardImageInput) {
    leftBoardImageInput.addEventListener('change', (event) => {
      handleBoardImageUpload('left', event.target.files ? event.target.files[0] : null);
    });
  }

  if (rightBoardImageInput) {
    rightBoardImageInput.addEventListener('change', (event) => {
      handleBoardImageUpload('right', event.target.files ? event.target.files[0] : null);
    });
  }

  if (leftRuleSaveBtn) {
    leftRuleSaveBtn.addEventListener('click', () => {
      const selectedGift = getLeftSelectedCatalogGift();
      if (!selectedGift) {
        setLiveStatus('error', 'Por favor, selecciona un regalo antes de crear la regla.');
        return;
      }
      const applesCount = leftRuleApplesInput ? leftRuleApplesInput.value : '1';
      addCustomRuleFromGift('left', selectedGift, applesCount);
      if (leftRuleApplesInput) leftRuleApplesInput.value = '1';
      leftSelectedCatalogGiftId = '';
      setLeftCatalogPreview(null);
      renderLeftGiftCatalogMenu();
      closeLeftGiftCatalogMenu();
    });
  }

  if (rightRuleSaveBtn) {
    rightRuleSaveBtn.addEventListener('click', () => {
      const selectedGift = getRightSelectedCatalogGift();
      if (!selectedGift) {
        setLiveStatus('error', 'Por favor, selecciona un regalo antes de crear la regla.');
        return;
      }
      const applesCount = rightRuleApplesInput ? rightRuleApplesInput.value : '1';
      addCustomRuleFromGift('right', selectedGift, applesCount);
      if (rightRuleApplesInput) rightRuleApplesInput.value = '1';
      rightSelectedCatalogGiftId = '';
      setRightCatalogPreview(null);
      renderRightGiftCatalogMenu();
      closeRightGiftCatalogMenu();
    });
  }

  if (leftConfigSaveBtn) {
    leftConfigSaveBtn.addEventListener('click', () => {
      saveSnakeConfigToServer('left');
    });
  }

  if (rightConfigSaveBtn) {
    rightConfigSaveBtn.addEventListener('click', () => {
      saveSnakeConfigToServer('right');
    });
  }

  if (snakeGiftList) {
    snakeGiftList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-gift-id]');
      if (!button) {
        return;
      }

      selectedGiftId = button.getAttribute('data-gift-id') || '';
      renderCatalog();
    });
  }

  if (snakeRulesList) {
    snakeRulesList.addEventListener('click', (event) => {
      const toggleButton = event.target.closest('[data-toggle-rule]');
      if (toggleButton) {
        const ruleId = toggleButton.getAttribute('data-toggle-rule');
        const rule = state.rules.find((item) => item.id === ruleId);
        if (!rule) {
          return;
        }

        rule.active = !rule.active;
        scheduleSaveState();
        renderRules();
        return;
      }

      const deleteButton = event.target.closest('[data-delete-rule]');
      if (deleteButton) {
        const ruleId = deleteButton.getAttribute('data-delete-rule');
        state.rules = state.rules.filter((item) => item.id !== ruleId);
        renderRules();
        persistStateImmediately('Regla eliminada y guardada en la base de datos.', 'No se pudo eliminar la regla en la base de datos.');
      }
    });
  }

  if (leftConfigRulesList) {
    leftConfigRulesList.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-delete-config-rule]');
      if (!deleteButton) {
        return;
      }

      const ruleId = deleteButton.getAttribute('data-delete-config-rule');
      state.rules = state.rules.filter((rule) => rule.id !== ruleId);
      renderRules();
      persistStateImmediately('Regla eliminada y guardada en la base de datos.', 'No se pudo eliminar la regla en la base de datos.');
    });
  }

  if (rightConfigRulesList) {
    rightConfigRulesList.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-delete-config-rule]');
      if (!deleteButton) {
        return;
      }

      const ruleId = deleteButton.getAttribute('data-delete-config-rule');
      state.rules = state.rules.filter((rule) => rule.id !== ruleId);
      renderRules();
      persistStateImmediately('Regla eliminada y guardada en la base de datos.', 'No se pudo eliminar la regla en la base de datos.');
    });
  }

  // LEFT SIDE GIFT CATALOG EVENT LISTENERS
  if (leftGiftCatalogToggle) {
    leftGiftCatalogToggle.addEventListener('click', toggleLeftGiftCatalogMenu);
  }

  if (leftGiftSearchInput) {
    leftGiftSearchInput.addEventListener('input', (event) => {
      leftGiftNameFilter = event.target.value || '';
      renderLeftGiftCatalogMenu();
    });
  }

  if (leftGiftCoinsFilterInput) {
    leftGiftCoinsFilterInput.addEventListener('input', (event) => {
      leftGiftCoinsFilter = event.target.value || '';
      renderLeftGiftCatalogMenu();
    });
  }

  // RIGHT SIDE GIFT CATALOG EVENT LISTENERS
  if (rightGiftCatalogToggle) {
    rightGiftCatalogToggle.addEventListener('click', toggleRightGiftCatalogMenu);
  }

  if (rightGiftSearchInput) {
    rightGiftSearchInput.addEventListener('input', (event) => {
      rightGiftNameFilter = event.target.value || '';
      renderRightGiftCatalogMenu();
    });
  }

  if (rightGiftCoinsFilterInput) {
    rightGiftCoinsFilterInput.addEventListener('input', (event) => {
      rightGiftCoinsFilter = event.target.value || '';
      renderRightGiftCatalogMenu();
    });
  }

  // CLOSE GIFT CATALOGS WHEN CLICKING OUTSIDE
  document.addEventListener('click', (event) => {
    const leftCatalogShell = leftGiftCatalogMenu?.closest('.gift-catalog-shell') || leftGiftCatalogMenu?.parentElement;
    const rightCatalogShell = rightGiftCatalogMenu?.closest('.gift-catalog-shell') || rightGiftCatalogMenu?.parentElement;

    if (leftGiftCatalogMenu && !leftCatalogShell?.contains(event.target) && !leftGiftCatalogToggle?.contains(event.target)) {
      closeLeftGiftCatalogMenu();
    }

    if (rightGiftCatalogMenu && !rightCatalogShell?.contains(event.target) && !rightGiftCatalogToggle?.contains(event.target)) {
      closeRightGiftCatalogMenu();
    }
  });

    // Fullscreen toggle for both boards
    if (fullscreenToggleBtn) {
      fullscreenToggleBtn.addEventListener('click', async () => {
        try {
          if (!document.fullscreenElement) {
            if (boardGrid && boardGrid.requestFullscreen) {
              await boardGrid.requestFullscreen();
            }
          } else {
            if (document.exitFullscreen) {
              await document.exitFullscreen();
            }
          }
        } catch (err) {
          setLiveStatus('error', 'No se pudo cambiar a pantalla completa.');
        }
      });
    }

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        if (fullscreenToggleBtn) fullscreenToggleBtn.textContent = 'Pantalla completa';
      } else {
        if (fullscreenToggleBtn) fullscreenToggleBtn.textContent = 'Salir pantalla completa';
      }
    });
}

async function initializeApp() {
  bootstrapEventListeners();
  updateConnectionState(state.live);

  await loadStateFromServer();
  await restoreTiktokConnectionSnake();

  // Pre-load board images from state
  ['left', 'right'].forEach((side) => {
    const snake = getSnake(side);
    if (snake.boardImage && !boardImageCache[side]) {
      const img = new Image();
      img.onload = () => {
        boardImageCache[side] = img;
      };
      img.src = snake.boardImage;
    }
  });

  hideWinnerOverlay();
  updateSnakeTitles();
  updateSpeedUI();
  await loadGiftCatalog();
  renderBoards();
  renderRules();
  renderHistory();
  connectLiveEvents();
  startGameLoop();
}

initializeApp();
