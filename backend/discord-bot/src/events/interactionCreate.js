const { VERIFY_BUTTON_ID, handleVerifyButton } = require('../features/verification');
const {
  CREATE_BUG_BUTTON_ID, CREATE_SUPPORT_BUTTON_ID, CLOSE_TICKET_BUTTON_ID,
  handleCreateTicket, handleCloseTicket,
} = require('../features/tickets');

module.exports = async function interactionCreate(interaction) {
  if (!interaction.isButton()) return;

  try {
    switch (interaction.customId) {
      case VERIFY_BUTTON_ID:
        await handleVerifyButton(interaction);
        break;
      case CREATE_BUG_BUTTON_ID:
      case CREATE_SUPPORT_BUTTON_ID:
        await handleCreateTicket(interaction);
        break;
      case CLOSE_TICKET_BUTTON_ID:
        await handleCloseTicket(interaction);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error('[Discord Bot] Error manejando interacción', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ocurrió un error, intenta de nuevo.', ephemeral: true }).catch(() => {});
    }
  }
};
