// The run's simulation: one floor, the player, enemies, attacks, pickups and interactables.
// Pure logic. The renderer reads state and drains `events` for effects and sound.
import { T, PLAYER, COMBAT as C, poiseOf } from './constants.js';
import { makeRng } from './rng.js';
import { moveBody, groundAhead, wallAhead, lineOfSight, overlaps, tileAt } from './physics.js';
import { generateFloor } from './level/generator.js';
import { createEnemy, updateEnemy, damageEnemy, ENEMY_TYPES } from './enemies.js';
import { createPlayer, updatePlayer, hurtPlayer } from './player.js';
import * as M from './mechanics.js';
import { equipWeapon, WEAPONS } from './upgrades.js';

export function createWorld({ seed, depth, stats, carry, mods = {}, allowedWeapons, level: fixedLevel }) {
  const level = fixedLevel || generateFloor({ seed: seed * 7919 + depth, depth, allowedWeapons, enemyCountMul: mods.enemyCountMul || 1 });
  const rng = makeRng(seed * 31 + depth * 1009);
  const w = {
    seed, depth, level, rng, time: 0, mods,
    player: null, enemies: [], hitboxes: [], projectiles: [], pickups: [], saws: [],
    shrines: [], chests: [], torches: [], decor: [], breakables: [],
    exit: { ...level.exit, open: true },
    events: [], shakeAmt: 0, shakeX: 0, shakeY: 0, hitStop: 0, slowmo: 0, combo: 0, comboT: 0, respawnTimer: 0, prompt: null,
    bossDead: false, onShrine: null, onExit: null, onVictory: null, onShop: null,
    trails: [], souls: [], flurry: [], merchant: null, weaponDrops: [], pathlights: [], lift: null, descending: 0,
    moveBody, groundAhead, wallAhead, lineOfSight,
  };
  const p = createPlayer(level.spawn.x, level.spawn.y, stats);
  if (carry) { p.hp = Math.min(stats.maxHp, carry.hp); p.flask = carry.flask; p.gold = carry.gold; p.kills = carry.kills; }
  w.player = p;

  for (const e of level.entities) {
    switch (e.kind) {
      case 'enemy': w.enemies.push(createEnemy(e.type, e.x, e.y, rng)); break;
      case 'shrine': w.shrines.push({ x: e.x, y: e.y, used: false }); break;
      case 'chest': w.chests.push({ x: e.x, y: e.y, w: 1.6, h: 1, open: false, openT: 0 }); break;
      case 'torch': w.torches.push({ x: e.x, y: e.y }); break;
      case 'merchant': w.merchant = { x: e.x, y: e.y }; break;
      case 'lift': w.lift = { x: e.x, y: e.y, w: e.w || 3 }; break;
      case 'pathlight': w.pathlights.push({ x: e.x, y: e.y }); break;
      case 'tip': (w.tips ||= []).push({ ...e, shown: false }); break;
      case 'weapon': w.weaponDrops.push({ x: e.x, y: e.y, id: e.id, t: rng.next() * 6 }); break;
      case 'saw': w.saws.push({ x: e.x, y: e.y, x0: e.x, y0: e.y, x1: e.x2 ?? e.x, y1: e.y2 ?? e.y, speed: e.speed || 3, t: rng.next(), r: 0.85, angle: 0 }); break;
      case 'decor':
        if (e.name === 'barrel' || e.name === 'crate') w.breakables.push({ ...e, w: 0.9, h: 1, alive: true });
        else w.decor.push(e);
        break;
    }
  }
  clearEntrances(w);
  if (w.enemies.some((e) => e.boss)) w.exit.open = false;
  // the only way down is the lift at the end of the critical path (older layouts: a lift at the exit)
  if (!w.lift) w.lift = { x: level.exit.x, y: level.exit.y, w: 3 };
  w.exit.x = w.lift.x; w.exit.y = w.lift.y;

  // --- callbacks used by player.js and enemies.js ---------------------------------------------
  const ev = (o) => w.events.push(o);
  w.sfx = (name) => ev({ t: 'sfx', name });
  // dx/dy: optional direction so the screen kicks with the blow instead of jittering randomly
  w.shake = (a, dx = 0, dy = 0) => {
    w.shakeAmt = Math.min(1.2, Math.max(w.shakeAmt, a));
    if (dx || dy) { w.shakeX = dx * a; w.shakeY = dy * a; }
  };
  w._hit = (e, dmg, dir, src, opts) => hitEnemy(w, e, dmg, dir, src, opts);
  w.dashFx = (pl, air) => { if (!air) M.onDashStart(w, pl); ev({ t: 'dash', x: pl.x, y: pl.y, dir: pl.facing, air }); };
  w.dashTick = (pl) => M.dashTick(w, pl);
  w.onFlask = (pl) => M.onFlask(w, pl);
  w.healFx = (pl) => { ev({ t: 'heal', x: pl.x, y: pl.y }); w.sfx('heal'); };
  w.landFx = (pl, v) => { ev({ t: 'land', x: pl.x, y: pl.y, v }); if (v < -16) w.shake(0.15); };
  w.spawnHitbox = (h) => w.hitboxes.push({ ...h, owner: 'enemy', hit: false });
  w.spawnProjectile = (pr) => w.projectiles.push({ ...pr, owner: 'enemy', alive: true, age: 0 });
  w.spawnEnemy = (type, x, y) => {
    const e = createEnemy(type, x, y, rng); w.enemies.push(e); ev({ t: 'spawn', e });
  };

  w.playerSwing = (pl, opts = {}) => {
    const wp = M.weaponOf(pl.stats);
    const finisher = !opts.extra && pl.attackDir === 'side' && pl.combo === (wp.combo || 3);
    const wo = opts.extra ? {} : M.weaponSwing(w, pl, { finisher });
    const box = wo.box || swingBox(pl);
    let hitSomething = false;
    ev({ t: 'swing', x: pl.x, y: pl.y, dir: pl.attackDir, facing: pl.facing, combo: opts.extra ? 2 : pl.combo, finisher, weapon: wp.id });
    const base = pl.stats.dmg * wp.dmgMul * (finisher ? 1.5 : opts.extra ? 0.6 : 1);
    w._echoThisSwing = false; let pogoTarget = null;
    if (wo.skip) { M.onSwing(w, pl, { finisher, extra: opts.extra }); return; } // ranged weapons fire instead
    for (const e of w.enemies) {
      if (!e.alive || !overlaps(box, e)) continue;
      hitSomething = true;
      if (pl.attackDir === 'down' && !pogoTarget) pogoTarget = e;
      const dir = pl.attackDir === 'side' ? pl.facing : Math.sign(e.x - pl.x) || pl.facing;
      hitEnemy(w, e, base, dir, box, { finisher, knock: wp.knock, mul: wo.mul, crit: wo.crit, launch: wo.launch,
        stagger: C.staggerPerHit * (wp.stagger || 1), vertical: pl.attackDir !== 'side' ? (pl.attackDir === 'up' ? 1 : -1) : 0 });
    }
    for (const b of w.breakables) {
      if (b.alive && overlaps(box, b)) {
        b.alive = false; hitSomething = true; dropGold(w, b.x, b.y + 0.5, 1 + rng.int(0, 2)); ev({ t: 'break', b }); w.sfx('break');
        if (rng.chance(0.15)) w.pickups.push({ x: b.x, y: b.y + 0.6, vx: 0, vy: 6, w: 0.4, h: 0.4, heart: true, value: 0, age: 0 });
      }
    }
    for (const c of w.chests) if (!c.open && overlaps(box, c)) openChest(w, c);
    for (const pr of w.projectiles) {
      if (pr.alive && pr.owner === 'enemy' && overlaps(box, { x: pr.x, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 })) {
        hitSomething = true;
        if (pl.stats.deflect) { M.reflect(w, pr); w.sfx('parry'); continue; }
        pr.alive = false; ev({ t: 'spark', x: pr.x, y: pr.y, color: 0xffd27a }); w.sfx('parry');
      }
    }
    // pogo off enemies, hazards and saws with the down-slash
    if (pl.attackDir === 'down') {
      let pogo = hitSomething;
      for (let tx = Math.floor(box.x - box.w / 2); tx <= Math.floor(box.x + box.w / 2) && !pogo; tx++) {
        for (let ty = Math.floor(box.y); ty <= Math.floor(box.y + box.h); ty++) {
          const t = tileAt(level, tx, ty); if (t === T.SPIKES || t === T.LAVA) pogo = true;
        }
      }
      for (const s of w.saws) if (Math.hypot(s.x - pl.x, s.y - (pl.y - 0.8)) < s.r + 1) pogo = true;
      if (pogo) { pl.vy = 15.5; pl.dashLeft = pl.stats.dashes; pl.jumpsUsed = 0; ev({ t: 'pogo', x: pl.x, y: pl.y - 0.3 }); w.sfx('pogo'); M.onPogo(w, pl, pogoTarget); }
    } else if (hitSomething && pl.onGround && pl.attackDir === 'side' && !opts.extra) {
      pl.vx -= pl.facing * 2.5; // recoil
    }
    M.onSwing(w, pl, { finisher, extra: opts.extra });
  };

  // Heavy (charged) attack: bigger arc, more damage and stagger. Full charge and perfect timing hit harder.
  w.playerHeavy = (pl, h = {}) => {
    const wp = M.weaponOf(pl.stats);
    w.heavyBox = null;
    if (M.weaponHeavy(w, pl, h)) { M.onHeavy?.(w, pl, h); return; } // the weapon's own heavy replaced the strike
    const base = w.heavyBox || swingBox(pl), k = w.heavyBox ? 1 : h.full ? 1.35 : 1.15;
    const box = { ...base, w: base.w * k, h: base.h * (pl.attackDir === 'side' ? 1.15 : k) };
    if (pl.attackDir === 'side' && !w.heavyBox) box.x = pl.x + pl.facing * (box.w / 2 + 0.1);
    const mul = (C.heavyMin + (C.heavyFull - C.heavyMin) * (h.charge || 0)) * (h.perfect ? C.perfectMul : 1);
    const dmg = pl.stats.dmg * wp.dmgMul * mul;
    ev({ t: 'swing', x: pl.x, y: pl.y, dir: pl.attackDir, facing: pl.facing, combo: 3, finisher: true, heavy: true, weapon: wp.id });
    ev({ t: 'heavy', x: box.x, y: box.y + box.h / 2, facing: pl.facing, full: h.full, perfect: h.perfect, w: box.w });
    w._echoThisSwing = false;
    for (const e of w.enemies) {
      if (!e.alive || !overlaps(box, e)) continue;
      const dir = pl.attackDir === 'side' ? pl.facing : Math.sign(e.x - pl.x) || pl.facing;
      e.guarding = false; // heavy blows break guards
      hitEnemy(w, e, dmg, dir, box, { finisher: true, heavy: true, full: h.full, perfect: h.perfect, empowered: h.empowered, knock: wp.knock * 1.4,
        stagger: C.staggerHeavy * (wp.stagger || 1) * (h.full ? 1.5 : 1),
        vertical: pl.attackDir !== 'side' ? (pl.attackDir === 'up' ? 1 : -1) : 0 });
    }
    for (const b of w.breakables) if (b.alive && overlaps(box, b)) { b.alive = false; dropGold(w, b.x, b.y + 0.5, 1 + rng.int(0, 2)); ev({ t: 'break', b }); w.sfx('break'); }
    for (const c of w.chests) if (!c.open && overlaps(box, c)) openChest(w, c);
    if (pl.attackDir === 'down') { pl.vy = 15.5; pl.dashLeft = pl.stats.dashes; pl.jumpsUsed = 0; }
    w.shake(h.perfect ? 0.6 : h.full ? 0.45 : 0.3, pl.attackDir === 'side' ? pl.facing : 0, 0);
    w.sfx(h.full ? 'slam' : 'hit3');
    if (h.perfect) { w.hitStop = Math.max(w.hitStop, 0.08); w.slowmo = Math.max(w.slowmo, 0.15); }
    M.onHeavy?.(w, pl, h);
  };
  w.chargeFx = (pl) => { ev({ t: 'chargeFull', x: pl.x, y: pl.y }); w.sfx('select'); };

  w.dashDamage = (pl) => {
    for (const e of w.enemies) {
      if (e.alive && !pl.dashHit.has(e) && overlaps(pl, e)) { pl.dashHit.add(e); hitEnemy(w, e, 1, pl.facing, pl); }
    }
  };

  w.playerSpecial = (pl, kind) => {
    if (kind === 'firebolt') {
      w.projectiles.push({ owner: 'player', kind: 'firebolt', x: pl.x + pl.facing * 0.8, y: pl.y + 1.1, vx: pl.facing * 17, vy: 0,
        r: 0.4, dmg: 2 + pl.stats.dmg, ttl: 1.6, gravity: 0, alive: true, age: 0, hitSet: new Set(), pierce: true });
      w.sfx('fire');
    } else {
      for (const dir of [-1, 1]) {
        w.projectiles.push({ owner: 'player', kind: 'wave', x: pl.x + dir * 0.8, y: pl.y + 0.5, vx: dir * 13, vy: 0,
          r: 0.6, dmg: 3 + pl.stats.dmg, ttl: 0.7, gravity: 0, alive: true, age: 0, hitSet: new Set(), pierce: true, ground: true });
      }
      w.shake(0.5); w.sfx('slam');
    }
  };

  w.playerHazard = (pl, kind) => {
    if (w.respawnTimer > 0) return;
    const landed = hurtPlayer(pl, 1, -pl.facing, w, { ignoreInvuln: true });
    if (pl.dead) M.tryRevive(w);
    if (landed) { w.shake(0.4); w.hitStop = 0.04; ev({ t: 'hurt', x: pl.x, y: pl.y }); w.sfx('hurt'); }
    ev({ t: kind === T.LAVA ? 'burn' : 'spark', x: pl.x, y: pl.y + 0.3, color: 0xff5533 });
    if (!pl.dead) w.respawnTimer = 0.45;
  };
  return w;
}

