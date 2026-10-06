// tiktokinteractik/backend/src/services/gtaService.js
//
// GTA V interactivo: los regalos de TikTok se convierten en acciones sobre el streamer
// (modo historia). Un mod de ScriptHookVDotNet (gta-mod/) se conecta aqui (gtaBridge.js) y ejecuta
// cada accion DENTRO del juego, sin consola ni ventanas. Funciona con la version clasica de GTA V
// (Epic, Steam o Rockstar), no con la Enhanced.
//
// El catalogo vive aqui: cada "id" lo implementa el mod (gta-mod/InteraktikGTA.cs). "code" es el truco
// equivalente, solo lo usa la aplicacion de teclas antigua (gta-helper/), que ya no se ofrece.

const crypto = require('crypto');
const { EventEmitter } = require('events');
const pool = require('../database/pool');
const { isSuperUserEmail } = require('../middleware/auth');

const ACTION_GROUPS = [
  { id: 'enemies', label: 'Enemigos que lo atacan' },
  { id: 'annoy', label: 'Molestar' },
  { id: 'help', label: 'Ayudar' },
  { id: 'allies', label: 'Aliados' },
  { id: 'vehicles', label: 'Vehículos' },
];

// Acciones de una sola vez (amount fijo en 1)
function once(id, group, label, extra = {}) {
  return { id, group, label, unit: 'veces', min: 1, max: 1, def: 1, ...extra };
}

// Acciones que se repiten o escalan con la cantidad (un combo multiplica)
function many(id, group, label, unit, min, max, def) {
  return { id, group, label, unit, min, max, def, repeat: true };
}

// Vehiculos: el mod los implementa por id (gta-mod/InteraktikGTA.cs, tabla Cars)
const VEHICLES = [
  ['car_adder', 'Adder (superdeportivo)'], ['car_zentorno', 'Zentorno'], ['car_t20', 'T20'], ['car_osiris', 'Osiris'],
  ['car_entityxf', 'Entity XF'], ['car_infernus', 'Infernus'], ['car_bullet', 'Bullet'], ['car_vacca', 'Vacca'],
  ['car_banshee', 'Banshee'], ['car_jester', 'Jester'], ['car_turismor', 'Turismo R'], ['car_cheetah', 'Cheetah'],
  ['car_voltic', 'Voltic'], ['car_sultan', 'Sultan'], ['car_buffalo', 'Buffalo'], ['car_dukes', 'Dukes (muscle car)'],
  ['car_ruiner', 'Ruiner'], ['car_hotknife', 'Hotknife (hot rod)'], ['car_monster', 'Monster truck'],
  ['car_rebel', 'Rebel (pickup oxidada)'], ['car_sandking', 'Sandking (4x4)'], ['car_dune', 'Dune buggy'],
  ['car_bifta', 'Bifta (buggy)'], ['car_insurgent', 'Insurgent (blindado)'], ['car_sanchez', 'Moto de cross Sanchez'],
  ['car_bati', 'Moto Bati 801'], ['car_akuma', 'Moto Akuma'], ['car_faggio', 'Scooter Faggio'], ['car_bmx', 'Bicicleta BMX'],
  ['car_caddy', 'Carrito de golf'], ['car_mower', 'Cortacésped'], ['car_tractor', 'Tractor'], ['car_bus', 'Autobús'],
  ['car_stretch', 'Limusina'], ['car_taxi', 'Taxi'], ['car_ambulance', 'Ambulancia'], ['car_police', 'Patrulla de policía'],
  ['car_riot', 'Camión antidisturbios'], ['car_barracks', 'Camión militar'], ['car_towtruck', 'Grúa'],
  ['car_frogger', 'Helicóptero Frogger'], ['car_maverick', 'Helicóptero Maverick'], ['car_lazer', 'Avión de combate Lazer'],
  ['car_hydra', 'Hydra (jet de despegue vertical)'], ['car_dodo', 'Hidroavión Dodo'],
].map(([id, label]) => once(id, 'vehicles', label));

