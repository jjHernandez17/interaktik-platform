// Configuración global para URLs de API
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://interaktik-platform-production.up.railway.app';

// Función helper para redirecciones con logs
function redirectWithLog(path, reason) {
  console.log(`🔄 Redirección: ${reason} -> ${path}`);
  window.location.href = path;
}

// Exportar para uso en otros archivos
window.API_BASE_URL = API_BASE_URL;
window.redirectWithLog = redirectWithLog;