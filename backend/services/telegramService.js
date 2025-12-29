const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const supabase = require('../config/supabase');

// Handlers
const { handleStartWithToken, handleStartWithoutToken } = require('./telegramBot/handlers/start');
const handleStatus = require('./telegramBot/handlers/status');
const handlePools = require('./telegramBot/handlers/pools');
const handleUnlink = require('./telegramBot/handlers/unlink');
const handleHelp = require('./telegramBot/handlers/help');

// Serviço de notificações
const notificationService = require('./telegramBot/notificationService');

let bot = null;

/**
 * Inicializa o bot do Telegram com polling
 */
function initializeBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN não configurado. Notificações Telegram desabilitadas.');
    return null;
  }

  try {
    // Inicializa bot com polling
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
      polling: {
        interval: 1000,
        autoStart: true
      }
    });

    // Inicializa serviço de notificações
    notificationService.initialize(bot);

    // Registra handlers de comandos
    registerHandlers();

    console.log('✅ Bot Telegram inicializado com sucesso!');
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'SeuPoolBot';
    console.log(`   Bot Username: @${botUsername}`);

    return bot;
  } catch (error) {
    console.error('❌ Erro ao inicializar bot Telegram:', error.message);
    return null;
  }
}

/**
 * Registra todos os handlers de comandos
 */
function registerHandlers() {
  // Comando /start com token
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const token = match[1];
    await handleStartWithToken(bot, msg, token);
  });

  // Comando /start sem token
  bot.onText(/\/start$/, async (msg) => {
    await handleStartWithoutToken(bot, msg);
  });

  // Comando /status
  bot.onText(/\/status/, async (msg) => {
    await handleStatus(bot, msg);
  });

  // Comando /pools
  bot.onText(/\/pools/, async (msg) => {
    await handlePools(bot, msg);
  });

  // Comando /unlink
  bot.onText(/\/unlink/, async (msg) => {
    await handleUnlink(bot, msg);
  });

  // Comando /help
  bot.onText(/\/help/, async (msg) => {
    await handleHelp(bot, msg);
  });

  // Handler de erros
  bot.on('polling_error', (error) => {
    console.error('[TELEGRAM] Erro no polling:', error);
  });

  console.log('✅ Handlers do bot registrados');
}

/**
 * Envia mensagem para um chat do Telegram (compatibilidade com código antigo)
 */
async function sendMessage(chatId, message) {
  if (!bot) {
    bot = initializeBot();
  }

  if (!bot) {
    console.warn('Bot Telegram não disponível');
    return false;
  }

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return true;
  } catch (error) {
    console.error(`Erro ao enviar mensagem Telegram para ${chatId}:`, error.message);
    return false;
  }
}

/**
 * Envia alerta de pool fora do range (compatibilidade com código antigo)
 */
async function sendOutOfRangeAlert(chatId, poolData) {
  // Converte formato antigo para novo
  const pool = {
    id: poolData.positionId,
    user_id: null, // Será buscado pelo chatId
    token0_symbol: poolData.token0Symbol,
    token1_symbol: poolData.token1Symbol,
    fee_tier: 0,
    chain: poolData.chain,
    protocol: 'uniswap-v3',
    current_price: poolData.currentPrice,
    price_lower: poolData.priceLower,
    price_upper: poolData.priceUpper
  };

  // Busca user_id pelo chatId
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_chat_id', chatId.toString())
    .single();

  if (user) {
    pool.user_id = user.id;
    return await notificationService.sendOutOfRangeAlert(pool);
  }

  return false;
}

/**
 * Envia alerta de pool voltou ao range (compatibilidade com código antigo)
 */
async function sendBackInRangeAlert(chatId, poolData) {
  const pool = {
    id: poolData.positionId,
    user_id: null,
    token0_symbol: poolData.token0Symbol,
    token1_symbol: poolData.token1Symbol,
    current_price: poolData.currentPrice
  };

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_chat_id', chatId.toString())
    .single();

  if (user) {
    pool.user_id = user.id;
    return await notificationService.sendBackInRangeAlert(pool);
  }

  return false;
}

/**
 * Envia alerta de meta de fees atingida (compatibilidade com código antigo)
 */
async function sendFeesGoalAlert(chatId, poolData, feesEarned) {
  const pool = {
    id: poolData.positionId,
    user_id: null,
    token0_symbol: poolData.token0Symbol,
    token1_symbol: poolData.token1Symbol,
    fees_uncollected_usd: feesEarned,
    alert_fees_threshold: poolData.alertFeesThreshold
  };

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_chat_id', chatId.toString())
    .single();

  if (user) {
    pool.user_id = user.id;
    return await notificationService.sendFeesAlert(pool);
  }

  return false;
}

/**
 * Envia alerta de IL alto (compatibilidade com código antigo)
 */
async function sendILAlert(chatId, poolData, ilPercentage) {
  const pool = {
    id: poolData.positionId,
    user_id: null,
    token0_symbol: poolData.token0Symbol,
    token1_symbol: poolData.token1Symbol,
    impermanent_loss: ilPercentage,
    alert_il_threshold: poolData.alertIlThreshold
  };

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_chat_id', chatId.toString())
    .single();

  if (user) {
    pool.user_id = user.id;
    return await notificationService.sendILAlert(pool);
  }

  return false;
}

// Exporta funções
module.exports = {
  initializeBot,
  sendMessage,
  sendOutOfRangeAlert,
  sendBackInRangeAlert,
  sendFeesGoalAlert,
  sendILAlert,
  notificationService // Exporta serviço de notificações para uso direto
};
