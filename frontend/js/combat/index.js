//tiktokinteractive/frontend/js/combat/index.js

(function () {
  function createDefaultPowerCatalog() {
    return [
      {
        id: 'basic-shot',
        name: 'Bala básica',
        type: 'attack',
        damage: 35,
        healing: 0,
        shield: 0,
        shots: 1,
        explosionRadius: 0,
        projectileSpeed: 1.2,
        color: '#f59e0b',
        animationDuration: 280,
      },
      {
        id: 'heavy-shot',
        name: 'Disparo pesado',
        type: 'attack',
        damage: 70,
        healing: 0,
        shield: 0,
        shots: 1,
        explosionRadius: 0,
        projectileSpeed: 0.8,
        color: '#ef4444',
        animationDuration: 360,
      },
      {
        id: 'shield-burst',
        name: 'Escudo',
        type: 'support',
        damage: 0,
        healing: 0,
        shield: 35,
        shots: 1,
        explosionRadius: 0,
        projectileSpeed: 0.9,
        color: '#38bdf8',
        animationDuration: 320,
      },
      {
        id: 'bombardment',
        name: 'Bombardeo',
        type: 'attack',
        damage: 90,
        healing: 0,
        shield: 0,
        shots: 3,
        explosionRadius: 54,
        projectileSpeed: 1.4,
        color: '#8b5cf6',
        animationDuration: 420,
      },
      {
        id: 'heal-burst',
        name: 'Ráfaga de curación',
        type: 'support',
        damage: 0,
        healing: 24,
        shield: 0,
        shots: 1,
        explosionRadius: 24,
        projectileSpeed: 1.1,
        color: '#22c55e',
        animationDuration: 300,
      },
    ];
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

  window.DominanceCombat = {
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
  };
})();
