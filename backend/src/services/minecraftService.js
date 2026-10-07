// tiktokinteractik/backend/src/services/minecraftService.js
//
// Minecraft interactivo: los regalos de TikTok se convierten en acciones (mobs, TNT,
// efectos, items...) que se ejecutan sobre el streamer dentro de su servidor de
// Minecraft. Un plugin del servidor consulta la cola por HTTP con una llave secreta
// (server_key), mismo patron que robloxParkourService pero sin vinculacion de ID: aqui
// la llave es la que identifica al usuario.

const crypto = require('crypto');
const { EventEmitter } = require('events');
const pool = require('../database/pool');
const { isSuperUserEmail } = require('../middleware/auth');

// Catalogo de acciones: fuente unica. El frontend lo pide a GET /minecraft/actions y el
// plugin implementa cada "id" (ver minecraft-plugin/). amount = cantidad, segundos, niveles
// o bloques segun "unit".
const ACTION_GROUPS = [
  { id: 'annoy', label: 'Molestar' },
  { id: 'help', label: 'Ayudar' },
];

const ACTIONS = [
  // ----- Molestar
  { id: 'zombie', group: 'annoy', label: 'Zombies', unit: 'cantidad', min: 1, max: 20, def: 3 },
  { id: 'creeper', group: 'annoy', label: 'Creepers', unit: 'cantidad', min: 1, max: 10, def: 2 },
  { id: 'skeleton', group: 'annoy', label: 'Esqueletos', unit: 'cantidad', min: 1, max: 20, def: 3 },
  { id: 'spider', group: 'annoy', label: 'Arañas', unit: 'cantidad', min: 1, max: 20, def: 3 },
  { id: 'enderman', group: 'annoy', label: 'Endermans', unit: 'cantidad', min: 1, max: 5, def: 1 },
  { id: 'tnt', group: 'annoy', label: 'TNT encendido', unit: 'cantidad', min: 1, max: 15, def: 3 },
  { id: 'lightning', group: 'annoy', label: 'Rayos', unit: 'cantidad', min: 1, max: 10, def: 2 },
  { id: 'arrows', group: 'annoy', label: 'Lluvia de flechas', unit: 'cantidad', min: 1, max: 60, def: 15 },
  { id: 'launch', group: 'annoy', label: 'Lanzar por los aires', unit: 'fuerza', min: 1, max: 30, def: 10 },
  { id: 'teleport', group: 'annoy', label: 'Teletransporte al azar', unit: 'bloques', min: 5, max: 100, def: 30 },
  { id: 'fire', group: 'annoy', label: 'Prender fuego', unit: 'segundos', min: 1, max: 30, def: 5 },
  { id: 'blindness', group: 'annoy', label: 'Ceguera', unit: 'segundos', min: 1, max: 120, def: 10 },
  { id: 'slowness', group: 'annoy', label: 'Lentitud', unit: 'segundos', min: 1, max: 120, def: 15 },
  { id: 'nausea', group: 'annoy', label: 'Mareo', unit: 'segundos', min: 1, max: 120, def: 15 },
  { id: 'levitation', group: 'annoy', label: 'Levitación', unit: 'segundos', min: 1, max: 30, def: 5 },
  // ----- Ayudar
  { id: 'heal', group: 'help', label: 'Curar y alimentar', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'golden_apple', group: 'help', label: 'Manzanas doradas', unit: 'cantidad', min: 1, max: 16, def: 2 },
  { id: 'food', group: 'help', label: 'Carne cocinada', unit: 'cantidad', min: 1, max: 64, def: 16 },
  { id: 'diamond', group: 'help', label: 'Diamantes', unit: 'cantidad', min: 1, max: 64, def: 3 },
  { id: 'armor', group: 'help', label: 'Armadura de hierro', unit: 'veces', min: 1, max: 1, def: 1 },
  { id: 'xp', group: 'help', label: 'Niveles de experiencia', unit: 'niveles', min: 1, max: 50, def: 5 },
  { id: 'iron_golem', group: 'help', label: 'Golem de hierro aliado', unit: 'cantidad', min: 1, max: 3, def: 1 },
  { id: 'wolves', group: 'help', label: 'Lobos domados', unit: 'cantidad', min: 1, max: 5, def: 2 },
  { id: 'speed', group: 'help', label: 'Velocidad', unit: 'segundos', min: 1, max: 120, def: 30 },
  { id: 'strength', group: 'help', label: 'Fuerza', unit: 'segundos', min: 1, max: 120, def: 30 },
  { id: 'regeneration', group: 'help', label: 'Regeneración', unit: 'segundos', min: 1, max: 120, def: 20 },
  { id: 'jump', group: 'help', label: 'Super salto', unit: 'segundos', min: 1, max: 120, def: 30 },
];

const ACTION_BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));

// Eventos internos: 'queued' (llego una accion nueva, userId) y 'keyChanged' (se regenero la llave).
// El puente de Java (minecraftBridge.js) los escucha para entregar al instante / cerrar la conexion.
const events = new EventEmitter();

// Ultima consulta del plugin de Java por usuario (solo para mostrar el estado en el panel)
const pluginSeen = new Map(); // userId -> { at, online }

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

function invalidateGiftRuleCache(userId) {
  giftRuleCache.delete(Number(userId));
}

function generateServerKey() {
  return crypto.randomBytes(24).toString('hex');
}

