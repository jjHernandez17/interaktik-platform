//tiktokinteractive/frontend/js/combat/damage.js

(function () {
  function applyDamage(soldier, projectile) {
    if (!soldier) return soldier;

    const damage = Number(projectile?.damage || 0);
    const nextHp = Math.max(0, Number(soldier.hp || 0) - damage);

    soldier.hp = nextHp;
    return soldier;
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.damage = {
    applyDamage,
  };
})();
