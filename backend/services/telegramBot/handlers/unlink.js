const supabase = require('../../../config/supabase');

/**
 * Handler para comando /unlink
 */
async function handleUnlink(bot, msg) {
  const chatId = msg.chat.id;

  try {
    // Busca usuário
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('telegram_chat_id', chatId.toString())
      .single();

    if (!user) {
      await bot.sendMessage(chatId, '❌ Você não está vinculado a nenhuma conta.');
      return;
    }

    // Desvincula
    const { error } = await supabase
      .from('users')
      .update({
        telegram_chat_id: null,
        telegram_username: null
      })
      .eq('id', user.id);

    if (error) throw error;

    await bot.sendMessage(chatId,
      '✅ *Telegram desvinculado com sucesso!*\n\n' +
      'Você não receberá mais alertas.\n\n' +
      'Para vincular novamente, acesse o aplicativo.',
      { parse_mode: 'Markdown' }
    );

    console.log(`[UNLINK] Usuário ${user.email} desvinculou Telegram`);

  } catch (error) {
    console.error('[UNLINK] Erro:', error);
    await bot.sendMessage(chatId, '❌ Erro ao desvincular. Tente novamente.');
  }
}

module.exports = handleUnlink;

