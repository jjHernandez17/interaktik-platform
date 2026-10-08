// Cubo Gigante de Minecraft: los regalos de TikTok llenan un cubo enorme de bloques y cada cubo completo
// es +1 victoria. El mod (minecraft-cube-mod/) lleva la logica del cubo; la plataforma guarda las medidas,
// las reglas regalo -> bloques y le manda comandos (/cubo ...) por el mismo puente WebSocket de Minecraft.

const pool = require('../database/pool');
const minecraftService = require('./minecraftService');

const MAX_SIDE = 100;
const MIN_SIDES = { width: 3, height: 2, length: 3 }; // el vidrio ocupa el borde y el piso
const MAX_BLOCKS = 400000;
const MAX_RULE_BLOCKS = 100000;
const MAX_ADD = 1000000;
const MAX_COUNTDOWN = 3600;
const MAX_WINS = 1000000;

// Materiales ofrecidos en el panel ('' = arcoiris por capas)
const BLOCK_CHOICES = [
  { id: '', label: 'Arcoíris (colores por capas)' },
  { id: 'minecraft:stone', label: 'Piedra' },
  { id: 'minecraft:cobblestone', label: 'Adoquín' },
  { id: 'minecraft:oak_planks', label: 'Tablones de roble' },
  { id: 'minecraft:bricks', label: 'Ladrillos' },
  { id: 'minecraft:glass', label: 'Vidrio' },
  { id: 'minecraft:gold_block', label: 'Oro' },
  { id: 'minecraft:diamond_block', label: 'Diamante' },
  { id: 'minecraft:emerald_block', label: 'Esmeralda' },
  { id: 'minecraft:tnt', label: 'TNT (decorativo)' },
  { id: 'minecraft:dirt', label: 'Tierra' },
  { id: 'minecraft:sand', label: 'Arena' },
  { id: 'minecraft:obsidian', label: 'Obsidiana' },
  { id: 'minecraft:white_wool', label: 'Lana blanca' },
];

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

const DEFAULT_SETTINGS = { width: 10, height: 10, length: 10, block: '', countdown: 10, goal: 10 };

function cleanBlock(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const id = raw.includes(':') ? raw : `minecraft:${raw}`;
  if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id) || id.length > 80) throw badRequest('Ese bloque no es válido.');
  return id;
}

function validateInt(value, min, max, message) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < min || number > max) throw badRequest(message);
  return number;
}

function validateSize({ width, height, length }) {
  const dims = [width, height, length].map((value) => Math.round(Number(value)));
  if (dims.some((value) => !Number.isFinite(value) || value > MAX_SIDE)) {
    throw badRequest(`Cada medida puede ser de hasta ${MAX_SIDE} bloques.`);
  }
  if (dims[0] < MIN_SIDES.width || dims[1] < MIN_SIDES.height || dims[2] < MIN_SIDES.length) {
    throw badRequest(`Medidas mínimas: ancho ${MIN_SIDES.width}, alto ${MIN_SIDES.height} y largo ${MIN_SIDES.length} (el vidrio ocupa el borde).`);
  }
  const inner = (dims[0] - 2) * (dims[1] - 1) * (dims[2] - 2);
  if (inner > MAX_BLOCKS) {
    throw badRequest(`El interior no puede pasar de ${MAX_BLOCKS} bloques (con esas medidas serían ${inner}).`);
  }
  return { width: dims[0], height: dims[1], length: dims[2] };
}

async function getSettings(userId) {
  const result = await pool.query(
    'SELECT width, height, length, block, countdown_seconds AS countdown, win_goal AS goal FROM minecraft_cube_settings WHERE user_id = $1',
    [userId],
  );
  return result.rowCount > 0 ? result.rows[0] : { ...DEFAULT_SETTINGS };
}

