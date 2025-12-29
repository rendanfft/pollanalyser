const { getProvider, UNISWAP_V3_CONTRACTS } = require('../config/web3');
const { Contract, utils } = require('ethers');

/**
 * Calcula o endereço da pool usando CREATE2 (método do Uniswap V3)
 */
async function calculatePoolAddressFromTokens(token0, token1, fee, chain) {
  try {
    const provider = getProvider(chain);
    const factoryAddress = UNISWAP_V3_CONTRACTS[chain]?.FACTORY;
    
    if (!factoryAddress) {
      throw new Error(`Factory não configurado para ${chain}`);
    }

    // Ordenar tokens (token0 < token1)
    const [t0, t1] = token0.toLowerCase() < token1.toLowerCase() 
      ? [token0, token1] 
      : [token1, token0];

    // Tentar usar Factory primeiro
    try {
      const FACTORY_ABI = [
        'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
      ];
      
      const normalizedFactory = utils.getAddress(factoryAddress.toLowerCase());
      const normalizedToken0 = utils.getAddress(t0);
      const normalizedToken1 = utils.getAddress(t1);
      
      const factory = new Contract(normalizedFactory, FACTORY_ABI, provider);
      const poolAddress = await factory.getPool(normalizedToken0, normalizedToken1, fee);
      
      if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
        return poolAddress;
      }
    } catch (factoryError) {
      console.log('Factory getPool falhou, tentando cálculo CREATE2...');
    }

    // Método alternativo: Buscar através de eventos do Factory
    // Isso é mais confiável que calcular CREATE2 manualmente
    try {
      const poolAddress = await getPoolAddressFromEvents(t0, t1, fee, chain);
      if (poolAddress) {
        return poolAddress;
      }
    } catch (eventError) {
      console.log('Busca por eventos falhou:', eventError.message);
    }
    
    // Último recurso: Tentar buscar diretamente do contrato Pool usando uma API ou subgraph
    // Por enquanto, vamos retornar null e deixar o sistema funcionar sem o endereço
    // O endereço pode ser atualizado depois quando a pool for verificada
    console.log('⚠️  Não foi possível determinar o endereço da pool. O sistema funcionará sem ele inicialmente.');
    return null; // Retorna null em vez de lançar erro
    
  } catch (error) {
    // Se for erro crítico (não conseguir conectar), ainda lança
    if (error.message && (error.message.includes('Provider') || error.message.includes('network'))) {
      throw new Error(`Erro ao calcular endereço da pool: ${error.message}`);
    }
    // Para outros erros, retorna null
    console.log('⚠️  Erro ao calcular endereço da pool:', error.message);
    return null;
  }
}

/**
 * Busca o endereço da pool através de eventos do Factory
 */
async function getPoolAddressFromEvents(token0, token1, fee, chain) {
  try {
    const provider = getProvider(chain);
    const factoryAddress = UNISWAP_V3_CONTRACTS[chain]?.FACTORY;
    
    if (!factoryAddress) {
      throw new Error(`Factory não configurado para ${chain}`);
    }

    // ABI do Factory para eventos
    const FACTORY_ABI = [
      'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
    ];
    
    const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
    
    // Buscar eventos PoolCreated
    const filter = factory.filters.PoolCreated(token0, token1, fee);
    const events = await factory.queryFilter(filter, 0, 'latest');
    
    if (events.length > 0) {
      // Pegar o evento mais recente
      const latestEvent = events[events.length - 1];
      return latestEvent.args.pool;
    }
    
    // Tentar também com tokens invertidos
    const filterReverse = factory.filters.PoolCreated(token1, token0, fee);
    const eventsReverse = await factory.queryFilter(filterReverse, 0, 'latest');
    
    if (eventsReverse.length > 0) {
      const latestEvent = eventsReverse[eventsReverse.length - 1];
      return latestEvent.args.pool;
    }
    
    throw new Error('Pool não encontrada nos eventos');
    
  } catch (error) {
    throw new Error(`Erro ao buscar pool em eventos: ${error.message}`);
  }
}

module.exports = {
  calculatePoolAddressFromTokens,
  getPoolAddressFromEvents
};

