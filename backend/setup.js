const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('\n🚀 ========================================');
  console.log('🚀 Configuração do LiquidityGuard');
  console.log('🚀 ========================================\n');

  const env = {};

  // Supabase
  console.log('📦 CONFIGURAÇÃO DO SUPABASE');
  console.log('   Acesse: https://supabase.com > Seu Projeto > Settings > API\n');
  env.SUPABASE_URL = await question('   SUPABASE_URL: ');
  env.SUPABASE_SERVICE_KEY = await question('   SUPABASE_SERVICE_KEY (service_role): ');

  // JWT Secret
  console.log('\n🔐 CONFIGURAÇÃO JWT');
  console.log('   Gere uma chave secreta aleatória (mínimo 32 caracteres)\n');
  env.JWT_SECRET = await question('   JWT_SECRET (ou pressione Enter para gerar automaticamente): ');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    const crypto = require('crypto');
    env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.log(`   ✅ Gerado automaticamente: ${env.JWT_SECRET.substring(0, 20)}...`);
  }

  // RPC Nodes
  console.log('\n🌐 CONFIGURAÇÃO RPC NODES');
  env.BASE_RPC_URL = await question('   BASE_RPC_URL (ou Enter para usar público): ') || 'https://mainnet.base.org';
  env.ETHEREUM_RPC_URL = await question('   ETHEREUM_RPC_URL (opcional): ') || 'https://eth-mainnet.g.alchemy.com/v2/SEU_API_KEY';

  // Telegram
  console.log('\n📱 CONFIGURAÇÃO TELEGRAM');
  console.log('   Crie um bot com @BotFather no Telegram\n');
  env.TELEGRAM_BOT_TOKEN = await question('   TELEGRAM_BOT_TOKEN (ou Enter para pular): ') || '';

  // Server
  console.log('\n⚙️  CONFIGURAÇÃO DO SERVIDOR');
  env.PORT = await question('   PORT (ou Enter para 3000): ') || '3000';
  env.NODE_ENV = await question('   NODE_ENV (development/production, Enter para development): ') || 'development';
  env.CHECK_INTERVAL_MINUTES = await question('   CHECK_INTERVAL_MINUTES (ou Enter para 5): ') || '5';

  // Criar arquivo .env
  const envContent = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync('.env', envContent);
  console.log('\n✅ Arquivo .env criado com sucesso!');
  console.log('\n📝 PRÓXIMOS PASSOS:');
  console.log('   1. Execute o SQL do SETUP.md no Supabase SQL Editor');
  console.log('   2. Se a tabela já existe, execute MIGRATION_ADD_LAST_IN_RANGE.sql');
  console.log('   3. Teste sua pool: node test-pool.js');
  console.log('   4. Inicie o servidor: npm start\n');

  rl.close();
}

setup().catch(console.error);


