(function () {
  function createHealOrb(projectile) {
    return {
      id: projectile?.id || 'heal-orb',
      name: 'HealOrb',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.healOrb = createHealOrb;
})();
