// tiktokinteractive/frontend/js/combat/eventBus.js

(function () {
  function createEventBus() {
    const listeners = new Map();

    function on(eventName, callback) {
      if (typeof callback !== 'function') return null;
      if (!listeners.has(eventName)) {
        listeners.set(eventName, []);
      }

      const handlers = listeners.get(eventName);
      handlers.push(callback);
      return () => off(eventName, callback);
    }

    function off(eventName, callback) {
      if (!listeners.has(eventName)) return;
      const handlers = listeners.get(eventName);
      const nextHandlers = handlers.filter((handler) => handler !== callback);
      listeners.set(eventName, nextHandlers);
    }

    function emit(eventName, detail) {
      if (!listeners.has(eventName)) return;
      listeners.get(eventName).forEach((handler) => handler(detail));
    }

    function clear() {
      listeners.clear();
    }

    return {
      on,
      off,
      emit,
      clear,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.eventBus = {
    createEventBus,
  };
})();
