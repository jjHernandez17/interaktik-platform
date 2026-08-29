function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeColor(value, fallback = '#8b5cf6') {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function normalizeIsoDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function normalizeError(error) {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;

  const message = String(error.message || error.info || '').trim();
  if (message) {
    if (message.startsWith('{') || message.startsWith('[')) {
      try {
        const parsed = JSON.parse(message);
        if (parsed?.message) return String(parsed.message);
        if (parsed?.name) return String(parsed.name);
        return JSON.stringify(parsed);
      } catch {
        return message;
      }
    }
    return message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Error no serializable';
  }
}

// Sanitización de juego
function sanitizeGameState(payload) {
  const rawTeams = Array.isArray(payload?.teams) ? payload.teams : [];
  const rawGifts = Array.isArray(payload?.gifts) ? payload.gifts : [];
  const rawHistory = Array.isArray(payload?.history) ? payload.history : [];

  const teams = rawTeams.slice(0, 20).map((team, index) => ({
    id: String(team?.id || `team-${index + 1}`),
    name: String(team?.name || `Equipo ${index + 1}`).trim().slice(0, 120),
    color: normalizeColor(team?.color),
    score: Number(team?.score || 0) || 0,
  }));

  const teamIds = new Set(teams.map((team) => team.id));

  const gifts = rawGifts.slice(0, 300).map((gift, index) => {
    const teamId = gift?.teamId ? String(gift.teamId) : null;
    return {
      id: String(gift?.id || `rule-${index + 1}`),
      giftId: gift?.giftId ? String(gift.giftId) : null,
      name: String(gift?.name || 'Regalo').trim().slice(0, 180),
      points: Math.max(1, Number(gift?.points || 1) || 1),
      diamondCount: Math.max(1, Number(gift?.diamondCount || 1) || 1),
      imageUrl: String(gift?.imageUrl || '').trim().slice(0, 1000),
      teamId: teamId && teamIds.has(teamId) ? teamId : null,
    };
  });

  const history = rawHistory.slice(0, 200).map((entry, index) => ({
    id: String(entry?.id || `history-${index + 1}`),
    giftName: String(entry?.giftName || 'Evento').trim().slice(0, 180),
    points: Number(entry?.points || 0) || 0,
    teamId: entry?.teamId ? String(entry.teamId) : null,
    teamName: String(entry?.teamName || '').trim().slice(0, 120),
    source: String(entry?.source || 'manual').trim().slice(0, 40),
    note: String(entry?.note || '').trim().slice(0, 400),
    createdAt: normalizeIsoDate(entry?.createdAt),
  }));

  return { teams, gifts, history };
}

function isEmptyGameState(payload) {
  return (
    (!Array.isArray(payload?.teams) || payload.teams.length === 0) &&
    (!Array.isArray(payload?.gifts) || payload.gifts.length === 0) &&
    (!Array.isArray(payload?.history) || payload.history.length === 0)
  );
}

// Snake vs Snake
function sanitizeSnakeApple(apple, index) {
  return {
    id: String(apple?.id || `apple-${index + 1}`),
    index: Math.max(0, Number(apple?.index || 0) || 0),
    value: Math.max(1, Number(apple?.value || 1) || 1),
    source: String(apple?.source || 'manual').trim().slice(0, 40),
    giftId: apple?.giftId ? String(apple.giftId).trim().slice(0, 120) : null,
    giftName: String(apple?.giftName || 'Manzana').trim().slice(0, 180),
  };
}

function sanitizeSnakePlayer(player, fallbackSide) {
  const defaults = {
    left: {
      side: 'left',
      direction: 'right',
      label: 'Serpiente1',
      color: '#8b5cf6',
      headIndex: 2,
      length: 3,
      applesEaten: 0,
      wins: 0,
    },
    right: {
      side: 'right',
      direction: 'right',
      label: 'Serpiente2',
      color: '#06b6d4',
      headIndex: 2,
      length: 3,
      applesEaten: 0,
      wins: 0,
    },
  };

  const defaultPlayer = defaults[fallbackSide || 'left'];
  const apples = Array.isArray(player?.apples) ? player.apples.slice(0, 100).map(sanitizeSnakeApple) : [];

  return {
    side: String(player?.side || defaultPlayer.side).trim().slice(0, 20),
    direction: player?.direction === 'left' ? 'left' : 'right',
    label: String(player?.label || defaultPlayer.label).trim().slice(0, 80),
    color: normalizeColor(player?.color, defaultPlayer.color),
    boardImage: player?.boardImage ? String(player.boardImage).slice(0, 5000000) : null,
    headIndex: Math.max(0, Number(player?.headIndex || defaultPlayer.headIndex) || defaultPlayer.headIndex),
    length: Math.max(3, Number(player?.length || defaultPlayer.length) || defaultPlayer.length),
    applesEaten: Math.max(0, Number(player?.applesEaten || defaultPlayer.applesEaten) || defaultPlayer.applesEaten),
    wins: Math.max(0, Number(player?.wins || defaultPlayer.wins || 0) || 0),
    finished: Boolean(player?.finished),
    apples,
  };
}

function sanitizeSnakeRule(rule, index) {
  return {
    id: String(rule?.id || `rule-${index + 1}`),
    giftId: rule?.giftId ? String(rule.giftId).trim().slice(0, 120) : null,
    giftName: String(rule?.giftName || 'Regalo').trim().slice(0, 180),
    giftImageUrl: String(rule?.giftImageUrl || '').trim().slice(0, 1000),
    giftDiamonds: Math.max(1, Number(rule?.giftDiamonds || 1) || 1),
    side: rule?.side === 'right' ? 'right' : 'left',
    apples: Math.max(1, Number(rule?.apples || 1) || 1),
    active: rule?.active !== false,
  };
}

function sanitizeSnakeHistoryEntry(entry, index) {
  return {
    id: String(entry?.id || `history-${index + 1}`),
    message: String(entry?.message || 'Evento').trim().slice(0, 240),
    side: entry?.side === 'right' ? 'right' : 'left',
    apples: Math.max(1, Number(entry?.apples || 1) || 1),
    source: String(entry?.source || 'manual').trim().slice(0, 40),
    createdAt: normalizeIsoDate(entry?.createdAt),
  };
}

function sanitizeSnakeVsSnakeState(payload) {
  const defaults = {
    settings: { rows: 14, cols: 14, tickMs: 450, boardAspectRatio: 1 },
    snakes: {
      left: {
        side: 'left',
        direction: 'right',
        label: 'Serpiente1',
        color: '#8b5cf6',
        headIndex: 2,
        length: 3,
        applesEaten: 0,
        wins: 0,
      },
      right: {
        side: 'right',
        direction: 'right',
        label: 'Serpiente2',
        color: '#06b6d4',
        headIndex: 2,
        length: 3,
        applesEaten: 0,
        wins: 0,
      },
    },
  };

  const settings = payload?.settings || {};
  const snakes = payload?.snakes || payload || {};

  return {
    settings: {
      rows: defaults.settings.rows,
      cols: defaults.settings.cols,
      tickMs: clampNumber(settings.tickMs, 60, 3000, defaults.settings.tickMs),
      boardAspectRatio: clampNumber(settings.boardAspectRatio, 0.7, 1.7, defaults.settings.boardAspectRatio),
    },
    snakes: {
      left: sanitizeSnakePlayer(snakes.left || payload?.left, 'left'),
      right: sanitizeSnakePlayer(snakes.right || payload?.right, 'right'),
    },
    rules: Array.isArray(payload?.rules) ? payload.rules.slice(0, 80).map(sanitizeSnakeRule) : [],
    history: Array.isArray(payload?.history) ? payload.history.slice(0, 200).map(sanitizeSnakeHistoryEntry) : [],
  };
}

// Race
function sanitizeRaceParticipant(participant, index) {
  return {
    id: String(participant?.id || `participant-${index + 1}`),
    name: String(participant?.name || `Participante ${index + 1}`).trim().slice(0, 120),
    carNumber: Math.max(1, Math.min(17, Number(participant?.carNumber || 1) || 1)),
    avatarData: participant?.avatarData ? String(participant.avatarData).slice(0, 500000) : undefined,
  };
}

function sanitizeRaceLikesConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    enabled: source.enabled === true,
    likesPerMove: Math.max(1, Math.min(100000, Number(source.likesPerMove) || 50)),
    movePercent: Math.max(0, Math.min(100, Number(source.movePercent) || 0)),
  };
}

