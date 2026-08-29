//tiktokinteractive/frontend/js/combat/index.js

(function () {
  function createDefaultPowerCatalog() {
    // Fuente única: combat/abilities.js. Se delega aquí para que la UI de
    // configuración y el motor de combate nunca vuelvan a desincronizarse.
    return window.DominanceCombat?.abilities?.createAbilityCatalog?.() || [];
  }

  function createDefaultPowerBindings() {
    return [
      {
        id: 'binding-like',
        actionType: 'like',
        actionName: 'Like',
        powerId: 'basic-shot',
        parameterValue: 1,
      },
      {
        id: 'binding-follow',
        actionType: 'follow',
        actionName: 'Follow',
        powerId: 'shield-burst',
        parameterValue: 1,
      },
      {
        id: 'binding-share',
        actionType: 'share',
        actionName: 'Share',
        powerId: 'heal-burst',
        parameterValue: 1,
      },
      {
        id: 'binding-gift',
        actionType: 'gift',
        actionName: 'Rose',
        powerId: 'heavy-shot',
        parameterValue: 1,
      },
    ];
  }

  function createCombatState() {
    return {
      powerCatalog: createDefaultPowerCatalog(),
      powerBindings: createDefaultPowerBindings(),
    };
  }

  function ensureCombatState(state) {
    if (!state) return createCombatState();

    const powerCatalog = Array.isArray(state.powerCatalog) && state.powerCatalog.length > 0
      ? state.powerCatalog
      : createDefaultPowerCatalog();

    const powerBindings = Array.isArray(state.powerBindings) && state.powerBindings.length > 0
      ? state.powerBindings
      : createDefaultPowerBindings();

    return {
      powerCatalog,
      powerBindings,
    };
  }

  function initializeCombatState(state) {
    const combatState = ensureCombatState(state);
    return combatState;
  }

  function resetCombatState(state) {
    if (!state) return createCombatState();
    state.combat = createCombatState();
    return state.combat;
  }

  function getPowerById(powerCatalog, powerId) {
    return (powerCatalog || []).find((power) => power.id === powerId) || null;
  }

  function PowerCatalog() {
    return {
      items: createDefaultPowerCatalog(),
    };
  }

  function CombatQueue() {
    return [];
  }

  function DamageCalculator() {
    return {
      calculateDamage() {
        return 0;
      },
    };
  }

  function ProjectileEngine() {
    return {
      launch() {
        return null;
      },
    };
  }

  function registerCombatSystems() {
    return true;
  }

  function createCombatEngine(options) {
    return window.DominanceCombat?.CombatEngine?.create?.(options);
  }

  window.DominanceCombat = window.DominanceCombat || {};
  Object.assign(window.DominanceCombat, {
    createDefaultPowerCatalog,
    createDefaultPowerBindings,
    createCombatState,
    ensureCombatState,
    initializeCombatState,
    resetCombatState,
    getPowerById,
    PowerCatalog,
    CombatQueue,
    DamageCalculator,
    ProjectileEngine,
    registerCombatSystems,
    createCombatEngine,
  });
})();
