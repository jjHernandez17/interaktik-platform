// tiktokinteractik/backend/src/services/minecraftBedrockCommands.js
//
// Traduce cada accion del catalogo (minecraftService.ACTIONS) a comandos normales de Minecraft
// Bedrock. El puente (minecraftBridge.js) los manda por WebSocket al juego, que los ejecuta como
// si el jugador los escribiera en el chat (por eso el mundo necesita los trucos activados).
//
// Cada comando va con "execute as @a at @s": en el mundo solo entra el streamer, asi que "@a" es el y
// las posiciones relativas (~) salen de donde esta parado.
//
// La funcion devuelve una lista de pasos: un texto es un comando; { wait: ms } es una pausa.

const MOB_ENTITIES = {
  zombie: 'zombie',
  creeper: 'creeper',
  skeleton: 'skeleton',
  spider: 'spider',
  enderman: 'enderman',
  iron_golem: 'iron_golem',
  wolves: 'wolf',
};

// Efectos: id de la plataforma -> [nombre en Bedrock, nivel]
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

const atPlayer = (command) => `execute as @a at @s run ${command}`;

function spawnAround(entity, amount, minRadius = 3, maxRadius = 7) {
  const steps = [];
  for (let i = 0; i < amount; i += 1) {
    steps.push(atPlayer(`summon ${entity} ~${randomOffset(minRadius, maxRadius)} ~ ~${randomOffset(minRadius, maxRadius)}`));
  }
  return steps;
}

function announcement(item, definition) {
  const help = definition?.group === 'help';
  const hasAmount = definition ? definition.min !== definition.max : true;
  const label = definition?.label || item.action;
  const verb = help ? 'te dio' : 'te lanzó';
  const color = help ? '§a' : '§c';

  return [
    'title @a times 5 28 8',
    `title @a subtitle §f${verb} ${hasAmount ? `${item.amount} ` : ''}${label}`,
    `title @a title ${color}${cleanName(item.nickname)}`,
  ];
}

/**
 * @param {{ action: string, amount: number, nickname?: string }} item
 * @param {{ actions?: Array }} [options] catalogo de acciones (para el nombre y el grupo en el aviso)
 * @returns {Array<string | { wait: number }>} pasos, o [] si la accion no existe
 */
function toBedrockSteps(item, options = {}) {
  const action = String(item?.action || '');
  const amount = Math.max(1, Math.round(Number(item?.amount) || 1));
  const definition = (options.actions || []).find((entry) => entry.id === action) || null;
  let steps;

  if (MOB_ENTITIES[action]) {
    steps = spawnAround(MOB_ENTITIES[action], amount, action === 'wolves' || action === 'iron_golem' ? 2 : 3, 6);
  } else if (EFFECTS[action]) {
    const [effect, level] = EFFECTS[action];
    steps = [`effect @a ${effect} ${amount} ${level}`];
  } else if (GIVE_ITEMS[action]) {
    steps = [`give @a ${GIVE_ITEMS[action]} ${amount}`];
  } else {
    switch (action) {
      case 'tnt':
        steps = spawnAround('tnt', amount, 2, 5);
        break;
      case 'lightning':
        steps = [];
        for (let i = 0; i < amount; i += 1) {
          steps.push(atPlayer(`summon lightning_bolt ~${randomOffset(1, 4)} ~ ~${randomOffset(1, 4)}`));
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
        steps = [`effect @a levitation 2 ${Math.min(30, amount)} true`];
        break;
      case 'teleport':
        // Lo coloca en un punto seguro de la superficie dentro del radio (nunca dentro de la roca)
        steps = [atPlayer(`spreadplayers ~ ~ 2 ${Math.max(5, amount)} @s`)];
        break;
      case 'fire':
        steps = [atPlayer('setblock ~ ~ ~ fire')];
        break;
      case 'heal':
        steps = ['effect @a instant_health 1 10 true', 'effect @a saturation 2 10 true', 'effect @a fire_resistance 3 0 true'];
        break;
      case 'armor':
        steps = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'].map((piece) => `give @a ${piece} 1`);
        break;
      case 'xp':
        steps = [`xp ${amount}L @a`];
        break;
      default:
        return [];
    }
  }

  return [...steps, ...announcement({ action, amount, nickname: item?.nickname }, definition)];
}

module.exports = { toBedrockSteps, cleanName, randomOffset };
