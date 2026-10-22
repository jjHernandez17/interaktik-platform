// tiktokinteractik/backend/src/services/providerAlerts.js
//
// Avisos para el superusuario cuando un proveedor de IA deja de funcionar por algo que se arregla con dinero o con una clave:
// Anthropic (respuestas del agente) o ElevenLabs (voz). Se detectan en el momento en que fallan las llamadas reales, se guardan en
// memoria y se quitan solos en cuanto la siguiente llamada funciona. Tambien quedan en el log del servidor.

'use strict';

const logger = require('../config/logger');

const PROVIDERS = { anthropic: 'Anthropic (respuestas del agente)', elevenlabs: 'ElevenLabs (voz de IA)' };

const MESSAGES = {
  anthropic: {
    credit: 'Anthropic se quedó sin saldo: el agente de IA no puede responder. Recarga en console.anthropic.com → Billing.',
    auth: 'La clave de Anthropic (ANTHROPIC_API_KEY) es inválida o fue revocada: el agente de IA no puede responder.',
  },
  elevenlabs: {
    credit: 'ElevenLabs se quedó sin créditos: la voz de IA no suena y se usa la voz sin costo. Recarga o sube de plan en elevenlabs.io/app/subscription.',
    plan: 'ElevenLabs rechazó la voz (requiere un plan de pago o una voz permitida para la API): se usa la voz sin costo.',
    auth: 'La clave de ElevenLabs (ELEVENLABS_API_KEY) es inválida o no tiene permiso de texto a voz.',
  },
};

const alerts = new Map(); // proveedor -> { provider, kind, message, at, count }

function report(provider, kind) {
  const message = MESSAGES[provider]?.[kind];
  if (!message) return;
  const previous = alerts.get(provider);
  const same = previous && previous.kind === kind;
  alerts.set(provider, { provider, label: PROVIDERS[provider], kind, message, at: same ? previous.at : Date.now(), lastAt: Date.now(), count: same ? previous.count + 1 : 1 });
  if (!same) logger.error(`[ALERTA] ${PROVIDERS[provider]}: ${message}`);
}

function clear(provider) {
  if (alerts.delete(provider)) logger.info(`[ALERTA] ${PROVIDERS[provider]} vuelve a funcionar`);
}

function list() {
  return [...alerts.values()];
}

// Error del SDK de Anthropic -> 'credit' | 'auth' | null (otros errores, como un corte de red, no son alertas)
function classifyAnthropic(error) {
  const status = Number(error?.status) || 0;
  const text = String(error?.message || '');
  if (/credit balance is too low|plans? & billing|billing/i.test(text) && (status === 400 || status === 402 || status === 403)) return 'credit';
  if (status === 402) return 'credit';
  if (status === 401) return 'auth';
  return null;
}

// Respuesta de error de ElevenLabs -> 'credit' | 'plan' | 'auth' | null
function classifyElevenLabs(status, bodyText) {
  const text = String(bodyText || '');
  if (/quota_exceeded|insufficient_credits|exceeds your quota|credits? remaining/i.test(text)) return 'credit';
  if (status === 402 || /payment_required|paid_plan_required/i.test(text)) return 'plan';
  if (status === 401 || /invalid_api_key|missing_permissions/i.test(text)) return 'auth';
  return null;
}

module.exports = { report, clear, list, classifyAnthropic, classifyElevenLabs, _alerts: alerts };