async function saveSettings(userId, input) {
  const size = validateSize(input || {});
  const block = cleanBlock(input?.block);
  const countdown = validateInt(input?.countdown, 0, MAX_COUNTDOWN, 'La cuenta regresiva debe estar entre 0 y ' + MAX_COUNTDOWN + ' segundos.');
  const goal = validateInt(input?.goal, -MAX_WINS, MAX_WINS, 'El objetivo de wins debe estar entre -' + MAX_WINS + ' y ' + MAX_WINS + '.');
  await pool.query(
    `INSERT INTO minecraft_cube_settings (user_id, width, height, length, block, countdown_seconds, win_goal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       width = EXCLUDED.width, height = EXCLUDED.height, length = EXCLUDED.length,
       block = EXCLUDED.block, countdown_seconds = EXCLUDED.countdown_seconds, win_goal = EXCLUDED.win_goal,
       updated_at = NOW()`,
    [userId, size.width, size.height, size.length, block, countdown, goal],
  );
  return { ...size, block, countdown, goal };
}

function counters(settings) {
  return [`cubo contador ${settings.countdown}`, `cubo objetivo ${settings.goal}`];
}

// Comandos del mod para cada boton del panel
function commandsFor(kind, settings) {
  const size = `cubo tamano ${settings.width} ${settings.height} ${settings.length}`;
  const block = `cubo bloque ${settings.block ? settings.block : 'arcoiris'}`;
  switch (kind) {
    case 'apply': return [block, ...counters(settings)];
    case 'start': return [block, ...counters(settings), size]; // /cubo tamano crea el cubo, por eso va al final
    case 'restart': return ['cubo reiniciar todos'];
    case 'stop': return ['cubo detener todos'];
    case 'wins': return [`cubo victorias poner ${validateInt(settings.winsNow, -MAX_WINS, MAX_WINS, 'Los wins deben estar entre -' + MAX_WINS + ' y ' + MAX_WINS + '.')}`];
    default: throw badRequest('Acción no válida.');
  }
}

// Poderes de una regla: cantidad = bloques, TNT o fuerza del rayo
const POWERS = {
  blocks: { label: 'Bloques', min: 1, max: MAX_RULE_BLOCKS, action: 'cube_add' },
  tnt: { label: 'TNT', min: 1, max: 500, action: 'cube_tnt' },
  lightning: { label: 'Rayo', min: 1, max: 10, action: 'cube_lightning' },
  vacuum: { label: 'Bomba de vacío', min: 1, max: 50, action: 'cube_vacuum' },
  creeper: { label: 'Creepers', min: 1, max: 50, action: 'cube_creeper' },
};
const MAX_LIGHTNING_STRIKES = 20; // rayos por regalo (un combo los multiplica hasta aqui)
const MAX_TNT_PER_GIFT = 2000;
const MAX_CREEPERS_PER_GIFT = 200;
const MAX_VACUUM_LAYERS = 100; // capas por regalo (un combo las multiplica hasta aqui)

function cleanPower(value) {
  const power = String(value || 'blocks').trim();
  if (!POWERS[power]) throw badRequest('Poder no válido.');
  return power;
}

