// tiktokinteractik/backend/src/services/aiHostVoice.js
//
// Voz realista (IA) de los personajes del Co-anfitrion IA, con OpenAI TTS (gpt-4o-mini-tts). Cada personaje tiene su voz y unas
// instrucciones de estilo (por ejemplo, Mochi suena como un gatito). El navegador pide el audio aqui y lo reproduce; si algo falla
// (sin clave, sin tokens, error del servicio) la pagina usa la voz del navegador como respaldo.
//
// Costo: la API no devuelve "tokens usados" de un audio, asi que se estima por caracteres (~15 caracteres por segundo hablado y unos
// $0.015 por minuto). Ese costo se descuenta de los mismos tokens del usuario (1 token = $0.0000001). Un texto repetido sale de una
// cache en memoria y no cuesta nada.

'use strict';

const crypto = require('node:crypto');

const OPENAI_URL = 'https://api.openai.com/v1/audio/speech';
const MODEL = process.env.AI_HOST_TTS_MODEL || 'gpt-4o-mini-tts';
// USD por caracter hablado (con un pequeno margen sobre ~$0.015/min a ~15 caracteres por segundo)
const COST_USD_PER_CHAR = Number(process.env.AI_HOST_TTS_USD_PER_CHAR) || 0.000017;
const MAX_CHARS = 420;

const VOICE_PROFILES = {
  mochi: {
    voice: 'shimmer',
    instructions:
      'Eres Mochi, un gatito de caricatura alegre, tierno y juguetón. Voz aguda, dulce y brillante, ritmo animado y cantarín, '
      + 'con ternura y picardía. Alarga un poquito algunas vocales como un maullido cariñoso ("miaau", "qué lindooo") y suelta '
      + 'alguna risita suave cuando algo da risa, sin exagerar ni sonar robótico. Habla en el idioma del texto.',
  },
};
const DEFAULT_PROFILE = {
  voice: 'coral',
  instructions: 'Habla de forma natural, cálida y expresiva, como un presentador amable de un live. Habla en el idioma del texto.',
};

const cache = new Map(); // clave -> Buffer (LRU simple)
const CACHE_MAX = 60;
const recent = new Map(); // userId -> [timestamps] para limitar abusos
const MAX_REQUESTS_PER_MINUTE = 24;

function profileFor(characterId) {
  return VOICE_PROFILES[characterId] || DEFAULT_PROFILE;
}

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

function clampSpeed(value) {
  const speed = Number(value);
  return Number.isFinite(speed) ? Math.min(1.3, Math.max(0.8, speed)) : 1;
}

// Cuantos tokens del usuario cuesta decir este texto (estimado)
function estimateTokens(text, tokensPerUsd) {
  return Math.max(1, Math.ceil(cleanText(text).length * COST_USD_PER_CHAR * tokensPerUsd));
}

function cacheKey(characterId, text, speed) {
  return crypto.createHash('sha1').update(`${MODEL}|${characterId}|${speed}|${text}`).digest('hex');
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
async function synthesize({ text, characterId, speed, fetchImpl = fetch }) {
  const input = cleanText(text);
  if (!input) {
    const error = new Error('No hay nada que decir.');
    error.status = 400;
    throw error;
  }
  const rate = clampSpeed(speed);
  const key = cacheKey(characterId, input, rate);
  if (cache.has(key)) {
    const hit = cache.get(key);
    cache.delete(key);
    cache.set(key, hit);
    return { audio: hit, cached: true };
  }
  if (!isConfigured()) {
    const error = new Error('La voz con IA todavía no está configurada en el servidor.');
    error.status = 503;
    error.code = 'NO_VOICE_KEY';
    throw error;
  }

  const profile = profileFor(characterId);
  const response = await fetchImpl(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      voice: profile.voice,
      input,
      instructions: profile.instructions,
      response_format: 'mp3',
      speed: rate,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`El servicio de voz respondió ${response.status}.`);
    error.status = 502;
    error.detail = detail.slice(0, 300);
    throw error;
  }

  const audio = Buffer.from(await response.arrayBuffer());
  cache.set(key, audio);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return { audio, cached: false };
}

module.exports = {
  MODEL,
  MAX_CHARS,
  COST_USD_PER_CHAR,
  VOICE_PROFILES,
  profileFor,
  isConfigured,
  cleanText,
  estimateTokens,
  allowRequest,
  synthesize,
  _cache: cache,
  _recent: recent,
};
