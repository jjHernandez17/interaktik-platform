(function () {
  function createShieldWave(projectile) {
    return {
      id: projectile?.id || 'shield-wave',
      name: 'ShieldWave',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.shieldWave = createShieldWave;
})();
