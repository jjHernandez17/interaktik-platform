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

    if (url.startsWith('/api/') || url === '/events') {
      return `${apiBaseUrl}${url}`;
    }

    return url;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function fetchWithApiBase(input, init) {
    if (typeof input === 'string') {
      return originalFetch(withBase(input), init);
    }

    if (input && typeof input.url === 'string') {
      const request = new Request(withBase(input.url), input);
      return originalFetch(request, init);
    }

    return originalFetch(input, init);
  };

  const OriginalEventSource = window.EventSource;
  window.EventSource = function EventSourceWithApiBase(url, config) {
    return new OriginalEventSource(withBase(url), config);
  };

  window.apiBaseUrl = apiBaseUrl;
})();