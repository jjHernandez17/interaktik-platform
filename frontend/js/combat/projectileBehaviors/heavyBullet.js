(function () {
  function createHeavyBullet(projectile) {
    return {
      id: projectile?.id || 'heavy-bullet',
      name: 'HeavyBullet',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.heavyBullet = createHeavyBullet;
})();
