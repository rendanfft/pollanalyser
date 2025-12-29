require('dotenv').config();
const { getPositionData } = require('./services/uniswapService');
const { getPositionDataSimple } = require('./services/uniswapServiceSimple');

/**
 * Script para testar a integração com sua pool real
 * Pool: https://app.uniswap.org/positions/v3/base/4313325
 */

async function testYourPool() {
  console.log('🧪 TESTE DA SUA POOL\n');
  console.log('=========================================');
  console.log('Pool ID: 4313325');
  console.log('Chain: Base');
  console.log('Protocol: Uniswap V3');
  console.log('=========================================\n');

  try {
    console.log('⏳ Buscando dados da pool na blockchain...\n');

    let positionData;
    try {
      positionData = await getPositionData('4313325', 'base');
    } catch (error) {
      console.log('⚠️  Método completo falhou, tentando método simplificado...\n');
      positionData = await getPositionDataSimple('4313325', 'base');
      console.log('ℹ️  Usando método simplificado (sem verificação de range automática)\n');
    }

    console.log('✅ DADOS DA POOL:\n');
    if (positionData.poolAddress) {
      console.log('📍 Endereço da Pool:', positionData.poolAddress);
    } else {
      console.log('📍 Endereço da Pool: Não disponível (método simplificado)');
    }
    console.log('');
    
    console.log('💰 TOKENS:');
    console.log(`   Token 0: ${positionData.token0.symbol} (${positionData.token0.address})`);
    console.log(`   Token 1: ${positionData.token1.symbol} (${positionData.token1.address})`);
    console.log(`   Fee Tier: ${(positionData.fee / 10000).toFixed(2)}%`);
    console.log('');
    
    console.log('📊 RANGE DA POSIÇÃO:');
    console.log(`   Preço Inferior: ${positionData.range.priceLower} ${positionData.token1.symbol}`);
    console.log(`   Preço Superior: ${positionData.range.priceUpper} ${positionData.token1.symbol}`);
    console.log(`   Tick Inferior: ${positionData.range.tickLower}`);
    console.log(`   Tick Superior: ${positionData.range.tickUpper}`);
    console.log('');
    
    console.log('💹 SITUAÇÃO ATUAL:');
    if (positionData.current.price !== null) {
      console.log(`   Preço Atual: ${positionData.current.price} ${positionData.token1.symbol}`);
      console.log(`   Tick Atual: ${positionData.current.tick}`);
      console.log(`   Status: ${positionData.inRange ? '✅ NO RANGE (gerando fees)' : '❌ FORA DO RANGE (sem fees)'}`);
    } else {
      console.log(`   Preço Atual: Não disponível (precisa do endereço da pool)`);
      console.log(`   Status: Não disponível (precisa do endereço da pool)`);
      console.log(`   💡 Para verificar o status, adicione a pool no frontend com o pool_address`);
    }
    console.log('');
    
    console.log('🔢 LIQUIDEZ:');
    console.log(`   Liquidity: ${positionData.liquidity}`);
    console.log('');

    if (positionData.inRange !== null) {
      if (positionData.inRange) {
        console.log('✅ SUA POSIÇÃO ESTÁ NO RANGE!');
        console.log('   Você está gerando fees normalmente.');
      } else {
        console.log('⚠️  SUA POSIÇÃO ESTÁ FORA DO RANGE!');
        console.log('   Você NÃO está gerando fees.');
        console.log('   Considere rebalancear sua posição.');
      }
    } else {
      console.log('ℹ️  Status do range não disponível no método simplificado.');
      console.log('   Adicione a pool no frontend para monitoramento completo.');
    }

    console.log('\n=========================================');
    console.log('🎉 Teste concluído com sucesso!');
    console.log('=========================================\n');

    console.log('📝 PRÓXIMOS PASSOS:');
    console.log('   1. Configure seu .env com as credenciais');
    console.log('   2. Execute: npm start');
    console.log('   3. Adicione esta pool no frontend');
    console.log('   4. Configure seu Telegram Bot');
    console.log('   5. Pronto! Você receberá alertas automáticos\n');

  } catch (error) {
    console.error('\n❌ ERRO AO TESTAR POOL:', error.message);
    console.error('\n🔍 Possíveis causas:');
    console.error('   - RPC da Base não está funcionando');
    console.error('   - Position ID incorreto');
    console.error('   - Contratos do Uniswap V3 na Base mudaram');
    console.error('\n💡 Solução:');
    console.error('   - Verifique se o .env está configurado');
    console.error('   - Teste com: BASE_RPC_URL=https://mainnet.base.org');
    console.error('   - Confirme o Position ID no Uniswap\n');
  }
}

// Executa o teste
testYourPool();
