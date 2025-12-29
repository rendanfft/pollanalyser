const { getPositionData } = require('./uniswapService');
const supabase = require('../config/supabase');

/**
 * Verifica uma pool específica e atualiza seu status
 * @param {Object} pool - Objeto da pool do banco de dados
 * @returns {Promise<Object>} Resultado da verificação
 */
async function checkPool(pool) {
  try {
    console.log(`🔍 Verificando pool ${pool.pool_id} (${pool.token0_symbol}/${pool.token1_symbol})...`);

    // Buscar dados atualizados da blockchain
    let positionData;
    try {
      // Tentar usar SDK completo primeiro (tem fees)
      const { getCompletePositionData } = require('./uniswapServiceV2');
      try {
        positionData = await getCompletePositionData(pool.pool_id, pool.chain);
        
        // Converter formato para compatibilidade
        positionData = {
          positionId: positionData.positionId,
          poolAddress: positionData.poolAddress,
          token0: {
            address: positionData.token0.address,
            symbol: positionData.token0.symbol,
            decimals: positionData.token0.decimals
          },
          token1: {
            address: positionData.token1.address,
            symbol: positionData.token1.symbol,
            decimals: positionData.token1.decimals
          },
          fee: positionData.fee,
          range: {
            tickLower: positionData.range.tickLower,
            tickUpper: positionData.range.tickUpper,
            priceLower: parseFloat(positionData.range.priceLower),
            priceUpper: parseFloat(positionData.range.priceUpper)
          },
          current: {
            tick: positionData.current.tick,
            price: positionData.current.price ? parseFloat(positionData.current.price) : null,
            sqrtPriceX96: positionData.current.sqrtPriceX96
          },
          inRange: positionData.inRange,
          liquidity: positionData.liquidity,
          fees: positionData.fees // Incluir fees (objeto completo com token0, token1, totalUSD)
        };
        
        // Log para debug
        if (positionData.fees) {
          console.log(`💰 Fees recebidos do SDK:`, {
            token0: positionData.fees.token0,
            token1: positionData.fees.token1,
            totalUSD: positionData.fees.totalUSD
          });
        }
        
        console.log('✅ Dados obtidos via SDK completo (com fees)');
      } catch (sdkError) {
        console.log('⚠️  SDK completo falhou, tentando método padrão:', sdkError.message);
        positionData = await getPositionData(pool.pool_id, pool.chain);
      }
    } catch (error) {
      // Se falhar, tentar método simplificado
      console.log('⚠️  Método completo falhou, usando simplificado...');
      const { getPositionDataSimple } = require('./uniswapServiceSimple');
      positionData = await getPositionDataSimple(pool.pool_id, pool.chain);
      
      // Se tivermos pool_address salvo, usar ele
      if (pool.pool_address && pool.pool_address !== '0x0000000000000000000000000000000000000000') {
        try {
          const { getPoolContract } = require('../config/web3');
          const poolContract = getPoolContract(pool.pool_address, pool.chain);
          const slot0 = await poolContract.slot0();
          positionData.current = {
            tick: Number(slot0.tick),
            price: null, // Será calculado depois
            sqrtPriceX96: slot0.sqrtPriceX96.toString()
          };
          positionData.inRange = slot0.tick >= positionData.range.tickLower && 
                                 slot0.tick <= positionData.range.tickUpper;
        } catch (poolError) {
          console.log('⚠️  Não foi possível buscar dados da pool usando pool_address');
        }
      }
    }

    // Verificar se o status mudou
    // Buscar último status salvo (pode ser null na primeira vez)
    const wasInRange = pool.last_in_range !== false && pool.last_in_range !== null; 
    const isNowInRange = positionData.inRange;
    const statusChanged = wasInRange !== isNowInRange;

    // Atualizar dados no banco
    const updateData = {
      last_checked_at: new Date().toISOString(),
      last_in_range: isNowInRange !== null && isNowInRange !== undefined ? isNowInRange : null
    };
    
    // Adicionar preço atual se disponível (só se a coluna existir)
    if (positionData.current?.price) {
      const priceValue = typeof positionData.current.price === 'string' 
        ? positionData.current.price 
        : positionData.current.price.toString();
      updateData.current_price = priceValue;
    }
    
    // Se tivermos dados de fees do getCompletePositionData, atualizar também
    console.log(`🔍 Verificando fees em positionData:`, {
      temFees: !!positionData.fees,
      fees: positionData.fees,
      totalUSD: positionData.fees?.totalUSD,
      tipoTotalUSD: typeof positionData.fees?.totalUSD
    });
    
    if (positionData.fees) {
      if (positionData.fees.totalUSD) {
        const feesValue = parseFloat(positionData.fees.totalUSD);
        if (!isNaN(feesValue) && feesValue > 0) {
          updateData.fees_uncollected_usd = feesValue;
          console.log(`💰 Fees acumulados salvos: $${feesValue.toFixed(2)}`);
        } else {
          console.log(`⚠️  Fees inválido ou zero: ${feesValue}`);
        }
      } else {
        console.log(`⚠️  Sem totalUSD nos fees`);
      }
    } else {
      console.log(`⚠️  Sem objeto fees em positionData`);
    }

    const { error: updateError } = await supabase
      .from('monitored_pools')
      .update(updateData)
      .eq('id', pool.id);

    if (updateError) {
      throw new Error(`Erro ao atualizar pool: ${updateError.message}`);
    }

    // Salvar métrica (só se tiver dados válidos)
    if (isNowInRange !== null && isNowInRange !== undefined) {
      await saveMetric(pool.id, {
        current_price: positionData.current?.price || null,
        in_range: isNowInRange,
        fees_earned_24h: positionData.fees?.totalUSD ? parseFloat(positionData.fees.totalUSD) : null,
        tvl: updateData.tvl || null
      });
    }

    // Enviar alertas se necessário usando novo serviço de notificações
    if (statusChanged && pool.alert_out_of_range) {
      const poolForAlert = {
        ...pool,
        current_price: positionData.current?.price || pool.current_price,
        price_lower: positionData.range?.priceLower || pool.price_lower,
        price_upper: positionData.range?.priceUpper || pool.price_upper
      };

      if (isNowInRange) {
        // Voltou ao range
        const { notificationService } = require('./telegramService');
        await notificationService.sendBackInRangeAlert(poolForAlert);
        await saveAlert(pool.id, 'back_in_range', `Pool ${pool.token0_symbol}/${pool.token1_symbol} voltou ao range`);
      } else {
        // Saiu do range
        const { notificationService } = require('./telegramService');
        await notificationService.sendOutOfRangeAlert(poolForAlert);
        await saveAlert(pool.id, 'out_of_range', `Pool ${pool.token0_symbol}/${pool.token1_symbol} saiu do range`);
      }
    }

    // Verificar alerta de fees acumulados
    if (pool.alert_fees_threshold && updateData.fees_uncollected_usd) {
      const fees = parseFloat(updateData.fees_uncollected_usd);
      const threshold = parseFloat(pool.alert_fees_threshold);
      
      if (fees >= threshold) {
        const { notificationService } = require('./telegramService');
        await notificationService.sendFeesAlert({
          ...pool,
          fees_uncollected_usd: fees
        });
        await saveAlert(pool.id, 'fees_threshold', `Pool ${pool.token0_symbol}/${pool.token1_symbol} atingiu meta de fees: $${fees.toFixed(2)}`);
      }
    }

    return {
      success: true,
      poolId: pool.id,
      inRange: isNowInRange,
      statusChanged,
      currentPrice: positionData.current.price
    };
  } catch (error) {
    console.error(`❌ Erro ao verificar pool ${pool.id}:`, error.message);
    
    // Salvar erro no banco
    await saveAlert(pool.id, 'error', `Erro ao verificar pool: ${error.message}`);
    
    return {
      success: false,
      poolId: pool.id,
      error: error.message
    };
  }
}

