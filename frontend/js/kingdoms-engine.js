// Batalla de Reinos — motor del juego (simulación + escena). El arte (personajes, castillos, escenario) está en
// kingdoms-art.js; aquí van las reglas, el combate y los efectos.
//
// Dos castillos, cada uno con dos torres de carril y un rey. Las tropas que invocan los regalos caminan por
// los dos carriles, cruzan el río por los puentes y pelean. Gana quien destruye el castillo rival o, al
// acabarse el tiempo, quien tenga más torres (y si empatan, más vida de torres).

const KingdomsEngine = (function createKingdomsEngine() {
  const Art = window.KingdomsArt;
  const TAU = Math.PI * 2;

  // ---------- mundo ----------
  const W = 1600;
  const H = 900;
  const LANE_Y = [260, 640];
  const RIVER_X0 = 770;
  const RIVER_X1 = 830;
  const BRIDGE_HALF = 92;
  const CELL = 90;
  const SPAWN_X = 215;
  const UNIT_SCALE = 1.3;
  const flyLift = (r) => r * 1.55;
  const GEOM = { RIVER_X0, RIVER_X1, LANE_Y, BRIDGE_HALF };
  const CASTLE_SCALE = { king: 0.54, princess: 0.47 };

  // ---------- catálogo ----------
  // hp / dmg a nivel 1. atk = segundos entre ataques, range y speed en px (y px/s), r = radio.
  const UNITS = {
    squire: { name: 'Escudero', kind: 'troop', hp: 260, dmg: 38, atk: 1.0, range: 34, speed: 70, r: 14, desc: 'Infantería básica: barata y rápida de invocar.', color: '#cbd5e1' },
    archer: { name: 'Arquera', kind: 'troop', hp: 150, dmg: 30, atk: 1.1, range: 230, speed: 62, r: 12, proj: { speed: 560, color: '#fde68a', kind: 'arrow' }, desc: 'Dispara desde lejos, también al aire.', color: '#86efac' },
    knight: { name: 'Jinete', kind: 'troop', hp: 330, dmg: 55, atk: 1.2, range: 38, speed: 128, r: 19, desc: 'Caballería veloz que llega primero a la batalla.', color: '#fbbf24' },
    wizard: { name: 'Mago de fuego', kind: 'troop', hp: 220, dmg: 70, atk: 1.5, range: 220, speed: 55, r: 14, splash: 62, proj: { speed: 400, color: '#fb923c', kind: 'fire' }, desc: 'Bolas de fuego que dañan en área.', color: '#a78bfa' },
    ogre: { name: 'Ogro', kind: 'troop', hp: 900, dmg: 110, atk: 1.6, range: 46, speed: 46, r: 26, desc: 'Pesado y fuerte: aguanta muchos golpes.', color: '#84cc16' },
    titan: { name: 'Titán de hierro', kind: 'troop', hp: 1500, dmg: 300, atk: 1.8, range: 44, speed: 40, r: 28, desc: 'Golpe devastador: el mayor daño cuerpo a cuerpo.', color: '#94a3b8' },
    colossus: { name: 'Coloso de piedra', kind: 'troop', hp: 3800, dmg: 130, atk: 1.5, range: 50, speed: 34, r: 36, buildingsOnly: true, desc: 'Tanque gigante que solo ataca torres y castillos.', color: '#a8a29e' },
    dragon: { name: 'Dragón', kind: 'troop', hp: 520, dmg: 85, atk: 1.4, range: 165, speed: 82, r: 22, flying: true, splash: 56, proj: { speed: 440, color: '#f97316', kind: 'fire' }, desc: 'Vuela sobre el río y escupe fuego en área.', color: '#ef4444' },
    skeletons: { name: 'Esqueletos', kind: 'troop', hp: 70, dmg: 22, atk: 0.8, range: 28, speed: 96, r: 9, pack: 4, desc: 'Cada invocación trae 4 esqueletos veloces.', color: '#f1f5f9' },
    healer: { name: 'Sanadora', kind: 'troop', hp: 240, dmg: 0, atk: 1.2, range: 150, speed: 58, r: 13, heal: 70, desc: 'Cura a los aliados que tiene cerca.', color: '#4ade80' },
    ram: { name: 'Ariete', kind: 'troop', hp: 620, dmg: 170, atk: 1.2, range: 36, speed: 150, r: 21, buildingsOnly: true, desc: 'Corre directo a las torres y las golpea fuerte.', color: '#b45309' },
    necromancer: { name: 'Nigromante', kind: 'troop', hp: 300, dmg: 45, atk: 1.3, range: 200, speed: 52, r: 14, proj: { speed: 420, color: '#c084fc', kind: 'magic' }, summon: { unit: 'skeletons', every: 6, count: 1 }, desc: 'Ataca de lejos y levanta esqueletos cada 6 s.', color: '#7c3aed' },
  };

  const SPELLS = {
    fireball: { name: 'Bola de fuego', kind: 'spell', dmg: 380, radius: 125, towerFactor: 0.4, desc: 'Cae sobre el grupo enemigo más numeroso.', color: '#f97316' },
    lightning: { name: 'Rayo', kind: 'spell', dmg: 430, hits: 4, towerFactor: 0.4, desc: 'Fulmina a los 4 enemigos con más vida.', color: '#fde047' },
    freeze: { name: 'Tormenta de hielo', kind: 'spell', dmg: 40, radius: 165, seconds: 4, towerFactor: 0, desc: 'Congela y ralentiza a un grupo enemigo.', color: '#7dd3fc' },
    blessing: { name: 'Bendición', kind: 'spell', heal: 360, radius: 190, desc: 'Cura a los aliados heridos de una zona.', color: '#86efac' },
  };

  const TOWER_DEFS = {
    princess: { hp: 2400, dmg: 62, atk: 0.8, range: 290, r: 40 },
    king: { hp: 4200, dmg: 84, atk: 0.9, range: 340, r: 62 },
  };

  const levelMult = (level) => 1 + (Math.max(1, level) - 1) * 0.18;

  // ---------- utilidades ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function other(side) { return side === 'left' ? 'right' : 'left'; }
  const lerpNum = (a, b, t) => a + (b - a) * t;
  const shade = Art.util.shade;
  const rgba = Art.util.rgba;
  const easeOutBack = (t) => { const c1 = 1.9; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function nearestBridgeY(y) {
    return Math.abs(y - LANE_Y[0]) <= Math.abs(y - LANE_Y[1]) ? LANE_Y[0] : LANE_Y[1];
  }

  // ======================================================================
  function create(options) {
    const canvas = options.canvas;
    const ctx = canvas.getContext('2d');
    const hooks = options.hooks || {};
    const getConfig = options.getConfig;

    let nextId = 1;
    let units = [];
    let corpses = [];
    let towers = [];
    let projectiles = [];
    let particles = [];
    let texts = [];
    let bolts = [];
    let zones = [];
    let summons = [];
    let confetti = [];
    let ambient = [];
    let grid = new Map();
    const queues = { left: [], right: [] };
    let stats = new Map();
    let spawnAcc = { left: 0, right: 0 };

    const match = { phase: 'waiting', timeLeft: 0, crowns: { left: 0, right: 0 }, winner: null, endedAt: 0, reason: '' };

    let time = 0;
    let shake = 0;
    let zoomPulse = 0;
    let screenFlash = 0;
    let flashColor = '255,255,255';
    let slowUntil = 0;
    let realTime = 0;
    let bgCanvas = null;
    let scale = 1;
    let sheetKey = '';

    function cfg() { return getConfig(); }

    // ---------- torres ----------
    function buildTowers() {
      const hpFactor = cfg().settings.towerHpPercent / 100;
      towers = [];
      ['left', 'right'].forEach((side) => {
        const dir = side === 'left' ? 1 : -1;
        const baseX = side === 'left' ? 0 : W;
        const make = (kind, lane, x, y) => {
          const d = TOWER_DEFS[kind];
          towers.push({
            id: nextId++, isTower: true, side, kind, lane, x, y, r: d.r,
            hp: d.hp * hpFactor, maxHp: d.hp * hpFactor, dmg: d.dmg, atk: d.atk, range: d.range, atkCd: rand(0, 0.5),
            alive: true, flash: 0, swing: 0, deadAt: 0, fireCd: 0,
          });
        };
        make('king', -1, baseX + dir * 112, 450);
        make('princess', 0, baseX + dir * 330, LANE_Y[0]);
        make('princess', 1, baseX + dir * 330, LANE_Y[1]);
      });
    }

    function resetMatch() {
      units = []; corpses = []; projectiles = []; particles = []; texts = []; bolts = []; zones = []; summons = []; confetti = [];
      queues.left = []; queues.right = [];
      stats = new Map();
      spawnAcc = { left: 0, right: 0 };
      match.phase = 'waiting';
      match.timeLeft = cfg().settings.matchSeconds;
      match.crowns = { left: 0, right: 0 };
      match.winner = null;
      match.reason = '';
      slowUntil = 0;
      zoomPulse = 0;
      buildTowers();
      if (hooks.onReset) hooks.onReset();
    }

    function startMatch() {
      if (match.phase !== 'waiting') return;
      match.phase = 'running';
      match.timeLeft = cfg().settings.matchSeconds;
      if (hooks.onMatchStart) hooks.onMatchStart();
    }

    function totalTowerHp(side) {
      return towers.filter((t) => t.side === side).reduce((sum, t) => sum + Math.max(0, t.hp), 0);
    }

    function endMatch(winner, reason) {
      if (match.phase === 'ended') return;
      match.phase = 'ended';
      match.winner = winner;
      match.reason = reason;
      match.endedAt = time;
      shake = Math.max(shake, 14);
      if (reason === 'king') { slowUntil = realTime + 2.2; zoomPulse = 1; }
      if (winner !== 'draw') {
        const color = cfg().teams[winner].color;
        const palette = [color, shade(color, 0.4), '#fde047', '#ffffff', shade(color, -0.2)];
        for (let i = 0; i < 160; i += 1) {
          confetti.push({
            x: rand(0, W), y: rand(-300, -10), vx: rand(-30, 30), vy: rand(80, 220), rot: rand(0, TAU), vr: rand(-6, 6),
            w: rand(8, 15), h: rand(4, 8), color: palette[Math.floor(rand(0, palette.length))], life: rand(3, 6),
          });
        }
      }
      if (hooks.onMatchEnd) hooks.onMatchEnd({ winner, reason, crowns: { ...match.crowns } });
    }

    function decideByTime() {
      if (match.crowns.left !== match.crowns.right) return endMatch(match.crowns.left > match.crowns.right ? 'left' : 'right', 'crowns');
      const left = totalTowerHp('left');
      const right = totalTowerHp('right');
      if (Math.abs(left - right) < 1) return endMatch('draw', 'draw');
      return endMatch(left > right ? 'left' : 'right', 'health');
    }

    // ---------- estadísticas por espectador ----------
    function statFor(owner, side) {
      if (!owner || !owner.key) return null;
      let entry = stats.get(owner.key);
      if (!entry) {
        entry = { key: owner.key, name: owner.name || 'Espectador', side, units: 0, damage: 0 };
        stats.set(owner.key, entry);
      }
      return entry;
    }

    // ---------- efectos ----------
    function addParticle(p) {
      if (particles.length > 1100) particles.shift();
      p.max = p.life;
      particles.push(p);
    }

    function burst(x, y, color, count, speed, life, size, additive) {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * TAU;
        const s = rand(speed * 0.35, speed);
        addParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.25, life: life * rand(0.7, 1.1), size: rand(size * 0.6, size), color, kind: additive ? 'glow' : 'dot', grav: 160 });
      }
    }

    function ring(x, y, color, radius, life, kind = 'ring') {
      addParticle({ x, y, vx: 0, vy: 0, life, size: radius, color, kind, grav: 0 });
    }

    function smoke(x, y, size, life, color = 'rgba(214,211,209,.7)', vy = -30) {
      addParticle({ x, y, vx: rand(-8, 8), vy, life, size, color, kind: 'smoke', grav: 0 });
    }

    function chunks(x, y, count, speed) {
      for (let i = 0; i < count; i += 1) {
        const a = rand(-Math.PI, 0);
        const s = rand(speed * 0.4, speed);
        addParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.9, 1.6), size: rand(4, 9), color: ['#a8a29e', '#78716c', '#d6d3d1', '#57534e'][i % 4], kind: 'chunk', grav: 520, rot: rand(0, TAU), vr: rand(-9, 9) });
      }
    }

    function floatText(x, y, text, color, size = 15) {
      if (texts.length > 80) texts.shift();
      texts.push({ x, y, text, color, life: 0.9, max: 0.9, size });
    }

    // ---------- crear unidades ----------
    function unitCount(side) {
      let n = 0;
      for (let i = 0; i < units.length; i += 1) if (units[i].side === side && !units[i].dead) n += 1;
      return n;
    }

    function spawnUnit(side, typeId, level, owner, at) {
      const def = UNITS[typeId];
      const mult = levelMult(level);
      const dir = side === 'left' ? 1 : -1;
      const lane = Math.random() < 0.5 ? 0 : 1;
      const x = at ? at.x : (side === 'left' ? SPAWN_X : W - SPAWN_X) + rand(-18, 18) * dir;
      const y = at ? at.y : LANE_Y[lane] + rand(-62, 62);

      const u = {
        id: nextId++, isTower: false, side, type: typeId, def, level,
        x, y, r: def.r * UNIT_SCALE * (1 + (level - 1) * 0.015),
        hp: def.hp * mult, maxHp: def.hp * mult, dmg: def.dmg * mult,
        atkCd: rand(0, def.atk), target: null, retarget: rand(0, 0.25),
        owner, born: time, dead: false, flash: 0, frozen: 0, phase: rand(0, 6.28),
        moving: false, summonCd: def.summon ? def.summon.every * rand(0.4, 1) : 0,
        facing: dir, lane, walkT: Math.random(), attackStart: -10, attackDur: 0.5, pendingAt: 0, dustCd: rand(0, 0.3),
      };
      units.push(u);

      // círculo de invocación (límite para no saturar con invocaciones masivas)
      if (summons.length < 60) summons.push({ x, y, t0: time, r: u.r * 1.6, color: cfg().teams[side].color });
      if (particles.length < 900) {
        for (let i = 0; i < 4; i += 1) addParticle({ x: x + rand(-u.r, u.r), y, vx: rand(-10, 10), vy: rand(-70, -35), life: 0.7, size: rand(2, 3.4), color: shade(cfg().teams[side].color, 0.55), kind: 'glow', grav: 0 });
      }
      return u;
    }

    // ---------- cola de invocaciones ----------
    function enqueue(side, itemId, count, level, owner) {
      if (side !== 'left' && side !== 'right') return false;
      if (!UNITS[itemId] && !SPELLS[itemId]) return false;
      const amount = Math.max(1, Math.min(300, Math.round(count)));
      const q = queues[side];
      q.push({ id: itemId, left: amount, level: Math.max(1, Math.min(10, level || 1)), owner });
      while (q.length > 120) q.shift();

      if (match.phase === 'waiting') startMatch();
      if (match.phase === 'running') {
        const stat = statFor(owner, side);
        if (stat && UNITS[itemId]) stat.units += amount * (UNITS[itemId].pack || 1);
      }
      return true;
    }

    function pumpQueues(dt) {
      if (match.phase !== 'running') return;
      const cap = cfg().settings.maxUnitsPerSide;

      ['left', 'right'].forEach((side) => {
        const q = queues[side];
        if (q.length === 0) { spawnAcc[side] = 0; return; }

        let backlog = 0;
        q.forEach((item) => { backlog += item.left; });
        spawnAcc[side] += (9 + backlog / 5) * dt;

        let current = unitCount(side);
        while (spawnAcc[side] >= 1 && q.length > 0) {
          const item = q[0];

          if (SPELLS[item.id]) {
            if (spawnAcc[side] < 3) break;
            spawnAcc[side] -= 3;
            castSpell(side, item.id, item.level, item.owner);
            item.left -= 1;
            if (item.left <= 0) q.shift();
            continue;
          }

          const pack = UNITS[item.id].pack || 1;
          if (current + pack > cap) break;
          spawnAcc[side] -= 1;
          for (let i = 0; i < pack; i += 1) spawnUnit(side, item.id, item.level, item.owner);
          current += pack;
          item.left -= 1;
          if (item.left <= 0) q.shift();
        }
        if (spawnAcc[side] > 4) spawnAcc[side] = 4;
      });
    }

    // ---------- hechizos ----------
    function enemiesOf(side) { return units.filter((u) => u.side === other(side) && !u.dead); }
    function alliesOf(side) { return units.filter((u) => u.side === side && !u.dead); }

    function densestPoint(list, radius) {
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < list.length; i += 1) {
        let score = 0;
        for (let j = 0; j < list.length; j += 1) {
          if (dist(list[i].x, list[i].y, list[j].x, list[j].y) <= radius) score += 1 + list[j].maxHp / 2000;
        }
        if (score > bestScore) { bestScore = score; best = list[i]; }
      }
      return best;
    }

    function randomEnemyTower(side) {
      const list = towers.filter((t) => t.side === other(side) && t.alive);
      return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    }

    // rayo con ramas: serie de puntos desde el cielo hasta el objetivo
    function makeBolt(tx, ty) {
      const pts = [];
      let x = tx + rand(-50, 50);
      const steps = 10;
      for (let i = 0; i <= steps; i += 1) {
        const k = i / steps;
        pts.push([i === steps ? tx : x + rand(-26, 26) * (1 - k), -30 + (ty + 30) * k]);
        x = lerpNum(x, tx, 0.22);
      }
      const branches = [];
      for (let b = 0; b < 3; b += 1) {
        const from = pts[2 + Math.floor(Math.random() * 6)];
        const br = [from];
        let bx = from[0];
        let by = from[1];
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < 4; i += 1) { bx += dir * rand(12, 26); by += rand(12, 28); br.push([bx, by]); }
        branches.push(br);
      }
      return { pts, branches, life: 0.38, max: 0.38 };
    }

    function castSpell(side, spellId, level, owner) {
      const spell = SPELLS[spellId];
      const mult = levelMult(level);
      const stat = statFor(owner, side);

      if (spellId === 'fireball' || spellId === 'freeze') {
        const enemies = enemiesOf(side);
        const anchor = densestPoint(enemies, spell.radius);
        const tower = anchor ? null : randomEnemyTower(side);
        const tx = anchor ? anchor.x : (tower ? tower.x : null);
        const ty = anchor ? anchor.y : (tower ? tower.y : null);
        if (tx === null) return;

        if (spellId === 'fireball') {
          projectiles.push({ kind: 'meteor', x: tx - 160, y: ty - 560, tx, ty, speed: 880, dmg: spell.dmg * mult, radius: spell.radius, side, color: spell.color, owner, stat, spellId, life: 2, trail: [] });
        } else {
          projectiles.push({ kind: 'iceball', x: tx + 70, y: ty - 520, tx, ty, speed: 800, dmg: spell.dmg * mult, radius: spell.radius, side, color: spell.color, owner, stat, spellId, life: 2, trail: [] });
        }
        zones.push({ kind: 'target', x: tx, y: ty, radius: spell.radius, life: 0.7, max: 0.7, color: spell.color });
        return;
      }

      if (spellId === 'lightning') {
        const targets = enemiesOf(side).sort((a, b) => b.hp - a.hp).slice(0, spell.hits);
        while (targets.length < spell.hits) {
          const tower = randomEnemyTower(side);
          if (!tower) break;
          targets.push(tower);
        }
        targets.forEach((target, i) => {
          setTimeout(() => {
            if (match.phase === 'ended') return;
            bolts.push(makeBolt(target.x, target.y));
            applyDamage(target, spell.dmg * mult * (target.isTower ? spell.towerFactor : 1), { side, owner, stat });
            burst(target.x, target.y, '#fde047', 14, 260, 0.55, 4, true);
            burst(target.x, target.y, '#ffffff', 6, 180, 0.35, 3, true);
            ring(target.x, target.y, '#fde047', 62, 0.4);
            screenFlash = Math.max(screenFlash, 0.35);
            flashColor = '255,248,200';
            shake = Math.max(shake, 5);
          }, i * 140);
        });
        return;
      }

      if (spellId === 'blessing') {
        const hurt = alliesOf(side).filter((u) => u.hp < u.maxHp * 0.92);
        const anchor = densestPoint(hurt.length ? hurt : alliesOf(side), spell.radius);
        if (!anchor) return;
        alliesOf(side).forEach((u) => {
          if (dist(u.x, u.y, anchor.x, anchor.y) <= spell.radius) {
            u.hp = Math.min(u.maxHp, u.hp + spell.heal * mult);
            floatText(u.x, u.y - u.r * 3, '+' + Math.round(spell.heal * mult), '#bbf7d0', 14);
            for (let i = 0; i < 3; i += 1) addParticle({ x: u.x + rand(-8, 8), y: u.y - u.r, vx: 0, vy: rand(-60, -30), life: 0.9, size: 8, color: '#bbf7d0', kind: 'plus', grav: 0 });
          }
        });
        zones.push({ kind: 'heal', x: anchor.x, y: anchor.y, radius: spell.radius, life: 1.4, max: 1.4, color: spell.color });
        for (let i = 0; i < 26; i += 1) {
          const a = Math.random() * TAU;
          const rr2 = Math.random() * spell.radius;
          addParticle({ x: anchor.x + Math.cos(a) * rr2, y: anchor.y + Math.sin(a) * rr2 * 0.6, vx: 0, vy: rand(-90, -40), life: rand(0.8, 1.4), size: rand(2, 4), color: '#fef08a', kind: 'glow', grav: 0 });
        }
      }
    }

    // ---------- daño ----------
    function applyDamage(target, amount, source) {
      if (!target || amount <= 0) return;
      if (target.isTower) {
        if (!target.alive) return;
        const dealt = Math.min(target.hp, amount);
        target.hp -= amount;
        target.flash = 0.18;
        if (source && source.stat) source.stat.damage += dealt;
        if (target.hp <= 0) destroyTower(target, source);
        return;
      }
      if (target.dead) return;
      const dealt = Math.min(target.hp, amount);
      target.hp -= amount;
      target.flash = 0.14;
      if (source && source.stat) source.stat.damage += dealt;
      if (amount >= 60 && Math.random() < 0.35) floatText(target.x + rand(-6, 6), target.y - target.r * 3, String(Math.round(amount)), '#fecaca', 13);
      if (target.hp <= 0) killUnit(target);
    }

    function killUnit(u) {
      u.dead = true;
      const color = cfg().teams[u.side].color;
      corpses.push({ x: u.x, y: u.y, type: u.type, side: u.side, facing: u.facing, r: u.r, t0: time, walkT: u.walkT, flying: !!u.def.flying });
      burst(u.x, u.y - u.r, shade(color, 0.25), u.r > 20 ? 14 : 7, 200, 0.6, 4);
      smoke(u.x, u.y - u.r * 0.6, u.r * 1.4, 0.7, 'rgba(226,232,240,.75)', -34);
      for (let i = 0; i < 4; i += 1) addParticle({ x: u.x, y: u.y - u.r, vx: rand(-40, 40), vy: rand(-110, -50), life: 0.8, size: rand(5, 8), color: '#fde68a', kind: 'star', grav: 160, rot: rand(0, TAU), vr: rand(-6, 6) });
      if (u.r >= 30) { shake = Math.max(shake, 4); chunks(u.x, u.y - u.r, 6, 200); }
    }

    function destroyTower(t, source) {
      t.alive = false;
      t.hp = 0;
      t.deadAt = time;
      const attackerSide = other(t.side);
      match.crowns[attackerSide] += t.kind === 'king' ? 3 : 1;
      const big = t.kind === 'king';
      chunks(t.x, t.y, big ? 46 : 26, big ? 520 : 400);
      burst(t.x, t.y, '#fb923c', big ? 40 : 24, 340, 1.1, 8, true);
      burst(t.x, t.y, '#fde68a', 16, 260, 0.8, 6, true);
      ring(t.x, t.y, '#fb923c', t.r * 3.6, 0.9);
      ring(t.x, t.y, '#ffffff', t.r * 2.2, 0.5);
      for (let i = 0; i < 10; i += 1) smoke(t.x + rand(-t.r, t.r), t.y + rand(-t.r * 0.4, t.r * 0.4), rand(20, 36), rand(1.6, 3), 'rgba(80,72,68,.7)', rand(-60, -30));
      zones.push({ kind: 'scorch', x: t.x, y: t.y + t.r * 0.8, radius: t.r * 1.4, life: 8, max: 8, color: '#1c1210' });
      shake = Math.max(shake, big ? 18 : 10);
      zoomPulse = Math.max(zoomPulse, big ? 1 : 0.5);
      screenFlash = Math.max(screenFlash, 0.45);
      flashColor = '255,214,150';
      floatText(t.x, t.y - t.r * 2, big ? '¡CASTILLO DESTRUIDO!' : '¡TORRE DESTRUIDA!', '#fde047', big ? 30 : 22);
      if (hooks.onTowerDestroyed) hooks.onTowerDestroyed({ side: t.side, kind: t.kind, by: source && source.owner ? source.owner.name : '' });

      if (t.kind === 'king') endMatch(attackerSide, 'king');
    }

    // ---------- búsqueda espacial ----------
    function rebuildGrid() {
      grid = new Map();
      for (let i = 0; i < units.length; i += 1) {
        const u = units[i];
        if (u.dead) continue;
        const key = Math.floor(u.x / CELL) + ',' + Math.floor(u.y / CELL);
        const bucket = grid.get(key);
        if (bucket) bucket.push(u); else grid.set(key, [u]);
      }
    }

    function forNear(x, y, radius, fn) {
      const x0 = Math.floor((x - radius) / CELL);
      const x1 = Math.floor((x + radius) / CELL);
      const y0 = Math.floor((y - radius) / CELL);
      const y1 = Math.floor((y + radius) / CELL);
      for (let gx = x0; gx <= x1; gx += 1) {
        for (let gy = y0; gy <= y1; gy += 1) {
          const bucket = grid.get(gx + ',' + gy);
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i += 1) fn(bucket[i]);
        }
      }
    }

    // ---------- objetivos ----------
    function canHit(attackerDef, target) {
      if (target.isTower) return true;
      if (attackerDef.buildingsOnly) return false;
      if (target.def.flying && attackerDef.range <= 60) return false;
      return true;
    }

    function acquire(u) {
      const def = u.def;
      const enemy = other(u.side);

      if (def.heal) {
        let best = null;
        let bestMissing = 20;
        forNear(u.x, u.y, def.range + 60, (a) => {
          if (a.side !== u.side || a === u || a.dead) return;
          const missing = a.maxHp - a.hp;
          if (missing > bestMissing) { bestMissing = missing; best = a; }
        });
        return best;
      }

      if (!def.buildingsOnly) {
        const aggro = Math.max(230, def.range + 50);
        let best = null;
        let bestD = aggro;
        forNear(u.x, u.y, aggro, (e) => {
          if (e.side !== enemy || e.dead || !canHit(def, e)) return;
          const d = dist(u.x, u.y, e.x, e.y) - e.r;
          if (d < bestD) { bestD = d; best = e; }
        });
        if (best) return best;
      }

      let pick = null;
      let pickD = Infinity;
      towers.forEach((t) => {
        if (t.side !== enemy || !t.alive || t.kind !== 'princess') return;
        const d = dist(u.x, u.y, t.x, t.y) + Math.abs(u.y - t.y) * 0.6;
        if (d < pickD) { pickD = d; pick = t; }
      });
      if (!pick) pick = towers.find((t) => t.side === enemy && t.kind === 'king' && t.alive) || null;
      return pick;
    }

    function pathGoal(u, target) {
      if (u.def.flying) return { x: target.x, y: target.y };
      const crossing = (u.x < RIVER_X0 && target.x > RIVER_X1) || (u.x > RIVER_X1 && target.x < RIVER_X0);
      if (!crossing) return { x: target.x, y: target.y };

      const by = nearestBridgeY(u.y);
      const toRight = u.x < RIVER_X0;
      const edgeX = toRight ? RIVER_X0 - 26 : RIVER_X1 + 26;
      const exitX = toRight ? RIVER_X1 + 34 : RIVER_X0 - 34;
      const inBand = u.x > RIVER_X0 - 6 && u.x < RIVER_X1 + 6;
      const aligned = Math.abs(u.y - by) < BRIDGE_HALF - 24 && Math.abs(u.x - edgeX) < 130;
      if (inBand || aligned) return { x: exitX, y: by };
      return { x: edgeX, y: by };
    }

    // La sanadora, sin nadie herido, acompaña al grupo aliado más cercano (o avanza lentamente al centro)
    function followArmy(u, dt) {
      let best = null;
      let bestD = 520;
      forNear(u.x, u.y, 520, (a) => {
        if (a.side !== u.side || a === u || a.dead || a.def.heal) return;
        const d = dist(u.x, u.y, a.x, a.y);
        if (d < bestD) { bestD = d; best = a; }
      });
      const gx = best ? best.x : (u.side === 'left' ? RIVER_X0 - 120 : RIVER_X1 + 120);
      const gy = best ? best.y : LANE_Y[u.lane] || 450;
      const dx = gx - u.x;
      const dy = gy - u.y;
      const len = Math.hypot(dx, dy);
      if (len < 70) return;
      const step = u.def.speed * (u.frozen > 0 ? 0.28 : 1) * dt;
      u.x += (dx / len) * step;
      u.y += (dy / len) * step;
      u.moving = true;
      if (Math.abs(dx) > 2) u.facing = dx > 0 ? 1 : -1;
    }

    // ---------- ataques ----------
    // beginAttack arranca la animación; el golpe (strike) ocurre a mitad de la animación, cuando el arma baja
    function beginAttack(u) {
      const def = u.def;
      u.atkCd = def.atk / (u.frozen > 0 ? 0.45 : 1);
      u.attackStart = time;
      u.attackDur = clamp(def.atk * 0.8, 0.4, 0.75);
      u.pendingAt = time + u.attackDur * 0.56;
    }

    function strike(u) {
      const target = u.target;
      const def = u.def;
      if (!target || (target.isTower ? !target.alive : target.dead)) return;
      const stat = statFor(u.owner, u.side);
      const source = { side: u.side, owner: u.owner, stat };

      if (def.heal) {
        forNear(u.x, u.y, def.range, (a) => {
          if (a.side !== u.side || a.dead) return;
          a.hp = Math.min(a.maxHp, a.hp + def.heal * levelMult(u.level));
          addParticle({ x: a.x, y: a.y - a.r * 2, vx: 0, vy: -40, life: 0.8, size: 10, color: '#86efac', kind: 'plus', grav: 0 });
        });
        ring(u.x, u.y, '#4ade80', def.range, 0.6);
        burst(u.x, u.y - u.r * 2, '#bbf7d0', 8, 120, 0.7, 3, true);
        return;
      }

      if (def.proj) {
        const oy = def.flying ? -flyLift(u.r) - u.r : -u.r * 1.8;
        const ox = u.facing * u.r * 1.4;
        projectiles.push({
          kind: def.proj.kind, x: u.x + ox, y: u.y + oy, tx: target.x, ty: target.y, speed: def.proj.speed, dmg: u.dmg, splash: def.splash || 0,
          side: u.side, color: def.proj.color, target, owner: u.owner, stat, life: 3, trail: [],
        });
        if (def.proj.kind === 'fire' || def.proj.kind === 'magic') burst(u.x + ox, u.y + oy, def.proj.color, 5, 110, 0.35, 3, true);
        return;
      }

      // cuerpo a cuerpo: si el objetivo ya se alejó mucho, el golpe falla
      const d = dist(u.x, u.y, target.x, target.y) - target.r - u.r * 0.6;
      if (d > def.range * 2.2) return;
      applyDamage(target, u.dmg, source);
      const hx = target.x - u.facing * target.r * 0.3;
      const hy = target.y - (target.isTower ? target.r * 0.4 : target.r * 1.4);
      burst(hx, hy, '#fff7d6', 6, 190, 0.35, 3.2, true);
      addParticle({ x: hx, y: hy, vx: 0, vy: 0, life: 0.18, size: 20 + u.r * 0.6, color: '#fff7d6', kind: 'flare', grav: 0 });
      if (u.r >= 24) { shake = Math.max(shake, 1.8); smoke(target.x, target.y + target.r * 0.3, 14, 0.5, 'rgba(200,190,170,.6)', -12); }
      if (def.splash) {
        forNear(target.x, target.y, def.splash, (e) => {
          if (e.side !== u.side && !e.dead && e !== target) applyDamage(e, u.dmg * 0.6, source);
        });
      }
    }

    function projectileHit(p) {
      const source = { side: p.side, owner: p.owner, stat: p.stat };

      if (p.kind === 'meteor' || p.kind === 'iceball') {
        const spell = SPELLS[p.spellId];
        const enemy = other(p.side);
        forNear(p.tx, p.ty, p.radius + 40, (e) => {
          if (e.side !== enemy || e.dead || dist(e.x, e.y, p.tx, p.ty) > p.radius) return;
          applyDamage(e, p.dmg, source);
          if (p.kind === 'iceball') e.frozen = spell.seconds;
        });
        towers.forEach((t) => {
          if (t.side !== enemy || !t.alive || dist(t.x, t.y, p.tx, p.ty) > p.radius + t.r) return;
          if (spell.towerFactor > 0) applyDamage(t, p.dmg * spell.towerFactor, source);
        });
        if (p.kind === 'meteor') {
          burst(p.tx, p.ty, '#fb923c', 34, 360, 1.0, 8, true);
          burst(p.tx, p.ty, '#fde68a', 18, 280, 0.7, 6, true);
          burst(p.tx, p.ty, '#ef4444', 14, 220, 0.9, 7, true);
          chunks(p.tx, p.ty, 14, 380);
          ring(p.tx, p.ty, '#f97316', p.radius * 1.15, 0.65);
          ring(p.tx, p.ty, '#fff7ed', p.radius * 0.7, 0.4);
          addParticle({ x: p.tx, y: p.ty, vx: 0, vy: 0, life: 0.35, size: p.radius * 1.5, color: '#fff1c2', kind: 'flare', grav: 0 });
          for (let i = 0; i < 6; i += 1) smoke(p.tx + rand(-30, 30), p.ty + rand(-10, 10), rand(22, 38), rand(1, 1.8), 'rgba(60,52,48,.6)', rand(-55, -25));
          zones.push({ kind: 'scorch', x: p.tx, y: p.ty, radius: p.radius * 0.6, life: 3, max: 3, color: '#2a1608' });
          shake = Math.max(shake, 10);
          screenFlash = Math.max(screenFlash, 0.3);
          flashColor = '255,200,120';
        } else {
          burst(p.tx, p.ty, '#e0f2fe', 30, 280, 1.0, 6, true);
          ring(p.tx, p.ty, '#bae6fd', p.radius * 1.1, 0.7);
          for (let i = 0; i < 8; i += 1) smoke(p.tx + rand(-p.radius, p.radius) * 0.7, p.ty + rand(-20, 20), rand(18, 30), rand(1, 2), 'rgba(224,242,254,.55)', rand(-20, -8));
          zones.push({ kind: 'ice', x: p.tx, y: p.ty, radius: p.radius, life: 2.6, max: 2.6, color: '#7dd3fc' });
          shake = Math.max(shake, 4);
        }
        return;
      }

      const t = p.target;
      const live = t && (t.isTower ? t.alive : !t.dead);
      const tx = live ? t.x : p.tx;
      const ty = live ? t.y : p.ty;
      if (p.splash) {
        const enemy = other(p.side);
        forNear(tx, ty, p.splash, (e) => {
          if (e.side === enemy && !e.dead) applyDamage(e, p.dmg * (e === t ? 1 : 0.6), source);
        });
        if (t && t.isTower && t.alive) applyDamage(t, p.dmg, source);
        burst(tx, ty - 10, p.color, 10, 220, 0.5, 4.5, true);
        ring(tx, ty, p.color, p.splash, 0.4);
        addParticle({ x: tx, y: ty - 10, vx: 0, vy: 0, life: 0.22, size: p.splash * 0.8, color: '#fff3d0', kind: 'flare', grav: 0 });
      } else if (live) {
        applyDamage(t, p.dmg, source);
        burst(tx, ty - (t.isTower ? t.r * 0.4 : t.r), p.color, 5, 130, 0.3, 3, true);
      }
    }

    // ---------- actualización ----------
    function update(dtRaw) {
      realTime += dtRaw;
      const slowFactor = realTime < slowUntil ? 0.3 : 1;
      const speedFactor = cfg().settings.gameSpeed;
      const dt = Math.min(0.05, dtRaw) * speedFactor * slowFactor;
      time += dt;

      if (match.phase === 'ended') {
        if (time - match.endedAt >= cfg().settings.restartSeconds) resetMatch();
      }

      if (match.phase === 'running') {
        match.timeLeft -= dt;
        if (match.timeLeft <= 0) { match.timeLeft = 0; decideByTime(); }
      }

      pumpQueues(dt);
      rebuildGrid();

      const fighting = match.phase !== 'ended';

      for (let i = 0; i < units.length; i += 1) {
        const u = units[i];
        if (u.dead) continue;
        u.flash = Math.max(0, u.flash - dt);
        u.frozen = Math.max(0, u.frozen - dt);
        u.atkCd -= dt;
        u.retarget -= dt;
        u.moving = false;

        if (!fighting) continue;

        // golpe pendiente de una animación de ataque
        if (u.pendingAt > 0 && time >= u.pendingAt) { u.pendingAt = 0; strike(u); }
        const attackingNow = time - u.attackStart < u.attackDur;

        if (u.def.summon) {
          u.summonCd -= dt;
          if (u.summonCd <= 0) {
            u.summonCd = u.def.summon.every;
            for (let k = 0; k < 2; k += 1) {
              const s = spawnUnit(u.side, u.def.summon.unit, Math.max(1, u.level - 1), u.owner, { x: u.x + rand(-26, 26), y: u.y + rand(-26, 26) });
              s.lane = u.lane;
            }
            ring(u.x, u.y, '#c084fc', 60, 0.6);
            burst(u.x, u.y - u.r, '#c084fc', 12, 160, 0.6, 3.4, true);
          }
        }

        const target = u.target;
        const targetAlive = target && (target.isTower ? target.alive : !target.dead);
        if (!targetAlive || u.retarget <= 0) {
          u.target = acquire(u);
          u.retarget = 0.22 + Math.random() * 0.12;
        }

        const t = u.target;
        if (!t) {
          if (u.def.heal && !attackingNow) followArmy(u, dt);
          if (u.moving) u.walkT = (u.walkT + dt * u.def.speed / 40) % 1;
          continue;
        }

        const d = dist(u.x, u.y, t.x, t.y) - t.r - u.r * 0.6;
        const reach = u.def.range;
        if (attackingNow) { u.facing = t.x >= u.x ? 1 : -1; continue; }

        if (d <= reach) {
          u.facing = t.x >= u.x ? 1 : -1;
          if (u.atkCd <= 0) beginAttack(u);
        } else {
          const goal = pathGoal(u, t);
          const dx = goal.x - u.x;
          const dy = goal.y - u.y;
          const len = Math.hypot(dx, dy) || 1;
          const slow = u.frozen > 0 ? 0.28 : 1;
          const step = u.def.speed * slow * dt;
          u.x += (dx / len) * step;
          u.y += (dy / len) * step;
          u.moving = true;
          u.walkT = (u.walkT + dt * (u.def.speed * slow) / 40) % 1;
          if (Math.abs(dx) > 2) u.facing = dx > 0 ? 1 : -1;

          // polvo bajo los pasos de las tropas pesadas
          if (u.r >= 22 && !u.def.flying) {
            u.dustCd -= dt;
            if (u.dustCd <= 0 && particles.length < 800) {
              u.dustCd = 0.26;
              smoke(u.x - u.facing * u.r * 0.5, u.y + u.r * 0.6, u.r * 0.5, 0.5, 'rgba(196,172,128,.5)', -10);
            }
          }
        }
      }

      // separación suave para que no se apilen
      for (let i = 0; i < units.length; i += 1) {
        const u = units[i];
        if (u.dead) continue;
        forNear(u.x, u.y, u.r * 2.2, (o) => {
          if (o === u || o.dead || o.id < u.id) return;
          if (!!o.def.flying !== !!u.def.flying) return;
          const dx = o.x - u.x;
          const dy = o.y - u.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = (u.r + o.r) * 0.82;
          if (d < min) {
            const push = (min - d) * 0.5;
            const nx = dx / d;
            const ny = dy / d;
            const wu = u.moving ? 0.5 : 0.25;
            const wo = o.moving ? 0.5 : 0.25;
            u.x -= nx * push * (1 - wu);
            u.y -= ny * push * (1 - wu);
            o.x += nx * push * (1 - wo);
            o.y += ny * push * (1 - wo);
          }
        });
      }

      // límites y río
      for (let i = 0; i < units.length; i += 1) {
        const u = units[i];
        if (u.dead) continue;
        u.x = clamp(u.x, 24, W - 24);
        u.y = clamp(u.y, 40, H - 30);
        if (!u.def.flying && u.x > RIVER_X0 - u.r * 0.3 && u.x < RIVER_X1 + u.r * 0.3) {
          const by = nearestBridgeY(u.y);
          if (Math.abs(u.y - by) > BRIDGE_HALF - 6) {
            const mid = (RIVER_X0 + RIVER_X1) / 2;
            u.x = u.x < mid ? RIVER_X0 - u.r * 0.3 : RIVER_X1 + u.r * 0.3;
          }
        }
      }

      // torres
      towers.forEach((t) => {
        t.flash = Math.max(0, t.flash - dt);
        t.swing = Math.max(0, t.swing - dt * 4);
        if (!t.alive) return;

        // fuego y humo cuando está muy dañada
        if (t.hp / t.maxHp < 0.4) {
          t.fireCd -= dt;
          if (t.fireCd <= 0 && particles.length < 900) {
            t.fireCd = 0.09;
            const sc = CASTLE_SCALE[t.kind];
            const fx = t.x + rand(-t.r * 0.7, t.r * 0.7);
            const fy = t.y + t.r * 0.95 - (t.kind === 'king' ? rand(60, 150) : rand(40, 100)) * sc * 1.2;
            addParticle({ x: fx, y: fy, vx: rand(-6, 6), vy: rand(-60, -30), life: rand(0.5, 0.9), size: rand(5, 9), color: Math.random() < 0.5 ? '#fb923c' : '#fde047', kind: 'glow', grav: 0 });
            if (Math.random() < 0.5) smoke(fx, fy - 6, rand(10, 18), rand(0.9, 1.5), 'rgba(60,52,48,.55)', -40);
          }
        }

        if (!fighting) return;
        t.atkCd -= dt;
        if (t.atkCd > 0) return;

        let best = null;
        let bestD = t.range;
        const enemy = other(t.side);
        forNear(t.x, t.y, t.range, (e) => {
          if (e.side !== enemy || e.dead) return;
          const d = dist(t.x, t.y, e.x, e.y);
          if (d < bestD) { bestD = d; best = e; }
        });
        if (best) {
          t.atkCd = t.atk;
          t.swing = 1;
          const sc = CASTLE_SCALE[t.kind];
          const sy = t.y + t.r * 0.95 - (t.kind === 'king' ? 250 : 170) * sc;
          projectiles.push({
            kind: 'bolt', x: t.x, y: sy, tx: best.x, ty: best.y - best.r, speed: 680, dmg: t.dmg, splash: 0, side: t.side,
            color: cfg().teams[t.side].color, target: best, owner: null, stat: null, life: 2, trail: [],
          });
          burst(t.x, sy, '#fff3c4', 4, 90, 0.25, 3, true);
        }
      });

      // proyectiles
      for (let i = projectiles.length - 1; i >= 0; i -= 1) {
        const p = projectiles[i];
        p.life -= dt;
        const t = p.target;
        if (t && (t.isTower ? t.alive : !t.dead)) { p.tx = t.x; p.ty = t.y - (t.isTower ? t.r * 0.4 : (t.def && t.def.flying ? flyLift(t.r) + t.r : t.r * 1.2)); }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (p.trail) { p.trail.push([p.x, p.y]); if (p.trail.length > (p.kind === 'meteor' || p.kind === 'iceball' ? 14 : 7)) p.trail.shift(); }
        if (d <= step + 4 || p.life <= 0) {
          projectileHit(p);
          projectiles.splice(i, 1);
        } else {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
          p.angle = Math.atan2(dy, dx);
          if (p.kind === 'meteor') {
            addParticle({ x: p.x + rand(-6, 6), y: p.y + rand(-6, 6), vx: rand(-25, 25), vy: rand(-25, 25), life: 0.55, size: rand(8, 15), color: Math.random() < 0.5 ? '#fb923c' : '#fde047', kind: 'glow', grav: 0 });
            if (Math.random() < 0.5) smoke(p.x, p.y, 14, 0.7, 'rgba(70,60,56,.5)', -10);
          } else if (p.kind === 'iceball') {
            addParticle({ x: p.x + rand(-5, 5), y: p.y + rand(-5, 5), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.5, size: rand(5, 10), color: '#e0f2fe', kind: 'glow', grav: 0 });
          } else if (p.kind === 'fire' && Math.random() < 0.7) {
            addParticle({ x: p.x, y: p.y, vx: rand(-14, 14), vy: rand(-18, 8), life: 0.32, size: rand(4, 7), color: '#fb923c', kind: 'glow', grav: 0 });
          } else if (p.kind === 'magic' && Math.random() < 0.7) {
            addParticle({ x: p.x, y: p.y, vx: rand(-14, 14), vy: rand(-14, 14), life: 0.4, size: rand(3, 5), color: '#d8b4fe', kind: 'glow', grav: 0 });
          }
        }
      }

      // cadáveres, partículas, textos y demás
      for (let i = corpses.length - 1; i >= 0; i -= 1) if (time - corpses[i].t0 > 0.85) corpses.splice(i, 1);
      if (units.some((u) => u.dead)) units = units.filter((u) => !u.dead);

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.grav * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        texts[i].life -= dt;
        texts[i].y -= 28 * dt;
        if (texts[i].life <= 0) texts.splice(i, 1);
      }
      for (let i = bolts.length - 1; i >= 0; i -= 1) { bolts[i].life -= dt; if (bolts[i].life <= 0) bolts.splice(i, 1); }
      for (let i = zones.length - 1; i >= 0; i -= 1) { zones[i].life -= dt; if (zones[i].life <= 0) zones.splice(i, 1); }
      for (let i = summons.length - 1; i >= 0; i -= 1) if (time - summons[i].t0 > 0.9) summons.splice(i, 1);
      for (let i = confetti.length - 1; i >= 0; i -= 1) {
        const f = confetti[i];
        f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
        if (f.life <= 0 || f.y > H + 30) confetti.splice(i, 1);
      }
      shake = Math.max(0, shake - dt * 32);
      zoomPulse = Math.max(0, zoomPulse - dt * 0.9);
      screenFlash = Math.max(0, screenFlash - dt * 2.4);

      // motas de luz flotando (ambiente)
      if (ambient.length < 26 && Math.random() < 0.05) ambient.push({ x: rand(0, W), y: rand(H * 0.3, H), vx: rand(-8, 8), vy: rand(-14, -3), life: rand(4, 8), size: rand(1.4, 2.8), ph: rand(0, 6) });
      for (let i = ambient.length - 1; i >= 0; i -= 1) {
        const a = ambient[i];
        a.life -= dt; a.x += a.vx * dt + Math.sin(time + a.ph) * 0.15; a.y += a.vy * dt;
        if (a.life <= 0) ambient.splice(i, 1);
      }
    }

    // ======================================================================
    // dibujo
    // ======================================================================
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(320, Math.round(rect.width * dpr));
      const height = Math.round(width * H / W);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        bgCanvas = null;
      }
      scale = canvas.width / W;
    }

    function ensureArt() {
      const teams = cfg().teams;
      const key = teams.left.color + teams.right.color;
      if (key !== sheetKey) {
        sheetKey = key;
        Art.clearSheets();
        Art.clearCastles();
        bgCanvas = null;
      }
      if (!bgCanvas) bgCanvas = Art.buildBackground(canvas.width, canvas.height, W, H, teams, GEOM);
    }

    // Prepara de antemano todos los sprites para que no haya tirones cuando aparezca una tropa nueva en pleno combate
    function warmUp() {
      resize();
      ensureArt();
      const teams = cfg().teams;
      ['left', 'right'].forEach((side) => {
        Object.keys(UNITS).forEach((id) => Art.getSheet(id, teams[side].color));
        ['king', 'princess'].forEach((kind) => ['ok', 'damaged', 'ruin'].forEach((st) => Art.getCastle(kind, teams[side].color, st)));
      });
    }

    function drawHealthBar(c, x, y, w, h, pct, color) {
      c.fillStyle = 'rgba(15,23,42,.82)'; Art.util.rr(c, x - 1.6, y - 1.6, w + 3.2, h + 3.2, 4); c.fill();
      const p = clamp(pct, 0, 1);
      const col = p > 0.5 ? '#4ade80' : p > 0.25 ? '#facc15' : '#f87171';
      c.fillStyle = Art.util.grad(c, 0, y, 0, y + h, [[0, shade(col, 0.35)], [1, col]]);
      Art.util.rr(c, x, y, Math.max(2, w * p), h, 3); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 1, y + 0.6, Math.max(0, w * p - 2), Math.max(1, h * 0.3));
      if (color) { c.fillStyle = color; c.fillRect(x - 5, y - 2, 3, h + 4); }
    }

    function drawCastle(c, t, now) {
      const team = cfg().teams[t.side].color;
      const state = !t.alive ? 'ruin' : (t.hp / t.maxHp < 0.55 ? 'damaged' : 'ok');
      const spr = Art.getCastle(t.kind, team, state);
      const sc = CASTLE_SCALE[t.kind];
      const gx = t.x;
      const gy = t.y + t.r * 0.95;
      const dx = gx - spr.ox * sc;
      const dy = gy - spr.oy * sc;

      if (t.flash > 0 && t.alive) {
        c.save(); c.filter = 'brightness(1.9)'; c.drawImage(spr.canvas, dx, dy, spr.w * sc, spr.h * sc); c.restore();
      } else {
        c.drawImage(spr.canvas, dx, dy, spr.w * sc, spr.h * sc);
      }
      if (!t.alive) return;

      // bandera ondeando en la punta
      const apexY = gy - (t.kind === 'king' ? 336 : 238) * sc;
      const pole = (t.kind === 'king' ? 52 : 36) * sc * 1.5;
      c.strokeStyle = '#3f3a36'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(gx, apexY + 4); c.lineTo(gx, apexY - pole); c.stroke();
      const fw = t.kind === 'king' ? 46 : 32;
      const dir = t.side === 'left' ? 1 : -1;
      c.beginPath(); c.moveTo(gx, apexY - pole);
      for (let i = 1; i <= 6; i += 1) { const k = i / 6; c.lineTo(gx + dir * fw * k, apexY - pole + Math.sin(now * 5 + k * 4) * 5 * k + k * 3); }
      for (let i = 6; i >= 0; i -= 1) { const k = i / 6; c.lineTo(gx + dir * fw * k, apexY - pole + 17 + Math.sin(now * 5 + k * 4) * 5 * k + k * 3); }
      c.closePath();
      c.fillStyle = Art.util.grad(c, gx, apexY - pole, gx + dir * fw, apexY - pole + 18, [[0, shade(team, 0.25)], [1, shade(team, -0.3)]]); c.fill();
      c.strokeStyle = '#1c1530'; c.lineWidth = 1.8; c.stroke();

      // barra de vida
      const w = t.kind === 'king' ? 124 : 88;
      drawHealthBar(c, gx - w / 2, dy - 6, w, 10, t.hp / t.maxHp, team);
    }

    function drawProjectile(c, p) {
      c.save();
      if (p.trail && p.trail.length > 1) {
        c.globalCompositeOperation = 'lighter';
        c.lineCap = 'round';
        for (let i = 1; i < p.trail.length; i += 1) {
          const k = i / p.trail.length;
          c.strokeStyle = rgba(p.color.startsWith('#') ? p.color : '#ffffff', k * (p.kind === 'arrow' ? 0.5 : 0.7));
          c.lineWidth = (p.kind === 'meteor' ? 16 : p.kind === 'arrow' ? 2 : 6) * k;
          c.beginPath(); c.moveTo(p.trail[i - 1][0], p.trail[i - 1][1]); c.lineTo(p.trail[i][0], p.trail[i][1]); c.stroke();
        }
        c.globalCompositeOperation = 'source-over';
      }
      c.translate(p.x, p.y);
      if (p.kind === 'arrow') {
        c.rotate(p.angle || 0);
        c.strokeStyle = '#1c1530'; c.lineWidth = 4; c.beginPath(); c.moveTo(-13, 0); c.lineTo(8, 0); c.stroke();
        c.strokeStyle = '#d6b27a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-13, 0); c.lineTo(8, 0); c.stroke();
        c.fillStyle = '#f1f5f9'; c.beginPath(); c.moveTo(7, -3.4); c.lineTo(14, 0); c.lineTo(7, 3.4); c.closePath(); c.fill();
        c.fillStyle = '#ef4444'; c.beginPath(); c.moveTo(-13, 0); c.lineTo(-18, -3.4); c.lineTo(-10, 0); c.lineTo(-18, 3.4); c.closePath(); c.fill();
      } else if (p.kind === 'bolt') {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = Art.util.rgrad(c, 0, 0, 0, 12, [[0, '#ffffff'], [0.4, p.color], [1, 'rgba(255,255,255,0)']]);
        c.beginPath(); c.arc(0, 0, 12, 0, TAU); c.fill();
      } else if (p.kind === 'meteor') {
        c.rotate(realTime * 5);
        c.fillStyle = Art.util.rgrad(c, 0, 0, 2, 34, [[0, 'rgba(255,255,230,1)'], [0.35, 'rgba(251,146,60,.95)'], [1, 'rgba(239,68,68,0)']]);
        c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
        c.beginPath(); c.moveTo(-14, -6); c.lineTo(-4, -16); c.lineTo(12, -10); c.lineTo(16, 6); c.lineTo(2, 15); c.lineTo(-12, 10); c.closePath();
        c.fillStyle = Art.util.grad(c, -14, -16, 16, 15, [[0, '#6b4a36'], [1, '#241410']]); c.fill(); c.strokeStyle = '#ffedd5'; c.lineWidth = 1.6; c.stroke();
      } else if (p.kind === 'iceball') {
        c.fillStyle = Art.util.rgrad(c, 0, 0, 2, 30, [[0, '#ffffff'], [0.4, '#7dd3fc'], [1, 'rgba(56,189,248,0)']]);
        c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
        c.rotate(realTime * 3); c.fillStyle = '#e0f2fe'; Art.util.star(c, 0, 0, 14, 6, 0.4); c.fill(); c.strokeStyle = '#0ea5e9'; c.lineWidth = 1.6; c.stroke();
      } else {
        const col = p.kind === 'magic' ? '#c084fc' : '#fb923c';
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = Art.util.rgrad(c, 0, 0, 0, 16, [[0, '#ffffff'], [0.4, col], [1, 'rgba(0,0,0,0)']]);
        c.beginPath(); c.arc(0, 0, 16, 0, TAU); c.fill();
      }
      c.restore();
    }

    function drawZone(c, z, now) {
      const k = z.life / z.max;
      c.save();
      c.translate(z.x, z.y);
      if (z.kind === 'ice') {
        const grow = Math.min(1, (1 - k) * 4);
        c.fillStyle = `rgba(186,230,253,${0.3 * k})`; c.beginPath(); c.ellipse(0, 0, z.radius * grow, z.radius * 0.62 * grow, 0, 0, TAU); c.fill();
        c.strokeStyle = `rgba(224,242,254,${0.9 * k})`; c.lineWidth = 3; c.stroke();
        for (let i = 0; i < 12; i += 1) {
          const a = i * 0.5236 + 0.2;
          const rr = z.radius * (0.35 + (i % 3) * 0.2) * grow;
          const hx = Math.cos(a) * rr;
          const hy = Math.sin(a) * rr * 0.6;
          const h = (14 + (i % 4) * 8) * grow;
          c.fillStyle = `rgba(224,242,254,${0.95 * k})`; c.beginPath(); c.moveTo(hx - 5, hy); c.lineTo(hx, hy - h); c.lineTo(hx + 5, hy); c.closePath(); c.fill();
          c.strokeStyle = `rgba(14,165,233,${0.8 * k})`; c.lineWidth = 1.2; c.stroke();
        }
      } else if (z.kind === 'scorch') {
        c.fillStyle = Art.util.rgrad(c, 0, 0, 2, z.radius, [[0, `rgba(20,10,5,${0.7 * Math.min(1, k * 2)})`], [1, 'rgba(20,10,5,0)']]);
        c.beginPath(); c.ellipse(0, 0, z.radius, z.radius * 0.6, 0, 0, TAU); c.fill();
      } else if (z.kind === 'heal') {
        const grow = 1 - k;
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = Art.util.grad(c, 0, -240, 0, 0, [[0, 'rgba(254,249,195,0)'], [1, `rgba(254,240,138,${0.5 * Math.min(1, k * 2)})`]]);
        c.fillRect(-z.radius * 0.5, -240, z.radius, 240);
        c.strokeStyle = `rgba(187,247,208,${0.9 * k})`; c.lineWidth = 4;
        c.beginPath(); c.ellipse(0, 0, z.radius * (0.35 + grow * 0.65), z.radius * (0.35 + grow * 0.65) * 0.6, 0, 0, TAU); c.stroke();
        c.fillStyle = `rgba(187,247,208,${0.2 * k})`; c.fill();
      } else if (z.kind === 'target') {
        c.strokeStyle = rgba(z.color, 0.9 * k); c.lineWidth = 3; c.setLineDash([10, 8]); c.lineDashOffset = -now * 40;
        c.beginPath(); c.ellipse(0, 0, z.radius * (0.6 + k * 0.4), z.radius * (0.6 + k * 0.4) * 0.6, 0, 0, TAU); c.stroke(); c.setLineDash([]);
      }
      c.restore();
    }

    function drawBolt(c, b) {
      const k = b.life / b.max;
      const path = (pts) => { c.beginPath(); pts.forEach((p, i) => { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); };
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.shadowColor = '#fde047'; c.shadowBlur = 24;
      c.strokeStyle = `rgba(253,224,71,${k})`; c.lineWidth = 9; path(b.pts); c.stroke();
      b.branches.forEach((br) => { c.lineWidth = 4; path(br); c.stroke(); });
      c.shadowBlur = 0;
      c.strokeStyle = `rgba(255,255,255,${k})`; c.lineWidth = 3.2; path(b.pts); c.stroke();
      c.restore();
    }

    function drawParticle(c, p) {
      const k = p.life / p.max;
      c.save();
      if (p.kind === 'ring') {
        const r = p.size * (1 - k * k);
        c.strokeStyle = p.color; c.globalAlpha = Math.min(1, k * 1.2) * 0.9; c.lineWidth = 2 + k * 5;
        c.beginPath(); c.ellipse(p.x, p.y, Math.max(1, r), Math.max(1, r * 0.6), 0, 0, TAU); c.stroke();
      } else if (p.kind === 'smoke') {
        c.globalAlpha = k * 0.75; c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.size * (1.7 - k * 0.7), 0, TAU); c.fill();
      } else if (p.kind === 'plus') {
        c.globalAlpha = Math.min(1, k * 1.5); c.fillStyle = p.color;
        Art.util.rr(c, p.x - 1.8, p.y - 6, 3.6, 12, 1.6); c.fill(); Art.util.rr(c, p.x - 6, p.y - 1.8, 12, 3.6, 1.6); c.fill();
      } else if (p.kind === 'chunk') {
        c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = Math.min(1, k * 2);
        c.fillStyle = p.color; c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8); c.strokeStyle = 'rgba(20,16,12,.7)'; c.lineWidth = 1.4; c.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
      } else if (p.kind === 'star') {
        c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = Math.min(1, k * 1.8); c.fillStyle = p.color;
        Art.util.star(c, 0, 0, p.size, 5, 0.45); c.fill(); c.strokeStyle = 'rgba(120,53,15,.8)'; c.lineWidth = 1.2; c.stroke();
      } else if (p.kind === 'flare') {
        c.globalCompositeOperation = 'lighter';
        const rad = p.size * (0.5 + (1 - k) * 0.8);
        c.fillStyle = Art.util.rgrad(c, p.x, p.y, 0, rad, [[0, rgba('#ffffff', 0.9 * k)], [1, 'rgba(255,255,255,0)']]);
        c.beginPath(); c.arc(p.x, p.y, rad, 0, TAU); c.fill();
      } else if (p.kind === 'glow') {
        c.globalCompositeOperation = 'lighter';
        const r = p.size * (0.5 + k * 0.7);
        c.fillStyle = Art.util.rgrad(c, p.x, p.y, 0, r * 2, [[0, rgba(p.color.startsWith('#') ? p.color : '#ffffff', Math.min(1, k * 1.5))], [1, 'rgba(255,255,255,0)']]);
        c.beginPath(); c.arc(p.x, p.y, r * 2, 0, TAU); c.fill();
      } else {
        c.globalAlpha = Math.min(1, k * 1.4); c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU); c.fill();
      }
      c.restore();
    }

    function draw(now) {
      if (!ctx) return;
      resize();
      ensureArt();

      const teams = cfg().teams;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bgCanvas, 0, 0);

      const sx = shake > 0 ? rand(-shake, shake) : 0;
      const sy = shake > 0 ? rand(-shake, shake) : 0;
      const z = 1 + zoomPulse * 0.035;
      ctx.setTransform(scale * z, 0, 0, scale * z, (sx - (W / 2) * (z - 1)) * scale, (sy - (H / 2) * (z - 1)) * scale);

      // agua con corriente y destellos
      ctx.save();
      ctx.beginPath(); ctx.rect(RIVER_X0 - 2, 0, RIVER_X1 - RIVER_X0 + 4, H); ctx.clip();
      for (let i = 0; i < 26; i += 1) {
        const y = ((i * 79 + time * 38) % (H + 40)) - 20;
        const x = RIVER_X0 + 8 + ((i * 23) % 40);
        ctx.strokeStyle = `rgba(255,255,255,${0.16 + (i % 3) * 0.06})`; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y + 6, x + 2, y + 14 + (i % 3) * 5); ctx.stroke();
      }
      ctx.restore();

      // sombras de nubes que pasan despacio
      for (let i = 0; i < 3; i += 1) {
        const cx = ((now * 14 + i * 620) % (W + 700)) - 350;
        ctx.fillStyle = Art.util.rgrad(ctx, cx, 200 + i * 280, 0, 260, [[0, 'rgba(10,30,40,.10)'], [1, 'rgba(10,30,40,0)']]);
        ctx.beginPath(); ctx.ellipse(cx, 200 + i * 280, 300, 130, 0, 0, TAU); ctx.fill();
      }

      zones.forEach((zn) => { if (zn.kind === 'scorch' || zn.kind === 'ice' || zn.kind === 'target') drawZone(ctx, zn, now); });

      // círculos de invocación bajo los pies
      summons.forEach((s) => {
        const k = clamp((time - s.t0) / 0.9, 0, 1);
        const a = 1 - k;
        ctx.save(); ctx.translate(s.x, s.y + s.r * 0.5);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(s.color, 0.85 * a); ctx.lineWidth = 2.4; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -now * 30;
        ctx.beginPath(); ctx.ellipse(0, 0, s.r * (0.7 + k * 0.5), s.r * (0.7 + k * 0.5) * 0.5, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = Art.util.grad(ctx, 0, -s.r * 3.4, 0, 0, [[0, 'rgba(255,255,255,0)'], [1, rgba(s.color, 0.45 * a)]]);
        ctx.fillRect(-s.r * 0.55, -s.r * 3.4, s.r * 1.1, s.r * 3.4);
        ctx.restore();
      });

      // objetos ordenados por profundidad: castillos, cadáveres y tropas de tierra
      const items = [];
      towers.forEach((tw) => items.push({ y: tw.y + tw.r * 0.95, kind: 'tower', ref: tw }));
      corpses.forEach((cp) => { if (!cp.flying) items.push({ y: cp.y, kind: 'corpse', ref: cp }); });
      units.forEach((u) => { if (!u.def.flying) items.push({ y: u.y, kind: 'unit', ref: u }); });
      items.sort((a, b) => a.y - b.y);

      const drawUnitEntry = (u) => {
        const age = time - u.born;
        const pop = age < 0.35 ? clamp(easeOutBack(clamp(age / 0.35, 0, 1)), 0.2, 1.25) : 1;
        const attackP = (time - u.attackStart) / u.attackDur;
        const attacking = attackP >= 0 && attackP < 1;
        const squash = attacking ? Math.sin(attackP * Math.PI) * 0.06 : 0;
        const lunge = attacking && u.def.range < 80 ? Math.sin(Math.min(1, attackP * 1.6) * Math.PI) * u.r * 0.22 : 0;
        Art.drawUnit(ctx, u.type, teams[u.side].color, u.x, u.y, u.r, u.facing, {
          walkT: u.walkT, attackP: attacking ? attackP : undefined, moving: u.moving, time: now, phase: u.phase, gold: u.level >= 5,
          flash: u.flash, pop, squash, lunge, lift: u.def.flying ? flyLift(u.r) : 0,
        });
        if (u.frozen > 0) {
          ctx.fillStyle = 'rgba(186,230,253,.38)'; ctx.strokeStyle = 'rgba(224,242,254,.9)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(u.x, u.y - u.r * 1.4 - (u.def.flying ? flyLift(u.r) : 0), u.r * 1.15, u.r * 1.9, 0, 0, TAU); ctx.fill(); ctx.stroke();
        }
        const top = u.y - u.r * 3.6 - (u.def.flying ? flyLift(u.r) : 0);
        if (u.hp < u.maxHp) {
          const w = Math.max(28, u.r * 2.2);
          drawHealthBar(ctx, u.x - w / 2, top, w, 4.6, u.hp / u.maxHp, null);
        }
        if (u.level >= 2) {
          const pips = Math.min(5, Math.ceil(u.level / 2));
          ctx.fillStyle = '#facc15'; ctx.strokeStyle = 'rgba(80,45,0,.9)'; ctx.lineWidth = 1;
          for (let i = 0; i < pips; i += 1) { Art.util.star(ctx, u.x + (i - (pips - 1) / 2) * 9, top - 8, 4.2, 5, 0.5); ctx.fill(); ctx.stroke(); }
        }
      };

      const drawCorpse = (cp) => {
        const k = clamp((time - cp.t0) / 0.8, 0, 1);
        Art.drawUnit(ctx, cp.type, teams[cp.side].color, cp.x, cp.y + k * 4, cp.r, cp.facing, {
          walkT: cp.walkT, moving: false, time: now, phase: 0, gold: false, rot: -cp.facing * k * 1.5, alpha: 1 - k * k,
          lift: cp.flying ? flyLift(cp.r) - k * 70 : 0, pop: 1 - k * 0.15, squash: k * 0.1,
        });
      };

      items.forEach((it) => {
        if (it.kind === 'tower') drawCastle(ctx, it.ref, now);
        else if (it.kind === 'corpse') drawCorpse(it.ref);
        else drawUnitEntry(it.ref);
      });

      // voladores por encima de todo
      corpses.filter((cp) => cp.flying).forEach(drawCorpse);
      units.filter((u) => u.def.flying).sort((a, b) => a.y - b.y).forEach(drawUnitEntry);

      zones.forEach((zn) => { if (zn.kind === 'heal') drawZone(ctx, zn, now); });
      projectiles.forEach((p) => drawProjectile(ctx, p));
      bolts.forEach((b) => drawBolt(ctx, b));
      particles.forEach((p) => drawParticle(ctx, p));

      // motas de luz
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ambient.forEach((a) => {
        const k = Math.min(1, a.life / 1.5) * (0.5 + 0.5 * Math.sin(now * 2 + a.ph));
        ctx.fillStyle = `rgba(255,244,190,${0.55 * k})`; ctx.beginPath(); ctx.arc(a.x, a.y, a.size * 2.2, 0, TAU); ctx.fill();
      });
      ctx.restore();

      // confeti de victoria
      confetti.forEach((f) => {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(1, Math.abs(Math.cos(f.rot * 2)) + 0.2);
        ctx.fillStyle = f.color; ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h); ctx.restore();
      });

      // textos flotantes
      ctx.textAlign = 'center';
      texts.forEach((tx) => {
        const k = tx.life / tx.max;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.font = `800 ${tx.size}px system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(15,23,42,.9)'; ctx.strokeText(tx.text, tx.x, tx.y);
        ctx.fillStyle = tx.color; ctx.fillText(tx.text, tx.x, tx.y);
      });
      ctx.globalAlpha = 1;

      // destello de pantalla (rayos, explosiones)
      if (screenFlash > 0.01) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(${flashColor},${Math.min(0.5, screenFlash)})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      // oscurecer un poco al terminar la partida para destacar el cartel
      if (match.phase === 'ended') {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const k = clamp((time - match.endedAt) / 0.8, 0, 1);
        ctx.fillStyle = `rgba(6,10,24,${0.38 * k})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    // ---------- estado para la interfaz ----------
    function getHud() {
      const top = { left: [], right: [] };
      stats.forEach((entry) => { top[entry.side].push(entry); });
      ['left', 'right'].forEach((side) => {
        top[side].sort((a, b) => b.damage - a.damage || b.units - a.units);
        top[side] = top[side].slice(0, 3).map((e) => ({ name: e.name, damage: Math.round(e.damage), units: e.units }));
      });

      const hpOf = (side) => {
        const list = towers.filter((t) => t.side === side);
        const max = list.reduce((s, t) => s + t.maxHp, 0) || 1;
        const now = list.reduce((s, t) => s + Math.max(0, t.hp), 0);
        return now / max;
      };

      const queued = (side) => queues[side].reduce((sum, item) => sum + item.left * (UNITS[item.id] ? (UNITS[item.id].pack || 1) : 1), 0);

      return {
        phase: match.phase,
        timeLeft: match.timeLeft,
        crowns: { ...match.crowns },
        winner: match.winner,
        reason: match.reason,
        towerHp: { left: hpOf('left'), right: hpOf('right') },
        units: { left: unitCount('left'), right: unitCount('right') },
        queued: { left: queued('left'), right: queued('right') },
        top,
        restartIn: match.phase === 'ended' ? Math.max(0, cfg().settings.restartSeconds - (time - match.endedAt)) : 0,
      };
    }

    function clearArena() {
      units = []; corpses = []; projectiles = []; particles = []; zones = []; bolts = []; summons = [];
      queues.left = []; queues.right = [];
    }

    return {
      update, draw, resize, warmUp, resetMatch, startMatch, enqueue, getHud, clearArena,
      get phase() { return match.phase; },
      get time() { return time; },
      _debug: { get units() { return units; }, get towers() { return towers; }, match },
    };
  }

  return { create, UNITS, SPELLS, levelMult, W, H };
}());

if (typeof window !== 'undefined') window.KingdomsEngine = KingdomsEngine;
