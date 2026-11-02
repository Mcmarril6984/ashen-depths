// The eight weapons of the 3.1 rework: data plus move-set behaviour. One weapon per run (chosen in the Hearth).
// world.js / mechanics.js call the hooks below. Procs always pass { fromProc: true } so they never re-trigger hits.
import { COMBAT as C } from './constants.js';

export const STARTER_WEAPON = 'cinderwake';

// dmgMul/speedMul/reach/knock as before; combo = hits per combo; stagger = poise multiplier;
// charge = charge-time multiplier (bigger = slower); piece/offhand = models; ranged = attacks fire arrows.
export const WEAPON_DEFS = [
  { id: 'cinderwake', name: 'Cinderwake', kind: 'Ashen Greatsword', icon: '🔥', piece: 'sword_large', rarity: 'common',
    dmgMul: 1.6, speedMul: 0.72, reach: 1.3, knock: 1.4, combo: 3, stagger: 1.4, charge: 1.25,
    desc: 'Slow, sweeping blows. The third hit sends a flame wave; a perfect heavy on a burning foe makes it explode.',
    weakness: 'Long recovery' },
  { id: 'bloodletter', name: 'Bloodletter', kind: 'Twin Ritual Daggers', icon: '🗡️', piece: 'sword_small', offhand: 'sword_small', rarity: 'common',
    dmgMul: 0.6, speedMul: 1.55, reach: 0.8, knock: 0.6, combo: 5, stagger: 0.5, charge: 0.8,
    desc: 'Five quick cuts that bleed. Down-slashes punish bleeding foes; the heavy is a dashing stab; dodge through a foe to empower a backstab.',
    weakness: 'Short reach, little stagger' },
  { id: 'mourning_reaper', name: 'Mourning Reaper', kind: 'Spectral Scythe', icon: '🌙', piece: 'scythe', rarity: 'rare',
    dmgMul: 1.05, speedMul: 0.9, reach: 1.45, knock: 1, combo: 3, stagger: 1, charge: 1,
    desc: 'Wide sweeps ending in a rising slash. Heavies release spectral crescents; kills gather souls, and five souls empower the next heavy.',
    weakness: 'Weak single-target without souls' },
  { id: 'gravehook', name: 'Gravehook', kind: 'Chain Sickle', icon: '⛓️', piece: 'sickle', rarity: 'rare',
    dmgMul: 0.9, speedMul: 1.05, reach: 1, knock: 0.8, combo: 4, stagger: 0.8, charge: 0.9,
    desc: 'Short cuts alternate with long chain lashes. The heavy throws a hook: light foes are dragged to you, you are pulled to heavy ones. A hook empowers your next aerial attack.',
    weakness: 'Misses are punished' },
  { id: 'oathbreaker', name: 'Oathbreaker', kind: 'Ancient Warhammer', icon: '🔨', piece: 'hammer', rarity: 'rare',
    dmgMul: 1.9, speedMul: 0.6, reach: 1.15, knock: 1.8, combo: 3, stagger: 2, charge: 1.35,
    desc: 'Crushing three-hit combo. Heavies crack the ground and launch small foes; repeated heavies fracture armour.',
    weakness: 'Very slow' },
  { id: 'hollowpoint', name: 'Hollowpoint', kind: "Duelist's Rapier", icon: '🤺', piece: 'rapier', rarity: 'epic',
    dmgMul: 0.85, speedMul: 1.3, reach: 1.35, knock: 0.7, combo: 4, stagger: 0.7, charge: 0.85, narrow: true,
    desc: 'Narrow thrusts. Consecutive hits build Focus (crit chance); a miss loses it. After a perfect dodge your next thrust is a critical counter.',
    weakness: 'Poor crowd coverage' },
  { id: 'wraithstring', name: 'Wraithstring', kind: 'Spirit Bow', icon: '🏹', piece: 'bow', rarity: 'epic',
    dmgMul: 0.8, speedMul: 1.15, reach: 1, knock: 0.5, combo: 3, stagger: 0.6, charge: 1, ranged: true,
    desc: 'Shoots arrows (aim with up/down). Charged arrows pierce; charging in the air slows your fall; every third hit in a row looses a spectral arrow.',
    weakness: 'Exposed while charging' },
  { id: 'ashen_fists', name: 'Ashen Fists', kind: 'Emberforged Gauntlets', icon: '👊', piece: 'gauntlet', offhand: 'gauntlet', rarity: 'common',
    dmgMul: 0.55, speedMul: 1.75, reach: 0.65, knock: 0.6, combo: 4, stagger: 0.7, charge: 0.75,
    desc: 'Rapid punches; each hit in a chain speeds you up. The heavy is an uppercut that launches small foes, empowered after a perfect dodge.',
    weakness: 'Tiny reach' },
];

