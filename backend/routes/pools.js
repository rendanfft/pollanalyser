const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const supabase = require('../config/supabase');
const { getPositionData } = require('../services/uniswapService');
const { getCompletePositionData } = require('../services/uniswapServiceV2');
const { checkPool } = require('../services/poolMonitor');
const { calculatePoolAddressFromTokens } = require('../services/poolAddressCalculator');

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

/**
 * POST /api/pools
 * Adiciona uma nova pool para monitoramento
 */
router.post('/', async (req, res) => {
  try {
    const { position_id, chain, protocol, alert_out_of_range, alert_fees_threshold, alert_il_threshold } = req.body;

    // Validações
    if (!position_id || !chain || !protocol) {
      return res.status(400).json({
        success: false,
        error: 'position_id, chain e protocol são obrigatórios'
      });
    }

    // Buscar dados da pool na blockchain
    console.log(`🔍 Buscando dados da pool ${position_id} na ${chain}...`);
    
    let positionData;
    try {
      // Tentar usar SDK do Uniswap primeiro (mais preciso)
      try {
        positionData = await getCompletePositionData(position_id, chain);
        
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
          fees: positionData.fees // Incluir fees
        };
        
        console.log('✅ Dados obtidos via SDK do Uniswap V3 (com fees)');
      } catch (sdkError) {
        console.log('⚠️  SDK do Uniswap falhou, usando método alternativo:', sdkError.message);
        // Fallback para método antigo
        positionData = await getPositionData(position_id, chain);
      }
      
      // Se não conseguiu o endereço da pool, tentar calcular
      if (!positionData.poolAddress) {
        try {
          const poolAddress = await calculatePoolAddressFromTokens(
            positionData.token0.address,
            positionData.token1.address,
            positionData.fee,
            chain
          );
          positionData.poolAddress = poolAddress;
          console.log('✅ Endereço da pool calculado:', poolAddress);
        } catch (calcError) {
          console.log('⚠️  Não foi possível calcular endereço da pool:', calcError.message);
          // Continuar sem o endereço - será buscado depois
        }
      }
    } catch (error) {
      // Verificar se o erro é apenas sobre endereço da pool (não crítico)
      if (error.message && (
        error.message.includes('endereço da pool') || 
        error.message.includes('pool address') ||
        error.message.includes('determinar o endereço') ||
        error.message.includes('Tente adicionar a pool manualmente') ||
        error.message.includes('não crítico')
      )) {
        // Se for só sobre endereço, usar método simplificado
        console.log('⚠️  Erro apenas sobre endereço da pool, usando método simplificado...');
        const { getPositionDataSimple } = require('../services/uniswapServiceSimple');
        try {
          positionData = await getPositionDataSimple(position_id, chain);
        } catch (simpleError) {
          throw new Error('Não foi possível buscar dados da posição. Verifique se o Position ID está correto.');
        }
      } else {
        // Se for outro erro, usar método simplificado como fallback
        console.log('⚠️  Método completo falhou, usando método simplificado...', error.message);
        const { getPositionDataSimple } = require('../services/uniswapServiceSimple');
        try {
          positionData = await getPositionDataSimple(position_id, chain);
        } catch (simpleError) {
          throw new Error('Não foi possível buscar dados da posição. Verifique se o Position ID está correto.');
        }
      }
    }
    
    // Garantir que temos os dados mínimos necessários
    if (!positionData || !positionData.token0 || !positionData.token1) {
      throw new Error('Não foi possível buscar dados da posição. Verifique se o Position ID está correto.');
    }

    // Log dos dados para debug
    console.log('📊 Dados da posição obtidos:', {
      token0: positionData.token0.symbol,
      token1: positionData.token1.symbol,
      fee: positionData.fee,
      priceLower: positionData.range?.priceLower,
      priceUpper: positionData.range?.priceUpper,
      tickLower: positionData.range?.tickLower,
      tickUpper: positionData.range?.tickUpper
    });

    // Verificar se pool já está sendo monitorada
    const { data: existingPool } = await supabase
      .from('monitored_pools')
      .select('id')
      .eq('pool_id', position_id)
      .eq('user_id', req.user.id)
      .eq('chain', chain)
      .single();

    if (existingPool) {
      return res.status(400).json({
        success: false,
        error: 'Esta pool já está sendo monitorada'
      });
    }

    // Validar e preparar valores de preço
    const priceLower = positionData.range?.priceLower;
    const priceUpper = positionData.range?.priceUpper;
    
    // Verificar se os valores são válidos
    if (!priceLower || !priceUpper || isNaN(priceLower) || isNaN(priceUpper) || priceLower <= 0 || priceUpper <= 0) {
      console.error('⚠️  Valores de preço inválidos:', { priceLower, priceUpper, range: positionData.range });
      // Tentar recalcular se tiver os ticks
      if (positionData.range?.tickLower && positionData.range?.tickUpper) {
        const { tickToPrice } = require('../services/uniswapServiceSimple');
        const recalculatedLower = tickToPrice(
          Number(positionData.range.tickLower),
          Number(positionData.token0.decimals),
          Number(positionData.token1.decimals)
        );
        const recalculatedUpper = tickToPrice(
          Number(positionData.range.tickUpper),
          Number(positionData.token0.decimals),
          Number(positionData.token1.decimals)
        );
        console.log('🔄 Preços recalculados:', { recalculatedLower, recalculatedUpper });
        if (!isNaN(recalculatedLower) && !isNaN(recalculatedUpper) && recalculatedLower > 0 && recalculatedUpper > 0) {
          positionData.range.priceLower = recalculatedLower;
          positionData.range.priceUpper = recalculatedUpper;
        }
      }
    }

    // Criar pool no banco
    const { data: pool, error } = await supabase
      .from('monitored_pools')
      .insert({
        user_id: req.user.id,
        pool_id: position_id,
        pool_address: positionData.poolAddress || 'pending',
        token0_symbol: positionData.token0.symbol,
        token1_symbol: positionData.token1.symbol,
        fee_tier: positionData.fee,
        chain: chain,
        protocol: protocol,
        price_lower: (positionData.range?.priceLower && !isNaN(positionData.range.priceLower) && positionData.range.priceLower > 0) 
          ? positionData.range.priceLower.toString() 
          : (positionData.range?.priceLower ? positionData.range.priceLower.toString() : '0'),
        price_upper: (positionData.range?.priceUpper && !isNaN(positionData.range.priceUpper) && positionData.range.priceUpper > 0) 
          ? positionData.range.priceUpper.toString() 
          : (positionData.range?.priceUpper ? positionData.range.priceUpper.toString() : '0'),
        alert_out_of_range: alert_out_of_range !== false,
        alert_fees_threshold: alert_fees_threshold || 0,
        alert_il_threshold: alert_il_threshold || 5,
        is_active: true,
        last_checked_at: new Date().toISOString(),
        last_in_range: positionData.inRange !== null && positionData.inRange !== undefined ? positionData.inRange : null,
        current_price: positionData.current?.price ? positionData.current.price.toString() : null,
        fees_uncollected_usd: positionData.fees && positionData.fees.totalUSD ? parseFloat(positionData.fees.totalUSD) : null
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      pool
    });
  } catch (error) {
    console.error('Erro ao adicionar pool:', error);
    
    // Se o erro for sobre endereço da pool, dar mensagem mais amigável
    if (error.message && (
      error.message.includes('endereço da pool') || 
      error.message.includes('pool address') ||
      error.message.includes('determinar o endereço') ||
      error.message.includes('Tente adicionar a pool manualmente') ||
      error.message.includes('não crítico')
    )) {
      // Tentar usar método simplificado como último recurso
      try {
        console.log('⚠️  Tentando método simplificado como último recurso...');
        const { getPositionDataSimple } = require('../services/uniswapServiceSimple');
        const positionData = await getPositionDataSimple(req.body.position_id, req.body.chain);
        
        // Se conseguiu, adicionar a pool
        const { data: pool, error: insertError } = await supabase
          .from('monitored_pools')
          .insert({
            user_id: req.user.id,
            pool_id: req.body.position_id,
            pool_address: positionData.poolAddress || 'pending',
            token0_symbol: positionData.token0.symbol,
            token1_symbol: positionData.token1.symbol,
            fee_tier: positionData.fee,
            chain: req.body.chain,
            protocol: req.body.protocol,
            price_lower: positionData.range.priceLower.toString(),
            price_upper: positionData.range.priceUpper.toString(),
            alert_out_of_range: req.body.alert_out_of_range !== false,
            alert_fees_threshold: req.body.alert_fees_threshold || 0,
            alert_il_threshold: req.body.alert_il_threshold || 5,
            is_active: true,
            last_checked_at: new Date().toISOString(),
            last_in_range: positionData.inRange !== null && positionData.inRange !== undefined ? positionData.inRange : null
          })
          .select()
          .single();
        
        if (insertError) {
          throw insertError;
        }
        
        return res.json({
          success: true,
          pool
        });
      } catch (simpleError) {
        // Se método simplificado também falhar, retornar erro
        return res.status(500).json({
          success: false,
          error: 'Não foi possível buscar dados da posição. Verifique se o Position ID está correto.'
        });
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao adicionar pool'
    });
  }
});

