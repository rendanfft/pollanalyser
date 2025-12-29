const supabase = require('../../../config/supabase');

/**
 * Handler para comando /status
 */
async function handleStatus(bot, msg) {
  const chatId = msg.chat.id;

  try {
    // Busca usuário pelo chat_id
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, created_at')
      .eq('telegram_chat_id', chatId.toString())
      .single();

    if (error || !user) {
      await bot.sendMessage(chatId,
        '❌ *Você não está vinculado a nenhuma conta*\n\n' +
        'Use /start para vincular sua conta.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Busca pools monitoradas
    const { data: pools } = await supabase
      .from('monitored_pools')
      .select('id, token0_symbol, token1_symbol, is_active, last_checked_at')
      .eq('user_id', user.id);

    const activePools = pools?.filter(p => p.is_active).length || 0;
    const totalPools = pools?.length || 0;

    // Busca último alerta
    const poolIds = pools?.map(p => p.id) || [];
    let lastAlertText = '📬 Nenhum alerta enviado ainda';

    if (poolIds.length > 0) {
      const { data: lastAlert } = await supabase
        .from('alerts_history')
        .select('sent_at, alert_type')
        .in('pool_id', poolIds)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      if (lastAlert) {
        lastAlertText = `📬 Último alerta: ${formatRelativeTime(lastAlert.sent_at)}`;
      }
    }

    await bot.sendMessage(chatId,
      `✅ *Status da Conta*\n\n` +
      `👤 *Nome:* ${user.name || 'N/A'}\n` +
      `📧 *Email:* ${user.email}\n` +
      `📊 *Pools ativas:* ${activePools} de ${totalPools}\n` +
      `${lastAlertText}\n\n` +
      `Membro desde: ${formatDate(user.created_at)}`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('[STATUS] Erro:', error);
    await bot.sendMessage(chatId, '❌ Erro ao buscar status. Tente novamente.');
  }
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 60) return `${minutes}m atrás`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h atrás`;
  return `${Math.floor(minutes / 1440)}d atrás`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('pt-BR');
}

module.exports = handleStatus;

