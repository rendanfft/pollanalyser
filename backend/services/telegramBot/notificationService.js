const supabase = require('../../config/supabase');
const { formatOutOfRangeMessage, formatFeesMessage, formatILMessage } = require('./utils/messageFormatter');
const { checkCooldown, setCooldown } = require('./utils/cooldown');

let bot = null;

/**
 * Inicializa o serviço de notificações com o bot
 */
function initialize(botInstance) {
  bot = botInstance;
}

/**
 * Envia mensagem de forma segura com tratamento de erros
 */
async function sendMessageSafe(chatId, message, options = {}) {
  if (!bot) {
    console.warn('[NOTIFY] Bot não inicializado');
    return null;
  }

  try {
    return await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    });
  } catch (error) {
    // Usuário bloqueou o bot
    if (error.response?.statusCode === 403) {
      console.log(`[NOTIFY] Usuário ${chatId} bloqueou o bot`);
      await deactivateUserNotifications(chatId);
      return null;
    }

    // Chat não encontrado
    if (error.response?.statusCode === 400) {
      console.log(`[NOTIFY] Chat ${chatId} não encontrado`);
      return null;
    }

    // Outros erros
    console.error('[NOTIFY] Erro ao enviar mensagem:', error);
    throw error;
  }
}

/**
 * Desativa notificações do usuário
 */
async function deactivateUserNotifications(chatId) {
  try {
    await supabase
      .from('users')
      .update({ telegram_chat_id: null })
      .eq('telegram_chat_id', chatId.toString());
  } catch (error) {
    console.error('[NOTIFY] Erro ao desativar notificações:', error);
  }
}

/**
 * Envia alerta de pool fora do range
 */
async function sendOutOfRangeAlert(pool) {
  try {
    // Busca dados do usuário
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, email, name')
      .eq('id', pool.user_id)
      .single();

    if (userError || !user?.telegram_chat_id) {
      console.log(`[NOTIFY] Usuário ${pool.user_id} não tem Telegram vinculado`);
      return false;
    }

    // Verifica cooldown (não enviar alertas repetidos em menos de 1 hora)
    const cooldownKey = `out_of_range_${pool.id}`;
    if (checkCooldown(cooldownKey, 60)) { // 60 minutos
      console.log(`[NOTIFY] Pool ${pool.id} em cooldown`);
      return false;
    }

    // Monta mensagem
    const message = formatOutOfRangeMessage(pool);

    // Envia via Telegram
    const sentMessage = await sendMessageSafe(user.telegram_chat_id, message);

    if (sentMessage) {
      // Registra no histórico
      await saveAlertHistory(pool.id, 'out_of_range', message, sentMessage.message_id);

      // Atualiza cooldown
      setCooldown(cooldownKey);

      console.log(`[NOTIFY] ✅ Alerta enviado para usuário ${pool.user_id} (Pool ${pool.id})`);
      return true;
    }

    return false;

  } catch (error) {
    console.error('[NOTIFY] ❌ Erro ao enviar alerta:', error);

    // Salva erro no histórico
    await saveAlertHistory(pool.id, 'out_of_range', null, null, error.message);

    return false;
  }
}

/**
 * Envia alerta de fees acumulados
 */
async function sendFeesAlert(pool) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', pool.user_id)
      .single();

    if (!user?.telegram_chat_id) return false;

    const cooldownKey = `fees_${pool.id}`;
    if (checkCooldown(cooldownKey, 180)) return false; // 3 horas

    const message = formatFeesMessage(pool);

    const sentMessage = await sendMessageSafe(user.telegram_chat_id, message);

    if (sentMessage) {
      await saveAlertHistory(pool.id, 'fees_threshold', message, sentMessage.message_id);
      setCooldown(cooldownKey);
      return true;
    }

    return false;

  } catch (error) {
    console.error('[NOTIFY] Erro ao enviar alerta de fees:', error);
    return false;
  }
}

/**
 * Envia alerta de Impermanent Loss
 */
async function sendILAlert(pool) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', pool.user_id)
      .single();

    if (!user?.telegram_chat_id) return false;

    const cooldownKey = `il_${pool.id}`;
    if (checkCooldown(cooldownKey, 360)) return false; // 6 horas

    const message = formatILMessage(pool);

    const sentMessage = await sendMessageSafe(user.telegram_chat_id, message);

    if (sentMessage) {
      await saveAlertHistory(pool.id, 'il_threshold', message, sentMessage.message_id);
      setCooldown(cooldownKey);
      return true;
    }

    return false;

  } catch (error) {
    console.error('[NOTIFY] Erro ao enviar alerta de IL:', error);
    return false;
  }
}

/**
 * Envia alerta de pool voltou ao range
 */
async function sendBackInRangeAlert(pool) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', pool.user_id)
      .single();

    if (!user?.telegram_chat_id) return false;

    const cooldownKey = `back_in_range_${pool.id}`;
    if (checkCooldown(cooldownKey, 30)) return false; // 30 minutos

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const poolUrl = `${appUrl}/pools/${pool.id}`;

    const message =
      `✅ *Pool Voltou ao Range!*\n\n` +
      `*Pool:* ${pool.token0_symbol}/${pool.token1_symbol}\n` +
      `*Preço atual:* ${formatPrice(pool.current_price)}\n\n` +
      `Sua posição está *NO RANGE* novamente e está gerando fees!\n\n` +
      `[Ver Detalhes](${poolUrl})`;

    const sentMessage = await sendMessageSafe(user.telegram_chat_id, message);

    if (sentMessage) {
      await saveAlertHistory(pool.id, 'back_in_range', message, sentMessage.message_id);
      setCooldown(cooldownKey);
      return true;
    }

    return false;

  } catch (error) {
    console.error('[NOTIFY] Erro ao enviar alerta de volta ao range:', error);
    return false;
  }
}

/**
 * Salva alerta no histórico
 */
async function saveAlertHistory(poolId, alertType, message, telegramMessageId = null, error = null) {
  try {
    const { error: dbError } = await supabase
      .from('alerts_history')
      .insert({
        pool_id: poolId,
        alert_type: alertType,
        message: message || 'Erro ao gerar mensagem',
        sent_at: new Date().toISOString(),
        was_sent_telegram: !error,
        telegram_message_id: telegramMessageId,
        telegram_error: error
      });

    if (dbError) {
      console.error('[NOTIFY] Erro ao salvar histórico:', dbError);
    }
  } catch (err) {
    console.error('[NOTIFY] Erro ao salvar histórico:', err);
  }
}

/**
 * Formata preço (função auxiliar)
 */
function formatPrice(price) {
  if (!price) return 'N/A';
  const num = parseFloat(price);
  if (num >= 1000) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (num >= 1) {
    return `$${num.toFixed(4)}`;
  } else {
    return `$${num.toFixed(6)}`;
  }
}

module.exports = {
  initialize,
  sendOutOfRangeAlert,
  sendFeesAlert,
  sendILAlert,
  sendBackInRangeAlert,
  saveAlertHistory
};