function sanitizeRaceGameState(payload) {
  const participants = Array.isArray(payload?.participants) ? payload.participants.slice(0, 20).map(sanitizeRaceParticipant) : [];

  const raceLapsLimit = Math.max(1, Math.min(999, Number(payload?.race_laps_limit) || 5));

  const winnerParticipantId = participants.some((p) => p.id === payload?.winner_participant_id)
    ? String(payload.winner_participant_id)
    : null;

  return {
    participants,
    car_positions: payload?.car_positions || {},
    finish_counts: payload?.finish_counts || {},
    viewer_bindings: payload?.viewer_bindings || {},
    history: Array.isArray(payload?.history) ? payload.history.slice(0, 100) : [],
    race_laps_limit: raceLapsLimit,
    winner_participant_id: winnerParticipantId,
    likes_config: sanitizeRaceLikesConfig(payload?.likes_config),
  };
}

function sanitizeDominanceTeam(team, index) {
  const defaults = [
    { name: 'Equipo Morado', color: '#8b5cf6', life: 100, attack: 12 },
    { name: 'Equipo Azul', color: '#06b6d4', life: 100, attack: 12 },
  ];
  const defaultTeam = defaults[index] || { name: `Equipo ${index + 1}`, color: '#8b5cf6', life: 100, attack: 10 };

  return {
    id: String(team?.id || `team-${index + 1}`),
    name: String(team?.name || defaultTeam.name).trim().slice(0, 120),
    color: normalizeColor(team?.color, defaultTeam.color),
    life: Math.min(999, Math.max(0, Number(team?.life || defaultTeam.life) || defaultTeam.life)),
    attack: Math.min(100, Math.max(1, Number(team?.attack || defaultTeam.attack) || defaultTeam.attack)),
    alive: team?.alive !== false,
  };
}

