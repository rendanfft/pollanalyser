/**
 * Script para atualizar dados de uma pool existente
 * Uso: node update-pool-data.js <pool_id> <chain>
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const { getCompletePositionData } = require('./services/uniswapServiceV2');

// Verificar se as variáveis de ambiente estão configuradas
// Tentar ambos os nomes de variável (SUPABASE_SERVICE_KEY ou SUPABASE_SERVICE_ROLE_KEY)
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.SUPABASE_URL || !serviceKey) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas!');
  console.error('   Certifique-se de que o arquivo .env existe e contém:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_KEY ou SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('   Variáveis encontradas:');
  console.error('   - SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
  console.error('   - SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅' : '❌');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  serviceKey
);

async function updatePoolData(poolId, chain = 'base') {
  try {
    console.log(`🔍 Buscando pool ${poolId} na chain ${chain}...`);
    
    // Buscar dados atualizados da posição usando SDK do Uniswap
    const positionData = await getCompletePositionData(poolId, chain);
    
    console.log('📊 Dados obtidos:', {
      token0: positionData.token0.symbol,
      token1: positionData.token1.symbol,
      priceLower: positionData.range.priceLower,
      priceUpper: positionData.range.priceUpper,
      tickLower: positionData.range.tickLower,
      tickUpper: positionData.range.tickUpper,
      currentPrice: positionData.current.price,
      inRange: positionData.inRange
    });
    
    // Buscar pool no banco
    const { data: pool, error: fetchError } = await supabase
      .from('monitored_pools')
      .select('*')
      .eq('pool_id', poolId)
      .eq('chain', chain)
      .single();
    
    if (fetchError || !pool) {
      console.error('❌ Pool não encontrada no banco:', fetchError);
      return;
    }
    
    console.log('✅ Pool encontrada:', pool.id);
    
    // Atualizar dados
    const { data: updatedPool, error: updateError } = await supabase
      .from('monitored_pools')
      .update({
        token0_symbol: positionData.token0.symbol,
        token1_symbol: positionData.token1.symbol,
        price_lower: parseFloat(positionData.range.priceLower).toString(),
        price_upper: parseFloat(positionData.range.priceUpper).toString(),
        fee_tier: positionData.fee,
        current_price: positionData.current.price ? positionData.current.price.toString() : null,
        fees_uncollected_usd: positionData.fees && positionData.fees.totalUSD ? parseFloat(positionData.fees.totalUSD) : null,
        last_checked_at: new Date().toISOString(),
        last_in_range: positionData.inRange
      })
      .eq('id', pool.id)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Erro ao atualizar pool:', updateError);
      return;
    }
    
    console.log('✅ Pool atualizada com sucesso!');
    console.log('📊 Novos valores:', {
      price_lower: updatedPool.price_lower,
      price_upper: updatedPool.price_upper,
      token0_symbol: updatedPool.token0_symbol,
      token1_symbol: updatedPool.token1_symbol
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Executar
const poolId = process.argv[2];
const chain = process.argv[3] || 'base';

if (!poolId) {
  console.error('❌ Uso: node update-pool-data.js <pool_id> [chain]');
  console.error('   Exemplo: node update-pool-data.js 4313325 base');
  process.exit(1);
}

updatePoolData(poolId, chain).then(() => {
  console.log('✅ Processo concluído!');
  process.exit(0);
});

