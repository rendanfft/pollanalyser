-- Adicionar campos current_price e fees_uncollected à tabela monitored_pools

ALTER TABLE monitored_pools 
ADD COLUMN IF NOT EXISTS current_price NUMERIC,
ADD COLUMN IF NOT EXISTS fees_uncollected_usd NUMERIC DEFAULT 0;

-- Comentários
COMMENT ON COLUMN monitored_pools.current_price IS 'Preço atual de mercado (token1/token0)';
COMMENT ON COLUMN monitored_pools.fees_uncollected_usd IS 'Fees acumulados não coletados em USD';


