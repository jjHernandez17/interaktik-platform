// GTA V "Rampa Imposible": el jugador aparece en un mapa de containers y tiene que subir una rampa mientras los
// regalos de TikTok hacen caer carros, camiones y objetos desde arriba. Un mod aparte de ScriptHookVDotNet
// (gta-ramp-mod/) se conecta por WebSocket (gtaRampBridge.js). Comparte la llave con GTA V modo historia (gta_config).
//
// El catalogo vive aqui: cada "id" lo implementa el mod (gta-ramp-mod/InteraktikRampa.cs, tabla Spawners).

const { EventEmitter } = require('events');
const pool = require('../database/pool');
const gtaService = require('./gtaService');

const ACTION_GROUPS = [
  { id: 'vehicles', label: 'Vehículos que caen' },
  { id: 'heavy', label: 'Pesados' },
  { id: 'objects', label: 'Objetos que ruedan' },
];

function item(id, group, label, max, def) {
  return { id, group, label, unit: 'cantidad', min: 1, max, def };
}

const ACTIONS = [
  // ----- Vehículos
  item('ramp_car_small', 'vehicles', 'Carro pequeño', 8, 1),
  item('ramp_car_sport', 'vehicles', 'Deportivo', 8, 1),
  item('ramp_car_muscle', 'vehicles', 'Muscle car', 8, 1),
  item('ramp_suv', 'vehicles', 'Camioneta SUV', 8, 1),
  item('ramp_van', 'vehicles', 'Van', 6, 1),
  item('ramp_limo', 'vehicles', 'Limusina', 5, 1),
  item('ramp_bike', 'vehicles', 'Moto', 8, 2),
  item('ramp_tractor', 'vehicles', 'Tractor', 5, 1),
  item('ramp_forklift', 'vehicles', 'Montacargas', 5, 1),
  // ----- Pesados
  item('ramp_bus', 'heavy', 'Autobús', 4, 1),
  item('ramp_truck', 'heavy', 'Camión de carga', 4, 1),
  item('ramp_hauler', 'heavy', 'Tractocamión', 3, 1),
  item('ramp_dump', 'heavy', 'Volquete gigante', 3, 1),
  item('ramp_mixer', 'heavy', 'Mezcladora de cemento', 3, 1),
  item('ramp_garbage', 'heavy', 'Camión de basura', 3, 1),
  item('ramp_firetruck', 'heavy', 'Camión de bomberos', 3, 1),
  item('ramp_bulldozer', 'heavy', 'Bulldozer', 2, 1),
  item('ramp_monster', 'heavy', 'Monster truck', 3, 1),
  item('ramp_tank', 'heavy', 'Tanque de guerra', 2, 1),
  // ----- Objetos
  item('ramp_barrels', 'objects', 'Barriles', 40, 8),
  item('ramp_explosive_barrels', 'objects', 'Barriles explosivos', 25, 5),
  item('ramp_dumpsters', 'objects', 'Contenedores de basura', 20, 4),
  item('ramp_crates', 'objects', 'Cajas de madera', 40, 10),
  item('ramp_boulders', 'objects', 'Rocas', 20, 5),
  item('ramp_fridges', 'objects', 'Máquinas expendedoras', 15, 3),
  item('ramp_hay', 'objects', 'Pacas de heno', 30, 6),
  item('ramp_cones', 'objects', 'Conos de tráfico', 40, 12),
];

const ACTION_BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));
const MAX_PER_EVENT = 40; // lo mismo que acepta el mod por evento

const events = new EventEmitter(); // 'queued' (userId), 'keyChanged' (userId, via gtaService), 'settingsChanged' (userId)
const giftRuleCache = new Map();

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function listActions() {
  return { groups: ACTION_GROUPS, actions: ACTIONS };
}

function clampAmount(action, value) {
  const parsed = Math.round(Number(value));
  const base = Number.isFinite(parsed) ? parsed : action.def;
  return Math.min(action.max, Math.max(action.min, base));
}

// ----- marcador de wins (objetivo y wins actuales, ambos admiten negativos)

const MAX_WINS = 1000000;

function cleanInt(value, label) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || Math.abs(number) > MAX_WINS) {
    throw badRequest(`${label} debe estar entre -${MAX_WINS} y ${MAX_WINS}.`);
  }
  return number;
}

async function getSettings(userId) {
  const result = await pool.query('SELECT win_goal AS goal, wins FROM gtaramp_settings WHERE user_id = $1', [userId]);
  return result.rowCount > 0 ? result.rows[0] : { goal: 10, wins: 0 };
}

// Solo cambia lo que llega (el objetivo, los wins o ambos)
async function saveSettings(userId, { goal, wins }) {
  const current = await getSettings(userId);
  const next = {
    goal: goal === undefined || goal === null || goal === '' ? current.goal : cleanInt(goal, 'El objetivo de wins'),
    wins: wins === undefined || wins === null || wins === '' ? current.wins : cleanInt(wins, 'Los wins'),
  };
  await pool.query(
    `INSERT INTO gtaramp_settings (user_id, win_goal, wins) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET win_goal = EXCLUDED.win_goal, wins = EXCLUDED.wins, updated_at = NOW()`,
    [userId, next.goal, next.wins],
  );
  events.emit('settingsChanged', userId);
  return next;
}

