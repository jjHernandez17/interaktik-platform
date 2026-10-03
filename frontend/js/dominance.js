// TIKTOKINTERACTIVE/frontend/js/dominance.js

// HP "infinito" (en la práctica) para los soldados en modo "vida de
// equipo" — ver el comentario donde se usa, en la creación del soldado.
const TEAM_HP_MODE_SOLDIER_HP_POOL = 999999999;

// Maximo de soldados por equipo, en cualquier modo de juego (el backend aplica el mismo
// tope al guardar: normalize.js). Al llenarse, nadie mas puede unirse a ese equipo hasta
// que caiga un soldado (modo Kills).
const MAX_SOLDIERS_PER_TEAM = 40;

const dominanceConnectionForm = document.getElementById('dominanceConnectionForm');
const dominanceUsernameInput = document.getElementById('dominanceUsername');
const dominanceConnectLiveBtn = document.getElementById('dominanceConnectLiveBtn');
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
const dominanceStartBattleWrapper = document.getElementById('dominanceStartBattleWrapper');

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

const dominanceTeamsHealth =
  document.getElementById('dominanceTeamsHealth');

const teamHpModeConfig =
  document.getElementById('teamHpModeConfig');


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
      powerBindings: [], // reglas de interacciones/regalos del modo "Kills por soldado"
      teamHpPowerBindings: [], // reglas propias del modo "Vida de equipo" (independientes de las de arriba)
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

  if (teamHpModeConfig) {
    teamHpModeConfig.style.display = killsModeActive ? 'none' : 'grid';
  }

  if (dominanceTeamsHealth) {
    dominanceTeamsHealth.value = Number(dominanceState.teams?.left?.maxHealth || 10000);
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
      dominanceCenterStatus.textContent = '';
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

  const setVisible = (visible) => {
    dominanceStartBattleBtn.style.display = visible ? 'inline-flex' : 'none';
    if (dominanceStartBattleWrapper) {
      dominanceStartBattleWrapper.style.display = visible ? 'flex' : 'none';
    }
  };

  if (!isKillsMode()) {
    setVisible(false);
    return;
  }

  if (dominanceState.winner_team_id) {
    setVisible(false);
    return;
  }

  if (dominanceState.killsCombatStarted) {
    setVisible(false);
    return;
  }

  setVisible(true);
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
  // Simulacion de partida (dominance-simulation.js): reutiliza los elementos de los 1000 soldados
  if (window.dominanceSimulation?.active) {
    window.dominanceSimulation.renderSoldiers();
    return;
  }

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
  if (window.dominanceSimulation?.active) {
    await showAppAlert('Apaga la simulación antes de reiniciar el juego.', 'Dominance');
    return;
  }

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
  if (window.dominanceSimulation?.active) {
    await showAppAlert('Apaga la simulación antes de guardar la configuración.', 'Dominance');
    return;
  }

  const selectedMode =
    dominanceGameMode?.value === 'soldier_kills'
      ? 'soldier_kills'
      : 'team_hp';

  const selectedVictoryType =
    dominanceKillsVictoryType?.value === 'target'
      ? 'target'
      : 'time';

  dominanceState.gameMode = selectedMode;

  if (selectedMode === 'team_hp') {
    const teamsHealthValue = Math.max(1, Number(dominanceTeamsHealth?.value || 10000));
    dominanceState.teams.left.health = teamsHealthValue;
    dominanceState.teams.left.maxHealth = teamsHealthValue;
    dominanceState.teams.right.health = teamsHealthValue;
    dominanceState.teams.right.maxHealth = teamsHealthValue;
  }

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

  // Si cambian el HP base, reseteamos HP de soldados existentes — pero
  // SOLO en modo Kills, porque en modo vida de equipo el HP del soldado es
  // un pool enorme irrelevante (ver TEAM_HP_MODE_SOLDIER_HP_POOL); si se
  // pisara acá con "Vida por soldado" (pensado solo para Kills), los
  // soldados de vida de equipo podrían terminar "muriendo" individualmente
  // por combate normal, cosa que este modo no debe permitir nunca.
  if (selectedMode === 'soldier_kills') {
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
  }

  renderState();
  await saveDominanceState();
}

