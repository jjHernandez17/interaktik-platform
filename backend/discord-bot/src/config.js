require('dotenv').config();

const ROLE_NAMES = {
  VERIFIED: 'Verificado',
  STAFF: 'Staff',
};

const CHANNEL_NAMES = {
  WELCOME: 'bienvenida',
  RULES: 'reglas',
  ANNOUNCEMENTS: 'anuncios',
  UPDATES: 'actualizaciones',
  GENERAL: 'general',
  INTRODUCTIONS: 'presentaciones',
  SUGGESTIONS: 'sugerencias',
  CREATE_TICKET: 'crear-ticket',
  STAFF_CHAT: 'staff-chat',
  TICKETS_LOG: 'tickets-log',
};

const CATEGORY_NAMES = {
  START: '📋 INICIO',
  INFO: '📰 INFORMACIÓN',
  COMMUNITY: '💬 COMUNIDAD',
  SUPPORT: '🛠️ SOPORTE',
  STAFF: '🔒 STAFF',
};

module.exports = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  ROLE_NAMES,
  CHANNEL_NAMES,
  CATEGORY_NAMES,
};
