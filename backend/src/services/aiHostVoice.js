// tiktokinteractik/backend/src/services/aiHostVoice.js
//
// Voz realista (IA) de los personajes del Co-anfitrion IA, con ElevenLabs. Cada personaje tiene su propia voz (un "voice id" de la
// biblioteca de ElevenLabs): se define con ELEVENLABS_VOICE_<PERSONAJE> (por ejemplo ELEVENLABS_VOICE_MOCHI) o, como respaldo comun,
// con ELEVENLABS_VOICE_ID. El navegador pide el audio aqui y lo reproduce; si algo falla (sin clave, sin tokens, error del servicio) la
// pagina usa la "voz sin costo" del navegador.
//
// Costo: el audio no devuelve "tokens usados", asi que se estima por caracteres (ELEVENLABS_USD_PER_CHAR, segun el plan contratado) y
// se descuenta de los mismos tokens del usuario (1 token = $0.0000001), pero SOLO cuando la pagina confirma que el audio sono
// (recibos). Un texto repetido sale de una cache en memoria y no cuesta nada.

'use strict';

const crypto = require('node:crypto');
const providerAlerts = require('./providerAlerts');

const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
// USD por caracter hablado. Medido con el plan Starter ($6 por 30.000 creditos = $0.0002 por credito): ElevenLabs descuenta ~0.4 creditos
// por caracter con eleven_multilingual_v2 (35 creditos por 87 caracteres), es decir ~$0.00008 por caracter. Ajustalo si cambias de plan o modelo.
const COST_USD_PER_CHAR = Number(process.env.ELEVENLABS_USD_PER_CHAR) || 0.00008;
const MAX_CHARS = 420;
// ElevenLabs limita cuantas peticiones puede tener abiertas a la vez la cuenta (en los planes pequenos ~3). Si se piden varias frases juntas
// (por ejemplo las 4 partes de una presentacion), las de mas reciben 429 y esa frase caia a la voz del navegador a mitad de mensaje. Por eso
// se hacen de a pocas y, si aun asi falla algo pasajero, se reintenta.
const MAX_CONCURRENT = Math.max(1, Number(process.env.ELEVENLABS_MAX_CONCURRENCY) || 2);
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

