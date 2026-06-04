// Configuración global para URLs de API
function resolveApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryOverride = params.get('apiBaseUrl');
  const storedOverride = window.localStorage.getItem('interaktik.apiBaseUrl');

  if (window.__INTERAKTIK_API_BASE_URL__) {
    return window.__INTERAKTIK_API_BASE_URL__;
  }

  if (queryOverride) {
    return queryOverride;
  }

  if (storedOverride) {
    return storedOverride;
  }

  return 'https://interaktik-platform-production.up.railway.app';
}

const API_BASE_URL = resolveApiBaseUrl();

// Función helper para redirecciones con logs
function redirectWithLog(path, reason) {
  console.log(`🔄 Redirección: ${reason} -> ${path}`);
  window.location.href = path;
}

// Exportar para uso en otros archivos
window.API_BASE_URL = API_BASE_URL;
window.setApiBaseUrlOverride = function setApiBaseUrlOverride(url) {
  if (!url) {
    window.localStorage.removeItem('interaktik.apiBaseUrl');
    return;
  }

  window.localStorage.setItem('interaktik.apiBaseUrl', url);
};
window.redirectWithLog = redirectWithLog;