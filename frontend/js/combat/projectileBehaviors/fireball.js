(function () {
  function createFireball(projectile) {
    return {
      id: projectile?.id || 'fireball',
      name: 'Fireball',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.fireball = createFireball;
})();