function sanitizeDominanceHistoryEntry(entry, index) {
  return {
    id: String(entry?.id || `history-${index + 1}`),
    message: String(entry?.message || 'Evento').trim().slice(0, 360),
    source: String(entry?.source || 'live').trim().slice(0, 40),
    createdAt: normalizeIsoDate(entry?.createdAt),
  };
}

const VALID_PROJECTILE_TYPES = [
  'basic-bullet', 'heavy-bullet', 'rocket', 'laser', 'meteor',
  'fireball', 'bomb', 'heal-orb', 'shield-wave',
];

function sanitizeDominancePower(power, index) {
  return {
    id: String(power?.id || `power-${index + 1}-${Math.random().toString(36).slice(2, 8)}`),
    name: String(power?.name || `Poder ${index + 1}`).trim().slice(0, 40) || `Poder ${index + 1}`,
    type: power?.type === 'support' ? 'support' : 'attack',
    projectileType: VALID_PROJECTILE_TYPES.includes(power?.projectileType) ? power.projectileType : 'basic-bullet',
    color: /^#[0-9a-fA-F]{6}$/.test(power?.color || '') ? power.color : '#f59e0b',
    damage: Math.max(0, Math.min(9999, Number(power?.damage) || 0)),
    healing: Math.max(0, Math.min(9999, Number(power?.healing) || 0)),
    shield: Math.max(0, Math.min(9999, Number(power?.shield) || 0)),
    shots: Math.max(1, Math.min(20, Number(power?.shots) || 1)),
    explosionRadius: Math.max(0, Math.min(2000, Number(power?.explosionRadius) || 0)),
    projectileSpeed: Math.max(0.1, Math.min(20, Number(power?.projectileSpeed) || 1.2)),
    projectileSize: Math.max(2, Math.min(60, Number(power?.projectileSize) || 8)),
    cooldownMs: Math.max(0, Math.min(60000, Number(power?.cooldownMs) || 0)),
    animationDuration: Math.max(50, Math.min(5000, Number(power?.animationDuration) || 280)),
  };
}