export function swingBox(pl) {
  const r = M.weaponOf(pl.stats).reach || 1; // weapon reach scales the blade arc
  if (pl.attackDir === 'up') return { x: pl.x, y: pl.y + 1.1, w: 1.8 * r, h: 2.0 * r };
  if (pl.attackDir === 'down') return { x: pl.x, y: pl.y - 1.5 * r, w: 1.6 * r, h: 1.7 * r };
  return { x: pl.x + pl.facing * 1.2 * r, y: pl.y + 0.05, w: 2.3 * r, h: 1.7 };
}

function hitEnemy(w, e, baseDmg, dir, src, o = {}) {
  const { finisher = false, vertical = 0, fromProc = false, quiet = false, knock = 1, heavy = false, full = false, stagger = 0 } = o;
  if (!e.alive) return { killed: false, blocked: false };
  const { dmg, crit, execute } = M.shapeDamage(w, e, baseDmg, { ...o, fromPlayer: !fromProc });
  const r = damageEnemy(e, dmg, dir || 1, w);
  // keep grunts within reach of the next combo swing; finishers (and heavy weapons) still launch them
  if (!r.killed && !e.boss && !e.armored && dir) e.vx = Math.sign(e.vx || dir) * Math.min(Math.abs(e.vx), (finisher ? 7 : 2.6) * knock);
  if (execute && r.killed) { w.events.push({ t: 'execute', x: e.x, y: e.y + e.h * 0.6 }); w.slowmo = Math.max(w.slowmo, 0.3); }
  if (quiet) { // burn ticks etc: small feedback, no hit-stop or combo
    e.hurtFlash = 0.6; w.events.push({ t: 'tick', x: e.x, y: e.y + e.h * 0.7, dmg, e });
    if (r.killed) onKill(w, e);
    return r;
  }
  const hx = (e.x + src.x) / 2, hy = e.y + e.h * 0.55;
  if (r.blocked) {
    w.events.push({ t: 'blocked', x: hx, y: hy, dir });
    w.player.vx -= dir * 5; w.hitStop = Math.max(w.hitStop, 0.05); w.shake(0.2, -dir, 0);
    return r;
  }
  e.hurtFlash = 1;
  if (!r.killed) addStagger(w, e, stagger || (heavy ? C.staggerHeavy * (full ? 1.5 : 1) : fromProc ? 0.5 : C.staggerPerHit));
  if (!fromProc) { w.combo++; w.comboT = 2.2; }
  M.onHit(w, e, r, { ...o, finisher, vertical, fromPlayer: !fromProc, src });
  const big = heavy || finisher || crit || r.killed;
  w.events.push({ t: 'hit', x: hx, y: hy, crit, dmg, e, dir, vertical, killed: r.killed, finisher, combo: w.combo });
  w.hitStop = Math.max(w.hitStop, r.killed ? 0.07 : big ? 0.055 : 0.035);
  w.shake(r.killed ? 0.35 : big ? 0.25 : 0.14, vertical ? 0 : dir, vertical);
  w.sfx(r.killed ? 'kill' : crit ? 'crit' : finisher ? 'hit3' : 'hit');
  if (r.killed) onKill(w, e);
  return r;
}

