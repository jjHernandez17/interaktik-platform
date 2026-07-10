(function () {
  function createRocket(projectile) {
    return {
      id: projectile?.id || 'rocket',
      name: 'Rocket',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.rocket = createRocket;
})();
