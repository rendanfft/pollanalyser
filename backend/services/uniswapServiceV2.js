const { ethers } = require('ethers');
const { Token, CurrencyAmount, Percent } = require('@uniswap/sdk-core');
const { Pool, Position, tickToPrice, priceToClosestTick, nearestUsableTick } = require('@uniswap/v3-sdk');
const {
  getPositionManagerContract,
  getPoolContract,
  getERC20Contract,
  getProvider,
  UNISWAP_V3_CONTRACTS
} = require('../config/web3');

/**
 * Busca informações COMPLETAS de uma posição, incluindo fees acumulados
 */
async function getCompletePositionData(positionId, chain) {
  try {
    console.log(`\n🔍 Buscando posição ${positionId} na ${chain}...`);
    
    const provider = getProvider(chain);
    const positionManager = getPositionManagerContract(chain);
    
    // 1. Busca dados básicos da posição NFT
    const position = await positionManager.positions(positionId);
    
    const token0Address = position.token0;
    const token1Address = position.token1;
    const fee = Number(position.fee);
    const tickLower = Number(position.tickLower);
    const tickUpper = Number(position.tickUpper);
    const liquidity = position.liquidity;
    const tokensOwed0 = position.tokensOwed0 || '0';
    const tokensOwed1 = position.tokensOwed1 || '0';
    const feeGrowthInside0LastX128 = position.feeGrowthInside0LastX128 || '0';
    const feeGrowthInside1LastX128 = position.feeGrowthInside1LastX128 || '0';

    console.log(`📍 Token0: ${token0Address}`);
    console.log(`📍 Token1: ${token1Address}`);
    console.log(`💰 Fee Tier: ${fee / 10000}%`);

    // 2. Busca informações dos tokens (símbolo, decimals, nome)
    const token0Contract = getERC20Contract(token0Address, chain);
    const token1Contract = getERC20Contract(token1Address, chain);

    const [
      token0Symbol,
      token1Symbol,
      token0Decimals,
      token1Decimals
    ] = await Promise.all([
      token0Contract.symbol().catch(() => 'UNKNOWN'),
      token1Contract.symbol().catch(() => 'UNKNOWN'),
      token0Contract.decimals().catch(() => 18),
      token1Contract.decimals().catch(() => 18)
    ]);

    // Usar símbolo como nome se não tiver name
    const token0Name = token0Symbol;
    const token1Name = token1Symbol;

    console.log(`🪙 Tokens: ${token0Symbol}/${token1Symbol}`);

    // 3. Busca endereço da pool usando múltiplos métodos
    let poolAddress = null;
    let sqrtPriceX96 = null;
    let currentTick = null;
    let poolLiquidity = '0';
    
    // Para Base chain WETH/USDC 0.05%, usar endereço conhecido fornecido pelo usuário
    const KNOWN_POOL_ADDRESSES = {
      'base': {
        // WETH/USDC 0.05% - endereço fornecido pelo usuário
        '0x4200000000000000000000000000000000000006-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913-500': '0xd0b53D9277642d899DF5C87A3966A349A798F224',
        // Também verificar ordem inversa
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913-0x4200000000000000000000000000000000000006-500': '0xd0b53D9277642d899DF5C87A3966A349A798F224'
      }
    };
    
    const poolKey = `${token0Address.toLowerCase()}-${token1Address.toLowerCase()}-${fee}`;
    const poolKeyReverse = `${token1Address.toLowerCase()}-${token0Address.toLowerCase()}-${fee}`;
    
    console.log(`🔍 Verificando endereço conhecido para: ${poolKey}`);
    
    // Verificar se temos endereço conhecido primeiro
    if (KNOWN_POOL_ADDRESSES[chain] && (KNOWN_POOL_ADDRESSES[chain][poolKey] || KNOWN_POOL_ADDRESSES[chain][poolKeyReverse])) {
      poolAddress = KNOWN_POOL_ADDRESSES[chain][poolKey] || KNOWN_POOL_ADDRESSES[chain][poolKeyReverse];
      console.log(`✅ Pool Address conhecido (fornecido): ${poolAddress}`);
    } else {
      console.log(`⚠️  Endereço não encontrado no mapeamento, tentando calcular...`);
      // Método 1: Usar SDK do Uniswap para calcular endereço (mais confiável)
      try {
        const chainId = getChainId(chain);
        const { computePoolAddress: computePoolAddressSDK } = require('@uniswap/v3-sdk');
        const token0ForSDK = new Token(chainId, token0Address, Number(token0Decimals), token0Symbol, token0Name);
        const token1ForSDK = new Token(chainId, token1Address, Number(token1Decimals), token1Symbol, token1Name);
        
        const factoryAddress = UNISWAP_V3_CONTRACTS[chain]?.FACTORY;
        if (factoryAddress) {
          // Normalizar endereço da factory
          const normalizedFactory = ethers.utils.getAddress(factoryAddress.toLowerCase());
          poolAddress = computePoolAddressSDK({
            factoryAddress: normalizedFactory,
            tokenA: token0ForSDK,
            tokenB: token1ForSDK,
            fee: fee
          });
          console.log(`📍 Pool Address calculado via SDK: ${poolAddress}`);
        }
      } catch (sdkError) {
        console.log('⚠️  SDK não conseguiu calcular endereço:', sdkError.message);
      }
      
      // Método 2: Tentar Factory.getPool() se SDK falhou
      if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
        try {
          const { calculatePoolAddressFromTokens } = require('./poolAddressCalculator');
          poolAddress = await calculatePoolAddressFromTokens(token0Address, token1Address, fee, chain);
          if (poolAddress) {
            console.log(`📍 Pool Address encontrado via Factory: ${poolAddress}`);
          }
        } catch (error) {
          console.log('⚠️  Factory não conseguiu encontrar endereço:', error.message);
        }
      }
      
      // Se ainda não temos endereço, tentar calcular via CREATE2 manual
      if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
        try {
          poolAddress = computePoolAddress(token0Address, token1Address, fee, chain);
          console.log(`📍 Pool Address calculado via CREATE2: ${poolAddress}`);
        } catch (create2Error) {
          console.log('⚠️  CREATE2 não conseguiu calcular:', create2Error.message);
        }
      }
    }

    // 4. Busca estado atual da pool (se tiver endereço)
    // CRÍTICO: Precisamos do endereço da pool para buscar preço atual e fees
    if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
      try {
        console.log(`🔍 Buscando dados da pool no endereço: ${poolAddress}`);
        const poolContract = getPoolContract(poolAddress, chain);
        
        // Verificar se o contrato existe (tentar ler token0)
        try {
          const poolToken0 = await poolContract.token0();
          console.log(`✅ Contrato da pool existe! Token0: ${poolToken0}`);
        } catch (verifyError) {
          console.log('❌ Contrato da pool não existe ou não está acessível:', verifyError.message);
          throw new Error('Pool contract não existe neste endereço');
        }
        
        // Buscar slot0 (contém sqrtPriceX96 e tick atual) e liquidez
        const [slot0, liq] = await Promise.all([
          poolContract.slot0().catch(err => {
            console.log('❌ Erro ao buscar slot0:', err.message);
            throw err;
          }),
          poolContract.liquidity().catch(() => '0')
        ]);
        
        sqrtPriceX96 = slot0.sqrtPriceX96;
        currentTick = Number(slot0.tick);
        poolLiquidity = liq.toString();
        
        console.log(`✅ Dados da pool obtidos com sucesso!`);
        console.log(`📊 Current Tick: ${currentTick}`);
        console.log(`📊 Pool Liquidity: ${poolLiquidity}`);
        console.log(`📊 sqrtPriceX96: ${sqrtPriceX96.toString()}`);
      } catch (poolError) {
        console.log('❌ ERRO ao buscar dados da pool:', poolError.message);
        console.log('💡 Verifique se:');
        console.log('   1. O endereço da pool está correto');
        console.log('   2. O RPC da Base está funcionando');
        console.log('   3. A pool existe na blockchain');
        // Continuar sem dados da pool - mas isso é crítico para preço atual
        poolAddress = null; // Marcar como null para indicar que não temos dados
      }
    } else {
      console.log('⚠️  SEM ENDEREÇO DA POOL - não é possível buscar preço atual e fees da blockchain');
      console.log('💡 O sistema tentará calcular preço aproximado baseado no range');
    }

    console.log(`📊 Current Tick: ${currentTick}`);
    console.log(`📊 Pool Liquidity: ${poolLiquidity.toString()}`);

    // 5. Cria objetos Token do Uniswap SDK
    const chainId = getChainId(chain);
    const token0 = new Token(chainId, token0Address, Number(token0Decimals), token0Symbol, token0Name);
    const token1 = new Token(chainId, token1Address, Number(token1Decimals), token1Symbol, token1Name);

    // 6. Cria objeto Pool do Uniswap SDK (só se tiver sqrtPriceX96)
    let pool = null;
    if (sqrtPriceX96 && currentTick !== null) {
      try {
        pool = new Pool(
          token0,
          token1,
          fee,
          sqrtPriceX96.toString(),
          poolLiquidity.toString(),
          currentTick
        );
      } catch (poolError) {
        console.log('⚠️  Erro ao criar Pool do SDK:', poolError.message);
      }
    }

    // 7. Calcula preços (atual e range)
    // Sempre calcular range usando ticks primeiro (funciona mesmo sem pool)
    const priceLower = tickToPrice(token0, token1, tickLower);
    const priceUpper = tickToPrice(token0, token1, tickUpper);
    const priceLowerInverted = tickToPrice(token1, token0, tickUpper);
    const priceUpperInverted = tickToPrice(token1, token0, tickLower);
    
    let currentPrice = null;
    let currentPriceInverted = null;
    
    if (pool) {
      // Se temos pool object do SDK, usar preço dele
      // IMPORTANTE: No Uniswap SDK:
      // - pool.token0Price = quantos token0 por 1 token1 (ex: WETH por USDC = 0.00034)
      // - pool.token1Price = quantos token1 por 1 token0 (ex: USDC por WETH = 2925.52)
      // Para exibir como no Uniswap (USDC = 1 WETH), usamos token1Price
      const token1PriceValue = parseFloat(pool.token1Price.toSignificant(10));
      const token0PriceValue = parseFloat(pool.token0Price.toSignificant(10));
      
      // Se token1Price é muito pequeno (< 1), provavelmente está invertido
      // Neste caso, usar token0Price e inverter
      if (token1PriceValue < 1 && token0PriceValue > 1) {
        currentPrice = pool.token0Price; // Está invertido, usar token0Price
        currentPriceInverted = pool.token1Price;
        console.log(`💹 Preço obtido da pool (invertido): ${currentPrice.toSignificant(6)} ${token1Symbol} = 1 ${token0Symbol}`);
      } else {
        currentPrice = pool.token1Price; // USDC por WETH (ex: 2925.52)
        currentPriceInverted = pool.token0Price; // WETH por USDC (ex: 0.00034)
        console.log(`💹 Preço obtido da pool: ${currentPrice.toSignificant(6)} ${token1Symbol} = 1 ${token0Symbol}`);
      }
    } else if (sqrtPriceX96 && currentTick !== null) {
      // Se temos sqrtPriceX96 e tick atual, usar tickToPrice do SDK (mais confiável)
      const priceFromTick = tickToPrice(token0, token1, currentTick);
      currentPrice = priceFromTick; // token1/token0 (USDC por WETH)
      currentPriceInverted = tickToPrice(token1, token0, currentTick); // token0/token1 (WETH por USDC)
      console.log(`💹 Preço calculado do tick atual: ${currentPrice.toSignificant(6)} ${token1Symbol} = 1 ${token0Symbol}`);
    } else if (sqrtPriceX96) {
      // Se temos sqrtPriceX96 mas não tick, calcular usando fórmula
      // Fórmula correta: price = (sqrtPriceX96 / 2^96)^2
      // Mas sqrtPriceX96 já está em formato Q96, então:
      // price = (sqrtPriceX96^2) / (2^192)
      // Ajustar pelos decimais: price = (sqrtPriceX96^2 * 10^decimals1) / (2^192 * 10^decimals0)
      const Q96 = BigInt(2) ** BigInt(96);
      const sqrtPrice = BigInt(sqrtPriceX96.toString());
      const priceNumerator = sqrtPrice * sqrtPrice * BigInt(10 ** Number(token1Decimals));
      const priceDenominator = Q96 * Q96 * BigInt(10 ** Number(token0Decimals));
      const calculatedPrice = Number(priceNumerator) / Number(priceDenominator);
      
      if (calculatedPrice && calculatedPrice > 0) {
        currentPrice = {
          toSignificant: (n) => calculatedPrice.toFixed(n),
          toFixed: (n) => calculatedPrice.toFixed(n)
        };
        currentPriceInverted = {
          toSignificant: (n) => (1 / calculatedPrice).toFixed(n),
          toFixed: (n) => (1 / calculatedPrice).toFixed(n)
        };
        console.log(`💹 Preço calculado de sqrtPriceX96: ${calculatedPrice.toFixed(2)} ${token1Symbol} = 1 ${token0Symbol}`);
      }
    }
    
    // Se ainda não temos preço atual, significa que não conseguimos acessar a pool
    // Neste caso, NÃO vamos buscar de APIs externas (conforme solicitado)
    // Vamos apenas usar preço médio do range como aproximação
    if (!currentPrice) {
      const midPrice = (parseFloat(priceLower.toSignificant(10)) + parseFloat(priceUpper.toSignificant(10))) / 2;
      currentPrice = {
        toSignificant: (n) => midPrice.toFixed(n),
        toFixed: (n) => midPrice.toFixed(n)
      };
      currentPriceInverted = {
        toSignificant: (n) => (1 / midPrice).toFixed(n),
        toFixed: (n) => (1 / midPrice).toFixed(n)
      };
      console.log(`⚠️  ATENÇÃO: Não foi possível buscar preço real da pool`);
      console.log(`⚠️  Usando preço aproximado (meio do range): ${midPrice.toFixed(2)} ${token1Symbol} = 1 ${token0Symbol}`);
      console.log(`💡 Para obter preço real, é necessário:`);
      console.log(`   1. Endereço correto da pool`);
      console.log(`   2. RPC da Base funcionando`);
      console.log(`   3. Acesso ao contrato da pool na blockchain`);
    }

    // Garantir que currentPrice seja um objeto com toSignificant se for do SDK
    let currentPriceValue = null;
    if (currentPrice) {
      if (typeof currentPrice === 'object' && currentPrice.toSignificant) {
        currentPriceValue = parseFloat(currentPrice.toSignificant(10));
        console.log(`💹 Preço Atual: ${currentPrice.toSignificant(6)} ${token1Symbol} = 1 ${token0Symbol}`);
      } else if (typeof currentPrice === 'number') {
        currentPriceValue = currentPrice;
        console.log(`💹 Preço Atual: ${currentPrice.toFixed(6)} ${token1Symbol} por ${token0Symbol}`);
      }
    } else {
      console.log(`💹 Preço Atual: N/A (sem dados da pool)`);
    }
    console.log(`💹 Range: ${priceLower.toSignificant(6)} - ${priceUpper.toSignificant(6)}`);

    // 8. Verifica se está no range
    let inRange = null;
    if (currentTick !== null) {
      // Se temos tick atual, verificar diretamente
      inRange = currentTick >= tickLower && currentTick <= tickUpper;
      console.log(`✅ In Range (via tick): ${inRange ? 'SIM' : 'NÃO'}`);
    } else if (currentPrice) {
      // Se não temos tick mas temos preço, verificar se preço está no range
      const currentPriceNum = typeof currentPrice === 'object' && currentPrice.toSignificant 
        ? parseFloat(currentPrice.toSignificant(10))
        : parseFloat(currentPrice);
      const priceLowerNum = parseFloat(priceLower.toSignificant(10));
      const priceUpperNum = parseFloat(priceUpper.toSignificant(10));
      inRange = currentPriceNum >= priceLowerNum && currentPriceNum <= priceUpperNum;
      console.log(`✅ In Range (via preço): ${inRange ? 'SIM' : 'NÃO'} (preço ${currentPriceNum.toFixed(2)} entre ${priceLowerNum.toFixed(2)} e ${priceUpperNum.toFixed(2)})`);
    } else {
      console.log(`✅ In Range: N/A (sem dados suficientes)`);
    }

    // 9. Cria posição para calcular amounts (só se tiver pool)
    let positionSDK = null;
    let amount0 = null;
    let amount1 = null;
    
    if (pool) {
      try {
        positionSDK = new Position({
          pool: pool,
          liquidity: liquidity.toString(),
          tickLower: tickLower,
          tickUpper: tickUpper
        });
        
        amount0 = positionSDK.amount0;
        amount1 = positionSDK.amount1;
      } catch (posError) {
        console.log('⚠️  Erro ao criar Position do SDK:', posError.message);
      }
    }
    
    // Se não conseguiu calcular amounts, usar valores aproximados
    if (!amount0 || !amount1) {
      // Simplificação: assumir distribuição igual (não é preciso, mas funciona)
      const liqNum = parseFloat(liquidity.toString()) / 1e18;
      amount0 = { toSignificant: (n) => (liqNum / 2).toFixed(n) };
      amount1 = { toSignificant: (n) => (liqNum / 2).toFixed(n) };
    }

    // 10. Calcula quantidades de tokens na posição
    // (já calculado acima)

    console.log(`💰 Amount Token0: ${amount0.toSignificant(6)} ${token0Symbol}`);
    console.log(`💰 Amount Token1: ${amount1.toSignificant(6)} ${token1Symbol}`);

    // 11. Calcula fees acumulados (uncollected fees)
    // IMPORTANTE: tokensOwed0 e tokensOwed1 só mostram fees quando a posição foi "tocada"
    // Para obter fees totais, precisamos calcular usando feeGrowthInside corretamente
    let fees0 = '0';
    let fees1 = '0';
    
    if (pool && poolAddress && liquidity.toString() !== '0' && currentTick !== null) {
      try {
        // Buscar dados necessários da pool para calcular feeGrowthInside corretamente
        const poolContract = getPoolContract(poolAddress, chain);
        const [feeGrowthGlobal0X128, feeGrowthGlobal1X128, tickLowerData, tickUpperData] = await Promise.all([
          poolContract.feeGrowthGlobal0X128().catch(() => '0'),
          poolContract.feeGrowthGlobal1X128().catch(() => '0'),
          poolContract.ticks(tickLower).catch(() => null),
          poolContract.ticks(tickUpper).catch(() => null)
        ]);
        
        if (tickLowerData && tickUpperData) {
          // Calcular feeGrowthInside usando a fórmula correta do Uniswap V3
          const feeGrowthOutside0Lower = BigInt(tickLowerData.feeGrowthOutside0X128.toString());
          const feeGrowthOutside1Lower = BigInt(tickLowerData.feeGrowthOutside1X128.toString());
          const feeGrowthOutside0Upper = BigInt(tickUpperData.feeGrowthOutside0X128.toString());
          const feeGrowthOutside1Upper = BigInt(tickUpperData.feeGrowthOutside1X128.toString());
          const feeGrowthGlobal0 = BigInt(feeGrowthGlobal0X128.toString());
          const feeGrowthGlobal1 = BigInt(feeGrowthGlobal1X128.toString());
          
          // Fórmula correta do Uniswap V3 para feeGrowthInside
          let feeGrowthInside0X128 = BigInt(0);
          let feeGrowthInside1X128 = BigInt(0);
          
          // Fórmula correta do Uniswap V3 para feeGrowthInside
          // feeGrowthInside = feeGrowthGlobal - feeGrowthBelow - feeGrowthAbove
          // Onde:
          // - feeGrowthBelow = feeGrowthOutside(tickLower) se tick >= tickLower, senão feeGrowthGlobal - feeGrowthOutside(tickLower)
          // - feeGrowthAbove = feeGrowthOutside(tickUpper) se tick < tickUpper, senão feeGrowthGlobal - feeGrowthOutside(tickUpper)
          
          let feeGrowthBelow0 = BigInt(0);
          let feeGrowthBelow1 = BigInt(0);
          let feeGrowthAbove0 = BigInt(0);
          let feeGrowthAbove1 = BigInt(0);
          
          // Calcular feeGrowthBelow
          if (currentTick >= tickLower) {
            feeGrowthBelow0 = feeGrowthOutside0Lower;
            feeGrowthBelow1 = feeGrowthOutside1Lower;
          } else {
            feeGrowthBelow0 = feeGrowthGlobal0 - feeGrowthOutside0Lower;
            feeGrowthBelow1 = feeGrowthGlobal1 - feeGrowthOutside1Lower;
          }
          
          // Calcular feeGrowthAbove
          if (currentTick < tickUpper) {
            feeGrowthAbove0 = feeGrowthOutside0Upper;
            feeGrowthAbove1 = feeGrowthOutside1Upper;
          } else {
            feeGrowthAbove0 = feeGrowthGlobal0 - feeGrowthOutside0Upper;
            feeGrowthAbove1 = feeGrowthGlobal1 - feeGrowthOutside1Upper;
          }
          
          // Calcular feeGrowthInside
          feeGrowthInside0X128 = feeGrowthGlobal0 - feeGrowthBelow0 - feeGrowthAbove0;
          feeGrowthInside1X128 = feeGrowthGlobal1 - feeGrowthBelow1 - feeGrowthAbove1;
          
          // Calcular diferença de fee growth
          const feeGrowthInside0Last = BigInt(feeGrowthInside0LastX128.toString());
          const feeGrowthInside1Last = BigInt(feeGrowthInside1LastX128.toString());
          
          const feeGrowthDelta0 = feeGrowthInside0X128 > feeGrowthInside0Last 
            ? feeGrowthInside0X128 - feeGrowthInside0Last 
            : BigInt(0);
          const feeGrowthDelta1 = feeGrowthInside1X128 > feeGrowthInside1Last 
            ? feeGrowthInside1X128 - feeGrowthInside1Last 
            : BigInt(0);
          
          // Calcular fees: (feeGrowthDelta * liquidity) / 2^128
          const Q128 = BigInt(2) ** BigInt(128);
          const liqBigInt = BigInt(liquidity.toString());
          
          const calculatedFees0 = (feeGrowthDelta0 * liqBigInt) / Q128;
          const calculatedFees1 = (feeGrowthDelta1 * liqBigInt) / Q128;
          
          // Somar com tokensOwed (fees já calculados)
          const totalFees0 = BigInt(tokensOwed0.toString()) + calculatedFees0;
          const totalFees1 = BigInt(tokensOwed1.toString()) + calculatedFees1;
          
          fees0 = ethers.utils.formatUnits(totalFees0.toString(), Number(token0Decimals));
          fees1 = ethers.utils.formatUnits(totalFees1.toString(), Number(token1Decimals));
          
          console.log(`💵 Fees Token0 (tokensOwed): ${ethers.utils.formatUnits(tokensOwed0.toString(), Number(token0Decimals))} ${token0Symbol}`);
          console.log(`💵 Fees Token1 (tokensOwed): ${ethers.utils.formatUnits(tokensOwed1.toString(), Number(token1Decimals))} ${token1Symbol}`);
          console.log(`💵 Fees Calculados Token0: ${ethers.utils.formatUnits(calculatedFees0.toString(), Number(token0Decimals))} ${token0Symbol}`);
          console.log(`💵 Fees Calculados Token1: ${ethers.utils.formatUnits(calculatedFees1.toString(), Number(token1Decimals))} ${token1Symbol}`);
          console.log(`💵 Fees Total Token0: ${fees0} ${token0Symbol}`);
          console.log(`💵 Fees Total Token1: ${fees1} ${token1Symbol}`);
        } else {
          // Se não conseguimos buscar ticks, usar apenas tokensOwed
          fees0 = ethers.utils.formatUnits(tokensOwed0.toString(), Number(token0Decimals));
          fees1 = ethers.utils.formatUnits(tokensOwed1.toString(), Number(token1Decimals));
          console.log(`⚠️  Não foi possível buscar dados dos ticks, usando apenas tokensOwed`);
          console.log(`💵 Fees Token0: ${fees0} ${token0Symbol}`);
          console.log(`💵 Fees Token1: ${fees1} ${token1Symbol}`);
        }
      } catch (feeError) {
        console.log('⚠️  Erro ao calcular fees da pool:', feeError.message);
        // Fallback: usar apenas tokensOwed
        fees0 = ethers.utils.formatUnits(tokensOwed0.toString(), Number(token0Decimals));
        fees1 = ethers.utils.formatUnits(tokensOwed1.toString(), Number(token1Decimals));
        console.log(`💵 Fees Token0 (fallback): ${fees0} ${token0Symbol}`);
        console.log(`💵 Fees Token1 (fallback): ${fees1} ${token1Symbol}`);
      }
    } else {
      // Se não temos pool ou liquidez é 0, usar tokensOwed diretamente
      fees0 = ethers.utils.formatUnits(tokensOwed0.toString(), Number(token0Decimals));
      fees1 = ethers.utils.formatUnits(tokensOwed1.toString(), Number(token1Decimals));
      console.log(`💵 Fees Token0: ${fees0} ${token0Symbol}`);
      console.log(`💵 Fees Token1: ${fees1} ${token1Symbol}`);
    }

    // 12. Busca preços em USD
    // Se temos preço atual da pool, usar para calcular preço do WETH
    let token0PriceUSD = await getTokenPriceUSD(token0Symbol, token0Address, chain);
    let token1PriceUSD = await getTokenPriceUSD(token1Symbol, token1Address, chain);
    
    // Se token1 é USDC (stablecoin = $1) e temos preço atual da pool, calcular preço do token0
    if (token1Symbol.toUpperCase() === 'USDC' && currentPriceValue) {
      // currentPriceValue está em token1/token0 (USDC por WETH)
      // Então preço do WETH = currentPriceValue
      token0PriceUSD = currentPriceValue;
      token1PriceUSD = 1.0; // USDC = $1
      console.log(`💰 Preço do ${token0Symbol} calculado da pool: $${token0PriceUSD.toFixed(2)}`);
    } else if (token0Symbol.toUpperCase() === 'USDC' && currentPriceValue) {
      // Se token0 é USDC, inverter
      token0PriceUSD = 1.0; // USDC = $1
      token1PriceUSD = 1.0 / currentPriceValue;
      console.log(`💰 Preço do ${token1Symbol} calculado da pool: $${token1PriceUSD.toFixed(2)}`);
    }

    // 13. Calcula TVL da posição em USD
    const tvlToken0 = parseFloat(amount0.toSignificant(10)) * token0PriceUSD;
    const tvlToken1 = parseFloat(amount1.toSignificant(10)) * token1PriceUSD;
    const totalTVL = tvlToken0 + tvlToken1;

    // 14. Calcula valor dos fees em USD
    const feesUSDToken0 = parseFloat(fees0) * token0PriceUSD;
    const feesUSDToken1 = parseFloat(fees1) * token1PriceUSD;
    const totalFeesUSD = feesUSDToken0 + feesUSDToken1;

    console.log(`💵 TVL Total: $${totalTVL.toFixed(2)}`);
    console.log(`💵 Fees Total: $${totalFeesUSD.toFixed(2)}`);

    // 15. Retorna dados completos
    return {
      // Identificação
      positionId: positionId.toString(),
      chain,
      poolAddress,
      
      // Tokens
      token0: {
        address: token0Address,
        symbol: token0Symbol,
        decimals: Number(token0Decimals),
        name: token0Name,
        amount: amount0.toSignificant(10),
        priceUSD: token0PriceUSD.toFixed(6)
      },
      token1: {
        address: token1Address,
        symbol: token1Symbol,
        decimals: Number(token1Decimals),
        name: token1Name,
        amount: amount1.toSignificant(10),
        priceUSD: token1PriceUSD.toFixed(6)
      },
      
      // Fee tier
      fee,
      feePercent: (fee / 10000).toFixed(2) + '%',
      
      // Liquidez
      liquidity: liquidity.toString(),
      poolLiquidity: poolLiquidity.toString(),
      
      // Range
      range: {
        tickLower,
        tickUpper,
        priceLower: priceLower.toSignificant(10),
        priceUpper: priceUpper.toSignificant(10),
        priceLowerInverted: priceLowerInverted.toSignificant(10),
        priceUpperInverted: priceUpperInverted.toSignificant(10)
      },
      
      // Situação atual
      // Preço em token1/token0 (USDC por WETH) - como exibido no Uniswap
      current: {
        tick: currentTick,
        price: currentPriceValue ? currentPriceValue.toString() : (currentPrice && typeof currentPrice === 'object' && currentPrice.toSignificant ? currentPrice.toSignificant(10) : null),
        priceInverted: currentPriceInverted && typeof currentPriceInverted === 'object' && currentPriceInverted.toSignificant ? currentPriceInverted.toSignificant(10) : (currentPriceValue ? (1 / currentPriceValue).toString() : null),
        sqrtPriceX96: sqrtPriceX96 ? sqrtPriceX96.toString() : null,
        inRange
      },
      
      // Fees acumulados
      fees: {
        token0: {
          amount: fees0,
          symbol: token0Symbol,
          usd: feesUSDToken0.toFixed(2)
        },
        token1: {
          amount: fees1,
          symbol: token1Symbol,
          usd: feesUSDToken1.toFixed(2)
        },
        totalUSD: totalFeesUSD.toFixed(2)
      },
      
      // TVL
      tvl: {
        token0USD: tvlToken0.toFixed(2),
        token1USD: tvlToken1.toFixed(2),
        totalUSD: totalTVL.toFixed(2)
      },
      
      // Status
      inRange,
      
      // Timestamp
      fetchedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erro ao buscar posição:', error);
    throw new Error(`Falha ao buscar dados: ${error.message}`);
  }
}

