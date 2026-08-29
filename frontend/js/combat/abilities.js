//TiktokInteractive/frontend/js/combat/abilities.js
//
// Catálogo único de poderes: esta es la fuente de verdad tanto para lo que
// el motor de combate ejecuta como para lo que la UI de configuración
// muestra/edita (combat/index.js delega aquí en vez de mantener una lista
// separada, para que nunca puedan desincronizarse otra vez).

(function () {
  // Estilos visuales que projectileRenderer.js sabe dibujar. Cualquier poder,
  // de fábrica o creado por el usuario, debe usar uno de estos.
  const PROJECTILE_TYPES = [
    { value: 'basic-bullet', label: 'Bala básica' },
    { value: 'heavy-bullet', label: 'Bala pesada' },
    { value: 'rocket', label: 'Cohete' },
    { value: 'laser', label: 'Láser' },
    { value: 'meteor', label: 'Meteoro' },
    { value: 'fireball', label: 'Bola de fuego' },
    { value: 'bomb', label: 'Bomba' },
    { value: 'heal-orb', label: 'Orbe de curación' },
    { value: 'shield-wave', label: 'Onda de escudo' },
  ];

  function createAbilityDefinition(id, config) {
    return {
      id,
      name: config?.name || 'Poder',
      type: config?.type === 'support' ? 'support' : 'attack',
      projectileType: config?.projectileType || 'basic-bullet',
      color: config?.color || '#f59e0b',
      damage: Number(config?.damage || 0),
      healing: Number(config?.healing || 0),
      shield: Number(config?.shield || 0),
      shots: Math.max(1, Number(config?.shots || 1)),
      explosionRadius: Math.max(0, Number(config?.explosionRadius || 0)),
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
        name: 'Bala básica',
        type: 'attack',
        projectileType: 'basic-bullet',
        color: '#f59e0b',
        damage: 35,
        projectileSpeed: 1.4,
        projectileSize: 8,
        cooldownMs: 160,
        animationDuration: 280,
      }),
      createAbilityDefinition('heavy-shot', {
        name: 'Disparo pesado',
        type: 'attack',
        projectileType: 'heavy-bullet',
        color: '#ef4444',
        damage: 70,
        projectileSpeed: 1.05,
        projectileSize: 12,
        cooldownMs: 240,
        animationDuration: 360,
      }),
      createAbilityDefinition('rocket-launcher', {
        name: 'Lanzacohetes',
        type: 'attack',
        projectileType: 'rocket',
        color: '#f97316',
        damage: 90,
        explosionRadius: 60,
        projectileSpeed: 0.95,
        projectileSize: 14,
        cooldownMs: 320,
        animationDuration: 420,
      }),
      createAbilityDefinition('meteor-rain', {
        name: 'Lluvia de meteoros',
        type: 'attack',
        projectileType: 'meteor',
        color: '#8b5cf6',
        damage: 60,
        shots: 5,
        explosionRadius: 50,
        projectileSpeed: 0.7,
        projectileSize: 16,
        cooldownMs: 900,
        animationDuration: 560,
      }),
      createAbilityDefinition('laser-storm', {
        name: 'Tormenta láser',
        type: 'attack',
        projectileType: 'laser',
        color: '#e11d48',
        damage: 20,
        shots: 6,
        projectileSpeed: 3,
        projectileSize: 4,
        cooldownMs: 700,
        animationDuration: 180,
      }),
      createAbilityDefinition('fireball', {
        name: 'Bola de fuego',
        type: 'attack',
        projectileType: 'fireball',
        color: '#f97316',
        damage: 55,
        explosionRadius: 34,
        projectileSpeed: 1.1,
        projectileSize: 12,
        cooldownMs: 340,
        animationDuration: 340,
      }),
      createAbilityDefinition('bombardment', {
        name: 'Bombardeo',
        type: 'attack',
        projectileType: 'bomb',
        color: '#8b5cf6',
        damage: 90,
        shots: 3,
        explosionRadius: 54,
        projectileSpeed: 1.4,
        projectileSize: 12,
        cooldownMs: 420,
        animationDuration: 420,
      }),
      createAbilityDefinition('heal', {
        name: 'Curación',
        type: 'support',
        projectileType: 'heal-orb',
        color: '#22c55e',
        healing: 24,
        projectileSpeed: 1.1,
        projectileSize: 9,
        cooldownMs: 260,
        animationDuration: 320,
      }),
      createAbilityDefinition('heal-burst', {
        name: 'Ráfaga de curación',
        type: 'support',
        projectileType: 'heal-orb',
        color: '#22c55e',
        healing: 16,
        explosionRadius: 40,
        projectileSpeed: 1.1,
        projectileSize: 9,
        cooldownMs: 300,
        animationDuration: 300,
      }),
      createAbilityDefinition('shield', {
        name: 'Escudo',
        type: 'support',
        projectileType: 'shield-wave',
        color: '#38bdf8',
        shield: 35,
        projectileSpeed: 1.15,
        projectileSize: 10,
        cooldownMs: 280,
        animationDuration: 320,
      }),
      createAbilityDefinition('shield-burst', {
        name: 'Ráfaga de escudo',
        type: 'support',
        projectileType: 'shield-wave',
        color: '#38bdf8',
        shield: 20,
        explosionRadius: 40,
        projectileSpeed: 0.9,
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
    PROJECTILE_TYPES,
    createAbilityDefinition,
    createAbilityCatalog,
    getAbilityById,
  };
})();