/**
 * Verifica todas as pools ativas
 * @returns {Promise<Array>} Resultados das verificações
 */
async function checkAllPools() {
  try {
    console.log('🔄 Iniciando verificação de todas as pools...');

    // Buscar todas as pools ativas
    const { data: pools, error } = await supabase
      .from('monitored_pools')
      .select('*')
      .eq('is_active', true);

    if (error) {
      throw new Error(`Erro ao buscar pools: ${error.message}`);
    }

    if (!pools || pools.length === 0) {
      console.log('ℹ️  Nenhuma pool ativa para verificar');
      return [];
    }

    console.log(`📊 Verificando ${pools.length} pool(s)...`);

    // Verificar cada pool
    const results = await Promise.allSettled(
      pools.map(pool => checkPool(pool))
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

    console.log(`✅ Verificação concluída: ${successful} sucesso, ${failed} falhas`);

    return results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message });
  } catch (error) {
    console.error('❌ Erro ao verificar pools:', error.message);
    throw error;
  }
}

/**
 * Salva uma métrica no banco de dados
 */
async function saveMetric(poolId, metric) {
  try {
    const { error } = await supabase
      .from('pool_metrics')
      .insert({
        pool_id: poolId,
        current_price: metric.current_price ? metric.current_price.toString() : '0',
        in_range: metric.in_range !== undefined ? metric.in_range : false,
        fees_earned_24h: metric.fees_earned_24h || null,
        tvl: metric.tvl || null,
        recorded_at: new Date().toISOString()
      });

    if (error) {
      console.error('Erro ao salvar métrica:', error.message);
    }
  } catch (error) {
    console.error('Erro ao salvar métrica:', error.message);
  }
}

/**
 * Salva um alerta no banco de dados
 */
async function saveAlert(poolId, alertType, message) {
  try {
    const { error } = await supabase
      .from('alerts_history')
      .insert({
        pool_id: poolId,
        alert_type: alertType,
        message: message,
        sent_at: new Date().toISOString(),
        was_sent_telegram: alertType !== 'error'
      });

    if (error) {
      console.error('Erro ao salvar alerta:', error.message);
    }
  } catch (error) {
    console.error('Erro ao salvar alerta:', error.message);
  }
}

module.exports = {
  checkPool,
  checkAllPools,
  saveMetric,
  saveAlert
};