let activeRequests = 0;
const waiting = [];
async function withSlot(task) {
  if (activeRequests >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  activeRequests += 1;
  try {
    return await task();
  } finally {
    activeRequests -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TTS_TIMEOUT_MS = 15000;

// Ajustes de voz por personaje (la voz en si, el "voice id", viene del entorno). stability baja = mas expresiva.
const CHARACTER_SETTINGS = {
  mochi: { stability: 0.4, similarity: 0.8, envKey: 'ELEVENLABS_VOICE_MOCHI' },
  cj: { stability: 0.4, similarity: 0.8, envKey: 'ELEVENLABS_VOICE_CJ' },
};
const DEFAULT_SETTINGS = { stability: 0.45, similarity: 0.8, envKey: null };

// "style" segun la emocion de la frase (la misma etiqueta que mueve la cara del personaje): mas alto = mas actuado
const EMOTION_STYLE = {
  neutral: 0.25,
  feliz: 0.4,
  emocionado: 0.65,
  sorprendido: 0.55,
  pensando: 0.2,
  risa: 0.55,
  carino: 0.35,
  picaro: 0.5,
  triste: 0.3,
};

const cache = new Map(); // clave -> Buffer (LRU simple)
const CACHE_MAX = 60;
const recent = new Map(); // userId -> [timestamps] para limitar abusos
const MAX_REQUESTS_PER_MINUTE = 24;

// Recibos: el audio se genera sin cobrar; los tokens solo se descuentan cuando la pagina confirma que el audio SONO (un solo uso por recibo).
const receipts = new Map(); // id -> { userId, cost, expires }
const RECEIPT_TTL_MS = 5 * 60 * 1000;

function settingsFor(characterId) {
  return CHARACTER_SETTINGS[characterId] || DEFAULT_SETTINGS;
}

// El voice id de este personaje (o el comun de respaldo)
function voiceIdFor(characterId) {
  const { envKey } = settingsFor(characterId);
  return (envKey && process.env[envKey]) || process.env.ELEVENLABS_VOICE_ID || '';
}

function isConfigured(characterId = 'mochi') {
  return Boolean(process.env.ELEVENLABS_API_KEY && voiceIdFor(characterId));
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

function clampSpeed(value) {
  const speed = Number(value);
  return Number.isFinite(speed) ? Math.min(1.2, Math.max(0.7, speed)) : 1;
}

// Cuantos tokens del usuario cuesta decir este texto (estimado)
function estimateTokens(text, tokensPerUsd) {
  return Math.max(1, Math.ceil(cleanText(text).length * COST_USD_PER_CHAR * tokensPerUsd));
}

function cacheKey(voiceId, text, speed, emotion) {
  return crypto.createHash('sha1').update(`${MODEL}|${voiceId}|${emotion}|${speed}|${text}`).digest('hex');
}

function createReceipt(userId, cost, now = Date.now()) {
  for (const [id, receipt] of receipts) if (receipt.expires < now) receipts.delete(id);
  const id = crypto.randomBytes(12).toString('hex');
  receipts.set(id, { userId, cost, expires: now + RECEIPT_TTL_MS });
  return id;
}

// Devuelve el costo y gasta el recibo, o null si no existe, es de otro usuario, ya se uso o vencio
function takeReceipt(userId, id, now = Date.now()) {
  const receipt = receipts.get(String(id || ''));
  if (!receipt) return null;
  receipts.delete(String(id));
  if (receipt.userId !== userId || receipt.expires < now) return null;
  return receipt.cost;
}

function allowRequest(userId, now = Date.now()) {
  const list = (recent.get(userId) || []).filter((t) => now - t < 60000);
  if (list.length >= MAX_REQUESTS_PER_MINUTE) {
    recent.set(userId, list);
    return false;
  }
  list.push(now);
  recent.set(userId, list);
  return true;
}

// Devuelve { audio: Buffer, cached: boolean }. `fetchImpl` se puede inyectar para pruebas.
async function synthesize({ text, characterId, speed, emotion, fetchImpl = fetch, retryDelayMs = 700 }) {
  const input = cleanText(text);
  if (!input) {
    const error = new Error('No hay nada que decir.');
    error.status = 400;
    throw error;
  }
  const rate = clampSpeed(speed);
  const mood = Object.prototype.hasOwnProperty.call(EMOTION_STYLE, emotion) ? emotion : 'neutral';
  const voiceId = voiceIdFor(characterId);
  const key = cacheKey(voiceId, input, rate, mood);
  if (cache.has(key)) {
    const hit = cache.get(key);
    cache.delete(key);
    cache.set(key, hit);
    return { audio: hit, cached: true };
  }
  if (!isConfigured(characterId)) {
    const error = new Error('La voz con IA todavía no está configurada en el servidor.');
    error.status = 503;
    error.code = 'NO_VOICE_KEY';
    throw error;
  }

  const settings = settingsFor(characterId);
  const body = JSON.stringify({
    text: input,
    model_id: MODEL,
    voice_settings: {
      stability: settings.stability,
      similarity_boost: settings.similarity,
      style: EMOTION_STYLE[mood],
      use_speaker_boost: true,
      speed: rate,
    },
  });
  const request = () => fetchImpl(`${ELEVEN_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body,
  });

  // fallas pasajeras (demasiadas peticiones a la vez, error del servicio o red) se reintentan antes de rendirse
  let response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await withSlot(request);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(retryDelayMs * attempt);
      continue;
    }
    if (response.ok || !RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) break;
    await sleep(retryDelayMs * attempt);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // sin creditos / sin plan / clave invalida: se avisa al superusuario
    const kind = providerAlerts.classifyElevenLabs(response.status, detail);
    if (kind) providerAlerts.report('elevenlabs', kind);
    const error = new Error(`El servicio de voz respondió ${response.status}.`);
    error.status = 502;
    error.detail = detail.slice(0, 300);
    throw error;
  }

  const audio = Buffer.from(await response.arrayBuffer());
  providerAlerts.clear('elevenlabs');
  cache.set(key, audio);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return { audio, cached: false };
}

module.exports = {
  MODEL,
  MAX_CHARS,
  COST_USD_PER_CHAR,
  EMOTION_STYLE,
  CHARACTER_SETTINGS,
  voiceIdFor,
  isConfigured,
  cleanText,
  estimateTokens,
  createReceipt,
  takeReceipt,
  allowRequest,
  synthesize,
  _cache: cache,
  _recent: recent,
  _receipts: receipts,
};