async function listRules(userId) {
  const result = await pool.query(
    `SELECT id, gift_id, gift_name, gift_image_url, power, blocks AS amount, created_at
     FROM minecraft_cube_rules WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows;
}

const ruleCache = new Map(); // userId -> Map(giftId -> { power, amount })

async function rulesByGiftId(userId) {
  const cached = ruleCache.get(Number(userId));
  if (cached) return cached;
  const result = await pool.query('SELECT gift_id, power, blocks FROM minecraft_cube_rules WHERE user_id = $1', [userId]);
  const map = new Map(result.rows.map((row) => [String(row.gift_id), { power: row.power || 'blocks', amount: Number(row.blocks) }]));
  ruleCache.set(Number(userId), map);
  return map;
}

async function upsertRule(userId, { giftId, giftName, giftImageUrl, power, amount, blocks }) {
  const cleanGiftId = String(giftId || '').trim().slice(0, 60);
  const cleanGiftName = String(giftName || '').trim().slice(0, 120);
  if (!cleanGiftId || !cleanGiftName) throw badRequest('Debes seleccionar un regalo.');

  const kind = cleanPower(power);
  const definition = POWERS[kind];
  const value = Math.round(Number(amount !== undefined ? amount : blocks));
  if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
    const what = kind === 'lightning' ? 'La fuerza del rayo' : kind === 'vacuum' ? 'Las capas por regalo' : `Los ${definition.label.toLowerCase()} por regalo`;
    throw badRequest(`${what} debe estar entre ${definition.min} y ${definition.max}.`);
  }

  const result = await pool.query(
    `INSERT INTO minecraft_cube_rules (user_id, gift_id, gift_name, gift_image_url, power, blocks)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET
       gift_name = EXCLUDED.gift_name, gift_image_url = EXCLUDED.gift_image_url,
       power = EXCLUDED.power, blocks = EXCLUDED.blocks, updated_at = NOW()
     RETURNING id, gift_id, gift_name, gift_image_url, power, blocks AS amount, created_at`,
    [userId, cleanGiftId, cleanGiftName, giftImageUrl || null, kind, value],
  );
  ruleCache.delete(Number(userId));
  return result.rows[0];
}

async function deleteRule(userId, ruleId) {
  await pool.query('DELETE FROM minecraft_cube_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
  ruleCache.delete(Number(userId));
}

// Encola la accion del poder. Rayo: se codifica como veces * 100 + fuerza (ver minecraftJavaCommands.js)
async function enqueuePower(userId, { uniqueId, nickname, power, amount, units }) {
  const count = Math.max(1, Math.round(units) || 1);
  let action;
  let total;
  if (power === 'tnt') {
    action = 'cube_tnt';
    total = Math.min(MAX_TNT_PER_GIFT, amount * count);
  } else if (power === 'creeper') {
    action = 'cube_creeper';
    total = Math.min(MAX_CREEPERS_PER_GIFT, amount * count);
  } else if (power === 'vacuum') {
    action = 'cube_vacuum';
    total = Math.min(MAX_VACUUM_LAYERS, amount * count);
  } else if (power === 'lightning') {
    action = 'cube_lightning';
    total = Math.min(MAX_LIGHTNING_STRIKES, count) * 100 + Math.min(10, Math.max(1, amount));
  } else {
    action = 'cube_add';
    total = Math.min(MAX_ADD, Math.max(1, Math.round(amount * count)));
  }
  await minecraftService.enqueueAction(userId, { uniqueId, nickname, action, amount: total });
}

// tiktokLiveManager ya junta los combos: llega UN evento por regalo (repeatCount = total del combo)
async function handleGift(userId, { giftId, repeatCount, user } = {}) {
  if (!giftId) return;
  const rule = (await rulesByGiftId(userId)).get(String(giftId));
  if (!rule) return;

  const uniqueId = String(user?.uniqueId || '').trim() || 'espectador';
  const nickname = String(user?.nickname || uniqueId);
  await enqueuePower(userId, { uniqueId, nickname, power: rule.power, amount: rule.amount, units: Number(repeatCount) || 1 });
}

async function enqueueTest(userId, ruleId) {
  const result = await pool.query('SELECT power, blocks FROM minecraft_cube_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
  if (result.rowCount === 0) {
    const error = new Error('Regla no encontrada.');
    error.status = 404;
    throw error;
  }
  const rule = result.rows[0];
  await enqueuePower(userId, { uniqueId: 'test-user', nickname: 'Prueba', power: rule.power || 'blocks', amount: Number(rule.blocks), units: 1 });
}

module.exports = {
  MAX_SIDE,
  MAX_COUNTDOWN,
  MAX_WINS,
  MIN_SIDES,
  MAX_BLOCKS,
  MAX_RULE_BLOCKS,
  POWERS,
  BLOCK_CHOICES,
  getSettings,
  saveSettings,
  commandsFor,
  listRules,
  upsertRule,
  deleteRule,
  handleGift,
  enqueueTest,
};