/**
 * Busca endereço da pool usando Factory
 */
async function getPoolAddressFromFactory(token0, token1, fee, chain) {
  const contracts = UNISWAP_V3_CONTRACTS[chain];
  
  if (!contracts || !contracts.FACTORY) {
    throw new Error(`Factory não configurado para chain ${chain}`);
  }

  const provider = getProvider(chain);
  const FACTORY_ABI = [
    'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
  ];
  
  const factory = new ethers.Contract(contracts.FACTORY, FACTORY_ABI, provider);
  
  // Normalizar endereços (token0 < token1)
  const token0Normalized = ethers.utils.getAddress(token0);
  const token1Normalized = ethers.utils.getAddress(token1);
  
  const [tokenA, tokenB] = token0Normalized < token1Normalized 
    ? [token0Normalized, token1Normalized]
    : [token1Normalized, token0Normalized];
  
  const poolAddress = await factory.getPool(tokenA, tokenB, fee);
  
  if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('Pool não encontrada via Factory');
  }
  
  return poolAddress;
}

/**
 * Calcula o endereço da pool usando CREATE2 (mesmo método do Uniswap)
 */
function computePoolAddress(token0, token1, fee, chain) {
  const contracts = UNISWAP_V3_CONTRACTS[chain];
  
  if (!contracts || !contracts.FACTORY) {
    throw new Error(`Factory não configurado para chain ${chain}`);
  }
  
  // Ordena tokens (token0 < token1)
  const [tokenA, tokenB] = token0.toLowerCase() < token1.toLowerCase() 
    ? [token0, token1] 
    : [token1, token0];

  // Encode dos parâmetros
  const abiCoder = new ethers.utils.AbiCoder();
  const salt = ethers.utils.keccak256(
    abiCoder.encode(['address', 'address', 'uint24'], [tokenA, tokenB, fee])
  );

  // POOL_INIT_CODE_HASH do Uniswap V3 (mesmo para todas as chains)
  const POOL_INIT_CODE_HASH = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';

  // Normalizar endereço da factory
  const factoryAddress = ethers.utils.getAddress(contracts.FACTORY.toLowerCase());
  
  // Calcula endereço via CREATE2
  const poolAddress = ethers.utils.getCreate2Address(
    factoryAddress,
    salt,
    POOL_INIT_CODE_HASH
  );

  return poolAddress;
}

