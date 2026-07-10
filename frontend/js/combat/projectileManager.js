// tiktokinteractive/frontend/js/combat/projectileManager.js


(function () {
  function createProjectileManager() {
    const activeProjectiles = [];

    function add(projectile) {
      if (!projectile) return null;
      activeProjectiles.push(projectile);
      return projectile;
    }

    function remove(projectileId) {
      const index = activeProjectiles.findIndex((projectile) => projectile.id === projectileId);
      if (index < 0) return null;
      const [removed] = activeProjectiles.splice(index, 1);
      return removed || null;
    }

    function update(projectiles, world, now) {
      const snapshot = Array.isArray(projectiles) ? projectiles : activeProjectiles;
      const currentTime = now || Date.now();

      snapshot.forEach((projectile) => {
        if (!projectile || projectile.state !== 'active') return;

        const target = world?.findSoldierById?.(projectile.targetId) || null;
        const targetX = target ? Number(target.x || 0) : null;
        const targetY = target ? Number(target.y || 0) : null;

        if (targetX !== null && targetY !== null) {
          const dx = targetX - projectile.x;
          const dy = targetY - projectile.y;
          const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          projectile.directionX = dx / distance;
          projectile.directionY = dy / distance;
        }

        projectile.x += projectile.directionX * projectile.velocity;
        projectile.y += projectile.directionY * projectile.velocity;
        projectile.ttl = Math.max(0, projectile.ttl - 16);

        if (currentTime >= projectile.expiresAt || projectile.ttl <= 0) {
          projectile.state = 'expired';
        }
      });

      return snapshot;
    }

    function cleanup() {
      const remaining = [];
      activeProjectiles.forEach((projectile) => {
        if (projectile && projectile.state === 'active') {
          remaining.push(projectile);
        }
      });

      activeProjectiles.length = 0;
      activeProjectiles.push(...remaining);
      return activeProjectiles;
    }

    function clear() {
      activeProjectiles.length = 0;
      return activeProjectiles;
    }

    function getActive() {
      return activeProjectiles;
    }

    return {
      activeProjectiles,
      add,
      remove,
      update,
      cleanup,
      clear,
      getActive,
      getCount: () => activeProjectiles.length,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileManager = {
    createProjectileManager,
  };
})();
