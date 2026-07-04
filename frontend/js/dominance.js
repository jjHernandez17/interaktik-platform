const dominanceConnectionForm = document.getElementById('dominanceConnectionForm');
const dominanceUsernameInput = document.getElementById('dominanceUsername');
const dominanceLinkBtn = document.getElementById('dominanceLinkBtn');
const dominanceConnectLiveBtn = document.getElementById('dominanceConnectLiveBtn');
const dominanceLoadCatalogBtn = document.getElementById('dominanceLoadCatalogBtn');
const dominanceDisconnectBtn = document.getElementById('dominanceDisconnectBtn');
const dominanceConnectionStatusBadge = document.getElementById('dominanceConnectionStatusBadge');
const dominanceConnectionDetails = document.getElementById('dominanceConnectionDetails');
const dominanceTeamsContainer = document.getElementById('dominanceTeams');
const dominanceHistoryContainer = document.getElementById('dominanceHistory');
const dominanceSummary = document.getElementById('dominanceSummary');
const dominanceResetBtn = document.getElementById('dominanceResetBtn');
const dominanceClearHistoryBtn = document.getElementById('dominanceClearHistoryBtn');
const dominanceArenaMessage = document.getElementById('dominanceArenaMessage');

const dominanceGameMode = document.getElementById('dominanceGameMode');
const dominanceKillsVictoryType = document.getElementById('dominanceKillsVictoryType');
const dominanceKillsDuration = document.getElementById('dominanceKillsDuration');
const dominanceKillsTarget = document.getElementById('dominanceKillsTarget');
const dominanceSoldierHp = document.getElementById('dominanceSoldierHp');
const dominanceSaveGameConfigBtn = document.getElementById('dominanceSaveGameConfigBtn');

const killsModeConfig = document.getElementById('killsModeConfig');
const killsDurationGroup = document.getElementById('killsDurationGroup');
const killsTargetGroup = document.getElementById('killsTargetGroup');
const dominanceCenterStatus = document.getElementById('dominanceCenterStatus');
const dominanceTimerPill = document.getElementById('dominanceTimerPill');
const dominanceStartBattleBtn = document.getElementById('dominanceStartBattleBtn');

const leftArmy = document.getElementById('leftArmy');
const rightArmy = document.getElementById('rightArmy');

const leftHealth = document.getElementById('leftHealth');
const rightHealth = document.getElementById('rightHealth');

const leftTeamName = document.getElementById('leftTeamName');
const rightTeamName = document.getElementById('rightTeamName');

const leftConfigBackground =
  document.getElementById('leftConfigBackground');

const rightConfigBackground =
  document.getElementById('rightConfigBackground');




const saveLeftTeamBtn =
  document.getElementById('saveLeftTeamBtn');

const saveRightTeamBtn =
  document.getElementById('saveRightTeamBtn');

const leftConfigName =
  document.getElementById('leftConfigName');

const rightConfigName =
  document.getElementById('rightConfigName');

const leftConfigColor =
  document.getElementById('leftConfigColor');

const rightConfigColor =
  document.getElementById('rightConfigColor');

const leftConfigHealth =
  document.getElementById('leftConfigHealth');

const rightConfigHealth =
  document.getElementById('rightConfigHealth');


function createInitialDominanceState() {
  return {
    gameMode: 'team_hp', // team_hp | soldier_kills

    killsConfig: {
      victoryType: 'time', // time | target
      durationSeconds: 120,
      targetKills: 20,
      soldierHp: 200,
      timerStartedAt: null,
      timerEndsAt: null,
      isFinished: false
    },

    killsCombatStarted: false,

    teams: {
      left: {
        id: 'left',
        name: 'Titanes',
        color: '#ef4444',
        health: 10000,
        maxHealth: 10000,
        kills: 0,
        backgroundType: 'color',
        backgroundColor: '#ef4444',
        backgroundImage: ''
      },

      right: {
        id: 'right',
        name: 'Imperio',
        color: '#3b82f6',
        health: 10000,
        maxHealth: 10000,
        kills: 0,
        backgroundType: 'color',
        backgroundColor: '#3b82f6',
        backgroundImage: ''
      }
    },

    soldiers: {
      left: [],
      right: []
    },

    viewer_bindings: {},

    giftRules: [],

    history: [],

    active_team_id: 'left',

    round: 1,

    winner_team_id: null,

    winner: null,

    live: {
      status: 'disconnected',
      message: 'Sin conexión activa.',
      error: '',
    },
  };
}

let dominanceState = createInitialDominanceState();







let liveEventsSource = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function getViewerAvatar(user) {
  if (!user) {
    return 'assets/img/default-avatar.png';
  }

  const avatar = user.avatar;

  // Caso 1: avatar ya viene como string
  if (typeof avatar === 'string' && avatar.trim()) {
    return avatar.trim();
  }

  // Caso 2: avatar viene como objeto con url: []
  if (avatar && Array.isArray(avatar.url) && avatar.url.length > 0) {
    return avatar.url[0];
  }

  // Caso 3: otras propiedades directas del user
  if (typeof user.profilePictureUrl === 'string' && user.profilePictureUrl.trim()) {
    return user.profilePictureUrl.trim();
  }

  if (typeof user.profilePicture === 'string' && user.profilePicture.trim()) {
    return user.profilePicture.trim();
  }

  if (typeof user.avatarThumb === 'string' && user.avatarThumb.trim()) {
    return user.avatarThumb.trim();
  }

  if (typeof user.avatarMedium === 'string' && user.avatarMedium.trim()) {
    return user.avatarMedium.trim();
  }

  if (typeof user.avatarLarge === 'string' && user.avatarLarge.trim()) {
    return user.avatarLarge.trim();
  }

  return 'assets/img/default-avatar.png';
}

