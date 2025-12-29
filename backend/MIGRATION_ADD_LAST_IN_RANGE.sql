-- Migração: Adicionar campo last_in_range na tabela monitored_pools
-- Execute este SQL no Supabase SQL Editor se a tabela já foi criada

ALTER TABLE monitored_pools 
ADD COLUMN IF NOT EXISTS last_in_range BOOLEAN;

-- Comentário: Este campo armazena o último status conhecido da pool (true = no range, false = fora do range, null = nunca verificado)


