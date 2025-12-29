/**
 * Formata mensagem de pool fora do range
 */
function formatOutOfRangeMessage(pool) {
  const emoji = '🚨';
  const priceFormatted = formatPrice(pool.current_price);
  const lowerFormatted = formatPrice(pool.price_lower);
  const upperFormatted = formatPrice(pool.price_upper);

  // Calcula distância do range
  let distanceText = '';
  if (pool.current_price && pool.price_lower && pool.current_price < pool.price_lower) {
    const distance = ((pool.price_lower - pool.current_price) / pool.price_lower * 100).toFixed(2);
    distanceText = `\n📉 *${distance}% abaixo* do range mínimo`;
  } else if (pool.current_price && pool.price_upper && pool.current_price > pool.price_upper) {
    const distance = ((pool.current_price - pool.price_upper) / pool.price_upper * 100).toFixed(2);
    distanceText = `\n📈 *${distance}% acima* do range máximo`;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const poolUrl = `${appUrl}/pools/${pool.id}`;

  return (
    `${emoji} *ALERTA: Pool Fora do Range!*\n\n` +
    `*Pool:* ${pool.token0_symbol}/${pool.token1_symbol} (${(pool.fee_tier / 10000).toFixed(2)}%)\n` +
    `*Chain:* ${pool.chain}\n` +
    `*Protocol:* ${pool.protocol}\n\n` +
    `💰 *Preço atual:* ${priceFormatted}${distanceText}\n` +
    `📊 *Seu range:* ${lowerFormatted} - ${upperFormatted}\n\n` +
    `⚠️ *Você NÃO está ganhando fees!*\n\n` +
    `*Ações sugeridas:*\n` +
    `• Rebalancear sua posição\n` +
    `• Aguardar retorno ao range\n` +
    `• Avaliar impermanent loss\n\n` +
    `[Ver Detalhes no App](${poolUrl})`
  );
}

/**
 * Formata mensagem de fees acumulados
 */
function formatFeesMessage(pool) {
  const feesFormatted = formatUSD(pool.fees_uncollected_usd);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const poolUrl = `${appUrl}/pools/${pool.id}`;

  return (
    `💰 *Fees Acumulados!*\n\n` +
    `*Pool:* ${pool.token0_symbol}/${pool.token1_symbol}\n` +
    `*Fees não coletados:* ${feesFormatted}\n\n` +
    `Você atingiu o limite configurado de fees.\n` +
    `Considere coletar seus ganhos!\n\n` +
    `[Ver Pool](${poolUrl})`
  );
}

/**
 * Formata mensagem de Impermanent Loss
 */
function formatILMessage(pool) {
  const ilPercent = pool.impermanent_loss ? parseFloat(pool.impermanent_loss).toFixed(2) : '0.00';
  const emoji = parseFloat(ilPercent) > 10 ? '⚠️' : '📊';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const poolUrl = `${appUrl}/pools/${pool.id}`;

  return (
    `${emoji} *Alerta de Impermanent Loss*\n\n` +
    `*Pool:* ${pool.token0_symbol}/${pool.token1_symbol}\n` +
    `*IL atual:* ${ilPercent}%\n\n` +
    `Seu IL ultrapassou o threshold configurado.\n` +
    `Avalie se vale a pena manter a posição.\n\n` +
    `[Analisar Posição](${poolUrl})`
  );
}

/**
 * Formata preço com casas decimais adequadas
 */
function formatPrice(price) {
  if (!price) return 'N/A';

  const num = parseFloat(price);

  if (num >= 1000) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (num >= 1) {
    return `$${num.toFixed(4)}`;
  } else if (num >= 0.0001) {
    return `$${num.toFixed(6)}`;
  } else {
    return `$${num.toExponential(2)}`;
  }
}

/**
 * Formata valor em USD
 */
function formatUSD(value) {
  if (!value) return '$0.00';
  return `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = {
  formatOutOfRangeMessage,
  formatFeesMessage,
  formatILMessage,
  formatPrice,
  formatUSD
};

