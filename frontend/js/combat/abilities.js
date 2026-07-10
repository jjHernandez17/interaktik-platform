//TiktokInteractive/frontend/js/combat/abilities.js

(function () {
  function createAbilityDefinition(id, config) {
    return {
      id,
      name: config?.name || 'Ability',
      type: config?.type || 'attack',
      projectileType: config?.projectileType || 'basic-bullet',
      damage: Number(config?.damage || 0),
      healing: Number(config?.healing || 0),
      shield: Number(config?.shield || 0),
      projectileSpeed: Number(config?.projectileSpeed || 1.4),
      projectileSize: Number(config?.projectileSize || 8),
      cooldownMs: Number(config?.cooldownMs || 160),
      animationDuration: Number(config?.animationDuration || 280),
      description: config?.description || '',
    };
  }

  function createAbilityCatalog() {
    return [
      createAbilityDefinition('basic-shot', {
        name: 'Basic Shot',
        type: 'attack',
        projectileType: 'basic-bullet',
        damage: 35,
        projectileSpeed: 1.4,
        projectileSize: 8,
        cooldownMs: 160,
        animationDuration: 280,
      }),
      createAbilityDefinition('heavy-shot', {
        name: 'Heavy Shot',
        type: 'attack',
        projectileType: 'basic-bullet',
        damage: 70,
        projectileSpeed: 1.05,
        projectileSize: 10,
        cooldownMs: 240,
        animationDuration: 360,
      }),
      createAbilityDefinition('rocket-launcher', {
        name: 'Rocket Launcher',
        type: 'attack',
        projectileType: 'rocket',
        damage: 90,
        projectileSpeed: 0.95,
        projectileSize: 12,
        cooldownMs: 320,
        animationDuration: 420,
      }),
      createAbilityDefinition('meteor-rain', {
        name: 'Meteor Rain',
        type: 'attack',
        projectileType: 'meteor',
        damage: 110,
        projectileSpeed: 0.7,
        projectileSize: 14,
        cooldownMs: 480,
        animationDuration: 560,
      }),
      createAbilityDefinition('heal', {
        name: 'Heal',
        type: 'support',
        projectileType: 'heal-orb',
        healing: 24,
        projectileSpeed: 1.1,
        projectileSize: 9,
        cooldownMs: 260,
        animationDuration: 320,
      }),
      createAbilityDefinition('shield', {
        name: 'Shield',
        type: 'support',
        projectileType: 'shield-wave',
        shield: 35,
        projectileSpeed: 1.15,
        projectileSize: 10,
        cooldownMs: 280,
        animationDuration: 320,
      }),
    ];
  }

  function getAbilityById(abilityId, catalog) {
    const items = Array.isArray(catalog) && catalog.length > 0 ? catalog : createAbilityCatalog();
    return items.find((ability) => ability.id === abilityId) || items[0] || null;
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.abilities = {
    createAbilityDefinition,
    createAbilityCatalog,
    getAbilityById,
  };
})();
