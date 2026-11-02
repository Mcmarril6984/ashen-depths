// Blessing and weapon mechanics. Every blessing changes how you play (no flat stat boosts).
// world.js calls these hooks; flags come from stats (see upgrades.js / COLLAB.md contract).
import * as UP from './upgrades.js';
import { overlaps, tileAt, isSolid } from './physics.js';
import { T } from './constants.js';

const DEFAULT_WEAPON = { id: 'sword', name: 'Sword', piece: 'sword', dmgMul: 1, speedMul: 1, reach: 1, knock: 1, special: null };
export function weaponOf(stats) {
  return (UP.WEAPONS || []).find((w) => w.id === stats.weapon) || DEFAULT_WEAPON;
}

const ev = (w, o) => w.events.push(o);
const near = (w, x, y, r, skip) => w.enemies.filter((e) => e.alive && e !== skip && Math.hypot(e.x - x, e.y + e.h / 2 - y) < r);

function pproj(w, o) {
  w.projectiles.push({ owner: 'player', alive: true, age: 0, gravity: 0, hitSet: new Set(), pierce: true, ...o });
}

// ---- damage shaping -----------------------------------------------------------------------------
export function shapeDamage(w, e, base, { fromPlayer = true } = {}) {
  const pl = w.player, st = pl.stats;
  let dmg = base, crit = false, execute = false;
  if (fromPlayer) {
    crit = w.rng.next() < (st.critChance || 0) || (st.lastStand && pl.hp === 1) || pl.nextCrit;
    pl.nextCrit = false;
    if (e.marked) { dmg *= 2; e.marked = false; ev(w, { t: 'markpop', x: e.x, y: e.y + e.h }); }
    if (st.execute && e.executable && !e.boss) { dmg = Math.max(dmg, e.hp); execute = true; }
  }
  if (crit) dmg *= 2;
  return { dmg: Math.max(1, Math.round(dmg)), crit, execute };
}

// ---- on hit / kill --------------------------------------------------------------------------------
export function onHit(w, e, r, { finisher, vertical, fromPlayer, src }) {
  if (!fromPlayer || r.blocked) return;
  const pl = w.player, st = pl.stats, wp = weaponOf(st);
  // bleed: from Serrated Edge or the Cleaver Axe; 3 stacks burst
  const hadBleed = (e.bleed || 0) > 0;
  if (st.bleedBurst || wp.special === 'bleed') addBleed(w, e);
  // Blood Echo: a finisher on a bleeding foe spreads one stack to everyone close by (no recursion)
  if (st.bloodEcho && finisher && hadBleed && !w._echoThisSwing) {
    w._echoThisSwing = true;
    for (const o of near(w, e.x, e.y + e.h / 2, 3, e)) addBleed(w, o);
  }
  // Aerial Fuse: up-slashing a burning foe detonates its burn
  if (st.aerialFuse && vertical === 1 && e.burnT > 0 && !(e.fuseCd > 0)) {
    e.burnT = 0; e.fuseCd = 2;
    ev(w, { t: 'explode', x: e.x, y: e.y + e.h * 0.6, r: 3, friendly: true }); w.sfx('slam'); w.shake(0.3);
    for (const o of [e, ...near(w, e.x, e.y + e.h / 2, 3, e)]) w._hit(o, 2, Math.sign(o.x - e.x) || 1, e, { fromProc: true });
  }
  if (st.ignite && e.alive) e.burnT = 3;
  if (pl.rageT > 0) { // Rage Draught: every hit bursts
    ev(w, { t: 'explode', x: e.x, y: e.y + e.h * 0.5, r: 1.3, friendly: true });
    for (const o of near(w, e.x, e.y + e.h / 2, 1.5, e)) w._hit(o, 1, Math.sign(o.x - e.x) || 1, e, { fromProc: true });
  }
  if (st.stormEvery) {
    w.stormCount = (w.stormCount || 0) + 1;
    if (w.stormCount % st.stormEvery === 0) lightning(w, e);
  }
  if (st.juggle && vertical === 1 && e.alive && !e.boss && !e.armored && e.type !== 'crystal_turret') { e.vy = 13; e.juggleT = 0.8; }
  if (finisher && wp.special === 'stun' && e.alive && !e.boss) { e.stunT = 1.2; ev(w, { t: 'stun', e }); }
}