async function saveDominanceState() {
  // La simulacion nunca se guarda: la partida real sigue intacta en la base de datos
  if (window.dominanceSimulation?.active) return;

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
        teamHpPowerBindings: Array.isArray(combatState.teamHpPowerBindings) ? combatState.teamHpPowerBindings : [],
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
          ? payload.soldiers.left.slice(0, MAX_SOLDIERS_PER_TEAM).map((soldier) => rehydrateSoldierCombatState(soldier, 'left'))
          : [],
        right: Array.isArray(payload.soldiers?.right)
          ? payload.soldiers.right.slice(0, MAX_SOLDIERS_PER_TEAM).map((soldier) => rehydrateSoldierCombatState(soldier, 'right'))
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




// Red de seguridad para partidas guardadas antes de este cambio (o
// soldados que hayan quedado con HP inválido por algún otro camino): en
// modo vida de equipo ningún soldado debe poder quedar "muerto" por
// combate individual, así que se repara cualquier HP nulo/agotado antes
// de cada render.
function ensureTeamHpSoldiersHealthy() {
  if (isKillsMode()) return;

  ['left', 'right'].forEach((side) => {
    (dominanceState.soldiers?.[side] || []).forEach((soldier) => {
      if (!soldier) return;
      if (!Number(soldier.maxHp) || Number(soldier.maxHp) < TEAM_HP_MODE_SOLDIER_HP_POOL) {
        soldier.maxHp = TEAM_HP_MODE_SOLDIER_HP_POOL;
      }
      if (!Number(soldier.hp) || Number(soldier.hp) <= 0) {
        soldier.hp = TEAM_HP_MODE_SOLDIER_HP_POOL;
      }
      soldier.isDead = false;
    });
  });
}

function renderState() {
  syncBodyModeClass();

  // Durante la simulacion solo se redibuja lo necesario (sin la tabla de poderes ni la bitacora)
  if (window.dominanceSimulation?.active) {
    renderBackgrounds();
    renderHealth();
    renderTeamNames();
    renderGameModeConfig();
    renderCenterStatus();
    renderStartBattleButton();
    renderSummary();
    renderSoldiers();
    return;
  }

  ensureTeamHpSoldiersHealthy();
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
  if (window.dominanceSimulation?.active) return;

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

  // El soldado caído desaparece del campo; el espectador puede volver a
  // comentar el nombre de su equipo para reaparecer con vida completa
  // (ver el guard en el handler de "comment" que detecta que ya no tiene
  // un soldado vivo en el campo).
  dominanceState.soldiers[match.side] = dominanceState.soldiers[match.side].filter(
    (soldier) => soldier.id !== soldierId
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
      if (window.dominanceSimulation?.active) return;
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

      // Equipo lleno: no se une nadie mas (tampoco se le asigna equipo al espectador)
      if ((dominanceState.soldiers[selectedSide] || []).length >= MAX_SOLDIERS_PER_TEAM) {
        updateArenaMessage(
          `${selectedTeam.name} está lleno (${MAX_SOLDIERS_PER_TEAM}/${MAX_SOLDIERS_PER_TEAM} soldados)`,
          false
        );
        return;
      }

      dominanceState.viewer_bindings =
        dominanceState.viewer_bindings || {};

      const existingSide = dominanceState.viewer_bindings[userId];

      if (existingSide) {
        // Ya tiene equipo asignado: solo puede "reaparecer" comentando el
        // nombre de ESE mismo equipo, y solo si su soldado anterior ya no
        // sigue vivo en el campo (si sigue vivo, se ignora para no duplicar).
        if (existingSide !== selectedSide) return;
        if (findSoldierByUserId(userId)) return;
      } else {
        dominanceState.viewer_bindings[userId] = selectedSide;
      }

      const startPosition = getRandomSoldierTarget(selectedSide);
      const firstTarget = getRandomSoldierTarget(selectedSide);

      const avatarUrl = getViewerAvatar(payload.user);
      console.log('[DOMINANCE AVATAR FINAL]', avatarUrl);



      // En modo "vida de equipo" el soldado sigue recibiendo los mismos
      // impactos visuales que en Kills (mismo motor de combate), pero nunca
      // debe "morir" individualmente — la vida real que importa es la del
      // equipo (ver applyPowerToTeams). Se le da un HP enorme para que el
      // motor de daño nunca lo marque como isDead; la barra de HP de todos
      // modos no se muestra en este modo (ver buildSoldierHpBar).
      const soldierMaxHp =
        dominanceState.gameMode === 'soldier_kills'
          ? Number(dominanceState.killsConfig?.soldierHp || 200)
          : TEAM_HP_MODE_SOLDIER_HP_POOL;

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
      if (window.dominanceSimulation?.active) return;
      const payload = JSON.parse(event.data);

      if (dominanceState.winner_team_id) return;

      const sender = String(
        payload.user?.uniqueId ||
        payload.user?.nickname ||
        ''
      ).trim();

      if (!sender) return;

      const senderSide = dominanceState.viewer_bindings?.[sender];

      // repeatCount: TikTok manda combos de un mismo regalo (ej. tocarlo 2
      // veces seguidas) como repeticiones del mismo evento — cada unidad es
      // un "disparo" real y debe pegar por separado, si no un combo de 2
      // pega como si fuera 1 solo. (El backend ya filtra reenvios exactos
      // del mismo mensaje por msgId antes de publicar, asi que aca no hace
      // falta — ni conviene — deduplicar de nuevo: dos regalos SEPARADOS
      // mandados en el mismo segundo tienen el mismo repeatCount=1 y se
      // veian identicos para el fingerprint viejo, que los pisaba a uno).
      const giftRepeatCount = Math.max(1, Number(payload.repeatCount || payload.giftCount || 1) || 1);
      const giftName = payload.giftName || '';

      if (!senderSide) {
        dominanceState.history.push(
          createDominanceHistoryEntry(
            `Regalo de ${payload.user?.nickname || sender} ignorado (sin bando)`,
            'live'
          )
        );

        renderState();
        await saveDominanceState();
        return;
      }

      // Crecimiento del soldado por regalos (aplica en ambos modos)
      const senderMatch = findSoldierByUserId(sender);
      if (senderMatch?.soldier) {
        senderMatch.soldier.giftScore =
          Number(senderMatch.soldier.giftScore || 0) + giftRepeatCount;
      }

      const binding = resolveAbilityBindingForAction('gift', giftName);
      const abilityId = binding?.powerId || 'basic-shot';
      // 0 = usa el valor propio del poder; > 0 lo reemplaza con lo que el
      // streamer asigno puntualmente para este regalo. Este es el daño POR
      // UNIDAD del regalo — se aplica una vez por cada unidad (repeatCount).
      const configuredDamage = Number(binding?.damage || 0);

      if (isKillsMode()) {
        if (!dominanceState.killsCombatStarted) {
          renderState();
          await saveDominanceState();
          return;
        }

        if (!senderMatch?.soldier || senderMatch.soldier.isDead) {
          return;
        }

        const ability = window.DominanceCombat?.abilities?.getAbilityById?.(abilityId) || null;

        const overrides = configuredDamage > 0
          ? (ability?.type === 'support'
            ? {
              ...(Number(ability?.healing) > 0 ? { healing: configuredDamage } : null),
              ...(Number(ability?.shield) > 0 ? { shield: configuredDamage } : null),
            }
            : { damage: configuredDamage })
          : null;

        const engine = combatEngine || window.DominanceCombat?.getCombatEngine?.();
        if (engine) {
          for (let i = 0; i < giftRepeatCount; i += 1) {
            engine.queueAbility(senderMatch.soldier.id, abilityId, null, overrides);
          }
        }

        dominanceState.history.push(
          createDominanceHistoryEntry(
            giftRepeatCount > 1
              ? `${payload.user?.nickname || sender} activó ${ability?.name || abilityId} x${giftRepeatCount} con ${giftName || 'un regalo'}`
              : `${payload.user?.nickname || sender} activó ${ability?.name || abilityId} con ${giftName || 'un regalo'}`,
            'live'
          )
        );

        updateArenaMessage(
          `${payload.user?.nickname || sender} lanzó ${ability?.name || abilityId}`,
          true
        );

        renderState();
        await saveDominanceState();
        return;
      }

      // Modo vida de equipo: mismo poder, mismos efectos visuales y el mismo
      // ataque a un jugador rival al azar que en Kills por soldado — la
      // diferencia es que el daño/curación se descuenta de la vida
      // COMPARTIDA del equipo en vez del HP individual (el soldado nunca
      // "muere" en este modo: se crea con un HP enorme que la UI nunca
      // muestra, ver buildSoldierHpBar). Requiere, igual que en Kills, que
      // el que mandó el regalo tenga un soldado activo en el campo.
      if (!senderMatch?.soldier || senderMatch.soldier.isDead) {
        return;
      }

      const engineForTeamHp = combatEngine || window.DominanceCombat?.getCombatEngine?.();
      for (let i = 0; i < giftRepeatCount; i += 1) {
        if (engineForTeamHp) {
          engineForTeamHp.queueAbility(senderMatch.soldier.id, abilityId, null);
        }
        applyPowerToTeams(senderSide, abilityId, configuredDamage, payload.user?.nickname || sender);
      }

      renderState();
      await saveDominanceState();

    } catch (error) {
      console.warn('[DOMINANCE] Error procesando gift', error);
    }
  });

  liveEventsSource.addEventListener('like', async (event) => {
    try {
      if (window.dominanceSimulation?.active) return;
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
      if (window.dominanceSimulation?.active) return;
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
      if (window.dominanceSimulation?.active) return;
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

// El usuario de TikTok se vincula desde la sección "Juegos" del panel (una
// sola vez, para todos los juegos) — ver platform.js. Aca solo se lee lo que
// ya haya quedado vinculado, para reflejarlo en el input bloqueado.
async function restoreLinkedTiktokUsername() {
  try {
    const response = await fetch('/api/tiktok-connection/dominance');
    const data = response.ok ? await response.json() : null;

    if (data?.tiktok_username) {
      dominanceUsernameInput.value = `@${data.tiktok_username}`;
      setConnectionStatus('disconnected', `Cuenta vinculada a @${data.tiktok_username}. Presiona "Conectar a live" cuando ya estés transmitiendo.`);
    } else {
      dominanceUsernameInput.value = '';
      setConnectionStatus('disconnected', 'Vincula tu usuario de TikTok desde la sección "Juegos" del panel.');
    }
  } catch (error) {
    setConnectionStatus('error', 'No se pudo leer tu usuario vinculado.', error.message);
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

// Los regalos de TikTok traen la imagen en formas bien distintas según de
// dónde salga el catálogo (a veces es un string, a veces un objeto con
// urlList/url, a veces un array) — se prueba cada campo conocido hasta
// encontrar algo usable. Mismo patrón ya probado en app.js/roblox-dance.js.
function pickFirstUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstUrl(item);
      if (picked) return picked;
    }
    return '';
  }

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

function sanitizeDominanceGiftCatalog(rawGifts) {
  return (Array.isArray(rawGifts) ? rawGifts : []).map((gift) => ({
    id: String(gift?.id ?? gift?.giftId ?? ''),
    name: String(gift?.name || gift?.giftName || `Regalo ${gift?.id ?? ''}`).trim(),
    diamondCount: Number(gift?.diamondCount || gift?.diamond_count || 1) || 1,
    imageUrl: getGiftImageUrl(gift),
  }));
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

    dominanceGiftCatalog = sanitizeDominanceGiftCatalog(result.gifts);
    dominanceGiftCatalogLoaded = true;

    if (typeof renderCombatPowerConfig === 'function') {
      renderCombatPowerConfig();
    }

    return dominanceGiftCatalog;
  } catch (error) {
    await showAppAlert(error.message, 'Error');
    return dominanceGiftCatalog;
  } finally {
    dominanceGiftCatalogLoading = false;
  }
}

// Aplica un poder directo a la vida de los equipos — usado en modo "Vida de
// equipo", donde no hay HP individual por soldado ni proyectil visual
// todavia (eso queda para cuando mejoremos como se ven los poderes). Ataque
// resta al equipo rival; soporte le suma al propio equipo (curacion y
// escudo se tratan igual aca, como vida recuperada, ya que este modo no
// lleva un contador de escudo aparte). `overrideAmount` > 0 gana sobre el
// valor propio del poder; en 0 se usa el valor propio.
function applyPowerToTeams(attackerSide, abilityId, overrideAmount, actorLabel) {
  const defenderSide = attackerSide === 'left' ? 'right' : 'left';
  const attackerTeam = dominanceState.teams[attackerSide];
  const defenderTeam = dominanceState.teams[defenderSide];
  if (!attackerTeam || !defenderTeam) return;

  const ability = window.DominanceCombat?.abilities?.getAbilityById?.(abilityId) || null;
  const powerName = ability?.name || abilityId;

  if (ability?.type === 'support') {
    const amount = overrideAmount > 0 ? overrideAmount : Number(ability?.healing || ability?.shield || 0);
    if (amount <= 0) return;

    attackerTeam.health = Math.min(
      Number(attackerTeam.maxHealth || attackerTeam.health || 0) || amount,
      Number(attackerTeam.health || 0) + amount
    );

    const message = `${actorLabel} activó ${powerName} y ${attackerTeam.name} recuperó ${amount} de vida`;
    dominanceState.history.push(createDominanceHistoryEntry(message, 'live'));
    updateArenaMessage(message, true);
    return;
  }

  const amount = overrideAmount > 0 ? overrideAmount : Number(ability?.damage || 0);
  if (amount <= 0) return;

  defenderTeam.health = Math.max(0, Number(defenderTeam.health || 0) - amount);
  dominanceState.round = Number(dominanceState.round || 1) + 1;
  dominanceState.active_team_id = attackerSide;

  const message = `${defenderTeam.name} recibió ${powerName} de ${actorLabel} (-${amount})`;
  dominanceState.history.push(createDominanceHistoryEntry(message, 'live'));
  updateArenaMessage(message, true);

  if (defenderTeam.health <= 0) {
    defenderTeam.health = 0;
    dominanceState.winner_team_id = attackerSide;
    dominanceState.winner = attackerSide;
    showVictoryModal(attackerSide);
  }
}

async function triggerThresholdAction(userUniqueId, actionType, incrementCount = 1) {
  if (dominanceState.winner_team_id) return;
  if (isKillsMode() && !dominanceState.killsCombatStarted) return;

  const match = findSoldierByUserId(userUniqueId);
  if (!match?.soldier || match.soldier.isDead) return;

  const soldier = match.soldier;
  soldier.actionCounters = soldier.actionCounters || { like: 0, follow: 0, share: 0 };
  soldier.actionCounters[actionType] =
    Number(soldier.actionCounters[actionType] || 0) + Number(incrementCount || 1);

  const binding = resolveAbilityBindingForAction(actionType);
  if (!binding) return;

  const threshold = Math.max(1, Number(binding.threshold || 1));
  const abilityId = binding.powerId || 'basic-shot';

  let triggeredCount = 0;
  while (soldier.actionCounters[actionType] >= threshold) {
    soldier.actionCounters[actionType] -= threshold;
    triggeredCount += 1;
  }

  if (triggeredCount <= 0) return;

  const ability = window.DominanceCombat?.abilities?.getAbilityById?.(abilityId) || null;

  const engine = combatEngine || window.DominanceCombat?.getCombatEngine?.();
  for (let i = 0; i < triggeredCount; i += 1) {
    if (engine) engine.queueAbility(soldier.id, abilityId, null);
  }

  if (isKillsMode()) {
    dominanceState.history.push(
      createDominanceHistoryEntry(
        `${soldier.nickname} activó ${ability?.name || abilityId} x${triggeredCount} (${actionType})`,
        'live'
      )
    );
    updateArenaMessage(`${soldier.nickname} lanzó ${ability?.name || abilityId}`, true);
  } else {
    // Modo vida de equipo: mismo efecto visual que Kills (el soldado
    // dispara contra un rival al azar), pero el daño/curación real se
    // descuenta de la vida compartida del equipo.
    for (let i = 0; i < triggeredCount; i += 1) {
      applyPowerToTeams(match.side, abilityId, 0, soldier.nickname);
    }
  }

  renderState();
  await saveDominanceState();
}

function resolveAbilityBindingForAction(actionType, actionName) {
  const bindings = getActivePowerBindings() || [];
  const typeBindings = bindings.filter((binding) => binding.actionType === actionType);
  if (!typeBindings.length) return null;

  const normalizedName = String(actionName || '').trim().toLowerCase();
  if (normalizedName) {
    const exactMatch = typeBindings.find(
      (binding) => String(binding.actionName || '').trim().toLowerCase() === normalizedName
    );
    if (exactMatch) return exactMatch;
  }

  // Sin match exacto (regalo no asignado puntualmente): se usa el binding
  // "cualquier otro regalo" (actionName vacío) en vez de uno al azar.
  const catchAll = typeBindings.find((binding) => !String(binding.actionName || '').trim());
  return catchAll || typeBindings[0];
}

// El catalogo de poderes ya NO es editable por el streamer: siempre es el
// catalogo fijo de combat/abilities.js (getPowerCatalog() mas abajo). Aca
// solo se asegura que powerBindings exista, con los defaults la primera vez.
function ensureCombatStateShape() {
  if (!dominanceState.combat) {
    dominanceState.combat = { powerCatalog: [], powerBindings: [], teamHpPowerBindings: [] };
  }

  if (!Array.isArray(dominanceState.combat.powerBindings) || dominanceState.combat.powerBindings.length === 0) {
    dominanceState.combat.powerBindings = window.DominanceCombat?.createDefaultPowerBindings?.() || [];
  }

  // Array independiente del de arriba (cada uno con sus propios defaults,
  // no la misma referencia) — el streamer configura las reglas de "Vida de
  // equipo" por separado de las de "Kills por soldado".
  if (!Array.isArray(dominanceState.combat.teamHpPowerBindings) || dominanceState.combat.teamHpPowerBindings.length === 0) {
    dominanceState.combat.teamHpPowerBindings = window.DominanceCombat?.createDefaultPowerBindings?.() || [];
  }

  // Ya no se guarda un catalogo custom por cuenta (ver getPowerCatalog) —
  // se limpia cualquier resto viejo para que el motor use siempre el fijo.
  dominanceState.combat.powerCatalog = [];

  return dominanceState.combat;
}

// Cada modo de juego configura sus propias reglas de interacciones/regalos
// de forma independiente — estos dos helpers son el único lugar que decide
// cuál de los dos arrays está "activo" según el modo actual.
function getActivePowerBindings() {
  ensureCombatStateShape();
  return isKillsMode() ? dominanceState.combat.powerBindings : dominanceState.combat.teamHpPowerBindings;
}

function setActivePowerBindings(bindings) {
  ensureCombatStateShape();
  if (isKillsMode()) {
    dominanceState.combat.powerBindings = bindings;
  } else {
    dominanceState.combat.teamHpPowerBindings = bindings;
  }
}

// Catalogo fijo de poderes (ver combat/abilities.js) — ya no se guarda por
// cuenta ni se edita desde la UI, solo se elige de esta lista al armar cada
// asignacion.
function getPowerCatalog() {
  return window.DominanceCombat?.abilities?.createAbilityCatalog?.() || [];
}

function powerSelectOptions(catalog, selectedId) {
  return catalog
    .map((power) => `<option value="${power.id}" ${power.id === selectedId ? 'selected' : ''}>${escapeHtml(power.name)}${power.type === 'support' ? ' (soporte)' : ''}</option>`)
    .join('');
}

function findGiftInCatalogByName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;
  return dominanceGiftCatalog.find((gift) => gift.name.toLowerCase() === normalized) || null;
}

// Contenido del botón cerrado del picker: imagen + nombre + monedas si el
// regalo está en el catálogo cargado; si el streamer ya lo había guardado
// pero el catálogo todavía no cargó (o el regalo ya no existe), se muestra
// solo el nombre en vez de perder la selección.
function renderGiftPickerToggleLabel(actionName) {
  if (!actionName) {
    return '<span class="gift-picker-selected placeholder">Elige un regalo...</span>';
  }

  const gift = findGiftInCatalogByName(actionName);
  if (!gift) {
    return `<span class="gift-picker-selected"><span class="gift-picker-selected-name">${escapeHtml(actionName)}</span></span>`;
  }

  return `
    <span class="gift-picker-selected">
      <img class="gift-picker-selected-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" onerror="this.style.visibility='hidden'" />
      <span class="gift-picker-selected-name">${escapeHtml(gift.name)}</span>
      <span class="gift-picker-selected-coins">${gift.diamondCount}</span>
    </span>
  `;
}

// Lista filtrable (nombre + rango de monedas) que se dibuja SOLO al abrir
// el picker o al cambiar un filtro — no en cada render de la tabla, porque
// el catálogo real tiene cientos de regalos y renderCombatPowerConfig()
// puede correr varias veces por segundo mientras hay actividad en el live.
function giftPickerListMarkup(selectedName, nameFilter = '', min = null, max = null) {
  if (dominanceGiftCatalog.length === 0) {
    return '<p class="muted">Carga el catálogo primero.</p>';
  }

  const normalizedFilter = nameFilter.trim().toLowerCase();
  const normalizedSelected = String(selectedName || '').trim().toLowerCase();

  const filtered = dominanceGiftCatalog.filter((gift) => {
    if (normalizedFilter && !gift.name.toLowerCase().includes(normalizedFilter)) return false;
    if (min !== null && !Number.isNaN(min) && gift.diamondCount < min) return false;
    if (max !== null && !Number.isNaN(max) && gift.diamondCount > max) return false;
    return true;
  });

  if (filtered.length === 0) {
    return '<p class="muted">Sin resultados para ese filtro.</p>';
  }

  return filtered.map((gift) => `
    <button type="button" class="gift-picker-item${normalizedSelected === gift.name.toLowerCase() ? ' selected' : ''}" data-gift-name="${escapeHtml(gift.name)}">
      <img class="gift-picker-item-image" src="${escapeHtml(gift.imageUrl || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <span class="gift-picker-item-name">${escapeHtml(gift.name)}</span>
      <span class="gift-picker-item-coins">${gift.diamondCount}</span>
    </button>
  `).join('');
}

function giftPickerMarkup(binding) {
  return `
    <div class="gift-picker" data-gift-picker>
      <button type="button" class="gift-picker-toggle">
        ${renderGiftPickerToggleLabel(binding.actionName)}
        <svg class="gift-picker-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.5 4.5L7 9L11.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="gift-picker-panel hidden">
        <div class="gift-picker-filters">
          <input type="text" class="gift-picker-filter-name" placeholder="Buscar por nombre..." autocomplete="off" />
          <div class="gift-picker-coins-filter">
            <input type="number" min="0" class="gift-picker-filter-min" placeholder="Monedas mín." />
            <input type="number" min="0" class="gift-picker-filter-max" placeholder="Monedas máx." />
          </div>
        </div>
        <div class="gift-picker-list"></div>
      </div>
      <input type="hidden" data-field="actionName" value="${escapeHtml(binding.actionName || '')}" />
    </div>
  `;
}

// --- Interacción del picker (delegada desde dominancePowersConfigTable,
// ver bindUIActions) ---

function closeAllGiftPickers() {
  document.querySelectorAll('.gift-picker-panel').forEach((panel) => panel.classList.add('hidden'));
  document.querySelectorAll('.gift-picker-toggle').forEach((toggle) => toggle.classList.remove('open'));
}

function refreshGiftPickerList(picker) {
  const nameInput = picker.querySelector('.gift-picker-filter-name');
  const minInput = picker.querySelector('.gift-picker-filter-min');
  const maxInput = picker.querySelector('.gift-picker-filter-max');
  const hiddenInput = picker.querySelector('[data-field="actionName"]');
  const listEl = picker.querySelector('.gift-picker-list');
  if (!listEl) return;

  const min = minInput?.value !== '' ? Number(minInput.value) : null;
  const max = maxInput?.value !== '' ? Number(maxInput.value) : null;

  listEl.innerHTML = giftPickerListMarkup(hiddenInput?.value, nameInput?.value || '', min, max);
}

function openGiftPickerPanel(picker) {
  if (!dominanceGiftCatalogLoaded && !dominanceGiftCatalogLoading) {
    void loadGiftCatalog();
  }

  const panel = picker.querySelector('.gift-picker-panel');
  const toggle = picker.querySelector('.gift-picker-toggle');

  // La fila de regalos ahora vive dentro de un contenedor con scroll
  // propio (.power-bindings-gifts-scroll) — si el panel quedara con
  // position:absolute relativo a la fila, el scroll lo recortaría apenas
  // se abriera cerca del borde. Se posiciona con position:fixed, anclado
  // a la posición real del botón en la pantalla, para que siempre se vea
  // completo sin importar el scroll.
  if (panel && toggle) {
    const rect = toggle.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.width = `${Math.max(rect.width, 340)}px`;
  }

  panel?.classList.remove('hidden');
  toggle?.classList.add('open');
  refreshGiftPickerList(picker);
}

function selectGiftInPicker(picker, giftName) {
  const hiddenInput = picker.querySelector('[data-field="actionName"]');
  if (hiddenInput) hiddenInput.value = giftName;

  const toggle = picker.querySelector('.gift-picker-toggle');
  const chevron = toggle?.querySelector('.gift-picker-chevron');
  if (toggle && chevron) {
    toggle.innerHTML = renderGiftPickerToggleLabel(giftName) + chevron.outerHTML;
  }
}

function renderCombatPowerConfig() {
  if (!dominancePowersConfigTable) return;

  const catalog = getPowerCatalog();
  const bindings = getActivePowerBindings();

  if (!dominanceGiftCatalogLoaded && !dominanceGiftCatalogLoading) {
    void loadGiftCatalog();
  }

  const interactionTypes = [
    { value: 'like', label: 'Me gusta' },
    { value: 'follow', label: 'Follow' },
    { value: 'share', label: 'Share' },
  ];

  const interactionRows = interactionTypes.map((item) => {
    const binding = bindings.find((entry) => entry.actionType === item.value) || {
      id: `binding-${item.value}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actionType: item.value,
      actionName: item.label,
      powerId: catalog[0]?.id || '',
      threshold: 1,
    };

    return `
      <tr data-binding-id="${binding.id}" data-action-type="${item.value}">
        <td>${escapeHtml(item.label)}</td>
        <td><select data-field="powerId">${powerSelectOptions(catalog, binding.powerId)}</select></td>
        <td><input data-field="threshold" type="number" min="1" value="${Number(binding.threshold || 1)}" /></td>
      </tr>
    `;
  }).join('');

  // La fila "cualquier otro regalo" se identifica por su id reservado, NUNCA
  // por tener el campo de regalo vacio — una fila recien agregada (antes de
  // que el streamer elija un regalo puntual) tambien arranca vacia, y si se
  // la identificara asi quedaria confundida con esta y jamas se mostraria
  // como fila nueva (el bug que reportó el streamer: "no me deja crear más
  // reglas").
  const DEFAULT_GIFT_BINDING_ID = 'binding-gift-default';
  const giftBindings = bindings.filter((entry) => entry.actionType === 'gift');
  const defaultGiftBinding = giftBindings.find((entry) => String(entry.id || '').startsWith(DEFAULT_GIFT_BINDING_ID)) || {
    id: DEFAULT_GIFT_BINDING_ID,
    actionType: 'gift',
    actionName: '',
    powerId: catalog[0]?.id || '',
    damage: 50,
  };
  const specificGiftBindings = giftBindings.filter((entry) => !String(entry.id || '').startsWith(DEFAULT_GIFT_BINDING_ID));

  function giftRow(binding, { removable }) {
    const giftCell = removable
      ? giftPickerMarkup(binding)
      : `<strong>Cualquier otro regalo</strong>`;

    return `
      <tr data-binding-id="${binding.id}" data-action-type="gift">
        <td>${giftCell}</td>
        <td><select data-field="powerId">${powerSelectOptions(catalog, binding.powerId)}</select></td>
        <td><input data-field="damage" type="number" min="0" value="${Number(binding.damage || 0)}" /></td>
        <td>${removable ? `<button class="power-card-remove" type="button" data-remove-binding="${binding.id}" title="Quitar regalo">✕</button>` : ''}</td>
      </tr>
    `;
  }

  const giftRows = [
    giftRow(defaultGiftBinding, { removable: false }),
    ...specificGiftBindings.map((binding) => giftRow(binding, { removable: true })),
  ].join('');

  dominancePowersConfigTable.innerHTML = `
    <div class="power-bindings-mode-badge">
      Configurando reglas para el modo: <strong>${isKillsMode() ? 'Kills por soldado' : 'Vida de equipo'}</strong>
      <span class="power-bindings-mode-badge-hint">Cada modo tiene sus propias reglas, independientes del otro</span>
    </div>

    <div class="power-bindings-columns">
      <div class="power-bindings-section">
        <h3>Me gusta, Follow y Share</h3>
        <p class="hint">Elige qué poder se activa con cada interacción, y cada cuántas veces (por espectador) se dispara.</p>
        <table class="power-config-table power-config-table-interactions">
          <thead><tr><th>Interacción</th><th>Poder</th><th>Cada cuántos</th></tr></thead>
          <tbody>${interactionRows}</tbody>
        </table>
      </div>

      <div class="power-bindings-section">
        <h3>Regalos</h3>
        <p class="hint">
          Elige qué poder dispara cada regalo y cuánto daño hace (o curación/escudo, si el poder es de soporte).
          "Cualquier otro regalo" cubre los que no asignes puntualmente.
        </p>
        <div class="power-bindings-gifts-scroll">
          <table class="power-config-table power-config-table-gifts">
            <thead><tr><th>Regalo</th><th>Poder</th><th>Daño</th><th></th></tr></thead>
            <tbody>${giftRows}</tbody>
          </table>
        </div>
        <button id="dominanceAddGiftBindingBtn" class="btn accent" type="button" style="margin-top:14px;">+ Agregar regalo específico</button>
      </div>
    </div>
  `;
}

function savePowerBindingsFromUI() {
  ensureCombatStateShape();

  if (!dominancePowersConfigTable) return;

  const rows = dominancePowersConfigTable.querySelectorAll('tbody tr');
  const bindings = [];

  rows.forEach((row) => {
    const bindingId = row.dataset.bindingId;
    const actionType = row.dataset.actionType;
    const powerId = row.querySelector('[data-field="powerId"]')?.value || '';

    if (actionType === 'gift') {
      const actionName = row.querySelector('[data-field="actionName"]')?.value || '';
      const damage = Number(row.querySelector('[data-field="damage"]')?.value || 0);
      bindings.push({ id: bindingId, actionType: 'gift', actionName, powerId, damage: Math.max(0, damage) });
      return;
    }

    const threshold = Number(row.querySelector('[data-field="threshold"]')?.value || 1);
    bindings.push({ id: bindingId, actionType, actionName: actionType, powerId, threshold: Math.max(1, threshold) });
  });

  setActivePowerBindings(bindings);
}

function addGiftBinding() {
  const catalog = getPowerCatalog();
  getActivePowerBindings().push({
    id: `binding-gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actionType: 'gift',
    actionName: '',
    powerId: catalog[0]?.id || '',
    damage: 50,
  });

  renderCombatPowerConfig();
}

function removeGiftBinding(bindingId) {
  setActivePowerBindings(getActivePowerBindings().filter((binding) => binding.id !== bindingId));
  renderCombatPowerConfig();
}

async function savePowerConfig() {
  if (window.dominanceSimulation?.active) return;
  ensureCombatStateShape();
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
      if (window.dominanceSimulation?.active) {
        await showAppAlert('Apaga la simulación antes de guardar la configuración.', 'Dominance');
        return;
      }
      await saveGameModeConfig();
      await showAppAlert('Configuración de partida guardada.', 'Dominance');
    });
  }

  if (dominanceSavePowersConfigBtn) {
    dominanceSavePowersConfigBtn.addEventListener('click', async () => {
      if (window.dominanceSimulation?.active) {
        await showAppAlert('Apaga la simulación antes de guardar la configuración.', 'Dominance');
        return;
      }
      await savePowerConfig();
      await showAppAlert('Configuración de juego guardada.', 'Dominance');
    });
  }

  if (dominancePowersConfigTable) {
    dominancePowersConfigTable.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('[data-remove-binding]');
      if (removeBtn) {
        savePowerBindingsFromUI();
        removeGiftBinding(removeBtn.dataset.removeBinding);
        return;
      }

      if (event.target.closest('#dominanceAddGiftBindingBtn')) {
        savePowerBindingsFromUI();
        addGiftBinding();
        return;
      }

      const pickerToggle = event.target.closest('.gift-picker-toggle');
      if (pickerToggle) {
        const picker = pickerToggle.closest('.gift-picker');
        const wasOpen = !picker.querySelector('.gift-picker-panel')?.classList.contains('hidden');
        closeAllGiftPickers();
        if (!wasOpen) {
          openGiftPickerPanel(picker);
        }
        return;
      }

      const pickerItem = event.target.closest('.gift-picker-item');
      if (pickerItem) {
        const picker = pickerItem.closest('.gift-picker');
        selectGiftInPicker(picker, pickerItem.dataset.giftName);
        closeAllGiftPickers();
      }
    });

    dominancePowersConfigTable.addEventListener('input', (event) => {
      if (!event.target.matches('.gift-picker-filter-name, .gift-picker-filter-min, .gift-picker-filter-max')) return;
      const picker = event.target.closest('.gift-picker');
      if (picker) refreshGiftPickerList(picker);
    });
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.gift-picker')) {
      closeAllGiftPickers();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllGiftPickers();
  });

  if (dominanceConnectLiveBtn) {
    dominanceConnectLiveBtn.addEventListener('click', () => connectTikTokLive());
  }

  if (dominanceDisconnectBtn) {
    dominanceDisconnectBtn.addEventListener('click', () => disconnectTikTokLive());
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
  try {
    bindUIActions();
    await restoreLinkedTiktokUsername();
    await loadDominanceState();
    initializeCombatEngine();
    startSoldiersAnimation();
    startDominanceCenterTimer();
  } finally {
    document.getElementById('pageLoader')?.setAttribute('hidden', '');
  }
});
