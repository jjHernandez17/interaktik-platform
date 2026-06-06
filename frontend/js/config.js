// Configuración global para URLs de API
function resolveApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryOverride = params.get('apiBaseUrl');
  const storedOverride = window.localStorage.getItem('interaktik.apiBaseUrl');
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const prodFallback = 'https://interaktik-platform-production.up.railway.app';

  if (window.__INTERAKTIK_API_BASE_URL__) {
    return window.__INTERAKTIK_API_BASE_URL__;
  }

  if (queryOverride) {
    return queryOverride;
  }

  if (storedOverride) {
    return storedOverride;
  }

  return isLocalhost ? window.location.origin : prodFallback;
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
