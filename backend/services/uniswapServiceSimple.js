const { 
  getPositionManagerContract, 
  getPoolContract, 
  getERC20Contract
} = require('../config/web3');

/**
 * Versão simplificada que não requer o endereço da pool
 * Busca apenas os dados da posição e calcula se está no range
 * baseado no tick atual da posição (se disponível)
 */
async function getPositionDataSimple(positionId, chain = 'base') {
  try {
    const positionManager = getPositionManagerContract(chain);
    
    // Buscar dados da posição
    const position = await positionManager.positions(positionId);
    
    const token0Address = position.token0;
    const token1Address = position.token1;
    const fee = position.fee;
    const tickLower = position.tickLower;
    const tickUpper = position.tickUpper;
    const liquidity = position.liquidity;

    // Buscar símbolos e decimais dos tokens
    const token0Contract = getERC20Contract(token0Address, chain);
    const token1Contract = getERC20Contract(token1Address, chain);
    
    const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
      token0Contract.symbol().catch(() => 'UNKNOWN'),
      token0Contract.decimals().catch(() => 18),
      token1Contract.symbol().catch(() => 'UNKNOWN'),
      token1Contract.decimals().catch(() => 18),
    ]);

    // Calcular preços do range
    const priceLower = tickToPrice(Number(tickLower), Number(token0Decimals), Number(token1Decimals));
    const priceUpper = tickToPrice(Number(tickUpper), Number(token0Decimals), Number(token1Decimals));
    
    console.log('🔢 Cálculo de preços:', {
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
      token0Decimals: Number(token0Decimals),
      token1Decimals: Number(token1Decimals),
      priceLower,
      priceUpper
    });

    // Para determinar se está no range, precisamos do tick atual da pool
    // Como não temos o endereço da pool, vamos retornar os dados da posição
    // e o frontend/backend pode buscar o tick atual separadamente
    
    return {
      positionId,
      poolAddress: null, // Não disponível sem Factory
      token0: {
        address: token0Address,
        symbol: token0Symbol,
        decimals: Number(token0Decimals)
      },
      token1: {
        address: token1Address,
        symbol: token1Symbol,
        decimals: Number(token1Decimals)
      },
      fee: Number(fee),
      range: {
        tickLower: Number(tickLower),
        tickUpper: Number(tickUpper),
        priceLower,
        priceUpper
      },
      current: {
        tick: null, // Precisa do endereço da pool
        price: null,
        sqrtPriceX96: null
      },
      inRange: null, // Precisa do tick atual
      liquidity: liquidity.toString()
    };
  } catch (error) {
    throw new Error(`Erro ao buscar dados da posição: ${error.message}`);
  }
}

function tickToPrice(tick, token0Decimals, token1Decimals) {
  try {
    // Uniswap V3 usa a fórmula: price = 1.0001^tick
    // O preço representa token1/token0 (quantos token1 por 1 token0)
    // Mas para valores muito grandes ou pequenos, Math.pow pode ter problemas
    // Vamos usar uma abordagem mais segura com logaritmos
    
    const tickNum = Number(tick);
    const decimals0 = Number(token0Decimals) || 18;
    const decimals1 = Number(token1Decimals) || 18;
    
    // Calcular usando logaritmos para evitar overflow
    // price = 1.0001^tick
    const logPrice = tickNum * Math.log(1.0001);
    const price = Math.exp(logPrice);
    
    // Ajustar para decimais dos tokens
    // No Uniswap V3, o preço precisa ser ajustado pelos decimais:
    // adjustedPrice = price * 10^(decimals1 - decimals0)
    const decimalAdjustment = Math.pow(10, decimals1 - decimals0);
    let adjustedPrice = price * decimalAdjustment;
    
    // Verificar se o resultado é válido
    if (!isFinite(adjustedPrice) || adjustedPrice <= 0 || isNaN(adjustedPrice)) {
      console.warn('⚠️  Preço inválido calculado:', { tick: tickNum, decimals0, decimals1, price, adjustedPrice });
      return 0;
    }
    
    // Normalizar o preço para um valor razoável
    // Se o preço for muito pequeno (< 1e-10), provavelmente está invertido
    // Se for muito grande (> 1e10), também pode estar invertido ou precisa normalização
    if (adjustedPrice < 1e-10) {
      // Calcular o inverso e normalizar
      adjustedPrice = 1 / price;
      adjustedPrice = adjustedPrice * Math.pow(10, decimals0 - decimals1);
    } else if (adjustedPrice > 1e10) {
      // Se muito grande, pode ser que o ajuste de decimais esteja errado
      // Vamos tentar sem o ajuste de decimais primeiro
      const priceWithoutAdjustment = price;
      if (priceWithoutAdjustment > 0 && priceWithoutAdjustment < 1e10) {
        adjustedPrice = priceWithoutAdjustment;
      } else {
        // Tentar dividir por um fator baseado na diferença de decimais
        const decimalDiff = Math.abs(decimals1 - decimals0);
        if (decimalDiff > 0) {
          adjustedPrice = adjustedPrice / Math.pow(10, decimalDiff);
        }
      }
    }
    
    return adjustedPrice;
  } catch (error) {
    console.error('Erro ao calcular preço do tick:', error);
    return 0;
  }
}

module.exports = {
  getPositionDataSimple,
  tickToPrice
};