// Evolutions: weapon + two blessings. They take no slot and switch off while a needed blessing is out of its slot.
export const EVOLUTIONS = [
  { id: 'worldpyre', weapon: 'cinderwake', needs: ['ashen_brand', 'final_judgment'], name: 'Worldpyre', icon: '🌋', desc: 'Charged attacks send a great flame wave and leave the ground burning.' },
  { id: 'red_harvest', weapon: 'bloodletter', needs: ['rupture', 'ghostwalk'], name: 'Red Harvest', icon: '🩸', desc: 'Killing a bleeding foe raises a blood shade that fights with you.' },
  { id: 'funeral_procession', weapon: 'mourning_reaper', needs: ['soul_rend', 'executioners_mercy'], name: 'Funeral Procession', icon: '⚰️', desc: 'Spending souls unleashes a procession of five spectral slashes.' },
  { id: 'iron_tempest', weapon: 'gravehook', needs: ['shadow_pursuit', 'endless_ascent'], name: 'Iron Tempest', icon: '🌪️', desc: 'A landed hook whirls your chain, striking everything around you.' },
  { id: 'ruinmaker', weapon: 'oathbreaker', needs: ['final_judgment', 'stonebound'], name: 'Ruinmaker', icon: '🏚️', desc: 'Charged strikes send a second aftershock and spread armour fractures.' },
  { id: 'perfect_thesis', weapon: 'hollowpoint', needs: ['reversal', 'relentless_edge'], name: 'Perfect Thesis', icon: '📜', desc: 'Counters at full Focus expose a weak point: +50% damage to that foe for 4 s.' },
  { id: 'ghost_choir', weapon: 'wraithstring', needs: ['soul_rend', 'featherless_wings'], name: 'Ghost Choir', icon: '🎶', desc: 'Charged arrows mark foes; a spectral volley follows a moment later.' },
  { id: 'meteor_knuckles', weapon: 'ashen_fists', needs: ['skybreaker', 'falling_star'], name: 'Meteor Knuckles', icon: '☄️', desc: 'Uppercuts ignite, and aerial finishers explode.' },
];
// Re-check after any blessing change. Returns the evolution that just turned on, if any.
export function updateEvolution(stats) {
  const evo = EVOLUTIONS.find((e) => e.weapon === stats.weapon && e.needs.every((n) => stats.bless?.[n]));
  const before = stats.evolved;
  stats.evolved = evo?.id || null;
  return evo && evo.id !== before ? evo : null;
}
const evolved = (pl, id) => pl.stats.evolved === id;

export const weaponDef = (id) => WEAPON_DEFS.find((w) => w.id === id) || WEAPON_DEFS[0];
const ev = (w, o) => w.events.push(o);
const minor = (e) => !e.boss && !e.armored && !e.elite && e.maxHp <= 5;
const bleeding = (e) => (e.bleed || 0) > 0 || e.bleedT > 0;
function proj(w, o) { w.projectiles.push({ owner: 'player', alive: true, age: 0, gravity: 0, hitSet: new Set(), pierce: false, ...o }); }
const baseDmg = (pl, wp, mul = 1) => Math.max(1, Math.round(pl.stats.dmg * wp.dmgMul * mul));