function sanitizeDominancePowerBinding(binding, index) {
  const validActionTypes = ['comment', 'like', 'follow', 'gift', 'share'];
  return {
    id: String(binding?.id || `binding-${index + 1}-${Math.random().toString(36).slice(2, 8)}`),
    actionType: validActionTypes.includes(binding?.actionType) ? binding.actionType : 'like',
    actionName: String(binding?.actionName || '').trim().slice(0, 60),
    powerId: String(binding?.powerId || '').trim().slice(0, 80),
    parameterValue: Math.max(0, Math.min(999999, Number(binding?.parameterValue) || 0)),
  };
}

function sanitizeDominanceGameState(payload) {
  const gameMode =
    payload?.gameMode === 'soldier_kills'
      ? 'soldier_kills'
      : 'team_hp';

  const killsConfig = {
    victoryType:
      payload?.killsConfig?.victoryType === 'target'
        ? 'target'
        : 'time',

    durationSeconds: Math.max(
      10,
      Number(payload?.killsConfig?.durationSeconds || 120)
    ),

    targetKills: Math.max(
      1,
      Number(payload?.killsConfig?.targetKills || 20)
    ),

    soldierHp: Math.max(
      1,
      Number(payload?.killsConfig?.soldierHp || 200)
    ),

    timerStartedAt:
      typeof payload?.killsConfig?.timerStartedAt === 'string'
        ? payload.killsConfig.timerStartedAt
        : null,

    timerEndsAt:
      typeof payload?.killsConfig?.timerEndsAt === 'string'
        ? payload.killsConfig.timerEndsAt
        : null,

    isFinished: Boolean(payload?.killsConfig?.isFinished),
  };

  const leftTeam = {
    id: 'left',

    name: String(payload?.teams?.left?.name || 'Titanes')
      .trim()
      .slice(0, 50),

    color: String(
      payload?.teams?.left?.color
      || payload?.teams?.left?.backgroundColor
      || '#ef4444'
    ),

    health: Math.max(
      0,
      Number(payload?.teams?.left?.health || 10000)
    ),

    maxHealth: Math.max(
      0,
      Number(
        payload?.teams?.left?.maxHealth
        || payload?.teams?.left?.health
        || 10000
      )
    ),

    kills: Math.max(
      0,
      Number(payload?.teams?.left?.kills || 0)
    ),

    backgroundType:
      payload?.teams?.left?.backgroundType === 'image'
        ? 'image'
        : 'color',

    backgroundColor: String(
      payload?.teams?.left?.backgroundColor
      || payload?.teams?.left?.color
      || '#ef4444'
    ),

    backgroundImage:
      typeof payload?.teams?.left?.backgroundImage === 'string'
        ? payload.teams.left.backgroundImage
        : '',
  };

  const rightTeam = {
    id: 'right',

    name: String(payload?.teams?.right?.name || 'Imperio')
      .trim()
      .slice(0, 50),

    color: String(
      payload?.teams?.right?.color
      || payload?.teams?.right?.backgroundColor
      || '#3b82f6'
    ),

    health: Math.max(
      0,
      Number(payload?.teams?.right?.health || 10000)
    ),

    maxHealth: Math.max(
      0,
      Number(
        payload?.teams?.right?.maxHealth
        || payload?.teams?.right?.health
        || 10000
      )
    ),

    kills: Math.max(
      0,
      Number(payload?.teams?.right?.kills || 0)
    ),

    backgroundType:
      payload?.teams?.right?.backgroundType === 'image'
        ? 'image'
        : 'color',

    backgroundColor: String(
      payload?.teams?.right?.backgroundColor
      || payload?.teams?.right?.color
      || '#3b82f6'
    ),

    backgroundImage:
      typeof payload?.teams?.right?.backgroundImage === 'string'
        ? payload.teams.right.backgroundImage
        : '',
  };

  const soldierHp = killsConfig.soldierHp;

  function sanitizeSoldierActionCounters(counters) {
    const source = counters && typeof counters === 'object' ? counters : {};
    return {
      like: Math.max(0, Number(source.like || 0)),
      follow: Math.max(0, Number(source.follow || 0)),
      share: Math.max(0, Number(source.share || 0)),
    };
  }

  const VALID_SOLDIER_STATES = ['idle', 'walking', 'attacking', 'casting', 'dead', 'frozen', 'burning', 'poisoned', 'shielded', 'healing', 'stunned'];

  function sanitizeSoldier(soldier, side) {
    return {
      id: String(
        soldier?.id ||
        `soldier-${side}-${Math.random().toString(36).slice(2, 8)}`
      ),
      uniqueId: String(soldier?.uniqueId || '').trim().slice(0, 120),
      nickname: String(soldier?.nickname || 'Jugador').trim().slice(0, 120),
      avatarData: String(soldier?.avatarData || '').trim().slice(0, 5000),
      hp: Math.max(0, Number(soldier?.hp ?? soldierHp)),
      maxHp: Math.max(1, Number(soldier?.maxHp ?? soldierHp)),
      x: Number(soldier?.x || 0),
      y: Number(soldier?.y || 0),
      shield: Math.max(0, Number(soldier?.shield || 0)),
      giftScore: Math.max(0, Number(soldier?.giftScore || 0)),
      size: Math.max(42, Math.min(72, Number(soldier?.size || 42))),
      targetX: typeof soldier?.targetX === 'number' ? soldier.targetX : undefined,
      targetY: typeof soldier?.targetY === 'number' ? soldier.targetY : undefined,
      speed: typeof soldier?.speed === 'number' ? soldier.speed : undefined,
      isDead: Boolean(soldier?.isDead),
      state: VALID_SOLDIER_STATES.includes(soldier?.state) ? soldier.state : 'idle',
      mana: Math.max(0, Number(soldier?.mana || 0)),
      shieldEffectsCooldown: Math.max(0, Number(soldier?.shieldEffectsCooldown || 0)),
      lastAttackAt: typeof soldier?.lastAttackAt === 'string' ? soldier.lastAttackAt : null,
      actionCounters: sanitizeSoldierActionCounters(soldier?.actionCounters),
    };
  }

  return {
    gameMode,
    killsConfig,

    teams: {
      left: leftTeam,
      right: rightTeam,
    },

    soldiers: {
      left: Array.isArray(payload?.soldiers?.left)
        ? payload.soldiers.left.slice(0, 500).map((soldier) => sanitizeSoldier(soldier, 'left'))
        : [],

      right: Array.isArray(payload?.soldiers?.right)
        ? payload.soldiers.right.slice(0, 500).map((soldier) => sanitizeSoldier(soldier, 'right'))
        : [],
    },

    viewer_bindings:
      typeof payload?.viewer_bindings === 'object'
      && payload.viewer_bindings !== null
        ? payload.viewer_bindings
        : {},

    giftRules: Array.isArray(payload?.giftRules)
      ? payload.giftRules
      : [],

    history: Array.isArray(payload?.history)
      ? payload.history.slice(0, 200)
      : [],

    combat: {
      powerCatalog: Array.isArray(payload?.combat?.powerCatalog)
        ? payload.combat.powerCatalog.slice(0, 50).map((power, index) => sanitizeDominancePower(power, index))
        : [],
      powerBindings: Array.isArray(payload?.combat?.powerBindings)
        ? payload.combat.powerBindings.slice(0, 200).map((binding, index) => sanitizeDominancePowerBinding(binding, index))
        : [],
    },

    active_team_id: String(payload?.active_team_id || 'left'),

    round: Math.max(1, Number(payload?.round || 1)),

    winner_team_id: payload?.winner_team_id || null,

    winner: payload?.winner || null,
  };
}



module.exports = {
  normalizeEmail,
  normalizeColor,
  normalizeIsoDate,
  clampNumber,
  normalizeError,
  sanitizeGameState,
  isEmptyGameState,
  sanitizeSnakeApple,
  sanitizeSnakePlayer,
  sanitizeSnakeRule,
  sanitizeSnakeHistoryEntry,
  sanitizeSnakeVsSnakeState,
  sanitizeRaceParticipant,
  sanitizeRaceGameState,
  sanitizeDominanceGameState,
};
