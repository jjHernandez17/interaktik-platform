const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { ROLE_NAMES, CHANNEL_NAMES } = require('../config');

const CREATE_BUG_BUTTON_ID = 'create_ticket_bug';
const CREATE_SUPPORT_BUTTON_ID = 'create_ticket_support';
const CLOSE_TICKET_BUTTON_ID = 'close_ticket';
const TICKET_PANEL_MARKER = 'interaktik-ticket-panel';

const TICKET_TYPES = {
  [CREATE_BUG_BUTTON_ID]: { prefix: 'bug', label: 'reporte de bug', emoji: '🐛' },
  [CREATE_SUPPORT_BUTTON_ID]: { prefix: 'soporte', label: 'ticket de soporte', emoji: '🎫' },
};

function buildTicketPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x22d3ee)
    .setTitle('¿Necesitas ayuda?')
    .setDescription(
      '**🐛 Reportar bug** — algo no funciona como debería en la plataforma o en un juego.\n'
      + '**🎫 Soporte** — cualquier otra duda o problema con tu cuenta.\n\n'
      + 'Al hacer clic se abre un hilo privado solo visible para ti y el staff.',
    )
    .setFooter({ text: TICKET_PANEL_MARKER });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CREATE_BUG_BUTTON_ID).setLabel('Reportar bug').setEmoji('🐛').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CREATE_SUPPORT_BUTTON_ID).setLabel('Soporte').setEmoji('🎫').setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

async function ensureTicketPanel(channel) {
  const recentMessages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const alreadyPosted = recentMessages?.some((message) => (
    message.author.id === channel.client.user.id
    && message.embeds[0]?.footer?.text === TICKET_PANEL_MARKER
  ));

  if (alreadyPosted) return;

  await channel.send(buildTicketPanelMessage());
}

function buildCloseButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CLOSE_TICKET_BUTTON_ID).setLabel('Cerrar ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  );
}

async function logTicketEvent(guild, text) {
  const logChannel = guild.channels.cache.find(
    (c) => c.name === CHANNEL_NAMES.TICKETS_LOG && c.type === ChannelType.GuildText,
  );
  if (!logChannel) return;
  await logChannel.send(text).catch(() => {});
}

async function handleCreateTicket(interaction) {
  const ticketType = TICKET_TYPES[interaction.customId];
  if (!ticketType) return;

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'usuario';
  const threadName = `${ticketType.prefix}-${safeName}`.slice(0, 90);

  const thread = await interaction.channel.threads.create({
    name: threadName,
    type: ChannelType.PrivateThread,
    reason: `Ticket abierto por ${interaction.user.tag}`,
  });

  await thread.members.add(interaction.user.id).catch(() => {});

  const staffRole = interaction.guild.roles.cache.find((r) => r.name === ROLE_NAMES.STAFF);
  if (staffRole) {
    const staffMembers = interaction.guild.members.cache.filter((m) => m.roles.cache.has(staffRole.id));
    await Promise.all(staffMembers.map((m) => thread.members.add(m.id).catch(() => {})));
  }

  const embed = new EmbedBuilder()
    .setColor(ticketType.prefix === 'bug' ? 0xef4444 : 0x22d3ee)
    .setTitle(`${ticketType.emoji} Nuevo ${ticketType.label}`)
    .setDescription(
      ticketType.prefix === 'bug'
        ? `Hola <@${interaction.user.id}>, contanos:\n\n`
          + '**1.** ¿Qué esperabas que pasara?\n'
          + '**2.** ¿Qué pasó en realidad?\n'
          + '**3.** Pasos para reproducirlo\n'
          + '**4.** Captura de pantalla o video si tienes'
        : `Hola <@${interaction.user.id}>, contanos en qué te podemos ayudar. El staff te responderá pronto.`,
    );

  await thread.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buildCloseButtonRow()] });

  await interaction.reply({ content: `Se abrió tu ticket: ${thread}`, ephemeral: true });
  await logTicketEvent(interaction.guild, `🆕 ${ticketType.emoji} ${thread} abierto por **${interaction.user.tag}**`);
}

async function handleCloseTicket(interaction) {
  const thread = interaction.channel;
  if (!thread?.isThread?.()) return;

  const staffRole = interaction.guild.roles.cache.find((r) => r.name === ROLE_NAMES.STAFF);
  const isStaff = staffRole ? interaction.member.roles.cache.has(staffRole.id) : false;
  const isOwner = thread.name.endsWith(interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20));

  if (!isStaff && !isOwner && !interaction.member.permissions.has(PermissionFlagsBits.ManageThreads)) {
    await interaction.reply({ content: 'Solo el staff o quien abrió el ticket pueden cerrarlo.', ephemeral: true });
    return;
  }

  await interaction.reply({ content: 'Cerrando ticket... 🔒' });
  await logTicketEvent(interaction.guild, `🔒 ${thread} cerrado por **${interaction.user.tag}**`);
  await thread.setArchived(true).catch(() => {});
  await thread.setLocked(true).catch(() => {});
}

module.exports = {
  CREATE_BUG_BUTTON_ID,
  CREATE_SUPPORT_BUTTON_ID,
  CLOSE_TICKET_BUTTON_ID,
  ensureTicketPanel,
  handleCreateTicket,
  handleCloseTicket,
};
