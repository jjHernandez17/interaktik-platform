// tiktokinteractik/backend/src/services/gtaService.js
//
// GTA V interactivo: los regalos de TikTok se convierten en acciones sobre el streamer
// (modo historia). No se instala nada dentro del juego: una pequeña aplicacion de Windows se
// conecta aqui (gtaBridge.js) y escribe en GTA V los TRUCOS que trae el propio juego, asi
// funciona igual en la version clasica y en la Enhanced, en Steam, Epic o Rockstar.
//
// Cada accion es uno o varios codigos de truco. Los codigos viven SOLO aqui: si alguno
// resulta incorrecto o cambia, se corrige en este archivo sin tocar la aplicacion.

const crypto = require('crypto');
const { EventEmitter } = require('events');
const pool = require('../database/pool');
const { isSuperUserEmail } = require('../middleware/auth');

const ACTION_GROUPS = [
  { id: 'annoy', label: 'Molestar' },
  { id: 'help', label: 'Ayudar' },
];

// code = truco que se escribe en el juego. repeat: si amount repite el truco (cada vez sube una
// estrella, por ejemplo). Las demas acciones se escriben una sola vez (amount fijo en 1).
const ACTIONS = [
  // ----- Molestar
  { id: 'wanted_up', group: 'annoy', label: 'Subir nivel de búsqueda', code: 'FUGITIVE', repeat: true, unit: 'estrellas', min: 1, max: 5, def: 2 },
  { id: 'skyfall', group: 'annoy', label: 'Caída libre desde el cielo', code: 'SKYFALL', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'drunk', group: 'annoy', label: 'Borrachera', code: 'LIQUOR', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'slippery', group: 'annoy', label: 'Coches resbalosos', code: 'SNOWDAY', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'garbage_truck', group: 'annoy', label: 'Camión de basura', code: 'TRASHED', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'weather', group: 'annoy', label: 'Cambiar el clima', code: 'MAKEITRAIN', unit: 'veces', min: 1, max: 1, def: 1 },
  // ----- Ayudar
  { id: 'health', group: 'help', label: 'Vida y armadura al máximo', code: 'TURTLE', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'weapons', group: 'help', label: 'Armas y munición', code: 'TOOLUP', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'invincible', group: 'help', label: 'Invencible (5 minutos)', code: 'PAINKILLER', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'wanted_clear', group: 'help', label: 'Quitar la búsqueda', code: 'LAWYERUP', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'special', group: 'help', label: 'Recargar habilidad especial', code: 'POWERUP', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'helicopter', group: 'help', label: 'Helicóptero', code: 'BUZZOFF', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'sports_car', group: 'help', label: 'Deportivo (Comet)', code: 'COMET', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'rapid_gt', group: 'help', label: 'Deportivo (Rapid GT)', code: 'RAPIDGT', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'stunt_plane', group: 'help', label: 'Avioneta acrobática', code: 'BARNSTORM', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'super_jump', group: 'help', label: 'Super salto', code: 'HOPTOIT', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'fast_run', group: 'help', label: 'Correr más rápido', code: 'CATCHME', unit: 'veces', min: 1, max: 1, def: 1 },
];

const ACTION_BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));

// 'queued' (llego una accion nueva, userId) y 'keyChanged' (se regenero la llave)
const events = new EventEmitter();

const giftRuleCache = new Map();

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

// El catalogo que ve el frontend: sin los codigos
function listActions() {
  return {
    groups: ACTION_GROUPS,
    actions: ACTIONS.map(({ id, group, label, unit, min, max, def }) => ({ id, group, label, unit, min, max, def })),
  };
}

// Lista de trucos que la aplicacion debe escribir para una accion
function cheatsFor(actionId, amount) {
  const action = ACTION_BY_ID.get(actionId);
  if (!action) return null;
  const times = action.repeat ? clampAmount(action, amount) : 1;
  return { label: action.label, codes: Array.from({ length: times }, () => action.code) };
}

function clampAmount(action, value) {
  const parsed = Math.round(Number(value));
  const base = Number.isFinite(parsed) ? parsed : action.def;
  return Math.min(action.max, Math.max(action.min, base));
}

function invalidateGiftRuleCache(userId) {
  giftRuleCache.delete(Number(userId));
}

function generateServerKey() {
  return crypto.randomBytes(24).toString('hex');
}

async function getOrCreateConfig(userId) {
  const existing = await pool.query(
    'SELECT server_key, created_at, updated_at FROM gta_config WHERE user_id = $1',
    [userId],
  );
  if (existing.rowCount > 0) return existing.rows[0];

  const inserted = await pool.query(
    `INSERT INTO gta_config (user_id, server_key)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = gta_config.updated_at
     RETURNING server_key, created_at, updated_at`,
    [userId, generateServerKey()],
  );
  return inserted.rows[0];
}

