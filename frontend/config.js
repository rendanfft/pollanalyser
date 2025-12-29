(function() {
  // Verifica se estamos em desenvolvimento (localhost)
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '';
  
  if (isLocalhost) {
    window.API_URL = 'http://localhost:3000';
  } else {
    // Em produção (Vercel), usa a URL do backend no Render
    // A variável de ambiente do Vercel será injetada via script antes deste arquivo
    window.API_URL = window.API_URL || 'https://pollanalyser.onrender.com';
  }
  
  window.API_BASE_URL = window.API_URL + '/api';
  
  // Debug (remover em produção se necessário)
  console.log('[API Config] API_URL:', window.API_URL);
  console.log('[API Config] API_BASE_URL:', window.API_BASE_URL);
})();