// El mod avisa que el jugador llego arriba: +1 win
async function addWin(userId) {
  const result = await pool.query(
    `INSERT INTO gtaramp_settings (user_id, win_goal, wins) VALUES ($1, 10, 1)
     ON CONFLICT (user_id) DO UPDATE SET wins = LEAST(gtaramp_settings.wins + 1, $2), updated_at = NOW()
     RETURNING win_goal AS goal, wins`,
    [userId, MAX_WINS],
  );
  events.emit('settingsChanged', userId);
  return result.rows[0];
}

// ----- reglas regalo -> accion

function invalidateGiftRuleCache(userId) {
  giftRuleCache.delete(Number(userId));
}

async function listGiftRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, action, amount, created_at
     FROM gtaramp_gift_rules WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows;
}

async function getGiftRulesByGiftId(userId) {
  const cached = giftRuleCache.get(Number(userId));
  if (cached) return cached;
  const result = await pool.query('SELECT gift_id, action, amount FROM gtaramp_gift_rules WHERE user_id = $1', [userId]);
  const byGiftId = new Map(result.rows.map((row) => [String(row.gift_id), row]));
  giftRuleCache.set(Number(userId), byGiftId);
  return byGiftId;
}

async function upsertGiftRule(userId, { giftId, giftName, giftImageUrl, action, amount }) {
  const cleanGiftId = String(giftId || '').trim().slice(0, 60);
  const cleanGiftName = String(giftName || '').trim().slice(0, 120);
  const cleanAction = String(action || '').trim();
  if (!cleanGiftId || !cleanGiftName) throw badRequest('Debes seleccionar un regalo.');

  const definition = ACTION_BY_ID.get(cleanAction);
  if (!definition) throw badRequest('Accion no valida.');

  const result = await pool.query(
    `INSERT INTO gtaramp_gift_rules (user_id, gift_id, gift_name, gift_image_url, action, amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET
       gift_name = EXCLUDED.gift_name, gift_image_url = EXCLUDED.gift_image_url,
       action = EXCLUDED.action, amount = EXCLUDED.amount, updated_at = NOW()
     RETURNING id, gift_id, gift_name, gift_image_url, action, amount, created_at`,
    [userId, cleanGiftId, cleanGiftName, giftImageUrl || null, cleanAction, clampAmount(definition, amount)],
  );
  invalidateGiftRuleCache(userId);
  return result.rows[0];
}

async function deleteGiftRule(userId, ruleId) {
  await pool.query('DELETE FROM gtaramp_gift_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
  invalidateGiftRuleCache(userId);
}

async function enqueueAction(userId, { uniqueId, nickname, action, amount }) {
  await pool.query(
    `INSERT INTO gtaramp_action_queue (user_id, tiktok_unique_id, tiktok_nickname, action, amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, String(uniqueId).slice(0, 120), String(nickname).slice(0, 120), action, amount],
  );
  events.emit('queued', userId);
}

// tiktokLiveManager ya junta los combos: llega UN evento por regalo (repeatCount = total del combo)
async function handleGift(userId, { giftId, repeatCount, user } = {}) {
  if (!giftId) return;
  const rule = (await getGiftRulesByGiftId(userId)).get(String(giftId));
  if (!rule) return;
  if (!ACTION_BY_ID.has(rule.action)) return;

  const uniqueId = String(user?.uniqueId || '').trim() || 'espectador';
  const nickname = String(user?.nickname || uniqueId);
  const units = Math.max(1, Math.round(Number(repeatCount) || 1));
  const amount = Math.min(MAX_PER_EVENT, Number(rule.amount) * units);
  await enqueueAction(userId, { uniqueId, nickname, action: rule.action, amount });
}

async function enqueueTestAction(userId, ruleId) {
  const result = await pool.query('SELECT action, amount FROM gtaramp_gift_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
  if (result.rowCount === 0) {
    const error = new Error('Regla no encontrada.');
    error.status = 404;
    throw error;
  }
  const rule = result.rows[0];
  await enqueueAction(userId, { uniqueId: 'test-user', nickname: 'Prueba', action: rule.action, amount: Math.min(MAX_PER_EVENT, rule.amount) });
}

// Entrega (y marca como enviadas) las acciones pendientes del usuario
async function pollActionQueue(userId, { limit = 20 } = {}) {
  const result = await pool.query(
    `UPDATE gtaramp_action_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM gtaramp_action_queue
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2
     )
     RETURNING id, tiktok_unique_id, tiktok_nickname, action, amount, created_at`,
    [userId, limit],
  );
  return result.rows;
}

function labelFor(actionId) {
  return ACTION_BY_ID.get(actionId)?.label || actionId;
}

module.exports = {
  events,
  ACTIONS,
  MAX_WINS,
  listActions,
  labelFor,
  getSettings,
  saveSettings,
  addWin,
  listGiftRules,
  upsertGiftRule,
  deleteGiftRule,
  handleGift,
  enqueueTestAction,
  pollActionQueue,
  // la llave se comparte con GTA V modo historia
  getOrCreateConfig: gtaService.getOrCreateConfig,
  regenerateServerKey: gtaService.regenerateServerKey,
  resolveByServerKey: gtaService.resolveByServerKey,
  keyEvents: gtaService.events,
};
