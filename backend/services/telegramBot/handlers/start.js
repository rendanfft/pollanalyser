const supabase = require('../../../config/supabase');

/**
 * Handler para comando /start com token
 */
async function handleStartWithToken(bot, msg, token) {
  const chatId = msg.chat.id;
  const telegramUsername = msg.from.username || 'N/A';
  const telegramFirstName = msg.from.first_name || 'Usuário';

  console.log(`[TELEGRAM] Tentativa de vinculação: ${token} por ${telegramUsername}`);

  try {
    // 1. Busca e valida o token
    const { data: linkData, error: linkError } = await supabase
      .from('telegram_link_tokens')
      .select('*, users(email, name)')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (linkError || !linkData) {
      await bot.sendMessage(chatId,
        '❌ *Token inválido ou expirado*\n\n' +
        'Gere um novo token no aplicativo e tente novamente.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // 2. Verifica se chat_id já está em uso por outro usuário
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('telegram_chat_id', chatId.toString())
      .single();

    if (existingUser && existingUser.id !== linkData.user_id) {
      await bot.sendMessage(chatId,
        '⚠️ *Este Telegram já está vinculado a outra conta*\n\n' +
        `Email vinculado: ${existingUser.email}\n\n` +
        'Use /unlink para desvincular primeiro.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // 3. Vincula o chat_id ao usuário
    const { error: updateError } = await supabase
      .from('users')
      .update({
        telegram_chat_id: chatId.toString(),
        telegram_username: telegramUsername,
        updated_at: new Date().toISOString()
      })
      .eq('id', linkData.user_id);

    if (updateError) throw updateError;

    // 4. Marca token como usado
    await supabase
      .from('telegram_link_tokens')
      .update({ used: true })
      .eq('token', token);

    // 5. Busca pools ativas do usuário
    const { data: pools } = await supabase
      .from('monitored_pools')
      .select('token0_symbol, token1_symbol')
      .eq('user_id', linkData.user_id)
      .eq('is_active', true);

    const poolCount = pools?.length || 0;

    // 6. Confirma vinculação
    await bot.sendMessage(chatId,
      `✅ *Telegram vinculado com sucesso!*\n\n` +
      `Olá, ${telegramFirstName}! 👋\n\n` +
      `📧 Email: ${linkData.users.email}\n` +
      `📊 Pools monitoradas: ${poolCount}\n\n` +
      `Você receberá alertas quando:\n` +
      `• Pool sair do range configurado\n` +
      `• Fees acumulados atingirem o limite\n` +
      `• Impermanent Loss ultrapassar threshold\n\n` +
      `Use /help para ver todos os comandos.`,
      { parse_mode: 'Markdown' }
    );

    console.log(`[TELEGRAM] ✅ Vinculação bem-sucedida: User ${linkData.user_id} -> Chat ${chatId}`);

  } catch (error) {
    console.error('[TELEGRAM] ❌ Erro na vinculação:', error);
    await bot.sendMessage(chatId,
      '❌ Erro ao vincular conta. Tente novamente mais tarde.'
    );
  }
}

/**
 * Handler para comando /start sem token (primeira vez)
 */
async function handleStartWithoutToken(bot, msg) {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId,
    '👋 *Bem-vindo ao PollANALYSER Bot!*\n\n' +
    'Para receber alertas das suas pools:\n\n' +
    '1️⃣ Acesse o aplicativo PollANALYSER\n' +
    '2️⃣ Vá em Configurações → Telegram\n' +
    '3️⃣ Clique em "Conectar Telegram"\n' +
    '4️⃣ Siga as instruções\n\n' +
    'Precisa de ajuda? Use /help',
    { parse_mode: 'Markdown' }
  );
}

module.exports = {
  handleStartWithToken,
  handleStartWithoutToken
};

