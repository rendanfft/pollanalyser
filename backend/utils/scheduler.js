const cron = require('node-cron');
const { checkAllPools } = require('../services/poolMonitor');
require('dotenv').config();

let scheduledJob = null;

/**
 * Inicia o agendador de verificações
 */
function startScheduler() {
  const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5;
  
  console.log(`⏰ Agendador iniciado: verificando pools a cada ${intervalMinutes} minutos`);

  // Converter minutos para formato cron
  // A cada X minutos: */X * * * *
  const cronExpression = `*/${intervalMinutes} * * * *`;

  // Parar job anterior se existir
  if (scheduledJob) {
    scheduledJob.stop();
  }

  // Criar novo job
  scheduledJob = cron.schedule(cronExpression, async () => {
    console.log(`\n🔄 [${new Date().toISOString()}] Executando verificação agendada...`);
    try {
      await checkAllPools();
    } catch (error) {
      console.error('❌ Erro na verificação agendada:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "America/Sao_Paulo"
  });

  // Executar uma verificação imediata ao iniciar
  console.log('🚀 Executando verificação inicial...');
  checkAllPools().catch(error => {
    console.error('❌ Erro na verificação inicial:', error.message);
  });
}

/**
 * Para o agendador
 */
function stopScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    console.log('⏹️  Agendador parado');
  }
}

/**
 * Executa verificação manual (útil para testes)
 */
async function runManualCheck() {
  console.log('🔄 Executando verificação manual...');
  try {
    await checkAllPools();
  } catch (error) {
    console.error('❌ Erro na verificação manual:', error.message);
    throw error;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runManualCheck
};