function addBleed(w, e) {
  if (!e.alive) return;
  e.bleed = (e.bleed || 0) + 1; e.bleedT = 4;
  if (e.bleed < 3) return;
  e.bleed = 0;
  ev(w, { t: 'bleedburst', x: e.x, y: e.y + e.h * 0.5 });
  w.sfx('kill');
  // Cinder Blood: the burst sets everything nearby alight
  if (w.player.stats.cinderBlood) for (const o of [e, ...near(w, e.x, e.y + e.h / 2, 3, e)]) o.burnT = Math.max(o.burnT || 0, 3);
  for (const o of [e, ...near(w, e.x, e.y + e.h / 2, 1.8, e)]) w._hit(o, 3, Math.sign(o.x - e.x) || 1, e, { fromProc: true });
}

function lightning(w, from) {
  const pts = [{ x: from.x, y: from.y + from.h * 0.6 }];
  const hit = new Set([from]);
  let cur = from;
  for (let i = 0; i < 3; i++) {
    const next = near(w, cur.x, cur.y + cur.h / 2, 6).filter((e) => !hit.has(e)).sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x))[0];
    if (!next) break;
    hit.add(next); pts.push({ x: next.x, y: next.y + next.h * 0.6 }); cur = next;
  }
  if (w.player.stats.stormBrand) {
    const branded = [...hit].find((e) => e.marked);
    if (branded) {
      branded.marked = false;
      const extra = near(w, branded.x, branded.y + branded.h / 2, 5).find((e) => !hit.has(e));
      if (extra) { hit.add(extra); pts.push({ x: extra.x, y: extra.y + extra.h * 0.6 }); }
    }
  }
  ev(w, { t: 'lightning', pts }); w.sfx('crit');
  for (const e of hit) w._hit(e, 2, 1, e, { fromProc: true });
}

export function onKill(w, e) {
  const pl = w.player, st = pl.stats;
  if (e.burnT > 0) { // burning foes explode, which can ignite and kill the next one
    ev(w, { t: 'explode', x: e.x, y: e.y + e.h * 0.5, r: 2.2, friendly: true });
    w.shake(0.35); w.sfx('slam');
    for (const o of near(w, e.x, e.y + e.h / 2, 2.4, e)) { if (st.ignite) o.burnT = 3; w._hit(o, 3, Math.sign(o.x - e.x) || 1, e, { fromProc: true }); }
  }
  if (st.soulHarvest) w.souls.push({ x: e.x, y: e.y + e.h * 0.6, vy: 2, age: 0 });
  if (st.bloodlust) { pl.dashLeft = st.dashes; pl.jumpsUsed = 0; pl.invuln = Math.max(pl.invuln, 0.6); ev(w, { t: 'bloodlust', x: pl.x, y: pl.y }); }
}

// ---- per-frame ------------------------------------------------------------------------------------
export function tick(w, dt) {
  const pl = w.player, st = pl.stats;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick = (e.burnTick || 0) - dt;
      if (e.burnTick <= 0) { e.burnTick = 0.6; w._hit(e, 1, 0, e, { fromProc: true, quiet: true }); }
    }
    if (e.bleedT > 0) { e.bleedT -= dt; if (e.bleedT <= 0) e.bleed = 0; }
    e.executable = !!st.execute && !e.boss && e.hp > 0 && e.hp / e.maxHp < 0.2;
  }
  // ember trail: burning segments left by the dash
  for (const s of w.trails) {
    s.ttl -= dt;
    for (const e of w.enemies) if (e.alive && !e.flying && Math.abs(e.x - s.x) < 0.7 && Math.abs(e.y - s.y) < 1) {
      if (!(e.trailCd > 0)) { e.trailCd = 0.5; e.burnT = Math.max(e.burnT || 0, 2); }
    }
  }
  for (const e of w.enemies) if (e.trailCd > 0) e.trailCd -= dt;
  w.trails = w.trails.filter((s) => s.ttl > 0);
  if (pl.rageT > 0) pl.rageT -= dt;
  if (pl.onGround) pl.slipArmed = false;
  if (w.clapCd > 0) w.clapCd -= dt;
  for (const e of w.enemies) if (e.fuseCd > 0) e.fuseCd -= dt;
  // ward recharge
  if (st.ward) { if (!pl.wardReady) { pl.wardT = (pl.wardT ?? 0) + dt; if (pl.wardT >= st.ward) { pl.wardReady = true; ev(w, { t: 'wardup', x: pl.x, y: pl.y }); } } }
  // soul orbs float up, then home in
  for (const s of w.souls) {
    s.age += dt;
    const dx = pl.x - s.x, dy = pl.y + 1 - s.y, d = Math.hypot(dx, dy) || 1;
    if (s.age < 0.5) s.y += s.vy * dt; else { s.x += (dx / d) * 9 * dt; s.y += (dy / d) * 9 * dt; }
    if (d < 0.6) {
      s.taken = true; pl.souls = (pl.souls || 0) + 1; ev(w, { t: 'soul', x: s.x, y: s.y });
      if (pl.souls >= 3) { pl.souls = 0; pl.hp = Math.min(st.maxHp, pl.hp + 1); w.healFx(pl); }
    }
  }
  w.souls = w.souls.filter((s) => !s.taken);
  // dagger flurry: queued extra cuts after the finisher
  for (const f of w.flurry) { f.t -= dt; if (f.t <= 0) { f.done = true; w.playerSwing(pl, { extra: true }); } }
  w.flurry = w.flurry.filter((f) => !f.done);
}