function createDominanceHistoryEntry(message, source = 'manual') {
  return {
    id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    source,
    createdAt: new Date().toISOString(),
  };
}

function updateArenaMessage(message, active = false) {
  if (!dominanceArenaMessage) return;
  dominanceArenaMessage.textContent = message || 'Esperando eventos de TikTok Live...';
  dominanceArenaMessage.classList.toggle('active', active);
}

// Deduplication helpers to avoid processing the same gift twice
const processedLiveEventFingerprints = new Map();
function buildLiveEventFingerprint(payload) {
  if (!payload) return '';
  const giftId = String(payload.giftId || payload.extendedGiftInfo?.id || '');
  const giftName = String(payload.giftName || '').trim().toLowerCase();
  const repeatCount = String(payload.repeatCount || payload.giftCount || 1);
  const user = String(payload.user?.uniqueId || payload.user?.nickname || '').trim().toLowerCase();
  const timeBucket = Math.floor(new Date(payload.timestamp || Date.now()).getTime() / 1000);
  return [giftId, giftName, repeatCount, user, timeBucket].join('|');
}

function markLiveEventFingerprintProcessed(fp) {
  if (!fp) return;
  processedLiveEventFingerprints.set(fp, Date.now());
  const ttl = 8 * 1000;
  for (const [k, v] of processedLiveEventFingerprints.entries()) {
    if (Date.now() - v > ttl) processedLiveEventFingerprints.delete(k);
  }
}

function hasProcessedLiveEventFingerprint(fp) {
  return fp && processedLiveEventFingerprints.has(fp);
}

function getTeam(side) {
  return dominanceState.teams[side];
}


function isKillsMode() {
  return dominanceState.gameMode === 'soldier_kills';
}

function isTeamHpMode() {
  return dominanceState.gameMode === 'team_hp';
}

function getTeamByComment(commentText) {

  const text =
    String(commentText || '')
      .trim()
      .toLowerCase();

  if (!text) return null;

  const leftName =
    dominanceState.teams.left.name
      .trim()
      .toLowerCase();

  const rightName =
    dominanceState.teams.right.name
      .trim()
      .toLowerCase();

  if (text === leftName) {
    return 'left';
  }

  if (text === rightName) {
    return 'right';
  }

  return null;
}

function generateSoldierPosition(side) {

  const container =
    side === 'left' ? leftArmy : rightArmy;

  const containerWidth =
    container?.clientWidth || 320;

  const containerHeight =
    container?.clientHeight || 620;

  const soldiers =
    dominanceState.soldiers[side] || [];

  const columns = 4;
  const spacingX = 70;
  const spacingY = 80;

  const index = soldiers.length;
  const row = Math.floor(index / columns);
  const col = index % columns;

  const baseX =
    side === 'left'
      ? 30
      : Math.max(30, containerWidth - 320);

  const x = baseX + (col * spacingX);
  const y = 30 + (row * spacingY);

  return {
    x: Math.min(x, containerWidth - 60),
    y: Math.min(y, containerHeight - 60),
  };
}