// Poise: hits fill a meter; when it fills the foe is staggered (helpless) for a moment.
// Bosses need more each time, so they can't be stagger-locked.
export function addStagger(w, e, amount) {
  if (!e.alive) return;
  e.poiseMax ||= poiseOf(e);
  if (e.staggerT > 0) return;
  e.poise = (e.poise || 0) + amount * (w.player.stats.staggerMul || 1);
  if (e.poise < e.poiseMax) return;
  e.poise = 0;
  const t = e.boss ? C.bossStaggerTime : C.staggerTime;
  e.staggerT = t; e.stunT = Math.max(e.stunT || 0, t);
  if (e.boss) e.poiseMax = Math.round(e.poiseMax * C.bossPoiseGrowth);
  w.events.push({ t: 'staggered', e }); w.sfx('break');
  M.onStagger?.(w, e);
}

function onKill(w, e) {
  const pl = w.player;
  pl.kills++;
  // ordinary foes sometimes drop a heart (1 mask); Hunger of the Void turns these off
  if (!e.boss && !e.elite && e.type !== 'dummy' && !pl.stats.noHealDrops && w.rng.chance(C.healDropChance))
    w.pickups.push({ x: e.x, y: e.y + e.h * 0.6, vx: 0, vy: 7, w: 0.4, h: 0.4, heart: true, value: 0, age: 0 });
  dropGold(w, e.x, e.y + e.h * 0.5, (ENEMY_TYPES[e.type]?.gold || 3));
  w.events.push({ t: 'kill', e });
  M.onKill(w, e);
  // brief slow-motion on big kills and on the last enemy nearby
  const othersNear = w.enemies.some((o) => o !== e && o.alive && Math.abs(o.x - pl.x) < 14 && Math.abs(o.y - pl.y) < 8);
  if (e.maxHp >= 5 || !othersNear) w.slowmo = Math.max(w.slowmo, e.boss ? 1.2 : 0.22);
  if (pl.stats.killsPerHeal) {
    pl.killsSinceHeal++;
    if (pl.killsSinceHeal >= pl.stats.killsPerHeal) { pl.killsSinceHeal = 0; pl.hp = Math.min(pl.stats.maxHp, pl.hp + 1); w.healFx(pl); }
  }
  if (e.boss) {
    w.bossDead = true; w.exit.open = true; w.shake(1);
    for (const o of w.enemies) if (o !== e && o.alive) { o.hp = 0; damageEnemy(o, 99, 1, w); }
    w.events.push({ t: 'bossDead', e });
    (w.bossesBeaten ||= []).push(e.type);
  }
}