async function getOrCreateConfig(userId) {
  const existing = await pool.query(
    'SELECT server_key, minecraft_username, created_at, updated_at FROM minecraft_config WHERE user_id = $1',
    [userId],
  );
  if (existing.rowCount > 0) return existing.rows[0];

  const inserted = await pool.query(
    `INSERT INTO minecraft_config (user_id, server_key)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = minecraft_config.updated_at
     RETURNING server_key, minecraft_username, created_at, updated_at`,
    [userId, generateServerKey()],
  );
  return inserted.rows[0];
}

async function setMinecraftUsername(userId, username) {
  const clean = String(username || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) {
    throw badRequest('El usuario de Minecraft debe tener de 3 a 16 caracteres: letras, numeros o guion bajo.');
  }

  await getOrCreateConfig(userId);
  const result = await pool.query(
    `UPDATE minecraft_config SET minecraft_username = $2, updated_at = NOW()
     WHERE user_id = $1
     RETURNING server_key, minecraft_username, created_at, updated_at`,
    [userId, clean],
  );
  return result.rows[0];
}

// Si la llave se filtra, se genera otra y la anterior deja de funcionar
async function regenerateServerKey(userId) {
  await getOrCreateConfig(userId);
  const result = await pool.query(
    `UPDATE minecraft_config SET server_key = $2, updated_at = NOW()
     WHERE user_id = $1
     RETURNING server_key, minecraft_username, created_at, updated_at`,
    [userId, generateServerKey()],
  );
  events.emit('keyChanged', userId);
  return result.rows[0];
}

async function listGiftRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, action, amount, created_at
     FROM minecraft_gift_rules
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
    'SELECT gift_id, action, amount FROM minecraft_gift_rules WHERE user_id = $1',
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
    `INSERT INTO minecraft_gift_rules (user_id, gift_id, gift_name, gift_image_url, action, amount)
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
  await pool.query('DELETE FROM minecraft_gift_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
  invalidateGiftRuleCache(userId);
}

async function enqueueAction(userId, { uniqueId, nickname, action, amount }) {
  await pool.query(
    `INSERT INTO minecraft_action_queue (user_id, tiktok_unique_id, tiktok_nickname, action, amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, String(uniqueId).slice(0, 120), String(nickname).slice(0, 120), action, amount],
  );
  events.emit('queued', userId);
}

// El plugin de Java avisa que esta vivo (y si el streamer esta dentro) en cada consulta
function notePluginPoll(userId, online) {
  pluginSeen.set(Number(userId), { at: Date.now(), online: Boolean(online) });
}

function getPluginStatus(userId) {
  const seen = pluginSeen.get(Number(userId));
  if (!seen) return { connected: false };
  const ageMs = Date.now() - seen.at;
  return { connected: ageMs < 15000, playerOnline: seen.online && ageMs < 15000, lastSeenSecondsAgo: Math.round(ageMs / 1000) };
}

// tiktokLiveManager ya descarta los mensajes intermedios de un combo: aqui llega UN evento
// por regalo (o uno final por combo con repeatCount = total). Un combo multiplica la cantidad
// (sin pasar del maximo de la accion).
async function handleGift(userId, { giftId, repeatCount, user } = {}) {
  if (!giftId) return;

  const rule = (await getGiftRulesByGiftId(userId)).get(String(giftId));
  if (!rule) return;

  const definition = ACTION_BY_ID.get(rule.action);
  if (!definition) return;

  const uniqueId = String(user?.uniqueId || '').trim() || 'espectador';
  const nickname = String(user?.nickname || uniqueId);
  const units = Math.max(1, Math.round(Number(repeatCount) || 1));
  const amount = Math.min(definition.max, Number(rule.amount) * units);

  await enqueueAction(userId, { uniqueId, nickname, action: rule.action, amount });
}

async function enqueueTestAction(userId, ruleId) {
  const result = await pool.query(
    'SELECT action, amount FROM minecraft_gift_rules WHERE id = $1 AND user_id = $2',
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

// Resuelve la llave del plugin al usuario de la plataforma y verifica que tenga acceso activo
async function resolveByServerKey(serverKey) {
  const key = String(serverKey || '').trim();
  if (!/^[a-f0-9]{32,64}$/.test(key)) {
    return { found: false, hasAccess: false, userId: null, username: null };
  }

  const result = await pool.query(
    `SELECT mc.user_id, mc.minecraft_username, au.email
     FROM minecraft_config mc
     JOIN app_users au ON au.id = mc.user_id
     WHERE mc.server_key = $1`,
    [key],
  );

  if (result.rowCount === 0) {
    return { found: false, hasAccess: false, userId: null, username: null };
  }

  const { user_id: userId, minecraft_username: username, email } = result.rows[0];

  if (isSuperUserEmail(email)) {
    return { found: true, hasAccess: true, userId, username };
  }

  const accessService = require('./accessService');
  const hasAccess = await accessService.hasActiveAccess(userId);
  return { found: true, hasAccess, userId, username };
}

// El plugin consulta con online=1 solo cuando el streamer esta dentro del servidor: asi las
// acciones no se pierden si el jugador esta desconectado (quedan pendientes).
async function pollActionQueue(userId, { online = true, limit = 20 } = {}) {
  if (!online) return [];

  const result = await pool.query(
    `UPDATE minecraft_action_queue
     SET status = 'sent', sent_at = NOW()
     WHERE id IN (
       SELECT id FROM minecraft_action_queue
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
  notePluginPoll,
  getPluginStatus,
  ACTIONS,
  listActions,
  getOrCreateConfig,
  setMinecraftUsername,
  regenerateServerKey,
  listGiftRules,
  upsertGiftRule,
  deleteGiftRule,
  handleGift,
  enqueueAction,
  enqueueTestAction,
  resolveByServerKey,
  pollActionQueue,
};