/**
 * GET /api/pools
 * Lista todas as pools do usuário
 */
router.get('/', async (req, res) => {
  try {
    const { data: pools, error } = await supabase
      .from('monitored_pools')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Log para debug
    if (pools && pools.length > 0) {
      console.log('📊 Pools retornadas:', pools.map(p => ({
        pool_id: p.pool_id,
        fees_uncollected_usd: p.fees_uncollected_usd,
        tipo: typeof p.fees_uncollected_usd
      })));
    }
    
    res.json({
      success: true,
      pools: pools || []
    });
  } catch (error) {
    console.error('Erro ao listar pools:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar pools'
    });
  }
});

/**
 * GET /api/pools/:id/metrics
 * Busca métricas históricas de uma pool
 */
router.get('/:id/metrics', async (req, res) => {
  try {
    console.log('📊 Rota /:id/metrics chamada com id:', req.params.id);
    const { id } = req.params;

    // Verificar se pool pertence ao usuário
    const { data: pool } = await supabase
      .from('monitored_pools')
      .select('id, created_at')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: 'Pool não encontrada'
      });
    }

    // Buscar métricas desde a criação da pool
    const createdDate = pool.created_at ? new Date(pool.created_at) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { data: metrics, error: metricsError } = await supabase
      .from('pool_metrics')
      .select('*')
      .eq('pool_id', id)
      .gte('recorded_at', createdDate.toISOString())
      .order('recorded_at', { ascending: true });

    if (metricsError) {
      throw metricsError;
    }

    res.json({
      success: true,
      metrics: metrics || []
    });
  } catch (error) {
    console.error('Erro ao buscar métricas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar métricas'
    });
  }
});