function dropGold(w, x, y, amount) {
  // coins of value 1/5 so a drop feels generous
  let left = amount;
  while (left > 0) {
    const v = left >= 5 ? 5 : 1; left -= v;
    w.pickups.push({ x, y, vx: w.rng.range(-4, 4), vy: w.rng.range(5, 10), w: 0.3, h: 0.3, value: v, age: 0 });
  }
}

function openChest(w, c) {
  c.open = true;
  dropGold(w, c.x, c.y + 1, 15 + w.depth * 5 + w.rng.int(0, 10));
  w.events.push({ t: 'chest', c }); w.sfx('chest'); w.shake(0.2);
}

export function updateWorld(w, input, dt) {
  w.time += dt;
  w.shakeAmt = Math.max(0, w.shakeAmt - dt * 2.2);
  w.comboT -= dt; if (w.comboT <= 0) w.combo = 0;
  const pl = w.player;
  const stats = pl.stats;
  if (stats.hp !== undefined) { pl.hp = stats.hp; delete stats.hp; } // Iron Heart full heal

  if (w.hitStop > 0) { w.hitStop -= dt; return; }

  // hazard respawn: freeze, then return to last safe ground
  if (w.respawnTimer > 0) {
    w.respawnTimer -= dt;
    if (w.respawnTimer <= 0) {
      pl.x = pl.lastSafe.x; pl.y = pl.lastSafe.y; pl.vx = pl.vy = 0;
      w.events.push({ t: 'respawn', x: pl.x, y: pl.y });
    }
  } else if (w.descending > 0) { // riding the lift down: no control, then the next floor
    w.descending -= dt; pl.vx = 0; pl.vy = 0; pl.anim = 'idle';
    w.liftDrop = (1.8 - w.descending) * 2.4;
    if (w.descending <= 0 && !w.descended) { w.descended = true; if (w.isLastFloor) w.onVictory?.(); else w.onExit?.(); }
  } else {
    pl.atkMul = (M.weaponOf(stats).speedMul || 1) * (pl.atkFlow || 1);
    updatePlayer(pl, input, dt, w);
  }

  // enemies
  for (const e of w.enemies) {
    // Non-boss enemies only act while on screen: no attacks, chasing or contact damage from off-screen.
    if (!e.boss && !onScreen(w, e)) { e.offscreen = true; continue; }
    if (e.offscreen !== false && !e.boss) e.wakeT = 0.7; // just came into view: a beat to react before it acts
    e.offscreen = false;
    if (e.wakeT > 0) { e.wakeT -= dt; e.vx = 0; e.telegraph = 0; e.anim = e.flying ? 'fly' : 'idle'; if (!e.flying) { e.vy -= 46 * dt; moveBody(w.level, e, dt); } continue; }
    if (e.staggerT > 0) e.staggerT = Math.max(0, e.staggerT - dt);
    e.staggered = e.staggerT > 0;
    if (e.alive && (e.stunT > 0 || e.juggleT > 0)) { // stunned (mace, parry) or juggled: helpless
      e.stunT = Math.max(0, (e.stunT || 0) - dt); e.juggleT = Math.max(0, (e.juggleT || 0) - dt);
      e.vx *= 0.9; e.telegraph = 0; e.anim = 'hurt'; e.state = 'hurt'; e.timer = 0.2;
      if (!e.flying) { e.vy -= (e.juggleT > 0 ? 22 : 46) * dt; moveBody(w.level, e, dt); }
      e.hurtFlash = Math.max(0, (e.hurtFlash || 0) - dt * 6);
      continue;
    }
    updateEnemy(e, dt * (w.mods.enemySpeed || 1), w); // Vow of Haste speeds enemies up
    e.hurtFlash = Math.max(0, (e.hurtFlash || 0) - dt * 6);
    if (e.alive && e.contactDmg && !pl.dead && w.respawnTimer <= 0 && overlaps(shrink(e, 0.75), pl)) {
      damagePlayer(w, e.contactDmg, Math.sign(pl.x - e.x) || 1, e);
    }
    if (!e.flying && e.alive && tileAt(w.level, Math.floor(e.x), Math.floor(e.y + 0.1)) === T.LAVA) { e.hp = 1; hitEnemy(w, e, 99, 1, e); }
  }
  w.enemies = w.enemies.filter((e) => !e.remove);

  // enemy hitboxes
  for (const h of w.hitboxes) {
    h.ttl -= dt;
    if (!h.hit && !pl.dead && overlaps(h, pl)) { h.hit = true; damagePlayer(w, h.dmg, Math.sign(h.knockX || (pl.x - h.x)) || 1, h.src, true); }
  }
  w.hitboxes = w.hitboxes.filter((h) => h.ttl > 0);

  // projectiles
  for (const pr of w.projectiles) {
    if (!pr.alive) continue;
    pr.age += dt; pr.ttl -= dt;
    if (pr.homing && !pl.dead) { // slow turn toward the player; dodgeable by moving
      const want = Math.atan2(pl.y + 0.9 - pr.y, pl.x - pr.x), cur = Math.atan2(pr.vy, pr.vx);
      let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
      const a = cur + Math.max(-pr.homing * dt, Math.min(pr.homing * dt, d)), sp = Math.hypot(pr.vx, pr.vy);
      pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
    }
    pr.vy -= (pr.gravity || 0) * dt;
    const ox = pr.x, oy = pr.y;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (pr.fuse !== undefined) { // bombs bounce, then explode when the fuse runs out
      pr.fuse -= dt;
      if (pr.bounce && tileAt(w.level, Math.floor(pr.x), Math.floor(pr.y - pr.r)) === T.SOLID) {
        if (tileAt(w.level, Math.floor(pr.x), Math.floor(oy - pr.r)) === T.SOLID) { pr.x = ox; pr.vx *= -0.5; }
        else { pr.y = oy; pr.vy = Math.abs(pr.vy) > 2 ? -pr.vy * 0.45 : 0; pr.vx *= 0.7; }
      }
      if (pr.fuse <= 0 || pr.ttl <= 0) { explode(w, pr); continue; }
      continue;
    }
    if (pr.ground) { // shockwave hugs the floor
      let fy = Math.floor(pr.y);
      while (fy > 0 && tileAt(w.level, Math.floor(pr.x), fy - 1) !== T.SOLID && fy > pr.y - 3) fy--;
      pr.y = fy + 0.5;
    }
    if (pr.ttl <= 0) { pr.alive = false; continue; }
    if (pr.boomerang) {
      pr.out -= dt;
      if (pr.out <= 0) {
        const dx = pl.x - pr.x, dy = pl.y + 1 - pr.y, d = Math.hypot(dx, dy) || 1;
        pr.vx += (dx / d * 22 - pr.vx) * Math.min(1, dt * 6); pr.vy += (dy / d * 22 - pr.vy) * Math.min(1, dt * 6);
        if (!pr.returning) { pr.returning = true; pr.hitSet = new Set(); }
        if (d < 0.9) { pr.alive = false; continue; }
      }
      for (const e of w.enemies) if (e.alive && !pr.hitSet.has(e) && overlaps({ x: pr.x, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 }, e)) { pr.hitSet.add(e); hitEnemy(w, e, pr.dmg, Math.sign(pr.vx) || 1, pr, { fromProc: true }); }
      continue;
    }
    if (tileAt(w.level, Math.floor(pr.x), Math.floor(pr.y)) === T.SOLID) {
      pr.alive = false; w.events.push({ t: 'spark', x: pr.x, y: pr.y, color: pr.kind === 'bone' ? 0xe8dcc0 : 0xff8a3a }); continue;
    }
    const box = { x: pr.x, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 };
    if (pr.owner === 'enemy') {
      if (!pl.dead && overlaps(box, pl)) { pr.alive = false; damagePlayer(w, pr.dmg, Math.sign(pr.vx) || 1, pr.src, true); }
    } else {
      for (const e of w.enemies) {
        if (e.alive && !pr.hitSet.has(e) && overlaps(box, e)) {
          pr.hitSet.add(e); hitEnemy(w, e, pr.dmg, Math.sign(pr.vx) || 1, pr, { fromProc: !!pr.fromProc, heavy: !!pr.heavy, full: pr.full, perfect: pr.perfect,
            weaponHit: pr.weaponHit, ignite: pr.ignite, hook: pr.hook, launch: pr.launch, spectral: pr.spectral });
          if (!pr.pierce) { pr.alive = false; break; }
        }
      }
    }
  }
  w.projectiles = w.projectiles.filter((pr) => pr.alive);
  M.tick(w, dt);

  // saw traps ping-pong along their path
  for (const s of w.saws) {
    const len = Math.max(0.01, Math.hypot(s.x1 - s.x0, s.y1 - s.y0));
    s.t += (s.speed / len) * dt;
    const k = 0.5 - 0.5 * Math.cos(s.t * Math.PI);
    s.x = s.x0 + (s.x1 - s.x0) * k; s.y = s.y0 + (s.y1 - s.y0) * k;
    s.angle += dt * 14;
    if (!pl.dead && w.respawnTimer <= 0 && Math.abs(pl.x - s.x) < s.r + pl.w / 2 - 0.15 && pl.y < s.y + s.r - 0.1 && pl.y + pl.h > s.y - s.r + 0.1) {
      damagePlayer(w, 1, Math.sign(pl.x - s.x) || 1);
    }
  }

  // gold
  for (const c of w.pickups) {
    c.age += dt;
    const dx = pl.x - c.x, dy = pl.y + 0.8 - c.y, d = Math.hypot(dx, dy);
    if (c.age > 0.45 && d < 3.5 && !pl.dead) {
      c.vx += (dx / d) * 60 * dt; c.vy += (dy / d) * 60 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= 0.92; c.vy *= 0.92;
    } else {
      c.vy -= 30 * dt; moveBody(w.level, c, dt);
      if (c.onGround) c.vx *= 0.85;
    }
    if (d < 0.7 && c.age > 0.3) {
      c.taken = true;
      if (c.heart) { pl.hp = Math.min(pl.stats.maxHp, pl.hp + 1); w.healFx(pl); }
      else { pl.gold += c.value; w.events.push({ t: 'coin', x: c.x, y: c.y }); w.sfx('coin'); }
    }
  }
  w.pickups = w.pickups.filter((c) => !c.taken);

  for (const c of w.chests) if (c.open) c.openT = Math.min(1, c.openT + dt * 3);

  // tutorial tips: fire once when the player enters a lesson area
  for (const tp of w.tips || []) {
    const inside = pl.x >= tp.x0 && pl.x < tp.x1 && pl.y + 0.5 >= tp.y0 && pl.y + 0.5 < tp.y1;
    if (inside && w.activeTip !== tp.id) { w.activeTip = tp.id; w.events.push({ t: 'tip', id: tp.id }); }
  }
  // interactables: shrine / chest / exit
  w.prompt = null;
  if (!pl.dead && pl.onGround) {
    for (const s of w.shrines) {
      if (!s.used && Math.abs(pl.x - s.x) < 1.8 && Math.abs(pl.y - s.y) < 1.5) w.prompt = { kind: 'shrine', label: 'Pray', target: s };
    }
    for (const c of w.chests) {
      if (!c.open && Math.abs(pl.x - c.x) < 1.6 && Math.abs(pl.y - c.y) < 1.5) w.prompt = { kind: 'chest', label: 'Open', target: c };
    }
    if (w.merchant && Math.abs(pl.x - w.merchant.x) < 1.8 && Math.abs(pl.y - w.merchant.y) < 1.5) w.prompt = { kind: 'shop', label: 'Trade' };
    for (const d of w.weaponDrops) {
      if (Math.abs(pl.x - d.x) < 1.3 && Math.abs(pl.y - d.y) < 1.6) {
        const wp = (WEAPONS || []).find((x) => x.id === d.id);
        w.prompt = { kind: 'weapon', label: 'Take ' + (wp ? wp.name : d.id), target: d };
      }
    }
    // descend only by standing on the lift (no remote prompt, no skipping)
    const L = w.lift, onLift = Math.abs(pl.x - L.x) < L.w / 2 && Math.abs(pl.y - L.y) < 0.7;
    if (onLift && !w.exit.open) w.prompt = { kind: 'locked', label: 'Sealed — defeat the guardian' };
    if (onLift && w.exit.open && !w.descending) {
      w.descending = 1.8; w.liftDrop = 0; pl.x = L.x; pl.state = 'move';
      w.events.push({ t: 'descend', x: L.x, y: L.y }); w.sfx('door');
    }
  }
  if (w.prompt && (input.interactPressed || (input.upPressed && w.prompt.kind !== 'locked'))) {
    const pr = w.prompt;
    if (pr.kind === 'shrine') { pr.target.used = true; w.events.push({ t: 'shrine', s: pr.target }); w.onShrine?.(pr.target); }
    else if (pr.kind === 'chest') openChest(w, pr.target);
    else if (pr.kind === 'shop') w.onShop?.(w.merchant);
    else if (pr.kind === 'weapon') { // swap: your old weapon stays on the altar
      const old = stats.weapon || 'sword';
      equipWeapon(stats, pr.target.id); pr.target.id = old;
      w.events.push({ t: 'weaponSwap', x: pr.target.x, y: pr.target.y, id: stats.weapon }); w.sfx('chest');
    }
    w.prompt = null;
  }
}

