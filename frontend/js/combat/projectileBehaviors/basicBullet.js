(function () {
  function createBasicBullet(projectile) {
    return {
      id: projectile?.id || 'basic-bullet',
      name: 'BasicBullet',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.basicBullet = createBasicBullet;
})();
