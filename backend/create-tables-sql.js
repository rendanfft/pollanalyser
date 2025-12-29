// Script para gerar o SQL completo que precisa ser executado no Supabase

const fs = require('fs');

const sql = `-- ========================================
-- LIQUIDITYGUARD - SQL COMPLETO
-- Execute este SQL no Supabase SQL Editor
-- ========================================

-- Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Pools Monitoradas
CREATE TABLE IF NOT EXISTS monitored_pools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pool_id TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  token0_symbol TEXT NOT NULL,
  token1_symbol TEXT NOT NULL,
  fee_tier INTEGER NOT NULL,
  chain TEXT NOT NULL,
  protocol TEXT NOT NULL,
  price_lower NUMERIC NOT NULL,
  price_upper NUMERIC NOT NULL,
  alert_out_of_range BOOLEAN DEFAULT true,
  alert_fees_threshold NUMERIC DEFAULT 0,
  alert_il_threshold NUMERIC DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  last_in_range BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Histórico de Alertas
CREATE TABLE IF NOT EXISTS alerts_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID REFERENCES monitored_pools(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  was_sent_telegram BOOLEAN DEFAULT false
);

-- Tabela de Métricas de Pool
CREATE TABLE IF NOT EXISTS pool_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID REFERENCES monitored_pools(id) ON DELETE CASCADE,
  current_price NUMERIC NOT NULL,
  in_range BOOLEAN NOT NULL,
  tvl NUMERIC,
  fees_earned_24h NUMERIC,
  impermanent_loss NUMERIC,
  apr NUMERIC,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_monitored_pools_user_id ON monitored_pools(user_id);
CREATE INDEX IF NOT EXISTS idx_monitored_pools_is_active ON monitored_pools(is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_history_pool_id ON alerts_history(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_metrics_pool_id ON pool_metrics(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_metrics_recorded_at ON pool_metrics(recorded_at DESC);

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_metrics ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (ajustadas para usar service_role)
-- Nota: Com service_role, essas políticas podem ser ignoradas, mas é bom tê-las
CREATE POLICY IF NOT EXISTS "Users can view own data" ON users FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Users can update own data" ON users FOR UPDATE USING (true);

CREATE POLICY IF NOT EXISTS "Users can view own pools" ON monitored_pools FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Users can insert own pools" ON monitored_pools FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Users can update own pools" ON monitored_pools FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS "Users can delete own pools" ON monitored_pools FOR DELETE USING (true);

-- Comentários
COMMENT ON TABLE users IS 'Usuários do sistema';
COMMENT ON TABLE monitored_pools IS 'Pools monitoradas pelos usuários';
COMMENT ON TABLE alerts_history IS 'Histórico de alertas enviados';
COMMENT ON TABLE pool_metrics IS 'Métricas coletadas das pools';

-- ========================================
-- FIM DO SQL
-- ========================================
`;

fs.writeFileSync('COMPLETE_SETUP.sql', sql);
console.log('✅ Arquivo COMPLETE_SETUP.sql criado!');
console.log('   Execute este arquivo no Supabase SQL Editor.\n');


