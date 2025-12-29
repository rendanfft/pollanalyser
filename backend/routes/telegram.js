const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const supabase = require('../config/supabase');

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

/**
 * Gera token único para vinculação do Telegram
 * POST /api/telegram/generate-link-token
 */
router.post('/generate-link-token', async (req, res) => {
  try {
    const userId = req.user.id;

    // Gera token único no formato TG-XXXXXXXXXXXXX
    const prefix = 'TG-';
    const random = Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);
    const token = prefix + random.toUpperCase();

    // Token expira em 15 minutos
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Salva no banco
    const { data, error } = await supabase
      .from('telegram_link_tokens')
      .insert({
        token,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
        used: false
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao gerar token:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao gerar token de vinculação'
      });
    }

    // Gera deep link
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'SeuPoolBot';
    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    res.json({
      success: true,
      token,
      deep_link: deepLink,
      expires_at: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('Erro ao gerar token de vinculação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar token de vinculação'
    });
  }
});

/**
 * Verifica status da vinculação do Telegram
 * GET /api/telegram/status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabase
      .from('users')
      .select('telegram_chat_id, telegram_username')
      .eq('id', userId)
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      linked: !!user.telegram_chat_id,
      telegram_username: user.telegram_username || null
    });

  } catch (error) {
    console.error('Erro ao verificar status:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status'
    });
  }
});

/**
 * Desvincula Telegram da conta
 * POST /api/telegram/unlink
 */
router.post('/unlink', async (req, res) => {
  try {
    const userId = req.user.id;

    const { error } = await supabase
      .from('users')
      .update({
        telegram_chat_id: null,
        telegram_username: null
      })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Telegram desvinculado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao desvincular Telegram:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao desvincular Telegram'
    });
  }
});

module.exports = router;

