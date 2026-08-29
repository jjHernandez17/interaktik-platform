//tiktokinteractive/frontend/js/combat/damage.js

(function () {
  function applyDamage(soldier, projectile) {
    if (!soldier) return soldier;

    const healing = Number(projectile?.healing || 0);
    const shield = Number(projectile?.shield || 0);
    const damage = Number(projectile?.damage || 0);
    const maxHp = Math.max(1, Number(soldier.maxHp || soldier.hp || 1));

    if (healing > 0) {
      soldier.hp = Math.min(maxHp, Number(soldier.hp || 0) + healing);
    }

    if (shield > 0) {
      soldier.shield = Number(soldier.shield || 0) + shield;
    }

    if (damage > 0) {
      const currentShield = Number(soldier.shield || 0);
      const absorbedByShield = Math.min(currentShield, damage);
      const remainingDamage = damage - absorbedByShield;

      soldier.shield = currentShield - absorbedByShield;
      soldier.hp = Math.max(0, Number(soldier.hp || 0) - remainingDamage);
    }

    return soldier;
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.damage = {
    applyDamage,
  };
})();