// ---- swing extras ---------------------------------------------------------------------------------
export function onSwing(w, pl, { finisher, extra }) {
  const st = pl.stats, wp = weaponOf(st);
  const dmg = Math.max(1, Math.round(st.dmg * wp.dmgMul));
  if (finisher && !extra) {
    if (wp.special === 'flurry') { w.flurry.push({ t: 0.09 }, { t: 0.18 }, { t: 0.27 }); }
    if (wp.special === 'quake') {
      for (const dir of [-1, 1]) pproj(w, { kind: 'wave', x: pl.x + dir * 0.8, y: pl.y + 0.5, vx: dir * 12, vy: 0, r: 0.6, dmg: dmg + 1, ttl: 0.6, ground: true });
      w.shake(0.5); w.sfx('slam');
    }
    if (st.bladeReturn) {
      pproj(w, { kind: 'blade', piece: wp.piece, x: pl.x + pl.facing, y: pl.y + 1.1, vx: pl.facing * 17, vy: 0, r: 0.6, dmg, ttl: 2.2, boomerang: true, out: 0.35 });
      w.sfx('swing');
    }
  }
  if (st.windBlades && w.combo >= 8 && pl.attackDir === 'side') {
    pproj(w, { kind: 'windblade', x: pl.x + pl.facing * 1.2, y: pl.y + 1, vx: pl.facing * 19, vy: 0, r: 0.45, dmg: Math.max(1, Math.round(dmg * 0.7)), ttl: 0.5 });
  }
}

export function reflect(w, pr) {
  pr.owner = 'player'; pr.vx = -pr.vx * 1.3; pr.vy = -pr.vy * 0.6 + 2; pr.homing = 0;
  pr.hitSet = new Set(); pr.pierce = false; pr.dmg = Math.max(2, pr.dmg * 2); pr.ttl = Math.max(pr.ttl, 1.5);
  ev(w, { t: 'deflect', x: pr.x, y: pr.y });
}

// ---- movement hooks -------------------------------------------------------------------------------
export function onDashStart(w, pl) {
  const st = pl.stats;
  pl.dashMarked = new Set();
  if (st.slipstream && !pl.onGround) pl.slipArmed = true;
  if (!st.shadowStep) return;
  const dir = pl.facing;
  const target = w.enemies.filter((e) => e.alive && !e.boss && Math.sign(e.x - pl.x) === dir && Math.abs(e.x - pl.x) < 5.5 && Math.abs(e.y - pl.y) < 2)
    .sort((a, b) => Math.abs(a.x - pl.x) - Math.abs(b.x - pl.x))[0];
  if (!target) return;
  const nx = target.x + dir * (target.w / 2 + 0.7);
  const clear = !isSolid(w.level, Math.floor(nx), Math.floor(pl.y + 0.2)) && !isSolid(w.level, Math.floor(nx), Math.floor(pl.y + 1.5));
  if (!clear) return;
  ev(w, { t: 'blink', x: pl.x, y: pl.y });
  pl.x = nx; pl.facing = -dir; pl.dashDir = -dir;
  ev(w, { t: 'blink', x: pl.x, y: pl.y });
  if (st.phantomDash) target.marked = true;
}

export function dashTick(w, pl) {
  const st = pl.stats;
  if (st.dashDamage) w.dashDamage(pl);
  if (st.phantomDash) for (const e of w.enemies) if (e.alive && !pl.dashMarked.has(e) && overlaps(pl, e)) { pl.dashMarked.add(e); e.marked = true; ev(w, { t: 'mark', e }); }
  if (st.dashTrail && pl.onGround !== undefined) {
    const last = w.trails[w.trails.length - 1];
    if (!last || Math.abs(last.x - pl.x) > 0.6) w.trails.push({ x: pl.x, y: pl.y, ttl: 1.6 });
  }
}

