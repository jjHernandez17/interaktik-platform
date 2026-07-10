// tiktokinteractive/frontend/js/combat/soldierState.js
(function () {
  function createSoldierCombatState(soldier, side) {
    return {
      ...soldier,
      side: soldier?.side || side || null,
      shield: Number(soldier?.shield || 0),
      shieldEffectsCooldown: Number(soldier?.shieldEffectsCooldown || 0),
      lastAttackAt: soldier?.lastAttackAt || null,
      state: soldier?.state || 'idle',
      targetId: soldier?.targetId || null,
      mana: Number(soldier?.mana || 0),
      isDead: Boolean(soldier?.isDead || false),
      actionCounters: soldier?.actionCounters || { like: 0, follow: 0, share: 0 },
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.soldierState = {
    createSoldierCombatState,
  };
})();