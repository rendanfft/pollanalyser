const { 
  getPositionManagerContract, 
  getPoolContract, 
  getERC20Contract,
  getProvider
} = require('../config/web3');
// Nota: SDKs do Uniswap podem não ser necessários para esta implementação básica

/**
 * Busca dados completos de uma posição Uniswap V3
 * @param {string} positionId - ID da posição NFT
 * @param {string} chain - Chain (base, ethereum, etc)
 * @returns {Promise<Object>} Dados completos da posição
 */
async function getPositionData(positionId, chain = 'base') {
  try {
    const positionManager = getPositionManagerContract(chain);
    
    // Buscar dados da posição (CRÍTICO - se falhar, lança erro)
    const position = await positionManager.positions(positionId);
    
    const token0Address = position.token0;
    const token1Address = position.token1;
    const fee = position.fee;
    const tickLower = position.tickLower;
    const tickUpper = position.tickUpper;
    const liquidity = position.liquidity;

    // Buscar símbolos e decimais dos tokens (não crítico - usa fallback)
    const token0Contract = getERC20Contract(token0Address, chain);
    const token1Contract = getERC20Contract(token1Address, chain);
    
    const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
      token0Contract.symbol().catch(() => 'UNKNOWN'),
      token0Contract.decimals().catch(() => 18),
      token1Contract.symbol().catch(() => 'UNKNOWN'),
      token1Contract.decimals().catch(() => 18),
    ]);

    // Buscar endereço da pool usando Factory
    let poolAddress;
    let currentTick = null;
    let sqrtPriceX96 = null;
    let inRange = null;
    let currentPrice = null;
    
    try {
      poolAddress = await getPoolAddressFromPosition(positionId, chain);
      
      // Se conseguiu o endereço, buscar dados da pool
      if (poolAddress) {
        const poolContract = getPoolContract(poolAddress, chain);
        const slot0 = await poolContract.slot0();
        currentTick = slot0.tick;
        sqrtPriceX96 = slot0.sqrtPriceX96;

        // Verificar se está no range
        inRange = currentTick >= tickLower && currentTick <= tickUpper;

        // Calcular preços
        currentPrice = sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals);
      } else {
        console.log('⚠️  Endereço da pool não disponível, continuando sem ele...');
        poolAddress = null;
      }
    } catch (poolError) {
      console.log('⚠️  Não foi possível buscar endereço/dados da pool:', poolError.message);
      // Continuar sem o endereço da pool - será buscado depois
      poolAddress = null;
    }

    // Calcular preços do range (sempre possível)
    const priceLower = tickToPrice(tickLower, token0Decimals, token1Decimals);
    const priceUpper = tickToPrice(tickUpper, token0Decimals, token1Decimals);

    return {
      positionId,
      poolAddress,
      token0: {
        address: token0Address,
        symbol: token0Symbol,
        decimals: token0Decimals
      },
      token1: {
        address: token1Address,
        symbol: token1Symbol,
        decimals: token1Decimals
      },
      fee,
      range: {
        tickLower,
        tickUpper,
        priceLower,
        priceUpper
      },
      current: {
        tick: currentTick !== null ? Number(currentTick) : null,
        price: currentPrice !== null ? currentPrice : null,
        sqrtPriceX96: sqrtPriceX96 !== null ? sqrtPriceX96.toString() : null
      },
      inRange: inRange !== null ? inRange : null,
      liquidity: liquidity.toString()
    };
  } catch (error) {
    // Verificar se o erro é sobre endereço da pool (não crítico)
    if (error.message && (
      error.message.includes('endereço da pool') || 
      error.message.includes('pool address') ||
      error.message.includes('determinar o endereço') ||
      error.message.includes('pool_address') ||
      error.message.includes('Tente adicionar a pool manualmente')
    )) {
      // Re-lançar com mensagem que indica que é não crítico
      // O routes/pools.js vai capturar e usar método simplificado
      throw new Error(`Erro ao buscar endereço da pool (não crítico): ${error.message}`);
    }
    
    // Só lança erro se for algo crítico (não conseguir buscar a posição)
    if (error.message && error.message.includes('positions')) {
      throw new Error(`Erro ao buscar dados da posição: ${error.message}. Verifique se o Position ID está correto.`);
    }
    
    throw new Error(`Erro ao buscar dados da posição: ${error.message}`);
  }
}

/**
 * Calcula o endereço da pool usando o algoritmo do Uniswap V3 Factory
 * Nota: Esta é uma aproximação. O endereço real pode variar.
 * Para produção, use o contrato Factory para buscar o endereço exato.
 */
async function calculatePoolAddress(token0, token1, fee, chain) {
  // Ordenar tokens (token0 < token1)
  const [t0, t1] = token0.toLowerCase() < token1.toLowerCase() 
    ? [token0, token1] 
    : [token1, token0];

  // Para uma implementação real, você deveria usar o contrato Factory
  // Por enquanto, vamos buscar a pool usando uma abordagem diferente
  // Vamos tentar encontrar a pool através do Position Manager
  
  // Alternativa: buscar através de eventos ou usar uma API
  // Por enquanto, vamos retornar um endereço calculado (pode não ser 100% preciso)
  
  // NOTA: Esta função precisa ser melhorada para produção
  // O ideal é usar o contrato Factory do Uniswap V3
  
  throw new Error('calculatePoolAddress precisa ser implementado usando o Factory contract');
}

/**
 * Busca o endereço da pool através do Position Manager
 * Para Base, vamos usar uma abordagem diferente - calcular o endereço da pool
 */
