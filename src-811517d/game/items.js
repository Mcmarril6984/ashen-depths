// Items: a second kit beside the weapon. Two slots, each on its own button, recharging on a cooldown.
// Kinds: throwable (fire and forget), deployable (place it, keep fighting), power (instant effect on you),
// offhand (held while the button is down). Item hits carry { item: true } so weapon on-hit rules don't apply,
// but blessings that react to burn, bleed, chill, stagger and hits still do.
import { addChill, applyPoison } from './blessings.js';

export const ITEM_DEFS = [
  { id: 'cinder_flask', name: 'Cinder Flask', kind: 'throwable', icon: '🧨', cd: 6, rarity: 'common',
    desc: 'Lob a flask that bursts into flame and leaves a burning pool for 3 s.' },
  { id: 'frost_shard', name: 'Frost Shard', kind: 'throwable', icon: '❄️', cd: 7, rarity: 'common',
    desc: 'Hurl a shard that chills everything around the impact; a direct hit freezes small foes.' },
  { id: 'ember_turret', name: 'Ember Turret', kind: 'deployable', icon: '🗼', cd: 14, rarity: 'rare',
    desc: 'Set down a turret that fires burning bolts at the nearest foe for 8 s.' },
  { id: 'spike_snare', name: 'Spike Snare', kind: 'deployable', icon: '🪤', cd: 10, rarity: 'common',
    desc: 'Lay a snare: the next foe to step on it is stunned for 2 s and bleeds. Up to 2 at once.' },
  { id: 'ashen_cloak', name: 'Ashen Cloak', kind: 'power', icon: '🌫️', cd: 16, rarity: 'rare',
    desc: 'Vanish for 3 s: foes lose track of you, and your next hit is a critical.' },
  { id: 'war_cry', name: 'War Cry', kind: 'power', icon: '📯', cd: 15, rarity: 'common',
    desc: 'Knock small foes off their feet and deal +25% damage for 5 s.' },
  { id: 'bronze_buckler', name: 'Bronze Buckler', kind: 'offhand', icon: '🛡️', cd: 0, rarity: 'rare',
    desc: 'Hold to block hits from the front. Raise it just as a blow lands to parry and stun the attacker.' },
  { id: 'hand_crossbow', name: 'Hand Crossbow', kind: 'ranged', icon: '🎯', cd: 2.5, rarity: 'common',
    desc: 'Fire a quick bolt that knocks foes back. Short cooldown.' },
];
export const STARTER_ITEM = 'cinder_flask';
export const itemDef = (id) => ITEM_DEFS.find((i) => i.id === id);

const ev = (w, o) => w.events.push(o);
const power = (pl) => Math.max(1, pl.stats.dmg || 1); // items scale with your base damage, not your weapon
const near = (w, x, y, r) => w.enemies.filter((e) => e.alive && Math.hypot(e.x - x, e.y + e.h / 2 - y) < r);
function proj(w, o) { w.projectiles.push({ owner: 'player', alive: true, age: 0, gravity: 0, hitSet: new Set(), pierce: false, item: true, ...o }); }

// Use the item in a slot (0 or 1). Returns the player state to enter ('cast', 'block') or null if nothing happened.
export function useItem(w, pl, slot) {
  const id = pl.stats.items?.[slot], def = itemDef(id);
  if (!def || (pl.itemCd[slot] > 0 && def.kind !== 'offhand')) return null;
  const f = pl.facing, P = power(pl);
  switch (id) {
    case 'cinder_flask':
      proj(w, { kind: 'flask', x: pl.x + f * 0.5, y: pl.y + 1.4, vx: f * 9, vy: 9, gravity: 26, r: 0.3, dmg: 2 + P, ttl: 2, burst: 'fire' });
      break;
    case 'frost_shard':
      proj(w, { kind: 'shard', x: pl.x + f * 0.6, y: pl.y + 1.1, vx: f * 20, vy: 0, r: 0.3, dmg: 1 + P, ttl: 0.9, burst: 'frost' });
      break;
    case 'hand_crossbow':
      proj(w, { kind: 'xbolt', x: pl.x + f * 0.6, y: pl.y + 1.15, vx: f * 26, vy: 0, r: 0.25, dmg: 1 + P, ttl: 0.7, knock: true });
      break;
    case 'ember_turret':
      (w.turrets ||= []).push({ x: pl.x + f * 0.9, y: pl.y, ttl: 8, cd: 0.4, P });
      ev(w, { t: 'deploy', x: pl.x + f * 0.9, y: pl.y, kind: 'turret' });
      break;
    case 'spike_snare': {
      const s = (w.snares ||= []); if (s.length >= 2) s.shift();
      s.push({ x: pl.x + f * 0.8, y: pl.y, P }); ev(w, { t: 'deploy', x: pl.x + f * 0.8, y: pl.y, kind: 'snare' });
      break;
    }
    case 'ashen_cloak':
      pl.cloakT = 3; pl.nextCrit = true; ev(w, { t: 'cloak', x: pl.x, y: pl.y });
      break;
    case 'war_cry':
      pl.cryT = 5; w.shake(0.4); ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 4, color: 0xffc070 }); w.sfx('boss');
      for (const e of near(w, pl.x, pl.y + 1, 4.2)) if (!e.boss && !e.armored && e.maxHp <= 8) { e.stunT = Math.max(e.stunT || 0, 1.2); e.vy = 6; e.vx = Math.sign(e.x - pl.x) * 4; }
      break;
    case 'bronze_buckler':
      pl.blockSlot = slot; return 'block';
  }
  pl.itemCd[slot] = def.cd * (pl.stats.itemCdMul || 1);
  w.sfx(def.kind === 'throwable' || def.kind === 'ranged' ? 'swing' : 'select');
  ev(w, { t: 'itemUse', id, x: pl.x, y: pl.y });
  return 'cast';
}

