(function () {
  function createBomb(projectile) {
    return {
      id: projectile?.id || 'bomb',
      name: 'Bomb',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.bomb = createBomb;
})();
