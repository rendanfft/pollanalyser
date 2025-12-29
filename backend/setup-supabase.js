require('dotenv').config();
const supabase = require('./config/supabase');

async function setupSupabase() {
  console.log('\n🔍 Verificando conexão com Supabase...\n');

  try {
    // Testar conexão
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error && error.code === '42P01') {
      // Tabela não existe
      console.log('⚠️  Tabelas não encontradas no banco de dados.');
      console.log('\n📝 Você precisa executar o SQL do SETUP.md no Supabase SQL Editor.');
      console.log('   Passos:');
      console.log('   1. Acesse: https://supabase.com/dashboard');
      console.log('   2. Selecione seu projeto');
      console.log('   3. Vá em "SQL Editor" (menu lateral)');
      console.log('   4. Abra o arquivo SETUP.md neste projeto');
      console.log('   5. Copie TODO o SQL (linhas 19-104)');
      console.log('   6. Cole no SQL Editor e clique em "Run"');
      console.log('   7. Se a tabela já existe, execute também MIGRATION_ADD_LAST_IN_RANGE.sql\n');
      return false;
    } else if (error) {
      console.error('❌ Erro ao conectar com Supabase:', error.message);
      console.error('   Verifique se SUPABASE_URL e SUPABASE_SERVICE_KEY estão corretos.\n');
      return false;
    }

    console.log('✅ Conexão com Supabase estabelecida!');
    
    // Verificar se as tabelas existem
    console.log('\n🔍 Verificando tabelas...\n');

    const tables = ['users', 'monitored_pools', 'alerts_history', 'pool_metrics'];
    let allTablesExist = true;

    for (const table of tables) {
      try {
        const { error: tableError } = await supabase
          .from(table)
          .select('*')
          .limit(1);

        if (tableError) {
          console.log(`❌ Tabela "${table}" não existe`);
          allTablesExist = false;
        } else {
          console.log(`✅ Tabela "${table}" existe`);
        }
      } catch (err) {
        console.log(`❌ Erro ao verificar tabela "${table}":`, err.message);
        allTablesExist = false;
      }
    }

    if (!allTablesExist) {
      console.log('\n⚠️  Algumas tabelas estão faltando!');
      console.log('   Execute o SQL do SETUP.md no Supabase SQL Editor.\n');
      return false;
    }

    // Verificar se campo last_in_range existe
    console.log('\n🔍 Verificando campo last_in_range...\n');
    try {
      const { error: fieldError } = await supabase
        .from('monitored_pools')
        .select('last_in_range')
        .limit(1);

      if (fieldError && fieldError.message.includes('column') && fieldError.message.includes('does not exist')) {
        console.log('⚠️  Campo "last_in_range" não existe na tabela monitored_pools');
        console.log('   Execute o arquivo MIGRATION_ADD_LAST_IN_RANGE.sql no Supabase SQL Editor.\n');
        return false;
      } else {
        console.log('✅ Campo "last_in_range" existe');
      }
    } catch (err) {
      // Campo não existe
      console.log('⚠️  Campo "last_in_range" não existe');
      console.log('   Execute o arquivo MIGRATION_ADD_LAST_IN_RANGE.sql no Supabase SQL Editor.\n');
      return false;
    }

    console.log('\n✅ Banco de dados configurado corretamente!');
    console.log('   Você pode iniciar o servidor com: npm start\n');
    return true;

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return false;
  }
}

setupSupabase().then(success => {
  if (success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});