/**
 * Busca preço real de mercado de um par de tokens (ex: WETH/USDC)
 * Tenta usar APIs externas para obter o preço atual
 */
async function getRealMarketPrice(token0Symbol, token1Symbol, chain) {
  try {
    // Se for par WETH/USDC ou USDC/WETH, tentar buscar via CoinGecko
    const pair = `${token0Symbol}/${token1Symbol}`.toUpperCase();
    const pairInverted = `${token1Symbol}/${token0Symbol}`.toUpperCase();
    
    // Mapear símbolos para IDs do CoinGecko
    const coinGeckoIds = {
      'WETH': 'weth',
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'DAI': 'dai'
    };
    
    const token0Id = coinGeckoIds[token0Symbol.toUpperCase()] || token0Symbol.toLowerCase();
    const token1Id = coinGeckoIds[token1Symbol.toUpperCase()] || token1Symbol.toLowerCase();
    
    // Se token1 é stablecoin (USDC, USDT, DAI), calcular preço como token0/token1
    if (['USDC', 'USDT', 'DAI'].includes(token1Symbol.toUpperCase())) {
      try {
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${token0Id}&vs_currencies=usd`);
        const data = await response.json();
        if (data[token0Id] && data[token0Id].usd) {
          // Preço em USD do token0, então token1/token0 = 1 / (token0/usd)
          // Mas queremos token1/token0, então se token1 = 1 USD, preço = token0PriceUSD
          // Na verdade, se queremos USDC por WETH, e WETH = $X, então USDC/WETH = X
          return data[token0Id].usd;
        }
      } catch (e) {
        console.log('⚠️  Erro ao buscar preço via CoinGecko:', e.message);
      }
    }
    
    // Tentar via Uniswap Subgraph (se disponível)
    // Por enquanto, retornar null para usar fallback
    return null;
  } catch (error) {
    console.log('⚠️  Erro ao buscar preço real:', error.message);
    return null;
  }
}

/**
 * Busca preço de um token em USD
 * Prioridade: 1. Stablecoins conhecidas, 2. Preços fixos conhecidos, 3. Fallback
 */
async function getTokenPriceUSD(symbol, address, chain) {
  // Stablecoins conhecidas
  const stablecoins = {
    'USDC': 1.0,
    'USDT': 1.0,
    'DAI': 1.0,
    'BUSD': 1.0,
    'FRAX': 1.0
  };

  if (stablecoins[symbol.toUpperCase()]) {
    return stablecoins[symbol.toUpperCase()];
  }

  // Preços fixos conhecidos (fallback)
  const knownPrices = {
    'WETH': 3300,
    'ETH': 3300,
    'WBTC': 43000,
    'BTC': 43000
  };

  if (knownPrices[symbol.toUpperCase()]) {
    console.log(`💰 Usando preço conhecido para ${symbol}: $${knownPrices[symbol.toUpperCase()]}`);
    return knownPrices[symbol.toUpperCase()];
  }

  // TODO: Integrar com CoinGecko ou outra API de preços
  // Por enquanto, retorna 0
  console.warn(`⚠️  Preço não encontrado para ${symbol}, usando $0`);
  return 0;
}

/**
 * Retorna Chain ID
 */
function getChainId(chain) {
  const chainIds = {
    ethereum: 1,
    base: 8453,
    polygon: 137,
    arbitrum: 42161,
    optimism: 10,
    bsc: 56
  };
  
  return chainIds[chain.toLowerCase()] || 1;
}

/**
 * Formata número para exibição
 */
function formatNumber(num, decimals = 2) {
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

module.exports = {
  getCompletePositionData,
  computePoolAddress,
  getTokenPriceUSD,
  getChainId,
  formatNumber
};
