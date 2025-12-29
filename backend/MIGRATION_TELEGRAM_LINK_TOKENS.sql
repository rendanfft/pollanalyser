-- ========================================
-- Migração: Sistema de Vinculação Telegram
-- Execute este SQL no Supabase SQL Editor
-- ========================================

-- Tabela para tokens de vinculação temporários
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token ON telegram_link_tokens(token) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user_id ON telegram_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_at ON telegram_link_tokens(expires_at);

-- Adicionar campo telegram_username na tabela users (se não existir)
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255);

-- Atualizar tabela alerts_history com campos do Telegram
ALTER TABLE alerts_history 
ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
ADD COLUMN IF NOT EXISTS telegram_error TEXT;

-- Comentários
COMMENT ON TABLE telegram_link_tokens IS 'Tokens temporários para vincular contas ao Telegram';
COMMENT ON COLUMN telegram_link_tokens.token IS 'Token único gerado para vinculação (formato: TG-XXXXXXXXXXXXX)';
COMMENT ON COLUMN telegram_link_tokens.expires_at IS 'Data de expiração do token (15 minutos)';
COMMENT ON COLUMN alerts_history.telegram_message_id IS 'ID da mensagem enviada no Telegram';
COMMENT ON COLUMN alerts_history.telegram_error IS 'Erro ao enviar mensagem no Telegram (se houver)';

-- Função para limpar tokens expirados (rodar diariamente via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_telegram_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM telegram_link_tokens 
  WHERE expires_at < NOW() - INTERVAL '1 day' OR used = true;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- FIM DO SQL
-- ========================================