// ---- primary swing: return { skip } to replace the melee box, { box } to reshape it, { mul } to scale damage ----
export function weaponSwing(w, pl, { finisher }) {
  const wp = weaponDef(pl.stats.weapon), out = {};
  switch (wp.id) {
    case 'wraithstring': {
      const aim = pl.attackDir === 'up' ? 1 : pl.attackDir === 'down' ? -1 : 0;
      const sp = 24, vx = aim ? pl.facing * sp * 0.5 : pl.facing * sp, vy = aim * sp * 0.87;
      proj(w, { kind: 'arrow', x: pl.x + pl.facing * 0.6, y: pl.y + 1.15, vx, vy, r: 0.25, dmg: baseDmg(pl, wp), ttl: 0.9, weaponHit: true });
      w.sfx('swing'); out.skip = true; break;
    }
    case 'gravehook': // even hits are long chain lashes
      if (pl.combo % 2 === 0 && pl.attackDir === 'side') out.box = { x: pl.x + pl.facing * 2.4, y: pl.y + 0.5, w: 4.2, h: 0.9 };
      break;
    case 'hollowpoint':
      if (pl.attackDir === 'side') out.box = { x: pl.x + pl.facing * 1.55, y: pl.y + 0.55, w: 2.7, h: 0.9 };
      if (!pl.onGround && pl.attackDir === 'side') pl.vx = pl.facing * Math.max(Math.abs(pl.vx), 9); // aerial thrust carries you
      break;
    case 'cinderwake':
      if (finisher) proj(w, { kind: 'flamewave', x: pl.x + pl.facing * 1.2, y: pl.y + 0.5, vx: pl.facing * 13, vy: 0, r: 0.6, dmg: baseDmg(pl, wp, 0.6), ttl: 0.55, ground: true, pierce: true, ignite: true });
      break;
    case 'mourning_reaper':
      if (finisher) { out.box = { x: pl.x + pl.facing * 1.2, y: pl.y, w: 3.2, h: 2.8 }; out.launch = true; }
      if (pl.attackDir === 'down') out.box = { x: pl.x, y: pl.y - 1.6, w: 3.6, h: 1.9 }; // aerial sweep catches several
      break;
  }
  if (pl.counterT > 0 && wp.id === 'hollowpoint') { out.crit = true; out.mul = 2; out.counter = true; pl.counterT = 0; ev(w, { t: 'counter', x: pl.x, y: pl.y + 1 }); }
  if (pl.backstab && wp.id === 'bloodletter') { out.mul = (out.mul || 1) * 1.6; out.crit = true; pl.backstab = false; }
  return out;
}