function createSoldierFromViewer(user, side) {
  const position = generateSoldierPosition(side);
  const soldierHp = Number(dominanceState.killsConfig?.soldierHp || 200);

  return {
    id: `soldier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    uniqueId: String(user?.uniqueId || user?.nickname || '').trim(),
    nickname: String(user?.nickname || user?.uniqueId || 'Jugador').trim(),
    avatarData: getViewerAvatar(user),
    hp: soldierHp,
    maxHp: soldierHp,
    x: position.x,
    y: position.y,
  };
}

async function recruitViewerToTeam(payload) {

  const comment =
    String(payload?.comment || '').trim();

  if (!comment) return;

  const side =
    getTeamByComment(comment);

  if (!side) return;

  const userUniqueId =
    String(payload?.user?.uniqueId || payload?.user?.nickname || '').trim();

  if (!userUniqueId) return;

  dominanceState.viewer_bindings =
    dominanceState.viewer_bindings || {};

  if (dominanceState.viewer_bindings[userUniqueId]) {
    return;
  }

  const soldier =
    createSoldierFromViewer(payload.user, side);

  dominanceState.viewer_bindings[userUniqueId] = side;
  dominanceState.soldiers[side].push(soldier);

  dominanceState.history.push(
    createDominanceHistoryEntry(
      `${soldier.nickname} se unió a ${dominanceState.teams[side].name}`,
      'comment'
    )
  );

  updateArenaMessage(
    `${soldier.nickname} se unió a ${dominanceState.teams[side].name}`,
    true
  );

  renderState();
  await saveDominanceState();
}

function renderHealth() {
  if (isKillsMode()) {
    leftHealth.textContent = `${Number(dominanceState.teams.left.kills || 0)} KILLS`;
    rightHealth.textContent = `${Number(dominanceState.teams.right.kills || 0)} KILLS`;
    return;
  }

  leftHealth.textContent =
    `${dominanceState.teams.left.health} HP`;

  rightHealth.textContent =
    `${dominanceState.teams.right.health} HP`;
}


function renderGameModeConfig() {
  if (dominanceGameMode) {
    dominanceGameMode.value = dominanceState.gameMode || 'team_hp';
  }

  const killsConfigState = dominanceState.killsConfig || {};

  if (dominanceKillsVictoryType) {
    dominanceKillsVictoryType.value = killsConfigState.victoryType || 'time';
  }

  if (dominanceKillsDuration) {
    dominanceKillsDuration.value = Number(killsConfigState.durationSeconds || 120);
  }

  if (dominanceKillsTarget) {
    dominanceKillsTarget.value = Number(killsConfigState.targetKills || 20);
  }

  if (dominanceSoldierHp) {
    dominanceSoldierHp.value = Number(killsConfigState.soldierHp || 200);
  }

  const killsModeActive = dominanceState.gameMode === 'soldier_kills';

  if (killsModeConfig) {
    killsModeConfig.style.display = killsModeActive ? 'grid' : 'none';
  }

  const victoryType = killsConfigState.victoryType || 'time';

  if (killsDurationGroup) {
    killsDurationGroup.style.display =
      killsModeActive && victoryType === 'time' ? '' : 'none';
  }

  if (killsTargetGroup) {
    killsTargetGroup.style.display =
      killsModeActive && victoryType === 'target' ? '' : 'none';
  }
}

function syncBodyModeClass() {
  document.body.classList.toggle(
    'kills-mode',
    dominanceState.gameMode === 'soldier_kills'
  );
}


function renderCenterStatus() {
  if (dominanceCenterStatus) {
    dominanceCenterStatus.textContent = '';
  }

  if (dominanceTimerPill) {
    dominanceTimerPill.style.display = 'none';
    dominanceTimerPill.textContent = '';
  }

  // modo vida de equipo
  if (dominanceState.gameMode !== 'soldier_kills') {
    if (dominanceCenterStatus) {
      dominanceCenterStatus.textContent = '';
    }
    return;
  }

  const killsConfigState = dominanceState.killsConfig || {};
  const victoryType = killsConfigState.victoryType || 'time';

  if (dominanceTimerPill) {
    dominanceTimerPill.style.display = 'flex';
  }

  // meta de kills
  if (victoryType === 'target') {
    if (dominanceTimerPill) {
      dominanceTimerPill.textContent =
        `META ${Number(killsConfigState.targetKills || 20)}`;
    }

    if (dominanceCenterStatus) {
      dominanceCenterStatus.textContent = dominanceState.killsCombatStarted
        ? 'Combate activo: gana el primero en llegar a la meta'
        : 'Presiona "Iniciar combate" para comenzar';
    }

    return;
  }

  // victoria por tiempo
  const endsAt = killsConfigState.timerEndsAt
    ? new Date(killsConfigState.timerEndsAt).getTime()
    : null;

  // si todavía no inicia el combate
  if (!dominanceState.killsCombatStarted || !endsAt) {
    const totalSeconds = Number(killsConfigState.durationSeconds || 120);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (dominanceTimerPill) {
      dominanceTimerPill.textContent =
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    if (dominanceCenterStatus) {
      dominanceCenterStatus.textContent =
        'Presiona "Iniciar combate" para arrancar el cronómetro';
    }

    return;
  }

  const remainingMs = Math.max(0, endsAt - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (dominanceTimerPill) {
    dominanceTimerPill.textContent =
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (dominanceCenterStatus) {
    dominanceCenterStatus.textContent =
      'Combate activo: gana el equipo con más kills al finalizar el tiempo';
  }
}


function renderStartBattleButton() {
  if (!dominanceStartBattleBtn) return;

  if (!isKillsMode()) {
    dominanceStartBattleBtn.style.display = 'none';
    return;
  }

  if (dominanceState.winner_team_id) {
    dominanceStartBattleBtn.style.display = 'none';
    return;
  }

  if (dominanceState.killsCombatStarted) {
    dominanceStartBattleBtn.style.display = 'none';
    return;
  }

  dominanceStartBattleBtn.style.display = 'inline-flex';
}


async function startKillsBattle() {
  if (!isKillsMode()) {
    return;
  }

  if (dominanceState.killsCombatStarted) {
    return;
  }

  dominanceState.killsCombatStarted = true;

  const killsConfig = dominanceState.killsConfig || {};
  if (killsConfig.victoryType === 'time') {
    const durationSeconds = Math.max(10, Number(killsConfig.durationSeconds || 120));
    dominanceState.killsConfig.timerEndsAt =
      new Date(Date.now() + (durationSeconds * 1000)).toISOString();
  }

  updateArenaMessage('El combate ha comenzado.', true);
  renderState();
  await saveDominanceState();
}


function renderSummary() {
  if (!dominanceSummary) return;

  const totalSoldiers =
    (dominanceState.soldiers.left?.length || 0) +
    (dominanceState.soldiers.right?.length || 0);

  if (dominanceState.gameMode === 'soldier_kills') {
    const victoryType = dominanceState.killsConfig?.victoryType || 'time';

    dominanceSummary.textContent =
      `Modo kills • ${totalSoldiers} soldados • victoria por ${victoryType === 'time' ? 'tiempo' : 'meta'}`;
    return;
  }

  dominanceSummary.textContent =
    `Modo vida de equipo • ${totalSoldiers} soldados • ronda ${dominanceState.round || 1}`;
}


function renderTeamNames() {

  leftTeamName.value =
    dominanceState.teams.left.name;

  rightTeamName.value =
    dominanceState.teams.right.name;

  if (leftConfigName) {
    leftConfigName.value =
      dominanceState.teams.left.name;
  }

  if (rightConfigName) {
    rightConfigName.value =
      dominanceState.teams.right.name;
  }

  if (leftConfigColor) {
    leftConfigColor.value =
      dominanceState.teams.left.backgroundColor;
  }

  if (rightConfigColor) {
    rightConfigColor.value =
      dominanceState.teams.right.backgroundColor;
  }

  if (leftConfigHealth) {
    leftConfigHealth.value =
      dominanceState.teams.left.health;
  }

  if (rightConfigHealth) {
    rightConfigHealth.value =
      dominanceState.teams.right.health;
  }

}


function renderBackgrounds() {

  const leftSide =
    document.querySelector('.left-side');

  const rightSide =
    document.querySelector('.right-side');

  if (dominanceState.teams.left.backgroundType === 'image') {

    leftSide.style.backgroundImage =
      `url(${dominanceState.teams.left.backgroundImage})`;

    leftSide.style.backgroundSize = 'cover';
    leftSide.style.backgroundPosition = 'center';

  } else {

    leftSide.style.background =
      dominanceState.teams.left.backgroundColor;
  }

  if (dominanceState.teams.right.backgroundType === 'image') {

    rightSide.style.backgroundImage =
      `url(${dominanceState.teams.right.backgroundImage})`;

    rightSide.style.backgroundSize = 'cover';
    rightSide.style.backgroundPosition = 'center';

  } else {

    rightSide.style.background =
      dominanceState.teams.right.backgroundColor;
  }

}

function fileToBase64(file) {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);

  });

}


function extractAvatarUrl(avatar) {
  if (!avatar) return '';

  // si ya viene como string normal
  if (typeof avatar === 'string') {
    return avatar;
  }

  // TikTok a veces manda avatar.url como array de URLs
  if (Array.isArray(avatar.url) && avatar.url.length > 0) {
    return avatar.url[0];
  }

  // por si viene en otras propiedades
  if (typeof avatar.uri === 'string' && avatar.uri) {
    return avatar.uri;
  }

  if (typeof avatar.mUri === 'string' && avatar.mUri) {
    // si no viene URL completa, intentamos construirla
    return `https://p16-sign-va.tiktokcdn.com/${avatar.mUri}`;
  }

  return '';
}



