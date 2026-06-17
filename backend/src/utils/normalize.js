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
    settings: { rows: 14, cols: 14, tickMs: 450 },
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

function sanitizeRaceGameState(payload) {
  const participants = Array.isArray(payload?.participants) ? payload.participants.slice(0, 20).map(sanitizeRaceParticipant) : [];

  return {
    participants,
    car_positions: payload?.car_positions || {},
    finish_counts: payload?.finish_counts || {},
    viewer_bindings: payload?.viewer_bindings || {},
    history: Array.isArray(payload?.history) ? payload.history.slice(0, 100) : [],
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

function sanitizeDominanceGameState(payload) {
  const teams = Array.isArray(payload?.teams)
    ? payload.teams.slice(0, 20).map(sanitizeDominanceTeam)
    : [sanitizeDominanceTeam({}, 0), sanitizeDominanceTeam({}, 1)];
  const teamIds = new Set(teams.map((team) => team.id));

  return {
    teams,
    active_team_id: teamIds.has(payload?.active_team_id) ? String(payload.active_team_id) : teams[0]?.id,
    round: Math.max(1, Number(payload?.round || 1) || 1),
    winner_team_id: payload?.winner_team_id && teamIds.has(payload.winner_team_id) ? String(payload.winner_team_id) : null,
    history: Array.isArray(payload?.history) ? payload.history.slice(0, 100).map(sanitizeDominanceHistoryEntry) : [],
    viewer_bindings: typeof payload?.viewer_bindings === 'object' && payload.viewer_bindings !== null ? payload.viewer_bindings : {},
    soldiers: Array.isArray(payload?.soldiers) ? payload.soldiers.slice(0, 300).map((s, i) => ({
      id: String(s?.id || `soldier-${i + 1}`),
      uniqueId: String(s?.uniqueId || s?.id || '').trim(),
      nickname: String(s?.nickname || '').trim().slice(0, 120),
      avatarData: s?.avatarData ? String(s.avatarData).slice(0, 1000) : null,
      teamId: s?.teamId && teamIds.has(s.teamId) ? s.teamId : null,
    })) : [],
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
