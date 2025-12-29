const supabase = require('../../../config/supabase');

/**
 * Handler para comando /pools
 */
async function handlePools(bot, msg) {
  const chatId = msg.chat.id;

  try {
    // Busca usuário
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', chatId.toString())
      .single();

    if (!user) {
      await bot.sendMessage(chatId, '❌ Você não está vinculado. Use /start');
      return;
    }

    // Busca pools
    const { data: pools } = await supabase
      .from('monitored_pools')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!pools || pools.length === 0) {
      await bot.sendMessage(chatId,
        '📊 *Nenhuma pool monitorada*\n\n' +
        'Adicione pools no aplicativo para começar a monitorar!',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = `📊 *Suas Pools (${pools.length})*\n\n`;

    pools.forEach((pool, index) => {
      const status = pool.is_active ? '✅' : '⏸️';
      const inRange = pool.last_in_range ? '✓ No range' : '✗ Fora do range';
      const price = pool.current_price ? `$${parseFloat(pool.current_price).toFixed(4)}` : 'N/A';
      const fees = pool.fees_uncollected_usd ? `$${parseFloat(pool.fees_uncollected_usd).toFixed(2)}` : '$0.00';

      message +=
        `${status} *${index + 1}. ${pool.token0_symbol}/${pool.token1_symbol}*\n` +
        `   Chain: ${pool.chain} | Fee: ${(pool.fee_tier / 10000).toFixed(2)}%\n` +
        `   Preço: ${price} | ${inRange}\n` +
        `   Fees: ${fees}\n\n`;
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    message += `[Gerenciar no App](${appUrl}/pools)`;

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

  } catch (error) {
    console.error('[POOLS] Erro:', error);
    await bot.sendMessage(chatId, '❌ Erro ao buscar pools. Tente novamente.');
  }
}

module.exports = handlePools;