let soldiersAnimationFrame = null;

let dominanceCenterTimerInterval = null;

function getArmyBounds(side) {
  const container = side === 'left' ? leftArmy : rightArmy;

  return {
    width: container?.clientWidth || 320,
    height: container?.clientHeight || 320
  };
}

function getRandomSoldierTarget(side) {
  const bounds = getArmyBounds(side);
  const soldierSize = 42;

  return {
    x: Math.random() * Math.max(20, bounds.width - soldierSize),
    y: Math.random() * Math.max(20, bounds.height - soldierSize)
  };
}

function ensureSoldierFloatData(soldier, side) {
  const bounds = getArmyBounds(side);
  const soldierSize = 42;

  if (typeof soldier.x !== 'number') {
    soldier.x = Math.random() * Math.max(20, bounds.width - soldierSize);
  }

  if (typeof soldier.y !== 'number') {
    soldier.y = Math.random() * Math.max(20, bounds.height - soldierSize);
  }

  if (typeof soldier.speed !== 'number') {
    soldier.speed = 0.25 + Math.random() * 0.35; // lento y suave
  }

  if (typeof soldier.targetX !== 'number' || typeof soldier.targetY !== 'number') {
    const target = getRandomSoldierTarget(side);
    soldier.targetX = target.x;
    soldier.targetY = target.y;
  }
}

function moveFloatingSoldier(soldier, side) {
  ensureSoldierFloatData(soldier, side);

  const dx = soldier.targetX - soldier.x;
  const dy = soldier.targetY - soldier.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // si ya llegó al destino, elige otro punto del campo
  if (distance < 4) {
    const newTarget = getRandomSoldierTarget(side);
    soldier.targetX = newTarget.x;
    soldier.targetY = newTarget.y;
    return;
  }

  const dirX = dx / distance;
  const dirY = dy / distance;

  soldier.x += dirX * soldier.speed;
  soldier.y += dirY * soldier.speed;
}

function animateFloatingSoldiers() {
  const leftSoldiers = dominanceState?.soldiers?.left || [];
  const rightSoldiers = dominanceState?.soldiers?.right || [];

  leftSoldiers.forEach((soldier) => {
    moveFloatingSoldier(soldier, 'left');
  });

  rightSoldiers.forEach((soldier) => {
    moveFloatingSoldier(soldier, 'right');
  });

  renderSoldiers();

  soldiersAnimationFrame = requestAnimationFrame(animateFloatingSoldiers);
}

function startSoldiersAnimation() {
  stopSoldiersAnimation();
  soldiersAnimationFrame = requestAnimationFrame(animateFloatingSoldiers);
}

function stopSoldiersAnimation() {
  if (soldiersAnimationFrame) {
    cancelAnimationFrame(soldiersAnimationFrame);
    soldiersAnimationFrame = null;
  }
}

function startDominanceCenterTimer() {
  stopDominanceCenterTimer();

  dominanceCenterTimerInterval = setInterval(() => {
    if (dominanceState.gameMode !== 'soldier_kills') return;

    if (dominanceState.killsConfig?.victoryType !== 'time') return;

    renderCenterStatus();
  }, 1000);
}

function stopDominanceCenterTimer() {
  if (dominanceCenterTimerInterval) {
    clearInterval(dominanceCenterTimerInterval);
    dominanceCenterTimerInterval = null;
  }
}

function getSoldierHpPercent(soldier) {
  const maxHp = Math.max(1, Number(soldier?.maxHp || dominanceState.killsConfig?.soldierHp || 200));
  const hp = Math.max(0, Number(soldier?.hp ?? maxHp));
  return Math.max(0, Math.min(100, (hp / maxHp) * 100));
}

