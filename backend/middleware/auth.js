const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Middleware de autenticação JWT
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token de autenticação não fornecido'
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      error: 'JWT_SECRET não configurado no servidor'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Token inválido ou expirado'
      });
    }

    req.user = user;
    next();
  });
}

/**
 * Gera um token JWT para um usuário
 */
function generateToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET não configurado');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Token expira em 7 dias
  );
}

module.exports = {
  authenticateToken,
  generateToken
};


