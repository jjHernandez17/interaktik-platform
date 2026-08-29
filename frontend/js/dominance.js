// TIKTOKINTERACTIVE/frontend/js/dominance.js
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
const dominanceSavePowersConfigBtn = document.getElementById('dominanceSavePowersConfigBtn');
const dominancePowersConfigTable = document.getElementById('dominancePowersConfigTable');

let dominanceGiftCatalog = [];
let dominanceGiftCatalogLoaded = false;
let dominanceGiftCatalogLoading = false;

const killsModeConfig = document.getElementById('killsModeConfig');
const killsDurationGroup = document.getElementById('killsDurationGroup');
const killsTargetGroup = document.getElementById('killsTargetGroup');
const dominanceCenterStatus = document.getElementById('dominanceCenterStatus');
const dominanceTimerPill = document.getElementById('dominanceTimerPill');
const dominanceStartBattleBtn = document.getElementById('dominanceStartBattleBtn');

const leftArmy = document.getElementById('leftArmy');
const rightArmy = document.getElementById('rightArmy');
const dominanceProjectileLayer = document.getElementById('dominanceProjectileLayer');

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

    combat: {
      powerCatalog: [],
      powerBindings: [],
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

// Nota: el reclutamiento real ocurre en el listener 'comment' de connectToEvents()
// (más abajo). Antes existían aquí getTeamByComment/generateSoldierPosition/
// createSoldierFromViewer/recruitViewerToTeam como una segunda implementación
// paralela que nunca se llamaba desde ningún lado (código muerto duplicado con
// valores por defecto ligeramente distintos) — se eliminaron para no dejar una
// trampa de mantenimiento a futuro.

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
  dominanceState.killsConfig.timerStartedAt = new Date().toISOString();

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
let combatEngine = null;

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

function initializeCombatEngine() {
  if (combatEngine) {
    return combatEngine;
  }

  if (!window.DominanceCombat?.createCombatEngine) {
    return null;
  }

  combatEngine = window.DominanceCombat.createCombatEngine({
    getWorld: () => ({
      soldiers: dominanceState.soldiers,
      teams: dominanceState.teams,
      combat: dominanceState.combat,
    }),
  });

  if (combatEngine) {
    window.DominanceCombat.combatEngine = combatEngine;
    window.DominanceCombat.getCombatEngine = () => combatEngine;
    combatEngine.setWorldProvider(() => ({
      soldiers: dominanceState.soldiers,
      teams: dominanceState.teams,
      combat: dominanceState.combat,
    }));

    combatEngine.eventBus?.on?.('SoldierKilled', (detail) => {
      handleSoldierKilled(detail).catch((error) => {
        console.warn('[DOMINANCE] Error procesando SoldierKilled', error);
      });
    });

    if (dominanceProjectileLayer && window.DominanceCombat?.projectileRenderer?.attach) {
      window.DominanceCombat.projectileRenderer.attach(combatEngine, {
        layer: dominanceProjectileLayer,
        getSoldierElement: (soldierId) => leftArmy?.querySelector(`[data-soldier-id="${soldierId}"]`)
          || rightArmy?.querySelector(`[data-soldier-id="${soldierId}"]`)
          || null,
      });
    }

    combatEngine.start();
  }

  return combatEngine;
}

function stopCombatEngine() {
  if (combatEngine) {
    combatEngine.stop();
  }
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

    if (dominanceState.killsCombatStarted && !dominanceState.winner_team_id) {
      const endsAt = dominanceState.killsConfig?.timerEndsAt
        ? new Date(dominanceState.killsConfig.timerEndsAt).getTime()
        : null;

      if (endsAt && Date.now() >= endsAt) {
        finishKillsBattleByTimeout().catch((error) => {
          console.warn('[DOMINANCE] Error finalizando combate por tiempo', error);
        });
      }
    }
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


const MIN_GIFTS_FOR_MAX_SIZE = 20; // cantidad de regalos acumulados necesarios para llegar al tamaño máximo si nadie más lo ha superado

function getScaledSoldierSize(soldier, side) {
  const teamSoldiers = dominanceState.soldiers[side] || [];
  const maxGiftScore = teamSoldiers.reduce((max, current) => {
    return Math.max(max, Number(current?.giftScore || 0));
  }, 0);

  const effectiveMax = Math.max(maxGiftScore, MIN_GIFTS_FOR_MAX_SIZE);

  const ratio = Math.max(0, Number(soldier?.giftScore || 0) / effectiveMax);
  return Math.max(42, Math.min(90, 42 + (ratio * 48)));
}

function recalculateSoldierVisualSizes() {
  if (!dominanceState?.soldiers) return;

  const growthEase = 0.04; // qué tan rápido se acerca al tamaño objetivo cada frame (0-1)

  ['left', 'right'].forEach((side) => {
    const soldiers = dominanceState.soldiers[side] || [];
    soldiers.forEach((soldier) => {
      const targetSize = getScaledSoldierSize(soldier, side);
      const currentSize = Number(soldier.size || 42);

      if (Math.abs(targetSize - currentSize) < 0.1) {
        soldier.size = targetSize;
      } else {
        soldier.size = currentSize + (targetSize - currentSize) * growthEase;
      }
    });
  });
}

function renderSoldiers() {
  leftArmy.innerHTML = '';
  rightArmy.innerHTML = '';

  recalculateSoldierVisualSizes();

  dominanceState.soldiers.left.forEach((soldier) => {
    const element = document.createElement('div');

    element.className = 'soldier';
    element.dataset.soldierId = soldier.id;

    element.style.left = `${soldier.x}px`;
    element.style.top = `${soldier.y}px`;
    element.style.width = `${soldier.size || 42}px`;

    element.innerHTML = `
      <div class="soldier-avatar" style="width:${soldier.size || 42}px;height:${soldier.size || 42}px;">
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
    element.dataset.soldierId = soldier.id;

    element.style.left = `${soldier.x}px`;
    element.style.top = `${soldier.y}px`;
    element.style.width = `${soldier.size || 42}px`;

    element.innerHTML = `
      <div class="soldier-avatar" style="width:${soldier.size || 42}px;height:${soldier.size || 42}px;">
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
    combat: dominanceState.combat,
  };

  try {
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

function rehydrateSoldierCombatState(soldier, side) {
  if (window.DominanceCombat?.soldierState?.createSoldierCombatState) {
    return window.DominanceCombat.soldierState.createSoldierCombatState(soldier, side);
  }
  return soldier;
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

    const combatState = payload.combat || dominanceState.combat || {};

    dominanceState = {
      ...initialState,
      ...dominanceState,
      ...payload,

      combat: {
        powerCatalog: Array.isArray(combatState.powerCatalog) ? combatState.powerCatalog : [],
        powerBindings: Array.isArray(combatState.powerBindings) ? combatState.powerBindings : [],
      },

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
          ? payload.soldiers.left.map((soldier) => rehydrateSoldierCombatState(soldier, 'left'))
          : [],
        right: Array.isArray(payload.soldiers?.right)
          ? payload.soldiers.right.map((soldier) => rehydrateSoldierCombatState(soldier, 'right'))
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
  renderCombatPowerConfig();
  renderSoldiers();
  renderHistory();

  if (window.DominanceCombat?.registerCombatSystems) {
    window.DominanceCombat.registerCombatSystems();
  }

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


function findSoldierEntryById(soldierId) {
  const leftSoldier = dominanceState.soldiers.left.find(
    soldier => soldier.id === soldierId
  );

  if (leftSoldier) {
    return { side: 'left', soldier: leftSoldier };
  }

  const rightSoldier = dominanceState.soldiers.right.find(
    soldier => soldier.id === soldierId
  );

  if (rightSoldier) {
    return { side: 'right', soldier: rightSoldier };
  }

  return null;
}

function finishKillsBattle(winningSide) {
  if (dominanceState.winner_team_id) return;

  dominanceState.winner_team_id = winningSide;
  dominanceState.winner = winningSide;
  dominanceState.killsCombatStarted = false;

  if (dominanceState.killsConfig) {
    dominanceState.killsConfig.isFinished = true;
  }

  showVictoryModal(winningSide);
}

async function finishKillsBattleByTimeout() {
  if (dominanceState.winner_team_id) return;

  const leftKills = Number(dominanceState.teams.left.kills || 0);
  const rightKills = Number(dominanceState.teams.right.kills || 0);

  dominanceState.killsCombatStarted = false;
  if (dominanceState.killsConfig) {
    dominanceState.killsConfig.isFinished = true;
  }

  if (leftKills === rightKills) {
    dominanceState.winner = 'draw';

    dominanceState.history.push(
      createDominanceHistoryEntry('El combate terminó en empate.', 'system')
    );

    updateArenaMessage('¡Empate! Ambos equipos terminaron con la misma cantidad de kills.', false);

    try {
      await showAppAlert('El combate terminó en empate.', 'Empate');
    } catch (e) {
      alert('El combate terminó en empate.');
    }
  } else {
    finishKillsBattle(leftKills > rightKills ? 'left' : 'right');
  }

  renderState();
  await saveDominanceState();
}

async function handleSoldierKilled({ soldierId } = {}) {
  if (!isKillsMode() || dominanceState.winner_team_id) return;

  const match = findSoldierEntryById(soldierId);
  if (!match) return;

  const killerSide = match.side === 'left' ? 'right' : 'left';
  dominanceState.teams[killerSide].kills =
    Number(dominanceState.teams[killerSide].kills || 0) + 1;

  dominanceState.history.push(
    createDominanceHistoryEntry(
      `${match.soldier.nickname} cayó en combate. ${dominanceState.teams[killerSide].name} +1 kill.`,
      'system'
    )
  );

  const killsConfigState = dominanceState.killsConfig || {};
  if (killsConfigState.victoryType === 'target') {
    const targetKills = Math.max(1, Number(killsConfigState.targetKills || 20));
    if (dominanceState.teams[killerSide].kills >= targetKills) {
      finishKillsBattle(killerSide);
    }
  }

  renderState();
  await saveDominanceState();
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
        side: selectedSide,

        hp: soldierMaxHp,
        maxHp: soldierMaxHp,
        shield: 0,
        giftScore: 0,
        size: 42,
        isDead: false,

        x: startPosition.x,
        y: startPosition.y,
        targetX: firstTarget.x,
        targetY: firstTarget.y,
        speed: 0.25 + Math.random() * 0.35
      };

      const soldierWithCombatState = window.DominanceCombat?.soldierState?.createSoldierCombatState
        ? window.DominanceCombat.soldierState.createSoldierCombatState(soldier, selectedSide)
        : soldier;
      dominanceState.soldiers[selectedSide].push(soldierWithCombatState);

      if (isKillsMode()) {
        await triggerThresholdAction(userId, 'comment', 1);
      }

      dominanceState.history.push(
        createDominanceHistoryEntry(
          `${soldierWithCombatState.nickname} se unió a ${selectedTeam.name}`,
          'live'
        )
      );

      updateArenaMessage(
        `${soldierWithCombatState.nickname} se unió a ${selectedTeam.name}`,
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

      const giftRepeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
      const giftName = payload.giftName || '';

      // Crecimiento del soldado por regalos (aplica en ambos modos)
      const senderMatch = findSoldierByUserId(sender);
      if (senderMatch?.soldier) {
        senderMatch.soldier.giftScore =
          Number(senderMatch.soldier.giftScore || 0) + giftRepeatCount;
      }

      if (isKillsMode()) {
        if (!dominanceState.killsCombatStarted) {
          markLiveEventFingerprintProcessed(fp);
          renderState();
          await saveDominanceState();
          return;
        }

        if (!senderMatch?.soldier || senderMatch.soldier.isDead) {
          markLiveEventFingerprintProcessed(fp);
          return;
        }

        const binding = resolveAbilityBindingForAction('gift', giftName);
        const abilityId = binding?.powerId || 'basic-shot';
        const configuredDamage = Number(binding?.parameterValue || 0);
        const overrides = configuredDamage > 0 ? { damage: configuredDamage } : null;

        const engine = combatEngine || window.DominanceCombat?.getCombatEngine?.();
        if (engine) {
          engine.queueAbility(senderMatch.soldier.id, abilityId, null, overrides);
        }

        const ability = window.DominanceCombat?.abilities?.getAbilityById?.(abilityId) || null;

        dominanceState.history.push(
          createDominanceHistoryEntry(
            `${payload.user?.nickname || sender} activó ${ability?.name || abilityId} con ${giftName || 'un regalo'}`,
            'live'
          )
        );

        updateArenaMessage(
          `${payload.user?.nickname || sender} lanzó ${ability?.name || abilityId}`,
          true
        );

        markLiveEventFingerprintProcessed(fp);
        renderState();
        await saveDominanceState();
        return;
      }

      // Modo vida de equipo (comportamiento existente, sin cambios)
      const attackerSide = senderSide;
      const defenderSide = attackerSide === 'left' ? 'right' : 'left';

      const attackerTeam = dominanceState.teams[attackerSide];
      const defenderTeam = dominanceState.teams[defenderSide];

      if (!attackerTeam || !defenderTeam) {
        markLiveEventFingerprintProcessed(fp);
        return;
      }

      const damage = giftRepeatCount;

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

  liveEventsSource.addEventListener('like', async (event) => {
    try {
      const payload = JSON.parse(event.data);
      const userId = String(payload.user?.uniqueId || payload.user?.nickname || '').trim();
      if (!userId) return;

      const increment = Number(payload.likeCount || payload.count || 1) || 1;
      await triggerThresholdAction(userId, 'like', increment);
    } catch (error) {
      console.warn('[DOMINANCE] Error procesando like', error);
    }
  });

  liveEventsSource.addEventListener('follow', async (event) => {
    try {
      const payload = JSON.parse(event.data);
      const userId = String(payload.user?.uniqueId || payload.user?.nickname || '').trim();
      if (!userId) return;

      await triggerThresholdAction(userId, 'follow', 1);
    } catch (error) {
      console.warn('[DOMINANCE] Error procesando follow', error);
    }
  });

  liveEventsSource.addEventListener('share', async (event) => {
    try {
      const payload = JSON.parse(event.data);
      const userId = String(payload.user?.uniqueId || payload.user?.nickname || '').trim();
      if (!userId) return;

      await triggerThresholdAction(userId, 'share', 1);
    } catch (error) {
      console.warn('[DOMINANCE] Error procesando share', error);
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
  if (dominanceGiftCatalogLoading) {
    return dominanceGiftCatalog;
  }

  dominanceGiftCatalogLoading = true;

  try {
    const response = await fetch('/api/gifts?gameType=dominance');
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo cargar el catálogo.');
    }

    dominanceGiftCatalog = Array.isArray(result.gifts) ? result.gifts : [];
    dominanceGiftCatalogLoaded = true;

    if (typeof renderCombatPowerConfig === 'function') {
      renderCombatPowerConfig();
    }

    await showAppAlert('Catálogo cargado correctamente.', 'TikTok catálogo');
    return dominanceGiftCatalog;
  } catch (error) {
    await showAppAlert(error.message, 'Error');
    return dominanceGiftCatalog;
  } finally {
    dominanceGiftCatalogLoading = false;
  }
}

async function triggerThresholdAction(userUniqueId, actionType, incrementCount = 1) {
  if (!isKillsMode() || !dominanceState.killsCombatStarted) return;
  if (dominanceState.winner_team_id) return;

  const match = findSoldierByUserId(userUniqueId);
  if (!match?.soldier || match.soldier.isDead) return;

  const soldier = match.soldier;
  soldier.actionCounters = soldier.actionCounters || { like: 0, follow: 0, share: 0 };
  soldier.actionCounters[actionType] =
    Number(soldier.actionCounters[actionType] || 0) + Number(incrementCount || 1);

  const binding = resolveAbilityBindingForAction(actionType);
  if (!binding) return;

  const threshold = Math.max(1, Number(binding.parameterValue || 1));
  const abilityId = binding.powerId || 'basic-shot';
  const engine = combatEngine || window.DominanceCombat?.getCombatEngine?.();

  let triggeredCount = 0;
  while (soldier.actionCounters[actionType] >= threshold) {
    soldier.actionCounters[actionType] -= threshold;
    if (engine) {
      engine.queueAbility(soldier.id, abilityId, null);
    }
    triggeredCount += 1;
  }

  if (triggeredCount > 0) {
    const ability = window.DominanceCombat?.abilities?.getAbilityById?.(abilityId) || null;

    dominanceState.history.push(
      createDominanceHistoryEntry(
        `${soldier.nickname} activó ${ability?.name || abilityId} x${triggeredCount} (${actionType})`,
        'live'
      )
    );

    updateArenaMessage(`${soldier.nickname} lanzó ${ability?.name || abilityId}`, true);

    renderState();
    await saveDominanceState();
  }
}

function resolveAbilityBindingForAction(actionType, actionName) {
  ensureCombatStateShape();
  const bindings = dominanceState.combat.powerBindings || [];
  const typeBindings = bindings.filter((binding) => binding.actionType === actionType);
  if (!typeBindings.length) return null;

  const normalizedName = String(actionName || '').trim().toLowerCase();
  if (normalizedName) {
    const exactMatch = typeBindings.find(
      (binding) => String(binding.actionName || '').trim().toLowerCase() === normalizedName
    );
    if (exactMatch) return exactMatch;
  }

  return typeBindings[0];
}

function ensureCombatStateShape() {
  const defaultCombat = window.DominanceCombat?.createCombatState?.() || {
    powerCatalog: [],
    powerBindings: [],
  };

  if (!dominanceState.combat) {
    dominanceState.combat = {
      powerCatalog: [],
      powerBindings: [],
    };
  }

  if (!Array.isArray(dominanceState.combat.powerCatalog)) {
    dominanceState.combat.powerCatalog = defaultCombat.powerCatalog || [];
  }

  if (!Array.isArray(dominanceState.combat.powerBindings)) {
    dominanceState.combat.powerBindings = defaultCombat.powerBindings || [];
  }

  if (dominanceState.combat.powerCatalog.length === 0) {
    dominanceState.combat.powerCatalog = defaultCombat.powerCatalog || [];
  }

  if (dominanceState.combat.powerBindings.length === 0) {
    dominanceState.combat.powerBindings = defaultCombat.powerBindings || [];
  }

  return dominanceState.combat;
}

function renderPowerCatalogCard(power) {
  const projectileTypes = window.DominanceCombat?.abilities?.PROJECTILE_TYPES || [];
  const projectileOptions = projectileTypes
    .map((option) => `<option value="${option.value}" ${option.value === power.projectileType ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');

  return `
    <div class="power-card" data-power-id="${power.id}">
      <div class="power-card-header">
        <input class="power-card-name" data-power-id="${power.id}" data-field="name" value="${escapeHtml(power.name)}" maxlength="40" />
        <button class="power-card-remove" data-power-id="${power.id}" type="button" title="Eliminar poder">✕</button>
      </div>
      <div class="power-card-grid">
        <label>Tipo
          <select data-power-id="${power.id}" data-field="type">
            <option value="attack" ${power.type !== 'support' ? 'selected' : ''}>Ataque</option>
            <option value="support" ${power.type === 'support' ? 'selected' : ''}>Soporte (aliados)</option>
          </select>
        </label>
        <label>Estilo visual
          <select data-power-id="${power.id}" data-field="projectileType">${projectileOptions}</select>
        </label>
        <label>Color
          <input type="color" data-power-id="${power.id}" data-field="color" value="${escapeHtml(power.color || '#f59e0b')}" />
        </label>
        <label>Daño
          <input type="number" min="0" data-power-id="${power.id}" data-field="damage" value="${Number(power.damage || 0)}" />
        </label>
        <label>Curación
          <input type="number" min="0" data-power-id="${power.id}" data-field="healing" value="${Number(power.healing || 0)}" />
        </label>
        <label>Escudo otorgado
          <input type="number" min="0" data-power-id="${power.id}" data-field="shield" value="${Number(power.shield || 0)}" />
        </label>
        <label>Disparos
          <input type="number" min="1" max="20" data-power-id="${power.id}" data-field="shots" value="${Number(power.shots || 1)}" />
        </label>
        <label>Radio de explosión (px)
          <input type="number" min="0" data-power-id="${power.id}" data-field="explosionRadius" value="${Number(power.explosionRadius || 0)}" />
        </label>
        <label>Velocidad
          <input type="number" min="0.1" step="0.1" data-power-id="${power.id}" data-field="projectileSpeed" value="${Number(power.projectileSpeed || 1)}" />
        </label>
        <label>Tamaño (px)
          <input type="number" min="2" max="40" data-power-id="${power.id}" data-field="projectileSize" value="${Number(power.projectileSize || 8)}" />
        </label>
        <label>Cooldown (ms)
          <input type="number" min="0" step="10" data-power-id="${power.id}" data-field="cooldownMs" value="${Number(power.cooldownMs || 0)}" />
        </label>
        <label>Duración animación (ms)
          <input type="number" min="50" step="10" data-power-id="${power.id}" data-field="animationDuration" value="${Number(power.animationDuration || 280)}" />
        </label>
      </div>
    </div>
  `;
}

function getBindingParameterHint(actionType) {
  if (actionType === 'gift') {
    return 'Daño/curación extra (0 = usa el valor del poder)';
  }
  return 'Cada cuántas veces se activa el poder';
}

function renderCombatPowerConfig() {
  ensureCombatStateShape();

  if (!dominancePowersConfigTable) return;

  const combatState = dominanceState.combat;
  const catalog = Array.isArray(combatState.powerCatalog) && combatState.powerCatalog.length > 0
    ? combatState.powerCatalog
    : (window.DominanceCombat?.createDefaultPowerCatalog?.() || []);
  const bindings = Array.isArray(combatState.powerBindings) && combatState.powerBindings.length > 0
    ? combatState.powerBindings
    : (window.DominanceCombat?.createDefaultPowerBindings?.() || []);

  const actionTypes = [
    { value: 'comment', label: 'Comentario' },
    { value: 'like', label: 'Me gusta' },
    { value: 'follow', label: 'Follow' },
    { value: 'gift', label: 'Regalo' },
    { value: 'share', label: 'Share' },
  ];

  if (!dominanceGiftCatalogLoaded && !dominanceGiftCatalogLoading) {
    void loadGiftCatalog();
  }

  const normalizedBindings = [];
  actionTypes.forEach((actionTypeItem) => {
    const existingBinding = bindings.find((binding) => binding.actionType === actionTypeItem.value);
    normalizedBindings.push(existingBinding || {
      id: `binding-${actionTypeItem.value}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actionType: actionTypeItem.value,
      actionName: actionTypeItem.value === 'gift' ? '' : actionTypeItem.label,
      powerId: catalog[0]?.id || '',
      parameterValue: 1,
    });
  });

  const extraBindings = bindings.filter((binding) => !actionTypes.some((actionTypeItem) => actionTypeItem.value === binding.actionType));
  normalizedBindings.push(...extraBindings);

  const rows = normalizedBindings.map((binding) => {
    const actionType = actionTypes.find((item) => item.value === binding.actionType) || actionTypes[0];
    const selectedPower = catalog.find((power) => power.id === binding.powerId) || catalog[0] || null;
    const actionLabel = String(binding.actionName || '').trim();
    const actionNameValue = escapeHtml(actionLabel || (actionType.value === 'gift' ? '' : actionType.label));
    const giftOptions = dominanceGiftCatalog
      .map((gift) => {
        const giftName = String(gift?.name || gift?.giftName || gift?.id || '').trim();
        if (!giftName) return '';
        const isSelected = actionLabel.toLowerCase() === giftName.toLowerCase();
        return `<option value="${escapeHtml(giftName)}" ${isSelected ? 'selected' : ''}>${escapeHtml(giftName)}</option>`;
      })
      .filter(Boolean)
      .join('');

    const actionInput = actionType.value === 'gift'
      ? `<select data-binding-id="${binding.id}" data-field="actionName">
          <option value="">Sin regalo específico</option>
          ${giftOptions}
        </select>`
      : `<input data-binding-id="${binding.id}" data-field="actionName" value="${actionNameValue}" placeholder="${escapeHtml(actionType.label)}" />`;

    return `
      <tr>
        <td>
          <select data-binding-id="${binding.id}" data-field="actionType">
            ${actionTypes.map((item) => `<option value="${item.value}" ${item.value === binding.actionType ? 'selected' : ''}>${item.label}</option>`).join('')}
          </select>
        </td>
        <td>
          ${actionInput}
        </td>
        <td>
          <select data-binding-id="${binding.id}" data-field="powerId">
            ${catalog.map((power) => `<option value="${power.id}" ${selectedPower?.id === power.id ? 'selected' : ''}>${escapeHtml(power.name)}</option>`).join('')}
          </select>
        </td>
        <td>
          <input data-binding-id="${binding.id}" data-field="parameterValue" type="number" min="0" value="${Number(binding.parameterValue || 1)}" />
          <small class="power-binding-hint">${getBindingParameterHint(binding.actionType)}</small>
        </td>
      </tr>
    `;
  }).join('');

  dominancePowersConfigTable.innerHTML = `
    <div class="power-catalog-section">
      <div class="power-catalog-header">
        <h3>Poderes disponibles</h3>
        <button id="dominanceAddPowerBtn" class="btn accent" type="button">+ Nuevo poder</button>
      </div>
      <p class="hint">Cada poder define su propio daño/curación/escudo, cuántos proyectiles dispara, si golpea en área, qué tan rápido viaja y con qué estilo visual se dibuja.</p>
      <div class="power-catalog-grid">
        ${catalog.map(renderPowerCatalogCard).join('')}
      </div>
    </div>

    <div class="power-bindings-section">
      <h3>Asignación de eventos de TikTok</h3>
      <p class="hint">Decide qué poder se activa con cada tipo de evento (y, para regalos, con cuál regalo específico).</p>
      <table class="power-config-table">
        <thead>
          <tr>
            <th>Tipo de acción</th>
            <th>Acción o regalo</th>
            <th>Poder asignado</th>
            <th>Parámetro</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function savePowerBindingsFromUI() {
  ensureCombatStateShape();

  if (!dominancePowersConfigTable) return;

  const rows = dominancePowersConfigTable.querySelectorAll('tbody tr');
  const bindings = [];

  rows.forEach((row, index) => {
    const actionType = row.querySelector('[data-field="actionType"]')?.value || 'like';
    const actionName = row.querySelector('[data-field="actionName"]')?.value || '';
    const powerId = row.querySelector('[data-field="powerId"]')?.value || '';
    const parameterValue = Number(row.querySelector('[data-field="parameterValue"]')?.value || 0);

    const binding = dominanceState.combat.powerBindings[index] || {
      id: `binding-${Date.now()}-${index}`,
    };

    bindings.push({
      ...binding,
      actionType,
      actionName,
      powerId,
      // 0 es válido: para regalos significa "usar el valor del poder";
      // para like/follow/share, quien lo consume ya exige un mínimo de 1.
      parameterValue: Math.max(0, parameterValue),
    });
  });

  dominanceState.combat.powerBindings = bindings;
}

function savePowerCatalogFromUI() {
  ensureCombatStateShape();

  if (!dominancePowersConfigTable) return;

  const cards = dominancePowersConfigTable.querySelectorAll('.power-card');
  if (!cards.length) return;

  const catalog = [];

  cards.forEach((card) => {
    const powerId = card.dataset.powerId;
    const field = (name) => card.querySelector(`[data-field="${name}"]`)?.value;

    catalog.push({
      id: powerId,
      name: String(field('name') || 'Poder').trim().slice(0, 40) || 'Poder',
      type: field('type') === 'support' ? 'support' : 'attack',
      projectileType: field('projectileType') || 'basic-bullet',
      color: field('color') || '#f59e0b',
      damage: Math.max(0, Number(field('damage')) || 0),
      healing: Math.max(0, Number(field('healing')) || 0),
      shield: Math.max(0, Number(field('shield')) || 0),
      shots: Math.max(1, Math.min(20, Number(field('shots')) || 1)),
      explosionRadius: Math.max(0, Number(field('explosionRadius')) || 0),
      projectileSpeed: Math.max(0.1, Number(field('projectileSpeed')) || 1),
      projectileSize: Math.max(2, Math.min(60, Number(field('projectileSize')) || 8)),
      cooldownMs: Math.max(0, Number(field('cooldownMs')) || 0),
      animationDuration: Math.max(50, Number(field('animationDuration')) || 280),
    });
  });

  dominanceState.combat.powerCatalog = catalog;
}

function addNewPower() {
  ensureCombatStateShape();

  dominanceState.combat.powerCatalog.push({
    id: `power-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Nuevo poder',
    type: 'attack',
    projectileType: 'basic-bullet',
    color: '#f59e0b',
    damage: 20,
    healing: 0,
    shield: 0,
    shots: 1,
    explosionRadius: 0,
    projectileSpeed: 1.2,
    projectileSize: 8,
    cooldownMs: 200,
    animationDuration: 280,
  });

  renderCombatPowerConfig();
}

async function removePower(powerId) {
  ensureCombatStateShape();

  if (dominanceState.combat.powerCatalog.length <= 1) {
    await showAppAlert('Debe quedar al menos un poder disponible.', 'No se puede eliminar');
    return;
  }

  const usedByBinding = dominanceState.combat.powerBindings.some((binding) => binding.powerId === powerId);
  if (usedByBinding) {
    const confirmed = await showAppConfirm(
      'Este poder está asignado a un evento de TikTok. Si lo eliminas, ese evento pasará a usar el primer poder disponible. ¿Eliminar de todas formas?',
      'Poder en uso',
      'Eliminar',
      'Cancelar',
    );
    if (!confirmed) return;
  }

  dominanceState.combat.powerCatalog = dominanceState.combat.powerCatalog.filter((power) => power.id !== powerId);
  const fallbackId = dominanceState.combat.powerCatalog[0]?.id || '';

  dominanceState.combat.powerBindings = dominanceState.combat.powerBindings.map((binding) =>
    binding.powerId === powerId ? { ...binding, powerId: fallbackId } : binding
  );

  renderCombatPowerConfig();
}

async function savePowerConfig() {
  ensureCombatStateShape();
  savePowerCatalogFromUI();
  savePowerBindingsFromUI();
  renderState();
  await saveDominanceState();
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

  if (dominanceSavePowersConfigBtn) {
    dominanceSavePowersConfigBtn.addEventListener('click', async () => {
      await savePowerConfig();
      await showAppAlert('Configuración de poderes guardada.', 'Dominance');
    });
  }

  if (dominancePowersConfigTable) {
    dominancePowersConfigTable.addEventListener('change', () => {
      savePowerCatalogFromUI();
      savePowerBindingsFromUI();
    });

    dominancePowersConfigTable.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('.power-card-remove');
      if (removeBtn) {
        savePowerCatalogFromUI();
        savePowerBindingsFromUI();
        removePower(removeBtn.dataset.powerId).catch((error) => {
          console.warn('[DOMINANCE] Error eliminando poder', error);
        });
        return;
      }

      if (event.target.closest('#dominanceAddPowerBtn')) {
        savePowerCatalogFromUI();
        savePowerBindingsFromUI();
        addNewPower();
      }
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
  stopCombatEngine();
});

window.addEventListener('DOMContentLoaded', async () => {
  bindUIActions();
  await loadDominanceState();
  initializeCombatEngine();
  startSoldiersAnimation();
  startDominanceCenterTimer();
});
