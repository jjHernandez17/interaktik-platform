// tiktokinteractik/backend/src/services/aiHostEstimate.js
//
// Estimado del gasto de tokens por respuesta del Co-anfitrion IA segun TODA la configuracion que el usuario tiene puesta: arma el
// mismo prompt que usa el agente (con su personalidad, "sobre ti", modelo, largo maximo...) y lo valora con los precios reales del modelo,
// mas la voz de IA si la usa. Es un promedio para que el usuario sepa cuanto le va a durar su saldo; el descuento real siempre es el
// costo de cada llamada.

'use strict';

const prompt = require('./aiHostPrompt');
const credit = require('./aiHostCredit');
const voice = require('./aiHostVoice');

const CHARS_PER_TOKEN = 3.2; // el espanol rinde ~3.3 caracteres por token; se redondea hacia arriba para no quedarse corto
const TYPICAL_REPLY_RATIO = 0.7; // las frases suelen quedar por debajo del maximo
const EXTRA_THINKING_TOKENS = { sonnet: 120, haiku: 0 };
const SAMPLE_COMMENT = 'Hola, ¿cómo estás hoy? me encanta tu live, ¿qué vas a hacer ahora?';

const tokensOf = (text) => Math.ceil(String(text || '').length / CHARS_PER_TOKEN);

// Cuantos eventos trae en promedio cada respuesta (mas eventos = mas entrada). Supone un chat con actividad normal.
function eventsPerResponse(config) {
  let events = config.replyMode === 'all' ? 3 : 2;
  if (config.thankGifts || config.greetFollowers) events += 1;
  if (config.greetViewers) events += 1;
  if (config.cadenceSeconds >= 20) events += 1; // con pausas largas se acumulan mas comentarios por respuesta
  return Math.min(events, 8);
}

// `models` = ALLOWED_MODELS del servicio (precios por millon de tokens). `voiceAi` = si usa la voz realista con IA.
function estimate(config, { models, voiceAi = false } = {}) {
  const price = models[config.model] || models['claude-haiku-5-5'];
  const sonnet = /sonnet/i.test(config.model);
  const toUnits = (usd) => Math.round(credit.costToTokens(usd) * (usd > 0 ? 1 : 0));
  const inCost = (tokens) => (tokens * price.inputPerMTok) / 1e6;
  const outCost = (tokens) => (tokens * price.outputPerMTok) / 1e6;

  const maxChars = Math.max(80, Math.min(400, Number(config.maxChars) || 220));
  const typicalChars = Math.round(maxChars * TYPICAL_REPLY_RATIO);

  // entrada 1: instrucciones fijas del agente (reglas, formato, nombre, tono, idioma)
  const baseSystem = prompt.buildSystemPrompt({ ...config, persona: '', aboutStreamer: '' });
  const baseTokens = tokensOf(baseSystem);
  // entrada 2: lo que escribio el usuario (detalles de personalidad y "sobre ti")
  const personaTokens = Math.max(0, tokensOf(prompt.buildSystemPrompt(config)) - baseTokens);

  // entrada 3: comentarios nuevos + lo ultimo que ya dijo (memoria, hasta 8 frases)
  const events = Array.from({ length: eventsPerResponse(config) }, (_, i) => ({ kind: 'comment', nickname: `usuario${i + 1}`, uniqueId: `usuario${i + 1}`, text: SAMPLE_COMMENT }));
  const memory = Array.from({ length: 6 }, () => 'x'.repeat(typicalChars));
  const withMemory = prompt.buildTurnMessage({ events, memory, stats: { minutes: 30, coins: 100, gifters: 3, follows: 5 } });
  const withoutMemory = prompt.buildTurnMessage({ events, memory: [], stats: { minutes: 30, coins: 100, gifters: 3, follows: 5 } });
  const eventsTokens = tokensOf(withoutMemory);
  const memoryTokens = Math.max(0, tokensOf(withMemory) - eventsTokens);

  // salida: etiqueta [emocion, accion] + la frase (+ un poco de razonamiento en Sonnet)
  const outputTokens = tokensOf('x'.repeat(typicalChars)) + 12 + (sonnet ? EXTRA_THINKING_TOKENS.sonnet : EXTRA_THINKING_TOKENS.haiku);

  const rows = {
    instructions: toUnits(inCost(baseTokens)),
    personality: toUnits(inCost(personaTokens)),
    chat: toUnits(inCost(eventsTokens + memoryTokens)),
    reply: toUnits(outCost(outputTokens)),
    voice: voiceAi ? Math.round(typicalChars * Math.round(voice.COST_USD_PER_CHAR * credit.TOKENS_PER_USD)) : 0,
  };
  const total = rows.instructions + rows.personality + rows.chat + rows.reply + rows.voice;

  // en un live muy activo: cuantas respuestas por hora como maximo y cuanto gastarian
  const speakSeconds = prompt.estimateSpeechMs('x'.repeat(typicalChars), config.voiceRate) / 1000;
  const gapSeconds = Math.max(Number(config.cadenceSeconds) || 8, speakSeconds + 2);
  const responsesPerHour = Math.min(Math.floor(3600 / gapSeconds), 2000);

  return {
    model: config.model,
    typicalChars,
    eventsPerResponse: events.length,
    rows,
    total,
    responsesPerHour,
    perHourMax: total * responsesPerHour,
  };
}

module.exports = { estimate, tokensOf };
