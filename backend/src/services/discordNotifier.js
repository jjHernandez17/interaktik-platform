const env = require('../config/env');
const logger = require('../config/logger');

async function notifyNewSignup(user) {
  if (!env.DISCORD_SIGNUP_WEBHOOK_URL) return;

  try {
    const response = await fetch(env.DISCORD_SIGNUP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '🎉 Nuevo usuario verificado',
          description: `**${user?.name || 'Usuario'}** (${user?.email || 'sin email'}) ya puede usar la plataforma.`,
          color: 0x7c5cff,
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!response.ok) {
      logger.warn(`Discord webhook respondió ${response.status} al notificar nuevo registro`);
    }
  } catch (error) {
    logger.warn('No se pudo notificar el nuevo registro a Discord', error);
  }
}

module.exports = { notifyNewSignup };
