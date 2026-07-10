//tiktokinteractive/frontend/js/combat/collision.js

(function () {
  function detectCollision(soldier, projectile) {
    if (!soldier || !projectile) return false;
    if (typeof soldier.x !== 'number' || typeof soldier.y !== 'number') return false;
    if (typeof projectile.x !== 'number' || typeof projectile.y !== 'number') return false;

    const radius = Number(projectile.size || 0) + Number(soldier.size || 42);
    const dx = soldier.x - projectile.x;
    const dy = soldier.y - projectile.y;
    return (dx * dx + dy * dy) <= radius * radius;
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.collision = {
    detectCollision,
  };
})();
