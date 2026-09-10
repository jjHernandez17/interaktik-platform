const { ChannelType } = require('discord.js');
const { DISCORD_GUILD_ID, CHANNEL_NAMES } = require('../config');
const { ensureWelcomeMessage } = require('../features/verification');
const { ensureTicketPanel } = require('../features/tickets');

module.exports = async function ready(client) {
  console.log(`[Discord Bot] Conectado como ${client.user.tag}`);

  const guild = await client.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
  if (!guild) {
    console.error(`[Discord Bot] No se encontró el servidor con ID ${DISCORD_GUILD_ID}. Revisa DISCORD_GUILD_ID.`);
    return;
  }

  await guild.channels.fetch();

  const welcomeChannel = guild.channels.cache.find(
    (c) => c.name === CHANNEL_NAMES.WELCOME && c.type === ChannelType.GuildText,
  );
  if (welcomeChannel) {
    await ensureWelcomeMessage(welcomeChannel);
  } else {
    console.warn(`[Discord Bot] No existe el canal #${CHANNEL_NAMES.WELCOME}. Corre scripts/setup-server.js.`);
  }

  const ticketChannel = guild.channels.cache.find(
    (c) => c.name === CHANNEL_NAMES.CREATE_TICKET && c.type === ChannelType.GuildText,
  );
  if (ticketChannel) {
    await ensureTicketPanel(ticketChannel);
  } else {
    console.warn(`[Discord Bot] No existe el canal #${CHANNEL_NAMES.CREATE_TICKET}. Corre scripts/setup-server.js.`);
  }

  console.log('[Discord Bot] Listo y a la escucha de interacciones.');
};