/**
 * GET /api/pools/:id
 * Busca detalhes de uma pool específica
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: pool, error } = await supabase
      .from('monitored_pools')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !pool) {
      return res.status(404).json({
        success: false,
        error: 'Pool não encontrada'
      });
    }

    // Buscar métricas históricas (desde a criação da pool)
    const { data: poolData } = await supabase
      .from('monitored_pools')
      .select('created_at')
      .eq('id', id)
      .single();

    const createdDate = poolData?.created_at ? new Date(poolData.created_at) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: últimos 30 dias

    const { data: metrics } = await supabase
      .from('pool_metrics')
      .select('*')
      .eq('pool_id', id)
      .gte('recorded_at', createdDate.toISOString())
      .order('recorded_at', { ascending: true });

    // Buscar alertas recentes
    const { data: alerts } = await supabase
      .from('alerts_history')
      .select('*')
      .eq('pool_id', id)
      .order('sent_at', { ascending: false })
      .limit(50);

    res.json({
      success: true,
      pool,
      metrics: metrics || [],
      alerts: alerts || []
    });
  } catch (error) {
    console.error('Erro ao buscar pool:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar pool'
    });
  }
});

/**
 * PUT /api/pools/:id
 * Atualiza uma pool
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verificar se pool pertence ao usuário
    const { data: pool } = await supabase
      .from('monitored_pools')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: 'Pool não encontrada'
      });
    }

    // Atualizar
    const { data: updatedPool, error } = await supabase
      .from('monitored_pools')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      pool: updatedPool
    });
  } catch (error) {
    console.error('Erro ao atualizar pool:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar pool'
    });
  }
});

/**
 * DELETE /api/pools/:id
 * Remove uma pool do monitoramento
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se pool pertence ao usuário
    const { data: pool } = await supabase
      .from('monitored_pools')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: 'Pool não encontrada'
      });
    }

    // Deletar permanentemente
    const { error } = await supabase
      .from('monitored_pools')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Pool removida do monitoramento'
    });
  } catch (error) {
    console.error('Erro ao deletar pool:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar pool'
    });
  }
});

/**
 * POST /api/pools/:id/check
 * Força verificação de uma pool específica
 */
router.post('/:id/check', async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar pool
    const { data: pool } = await supabase
      .from('monitored_pools')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: 'Pool não encontrada'
      });
    }

    // Verificar pool
    const result = await checkPool(pool);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Erro ao verificar pool:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao verificar pool'
    });
  }
});

module.exports = router;