const ACTIONS = [
  // ----- Enemigos que lo atacan (aparecen cerca y van a por el jugador)
  many('enemy_thugs', 'enemies', 'Matones con bate', 'cantidad', 1, 12, 4),
  many('enemy_ballas', 'enemies', 'Pandilla Ballas armada', 'cantidad', 1, 12, 4),
  many('enemy_families', 'enemies', 'Pandilla Families armada', 'cantidad', 1, 12, 4),
  many('enemy_vagos', 'enemies', 'Pandilla Vagos armada', 'cantidad', 1, 12, 4),
  many('enemy_bikers', 'enemies', 'Moteros con machetes', 'cantidad', 1, 12, 4),
  many('enemy_mafia', 'enemies', 'Mafiosos con metralletas', 'cantidad', 1, 10, 3),
  many('enemy_soldiers', 'enemies', 'Soldados con rifles', 'cantidad', 1, 10, 3),
  many('enemy_swat', 'enemies', 'Equipo SWAT', 'cantidad', 1, 10, 3),
  many('enemy_clowns', 'enemies', 'Payasos asesinos', 'cantidad', 1, 12, 4),
  many('enemy_zombies', 'enemies', 'Zombis', 'cantidad', 1, 15, 5),
  many('enemy_aliens', 'enemies', 'Alienígenas armados', 'cantidad', 1, 8, 3),
  many('enemy_dogs', 'enemies', 'Jauría de rottweilers', 'cantidad', 1, 10, 4),
  many('enemy_cougars', 'enemies', 'Pumas', 'cantidad', 1, 6, 2),
  many('enemy_boars', 'enemies', 'Jabalíes', 'cantidad', 1, 8, 3),
  once('enemy_tank', 'enemies', 'Tanque enemigo que lo persigue'),
  // ----- Molestar
  { id: 'wanted_up', group: 'annoy', label: 'Subir nivel de búsqueda', code: 'FUGITIVE', repeat: true, unit: 'estrellas', min: 1, max: 5, def: 2 },
  once('skyfall', 'annoy', 'Caída libre desde el cielo', { code: 'SKYFALL' }),
  once('drunk', 'annoy', 'Borrachera', { code: 'LIQUOR' }),
  once('slippery', 'annoy', 'Coches resbalosos', { code: 'SNOWDAY' }),
  once('garbage_truck', 'annoy', 'Camión de basura', { code: 'TRASHED' }),
  once('weather', 'annoy', 'Cambiar el clima', { code: 'MAKEITRAIN' }),
  many('explosion', 'annoy', 'Explosiones cerca de él', 'cantidad', 1, 5, 1),
  many('meteors', 'annoy', 'Lluvia de meteoros (explosiones desde el cielo)', 'cantidad', 3, 15, 6),
  many('car_rain', 'annoy', 'Lluvia de coches del cielo', 'cantidad', 1, 8, 3),
  many('launch', 'annoy', 'Lanzarlo por los aires', 'fuerza', 1, 10, 4),
  once('disarm', 'annoy', 'Quitarle las armas'),
  once('ragdoll', 'annoy', 'Tirarlo al suelo'),
  once('fire', 'annoy', 'Prenderle fuego'),
  once('freeze', 'annoy', 'Congelarlo 5 segundos'),
  once('blackout', 'annoy', 'Apagón de toda la ciudad (20 s)'),
  once('night', 'annoy', 'Hacer de noche'),
  once('burst_tires', 'annoy', 'Pincharle las llantas del coche'),
  once('blow_car', 'annoy', 'Explotar su coche'),
  once('tp_random', 'annoy', 'Teletransportarlo a un lugar lejano'),
  many('lose_cash', 'annoy', 'Quitarle dinero', 'dólares', 1000, 100000, 5000),
  // ----- Ayudar
  once('health', 'help', 'Vida y armadura al máximo', { code: 'TURTLE' }),
  once('weapons', 'help', 'Armas y munición', { code: 'TOOLUP' }),
  once('invincible', 'help', 'Invencible (5 minutos)', { code: 'PAINKILLER' }),
  once('wanted_clear', 'help', 'Quitar la búsqueda', { code: 'LAWYERUP' }),
  once('special', 'help', 'Recargar habilidad especial', { code: 'POWERUP' }),
  once('super_jump', 'help', 'Super salto', { code: 'HOPTOIT' }),
  once('fast_run', 'help', 'Correr más rápido', { code: 'CATCHME' }),
  many('give_money', 'help', 'Regalarle dinero', 'dólares', 1000, 500000, 10000),
  once('repair_car', 'help', 'Reparar su coche'),
  once('turbo', 'help', 'Turbo al coche'),
  once('day', 'help', 'Hacer de día'),
  once('slowmo', 'help', 'Cámara lenta (10 s)'),
  // ----- Aliados
  many('ally_bodyguards', 'allies', 'Guardaespaldas armados', 'cantidad', 1, 6, 2),
  many('ally_gang', 'allies', 'Pandilla aliada', 'cantidad', 1, 8, 3),
  many('ally_soldiers', 'allies', 'Soldados aliados', 'cantidad', 1, 6, 2),
  once('ally_chop', 'allies', 'Chop, el perro aliado'),
  // ----- Vehículos (los de siempre y los nuevos)
  once('sports_car', 'vehicles', 'Deportivo Comet', { code: 'COMET' }),
  once('rapid_gt', 'vehicles', 'Deportivo Rapid GT', { code: 'RAPIDGT' }),
  once('helicopter', 'vehicles', 'Helicóptero Buzzard', { code: 'BUZZOFF' }),
  once('stunt_plane', 'vehicles', 'Avioneta acrobática', { code: 'BARNSTORM' }),
  once('tank', 'vehicles', 'Tanque Rhino'),
  ...VEHICLES,
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

// Lo que se le manda al mod: la accion con su cantidad (y, para la aplicacion antigua, los trucos)
function cheatsFor(actionId, amount) {
  const action = ACTION_BY_ID.get(actionId);
  if (!action) return null;
  const times = action.repeat ? clampAmount(action, amount) : 1;
  const codes = action.code ? Array.from({ length: times }, () => action.code) : [];
  return { label: action.label, amount: times, codes };
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
