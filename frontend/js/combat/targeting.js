// tiktokinteractive/frontend/js/combat/targeting.js
(function () {
  function getSideSoldiers(soldiers, side) {
    const left = Array.isArray(soldiers?.left) ? soldiers.left : [];
    const right = Array.isArray(soldiers?.right) ? soldiers.right : [];
    if (side === 'left') return left;
    if (side === 'right') return right;
    return [...left, ...right];
  }

  function getAliveSoldiers(list) {
    return (list || []).filter(
      (soldier) => soldier && !soldier.isDead && Number(soldier.hp) > 0
    );
  }

  function getEnemySoldiers(soldiers, side) {
    const enemySide = side === 'left' ? 'right' : 'left';
    return getAliveSoldiers(getSideSoldiers(soldiers, enemySide));
  }

  function getAllySoldiers(soldiers, side) {
    return getAliveSoldiers(getSideSoldiers(soldiers, side));
  }

  // Objetivo para abilities de ataque: enemigo vivo aleatorio
  function findTarget(shooter, soldiers) {
    if (!shooter || !shooter.side) return null;
    const candidates = getEnemySoldiers(soldiers, shooter.side);
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Objetivo para abilities de soporte: aliado vivo aleatorio (o self si no hay otros)
  function findAllyTarget(shooter, soldiers) {
    if (!shooter || !shooter.side) return null;
    const candidates = getAllySoldiers(soldiers, shooter.side)
      .filter((soldier) => soldier.id !== shooter.id);
    if (!candidates.length) return shooter;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.targeting = {
    findTarget,
    findAllyTarget,
    getEnemySoldiers,
    getAllySoldiers,
    getAliveSoldiers,
  };
})();