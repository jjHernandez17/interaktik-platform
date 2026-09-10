// Script de un solo uso: crea los roles, categorias, canales y permisos de
// la comunidad de interaktik en un servidor de Discord vacio. Se puede
// volver a correr sin problema (no duplica lo que ya exista).
//
// Uso: node backend/discord-bot/scripts/setup-server.js
// Requisitos: el bot ya invitado al servidor con permisos de Administrador,
// y DISCORD_BOT_TOKEN / DISCORD_GUILD_ID configurados en backend/discord-bot/.env

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, ROLE_NAMES, CHANNEL_NAMES, CATEGORY_NAMES } = require('../src/config');

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Faltan DISCORD_BOT_TOKEN y/o DISCORD_GUILD_ID en backend/discord-bot/.env');
  process.exit(1);
}

async function ensureRole(guild, name, options = {}) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) {
    console.log(`  ✓ Rol "${name}" ya existe`);
    return existing;
  }
  const role = await guild.roles.create({ name, ...options });
  console.log(`  + Rol "${name}" creado`);
  return role;
}

async function ensureCategory(guild, name, overwrites) {
  const existing = guild.channels.cache.find((c) => c.name === name && c.type === ChannelType.GuildCategory);
  if (existing) {
    console.log(`  ✓ Categoría "${name}" ya existe`);
    return existing;
  }
  const category = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
  });
  console.log(`  + Categoría "${name}" creada`);
  return category;
}

async function ensureTextChannel(guild, name, parent, overwrites) {
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.type === ChannelType.GuildText && c.parentId === parent.id,
  );
  if (existing) {
    console.log(`    ✓ Canal #${name} ya existe`);
    return existing;
  }
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent.id,
    permissionOverwrites: overwrites,
  });
  console.log(`    + Canal #${name} creado`);
  return channel;
}

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(DISCORD_BOT_TOKEN);

  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();

  console.log(`\nConfigurando el servidor "${guild.name}"...\n`);

  console.log('Roles:');
  const verifiedRole = await ensureRole(guild, ROLE_NAMES.VERIFIED, { color: 0x22d3ee, mentionable: false });
  const staffRole = await ensureRole(guild, ROLE_NAMES.STAFF, {
    color: 0x7c5cff,
    mentionable: true,
    permissions: [PermissionFlagsBits.ManageThreads, PermissionFlagsBits.ManageMessages],
  });

  const everyoneId = guild.roles.everyone.id;
  const readOnlyForEveryone = [
    { id: everyoneId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  const verifiedOnlyCategory = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] },
  ];
  const staffOnlyCategory = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] },
  ];
  const readOnlyInVerifiedCategory = [
    { id: verifiedRole.id, deny: [PermissionFlagsBits.SendMessages] },
    { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] },
  ];

  console.log('\nCategoría INICIO:');
  const startCategory = await ensureCategory(guild, CATEGORY_NAMES.START, []);
  await ensureTextChannel(guild, CHANNEL_NAMES.WELCOME, startCategory, [
    { id: everyoneId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
  ]);
  await ensureTextChannel(guild, CHANNEL_NAMES.RULES, startCategory, readOnlyForEveryone);

  console.log('\nCategoría INFORMACIÓN:');
  const infoCategory = await ensureCategory(guild, CATEGORY_NAMES.INFO, verifiedOnlyCategory);
  await ensureTextChannel(guild, CHANNEL_NAMES.ANNOUNCEMENTS, infoCategory, readOnlyInVerifiedCategory);
  await ensureTextChannel(guild, CHANNEL_NAMES.UPDATES, infoCategory, readOnlyInVerifiedCategory);

  console.log('\nCategoría COMUNIDAD:');
  const communityCategory = await ensureCategory(guild, CATEGORY_NAMES.COMMUNITY, verifiedOnlyCategory);
  await ensureTextChannel(guild, CHANNEL_NAMES.GENERAL, communityCategory, []);
  await ensureTextChannel(guild, CHANNEL_NAMES.INTRODUCTIONS, communityCategory, []);
  await ensureTextChannel(guild, CHANNEL_NAMES.SUGGESTIONS, communityCategory, []);

  console.log('\nCategoría SOPORTE:');
  const supportCategory = await ensureCategory(guild, CATEGORY_NAMES.SUPPORT, verifiedOnlyCategory);
  await ensureTextChannel(guild, CHANNEL_NAMES.CREATE_TICKET, supportCategory, readOnlyInVerifiedCategory);

  console.log('\nCategoría STAFF:');
  const staffCategory = await ensureCategory(guild, CATEGORY_NAMES.STAFF, staffOnlyCategory);
  await ensureTextChannel(guild, CHANNEL_NAMES.STAFF_CHAT, staffCategory, []);
  await ensureTextChannel(guild, CHANNEL_NAMES.TICKETS_LOG, staffCategory, []);

  console.log('\n✅ Listo. Ahora corre "node index.js" (o npm start) para dejar el bot en línea.');
  console.log('   No olvides asignarte el rol "Staff" a ti y a tus moderadores manualmente.\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('Error configurando el servidor:', error);
  process.exit(1);
});