function getSoldierHpColor(percent) {
  if (percent <= 25) return '#ef4444'; // rojo
  if (percent <= 55) return '#f59e0b'; // amarillo/naranja
  return '#22c55e'; // verde
}

function buildSoldierHpBar(soldier) {
  if (!isKillsMode()) {
    return '';
  }

  const percent = getSoldierHpPercent(soldier);
  const color = getSoldierHpColor(percent);

  return `
    <div class="soldier-hp">
      <div
        class="soldier-hp-fill"
        style="width:${percent}%; background:${color};"
      ></div>
    </div>
  `;
}


function renderSoldiers() {
  leftArmy.innerHTML = '';
  rightArmy.innerHTML = '';

  dominanceState.soldiers.left.forEach((soldier) => {
    const element = document.createElement('div');

    element.className = 'soldier';

    element.style.left = `${soldier.x}px`;
    element.style.top = `${soldier.y}px`;

    element.innerHTML = `
      <div class="soldier-avatar">
        <img
          src="${soldier.avatarData || 'assets/img/default-avatar.png'}"
          alt=""
        >
      </div>
      ${buildSoldierHpBar(soldier)}
    `;

    leftArmy.appendChild(element);
  });

  dominanceState.soldiers.right.forEach((soldier) => {
    const element = document.createElement('div');

    element.className = 'soldier';

    element.style.left = `${soldier.x}px`;
    element.style.top = `${soldier.y}px`;

    element.innerHTML = `
      <div class="soldier-avatar">
        <img
          src="${soldier.avatarData || 'assets/img/default-avatar.png'}"
          alt=""
        >
      </div>
      ${buildSoldierHpBar(soldier)}
    `;

    rightArmy.appendChild(element);
  });
}





function renderHistory() {
  dominanceHistoryContainer.innerHTML = dominanceState.history
    .slice()
    .reverse()
    .map((entry) => `
      <div class="dominance-history-item">
        <strong>${entry.message}</strong>
        <small>${new Date(entry.createdAt).toLocaleString('es-ES')} · ${entry.source}</small>
      </div>
    `)
    .join('');
}

function setConnectionStatus(status, message = '', error = '') {
  dominanceState.live.status = status;
  dominanceState.live.message = message;
  dominanceState.live.error = error;

  dominanceConnectionStatusBadge.textContent = status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Cargando...' : status === 'error' ? 'Error' : 'Desconectado';
  dominanceConnectionStatusBadge.className = `status-badge ${status}`;
  dominanceConnectionDetails.textContent = message || 'Activa la conexión de TikTok para recibir regalos.';
}

async function resetGame() {
  const liveState = {
    ...dominanceState.live
  };

  const currentMode = dominanceState.gameMode;

  const currentKillsConfig = {
    ...dominanceState.killsConfig
  };

  dominanceState = {
    ...dominanceState,

    gameMode: currentMode,

    killsConfig: {
      ...currentKillsConfig,
      timerStartedAt: null,
      timerEndsAt: null,
      isFinished: false
    },

    killsCombatStarted: false,

    teams: {
      left: {
        ...dominanceState.teams.left,
        health: dominanceState.teams.left.maxHealth || 10000,
        kills: 0
      },

      right: {
        ...dominanceState.teams.right,
        health: dominanceState.teams.right.maxHealth || 10000,
        kills: 0
      }
    },

    soldiers: {
      left: [],
      right: []
    },

    viewer_bindings: {},

    giftRules: [],

    history: [],

    active_team_id: 'left',

    round: 1,

    winner_team_id: null,

    winner: null,

    live: liveState
  };

updateArenaMessage(
  currentMode === 'soldier_kills'
    ? 'Juego reiniciado. Recluta soldados y pulsa "Iniciar combate".'
    : 'Juego reiniciado. Esperando nuevos combatientes...',
  false
);

  renderState();
  await saveDominanceState();
}


function clearHistory() {
  dominanceState.history = [];
  updateArenaMessage('Bitácora limpia. Esperando el siguiente evento...', false);
  renderState();
}


async function saveGameModeConfig() {
  const selectedMode =
    dominanceGameMode?.value === 'soldier_kills'
      ? 'soldier_kills'
      : 'team_hp';

  const selectedVictoryType =
    dominanceKillsVictoryType?.value === 'target'
      ? 'target'
      : 'time';

  dominanceState.gameMode = selectedMode;

  dominanceState.killsConfig = {
    ...dominanceState.killsConfig,
    victoryType: selectedVictoryType,
    durationSeconds: Math.max(10, Number(dominanceKillsDuration?.value || 120)),
    targetKills: Math.max(1, Number(dominanceKillsTarget?.value || 20)),
    soldierHp: Math.max(1, Number(dominanceSoldierHp?.value || 200)),
    timerStartedAt: null,
    timerEndsAt: null,
    isFinished: false
  };

  // si cambian el HP base, reseteamos HP de soldados existentes
  const soldierHp = dominanceState.killsConfig.soldierHp;

  dominanceState.soldiers.left = (dominanceState.soldiers.left || []).map((soldier) => ({
    ...soldier,
    hp: Math.min(Number(soldier.hp || soldierHp), soldierHp),
    maxHp: soldierHp
  }));

  dominanceState.soldiers.right = (dominanceState.soldiers.right || []).map((soldier) => ({
    ...soldier,
    hp: Math.min(Number(soldier.hp || soldierHp), soldierHp),
    maxHp: soldierHp
  }));

  renderState();
  await saveDominanceState();
}

