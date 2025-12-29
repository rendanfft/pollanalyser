const fs = require('fs');
const crypto = require('crypto');

console.log('📝 Criando arquivo .env com valores padrão...\n');

// Gerar JWT_SECRET aleatório
const jwtSecret = crypto.randomBytes(32).toString('hex');

const envContent = `# Supabase (obtenha em: Settings > API)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=seu_service_role_key_aqui

# JWT (gerado automaticamente - ALTERE EM PRODUÇÃO!)
JWT_SECRET=${jwtSecret}

# RPC Nodes (use Alchemy, Infura, ou public RPC)
BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/SEU_API_KEY

# Telegram Bot (obtenha com @BotFather - opcional)
TELEGRAM_BOT_TOKEN=

# Server
PORT=3000
NODE_ENV=development

# Intervalo de verificação (em minutos)
CHECK_INTERVAL_MINUTES=5
`;

try {
  if (fs.existsSync('.env')) {
    console.log('⚠️  Arquivo .env já existe. Não foi sobrescrito.');
    console.log('   Se quiser recriar, delete o arquivo .env primeiro.\n');
  } else {
    fs.writeFileSync('.env', envContent);
    console.log('✅ Arquivo .env criado com sucesso!');
    console.log(`✅ JWT_SECRET gerado automaticamente: ${jwtSecret.substring(0, 20)}...`);
    console.log('\n📝 PRÓXIMOS PASSOS:');
    console.log('   1. Edite o arquivo .env e preencha:');
    console.log('      - SUPABASE_URL');
    console.log('      - SUPABASE_SERVICE_KEY');
    console.log('      - TELEGRAM_BOT_TOKEN (opcional)');
    console.log('   2. Execute o SQL do SETUP.md no Supabase');
    console.log('   3. Teste: node test-pool.js');
    console.log('   4. Inicie: npm start\n');
  }
} catch (error) {
  console.error('❌ Erro ao criar .env:', error.message);
  process.exit(1);
}


