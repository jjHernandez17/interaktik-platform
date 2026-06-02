(function () {
  let apiBaseUrl = window.API_BASE_URL || window.__INTERAKTIK_API_BASE_URL__ || '';

  // Si no está definida o está vacía, construir dinámicamente
  if (!apiBaseUrl) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.host;
    apiBaseUrl = `${protocol}//${host}`;
  }

  function withBase(url) {
    if (typeof url !== 'string') {
      return url;
    }

    if (url.startsWith('/api/') || url.startsWith('/events')) {
      return `${apiBaseUrl}${url}`;
    }

    return url;
  }

  function isFrontendAssetOrPage(url) {
    return typeof url === 'string' && (
      url.startsWith('/') && (
        url.endsWith('.html') ||
        url.endsWith('.css') ||
        url.endsWith('.js') ||
        url.includes('/assets/')
      )
    );
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function fetchWithApiBase(input, init = {}) {
    // Asegurarnos de que enviamos cookies cross-origin en todas las peticiones a la API
    init.credentials = init.credentials || 'include';

    if (typeof input === 'string') {
      const targetUrl = withBase(input);

      if (targetUrl !== input) {
        console.info(`[fetch] API request: ${input} -> ${targetUrl}`);
      } else if (isFrontendAssetOrPage(input)) {
        console.debug(`[fetch] Frontend request passthrough: ${input}`);
      }

      return originalFetch(targetUrl, init);
    }

    if (input && typeof input.url === 'string') {
      const targetUrl = withBase(input.url);

      if (targetUrl !== input.url) {
        console.info(`[fetch] API request: ${input.url} -> ${targetUrl}`);
      } else if (isFrontendAssetOrPage(input.url)) {
        console.debug(`[fetch] Frontend request passthrough: ${input.url}`);
      }

      const request = new Request(targetUrl, input);
      return originalFetch(request, init);
    }

    return originalFetch(input, init);
  };

  const OriginalEventSource = window.EventSource;
  window.EventSource = function EventSourceWithApiBase(url, config = {}) {
    config.withCredentials = true;
    const targetUrl = withBase(url);
    console.info(`[sse] EventSource request: ${url} -> ${targetUrl}`);
    return new OriginalEventSource(targetUrl, config);
  };

  window.apiBaseUrl = apiBaseUrl;
})();