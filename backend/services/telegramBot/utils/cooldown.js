// Cache em memória para cooldowns
const cooldownCache = new Map();

/**
 * Verifica se uma notificação está em cooldown
 * @param {string} key - Chave única do cooldown
 * @param {number} minutes - Tempo de cooldown em minutos
 * @returns {boolean} - true se ainda em cooldown, false se pode notificar
 */
function checkCooldown(key, minutes) {
  // Verifica cache primeiro
  if (cooldownCache.has(key)) {
    const cachedTime = cooldownCache.get(key);
    const elapsed = (Date.now() - cachedTime) / 1000 / 60; // em minutos

    if (elapsed < minutes) {
      return true; // Ainda em cooldown
    }
  }

  return false; // Pode notificar
}

/**
 * Define um cooldown
 */
function setCooldown(key) {
  cooldownCache.set(key, Date.now());
}

/**
 * Limpa cooldowns expirados do cache (rodar periodicamente)
 */
function cleanupCache() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 horas

  for (const [key, time] of cooldownCache.entries()) {
    if (now - time > maxAge) {
      cooldownCache.delete(key);
    }
  }
}

// Limpa cache a cada 1 hora
setInterval(cleanupCache, 60 * 60 * 1000);

module.exports = {
  checkCooldown,
  setCooldown
};

