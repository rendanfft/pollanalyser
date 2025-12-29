const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Registra um novo usuário
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validações
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nome, email e senha são obrigatórios'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Senha deve ter no mínimo 8 caracteres'
      });
    }

    // Verificar se email já existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email já cadastrado'
      });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Criar usuário
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        name,
        email: email.toLowerCase(),
        password_hash: passwordHash
      })
      .select('id, name, email, created_at')
      .single();

    if (error) {
      console.error('Erro ao criar usuário no Supabase:', error);
      
      // Mensagens de erro mais específicas
      if (error.code === '23505') { // Violação de constraint única
        return res.status(400).json({
          success: false,
          error: 'Email já cadastrado'
        });
      }
      
      if (error.code === '42P01') { // Tabela não existe
        return res.status(500).json({
          success: false,
          error: 'Erro de configuração do banco de dados. Verifique se as tabelas foram criadas.'
        });
      }
      
      if (error.message && error.message.includes('permission denied') || error.message.includes('RLS')) {
        return res.status(500).json({
          success: false,
          error: 'Erro de permissão no banco de dados. Verifique as políticas RLS do Supabase.'
        });
      }
      
      throw error;
    }

    // Gerar token
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    
    // Mensagem de erro mais detalhada para debug
    const errorMessage = error.message || 'Erro desconhecido';
    console.error('Detalhes do erro:', {
      message: errorMessage,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar conta. Tente novamente.'
    });
  }
});

/**
 * POST /api/auth/login
 * Autentica um usuário
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validações
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email e senha são obrigatórios'
      });
    }

    // Buscar usuário
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, password_hash, telegram_chat_id')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Email ou senha incorretos'
      });
    }

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Email ou senha incorretos'
      });
    }

    // Gerar token
    const token = generateToken(user);

    // Remover password_hash da resposta
    delete user.password_hash;

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        telegram_chat_id: user.telegram_chat_id
      }
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao fazer login. Tente novamente.'
    });
  }
});

module.exports = router;

