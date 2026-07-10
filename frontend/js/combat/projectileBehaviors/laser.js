(function () {
  function createLaser(projectile) {
    return {
      id: projectile?.id || 'laser',
      name: 'Laser',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.laser = createLaser;
})();
