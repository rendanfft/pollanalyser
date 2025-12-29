require('dotenv').config();
const fs = require('fs');

console.log('\n🔍 Verificando configuração...\n');

let hasErrors = false;
const checks = [];

// Verificar se .env existe
if (!fs.existsSync('.env')) {
  console.log('❌ Arquivo .env não encontrado!');
  console.log('   Execute: node create-env.js\n');
  process.exit(1);
}

// Verificar Supabase
if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('xxxxx')) {
  console.log('⚠️  SUPABASE_URL não configurado');
  hasErrors = true;
} else {
  console.log('✅ SUPABASE_URL configurado');
}

if (!process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY.includes('seu_service_role_key')) {
  console.log('⚠️  SUPABASE_SERVICE_KEY não configurado');
  hasErrors = true;
} else {
  console.log('✅ SUPABASE_SERVICE_KEY configurado');
}

// Verificar JWT
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.log('⚠️  JWT_SECRET não configurado ou muito curto (mínimo 32 caracteres)');
  hasErrors = true;
} else {
  console.log('✅ JWT_SECRET configurado');
}

// Verificar RPC
if (!process.env.BASE_RPC_URL) {
  console.log('⚠️  BASE_RPC_URL não configurado');
  hasErrors = true;
} else {
  console.log('✅ BASE_RPC_URL configurado:', process.env.BASE_RPC_URL);
}

// Telegram é opcional
if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === '') {
  console.log('⚠️  TELEGRAM_BOT_TOKEN não configurado (opcional)');
} else {
  console.log('✅ TELEGRAM_BOT_TOKEN configurado');
}

// Verificar outras configurações
console.log('✅ PORT:', process.env.PORT || 3000);
console.log('✅ NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('✅ CHECK_INTERVAL_MINUTES:', process.env.CHECK_INTERVAL_MINUTES || 5);

console.log('\n' + '='.repeat(50));

if (hasErrors) {
  console.log('\n❌ Configuração incompleta!');
  console.log('   Edite o arquivo .env e preencha os campos faltantes.\n');
  process.exit(1);
} else {
  console.log('\n✅ Configuração completa!');
  console.log('   Você pode iniciar o servidor com: npm start\n');
}


