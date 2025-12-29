require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Verificar se as variáveis de ambiente estão configuradas
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erro: Variáveis de ambiente do Supabase não configuradas!');
  console.error('   Certifique-se de que o arquivo .env existe e contém:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_KEY ou SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('   Variáveis encontradas:');
  console.error('   - SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
  console.error('   - SUPABASE_SERVICE_KEY:', supabaseServiceKey ? '✅' : '❌');
  
  // Criar um cliente "dummy" para evitar erros de importação
  // Mas ele vai falhar quando tentar usar
  module.exports = {
    from: () => {
      throw new Error('Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_KEY no arquivo .env');
    }
  };
} else {
  // Criar cliente Supabase com service role key (tem acesso total)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  module.exports = supabase;
}

