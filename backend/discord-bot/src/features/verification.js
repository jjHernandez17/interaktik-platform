const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ROLE_NAMES } = require('../config');

const VERIFY_BUTTON_ID = 'verify_member';
const WELCOME_MESSAGE_MARKER = 'interaktik-welcome-message';

function buildWelcomeMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x7c5cff)
    .setTitle('Bienvenido a la comunidad de interaktik')
    .setDescription(
      'Haz clic en **Verificarme** para desbloquear el resto del servidor: '
      + 'noticias y actualizaciones, chat de comunidad y soporte/reportes de bugs.',
    )
    .setFooter({ text: WELCOME_MESSAGE_MARKER });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_BUTTON_ID)
      .setLabel('✅ Verificarme')
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row] };
}

async function ensureWelcomeMessage(channel) {
  const recentMessages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const alreadyPosted = recentMessages?.some((message) => (
    message.author.id === channel.client.user.id
    && message.embeds[0]?.footer?.text === WELCOME_MESSAGE_MARKER
  ));

  if (alreadyPosted) return;

  await channel.send(buildWelcomeMessage());
}

async function handleVerifyButton(interaction) {
  const role = interaction.guild.roles.cache.find((r) => r.name === ROLE_NAMES.VERIFIED);

  if (!role) {
    await interaction.reply({
      content: 'No se encontró el rol "Verificado". Pídele a un admin que corra el script de setup.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.member.roles.cache.has(role.id)) {
    await interaction.reply({ content: 'Ya estás verificado. ¡Explora el servidor! 🎉', ephemeral: true });
    return;
  }

  await interaction.member.roles.add(role);
  await interaction.reply({ content: '¡Listo, quedaste verificado! Ya puedes ver el resto del servidor.', ephemeral: true });
}

module.exports = {
  VERIFY_BUTTON_ID,
  ensureWelcomeMessage,
  handleVerifyButton,
};
