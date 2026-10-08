// tiktokinteractik/backend/src/services/minecraftJavaCommands.js
//
// Traduce cada accion del catalogo (minecraftService.ACTIONS) a comandos de Minecraft JAVA. Los usa el
// puente cuando se conecta el mod de Java: el mod solo ejecuta el texto de cada comando, asi toda la
// logica vive aqui y no hay que actualizar el mod al agregar acciones.
//
// Se evita a proposito el NBT que cambia entre versiones (nombres de mobs, equipo...): el apodo de
// quien manda el regalo sale en un titulo en pantalla.
//
// Devuelve una lista de pasos: un texto es un comando; { wait: ms } es una pausa.

// El apodo viene de TikTok: solo letras, numeros y signos simples, para que nunca pueda
// colarse nada raro en un comando.
function cleanName(value) {
  const cleaned = String(value || '')
    .replace(/[^\p{L}\p{N} _.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return cleaned || 'Alguien';
}

function randomOffset(min, max) {
  const distance = min + Math.floor(Math.random() * (max - min + 1));
  return Math.random() < 0.5 ? -distance : distance;
}

const MOB_ENTITIES = {
  zombie: 'zombie',
  creeper: 'creeper',
  skeleton: 'skeleton',
  spider: 'spider',
  enderman: 'enderman',
};

// id de la plataforma -> [efecto, nivel]
const EFFECTS = {
  blindness: ['blindness', 0],
  slowness: ['slowness', 1],
  nausea: ['nausea', 0],
  levitation: ['levitation', 0],
  speed: ['speed', 1],
  strength: ['strength', 1],
  regeneration: ['regeneration', 1],
  jump: ['jump_boost', 2],
};

const GIVE_ITEMS = {
  golden_apple: 'golden_apple',
  food: 'cooked_beef',
  diamond: 'diamond',
};

const atPlayer = (command) => `execute as @a at @s run ${command}`;
const offsetPos = (min, max) => `~${randomOffset(min, max)} ~ ~${randomOffset(min, max)}`;

function spawnAround(entity, amount, minRadius, maxRadius, nbt = '') {
  const steps = [];
  for (let i = 0; i < amount; i += 1) {
    steps.push(atPlayer(`summon ${entity} ${offsetPos(minRadius, maxRadius)}${nbt ? ` ${nbt}` : ''}`));
  }
  return steps;
}

function announcement(item, definition) {
  const help = definition?.group === 'help';
  const hasAmount = definition ? definition.min !== definition.max : true;
  const label = definition?.label || item.action;
  const verb = help ? 'te dio' : 'te lanzó';

  return [
    'title @a times 5 28 8',
    `title @a subtitle {"text":"${verb} ${hasAmount ? `${item.amount} ` : ''}${label}","color":"white"}`,
    `title @a title {"text":"${cleanName(item.nickname)}","color":"${help ? 'green' : 'red'}"}`,
  ];
}

/**
 * @param {{ action: string, amount: number, nickname?: string }} item
 * @param {{ actions?: Array }} [options] catalogo de acciones (para el nombre y el grupo en el aviso)
 * @returns {Array<string | { wait: number }>} pasos, o [] si la accion no existe
 */
function toJavaSteps(item, options = {}) {
  const action = String(item?.action || '');
  const amount = Math.max(1, Math.round(Number(item?.amount) || 1));
  const definition = (options.actions || []).find((entry) => entry.id === action) || null;
  let steps;

  if (MOB_ENTITIES[action]) {
    steps = spawnAround(MOB_ENTITIES[action], amount, 3, 6);
  } else if (EFFECTS[action]) {
    const [effect, level] = EFFECTS[action];
    steps = [`effect give @a minecraft:${effect} ${amount} ${level}`];
  } else if (GIVE_ITEMS[action]) {
    steps = [`give @a minecraft:${GIVE_ITEMS[action]} ${amount}`];
  } else {
    switch (action) {
      case 'tnt':
        steps = spawnAround('tnt', amount, 2, 5);
        break;
      case 'lightning':
        steps = [];
        for (let i = 0; i < amount; i += 1) {
          steps.push(atPlayer(`summon lightning_bolt ${offsetPos(1, 4)}`));
          if (i < amount - 1) steps.push({ wait: 350 });
        }
        break;
      case 'arrows':
        steps = [];
        for (let i = 0; i < amount; i += 1) {
          steps.push(atPlayer(`summon arrow ~${randomOffset(0, 4)} ~15 ~${randomOffset(0, 4)}`));
        }
        break;
      case 'launch':
        steps = [`effect give @a minecraft:levitation 2 ${Math.min(30, amount)} true`];
        break;
      case 'teleport': {
        // Centro desplazado 3/4 del radio y margen de 1/4: siempre cae entre 1/2 y 1 radio del jugador
        const radius = Math.max(5, amount);
        const angle = Math.random() * Math.PI * 2;
        const dx = Math.round(Math.cos(angle) * radius * 0.75);
        const dz = Math.round(Math.sin(angle) * radius * 0.75);
        steps = [atPlayer(`spreadplayers ~${dx} ~${dz} 1 ${Math.max(2, Math.round(radius * 0.25))} false @s`)];
        break;
      }
      case 'fire':
        steps = [atPlayer('setblock ~ ~ ~ minecraft:fire keep')];
        break;
      case 'heal':
        steps = [
          'effect give @a minecraft:instant_health 1 10 true',
          'effect give @a minecraft:saturation 2 10 true',
          'effect give @a minecraft:fire_resistance 3 0 true',
        ];
        break;
      case 'armor':
        steps = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'].map((piece) => `give @a minecraft:${piece} 1`);
        break;
      case 'xp':
        steps = [`xp add @a ${amount} levels`];
        break;
      case 'iron_golem':
        steps = spawnAround('iron_golem', amount, 2, 5, '{PlayerCreated:1b}');
        break;
      case 'wolves':
        // Cada lobo se invoca con una etiqueta temporal y se le asigna como dueño al jugador
        steps = [];
        for (let i = 0; i < amount; i += 1) {
          steps.push(atPlayer(`summon wolf ${offsetPos(2, 4)} {Tags:["ik_wolf"]}`));
          steps.push('execute as @e[type=wolf,tag=ik_wolf] run data modify entity @s Owner set from entity @p UUID');
          steps.push('tag @e[type=wolf,tag=ik_wolf] remove ik_wolf');
        }
        break;
      case 'cube_add':
        // Cubo Gigante: el mod (minecraft-cube-mod) coloca los bloques; aqui solo se avisa en pantalla
        return [
          `cubo agregar ${amount}`,
          `title @a actionbar {"text":"${cleanName(item.nickname)} agregó ${amount} bloques al cubo","color":"aqua"}`,
        ];
      case 'cube_tnt':
        // Cubo Gigante: caen TNT desde arriba del cubo; explotan al tocar un bloque
        return [
          `cubo tnt ${amount}`,
          `title @a actionbar {"text":"${cleanName(item.nickname)} lanzó ${amount} TNT sobre el cubo","color":"red"}`,
        ];
      case 'cube_creeper':
        // Cubo Gigante: aparecen creepers dentro del cubo, encima de lo construido
        return [
          `cubo creeper ${amount}`,
          `title @a actionbar {"text":"${cleanName(item.nickname)} invocó ${amount} ${amount === 1 ? 'creeper' : 'creepers'} en el cubo","color":"green"}`,
        ];
      case 'cube_vacuum':
        // Cubo Gigante: quita las capas de arriba que haya construido el jugador
        return [
          `cubo vacio ${amount}`,
          `title @a actionbar {"text":"${cleanName(item.nickname)} activó una bomba de vacío: -${amount} ${amount === 1 ? 'capa' : 'capas'}","color":"dark_purple"}`,
        ];
      case 'cube_lightning': {
        // amount = veces * 100 + fuerza (1 a 10)
        const strength = Math.min(10, Math.max(1, amount % 100));
        const strikes = Math.max(1, Math.floor(amount / 100));
        return [
          `cubo rayo ${strength} ${strikes}`,
          `title @a actionbar {"text":"${cleanName(item.nickname)} lanzó ${strikes > 1 ? `${strikes} rayos` : 'un rayo'} de fuerza ${strength}","color":"yellow"}`,
        ];
      }
      default:
        return [];
    }
  }

  return [...steps, ...announcement({ action, amount, nickname: item?.nickname }, definition)];
}

module.exports = { toJavaSteps, cleanName };
