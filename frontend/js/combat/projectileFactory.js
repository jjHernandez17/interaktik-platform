// tiktokinteractive/frontend/js/combat/projectileFactory.js

(function () {
  function createProjectile(projectileType, attacker, target, ability) {
    const now = Date.now();
    const attackerX = Number(attacker?.x || 0);
    const attackerY = Number(attacker?.y || 0);
    const targetX = Number(target?.x || attackerX);
    const targetY = Number(target?.y || attackerY);
    const dx = targetX - attackerX;
    const dy = targetY - attackerY;
    const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    return {
      id: `projectile-${now}-${Math.random().toString(36).slice(2, 8)}`,
      attackerId: attacker?.id || null,
      targetId: target?.id || null,
      projectileType: projectileType || 'basic-bullet',
      abilityId: ability?.id || 'basic-shot',
      x: attackerX,
      y: attackerY,
      velocity: Number(ability?.projectileSpeed || 1.4),
      damage: Number(ability?.damage || 0),
      healing: Number(ability?.healing || 0),
      shield: Number(ability?.shield || 0),
      size: Number(ability?.projectileSize || 8),
      directionX: dx / distance,
      directionY: dy / distance,
      createdAt: now,
      expiresAt: now + Number(ability?.animationDuration || 280),
      state: 'active',
      ttl: Number(ability?.animationDuration || 280),
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.projectileFactory = {
    createProjectile,
  };
})();