// Si la llave se filtra, se genera otra y la anterior deja de funcionar
async function regenerateServerKey(userId) {
  await getOrCreateConfig(userId);
  const result = await pool.query(
    `UPDATE gta_config SET server_key = $2, updated_at = NOW()
     WHERE user_id = $1
     RETURNING server_key, created_at, updated_at`,
    [userId, generateServerKey()],
  );
  events.emit('keyChanged', userId);
  return result.rows[0];
}

async function listGiftRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, action, amount, created_at
     FROM gta_gift_rules
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows;
}

async function getGiftRulesByGiftId(userId) {
  const cached = giftRuleCache.get(Number(userId));
  if (cached) return cached;

  const result = await pool.query(
    'SELECT gift_id, action, amount FROM gta_gift_rules WHERE user_id = $1',
    [userId],
  );
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
    `INSERT INTO gta_gift_rules (user_id, gift_id, gift_name, gift_image_url, action, amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET
       gift_name = EXCLUDED.gift_name,
       gift_image_url = EXCLUDED.gift_image_url,
       action = EXCLUDED.action,
       amount = EXCLUDED.amount,
       updated_at = NOW()
     RETURNING id, gift_id, gift_name, gift_image_url, action, amount, created_at`,
    [userId, cleanGiftId, cleanGiftName, giftImageUrl || null, cleanAction, clampAmount(definition, amount)],
  );

  invalidateGiftRuleCache(userId);
  return result.rows[0];
}

async function deleteGiftRule(userId, ruleId) {
  await pool.query('DELETE FROM gta_gift_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
  invalidateGiftRuleCache(userId);
}

async function enqueueAction(userId, { uniqueId, nickname, action, amount }) {
  await pool.query(
    `INSERT INTO gta_action_queue (user_id, tiktok_unique_id, tiktok_nickname, action, amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, String(uniqueId).slice(0, 120), String(nickname).slice(0, 120), action, amount],
  );
  events.emit('queued', userId);
}

// tiktokLiveManager descarta los mensajes intermedios de un combo: aqui llega UN evento por regalo
// (o uno final por combo con repeatCount = total). Un combo multiplica solo las acciones que se
// pueden repetir (estrellas de busqueda); las demas se escriben una sola vez.
async function handleGift(userId, { giftId, repeatCount, user } = {}) {
  if (!giftId) return;

  const rule = (await getGiftRulesByGiftId(userId)).get(String(giftId));
  if (!rule) return;

  const definition = ACTION_BY_ID.get(rule.action);
  if (!definition) return;

  const uniqueId = String(user?.uniqueId || '').trim() || 'espectador';
  const nickname = String(user?.nickname || uniqueId);
  const units = Math.max(1, Math.round(Number(repeatCount) || 1));
  const amount = definition.repeat ? Math.min(definition.max, Number(rule.amount) * units) : 1;

  await enqueueAction(userId, { uniqueId, nickname, action: rule.action, amount });
}

async function enqueueTestAction(userId, ruleId) {
  const result = await pool.query(
    'SELECT action, amount FROM gta_gift_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId],
  );

  if (result.rowCount === 0) {
    const error = new Error('Regla no encontrada.');
    error.status = 404;
    throw error;
  }

  const rule = result.rows[0];
  await enqueueAction(userId, { uniqueId: 'test-user', nickname: 'Prueba', action: rule.action, amount: rule.amount });
}

// Resuelve la llave de la aplicacion al usuario de la plataforma y verifica que tenga acceso activo
async function resolveByServerKey(serverKey) {
  const key = String(serverKey || '').trim();
  if (!/^[a-f0-9]{32,64}$/.test(key)) {
    return { found: false, hasAccess: false, userId: null };
  }

  const result = await pool.query(
    `SELECT g.user_id, au.email
     FROM gta_config g
     JOIN app_users au ON au.id = g.user_id
     WHERE g.server_key = $1`,
    [key],
  );

  if (result.rowCount === 0) {
    return { found: false, hasAccess: false, userId: null };
  }

  const { user_id: userId, email } = result.rows[0];

  if (isSuperUserEmail(email)) {
    return { found: true, hasAccess: true, userId };
  }

  const accessService = require('./accessService');
  const hasAccess = await accessService.hasActiveAccess(userId);
  return { found: true, hasAccess, userId };
}

// Entrega (y marca como enviadas) las acciones pendientes del usuario
async function pollActionQueue(userId, { limit = 20 } = {}) {
  const result = await pool.query(
    `UPDATE gta_action_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM gta_action_queue
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2
     )
     RETURNING id, tiktok_unique_id, tiktok_nickname, action, amount, created_at`,
    [userId, limit],
  );
  return result.rows;
}

module.exports = {
  events,
  ACTIONS,
  listActions,
  cheatsFor,
  getOrCreateConfig,
  regenerateServerKey,
  listGiftRules,
  upsertGiftRule,
  deleteGiftRule,
  handleGift,
  enqueueTestAction,
  resolveByServerKey,
  pollActionQueue,
};