async function saveDominanceState() {
  const payload = {
    gameMode: dominanceState.gameMode,
    killsConfig: dominanceState.killsConfig,
    teams: dominanceState.teams,
    active_team_id: dominanceState.active_team_id,
    round: dominanceState.round,
    winner_team_id: dominanceState.winner_team_id,
    winner: dominanceState.winner,
    history: dominanceState.history,
    viewer_bindings: dominanceState.viewer_bindings,
    soldiers: dominanceState.soldiers,
  };


  try {
    console.log('GUARDANDO DOMINANCE', payload);
    console.log('ENVIANDO A BACKEND', JSON.stringify(payload, null, 2));
    console.log(
      'ENVIANDO A BACKEND',
      JSON.stringify(payload, null, 2)
    );
    const response = await fetch('/api/dominance/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn('[DOMINANCE] Save failed', error);
    }
  } catch (error) {
    console.warn('[DOMINANCE] Save failed', error.message);
  }
}

async function loadDominanceState() {
  try {

    const response = await fetch('/api/dominance/state');

    if (!response.ok) {
      throw new Error('No se pudo cargar el estado.');
    }

    const payload = await response.json();
    console.log('CARGADO DOMINANCE', payload);

    // Convertir estructura vieja a estructura nueva
    if (Array.isArray(payload.teams)) {

      payload.teams = {
        left: {
          id: payload.teams[0]?.id || 'left',
          name: payload.teams[0]?.name || 'Titanes',
          color: payload.teams[0]?.color || '#ff4444',
          health: payload.teams[0]?.life || 10000,
        },

        right: {
          id: payload.teams[1]?.id || 'right',
          name: payload.teams[1]?.name || 'Imperio',
          color: payload.teams[1]?.color || '#4488ff',
          health: payload.teams[1]?.life || 10000,
        }
      };
    }

    // Convertir soldados viejos
    if (Array.isArray(payload.soldiers)) {

      payload.soldiers = {
        left: [],
        right: []
      };

    }

    const initialState = createInitialDominanceState();

    dominanceState = {
      ...initialState,
      ...dominanceState,
      ...payload,

      teams: {
        left: {
          ...initialState.teams.left,
          ...(payload.teams?.left || {})
        },
        right: {
          ...initialState.teams.right,
          ...(payload.teams?.right || {})
        }
      },

      soldiers: {
        left: Array.isArray(payload.soldiers?.left)
          ? payload.soldiers.left
          : [],
        right: Array.isArray(payload.soldiers?.right)
          ? payload.soldiers.right
          : []
      },

      viewer_bindings:
        payload.viewer_bindings && typeof payload.viewer_bindings === 'object'
          ? payload.viewer_bindings
          : {},

      history: Array.isArray(payload.history)
        ? payload.history
        : [],

      live: dominanceState.live
    };

  } catch (error) {
    console.warn(
      '[DOMINANCE] Load failed, using default state',
      error.message
    );
  }

  console.log(dominanceState);









  renderState();
}




function renderState() {
  syncBodyModeClass();
  renderBackgrounds();
  renderHealth();
  renderTeamNames();
  renderGameModeConfig();
  renderCenterStatus();
  renderStartBattleButton();
  renderSummary();
  renderSoldiers();
  renderHistory();

  if (dominanceState.live.status !== 'connected') {
    updateArenaMessage(
      'Esperando eventos de TikTok Live...',
      false
    );
  }
}

function cleanUpEvents() {
  if (liveEventsSource) {
    liveEventsSource.close();
    liveEventsSource = null;
  }
}


function findSoldierByUserId(userId) {
  const leftSoldier = dominanceState.soldiers.left.find(
    soldier => soldier.uniqueId === userId
  );

  if (leftSoldier) {
    return { side: 'left', soldier: leftSoldier };
  }

  const rightSoldier = dominanceState.soldiers.right.find(
    soldier => soldier.uniqueId === userId
  );

  if (rightSoldier) {
    return { side: 'right', soldier: rightSoldier };
  }

  return null;
}