function explode(w, pr) {
  pr.alive = false;
  const pl = w.player, R = pr.radius || 1.6;
  if (pr.owner === 'player') {
    for (const e of w.enemies) if (e.alive && Math.hypot(e.x - pr.x, e.y + e.h / 2 - pr.y) < R + 0.5) hitEnemy(w, e, 4, Math.sign(e.x - pr.x) || 1, pr, { fromProc: true });
  } else {
    const d = Math.hypot(pl.x - pr.x, pl.y + 0.85 - pr.y);
    if (!pl.dead && d < R + 0.45) damagePlayer(w, pr.dmg, Math.sign(pl.x - pr.x) || 1);
  }
  w.events.push({ t: 'explode', x: pr.x, y: pr.y, r: R });
  w.shake(0.45); w.sfx('slam');
}

function damagePlayer(w, dmg, dir, src, attack = false) {
  const pl = w.player;
  if (attack && pl.state === 'dash' && pl.stateTime <= C.perfectDodgeWindow && !pl.dead) { perfectDodge(w, src); return; }
  if (M.preventHurt(w, dir, src)) return; // parry / ward
  if (!hurtPlayer(pl, dmg, dir, w)) return;
  if (pl.dead) M.tryRevive(w);
  w.hitStop = 0.05; w.shake(0.45, dir, 0.4); w.combo = 0;
  w.events.push({ t: 'hurt', x: pl.x, y: pl.y + 1 });
  w.sfx('hurt');
  if (src && src.alive && pl.stats.thorns) hitEnemy(w, src, pl.stats.thorns, -dir, pl);
}

