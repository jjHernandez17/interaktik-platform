// tiktokinteractik/backend/src/services/aiHostService.js
//
// Co-anfitrion IA: escucha el mismo canal de eventos del live que usan los juegos (comentarios, regalos, seguidores...) y, para
// cada streamer que lo tenga encendido, junta lo que va pasando en el chat y cada pocos segundos le pide a Claude UNA respuesta
// que lee varios mensajes a la vez. La respuesta (texto + emocion + accion) se publica como el evento 'ai-host-say' para la pagina
// del juego, donde un personaje animado la dice en voz alta y la actua. Tambien se publican 'ai-host-event' (regalo, seguidor,
// compartido) y 'ai-host-chat' (comentarios) para que el personaje reaccione y se vea el chat al instante. Es un suscriptor pasivo: no toca liveHub.js ni tiktokLiveManager.js.
//
// Costos: una respuesta ~1.400 tokens de entrada y ~80 de salida con Haiku 5.5 (~$0,0002). Topes: respuestas por dia y por
// streamer, una sola llamada a la vez por streamer y nada de llamadas si el live esta quieto.

'use strict';

const pool = require('../database/pool');
const logger = require('../config/logger');
const { hub, emitLiveEvent } = require('./liveHub');
const { isSuperUserEmail } = require('../middleware/auth');
const prompt = require('./aiHostPrompt');
const credit = require('./aiHostCredit');

// ---------- ajustes ----------

const ALLOWED_MODELS = {
  'claude-haiku-5-5': { label: 'Haiku 5.5 (rápido y barato)', inputPerMTok: 0.1, outputPerMTok: 0.5 },
  'claude-sonnet-5-5': { label: 'Sonnet 5.5 (más inteligente, ~20 veces más caro)', inputPerMTok: 2, outputPerMTok: 10 },
};
const DEFAULT_MODEL = 'claude-haiku-5-5';
const DAILY_CALLS_CAP = () => Math.max(50, Number(process.env.AI_HOST_DAILY_CALLS) || 2000);

const CONFIG_CACHE_TTL_MS = 15000;
const TICK_MS = 1000;
const SESSION_IDLE_MS = 20 * 60 * 1000;
const ACTIVE_WINDOW_MS = 3 * 60 * 1000; // sin actividad en el chat en este tiempo = el live esta quieto: no se gasta nada
const QUEUE_MAX = 60;
const STALE_COMMENT_MS = 70 * 1000;
const URGENT_GAP_MS = 2500;
const MEMORY_MAX = 10;
const MAX_FAILURES = 3;
const FAILURE_PAUSE_MS = 60 * 1000;
const DEDUPE_WINDOW_MS = 60 * 1000;
const TEST_MIN_GAP_MS = 2500;
const OWNER_KEY_PATTERN = /^user:(\d+):/;

const DEFAULTS = {
  enabled: false,
  agentName: 'Nova',
  language: 'es',
  tone: 'amigable',
  persona: '',
  aboutStreamer: '',
  replyMode: 'all',
  thankGifts: true,
  minGiftCoins: 1,
  greetFollowers: true,
  greetViewers: false,
  proactive: true,
  proactiveMinutes: 4,
  cadenceSeconds: 8,
  maxChars: 220,
  model: DEFAULT_MODEL,
  bannedWords: '',
  voiceName: '',
  voiceRate: 1,
  voicePitch: 1,
  voiceVolume: 1,
  accentColor: '#7c5cff',
  character: 'mochi',
  background: 'studio',
  showChat: true,
};