export function onPogo(w, pl, target) {
  const st = pl.stats;
  if (st.slipstream && pl.slipArmed) {
    pl.slipArmed = false;
    const dmg = Math.max(1, Math.round(st.dmg * weaponOf(st).dmgMul * 0.7));
    for (const dir of [-1, 1]) pproj(w, { kind: 'windblade', x: pl.x + dir, y: pl.y + 0.6, vx: dir * 19, vy: 0, r: 0.45, dmg, ttl: 0.5 });
  }
  if (st.thunderClap && target?.alive && w.combo >= 8 && !(w.clapCd > 0)) {
    w.clapCd = 2;
    ev(w, { t: 'lightning', pts: [{ x: target.x, y: target.y + 6 }, { x: target.x, y: target.y + target.h * 0.6 }] }); w.sfx('crit');
    w._hit(target, 2, 0, target, { fromProc: true });
  }
  if (!st.pogoWave) return;
  for (const dir of [-1, 1]) pproj(w, { kind: 'wave', x: pl.x + dir * 0.6, y: pl.y - 1, vx: dir * 10, vy: 0, r: 0.5, dmg: 2, ttl: 0.45 });
  pl.dashLeft = pl.stats.dashes;
}

export function onFlask(w, pl) {
  // flask types chosen in the Hearth loadout
  if (pl.stats.flaskType === 'rage_flask') { pl.rageT = 5; ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 2.2, color: 0xff6a2a }); }
  if (pl.stats.flaskType === 'ward_flask') { pl.tonicWard = true; ev(w, { t: 'wardup', x: pl.x, y: pl.y }); }
  if (!pl.stats.flaskNova) return;
  ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 3.2, color: 0x6aff9a });
  w.shake(0.4);
  for (const e of near(w, pl.x, pl.y + 1, 3.4)) { if (!e.boss && !e.armored) { e.vx = Math.sign(e.x - pl.x) * 12; e.vy = 6; } w._hit(e, 2, Math.sign(e.x - pl.x) || 1, pl, { fromProc: true }); }
}

// ---- defence --------------------------------------------------------------------------------------
// Returns true if the hit was prevented (parry or ward).
export function preventHurt(w, dir, src) {
  const pl = w.player, st = pl.stats;
  if (pl.invuln > 0 || pl.dead) return false;
  if (st.riposte && pl.state === 'attack' && pl.stateTime < 0.18) {
    pl.nextCrit = true; pl.invuln = 0.35;
    if (src && src.alive && !src.boss) src.stunT = 1.5;
    ev(w, { t: 'parry', x: pl.x + pl.facing * 0.6, y: pl.y + 1.1 });
    w.hitStop = 0.12; w.shake(0.3); w.sfx('parry'); w.slowmo = Math.max(w.slowmo, 0.25);
    return true;
  }
  if ((st.ward && pl.wardReady) || pl.tonicWard) {
    if (pl.tonicWard) pl.tonicWard = false; else { pl.wardReady = false; pl.wardT = 0; }
    pl.invuln = 0.5;
    ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 3, color: 0x8ac8ff });
    w.shake(0.35); w.sfx('block');
    for (const e of near(w, pl.x, pl.y + 1, 3.2)) { if (!e.boss && !e.armored) { e.vx = Math.sign(e.x - pl.x) * 10; e.vy = 5; } w._hit(e, 2, Math.sign(e.x - pl.x) || 1, pl, { fromProc: true }); }
    return true;
  }
  return false;
}

export function tryRevive(w) {
  const pl = w.player, st = pl.stats;
  if (!pl.dead || !(st.revives > 0)) return false;
  st.revives--;
  pl.dead = false; pl.hp = Math.max(1, Math.ceil(st.maxHp / 2)); pl.invuln = 2; pl.state = 'move'; pl.stateTime = 0;
  ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 4.5, color: 0xff8a3a }); ev(w, { t: 'revive', x: pl.x, y: pl.y });
  w.shake(0.8); w.slowmo = Math.max(w.slowmo, 0.6); w.sfx('boss');
  for (const e of near(w, pl.x, pl.y + 1, 4.6)) { e.burnT = 3; w._hit(e, 4, Math.sign(e.x - pl.x) || 1, pl, { fromProc: true }); }
  return true;
}

export { tileAt, T };
