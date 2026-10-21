// tiktokinteractik/backend/src/services/aiHostClient.js
//
// Llamada a Claude para el Co-anfitrion IA (SDK oficial de Anthropic). Pensado para respuestas cortas y baratas: sin
// razonamiento extendido y con esfuerzo bajo. Devuelve el texto, el uso de tokens y el motivo de parada.

'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const REQUEST_TIMEOUT_MS = 20000;

function createClient({ apiKey, sdk = Anthropic, fetch: customFetch } = {}) {
  const Sdk = sdk.default || sdk;
  const client = new Sdk({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1, ...(customFetch ? { fetch: customFetch } : {}) });

  async function generate({ model, system, user, maxTokens }) {
    const request = {
      model,
      max_tokens: maxTokens,
      // la persona y las reglas no cambian entre respuestas: se dejan en cache para pagar menos por ellas
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low' },
    };
    // Haiku 5.5 acepta apagar el razonamiento (con esfuerzo bajo); Sonnet 5.5 no lo acepta y simplemente razona poco con esfuerzo bajo
    if (/haiku/i.test(model)) {
      request.thinking = { type: 'disabled' };
    }

    const response = await client.messages.create(request);
    const text = (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ');

    return { text, usage: response.usage || {}, stopReason: response.stop_reason };
  }

  return { generate };
}

module.exports = { createClient };
