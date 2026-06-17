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

const leftArmy = document.getElementById('leftArmy');
const rightArmy = document.getElementById('rightArmy');

const leftHealth = document.getElementById('leftHealth');
const rightHealth = document.getElementById('rightHealth');

const leftTeamName = document.getElementById('leftTeamName');
const rightTeamName = document.getElementById('rightTeamName');

let dominanceState = {

  teams: {

    left: {
      id: 'left',
      name: 'Titanes',
      color: '#ef4444',
      health: 10000,
      maxHealth: 10000,
      backgroundImage: ''
    },

    right: {
      id: 'right',
      name: 'Imperio',
      color: '#3b82f6',
      health: 10000,
      maxHealth: 10000,
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

  winner: null,

  live: {
    status: 'disconnected',
    message: 'Sin conexión activa.',
    error: '',
  },

};

let liveEventsSource = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function renderHealth() {

  leftHealth.textContent =
    `${dominanceState.teams.left.health} HP`;

  rightHealth.textContent =
    `${dominanceState.teams.right.health} HP`;

}


function renderTeamNames() {

  leftTeamName.value =
    dominanceState.teams.left.name;

  rightTeamName.value =
    dominanceState.teams.right.name;

}

function renderSoldiers() {

  leftArmy.innerHTML = '';
  rightArmy.innerHTML = '';

  dominanceState.soldiers.left.forEach((soldier) => {

    const element = document.createElement('div');

    element.className = 'soldier';

    element.style.left =
      `${soldier.x}px`;

    element.style.top =
      `${soldier.y}px`;

    element.innerHTML = `
      <img
        src="${soldier.avatarData || 'assets/img/default-avatar.png'}"
        alt=""
      >
    `;

    leftArmy.appendChild(element);

  });

  dominanceState.soldiers.right.forEach((soldier) => {

    const element = document.createElement('div');

    element.className = 'soldier';

    element.style.left =
      `${soldier.x}px`;

    element.style.top =
      `${soldier.y}px`;

    element.innerHTML = `
      <img
        src="${soldier.avatarData || 'assets/img/default-avatar.png'}"
        alt=""
      >
    `;

    rightArmy.appendChild(element);

  });

}

function updateDominanceSummary() {
  const winnerText = dominanceState.winner_team_id ? ` · Ganador: ${getTeamById(dominanceState.winner_team_id)?.name || 'Desconocido'}` : '';
  dominanceSummary.textContent = `${dominanceState.teams.length} equipos · Ronda ${dominanceState.round}${winnerText}`;
}

function renderTeams() {

  renderHealth();

  leftArmy.innerHTML = '';
  rightArmy.innerHTML = '';

  dominanceState.soldiers.left.forEach((soldier) => {

    const element = document.createElement('div');

    element.className = 'soldier';

    element.style.left =
      `${soldier.x || 0}px`;

    element.style.top =
      `${soldier.y || 0}px`;

    element.innerHTML = `
      <img
        src="${soldier.avatarData || 'assets/img/default-avatar.png'}"
        alt=""
      >
    `;

    leftArmy.appendChild(element);

  });

  dominanceState.soldiers.right.forEach((soldier) => {

    const element = document.createElement('div');

    element.className = 'soldier';

    element.style.left =
      `${soldier.x || 0}px`;

    element.style.top =
      `${soldier.y || 0}px`;

    element.innerHTML = `
      <img
        src="${soldier.avatarData || 'assets/img/default-avatar.png'}"
        alt=""
      >
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

function resetGame() {
  dominanceState = {
    teams: [
      { id: 'team-1', name: 'Equipo Morado', color: '#8b5cf6', life: 100, attack: 12, alive: true },
      { id: 'team-2', name: 'Equipo Azul', color: '#06b6d4', life: 100, attack: 12, alive: true },
    ],
    active_team_id: 'team-1',
    round: 1,
    winner_team_id: null,
    history: [],
    viewer_bindings: {},
    soldiers: [],
    live: dominanceState.live,
  };
  updateArenaMessage('Partida reiniciada. Conecta al live y recluta aliados.', false);
  renderState();
}

function clearHistory() {
  dominanceState.history = [];
  updateArenaMessage('Bitácora limpia. Esperando el siguiente evento...', false);
  renderState();
}

async function saveDominanceState() {
  const payload = {
    teams: dominanceState.teams,
    active_team_id: dominanceState.active_team_id,
    round: dominanceState.round,
    winner_team_id: dominanceState.winner_team_id,
    history: dominanceState.history,
    viewer_bindings: dominanceState.viewer_bindings,
    soldiers: dominanceState.soldiers,
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

async function loadDominanceState() {
  try {
    const response = await fetch('/api/dominance/state');
    if (!response.ok) {
      throw new Error('No se pudo cargar el estado.');
    }

    const payload = await response.json();
    dominanceState = {
      ...dominanceState,
      ...payload,
      live: dominanceState.live,
    };
  } catch (error) {
    console.warn('[DOMINANCE] Load failed, using default state', error.message);
  }

  console.log(dominanceState);

  renderState();
}

function renderState() {

  renderHealth();

  renderTeamNames();

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

function connectToEvents() {
  cleanUpEvents();
  liveEventsSource = new EventSource('/events?gameType=dominance');

  liveEventsSource.addEventListener('status', (event) => {
    const payload = JSON.parse(event.data);
    setConnectionStatus(payload.status || 'disconnected', payload.message || '', payload.error || '');
    if (payload.status === 'connected') {
      updateArenaMessage('Conectado a TikTok Live. Esperando regalos y comentarios...', true);
    } else if (payload.status === 'disconnected') {
      updateArenaMessage('Desconectado. Reconecta para continuar la batalla.', false);
    }
  });

  // Comments: bind viewer to a team when they comment exactly the team name (case-insensitive)
  liveEventsSource.addEventListener('comment', (event) => {
    try {
      const payload = JSON.parse(event.data);
      const text = (payload.comment || '').trim();
      if (!text) return;
      const userId = String(payload.user?.uniqueId || payload.user?.nickname || '').trim();
      if (!userId) return;
      // find team by exact name match (case-insensitive)
      const team = dominanceState.teams.find(t => t.name && t.name.toLowerCase() === text.toLowerCase());
      if (!team) return;
      // only bind once
      if ((dominanceState.viewer_bindings || {})[userId]) return;
      dominanceState.viewer_bindings = dominanceState.viewer_bindings || {};
      dominanceState.viewer_bindings[userId] = team.id;
      // create soldier
      dominanceState.soldiers = dominanceState.soldiers || [];
      const soldier = {
        id: `soldier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        uniqueId: userId,
        nickname: payload.user?.nickname || userId,
        avatarData: payload.user?.avatar || null,
        teamId: team.id,
      };
      dominanceState.soldiers.push(soldier);
      dominanceState.history.push(createDominanceHistoryEntry(`${soldier.nickname} se unió a ${team.name}`, 'live'));
      updateArenaMessage(`${soldier.nickname} se unió a ${team.name}`, true);
      renderState();
    } catch (e) {
      // ignore
    }
  });

  liveEventsSource.addEventListener('gift', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (dominanceState.winner_team_id) return;

      const fp = buildLiveEventFingerprint(payload);
      if (hasProcessedLiveEventFingerprint(fp)) return;

      const sender = String(payload.user?.uniqueId || payload.user?.nickname || '').trim();
      if (!sender) return;

      const binding = (dominanceState.viewer_bindings || {})[sender];
      if (!binding) {
        dominanceState.history.push(createDominanceHistoryEntry(`Regalo de ${payload.user?.nickname || sender} ignorado (sin bando)`, 'live'));
        renderState();
        markLiveEventFingerprintProcessed(fp);
        return;
      }

      const attackerTeamId = binding;
      const attackerTeam = getTeamById(attackerTeamId);
      const defender = dominanceState.teams.find(t => t.id !== attackerTeamId && t.alive);
      if (!attackerTeam || !defender) return;

      const damage = Number(payload.repeatCount || payload.giftCount || 1) || 1;
      defender.life = Math.max(0, defender.life - damage);
      dominanceState.round += 1;
      dominanceState.history.push(createDominanceHistoryEntry(`${defender.name} fue atacado por ${payload.user?.nickname || sender} (-${damage})`, 'live'));
      updateArenaMessage(`${defender.name} recibió un ataque de ${payload.user?.nickname || sender} (-${damage})`, true);
      if (defender.life === 0) {
        defender.alive = false;
        dominanceState.winner_team_id = attackerTeamId;
        showVictoryModal(attackerTeamId);
      }

      markLiveEventFingerprintProcessed(fp);
      renderState();
    } catch (_error) {
      // ignore
    }
  });

  liveEventsSource.addEventListener('error', () => {
    setConnectionStatus('connecting', 'Reconectando eventos...');
  });
}

function showVictoryModal(winningTeamId) {
  const team = getTeamById(winningTeamId);
  if (!team) return;
  dominanceState.history.push(createDominanceHistoryEntry(`${team.name} ha ganado la partida`, 'system'));
  updateArenaMessage(`¡${team.name} se alzó con la victoria!`, false);
  // lightweight modal via showAppAlert
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
    dominanceResetBtn.addEventListener('click', () => {
      resetGame();
    });
  }

  if (dominanceClearHistoryBtn) {
    dominanceClearHistoryBtn.addEventListener('click', () => {
      clearHistory();
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

}

window.addEventListener('beforeunload', () => {
  cleanUpEvents();
});

window.addEventListener('DOMContentLoaded', async () => {
  bindUIActions();
  await loadDominanceState();
  updateDominanceSummary();
});