// ---- heavy (charged) attack: return true to replace the default heavy strike ----
export function weaponHeavy(w, pl, h) {
  const wp = weaponDef(pl.stats.weapon), ch = h.charge || 0;
  const mul = (C.heavyMin + (C.heavyFull - C.heavyMin) * ch) * (h.perfect ? C.perfectMul : 1);
  if (evolved(pl, 'worldpyre') && h.full) {
    proj(w, { kind: 'flamewave', x: pl.x + pl.facing * 1.2, y: pl.y + 0.6, vx: pl.facing * 15, vy: 0, r: 1, dmg: baseDmg(pl, wp, 1), ttl: 0.8, ground: true, pierce: true, ignite: true });
    for (let i = 1; i <= 6; i++) w.trails.push({ x: pl.x + pl.facing * i * 0.9, y: pl.y, ttl: 3 });
  }
  if (evolved(pl, 'ruinmaker') && h.full) setTimeout0(w, 0.5, () => { for (const d of [-1, 1]) proj(w, { kind: 'wave', x: pl.x + d * 0.8, y: pl.y + 0.5, vx: d * 14, vy: 0, r: 0.7, dmg: baseDmg(pl, wp, 1), ttl: 0.7, ground: true, pierce: true, launch: true, fromProc: true }); w.shake(0.5); w.sfx('slam'); });
  switch (wp.id) {
    case 'wraithstring': { // charged arrow pierces, faster and stronger with charge
      const aim = pl.attackDir === 'up' ? 1 : pl.attackDir === 'down' ? -1 : 0, sp = 26 + 10 * ch;
      proj(w, { kind: 'arrow', big: true, x: pl.x + pl.facing * 0.6, y: pl.y + 1.15, vx: aim ? pl.facing * sp * 0.5 : pl.facing * sp, vy: aim * sp * 0.87,
        r: 0.35, dmg: baseDmg(pl, wp, mul), ttl: 1.2, pierce: true, heavy: true, full: h.full, perfect: h.perfect, weaponHit: true, choir: evolved(pl, 'ghost_choir') });
      ev(w, { t: 'heavy', x: pl.x + pl.facing, y: pl.y + 1.1, facing: pl.facing, full: h.full, perfect: h.perfect, w: 1 });
      w.sfx('dash'); return true;
    }
    case 'bloodletter': { // dashing stab through minor foes
      pl.vx = pl.facing * 22; pl.invuln = Math.max(pl.invuln, 0.25);
      w.heavyBox = { x: pl.x + pl.facing * 1.6, y: pl.y + 0.3, w: 3.4, h: 1.3 };
      return false;
    }
    case 'mourning_reaper': {
      const souls = pl.reaperSouls >= 5;
      if (souls) { pl.reaperSouls = 0; ev(w, { t: 'soulspend', x: pl.x, y: pl.y + 1 }); }
      const n = souls ? (evolved(pl, 'funeral_procession') ? 5 : 3) : 1;
      for (let i = 0; i < n; i++) proj(w, { kind: 'crescent', x: pl.x + pl.facing * 0.9, y: pl.y + 0.6 + i * 0.7, vx: pl.facing * (15 + i * 2), vy: 0, r: 0.7,
        dmg: baseDmg(pl, wp, mul * (souls ? 1.4 : 0.8)), ttl: 0.7, pierce: true, heavy: true, weaponHit: true });
      return false; // the scythe still swings too
    }
    case 'gravehook': { // throw the hook
      proj(w, { kind: 'hook', x: pl.x + pl.facing * 0.6, y: pl.y + 1, vx: pl.facing * 30, vy: pl.attackDir === 'up' ? 18 : 0, r: 0.35,
        dmg: baseDmg(pl, wp, mul * 0.6), ttl: 0.32, hook: true, heavy: true, weaponHit: true });
      w.sfx('swing'); return true;
    }
    case 'oathbreaker': { // ground crack both ways
      if (pl.onGround) for (const d of [-1, 1]) proj(w, { kind: 'wave', x: pl.x + d * 0.8, y: pl.y + 0.5, vx: d * 12, vy: 0, r: 0.6, dmg: baseDmg(pl, wp, mul * 0.45), ttl: 0.5 + 0.2 * ch, ground: true, pierce: true, launch: true });
      return false;
    }
    case 'ashen_fists': // uppercut
      pl.attackDir = 'up'; pl.vy = Math.max(pl.vy, pl.onGround ? 9 : 6);
      if (pl.empowered) { pl.empowered = false; h.empowered = true; ev(w, { t: 'counter', x: pl.x, y: pl.y + 1 }); }
      return false;
  }
  return false;
}

