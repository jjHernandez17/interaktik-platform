// tiktokinteractive/frontend/js/dominance-simulation.js
//
// Simulacion de partida de Dominance para grabar videos publicitarios. Solo la ve el
// superusuario (la tarjeta nace oculta y se muestra unicamente si /api/auth/me dice
// isSuperUser). Hay un interruptor por modo de juego: al activarlo aparecen el tope
// maximo de soldados de cada equipo (MAX_SOLDIERS_PER_TEAM, definido en dominance.js:
// 40 por lado), cada uno con una foto de internet, todos lanzando poderes al azar.
//
// La simulacion NO toca la partida real: mientras esta activa, dominanceState (el
// estado de dominance.js) se cambia por una copia de pruebas, y dominance.js no guarda
// en la base de datos ni procesa eventos del live (ver window.dominanceSimulation.active
// en esos puntos). Al apagarla se restaura la partida real tal cual estaba.

(function () {
  const ABILITIES_PER_SECOND = 12; // poderes lanzados por segundo entre los dos equipos
  const GROWTH_PER_CAST = 6; // px que crece un soldado cada vez que lanza un poder
  const MAX_SOLDIER_SIZE = 130; // tamano maximo al que puede llegar
  const MIN_BUSY_MS = 1200; // un soldado no lanza otro poder hasta que termine el anterior
  const TEAM_HP = 60000; // vida de los equipos en la simulacion (se recupera al bajar del 12%)
  const KILLS_DURATION_SECONDS = 600;
  const FIRE_TICK_MS = 100;
  const MAINTENANCE_TICK_MS = 500;
  const RESPAWNS_PER_TICK = 2; // reposicion de soldados caidos en modo Kills (por equipo y por tick)
  const KILLS_MODE_SOLDIER_HP = 450; // mas vida que en una partida real: la multitud dura y se ve llena
  const SUPPORT_SHARE = 0.15; // proporcion de poderes de soporte (curacion/escudo)

  const MODE_LABELS = { team_hp: 'Vida de equipo', soldier_kills: 'Kills por soldado' };

  const card = document.getElementById('dominanceSimCard');
  const switchTeamHp = document.getElementById('dominanceSimTeamHp');
  const switchKills = document.getElementById('dominanceSimKills');
  const statusLabel = document.getElementById('dominanceSimStatus');

  const sim = {
    active: false,
    mode: null,
    realState: null,
    fireTimer: null,
    maintenanceTimer: null,
    nodes: { left: new Map(), right: new Map() },
    serial: 0,
  };

  // ---------------------------------------------------------------- soldados
  // Fotos de internet (retratos de ejemplo): hay 100 por genero, se repiten y el
  // navegador las guarda en cache, asi que no son mil descargas distintas.
  function randomAvatarUrl() {
    const gender = Math.random() < 0.5 ? 'men' : 'women';
    return `https://randomuser.me/api/portraits/thumb/${gender}/${Math.floor(Math.random() * 100)}.jpg`;
  }

  function createSimSoldier(side, soldierHp) {
    sim.serial += 1;
    const start = getRandomSoldierTarget(side);
    const next = getRandomSoldierTarget(side);

    const soldier = {
      id: `sim-${side}-${sim.serial}-${Math.random().toString(36).slice(2, 6)}`,
      uniqueId: `sim-${side}-${sim.serial}`,
      nickname: `Soldado ${sim.serial}`,
      avatarData: randomAvatarUrl(),
      side,
      hp: soldierHp,
      maxHp: soldierHp,
      shield: 0,
      giftScore: 0,
      size: 46 + Math.round(Math.random() * 20), // 46 a 66 px (con 40 por lado hay espacio de sobra)
      simBusyUntil: 0, // hasta cuando esta lanzando su poder actual
      isDead: false,
      x: start.x,
      y: start.y,
      targetX: next.x,
      targetY: next.y,
      speed: 0.25 + Math.random() * 0.35,
    };

    soldier.simBaseSize = soldier.size;
    soldier.simTargetSize = soldier.size;

    return window.DominanceCombat?.soldierState?.createSoldierCombatState
      ? window.DominanceCombat.soldierState.createSoldierCombatState(soldier, side)
      : soldier;
  }

  function soldierHpForMode(mode) {
    if (mode === 'soldier_kills') {
      return Math.max(KILLS_MODE_SOLDIER_HP, Number(sim.realState?.killsConfig?.soldierHp || 0));
    }
    return TEAM_HP_MODE_SOLDIER_HP_POOL;
  }

  // ---------------------------------------------------------------- dibujo
  // dominance.js vuelve a crear todos los soldados en cada fotograma; con 1000 eso seria
  // inviable, asi que durante la simulacion se reutilizan los mismos elementos y solo
  // se actualiza su posicion.
  function renderSide(side, container) {
    const soldiers = dominanceState.soldiers[side] || [];
    const nodes = sim.nodes[side];
    const seen = new Set();
    const killsMode = dominanceState.gameMode === 'soldier_kills';

    soldiers.forEach((soldier) => {
      seen.add(soldier.id);
      let node = nodes.get(soldier.id);

      if (!node) {
        node = document.createElement('div');
        node.className = 'soldier';
        node.dataset.soldierId = soldier.id;
        node.innerHTML = `
          <div class="soldier-avatar"><img alt="" decoding="async"></div>
          <div class="soldier-hp"><div class="soldier-hp-fill"></div></div>`;
        const img = node.querySelector('img');
        img.onerror = () => {
          img.onerror = null;
          img.src = 'assets/img/default-avatar.png';
        };
        img.src = soldier.avatarData;
        container.appendChild(node);
        nodes.set(soldier.id, node);
      }

      // Crece suavemente hacia el tamano que le dan sus poderes lanzados
      if (soldier.simTargetSize && Math.abs(soldier.simTargetSize - soldier.size) > 0.1) {
        soldier.size += (soldier.simTargetSize - soldier.size) * 0.06;
      }

      const size = soldier.size || 36;
      node.style.left = `${soldier.x}px`;
      node.style.top = `${soldier.y}px`;
      node.style.width = `${size}px`;
      const avatar = node.firstElementChild;
      avatar.style.width = `${size}px`;
      avatar.style.height = `${size}px`;

      if (killsMode) {
        const percent = getSoldierHpPercent(soldier);
        const fill = node.lastElementChild.firstElementChild;
        fill.style.width = `${percent}%`;
        fill.style.background = getSoldierHpColor(percent);
      }
    });

    nodes.forEach((node, id) => {
      if (!seen.has(id)) {
        node.remove();
        nodes.delete(id);
      }
    });
  }

  function renderSoldiers() {
    renderSide('left', leftArmy);
    renderSide('right', rightArmy);
  }

  // ---------------------------------------------------------------- combate
  // Soldados vivos que NO estan lanzando un poder en este momento: cada soldado solo
  // puede tener un poder a la vez
  function readySoldiers(side, now) {
    return (dominanceState.soldiers[side] || []).filter(
      (soldier) => soldier && !soldier.isDead && (soldier.simBusyUntil || 0) <= now
    );
  }

  function pickAbility(catalog) {
    const supports = catalog.filter((ability) => ability.type === 'support');
    const attacks = catalog.filter((ability) => ability.type !== 'support');
    const pool = Math.random() < SUPPORT_SHARE && supports.length ? supports : attacks;
    return pool[Math.floor(Math.random() * pool.length)] || catalog[0];
  }

  function fireTick() {
    if (!sim.active) return;
    const engine = (typeof combatEngine !== 'undefined' && combatEngine) || window.DominanceCombat?.getCombatEngine?.();
    if (!engine) return;

    const catalog = window.DominanceCombat?.abilities?.createAbilityCatalog?.() || [];
    if (!catalog.length) return;

    // Cantidad de poderes de este instante (promedia ABILITIES_PER_SECOND)
    const shots = Math.floor((ABILITIES_PER_SECOND * FIRE_TICK_MS) / 1000 + Math.random());

    const now = Date.now();

    for (let i = 0; i < shots; i += 1) {
      const side = Math.random() < 0.5 ? 'left' : 'right';
      const ready = readySoldiers(side, now);
      if (!ready.length) continue;

      const soldier = ready[Math.floor(Math.random() * ready.length)];
      const ability = pickAbility(catalog);

      // shots: 1 -> un poder = un proyectil (Lluvia de meteoros, Tormenta laser y Bombardeo
      // lanzan 3 a 6 a la vez por diseno, y parecia un soldado disparando varios poderes)
      engine.queueAbility(soldier.id, ability.id, null, { shots: 1 });
      soldier.simBusyUntil = now + Math.max(MIN_BUSY_MS, Number(ability.cooldownMs || 0) + 600);

      // Cada poder lanzado lo hace crecer mas
      soldier.giftScore = Number(soldier.giftScore || 0) + 1;
      soldier.simTargetSize = Math.min(
        MAX_SOLDIER_SIZE,
        (soldier.simBaseSize || soldier.size) + soldier.giftScore * GROWTH_PER_CAST
      );

      if (dominanceState.gameMode === 'team_hp') {
        applyPowerToTeams(side, ability.id, 0, soldier.nickname);
      }
    }

    if (dominanceState.gameMode === 'team_hp') {
      renderHealth();
    }
  }

  function maintenanceTick() {
    if (!sim.active) return;

    // La historia crece con cada poder: no se muestra, pero no debe acumularse
    if (dominanceState.history.length > 30) {
      dominanceState.history.splice(0, dominanceState.history.length - 30);
    }
    dominanceState.winner_team_id = null;
    dominanceState.winner = null;

    if (dominanceState.gameMode === 'team_hp') {
      // Que la simulacion pueda durar lo que haga falta para grabar: si un equipo
      // casi cae, se recupera (nunca se muestra la pantalla de victoria)
      ['left', 'right'].forEach((side) => {
        const team = dominanceState.teams[side];
        if (Number(team.health) < Number(team.maxHealth) * 0.12) {
          team.health = team.maxHealth;
        }
      });
      renderHealth();
      return;
    }

    // Modo Kills: los caidos se reponen para mantener el campo lleno
    const soldierHp = soldierHpForMode('soldier_kills');
    ['left', 'right'].forEach((side) => {
      const list = dominanceState.soldiers[side];
      for (let i = 0; i < RESPAWNS_PER_TICK && list.length < MAX_SOLDIERS_PER_TEAM; i += 1) {
        list.push(createSimSoldier(side, soldierHp));
      }
    });

    // El cronometro de la partida no debe terminar nunca durante la simulacion
    const cfg = dominanceState.killsConfig;
    const endsAt = cfg.timerEndsAt ? new Date(cfg.timerEndsAt).getTime() : 0;
    if (endsAt - Date.now() < 60000) {
      cfg.timerEndsAt = new Date(Date.now() + KILLS_DURATION_SECONDS * 1000).toISOString();
    }
  }

  // ---------------------------------------------------------------- activar / apagar
  function setControls(disabled) {
    const modeSelect = document.getElementById('dominanceGameMode');
    if (modeSelect) modeSelect.disabled = disabled;
    document.body.classList.toggle('dominance-sim', disabled);
  }

  function updateStatus() {
    if (switchTeamHp) switchTeamHp.checked = sim.active && sim.mode === 'team_hp';
    if (switchKills) switchKills.checked = sim.active && sim.mode === 'soldier_kills';
    if (!statusLabel) return;

    statusLabel.textContent = sim.active
      ? `Simulación activa — ${MODE_LABELS[sim.mode]} · ${MAX_SOLDIERS_PER_TEAM} vs ${MAX_SOLDIERS_PER_TEAM} soldados. La partida real no se modifica ni se guarda.`
      : 'Apagada. Activa un modo para ver una partida de ejemplo con el máximo de soldados.';
  }

  function stop() {
    if (!sim.active) return;

    clearInterval(sim.fireTimer);
    clearInterval(sim.maintenanceTimer);
    sim.fireTimer = null;
    sim.maintenanceTimer = null;

    const engine = (typeof combatEngine !== 'undefined' && combatEngine) || window.DominanceCombat?.getCombatEngine?.();
    engine?.clear?.();
    if (dominanceProjectileLayer) dominanceProjectileLayer.innerHTML = '';

    dominanceState = sim.realState;
    sim.realState = null;
    sim.active = false;
    sim.mode = null;
    sim.nodes.left.clear();
    sim.nodes.right.clear();
    leftArmy.innerHTML = '';
    rightArmy.innerHTML = '';

    setControls(false);
    updateStatus();
    renderState();
  }

  function start(mode) {
    if (sim.active) stop();
    if (mode !== 'team_hp' && mode !== 'soldier_kills') return;

    sim.realState = dominanceState;
    const real = sim.realState;
    const base = createInitialDominanceState();
    const killsMode = mode === 'soldier_kills';

    const simTeam = (side) => ({
      ...real.teams[side],
      health: TEAM_HP,
      maxHealth: TEAM_HP,
      kills: 0,
    });

    dominanceState = {
      ...base,
      gameMode: mode,
      killsConfig: {
        ...base.killsConfig,
        ...(real.killsConfig || {}),
        victoryType: 'time',
        durationSeconds: KILLS_DURATION_SECONDS,
        timerStartedAt: new Date().toISOString(),
        timerEndsAt: new Date(Date.now() + KILLS_DURATION_SECONDS * 1000).toISOString(),
        isFinished: false,
      },
      killsCombatStarted: killsMode,
      teams: { left: simTeam('left'), right: simTeam('right') },
      soldiers: { left: [], right: [] },
      viewer_bindings: {},
      history: [],
      combat: real.combat,
      live: real.live,
    };

    sim.active = true;
    sim.mode = mode;
    sim.nodes.left.clear();
    sim.nodes.right.clear();
    leftArmy.innerHTML = '';
    rightArmy.innerHTML = '';

    const soldierHp = soldierHpForMode(mode);
    ['left', 'right'].forEach((side) => {
      for (let i = 0; i < MAX_SOLDIERS_PER_TEAM; i += 1) {
        dominanceState.soldiers[side].push(createSimSoldier(side, soldierHp));
      }
    });

    setControls(true);
    updateStatus();
    updateArenaMessage('Simulación de partida en curso.', true);
    renderState();

    sim.fireTimer = setInterval(fireTick, FIRE_TICK_MS);
    sim.maintenanceTimer = setInterval(maintenanceTick, MAINTENANCE_TICK_MS);
  }

  // ---------------------------------------------------------------- interfaz
  function bindSwitch(input, mode, other) {
    if (!input) return;
    input.addEventListener('change', () => {
      if (input.checked) {
        if (other) other.checked = false;
        start(mode);
      } else if (sim.active && sim.mode === mode) {
        stop();
      }
    });
  }

  async function revealForSuperUser() {
    if (!card) return;
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.user?.isSuperUser) return;
    } catch (error) {
      return;
    }

    card.hidden = false;
    bindSwitch(switchTeamHp, 'team_hp', switchKills);
    bindSwitch(switchKills, 'soldier_kills', switchTeamHp);
    updateStatus();
  }

  window.dominanceSimulation = {
    get active() {
      return sim.active;
    },
    renderSoldiers,
    stop,
  };

  window.addEventListener('beforeunload', stop);
  window.addEventListener('DOMContentLoaded', revealForSuperUser);
})();
