//tiktokinteractive/frontend/js/combat/engine.js

(function () {
  function createCombatEngine(options = {}) {
    const eventBus = options.eventBus || window.DominanceCombat?.eventBus?.createEventBus?.();
    const abilityCatalog = window.DominanceCombat?.abilities?.createAbilityCatalog?.() || [];
    const projectileManager = window.DominanceCombat?.projectileManager?.createProjectileManager?.() || null;
    const collisionEngine = window.DominanceCombat?.collision?.detectCollision || null;
    const damageEngine = window.DominanceCombat?.damage?.applyDamage || null;
    const projectileFactory = window.DominanceCombat?.projectileFactory?.createProjectile || null;

    const combatQueue = [];
    let worldProvider = options.getWorld || (() => ({}));
    let animationHandle = null;
    let running = false;
    let lastFrameAt = 0;

    function getWorldSnapshot() {
      const world = worldProvider() || {};
      return world;
    }

    function getSoldiers() {
      const world = getWorldSnapshot();
      const left = Array.isArray(world?.soldiers?.left) ? world.soldiers.left : [];
      const right = Array.isArray(world?.soldiers?.right) ? world.soldiers.right : [];
      return [...left, ...right];
    }

    function findSoldierById(soldierId) {
      if (!soldierId) return null;
      return getSoldiers().find((soldier) => soldier?.id === soldierId) || null;
    }

    function resolveImpact(target, projectile) {
      if (!damageEngine || !target || target.isDead) return;

      const previousHp = Number(target.hp || 0);
      const nextTarget = damageEngine(target, projectile);
      const nextHp = Number(nextTarget?.hp || 0);

      if (nextHp <= 0) {
        nextTarget.isDead = true;
        nextTarget.state = 'dead';
        eventBus?.emit?.('SoldierKilled', { soldierId: nextTarget.id, projectileId: projectile.id });
      } else if (previousHp > nextHp) {
        nextTarget.state = 'attacking';
        eventBus?.emit?.('SoldierDamaged', { soldierId: nextTarget.id, projectileId: projectile.id, damage: projectile.damage });
      }
    }


    function queueAttack(attackerId, targetId = null, abilityId = 'basic-shot', overrides = null) {
      const item = {
        id: `attack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        attackerId,
        targetId,
        abilityId,
        overrides: overrides || null,
        projectileId: `projectile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
      };
      combatQueue.push(item);
      return item;
    }

    function queueBasicAttack(attackerId, targetId = null) {
      return queueAttack(attackerId, targetId, 'basic-shot');
    }

    function queueAbility(attackerId, abilityId, targetId = null, overrides = null) {
      return queueAttack(attackerId, targetId, abilityId || 'basic-shot', overrides);
    }

    function updateQueue() {
      if (!combatQueue.length) return [];

      const pending = [];
      const world = getWorldSnapshot();

      combatQueue.forEach((item) => {
        const attacker = findSoldierById(item.attackerId);
        if (!attacker || attacker.isDead) {
          pending.push(item);
          return;
        }

        const baseAbility = window.DominanceCombat?.abilities?.getAbilityById?.(item.abilityId, abilityCatalog) || abilityCatalog[0] || null;
        const ability = item.overrides ? { ...baseAbility, ...item.overrides } : baseAbility;

        let target = item.targetId ? findSoldierById(item.targetId) : null;

        if (!target || target.isDead) {
          target = ability?.type === 'support'
            ? window.DominanceCombat?.targeting?.findAllyTarget?.(attacker, world.soldiers)
            : window.DominanceCombat?.targeting?.findTarget?.(attacker, world.soldiers);
        }

        if (!target) {
          // no hay objetivo válido todavía: dejamos el ataque pendiente para el próximo frame
          pending.push(item);
          return;
        }

        if (typeof projectileFactory === 'function' && projectileManager) {
          const projectile = projectileFactory(ability?.projectileType || 'basic-bullet', attacker, target, ability);
          projectile.side = attacker.side;
          projectileManager.add(projectile);
          eventBus?.emit?.('ProjectileCreated', { projectileId: projectile.id, attackerId: projectile.attackerId, targetId: projectile.targetId });

          // Resolución inmediata del impacto (temporal, hasta que el paso 3
          // unifique coordenadas entre ambos ejércitos para el viaje visual real)
          resolveImpact(target, projectile);
          projectile.state = 'impacted';
        }
      });

      combatQueue.length = 0;
      combatQueue.push(...pending);
      return pending;
    }
    function updateProjectiles() {
      if (!projectileManager) return [];
      const activeProjectiles = projectileManager.getActive();
      projectileManager.update(activeProjectiles, { findSoldierById }, Date.now());
      return activeProjectiles;
    }

    function updateCollision() {
      if (!collisionEngine || !projectileManager) return [];

      const activeProjectiles = projectileManager.getActive();
      const impacts = [];

      activeProjectiles.forEach((projectile) => {
        if (!projectile || projectile.state !== 'active' || !projectile.targetId) return;

        const targetSoldier = findSoldierById(projectile.targetId);
        if (!targetSoldier || targetSoldier.isDead) return;

        if (collisionEngine(targetSoldier, projectile)) {
          impacts.push({
            projectileId: projectile.id,
            soldierId: targetSoldier.id,
            projectile,
            soldier: targetSoldier,
          });
        }
      });

      return impacts;
    }

    function updateDamage(impacts) {
      if (!damageEngine || !impacts?.length) return [];

      const results = [];

      impacts.forEach(({ projectile, soldier }) => {
        if (!projectile || !soldier || soldier.isDead) return;

        const previousHp = Number(soldier.hp || 0);
        const nextSoldier = damageEngine(soldier, projectile);
        const nextHp = Number(nextSoldier?.hp || 0);

        if (nextHp <= 0) {
          nextSoldier.isDead = true;
          nextSoldier.state = 'dead';
          eventBus?.emit?.('SoldierKilled', { soldierId: nextSoldier.id, projectileId: projectile.id });
        } else if (previousHp > nextHp) {
          nextSoldier.state = 'attacking';
          eventBus?.emit?.('SoldierDamaged', { soldierId: nextSoldier.id, projectileId: projectile.id, damage: projectile.damage });
        }

        results.push({ projectileId: projectile.id, soldierId: nextSoldier.id, hp: nextHp });
      });

      return results;
    }

    function cleanup() {
      if (!projectileManager) return [];
      const activeProjectiles = projectileManager.getActive();
      activeProjectiles.forEach((projectile) => {
        if (!projectile || projectile.state !== 'active') return;
        if (projectile.ttl <= 0 || Date.now() >= projectile.expiresAt) {
          projectile.state = 'expired';
        }
      });
      projectileManager.cleanup();
      return projectileManager.getActive();
    }

    function render() {
      eventBus?.emit?.('CombatFrameRendered', {
        queueLength: combatQueue.length,
        projectileCount: projectileManager?.getCount?.() || 0,
      });
    }

    function update() {
      updateQueue();
      updateProjectiles();
      const impacts = updateCollision();
      updateDamage(impacts);
      cleanup();
      render();
      return {
        queueLength: combatQueue.length,
        projectileCount: projectileManager?.getCount?.() || 0,
      };
    }

    function tick(frameTime) {
      if (!running) return;
      if (!lastFrameAt) {
        lastFrameAt = frameTime;
      }

      update();
      lastFrameAt = frameTime;
      animationHandle = window.requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      animationHandle = window.requestAnimationFrame(tick);
      eventBus?.emit?.('CombatEngineStarted', { running });
    }

    function stop() {
      if (!running) return;
      running = false;
      if (animationHandle) {
        window.cancelAnimationFrame(animationHandle);
        animationHandle = null;
      }
      eventBus?.emit?.('CombatEngineStopped', { running });
    }

    function clear() {
      combatQueue.length = 0;
      projectileManager?.clear?.();
      eventBus?.emit?.('CombatEngineCleared', {});
    }

    function setWorldProvider(provider) {
      worldProvider = provider || (() => ({}));
      return worldProvider;
    }

    function isRunning() {
      return running;
    }

    function getState() {
      return {
        running,
        queueLength: combatQueue.length,
        projectileCount: projectileManager?.getCount?.() || 0,
      };
    }

    return {
      start,
      stop,
      clear,
      update,
      queueBasicAttack,
      queueAbility,
      queueAttack,
      setWorldProvider,
      isRunning,
      getState,
      getCombatQueue: () => combatQueue.slice(),
      getActiveProjectiles: () => projectileManager?.getActive?.() || [],
      eventBus,
    };
  }

  window.DominanceCombat = window.DominanceCombat || {};
  window.DominanceCombat.CombatEngine = {
    create: createCombatEngine,
  };
})();