// ---- after a weapon hit lands on e (from swing, heavy or weapon projectile) ----
export function onWeaponHit(w, e, r, o) {
  const pl = w.player, wp = weaponDef(pl.stats.weapon);
  if (r.blocked) { if (wp.id === 'hollowpoint') pl.focus = 0; return; }
  if (evolved(pl, 'ruinmaker') && o.heavy && o.full) for (const n of w.enemies) if (n.alive && n !== e && Math.hypot(n.x - e.x, n.y - e.y) < 3) { n.fracture = Math.min(3, (n.fracture || 0) + 1); ev(w, { t: 'fracture', e: n }); }
  if (evolved(pl, 'perfect_thesis') && o.counter && (pl.focus || 0) >= 4) { e.weakT = 4; ev(w, { t: 'mark', e }); }
  if (evolved(pl, 'ghost_choir') && o.choir && e.alive) setTimeout0(w, 1, () => { for (let i = 0; i < 3; i++) if (e.alive) proj(w, { kind: 'arrow', spectral: true, x: e.x + (i - 1) * 1.5, y: e.y + e.h + 5, vx: 0, vy: -24, r: 0.25, dmg: baseDmg(pl, wp, 0.6), ttl: 0.6, fromProc: true }); });
  if (evolved(pl, 'meteor_knuckles') && o.heavy && e.alive) e.burnT = Math.max(e.burnT || 0, 3);
  if (evolved(pl, 'meteor_knuckles') && o.finisher && !pl.onGround && !o.heavy) { ev(w, { t: 'explode', x: e.x, y: e.y + e.h / 2, r: 2, friendly: true }); for (const n of w.enemies) if (n.alive && Math.hypot(n.x - e.x, n.y - e.y) < 2.2) w._hit(n, baseDmg(pl, wp, 1), Math.sign(n.x - e.x) || 1, e, { fromProc: true }); }
  if (evolved(pl, 'iron_tempest') && o.hook) for (let k = 0; k < 3; k++) setTimeout0(w, 0.15 + k * 0.2, () => { ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 3, color: 0xc8c0b0 }); for (const n of w.enemies) if (n.alive && Math.hypot(n.x - pl.x, n.y + n.h / 2 - pl.y - 1) < 3.2) w._hit(n, baseDmg(pl, wp, 0.8), Math.sign(n.x - pl.x) || 1, pl, { fromProc: true }); });
  switch (wp.id) {
    case 'bloodletter': o.addBleed?.(e); break;
    case 'hollowpoint': pl.focus = Math.min(5, (pl.focus || 0) + 1); pl.focusT = 2; break;
    case 'ashen_fists': pl.flow = Math.min(6, (pl.flow || 0) + 1); pl.flowT = 1.2; if (o.heavy && e.alive && !e.boss && !e.armored) { e.vy = 14; e.juggleT = 0.9; if (o.empowered) e.burnT = 3; } break;
    case 'oathbreaker':
      if (o.heavy) { e.fracture = Math.min(3, (e.fracture || 0) + 1); ev(w, { t: 'fracture', e });
        if (e.fracture >= 3 && e.armored && !e.boss) { e.armored = false; ev(w, { t: 'armorbreak', e }); } }
      if (o.heavy && e.alive && minor(e)) { e.vy = 12; e.juggleT = 0.7; }
      break;
    case 'cinderwake':
      if (o.heavy && o.perfect && e.burnT > 0) { // perfect strike consumes burn into an explosion
        e.burnT = 0; ev(w, { t: 'explode', x: e.x, y: e.y + e.h * 0.5, r: 2.4, friendly: true }); w.shake(0.5); w.sfx('slam');
        for (const n of w.enemies) if (n.alive && Math.hypot(n.x - e.x, n.y - e.y) < 2.6) w._hit(n, baseDmg(pl, wp, 1.2), Math.sign(n.x - e.x) || 1, e, { fromProc: true });
      }
      if (o.ignite && e.alive) e.burnT = Math.max(e.burnT || 0, 2.5);
      break;
    case 'mourning_reaper': if (o.launch && e.alive && !e.boss && !e.armored) { e.vy = 11; e.juggleT = 0.6; } break;
    case 'gravehook':
      if (o.hook) {
        pl.hookBuff = 2.5; ev(w, { t: 'hooked', x: e.x, y: e.y + e.h / 2, px: pl.x, py: pl.y + 1 });
        if (minor(e) || e.flying && !e.boss) { e.x = pl.x + pl.facing * 1.3; e.vx = 0; if (!pl.onGround) { e.vy = 2; e.juggleT = 1; } else e.stunT = Math.max(e.stunT || 0, 0.5); }
        else { pl.x = e.x - pl.facing * (e.w / 2 + 0.8); pl.vy = Math.max(pl.vy, 8); pl.invuln = Math.max(pl.invuln, 0.3); }
      }
      break;
    case 'wraithstring':
      pl.shotChain = (pl.shotChain || 0) + 1;
      if (!o.spectral && pl.shotChain % 3 === 0) { // spectral follow-up seeks the nearest other foe
        const t = w.enemies.filter((n) => n.alive && n !== e).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0] || e;
        const dx = t.x - pl.x, dy = t.y + t.h / 2 - (pl.y + 1.2), d = Math.hypot(dx, dy) || 1;
        proj(w, { kind: 'arrow', spectral: true, x: pl.x, y: pl.y + 1.4, vx: dx / d * 22, vy: dy / d * 22, r: 0.25, dmg: baseDmg(pl, wp, 0.7), ttl: 1, weaponHit: true, fromProc: true });
      }
      break;
  }
  if (wp.id === 'gravehook' && !pl.onGround && pl.hookBuff > 0 && !o.hook) pl.hookBuff = 0; // spent on the aerial follow-up
}