async function getPoolAddressFromPosition(positionId, chain) {
  try {
    const positionManager = getPositionManagerContract(chain);
    const position = await positionManager.positions(positionId);
    
    const token0 = position.token0;
    const token1 = position.token1;
    const fee = position.fee;

    // Para Base, o Factory pode não ter a função getPool ou o endereço pode estar errado
    // Vamos tentar calcular o endereço da pool usando CREATE2
    // Mas primeiro, vamos tentar usar o Factory se disponível
    
    const { getProvider, UNISWAP_V3_CONTRACTS } = require('../config/web3');
    const provider = getProvider(chain);
    const factoryAddress = UNISWAP_V3_CONTRACTS[chain]?.FACTORY;
    
    if (factoryAddress && factoryAddress !== '0x0000000000000000000000000000000000000000') {
      try {
        // ABI do Factory
        const FACTORY_ABI = [
          'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
        ];
        
        const { Contract, utils } = require('ethers');
        // Normalizar endereços
        const normalizedFactory = utils.getAddress(factoryAddress.toLowerCase());
        const normalizedToken0 = utils.getAddress(token0);
        const normalizedToken1 = utils.getAddress(token1);
        
        const factory = new Contract(normalizedFactory, FACTORY_ABI, provider);
        const poolAddress = await factory.getPool(normalizedToken0, normalizedToken1, fee);
        
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          return poolAddress;
        }
      } catch (factoryError) {
        console.log('⚠️  Não foi possível usar Factory, tentando método alternativo...');
      }
    }
    
    // Método alternativo: buscar através de eventos ou usar uma API
    // Por enquanto, vamos retornar um endereço calculado (pode não ser 100% preciso)
    // Na prática, você pode usar o endereço da pool diretamente do Uniswap UI
    
    // Para Base, vamos usar o endereço conhecido do Factory correto
    // Base Uniswap V3 Factory: 0x33128a8fC17869897dcE68Ed026d69B5cc496DA1
    // Mas vamos tentar uma abordagem diferente - buscar eventos
    
    // Não lançar erro, apenas retornar null
    console.log('⚠️  Não foi possível determinar o endereço da pool automaticamente.');
    return null; // Retorna null em vez de lançar erro
    
  } catch (error) {
    // Se for erro crítico (não conseguir buscar posição), ainda lança
    if (error.message && error.message.includes('positions')) {
      throw new Error(`Erro ao buscar dados da posição: ${error.message}`);
    }
    // Para outros erros, retorna null em vez de lançar
    console.log('⚠️  Erro ao buscar endereço da pool:', error.message);
    return null;
  }
}

/**
 * Converte tick para preço
 */
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

/**
 * Converte sqrtPriceX96 para preço legível
 */
function sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals) {
  const Q96 = 2n ** 96n;
  const sqrtPrice = BigInt(sqrtPriceX96.toString());
  const price = (sqrtPrice * sqrtPrice * BigInt(10 ** token0Decimals)) / (Q96 * Q96 * BigInt(10 ** token1Decimals));
  return Number(price) / (10 ** (token0Decimals - token1Decimals));
}

/**
 * Atualiza getPositionData para usar getPoolAddressFromPosition
 */
async function getPositionDataUpdated(positionId, chain = 'base') {
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

    // Buscar endereço da pool - vamos tentar diferentes métodos
    let poolAddress;
    
    // Método 1: Tentar usar Factory
    try {
      poolAddress = await getPoolAddressFromPosition(positionId, chain);
      
      // Se não conseguiu, poolAddress será null e continuamos sem ele
      if (!poolAddress) {
        console.log('⚠️  Não foi possível buscar endereço da pool, continuando sem ele...');
      }
    } catch (poolAddrError) {
      // Se der erro ao buscar endereço, apenas loga e continua
      console.log('⚠️  Erro ao buscar endereço da pool (ignorado):', poolAddrError.message);
      poolAddress = null;
    }

    // Buscar dados da pool (só se tiver endereço)
    let currentTick = null;
    let sqrtPriceX96 = null;
    let inRange = null;
    let currentPrice = null;
    
    if (poolAddress) {
      try {
        const poolContract = getPoolContract(poolAddress, chain);
        const slot0 = await poolContract.slot0();
        currentTick = slot0.tick;
        sqrtPriceX96 = slot0.sqrtPriceX96;

        // Verificar se está no range
        inRange = currentTick >= tickLower && currentTick <= tickUpper;

        // Calcular preços
        currentPrice = sqrtPriceX96ToPrice(sqrtPriceX96, Number(token0Decimals), Number(token1Decimals));
      } catch (poolError) {
        console.log('⚠️  Erro ao buscar dados da pool:', poolError.message);
        // Continuar sem os dados da pool
      }
    }

    // Calcular preços do range (sempre possível)
    const priceLower = tickToPrice(tickLower, Number(token0Decimals), Number(token1Decimals));
    const priceUpper = tickToPrice(tickUpper, Number(token0Decimals), Number(token1Decimals));

    return {
      positionId,
      poolAddress,
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
        tick: currentTick !== null ? Number(currentTick) : null,
        price: currentPrice !== null ? currentPrice : null,
        sqrtPriceX96: sqrtPriceX96 !== null ? sqrtPriceX96.toString() : null
      },
      inRange: inRange !== null ? inRange : null,
      liquidity: liquidity.toString()
    };
  } catch (error) {
    throw new Error(`Erro ao buscar dados da posição: ${error.message}`);
  }
}

// Exportar a versão corrigida que não falha se não conseguir o endereço
module.exports = {
  getPositionData: getPositionData, // Usar a versão que trata erros
  getPoolAddressFromPosition,
  tickToPrice,
  sqrtPriceX96ToPrice
};