function connectToEvents() {
  cleanUpEvents();
  liveEventsSource = new EventSource('/events?gameType=dominance');

  liveEventsSource.addEventListener('status', (event) => {
    const payload = JSON.parse(event.data);

    setConnectionStatus(
      payload.status || 'disconnected',
      payload.message || '',
      payload.error || ''
    );

    if (payload.status === 'connected') {
      updateArenaMessage(
        'Conectado a TikTok Live. Esperando regalos y comentarios...',
        true
      );
    } else if (payload.status === 'disconnected') {
      updateArenaMessage(
        'Desconectado. Reconecta para continuar la batalla.',
        false
      );
    }
  });

  liveEventsSource.addEventListener('comment', async (event) => {
    try {
      const payload = JSON.parse(event.data);
      console.log('[DOMINANCE COMMENT USER]', payload.user);

      const text = String(payload.comment || '').trim();
      if (!text) return;

      const userId = String(
        payload.user?.uniqueId ||
        payload.user?.nickname ||
        ''
      ).trim();

      if (!userId) return;

      const leftTeam = dominanceState.teams.left;
      const rightTeam = dominanceState.teams.right;

      let selectedSide = null;
      let selectedTeam = null;

      if (text.toLowerCase() === leftTeam.name.toLowerCase()) {
        selectedSide = 'left';
        selectedTeam = leftTeam;
      } else if (text.toLowerCase() === rightTeam.name.toLowerCase()) {
        selectedSide = 'right';
        selectedTeam = rightTeam;
      }

      if (!selectedSide || !selectedTeam) return;

      dominanceState.viewer_bindings =
        dominanceState.viewer_bindings || {};

      if (dominanceState.viewer_bindings[userId]) return;

      dominanceState.viewer_bindings[userId] = selectedSide;

      const startPosition = getRandomSoldierTarget(selectedSide);
      const firstTarget = getRandomSoldierTarget(selectedSide);

      const avatarUrl = getViewerAvatar(payload.user);
      console.log('[DOMINANCE AVATAR FINAL]', avatarUrl);

      

      const soldierMaxHp =
        dominanceState.gameMode === 'soldier_kills'
          ? Number(dominanceState.killsConfig?.soldierHp || 200)
          : null;

      const soldier = {
        id: `soldier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        uniqueId: userId,
        nickname: payload.user?.nickname || userId,
        avatarData: avatarUrl,

        hp: soldierMaxHp,
        maxHp: soldierMaxHp,
        isDead: false,

        x: startPosition.x,
        y: startPosition.y,
        targetX: firstTarget.x,
        targetY: firstTarget.y,
        speed: 0.25 + Math.random() * 0.35
      };

      dominanceState.soldiers[selectedSide].push(soldier);

      dominanceState.history.push(
        createDominanceHistoryEntry(
          `${soldier.nickname} se unió a ${selectedTeam.name}`,
          'live'
        )
      );

      updateArenaMessage(
        `${soldier.nickname} se unió a ${selectedTeam.name}`,
        true
      );

      renderState();
      await saveDominanceState();

    } catch (error) {
      console.warn('[DOMINANCE] Error procesando comment', error);
    }
  });

  liveEventsSource.addEventListener('gift', async (event) => {
    try {
      const payload = JSON.parse(event.data);

      if (dominanceState.winner_team_id) return;

      const fp = buildLiveEventFingerprint(payload);
      if (hasProcessedLiveEventFingerprint(fp)) return;

      const sender = String(
        payload.user?.uniqueId ||
        payload.user?.nickname ||
        ''
      ).trim();

      if (!sender) return;

      const senderSide = dominanceState.viewer_bindings?.[sender];

      if (!senderSide) {
        dominanceState.history.push(
          createDominanceHistoryEntry(
            `Regalo de ${payload.user?.nickname || sender} ignorado (sin bando)`,
            'live'
          )
        );

        renderState();
        markLiveEventFingerprintProcessed(fp);
        await saveDominanceState();
        return;
      }

      const attackerSide = senderSide;
      const defenderSide = attackerSide === 'left' ? 'right' : 'left';

      const attackerTeam = dominanceState.teams[attackerSide];
      const defenderTeam = dominanceState.teams[defenderSide];

      if (!attackerTeam || !defenderTeam) {
        markLiveEventFingerprintProcessed(fp);
        return;
      }

      const damage =
        Number(payload.repeatCount || payload.giftCount || 1) || 1;

      defenderTeam.health = Math.max(
        0,
        Number(defenderTeam.health || 0) - damage
      );

      dominanceState.round =
        Number(dominanceState.round || 1) + 1;

      dominanceState.active_team_id = attackerSide;

      dominanceState.history.push(
        createDominanceHistoryEntry(
          `${defenderTeam.name} recibió un ataque de ${payload.user?.nickname || sender} (-${damage})`,
          'live'
        )
      );

      updateArenaMessage(
        `${defenderTeam.name} recibió un ataque de ${payload.user?.nickname || sender} (-${damage})`,
        true
      );

      if (defenderTeam.health <= 0) {
        defenderTeam.health = 0;
        dominanceState.winner_team_id = attackerSide;
        dominanceState.winner = attackerSide;
        showVictoryModal(attackerSide);
      }

      markLiveEventFingerprintProcessed(fp);

      renderState();
      await saveDominanceState();

    } catch (error) {
      console.warn('[DOMINANCE] Error procesando gift', error);
    }
  });

  liveEventsSource.addEventListener('error', () => {
    setConnectionStatus('connecting', 'Reconectando eventos...');
  });
}



function showVictoryModal(winningTeamId) {
  const team = dominanceState.teams[winningTeamId];
  if (!team) return;

  dominanceState.history.push(
    createDominanceHistoryEntry(
      `${team.name} ha ganado la partida`,
      'system'
    )
  );

  updateArenaMessage(
    `¡${team.name} se alzó con la victoria!`,
    false
  );

  try {
    showAppAlert(`¡${team.name} ha ganado!`, 'Victoria');
  } catch (e) {
    alert(`${team.name} ha ganado!`);
  }
}

async function linkTikTok() {
  const uniqueId = dominanceUsernameInput.value.trim().replace(/^@/, '');
  if (!uniqueId) {
    await showAppAlert('Ingresa un usuario de TikTok.', 'Falta usuario');
    return;
  }

  try {
    const response = await fetch('/api/tiktok-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'dominance', tiktokUsername: uniqueId }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo vincular TikTok.');
    }

    await showAppAlert('TikTok vinculado correctamente.', 'Éxito');
  } catch (error) {
    await showAppAlert(error.message, 'Error');
  }
}

async function connectTikTokLive() {
  const uniqueId = dominanceUsernameInput.value.trim().replace(/^@/, '');
  if (!uniqueId) {
    await showAppAlert('Ingresa un usuario de TikTok.', 'Falta usuario');
    return;
  }

  try {
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, gameType: 'dominance' }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo conectar al live.');
    }

    setConnectionStatus(result.status || 'connected', result.message || 'Conectado al live.');
    connectToEvents();
  } catch (error) {
    setConnectionStatus('error', 'No fue posible conectar.', error.message);
  }
}

async function disconnectTikTokLive() {
  try {
    const response = await fetch('/api/disconnect', { method: 'POST' });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo desconectar.');
    }

    setConnectionStatus('disconnected', 'Conexión cerrada.');
  } catch (error) {
    setConnectionStatus('error', 'Error desconectando.', error.message);
  } finally {
    cleanUpEvents();
  }
}

async function loadGiftCatalog() {
  try {
    const response = await fetch('/api/gifts?gameType=dominance');
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo cargar el catálogo.');
    }

    await showAppAlert('Catálogo cargado correctamente.', 'TikTok catálogo');
    return result.gifts || [];
  } catch (error) {
    await showAppAlert(error.message, 'Error');
    return [];
  }
}

function bindUIActions() {

  if (dominanceResetBtn) {
    dominanceResetBtn.addEventListener('click', async () => {
      await resetGame();
    });
  }

  if (dominanceStartBattleBtn) {
    dominanceStartBattleBtn.addEventListener('click', async () => {
      await startKillsBattle();
    });
  }

  if (dominanceClearHistoryBtn) {
    dominanceClearHistoryBtn.addEventListener('click', () => {
      clearHistory();
    });
  }





  if (dominanceGameMode) {
    dominanceGameMode.addEventListener('change', () => {
      const selectedMode =
        dominanceGameMode.value === 'soldier_kills'
          ? 'soldier_kills'
          : 'team_hp';

      dominanceState.gameMode = selectedMode;

      if (selectedMode === 'team_hp') {
        dominanceState.killsConfig = {
          ...dominanceState.killsConfig,
          timerStartedAt: null,
          timerEndsAt: null,
          isFinished: false
        };
      }

      renderState();
    });
  }

  if (dominanceKillsVictoryType) {
    dominanceKillsVictoryType.addEventListener('change', () => {
      dominanceState.killsConfig = {
        ...dominanceState.killsConfig,
        victoryType:
          dominanceKillsVictoryType.value === 'target'
            ? 'target'
            : 'time'
      };

      renderGameModeConfig();
      renderCenterStatus();
      renderSummary();
    });
  }

  if (dominanceSaveGameConfigBtn) {
    dominanceSaveGameConfigBtn.addEventListener('click', async () => {
      await saveGameModeConfig();
      await showAppAlert('Configuración de partida guardada.', 'Dominance');
    });
  }








  if (dominanceLinkBtn) {
    dominanceLinkBtn.addEventListener('click', () => linkTikTok());
  }

  if (dominanceConnectLiveBtn) {
    dominanceConnectLiveBtn.addEventListener('click', () => connectTikTokLive());
  }

  if (dominanceDisconnectBtn) {
    dominanceDisconnectBtn.addEventListener('click', () => disconnectTikTokLive());
  }

  if (dominanceLoadCatalogBtn) {
    dominanceLoadCatalogBtn.addEventListener('click', () => loadGiftCatalog());
  }

  if (leftTeamName) {
    leftTeamName.addEventListener('change', () => {

      dominanceState.teams.left.name =
        leftTeamName.value.trim() || 'Titanes';

      console.log('CAMBIO NOMBRE IZQUIERDO');

      saveDominanceState();

    });
  }

  if (rightTeamName) {
    rightTeamName.addEventListener('change', () => {

      dominanceState.teams.right.name =
        rightTeamName.value.trim() || 'Imperio';

      console.log('CAMBIO NOMBRE DERECHO');

      saveDominanceState();

    });
  }


  if (saveLeftTeamBtn) {

    saveLeftTeamBtn.addEventListener('click', async () => {

      dominanceState.teams.left.name =
        document.getElementById('leftConfigName').value.trim();

      dominanceState.teams.left.backgroundType =
        'color';

      dominanceState.teams.left.backgroundColor =
        document.getElementById('leftConfigColor').value;

      dominanceState.teams.left.backgroundImage =
        '';

      const leftHealthValue =
        Number(document.getElementById('leftConfigHealth').value) || 10000;

      dominanceState.teams.left.health = leftHealthValue;
      dominanceState.teams.left.maxHealth = leftHealthValue;


      const imageFile =
        leftConfigBackground.files[0];

      if (imageFile) {

        dominanceState.teams.left.backgroundType =
          'image';

        dominanceState.teams.left.backgroundImage =
          await fileToBase64(imageFile);

      }

      renderState();

      await saveDominanceState();

      console.log('EQUIPO IZQUIERDO GUARDADO');

    });


  }

  if (saveRightTeamBtn) {

    saveRightTeamBtn.addEventListener('click', async () => {

      dominanceState.teams.right.name =
        document.getElementById('rightConfigName').value.trim();

      dominanceState.teams.right.backgroundType =
        'color';

      dominanceState.teams.right.backgroundColor =
        document.getElementById('rightConfigColor').value;

      dominanceState.teams.right.backgroundImage =
        '';

      const rightHealthValue =
        Number(document.getElementById('rightConfigHealth').value) || 10000;

      dominanceState.teams.right.health = rightHealthValue;
      dominanceState.teams.right.maxHealth = rightHealthValue;

      const imageFile =
        rightConfigBackground.files[0];

      if (imageFile) {

        dominanceState.teams.right.backgroundType =
          'image';

        dominanceState.teams.right.backgroundImage =
          await fileToBase64(imageFile);

      }

      renderState();

      await saveDominanceState();

      console.log('EQUIPO DERECHO GUARDADO');

    });

  }

}

window.addEventListener('beforeunload', () => {
  cleanUpEvents();
  stopSoldiersAnimation();
  stopDominanceCenterTimer();
});

window.addEventListener('DOMContentLoaded', async () => {
  bindUIActions();
  await loadDominanceState();
  startSoldiersAnimation();
  startDominanceCenterTimer();
});
