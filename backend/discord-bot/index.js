const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { DISCORD_BOT_TOKEN } = require('./src/config');
const ready = require('./src/events/ready');
const interactionCreate = require('./src/events/interactionCreate');

if (!DISCORD_BOT_TOKEN) {
  console.error('[Discord Bot] Falta DISCORD_BOT_TOKEN en backend/discord-bot/.env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember, Partials.Channel],
});

client.once('ready', () => ready(client));
client.on('interactionCreate', interactionCreate);

client.on('error', (error) => {
  console.error('[Discord Bot] Error del cliente de Discord', error);
});

client.login(DISCORD_BOT_TOKEN).catch((error) => {
  console.error('[Discord Bot] No se pudo iniciar sesión. Revisa DISCORD_BOT_TOKEN.');
  console.error(error.message);
  process.exit(1);
});
