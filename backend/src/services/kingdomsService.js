// tiktokinteractik/backend/src/services/kingdomsService.js
//
// Batalla de Reinos: guarda la configuracion y el marcador de cada usuario. El juego en si (tropas, torres,
// combate) corre en el navegador (frontend/js/kingdoms.js); aqui solo se valida y persiste el estado.

const pool = require('../database/pool');

const DEFAULT_RULE_ID = 'binding-gift-default';
const SIDES = ['left', 'right'];
const MAX_BINDINGS = 3000;
const MAX_RULES = 60;

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanText(value, max, fallback) {
  const text = String(value ?? '').trim().slice(0, max);
  return text || fallback;
}

function cleanColor(value, fallback) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function defaultState() {
  return {
    teams: {
      left: { name: 'Dragones', color: '#ef4444', keyword: '1' },
      right: { name: 'Grifos', color: '#3b82f6', keyword: '2' },
    },
    settings: {
      matchSeconds: 180,
      towerHpPercent: 100,
      maxUnitsPerSide: 120,
      gameSpeed: 1,
      restartSeconds: 8,
      autoJoin: true,
    },
    wins: { left: 0, right: 0 },
    giftRules: [{ id: DEFAULT_RULE_ID, giftName: '', unit: 'squire', amount: 1, level: 1, perCoin: true }],
    teamBindings: {},
    updated_at: null,
  };
}

function sanitizeRules(raw) {
  const list = (Array.isArray(raw) ? raw : []).slice(0, MAX_RULES).map((rule) => ({
    id: cleanText(rule?.id, 60, `binding-gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    giftName: cleanText(rule?.giftName, 120, ''),
    unit: /^[a-z_]{2,24}$/.test(String(rule?.unit || '')) ? String(rule.unit) : 'squire',
    amount: Math.round(clamp(rule?.amount, 1, 200, 1)),
    level: Math.round(clamp(rule?.level, 1, 10, 1)),
    perCoin: rule?.perCoin === true,
  }));

  if (!list.some((rule) => rule.id === DEFAULT_RULE_ID)) {
    list.unshift(defaultState().giftRules[0]);
  }
  return list;
}

function sanitizeBindings(raw) {
  const result = {};
  if (raw && typeof raw === 'object') {
    const entries = Object.entries(raw).filter(([key, value]) => key && SIDES.includes(value));
    // Si hay demasiados espectadores guardados se conservan los ultimos
    entries.slice(-MAX_BINDINGS).forEach(([key, value]) => { result[String(key).slice(0, 80)] = value; });
  }
  return result;
}

function sanitizeState(payload) {
  const base = defaultState();
  const teams = payload?.teams || {};
  const settings = payload?.settings || {};

  const leftKeyword = cleanText(teams.left?.keyword, 12, base.teams.left.keyword).toLowerCase();
  let rightKeyword = cleanText(teams.right?.keyword, 12, base.teams.right.keyword).toLowerCase();
  // Las dos palabras para unirse no pueden ser iguales
  if (rightKeyword === leftKeyword) rightKeyword = leftKeyword === '2' ? '3' : '2';

  return {
    teams: {
      left: { name: cleanText(teams.left?.name, 24, base.teams.left.name), color: cleanColor(teams.left?.color, base.teams.left.color), keyword: leftKeyword },
      right: { name: cleanText(teams.right?.name, 24, base.teams.right.name), color: cleanColor(teams.right?.color, base.teams.right.color), keyword: rightKeyword },
    },
    settings: {
      matchSeconds: Math.round(clamp(settings.matchSeconds, 60, 600, base.settings.matchSeconds)),
      towerHpPercent: Math.round(clamp(settings.towerHpPercent, 25, 400, base.settings.towerHpPercent)),
      maxUnitsPerSide: Math.round(clamp(settings.maxUnitsPerSide, 30, 250, base.settings.maxUnitsPerSide)),
      gameSpeed: clamp(settings.gameSpeed, 0.5, 2, base.settings.gameSpeed),
      restartSeconds: Math.round(clamp(settings.restartSeconds, 3, 60, base.settings.restartSeconds)),
      autoJoin: settings.autoJoin !== false,
    },
    wins: {
      left: Math.round(clamp(payload?.wins?.left, 0, 999999, 0)),
      right: Math.round(clamp(payload?.wins?.right, 0, 999999, 0)),
    },
    giftRules: sanitizeRules(payload?.giftRules),
    teamBindings: sanitizeBindings(payload?.teamBindings),
  };
}

async function loadKingdomsState(userId) {
  const result = await pool.query('SELECT state, updated_at FROM kingdoms_state WHERE user_id = $1', [userId]);
  if (result.rowCount === 0) return defaultState();

  return { ...sanitizeState(result.rows[0].state || {}), updated_at: result.rows[0].updated_at };
}

async function saveKingdomsState(userId, nextState) {
  const normalized = sanitizeState(nextState);
  const result = await pool.query(
    `INSERT INTO kingdoms_state (user_id, state, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
     RETURNING updated_at`,
    [userId, JSON.stringify(normalized)],
  );
  return { ...normalized, updated_at: result.rows[0].updated_at };
}

module.exports = { loadKingdomsState, saveKingdomsState, sanitizeState, defaultState };
