// Configuração da API
// Em produção, será definido via variável de ambiente do Vercel
// Em desenvolvimento, usa localhost
window.API_URL = window.API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://pollanalyser-backend.onrender.com'); // ⚠️ ATUALIZE COM SUA URL DO RENDER

window.API_BASE_URL = window.API_URL + '/api';

