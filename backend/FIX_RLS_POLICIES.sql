-- ========================================
-- CORREÇÃO DAS POLÍTICAS RLS DO SUPABASE
-- Execute este SQL no Supabase SQL Editor
-- ========================================

-- Remover políticas antigas que podem estar bloqueando
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can view own pools" ON monitored_pools;
DROP POLICY IF EXISTS "Users can insert own pools" ON monitored_pools;
DROP POLICY IF EXISTS "Users can update own pools" ON monitored_pools;
DROP POLICY IF EXISTS "Users can delete own pools" ON monitored_pools;

-- Criar políticas que permitem acesso via service_role
-- Como estamos usando service_role key no backend, essas políticas permitem tudo
CREATE POLICY "Service role can manage users" ON users 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Service role can manage pools" ON monitored_pools 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Service role can manage alerts" ON alerts_history 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Service role can manage metrics" ON pool_metrics 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- ========================================
-- FIM DA CORREÇÃO
-- ========================================