// Damage multiplier and crit chance from the weapon's own rules (called from shapeDamage).
export function weaponDamage(w, e, o = {}) {
  const pl = w.player, wp = weaponDef(pl.stats.weapon);
  let mul = 1, crit = 0;
  if (wp.id === 'bloodletter' && o.vertical === -1 && bleeding(e)) mul *= 1.5;
  if (wp.id === 'hollowpoint') crit += 0.06 * (pl.focus || 0);
  if (wp.id === 'gravehook' && !pl.onGround && pl.hookBuff > 0) mul *= 1.5;
  if (wp.id === 'ashen_fists' && o.heavy && o.empowered) mul *= 1.6;
  if (e.fracture) mul *= 1 + 0.15 * e.fracture;
  if (e.weakT > 0) mul *= 1.5;
  return { mul, crit };
}

export function onWeaponKill(w, e) {
  const pl = w.player;
  if (evolved(pl, 'red_harvest') && ((e.bleed || 0) > 0 || e.bleedT > 0) && (w.allies ||= []).filter((a) => a.kind === 'shade').length < 2) {
    w.allies.push({ kind: 'shade', x: e.x, y: e.y, vx: 0, ttl: 6, dmg: baseDmg(pl, weaponDef(pl.stats.weapon), 1), cd: 0.3 }); ev(w, { t: 'summon', x: e.x, y: e.y, kind: 'shade' });
  }
  if (pl.stats.weapon === 'mourning_reaper') { pl.reaperSouls = Math.min(5, (pl.reaperSouls || 0) + 1); ev(w, { t: 'soul', x: e.x, y: e.y + e.h * 0.6 }); }
}

export function onWeaponDash(w, pl) { pl.dashedThrough = new Set(); }
export function weaponDashTick(w, pl, overlaps) {
  for (const e of w.enemies) if (e.alive && !pl.dashedThrough?.has(e) && overlaps(pl, e)) {
    pl.dashedThrough?.add(e);
    if (pl.stats.weapon === 'bloodletter') { pl.backstab = true; ev(w, { t: 'mark', e }); }
  }
}
export function onWeaponPerfectDodge(w, pl) { if (pl.stats.weapon === 'ashen_fists') pl.empowered = true; }

export function weaponTick(w, dt) {
  const pl = w.player;
  for (const e of w.enemies) if (e.weakT > 0) e.weakT -= dt;
  if (pl.focusT > 0 && (pl.focusT -= dt) <= 0) pl.focus = 0;
  if (pl.flowT > 0 && (pl.flowT -= dt) <= 0) pl.flow = 0;
  if (pl.hookBuff > 0) pl.hookBuff -= dt;
  pl.atkFlow = pl.stats.weapon === 'ashen_fists' ? 1 + 0.05 * (pl.flow || 0) : 1; // up to +30% attack speed
  // bow: drawing in the air slows the fall
  if (pl.stats.weapon === 'wraithstring' && pl.state === 'charge' && !pl.onGround && pl.vy < -2) pl.vy = -2;
}

// delayed effect through the shared queue (blessings.js runs it)
function setTimeout0(w, t, fn) { (w.delayed ||= []).push({ t, fn }); }