// A dodge timed into an enemy attack: brief slow-motion, the dash refreshes and the next attack counters.
function perfectDodge(w, src) {
  const pl = w.player;
  if (pl.perfectThisDash) return;
  pl.perfectThisDash = true;
  pl.counterT = C.counterWindow; pl.dashLeft = pl.stats.dashes; pl.dashCd = 0;
  pl.invuln = Math.max(pl.invuln, 0.3);
  w.slowmo = Math.max(w.slowmo, 0.35);
  w.events.push({ t: 'perfectDodge', x: pl.x, y: pl.y }); w.sfx('parry');
  M.onPerfectDodge?.(w, pl, src);
}

// w.viewRect is set by the renderer each frame ({x0,x1,y0,y1} in world units); without a view, use distance.
function onScreen(w, e) {
  const v = w.viewRect;
  if (!v) return Math.abs(e.x - w.player.x) < 12 && Math.abs(e.y - w.player.y) < 7;
  return e.x + e.w / 2 > v.x0 && e.x - e.w / 2 < v.x1 && e.y + e.h > v.y0 && e.y < v.y1;
}

// Doorways = open tiles on a room's boundary. Enemies spawned within reach of one are moved deeper into
// their room, so stepping through a door never lands you on top of a fight.
function clearEntrances(w) {
  const L = w.level, at = (x, y) => (x < 0 || y < 0 || x >= L.w || y >= L.h ? T.SOLID : L.tiles[y * L.w + x]);
  const doors = [];
  for (const r of L.rooms || []) {
    for (let y = r.y; y < r.y + r.h; y++) for (const x of [r.x, r.x + r.w - 1]) if (at(x, y) !== T.SOLID) doors.push([x + 0.5, y]);
    for (let x = r.x; x < r.x + r.w; x++) for (const y of [r.y, r.y + r.h - 1]) if (at(x, y) !== T.SOLID) doors.push([x + 0.5, y]);
  }
  doors.push([L.spawn.x, L.spawn.y]);
  const nearDoor = (x, y, d) => doors.some(([dx, dy]) => Math.abs(dx - x) < d && Math.abs(dy - y) < 3.5);
  const standable = (x, y) => at(x, y) !== T.SOLID && at(x, y + 1) !== T.SOLID && (at(x, y - 1) === T.SOLID || at(x, y - 1) === T.PLATFORM)
    && at(x, y) !== T.SPIKES && at(x, y) !== T.LAVA && at(x, y - 1) !== T.SPIKES;
  for (const e of w.enemies) {
    if (e.boss || !nearDoor(e.x, e.y, 5)) continue;
    const room = (L.rooms || []).find((r) => e.x >= r.x && e.x < r.x + r.w && e.y >= r.y && e.y < r.y + r.h);
    if (!room) continue;
    let best = null, bestD = Infinity;
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (e.flying ? at(x, y) !== T.EMPTY : !standable(x, y)) continue;
      if (nearDoor(x + 0.5, y, 6.5) || w.enemies.some((o) => o !== e && Math.abs(o.x - x - 0.5) < 1.5 && Math.abs(o.y - y) < 2)) continue;
      const d = Math.abs(x + 0.5 - e.x) + Math.abs(y - e.y) * 0.5;
      if (d < bestD) { bestD = d; best = [x + 0.5, y]; }
    }
    if (best) { e.x = best[0]; e.y = best[1]; e.homeX = e.x; e.homeY = e.y; }
  }
}

function shrink(e, k) { return { x: e.x, y: e.y + e.h * (1 - k) * 0.5, w: e.w * k, h: e.h * k }; }

export { PLAYER };