// An item projectile hit a foe (or the ground, e = null). Bursts happen here.
export function itemImpact(w, pr, e) {
  const pl = w.player;
  if (pr.burst === 'fire') {
    ev(w, { t: 'explode', x: pr.x, y: pr.y, r: 1.8, friendly: true }); w.shake(0.3); w.sfx('fire');
    for (const n of near(w, pr.x, pr.y, 2)) { w._hit(n, pr.dmg, Math.sign(n.x - pr.x) || 1, pr, { item: true }); n.burnT = Math.max(n.burnT || 0, 3); }
    (w.pools ||= []).push({ x: pr.x, y: groundY(w, pr.x, pr.y), t: 3, tick: 0 });
  } else if (pr.burst === 'frost') {
    ev(w, { t: 'nova', x: pr.x, y: pr.y, r: 2, color: 0xbfe8ff }); w.sfx('break');
    if (e && !e.boss && !e.armored && e.maxHp <= 8) { e.frozenT = 1.5; e.stunT = Math.max(e.stunT || 0, 1.5); ev(w, { t: 'frozen', e }); }
    for (const n of near(w, pr.x, pr.y, 2.2)) addChill(w, n, 3);
  } else if (pr.knock && e && !e.boss && !e.armored) e.vx = Math.sign(pr.vx) * 9;
}

// Is the player blocking this blow with the buckler? dir = knockback direction (away from the attacker).
export function blocks(w, pl, dir, src) {
  if (pl.state !== 'block' || dir !== -pl.facing) return false;
  const parry = pl.stateTime < 0.22;
  if (parry) {
    if (src && src.alive && !src.boss) src.stunT = Math.max(src.stunT || 0, 1.5);
    pl.nextCrit = true; w.hitStop = 0.1; w.slowmo = Math.max(w.slowmo, 0.25);
    ev(w, { t: 'parry', x: pl.x + pl.facing * 0.6, y: pl.y + 1.1 }); w.sfx('parry');
  } else { ev(w, { t: 'blocked', x: pl.x + pl.facing * 0.6, y: pl.y + 1, dir: pl.facing }); w.sfx('block'); pl.vx = -pl.facing * 4; }
  pl.invuln = Math.max(pl.invuln, 0.2);
  return true;
}

export const itemDamageMul = (pl) => (pl.cryT > 0 ? 1.25 : 1);

// Per-frame: cooldowns, turrets, snares, burning pools, cloak.
export function tickItems(w, dt) {
  const pl = w.player;
  pl.itemCd ||= [0, 0];
  for (let i = 0; i < 2; i++) if (pl.itemCd[i] > 0) pl.itemCd[i] = Math.max(0, pl.itemCd[i] - dt);
  if (pl.cryT > 0) pl.cryT -= dt;
  if (pl.cloakT > 0) pl.cloakT -= dt;
  for (const t of w.turrets || []) {
    t.ttl -= dt; t.cd -= dt;
    if (t.cd > 0) continue;
    const e = near(w, t.x, t.y + 1, 9).sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0];
    if (!e) continue;
    t.cd = 0.6;
    const dx = e.x - t.x, dy = e.y + e.h / 2 - (t.y + 1.2), d = Math.hypot(dx, dy) || 1;
    proj(w, { kind: 'ember', x: t.x, y: t.y + 1.2, vx: dx / d * 18, vy: dy / d * 18, r: 0.22, dmg: 1, ttl: 0.8, ignite: true, fromProc: true });
  }
  if (w.turrets) w.turrets = w.turrets.filter((t) => t.ttl > 0);
  for (const s of w.snares || []) {
    const e = w.enemies.find((n) => n.alive && !n.flying && Math.abs(n.x - s.x) < n.w / 2 + 0.4 && Math.abs(n.y - s.y) < 0.8);
    if (!e) continue;
    s.sprung = true; ev(w, { t: 'snare', x: s.x, y: s.y }); w.sfx('break');
    w._hit(e, 1 + s.P, 1, s, { item: true });
    if (e.alive) { e.stunT = Math.max(e.stunT || 0, 2); e.bleed = (e.bleed || 0) + 2; e.bleedT = 4; }
  }
  if (w.snares) w.snares = w.snares.filter((s) => !s.sprung);
  for (const p of w.pools || []) {
    p.t -= dt; p.tick -= dt;
    if (p.tick <= 0) { p.tick = 0.5; for (const e of w.enemies) if (e.alive && Math.abs(e.x - p.x) < 1.5 && Math.abs(e.y - p.y) < 1) e.burnT = Math.max(e.burnT || 0, 1.5); }
  }
  if (w.pools) w.pools = w.pools.filter((p) => p.t > 0);
}

function groundY(w, x, y) {
  const L = w.level; let ty = Math.floor(y);
  while (ty > 0 && L.tiles[(ty - 1) * L.w + Math.floor(x)] === 0) ty--;
  return ty;
}
export { applyPoison };
