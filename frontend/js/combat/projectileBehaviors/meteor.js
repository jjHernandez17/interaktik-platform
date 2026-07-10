(function () {
  function createMeteor(projectile) {
    return {
      id: projectile?.id || 'meteor',
      name: 'Meteor',
      projectile,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileBehaviors = window.DominanceCombat.projectileBehaviors || {};
  window.DominanceCombat.projectileBehaviors.meteor = createMeteor;
})();