const CHARACTERS = { mochi: 'Mochi (gatito alegre)' };
const BACKGROUNDS = { studio: 'Estudio', sunset: 'Atardecer', neon: 'Neón', night: 'Noche estrellada' };

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function rowToConfig(row) {
  return {
    enabled: Boolean(row.enabled),
    agentName: row.agent_name,
    language: row.language,
    tone: row.tone,
    persona: row.persona,
    aboutStreamer: row.about_streamer,
    replyMode: row.reply_mode,
    thankGifts: Boolean(row.thank_gifts),
    minGiftCoins: row.min_gift_coins,
    greetFollowers: Boolean(row.greet_followers),
    greetViewers: Boolean(row.greet_viewers),
    proactive: Boolean(row.proactive),
    proactiveMinutes: row.proactive_minutes,
    cadenceSeconds: row.cadence_seconds,
    maxChars: row.max_chars,
    model: row.model,
    bannedWords: row.banned_words,
    voiceName: row.voice_name,
    voiceRate: Number(row.voice_rate),
    voicePitch: Number(row.voice_pitch),
    voiceVolume: Number(row.voice_volume),
    accentColor: row.accent_color,
    character: row.character,
    background: row.background,
    showChat: Boolean(row.show_chat),
  };
}

// Valida y limpia lo que manda la pagina; lo que no viene se queda como estaba
function normalizeConfigInput(input = {}, current = DEFAULTS) {
  const pick = (key) => (input[key] === undefined ? current[key] : input[key]);

  const agentName = cleanText(pick('agentName'), 30).replace(/[<>"]/g, '') || DEFAULTS.agentName;
  const language = prompt.LANGUAGES[pick('language')] ? pick('language') : current.language;
  const tone = prompt.TONES[pick('tone')] ? pick('tone') : current.tone;
  const replyMode = prompt.REPLY_MODES.includes(pick('replyMode')) ? pick('replyMode') : current.replyMode;
  const model = ALLOWED_MODELS[pick('model')] ? pick('model') : current.model;
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(pick('accentColor'))) ? String(pick('accentColor')).toLowerCase() : current.accentColor;

  return {
    enabled: Boolean(pick('enabled')),
    agentName,
    language,
    tone,
    persona: cleanText(pick('persona'), 1200),
    aboutStreamer: cleanText(pick('aboutStreamer'), 1500),
    replyMode,
    thankGifts: Boolean(pick('thankGifts')),
    minGiftCoins: clampInt(pick('minGiftCoins'), 1, 100000, current.minGiftCoins),
    greetFollowers: Boolean(pick('greetFollowers')),
    greetViewers: Boolean(pick('greetViewers')),
    proactive: Boolean(pick('proactive')),
    proactiveMinutes: clampInt(pick('proactiveMinutes'), 1, 30, current.proactiveMinutes),
    cadenceSeconds: clampInt(pick('cadenceSeconds'), 4, 60, current.cadenceSeconds),
    maxChars: clampInt(pick('maxChars'), 80, 400, current.maxChars),
    model,
    bannedWords: cleanText(pick('bannedWords'), 600),
    voiceName: cleanText(pick('voiceName'), 120),
    voiceRate: clampNumber(pick('voiceRate'), 0.6, 1.6, current.voiceRate),
    voicePitch: clampNumber(pick('voicePitch'), 0.5, 1.8, current.voicePitch),
    voiceVolume: clampNumber(pick('voiceVolume'), 0, 1, current.voiceVolume),
    accentColor: accent,
    character: CHARACTERS[pick('character')] ? pick('character') : current.character,
    background: BACKGROUNDS[pick('background')] ? pick('background') : current.background,
    showChat: Boolean(pick('showChat')),
  };
}

// ---------- base de datos ----------

async function getOrCreateConfig(userId) {
  const existing = await pool.query('SELECT * FROM ai_host_config WHERE user_id = $1', [userId]);
  if (existing.rowCount > 0) return rowToConfig(existing.rows[0]);

  await pool.query('INSERT INTO ai_host_config (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const created = await pool.query('SELECT * FROM ai_host_config WHERE user_id = $1', [userId]);
  return rowToConfig(created.rows[0]);
}

async function updateConfig(userId, input) {
  const current = await getOrCreateConfig(userId);
  const next = normalizeConfigInput(input, current);
  const result = await pool.query(
    `UPDATE ai_host_config SET
       enabled = $2, agent_name = $3, language = $4, tone = $5, persona = $6, about_streamer = $7, reply_mode = $8,
       thank_gifts = $9, min_gift_coins = $10, greet_followers = $11, greet_viewers = $12, proactive = $13,
       proactive_minutes = $14, cadence_seconds = $15, max_chars = $16, model = $17, banned_words = $18,
       voice_name = $19, voice_rate = $20, voice_pitch = $21, voice_volume = $22, accent_color = $23,
       character = $24, background = $25, show_chat = $26, updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId, next.enabled, next.agentName, next.language, next.tone, next.persona, next.aboutStreamer, next.replyMode,
      next.thankGifts, next.minGiftCoins, next.greetFollowers, next.greetViewers, next.proactive,
      next.proactiveMinutes, next.cadenceSeconds, next.maxChars, next.model, next.bannedWords,
      next.voiceName, next.voiceRate, next.voicePitch, next.voiceVolume, next.accentColor,
      next.character, next.background, next.showChat],
  );
  configCache.delete(Number(userId));
  return rowToConfig(result.rows[0]);
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function getUsageToday(userId) {
  const result = await pool.query(
    'SELECT calls, spoken, input_tokens, output_tokens, cache_read_tokens, cost_usd FROM ai_host_usage WHERE user_id = $1 AND day = $2',
    [userId, todayString()],
  );
  const row = result.rows[0];
  return {
    calls: row ? Number(row.calls) : 0,
    spoken: row ? Number(row.spoken) : 0,
    inputTokens: row ? Number(row.input_tokens) : 0,
    outputTokens: row ? Number(row.output_tokens) : 0,
    cacheReadTokens: row ? Number(row.cache_read_tokens) : 0,
    costUsd: row ? Number(row.cost_usd) : 0,
    cap: DAILY_CALLS_CAP(),
  };
}

function estimateCostUsd(model, usage) {
  const price = ALLOWED_MODELS[model] || ALLOWED_MODELS[DEFAULT_MODEL];
  const input = Number(usage?.input_tokens || 0);
  const cacheRead = Number(usage?.cache_read_input_tokens || 0);
  const cacheWrite = Number(usage?.cache_creation_input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  return (input * price.inputPerMTok + cacheRead * price.inputPerMTok * 0.1 + cacheWrite * price.inputPerMTok * 1.25 + output * price.outputPerMTok) / 1e6;
}

async function recordUsage(userId, { usage, cost, spoken }) {
  await pool.query(
    `INSERT INTO ai_host_usage (user_id, day, calls, spoken, input_tokens, output_tokens, cache_read_tokens, cost_usd)
     VALUES ($1, $2, 1, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, day) DO UPDATE SET
       calls = ai_host_usage.calls + 1,
       spoken = ai_host_usage.spoken + EXCLUDED.spoken,
       input_tokens = ai_host_usage.input_tokens + EXCLUDED.input_tokens,
       output_tokens = ai_host_usage.output_tokens + EXCLUDED.output_tokens,
       cache_read_tokens = ai_host_usage.cache_read_tokens + EXCLUDED.cache_read_tokens,
       cost_usd = ai_host_usage.cost_usd + EXCLUDED.cost_usd`,
    [userId, todayString(), spoken ? 1 : 0, Number(usage?.input_tokens || 0) + Number(usage?.cache_creation_input_tokens || 0), Number(usage?.output_tokens || 0), Number(usage?.cache_read_input_tokens || 0), cost],
  );
}

// ---------- cliente de IA ----------

let modelClient = null; // { generate({ model, system, user, maxTokens }) -> { text, usage, stopReason } }

function getClient() {
  if (modelClient) return modelClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  modelClient = require('./aiHostClient').createClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  return modelClient;
}

// Solo para pruebas
function setClientForTests(client) {
  modelClient = client;
}

function hasApiKey() {
  return Boolean(modelClient || process.env.ANTHROPIC_API_KEY);
}

// ---------- configuracion en cache + acceso ----------

const configCache = new Map(); // userId -> { at, config, hasAccess }

async function loadActiveConfig(userId) {
  const key = Number(userId);
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.at < CONFIG_CACHE_TTL_MS) return cached;

  const result = await pool.query(
    `SELECT c.*, au.email FROM ai_host_config c JOIN app_users au ON au.id = c.user_id WHERE c.user_id = $1`,
    [userId],
  );

  // hasAccess = puede usar el juego: plan Mensual/Anual vigente con tokens (o superusuario). Prueba gratuita, pase de 2 dias, tiempo
  // asignado a mano y tokens agotados quedan bloqueados.
  let entry = { at: Date.now(), config: null, hasAccess: false, entitlement: null };
  if (result.rowCount > 0) {
    const row = result.rows[0];
    entry.config = rowToConfig(row);
    entry.entitlement = await credit.getEntitlement(userId);
    entry.hasAccess = entry.entitlement.allowed;
  }
  configCache.set(key, entry);
  return entry;
}

// ---------- sesiones (una por streamer con el agente encendido) ----------

const sessions = new Map();

function getSession(userId) {
  let session = sessions.get(userId);
  if (!session) {
    session = {
      userId,
      queue: [],
      memory: [],
      startedAt: Date.now(),
      lastEventAt: Date.now(),
      lastActivityAt: Date.now(),
      lastTurnAt: 0,
      lastSpokeAt: Date.now(),
      speakingUntil: 0,
      busy: false,
      pausedUntil: 0,
      failures: 0,
      lastError: null,
      lastTestAt: 0,
      idleCounter: 0,
      seen: new Map(),
      gifters: new Set(),
      stats: { coins: 0, follows: 0 },
      usage: null,
      limitNotified: false,
      forceNext: false,
    };
    sessions.set(userId, session);
  }
  return session;
}

function extractUserId(ownerKey) {
  const match = OWNER_KEY_PATTERN.exec(String(ownerKey || ''));
  return match ? Number(match[1]) : null;
}

function ownerKeyFor(userId) {
  return `user:${userId}:aihost`;
}

function say(userId, data) {
  emitLiveEvent('ai-host-say', { ownerKey: ownerKeyFor(userId), gameType: 'aihost', ...data });
}

function status(userId, state, message) {
  emitLiveEvent('ai-host-status', { ownerKey: ownerKeyFor(userId), gameType: 'aihost', state, message, at: Date.now() });
}

// ---------- que eventos le interesan al agente ----------

function toEvent(eventName, payload, config) {
  const user = payload.user || {};
  const base = { nickname: user.nickname || user.uniqueId || '', uniqueId: user.uniqueId || '', at: Date.now() };

  if (eventName === 'comment') {
    const text = String(payload.comment || '').trim();
    if (text.length < 2 || text.startsWith('!')) return null; // comandos de juegos
    if (/^[\d\s.,!?¡¿+-]+$/.test(text)) return null; // "1", "2", "???"
    const mention = prompt.mentionsAgent(text, config.agentName);
    if (config.replyMode === 'mentions' && !mention) return null;
    if (config.replyMode === 'questions' && !mention && !prompt.looksLikeQuestion(text)) return null;
    return {
      ...base,
      kind: 'comment',
      text,
      mention,
      question: prompt.looksLikeQuestion(text),
      follower: Boolean(payload.identity?.follower),
      subscriber: Boolean(payload.identity?.subscriber),
      moderator: Boolean(payload.identity?.moderator),
    };
  }

  if (eventName === 'gift') {
    if (!config.thankGifts || !payload.repeatEnd) return null;
    const count = Math.max(1, Math.round(Number(payload.repeatCount) || 1));
    const coins = (Number(payload.diamondCount) || 0) * count;
    if (coins < config.minGiftCoins) return null;
    return { ...base, kind: 'gift', giftName: payload.giftName || 'un regalo', count, coins };
  }

  if (eventName === 'follow') return config.greetFollowers ? { ...base, kind: 'follow' } : null;
  if (eventName === 'share') return config.greetFollowers ? { ...base, kind: 'share' } : null;
  if (eventName === 'member') return config.greetViewers ? { ...base, kind: 'member' } : null;
  return null;
}

function enqueue(session, event) {
  const dedupeKey = `${event.kind}|${event.uniqueId}|${event.text || event.giftName || ''}`;
  const lastSeen = session.seen.get(dedupeKey);
  if (!event.test && lastSeen && event.at - lastSeen < DEDUPE_WINDOW_MS) return false;
  session.seen.set(dedupeKey, event.at);
  if (session.seen.size > 400) {
    const cutoff = Date.now() - DEDUPE_WINDOW_MS;
    for (const [key, at] of session.seen) if (at < cutoff) session.seen.delete(key);
  }

  if (event.kind === 'gift') {
    session.stats.coins += event.coins;
    session.gifters.add(event.uniqueId);
  } else if (event.kind === 'follow') {
    session.stats.follows += 1;
  }

  session.queue.push(event);
  while (session.queue.length > QUEUE_MAX) {
    // se descarta primero lo menos importante: comentarios viejos
    const index = session.queue.findIndex((item) => item.kind === 'comment' || item.kind === 'member');
    session.queue.splice(index === -1 ? 0 : index, 1);
  }
  return true;
}

// Lo que entra en la siguiente respuesta: regalos y seguidores primero, luego los comentarios mas utiles
function pickBatch(session, now = Date.now()) {
  session.queue = session.queue.filter((item) => item.kind !== 'comment' || now - item.at < STALE_COMMENT_MS);

  const gifts = session.queue.filter((item) => item.kind === 'gift').slice(0, 5);
  const follows = session.queue.filter((item) => item.kind === 'follow' || item.kind === 'share').slice(0, 3);
  const members = session.queue.filter((item) => item.kind === 'member').slice(-2);
  const score = (item) => (item.mention ? 6 : 0) + (item.question ? 3 : 0) + (item.moderator ? 2 : 0) + (item.subscriber ? 1.5 : 0) + (item.follower ? 1 : 0) + (item.at - now) / 60000;
  const comments = session.queue
    .filter((item) => item.kind === 'comment')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5)
    .sort((a, b) => a.at - b.at);

  const batch = [...gifts, ...follows, ...members, ...comments];
  const picked = new Set(batch);
  session.queue = session.queue.filter((item) => !picked.has(item));
  return batch;
}

// ---------- una respuesta ----------

async function runTurn(session, config, { idle = false } = {}) {
  const userId = session.userId;
  const client = getClient();
  if (!client) {
    status(userId, 'no_key', 'El servidor no tiene configurada la clave de la IA.');
    session.queue = [];
    return;
  }

  if (!session.usage) {
    session.usage = await getUsageToday(userId).catch(() => ({ calls: 0, cap: DAILY_CALLS_CAP() }));
  }
  if (session.usage.calls >= DAILY_CALLS_CAP()) {
    session.queue = [];
    if (!session.limitNotified) {
      session.limitNotified = true;
      status(userId, 'limit', 'Llegaste al tope de respuestas de hoy. Se reinicia mañana.');
    }
    return;
  }

  // Tokens del plan: si queda poco para el modelo elegido se cambia a Haiku, y si no alcanza ni para Haiku se detiene el agente
  let model = config.model;
  const unlimited = Boolean(session.entitlement?.unlimited);
  if (!unlimited) {
    const left = session.tokensLeft ?? 0;
    if (left < (credit.MIN_TOKENS_TO_RUN[model] || credit.MIN_TOKENS_TO_RUN[DEFAULT_MODEL])) {
      if (model !== DEFAULT_MODEL && left >= credit.MIN_TOKENS_TO_RUN[DEFAULT_MODEL]) {
        model = DEFAULT_MODEL;
        if (!session.fallbackNotified) {
          session.fallbackNotified = true;
          status(userId, 'model_fallback', 'Te quedan pocos tokens: el agente cambió a Haiku para que te duren más.');
        }
      } else {
        session.queue = [];
        configCache.delete(Number(userId));
        if (!session.tokensNotified) {
          session.tokensNotified = true;
          status(userId, 'tokens', 'Se acabaron tus tokens de IA. Renueva tu plan Mensual o Anual para recibir más.');
        }
        return;
      }
    }
  }

  const batch = idle ? [] : pickBatch(session);
  if (!idle && batch.length === 0) return;

  const now = Date.now();
  session.busy = true;
  session.lastTurnAt = now;
  session.forceNext = false;

  try {
    const bannedWords = prompt.parseBannedWords(config.bannedWords);
    const userMessage = prompt.buildTurnMessage({
      events: batch,
      memory: session.memory,
      stats: { minutes: (now - session.startedAt) / 60000, coins: session.stats.coins, gifters: session.gifters.size, follows: session.stats.follows },
      idle: idle ? prompt.pickIdlePrompt(session.idleCounter++) : null,
    });

    const result = await client.generate({
      model,
      system: prompt.buildSystemPrompt(config),
      user: userMessage,
      maxTokens: Math.max(160, Math.round(config.maxChars / 2.2)),
    });

    session.failures = 0;
    session.lastError = null;
    const mainKind = idle ? 'idle' : (batch.find((item) => item.kind === 'gift') ? 'gift' : batch.find((item) => item.kind === 'follow' || item.kind === 'share') ? 'follow' : batch.find((item) => item.question) ? 'question' : 'comment');
    const reply = result.stopReason === 'refusal' ? null : prompt.parseReply(result.text, { maxChars: config.maxChars, bannedWords, fallbackKind: mainKind });
    const text = reply ? reply.text : null;
    const cost = estimateCostUsd(model, result.usage);
    session.usage.calls += 1;
    session.usage.costUsd = (session.usage.costUsd || 0) + cost;
    recordUsage(userId, { usage: result.usage, cost, spoken: Boolean(text) }).catch((error) => logger.warn('[AIHOST] No se pudo guardar el consumo', error));

    // Se descuentan los tokens (una llamada cuenta aunque el agente decida no decir nada)
    if (!unlimited) {
      const spent = credit.costToTokens(cost);
      session.tokensLeft = await credit.consume(userId, spent).catch((error) => {
        logger.error(`[AIHOST] No se pudieron descontar los tokens del usuario ${userId}`, error);
        return Math.max(0, (session.tokensLeft ?? 0) - spent);
      });
      const granted = session.entitlement?.tokensGranted || 0;
      if (session.tokensLeft <= 0) {
        configCache.delete(Number(userId));
        status(userId, 'tokens', 'Se acabaron tus tokens de IA. Renueva tu plan Mensual o Anual para recibir más.');
        session.tokensNotified = true;
      } else if (!session.lowNotified && granted > 0 && session.tokensLeft < granted * credit.LOW_TOKENS_WARNING) {
        session.lowNotified = true;
        status(userId, 'low_tokens', 'Te queda menos del 10 % de tus tokens de IA.');
      }
    }

    if (!text) return;

    const estimatedMs = prompt.estimateSpeechMs(text, config.voiceRate);
    session.memory.push(text);
    if (session.memory.length > MEMORY_MAX) session.memory.shift();
    session.lastSpokeAt = Date.now();
    session.speakingUntil = Date.now() + estimatedMs + 500;

    say(userId, {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      text,
      emotion: reply.emotion,
      action: reply.action,
      to: [...new Set(batch.map((item) => item.nickname).filter(Boolean))].slice(0, 6),
      kinds: [...new Set(batch.map((item) => item.kind))],
      idle,
      estimatedMs,
      agentName: config.agentName,
      model,
    });
  } catch (error) {
    session.failures += 1;
    session.lastError = String(error?.message || error).slice(0, 200);
    logger.warn(`[AIHOST] Fallo una respuesta (usuario ${userId}, intento ${session.failures})`, error);
    // un agradecimiento por regalo o seguidor no se pierde por un fallo de red: vuelve a la cola una vez
    for (const item of batch) {
      if ((item.kind === 'gift' || item.kind === 'follow') && !item.retried) {
        item.retried = true;
        session.queue.unshift(item);
      }
    }
    if (session.failures >= MAX_FAILURES) {
      session.pausedUntil = Date.now() + FAILURE_PAUSE_MS;
      session.failures = 0;
      status(userId, 'error', 'La IA no respondió varias veces seguidas. Reintento en 1 minuto.');
    }
  } finally {
    session.busy = false;
  }
}

// ---------- bucle ----------

async function tickSession(session, now) {
  if (session.busy || now < session.speakingUntil || now < session.pausedUntil) return;

  const entry = await loadActiveConfig(session.userId);
  // apagado = no escucha el live, pero una prueba desde la pagina (forceNext) si se responde
  if (!entry.config || !entry.hasAccess || (!entry.config.enabled && !session.forceNext)) return;
  const config = entry.config;
  // el saldo se lee de la base cada vez que se refresca la configuracion (por ejemplo, si el usuario acaba de comprar un plan)
  if (session.entryAt !== entry.at) {
    session.entryAt = entry.at;
    session.entitlement = entry.entitlement;
    session.tokensLeft = entry.entitlement && !entry.entitlement.unlimited ? entry.entitlement.tokensRemaining : null;
  }

  const hasUrgent = session.queue.some((item) => item.kind === 'gift' || item.kind === 'follow');
  const cadenceMs = config.cadenceSeconds * 1000;
  const sinceTurn = now - session.lastTurnAt;

  if (session.queue.length > 0) {
    if (session.forceNext || (hasUrgent ? sinceTurn >= URGENT_GAP_MS : sinceTurn >= cadenceMs)) {
      await runTurn(session, config);
    }
    return;
  }

  // Sin nada nuevo: si el live sigue activo, de vez en cuando el agente anima el chat o da un consejo
  if (config.proactive && now - session.lastActivityAt < ACTIVE_WINDOW_MS && now - session.lastSpokeAt >= config.proactiveMinutes * 60 * 1000 && sinceTurn >= cadenceMs) {
    await runTurn(session, config, { idle: true });
  }
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    for (const [userId, session] of sessions) {
      if (now - session.lastEventAt > SESSION_IDLE_MS && !session.busy) {
        sessions.delete(userId);
        continue;
      }
      try {
        await tickSession(session, now);
      } catch (error) {
        logger.warn(`[AIHOST] Error en el ciclo del usuario ${userId}`, error);
      }
    }
  } finally {
    ticking = false;
  }
}

async function handleLiveEvent({ eventName, payload }) {
  if (!payload || !payload.gameType || payload.gameType === 'overlay-test') return;
  if (!['comment', 'gift', 'follow', 'share', 'member'].includes(eventName)) return;

  const userId = extractUserId(payload.ownerKey);
  if (!userId) return;

  const entry = await loadActiveConfig(userId);
  if (!entry.config || !entry.config.enabled || !entry.hasAccess) return;

  const session = getSession(userId);
  session.lastEventAt = Date.now();
  session.lastActivityAt = Date.now();

  publishVisualEvent(userId, session, eventName, payload);

  const event = toEvent(eventName, payload, entry.config);
  if (event) enqueue(session, event);
}

// Lo que ve el espectador al instante en la pagina del juego (sin esperar a la IA): cada regalo, seguidor o compartido dispara una
// alerta y una reaccion del personaje, y los comentarios se ven en el chat de la pantalla.
function publishVisualEvent(userId, session, eventName, payload) {
  const user = payload.user || {};
  const who = { nickname: user.nickname || user.uniqueId || 'alguien', uniqueId: user.uniqueId || '' };

  if (eventName === 'gift') {
    if (!payload.repeatEnd) return;
    const count = Math.max(1, Math.round(Number(payload.repeatCount) || 1));
    emitLiveEvent('ai-host-event', { ownerKey: ownerKeyFor(userId), gameType: 'aihost', kind: 'gift', ...who, giftName: String(payload.giftName || 'un regalo').slice(0, 40), count, coins: (Number(payload.diamondCount) || 0) * count, at: Date.now() });
  } else if (eventName === 'follow' || eventName === 'share') {
    emitLiveEvent('ai-host-event', { ownerKey: ownerKeyFor(userId), gameType: 'aihost', kind: eventName, ...who, at: Date.now() });
  } else if (eventName === 'comment') {
    const now = Date.now();
    if (now - (session.lastChatEmitAt || 0) < 250) return; // maximo ~4 por segundo
    const text = prompt.sanitizeChatText(payload.comment, 160);
    if (!text) return;
    session.lastChatEmitAt = now;
    emitLiveEvent('ai-host-chat', { ownerKey: ownerKeyFor(userId), gameType: 'aihost', ...who, text, at: now });
  }
}

let started = false;
function start() {
  if (started) return;
  started = true;
  hub.on('live-event', (event) => {
    handleLiveEvent(event).catch((error) => logger.warn('[AIHOST] No se pudo procesar un evento', error));
  });
  setInterval(() => { tick(); }, TICK_MS).unref();

  // Red de seguridad para los tokens de los planes comprados (al arrancar y cada 30 minutos)
  const reconcile = () => credit.reconcileGrants().catch((error) => logger.error('[AIHOST] No se pudo reconciliar la entrega de tokens', error));
  setTimeout(reconcile, 8000).unref();
  setInterval(reconcile, 30 * 60 * 1000).unref();
  logger.info('[AIHOST] Co-anfitrion IA escuchando el live');
}

// ---------- pagina de control ----------

// Evento de prueba desde la pagina: el agente responde enseguida aunque el live este quieto
async function injectTest(userId, { kind = 'comment', text = '', nickname = 'Espectador de prueba', giftName = 'Rosa', coins = 1 } = {}) {
  const entry = await loadActiveConfig(userId);
  if (!entry.hasAccess) {
    const locked = new Error(entry.entitlement?.message || 'Tu plan no incluye el Co-anfitrión IA.');
    locked.status = 403;
    locked.code = 'AI_LOCKED';
    throw locked;
  }
  if (!entry.config) throw badRequest('Primero guarda la configuración del agente.');
  if (!hasApiKey()) {
    const error = new Error('El servidor todavía no tiene la clave de la IA (ANTHROPIC_API_KEY).');
    error.status = 503;
    throw error;
  }

  const session = getSession(userId);
  if (Date.now() - session.lastTestAt < TEST_MIN_GAP_MS) throw badRequest('Espera un momento antes de otra prueba.');
  session.lastTestAt = Date.now();
  session.lastEventAt = Date.now();
  session.lastActivityAt = Date.now();
  session.pausedUntil = 0;

  const base = { nickname: cleanText(nickname, 30) || 'Espectador de prueba', uniqueId: 'prueba', at: Date.now(), test: true };
  let event;
  if (kind === 'gift') event = { ...base, kind: 'gift', giftName: cleanText(giftName, 40) || 'Rosa', count: 1, coins: clampInt(coins, 1, 100000, 1) };
  else if (kind === 'follow') event = { ...base, kind: 'follow' };
  else {
    const cleanComment = cleanText(text, 200);
    if (cleanComment.length < 2) throw badRequest('Escribe un comentario de prueba.');
    event = { ...base, kind: 'comment', text: cleanComment, mention: prompt.mentionsAgent(cleanComment, entry.config.agentName), question: prompt.looksLikeQuestion(cleanComment) };
  }

  // La prueba funciona aunque el agente este apagado: usa la configuracion guardada
  enqueue(session, event);
  session.forceNext = true;
  session.speakingUntil = 0;
  return true;
}

function resetMemory(userId) {
  const session = sessions.get(userId);
  if (session) {
    session.memory = [];
    session.queue = [];
  }
}

async function getStatus(userId) {
  const config = await getOrCreateConfig(userId);
  const usage = await getUsageToday(userId);
  const session = sessions.get(userId);
  const entitlement = await credit.getEntitlement(userId);
  return {
    hasApiKey: hasApiKey(),
    enabled: config.enabled,
    model: config.model,
    usage,
    credit: {
      allowed: entitlement.allowed,
      reason: entitlement.reason,
      unlimited: entitlement.unlimited,
      tokensRemaining: entitlement.tokensRemaining,
      tokensGranted: entitlement.tokensGranted,
      approxResponses: entitlement.approx,
    },
    queue: session ? session.queue.length : 0,
    speaking: session ? Date.now() < session.speakingUntil : false,
    paused: session ? Date.now() < session.pausedUntil : false,
    lastError: session ? session.lastError : null,
  };
}

module.exports = {
  ALLOWED_MODELS,
  DEFAULTS,
  normalizeConfigInput,
  getOrCreateConfig,
  updateConfig,
  getStatus,
  getUsageToday,
  injectTest,
  resetMemory,
  estimateCostUsd,
  start,
  // para pruebas
  handleLiveEvent,
  tick,
  toEvent,
  pickBatch,
  setClientForTests,
  CHARACTERS,
  BACKGROUNDS,
  _sessions: sessions,
  _configCache: configCache,
};
