const { ethers } = require('ethers');
require('dotenv').config();

// Providers Web3 para diferentes chains
const providers = {};

// Base Chain
if (process.env.BASE_RPC_URL) {
  providers.base = new ethers.providers.JsonRpcProvider(process.env.BASE_RPC_URL);
}

// Ethereum
if (process.env.ETHEREUM_RPC_URL) {
  providers.ethereum = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
}

// Endereços dos contratos Uniswap V3 (com checksum correto)
const UNISWAP_V3_CONTRACTS = {
  base: {
    NONFUNGIBLE_POSITION_MANAGER: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    FACTORY: '0x33128a8fC17869897dcE68Ed026d69B5cc496DA1'.toLowerCase(), // Usar lowercase para evitar checksum
    POOL_DEPLOYER: '0x4200000000000000000000000000000000000006'
  },
  ethereum: {
    NONFUNGIBLE_POSITION_MANAGER: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    POOL_DEPLOYER: '0x4200000000000000000000000000000000000006'
  }
};

// ABI mínimo do NonfungiblePositionManager
const POSITION_MANAGER_ABI = [
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function tokenURI(uint256 tokenId) external view returns (string memory)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external returns (uint256 amount0, uint256 amount1)'
];

// ABI mínimo da Pool
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function liquidity() external view returns (uint128)',
  'function feeGrowthGlobal0X128() external view returns (uint256)',
  'function feeGrowthGlobal1X128() external view returns (uint256)',
  'function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)'
];

// ABI mínimo do ERC20 para pegar símbolo
const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)'
];

function getProvider(chain) {
  const provider = providers[chain];
  if (!provider) {
    throw new Error(`Provider não configurado para a chain: ${chain}`);
  }
  return provider;
}

function getPositionManagerAddress(chain) {
  const contracts = UNISWAP_V3_CONTRACTS[chain];
  if (!contracts) {
    throw new Error(`Contratos Uniswap V3 não configurados para a chain: ${chain}`);
  }
  return contracts.NONFUNGIBLE_POSITION_MANAGER;
}

function getPositionManagerContract(chain) {
  const provider = getProvider(chain);
  const address = getPositionManagerAddress(chain);
  return new ethers.Contract(address, POSITION_MANAGER_ABI, provider);
}

function getPoolContract(poolAddress, chain) {
  const provider = getProvider(chain);
  return new ethers.Contract(poolAddress, POOL_ABI, provider);
}

function getERC20Contract(tokenAddress, chain) {
  const provider = getProvider(chain);
  return new ethers.Contract(tokenAddress, ERC20_ABI, provider);
}

module.exports = {
  getProvider,
  getPositionManagerAddress,
  getPositionManagerContract,
  getPoolContract,
  getERC20Contract,
  UNISWAP_V3_CONTRACTS,
  POSITION_MANAGER_ABI,
  POOL_ABI,
  ERC20_ABI
};

