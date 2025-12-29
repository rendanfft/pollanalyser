/**
 * Handler para comando /help
 */
async function handleHelp(bot, msg) {
  const chatId = msg.chat.id;

  const helpText =
    `📖 *Comandos Disponíveis*\n\n` +
    `*Gerais:*\n` +
    `/start - Vincular conta ou iniciar bot\n` +
    `/status - Ver status da vinculação\n` +
    `/pools - Listar pools monitoradas\n` +
    `/help - Mostrar esta ajuda\n\n` +
    `*Configuração:*\n` +
    `/unlink - Desvincular Telegram\n\n` +
    `*Alertas Recebidos:*\n` +
    `🚨 Pool fora do range\n` +
    `💰 Fees acumulados\n` +
    `📊 Impermanent Loss alto\n\n` +
    `*Precisa de ajuda?*\n` +
    `Acesse o aplicativo PollANALYSER`;

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  await bot.sendMessage(chatId, helpText, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
}

module.exports = handleHelp;

