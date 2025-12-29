const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Importar rotas
const authRoutes = require('./routes/auth');
const poolsRoutes = require('./routes/pools');
const telegramRoutes = require('./routes/telegram');

// Importar scheduler
const { startScheduler } = require('./utils/scheduler');

// Importar serviços
const { initializeBot } = require('./services/telegramService');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS para aceitar requisições do frontend
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'https://pollanalyser.vercel.app',
  'https://pollanalyser-*.vercel.app', // Aceita qualquer subdomínio do Vercel
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    // Verificar se é do Vercel (qualquer subdomínio .vercel.app)
    const isVercel = origin.includes('.vercel.app');
    
    // Permitir se estiver na lista, for Vercel, ou se for desenvolvimento
    if (allowedOrigins.includes(origin) || isVercel || process.env.NODE_ENV === 'development') {
      console.log(`[CORS] Permitindo origem: ${origin}`);
      callback(null, true);
    } else {
      // Em produção, aceitar apenas origens conhecidas
      if (process.env.NODE_ENV === 'production') {
        console.log(`[CORS] Bloqueando origem: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      } else {
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/pools', poolsRoutes);
app.use('/api/telegram', telegramRoutes);

// Rota de informações da API
app.get('/', (req, res) => {
  res.json({
    message: 'PollANALYSER Backend API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login'
      },
      pools: {
        list: 'GET /api/pools',
        create: 'POST /api/pools',
        get: 'GET /api/pools/:id',
        update: 'PUT /api/pools/:id',
        delete: 'DELETE /api/pools/:id',
        check: 'POST /api/pools/:id/check',
        metrics: 'GET /api/pools/:id/metrics'
      },
      telegram: {
        generateToken: 'POST /api/telegram/generate-link-token',
        status: 'GET /api/telegram/status',
        unlink: 'POST /api/telegram/unlink'
      }
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n🚀 ========================================');
  console.log('🚀 PollANALYSER Backend iniciado!');
  console.log('🚀 ========================================');
  console.log(`📡 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log('');

  // Inicializar Telegram bot
  initializeBot();

  // Iniciar scheduler
  startScheduler();

  console.log('\n✅ Sistema pronto para monitorar pools!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⏹️  Recebido SIGTERM, encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⏹️  Recebido SIGINT, encerrando servidor...');
  process.exit(0);
});

module.exports = app;

