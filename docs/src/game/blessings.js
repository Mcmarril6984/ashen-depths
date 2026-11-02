// The 59 blessings of the 3.1 rework: definitions, slot rules and behaviour.
// Categories: offense / movement / defense share 6 regular slots; 1 legendary slot; 1 cursed slot.
// Hooks are called from world.js / mechanics.js / player.js. Every proc uses { fromProc: true } so it can never
// trigger "on primary hit" effects again (no infinite chains). Numbers live in the defs or in B (tunables) below.
import { weaponDef } from './weapons.js';

const B = { // provisional balance values
  poisonTick: 1, poisonEvery: 1, poisonTime: 4, cloudTime: 4, cloudR: 1.8, maxClouds: 3,
  chillMax: 6, chillDecay: 3, freezeTime: 1.2, bossSlow: 0.8, bossSlowTime: 4,
};

// [id, name, category, icon, description, synergy weapons]
const DEFS = [
  // ---- offense ----
  ['rupture', 'Rupture', 'offense', '🩸', 'Bleeding an already bleeding foe builds Rupture; at 5 stacks it bursts for 120% weapon damage.', ['bloodletter']],
  ['emberchain', 'Emberchain', 'offense', '⛓️‍🔥', 'Hit three different foes within 4 s to chain them in fire: for 5 s they share 25% of direct damage.', ['cinderwake', 'mourning_reaper']],
  ['final_judgment', 'Final Judgment', 'offense', '⚖️', 'Heavy attacks on staggered foes strike again a moment later for 50% damage.', ['oathbreaker']],
  ['soul_rend', 'Soul Rend', 'offense', '👻', 'Killing with a charged attack releases a seeking spirit dealing 70% weapon damage.', ['mourning_reaper', 'wraithstring']],
  ['plaguebearer', 'Plaguebearer', 'offense', '☠️', 'Heavy attacks poison. Poisoned foes burst into toxic clouds when they die (max 3 clouds).', []],
  ['frostbite', 'Frostbite', 'offense', '❄️', 'Hits build Chill; at 6 stacks small foes freeze for 1.2 s. Bosses attack 20% slower instead.', ['bloodletter', 'ashen_fists']],
  ['executioners_mercy', "Executioner's Mercy", 'offense', '🪓', 'Killing a staggered foe releases a shockwave for 75% weapon damage.', ['oathbreaker', 'cinderwake']],
  ['crimson_echo', 'Crimson Echo', 'offense', '🔁', 'Every 4th melee strike repeats a moment later at 40% damage.', ['bloodletter', 'hollowpoint']],
  ['ashen_brand', 'Ashen Brand', 'offense', '🔥', 'Heavy attacks ignite. A burning foe that dies passes a weaker burn to a neighbour.', ['cinderwake']],
  ['relentless_edge', 'Relentless Edge', 'offense', '⚔️', 'Hitting the same foe again and again speeds your attacks, up to +20%. Missing or switching resets it.', ['hollowpoint', 'ashen_fists']],
  ['shatterpoint', 'Shatterpoint', 'offense', '💎', 'Heavy attacks shatter frozen foes in an explosion. Against bosses, full Chill turns into heavy stagger.', ['oathbreaker']],
  ['last_rites', 'Last Rites', 'offense', '⚰️', 'Charged attacks deal +50% to foes under 15% health (+20% to bosses).', ['wraithstring', 'hollowpoint']],
  // ---- movement ----
  ['afterimage', 'Afterimage', 'movement', '🌫️', 'Dashing leaves a decoy that draws nearby foes for 1.5 s. 6 s cooldown.', []],
  ['comet_dive', 'Comet Dive', 'movement', '☄️', 'Attack while falling fast to land with a shockwave; longer falls hit harder.', ['oathbreaker']],
  ['wind_dancer', 'Wind Dancer', 'movement', '🍃', 'Alternate hits on the ground and in the air to gain 12% move speed for 5 s.', []],
  ['reversal', 'Reversal', 'movement', '🔄', 'A perfect dodge turns you toward the attacker; your next attack deals +35%.', ['hollowpoint']],
  ['endless_ascent', 'Endless Ascent', 'movement', '🪽', 'Landing an aerial heavy attack lifts you up a little. Twice per jump.', ['gravehook']],
  ['shadow_pursuit', 'Shadow Pursuit', 'movement', '🌑', 'An airborne kill empowers your next dash: longer, and through foes.', ['gravehook']],
  ['phantom_step', 'Phantom Step', 'movement', '👤', 'After a perfect dodge, a shade repeats your next attack at 35% damage.', ['hollowpoint']],
  ['falling_star', 'Falling Star', 'movement', '🌠', 'Down-attacks deal more damage the further you have fallen, up to +60%.', ['oathbreaker', 'ashen_fists']],
  ['skybreaker', 'Skybreaker', 'movement', '🌩️', 'Killing an airborne foe gives back an air jump.', ['ashen_fists', 'gravehook']],
  ['ghostwalk', 'Ghostwalk', 'movement', '🫥', 'Dashing through a foe marks it; your next attack on it deals +30%.', ['bloodletter']],
  ['featherless_wings', 'Featherless Wings', 'movement', '🪶', 'Gain a second jump; hold jump after it to hover briefly and steer.', ['wraithstring']],
  ['predators_rhythm', "Predator's Rhythm", 'movement', '🐾', 'Three hits in a row without being hurt cut your dash cooldown by 25%.', []],
  // ---- defense ----
  ['ashen_carapace', 'Ashen Carapace', 'defense', '🛡️', 'Hits while standing your ground build up to 3 armour; each absorbs 1 damage. Dashing sheds it.', ['oathbreaker']],
  ['guardian_flame', 'Guardian Flame', 'defense', '🔥', 'Taking damage releases a ring of fire that throws small foes back. 8 s cooldown.', []],
  ['undying_will', 'Undying Will', 'defense', '💢', 'At 25% health or less, hits no longer interrupt your attacks.', []],
  ['soul_shelter', 'Soul Shelter', 'defense', '🔮', 'Three kills without being hurt grant a shield that blocks one hit.', ['mourning_reaper']],
  ['penance', 'Penance', 'defense', '🕯️', 'Whoever hurts you is marked for 5 s; killing it restores 1 mask.', []],
  ['stonebound', 'Stonebound', 'defense', '🪨', 'A fully charged heavy that lands makes the next hit within 3 s deal 20% less.', ['oathbreaker']],
  ['iron_resolve', 'Iron Resolve', 'defense', '⚙️', 'After a hit of 2+ damage, take half damage for 3 s. 18 s cooldown.', []],
  ['gravekeepers_gift', "Gravekeeper's Gift", 'defense', '⚱️', 'Killing an elite without drinking since grants a fragment; 2 fragments restore a mask.', []],
  ['vengeful_guard', 'Vengeful Guard', 'defense', '🗡️', 'Taking damage empowers your next heavy attack: +50% damage and double stagger.', ['oathbreaker', 'cinderwake']],
  ['second_skin', 'Second Skin', 'defense', '✨', 'A perfect dodge grants a shield that blocks one hit.', ['hollowpoint', 'ashen_fists']],
  ['deaths_refusal', "Death's Refusal", 'defense', '💀', 'Once per run, survive a fatal hit at 1 mask with a moment of invulnerability.', []],
  ['unbroken_oath', 'Unbroken Oath', 'defense', '🏰', 'While at full health, hits cannot interrupt you and barely push you.', []],
  // ---- cursed ----
  ['ravenous_blade', 'Ravenous Blade', 'cursed', '🗡️', 'Each kill: +2% damage (max +30%). Curse: −10% base damage, and being hurt halves the bonus.', []],
  ['borrowed_time', 'Borrowed Time', 'cursed', '⏳', '+30% attack speed. Curse: every second boss you beat costs a max mask (min 2).', []],
  ['martyrs_flame', "Martyr's Flame", 'cursed', '🕯️', 'Charged attacks explode. Curse: each one drains your flask; with none left it builds Blood Debt that costs masks.', ['cinderwake']],
  ['fragile_divinity', 'Fragile Divinity', 'cursed', '💔', 'One more regular blessing slot. Curse: foes deal 20% more damage.', []],
  ['hunger_of_the_void', 'Hunger of the Void', 'cursed', '🕳️', 'Killing an elite: +35% damage and speed for 8 s. Curse: foes never drop hearts.', []],
  ['the_unforgiven', 'The Unforgiven', 'cursed', '⚡', 'Critical hits reset your dash and take 1 s off item cooldowns. Curse: drinking takes twice as long.', ['hollowpoint']],
  ['blood_covenant', 'Blood Covenant', 'cursed', '🩸', '+35% direct damage. Curse: every second drink heals nothing.', []],
  ['glass_saint', 'Glass Saint', 'cursed', '🔷', 'Critical hits deal triple damage instead of double. Curse: lose 2 max masks (min 2).', ['hollowpoint']],
  ['the_last_flame', 'The Last Flame', 'cursed', '🔥', 'At 2 masks or fewer your hits burst into flame. Curse: the flames fill a danger meter that burns away a mask.', []],
  ['burden_of_kings', 'Burden of Kings', 'cursed', '👑', 'Heavy attacks deal +60% stagger. Curse: dash cooldown is 25% longer.', ['oathbreaker']],
  ['deaths_bargain', "Death's Bargain", 'cursed', '⚰️', 'One extra revival. Curse: when it triggers, lose a max mask for the rest of the run.', []],
  // ---- legendary ----
  ['eclipse', 'Eclipse', 'legendary', '🌘', 'After 20 hits, enter Eclipse for 6 s: attacks launch dark slashes. You cannot heal during Eclipse.', []],
  ['seventh_bell', 'The Seventh Bell', 'legendary', '🔔', 'Every 7th hit in a row calls down a massive spectral strike. Missing or being hurt resets the count.', []],
  ['phoenix_soul', 'Phoenix Soul', 'legendary', '🐦‍🔥', 'Once per run, rise from a fatal blow with half your masks, setting foes around you alight.', []],
  ['thousandfold_blade', 'Thousandfold Blade', 'legendary', '🗡️', 'Every 3rd attack is joined by two spectral copies dealing 30% each.', ['bloodletter', 'ashen_fists']],
  ['sovereign_of_ash', 'Sovereign of Ash', 'legendary', '👑', 'Hitting burning foes can release homing embers. Kill 3 burning foes to turn your next heavy into a firestorm.', ['cinderwake']],
  ['endless_hunt', 'The Endless Hunt', 'legendary', '🎯', 'Each kill marks the next foe as Prey (+50% stagger). Killing Prey marks another and speeds you up.', []],
  ['crown_of_the_fallen', 'Crown of the Fallen', 'legendary', '♛', 'Every 5th kill summons a spectral knight to fight beside you for 12 s.', ['mourning_reaper']],
  ['hourglass_of_ruin', 'Hourglass of Ruin', 'legendary', '⌛', 'Perfect dodges slow nearby foes to half speed for 2.5 s (bosses less).', ['hollowpoint']],
  ['heart_of_the_abyss', 'Heart of the Abyss', 'legendary', '🖤', 'Once per run, a fatal blow drinks all your flask charges to revive you: 1 mask plus 1 per charge.', []],
  ['wings_of_the_forsaken', 'Wings of the Forsaken', 'legendary', '🦇', 'Gain a third jump; attacks after it rain spectral blades. Grounded attacks deal 10% less.', ['gravehook', 'wraithstring']],
  ['perfect_storm', 'Perfect Storm', 'legendary', '🌪️', 'Hits right after a perfect dodge charge a storm; at 3 charges your next heavy unleashes lightning and wind.', ['hollowpoint']],
  ['hollow_king', 'The Hollow King', 'legendary', '👁️', 'Killing an elite raises its spectral copy to fight for you for 10 s.', []],
];

const RARITY = { offense: 'common', movement: 'common', defense: 'common', cursed: 'cursed', legendary: 'epic' };
export const BLESSINGS = DEFS.map(([id, name, cat, icon, desc, syn]) => ({ id, name, cat, icon, desc, syn, rarity: RARITY[cat], maxStacks: 1 }));
export const blessingDef = (id) => BLESSINGS.find((b) => b.id === id);
export const REGULAR = new Set(['offense', 'movement', 'defense']);
export const slotOf = (id) => { const c = blessingDef(id)?.cat; return REGULAR.has(c) ? 'regular' : c; };
export const regularSlots = (stats) => 6 + (stats.bless?.fragile_divinity ? 1 : 0);

// Stat changes made when a blessing is taken, undone when it is dropped (relic swaps).
const STAT = {
  borrowed_time: [(s) => (s.attackSpeed *= 1.3), (s) => (s.attackSpeed /= 1.3)],
  glass_saint: [(s) => { s.glassLost = Math.min(2, s.maxHp - 2); s.maxHp -= s.glassLost; }, (s) => { s.maxHp += s.glassLost || 0; s.glassLost = 0; }],
  hunger_of_the_void: [(s) => (s.noHealDrops = true), (s) => (s.noHealDrops = false)],
  the_unforgiven: [(s) => (s.flaskSpeed = 0.5), (s) => (s.flaskSpeed = 1)],
  featherless_wings: [(s) => (s.jumps += 1), (s) => (s.jumps -= 1)],
  wings_of_the_forsaken: [(s) => (s.jumps += 1), (s) => (s.jumps -= 1)],
  phoenix_soul: [(s) => (s.revives = (s.revives || 0) + 1), (s) => (s.revives = Math.max(0, (s.revives || 0) - 1))],
  deaths_bargain: [(s) => { s.revives = (s.revives || 0) + 1; s.bargain = (s.bargain || 0) + 1; }, (s) => { s.revives = Math.max(0, (s.revives || 0) - 1); s.bargain = Math.max(0, (s.bargain || 0) - 1); }],
  burden_of_kings: [(s) => (s.dashCdMul = 1.25), (s) => (s.dashCdMul = 1)],
};
export function addBlessing(stats, id) {
  if (!blessingDef(id)) throw new Error('Unknown blessing: ' + id);
  (stats.bless ||= {})[id] = true; STAT[id]?.[0](stats);
}
export function removeBlessing(stats, id) {
  if (!stats.bless?.[id]) return;
  delete stats.bless[id]; STAT[id]?.[1](stats);
}

// Shrine/shop offers: early floors establish a direction (regular only), cursed from floor 2, legendary from floor 4.
// The first card favours blessings that suit your weapon or what you already own.
export function rollBlessings(rng, stats, n, depth = 1, allowed) {
  const owned = stats.bless || {};
  const pool = BLESSINGS.filter((b) => !owned[b.id] && (!allowed || allowed.has(b.id))
    && (b.cat !== 'cursed' || depth >= 2) && (b.cat !== 'legendary' || depth >= 4));
  const weight = (b) => (REGULAR.has(b.cat) ? 10 : b.cat === 'cursed' ? 2.5 : 1.6) * (b.syn.includes(stats.weapon) ? 2 : 1);
  const out = [];
  while (pool.length && out.length < n) {
    const cand = out.length === 0 ? pool.filter((b) => b.syn.includes(stats.weapon)) : [];
    const list = cand.length ? cand : pool;
    let r = rng.next() * list.reduce((s, b) => s + weight(b), 0), i = 0;
    while (i < list.length - 1 && (r -= weight(list[i])) >= 0) i++;
    out.push(list[i]); pool.splice(pool.indexOf(list[i]), 1);
  }
  return out;
}

// ------------------------------------------------------------------ runtime helpers
const has = (w, id) => !!w.player.stats.bless?.[id];
const ev = (w, o) => w.events.push(o);
const wDmg = (w, mul = 1) => { const pl = w.player; return Math.max(1, Math.round(pl.stats.dmg * weaponDef(pl.stats.weapon).dmgMul * mul)); };
const near = (w, x, y, r, skip) => w.enemies.filter((e) => e.alive && e !== skip && Math.hypot(e.x - x, e.y + e.h / 2 - y) < r);
const minor = (e) => !e.boss && !e.armored && !isElite(e) && e.maxHp <= 5;
export const isElite = (e) => !e.boss && (e.elite || e.maxHp >= 8);
const st = (w) => (w.player.b ||= { swings: 0, kills: 0, cleanKills: 0, cleanHits: 0, bell: 0, eclipseHits: 0, burnKills: 0, storm: 0, frags: 0, echo: 0, thousand: 0, recent: new Map(), cd: {} });
const later = (w, t, fn) => (w.delayed ||= []).push({ t, fn });
// Mask damage rule: fractional damage rounds up with probability equal to the fraction (0.8 → 80% chance of 1).
export const roundMasks = (w, x) => Math.max(0, Math.floor(x) + (w.rng.next() < x - Math.floor(x) ? 1 : 0));
function blast(w, x, y, r, dmg, color, opts = {}) {
  ev(w, { t: opts.ring ? 'nova' : 'explode', x, y, r, color, friendly: true });
  for (const e of near(w, x, y, r + 0.4, opts.skip)) { w._hit(e, dmg, Math.sign(e.x - x) || 1, w.player, { fromProc: true }); if (opts.burn) e.burnT = Math.max(e.burnT || 0, opts.burn); }
}
function seeker(w, x, y, dmg, color = 'spirit') {
  w.projectiles.push({ owner: 'player', kind: color, x, y, vx: 0, vy: 8, r: 0.35, dmg, ttl: 2.2, gravity: 0, alive: true, age: 0, hitSet: new Set(), seek: true, fromProc: true });
}
// Spectral repeats of a swing (echoes, shades, copies): re-hit the same foes, never re-triggering anything.
function repeatHits(w, targets, mul, delay, kind) {
  later(w, delay, () => { for (const e of targets) if (e.alive) { w._hit(e, wDmg(w, mul), Math.sign(e.x - w.player.x) || 1, w.player, { fromProc: true }); ev(w, { t: 'echo', x: e.x, y: e.y + e.h * 0.6, kind }); } });
}
function shield(w, why) {
  const pl = w.player; if (pl.shield) return;
  pl.shield = true; ev(w, { t: 'wardup', x: pl.x, y: pl.y }); ev(w, { t: 'shield', why });
}
export function applyPoison(w, e) { if (!e.alive) return; if (!(e.poisonT > 0)) e.poisonTick = B.poisonEvery; e.poisonT = B.poisonTime; }
export function addChill(w, e, n = 1) {
  if (!e.alive) return;
  e.chill = Math.min(B.chillMax, (e.chill || 0) + n); e.chillT = B.chillDecay;
  if (e.chill < B.chillMax) return;
  if (e.boss) { e.slowT = B.bossSlowTime; e.slowMul = B.bossSlow; ev(w, { t: 'chilled', e }); return; }
  if (minor(e) || !e.armored) { e.chill = 0; e.frozenT = B.freezeTime; e.stunT = Math.max(e.stunT || 0, B.freezeTime); ev(w, { t: 'frozen', e }); }
}
function summon(w, kind, x, y, ttl, dmg, from) {
  const live = (w.allies ||= []).filter((a) => a.kind === kind);
  if (live.length) return;
  w.allies.push({ kind, x, y, vx: 0, ttl, dmg, cd: 0.4, from: from?.type });
  ev(w, { t: 'summon', x, y, kind });
}

// ------------------------------------------------------------------ hooks
// Damage multiplier on an outgoing hit (fromPlayer hits only).
export function damageMul(w, e, o) {
  const pl = w.player, b = st(w); let m = 1;
  if (has(w, 'ravenous_blade')) m *= 0.9 * (1 + (b.ravenous || 0));
  if (has(w, 'blood_covenant')) m *= 1.35;
  if (has(w, 'hunger_of_the_void') && b.hungerT > 0) m *= 1.35;
  if (has(w, 'wings_of_the_forsaken') && pl.onGround) m *= 0.9;
  if (has(w, 'last_rites') && o.full && e.hp / e.maxHp < 0.15) m *= e.boss ? 1.2 : 1.5;
  if (has(w, 'falling_star') && o.vertical === -1 && b.fallFrom !== undefined) m *= 1 + Math.min(0.6, Math.max(0, b.fallFrom - pl.y) * 0.06);
  if (has(w, 'reversal') && b.reversal && !o.heavyProc) { m *= 1.35; b.reversal = false; }
  if (has(w, 'ghostwalk') && e.ghostMark) { m *= 1.3; e.ghostMark = false; ev(w, { t: 'markpop', x: e.x, y: e.y + e.h }); }
  if (has(w, 'vengeful_guard') && o.heavy && b.vengeful) m *= 1.5;
  return m;
}
export const critMul = (w) => (has(w, 'glass_saint') ? 3 : 2);

export function onHit(w, e, r, o) {
  if (!o.fromPlayer || r.blocked) return;
  const pl = w.player, b = st(w);
  if (o.full) b.lastFull = w.time;
  if (o.heavy) {
    if (has(w, 'plaguebearer')) applyPoison(w, e);
    if (has(w, 'ashen_brand') && e.alive) e.burnT = Math.max(e.burnT || 0, 3);
    if (has(w, 'final_judgment') && e.staggered) later(w, 0.4, () => { if (e.alive) { w._hit(e, wDmg(w, 1.5 * 0.5), 1, pl, { fromProc: true }); ev(w, { t: 'judgment', x: e.x, y: e.y + e.h * 0.5 }); } });
    if (has(w, 'shatterpoint')) {
      if (e.frozenT > 0) { e.frozenT = 0; e.stunT = 0; blast(w, e.x, e.y + e.h / 2, 2.2, wDmg(w, 1.5), 0x9ae8ff, { skip: null }); ev(w, { t: 'shatter', e }); }
      else if (e.boss && e.chill >= B.chillMax - 1) { e.chill = 0; w.addStagger?.(e, 6); ev(w, { t: 'shatter', e }); }
    }
    if (has(w, 'stonebound') && o.full) b.stoneT = 3;
    if (has(w, 'endless_ascent') && !pl.onGround && (b.ascents || 0) < 2) { b.ascents = (b.ascents || 0) + 1; pl.vy = Math.max(pl.vy, 10); }
    if (has(w, 'vengeful_guard')) b.vengeful = false;
  }
  if (has(w, 'frostbite')) addChill(w, e);
  if (has(w, 'emberchain') && !e.chainT) {
    b.recent.set(e, w.time);
    for (const [k, t] of b.recent) if (w.time - t > 4 || !k.alive) b.recent.delete(k);
    if (b.recent.size >= 3) { const group = [...b.recent.keys()]; b.recent.clear(); for (const k of group) { k.chainT = 5; k.chainGroup = group; } ev(w, { t: 'emberchain', pts: group.map((k) => ({ x: k.x, y: k.y + k.h * 0.6 })) }); }
  }
  if (e.chainT > 0 && !o.fromProc && e.chainGroup) for (const k of e.chainGroup) if (k !== e && k.alive && k.chainT > 0) w._hit(k, Math.max(1, Math.round((o.dmg || 1) * 0.25)), 1, pl, { fromProc: true, quiet: true });
  if (has(w, 'relentless_edge')) { if (b.relTarget === e) b.relStacks = Math.min(4, (b.relStacks || 0) + 1); else { b.relTarget = e; b.relStacks = 0; } }
  if (has(w, 'sovereign_of_ash') && e.burnT > 0 && w.rng.chance(0.3)) seeker(w, e.x, e.y + e.h, wDmg(w, 0.5), 'ember');
  if (has(w, 'wind_dancer')) { const air = !pl.onGround; if (b.lastAir !== undefined && b.lastAir !== air) b.danceT = 5; b.lastAir = air; }
  if (has(w, 'perfect_storm') && pl.counterT > 0 && b.storm < 3) { b.storm++; ev(w, { t: 'stormcharge', x: pl.x, y: pl.y + 1, n: b.storm }); }
  if (has(w, 'the_last_flame') && pl.hp <= 2 && !o.heavyProc) {
    const k = pl.hp <= 1 ? 2 : 1; blast(w, e.x, e.y + e.h / 2, 1.2 + 0.4 * k, wDmg(w, 0.35 * k), 0xff6a2a, { skip: e });
    b.danger = (b.danger || 0) + 12 * k; if (b.danger >= 100) { b.danger = 0; w.selfHarm?.(1); }
  }
  if (has(w, 'eclipse') && !(b.eclipseT > 0)) { if (++b.eclipseHits >= 20) { b.eclipseHits = 0; b.eclipseT = 6; ev(w, { t: 'eclipse', x: pl.x, y: pl.y }); } }
}

// After a primary swing resolves: hits = foes struck by it (empty = a miss).
export function onSwing(w, pl, { hits, finisher, extra }) {
  if (extra) return;
  const b = st(w);
  if (has(w, 'relentless_edge') && !hits.length) { b.relStacks = 0; b.relTarget = null; }
  if (has(w, 'seventh_bell')) {
    if (!hits.length) b.bell = 0;
    else if (++b.bell >= 7) { b.bell = 0; const t = hits[0]; later(w, 0.25, () => { blast(w, t.x, t.y + t.h / 2, 3, wDmg(w, 3), 0xc8d8ff); ev(w, { t: 'bell', x: t.x, y: t.y }); w.shake(0.6); }); }
  }
  if (!hits.length) return;
  if (has(w, 'predators_rhythm') && ++b.cleanHits >= 3) { b.cleanHits = 0; pl.dashCd *= 0.75; }
  if (has(w, 'crimson_echo') && ++b.echo % 4 === 0) repeatHits(w, hits, 0.4, 0.22, 'crimson');
  if (has(w, 'thousandfold_blade') && ++b.thousand % 3 === 0) { repeatHits(w, hits, 0.3, 0.12, 'copy'); repeatHits(w, hits, 0.3, 0.24, 'copy'); }
  if (has(w, 'phantom_step') && b.shade) { b.shade = false; repeatHits(w, hits, 0.35, 0.2, 'shade'); }
  if (has(w, 'ashen_carapace') && pl.onGround && Math.abs(pl.vx) < 3) { b.armor = Math.min(3, (b.armor || 0) + 1); b.armorT = 6; }
  if (has(w, 'eclipse') && b.eclipseT > 0) w.projectiles.push({ owner: 'player', kind: 'darkslash', x: pl.x + pl.facing, y: pl.y + 1, vx: pl.facing * 18, vy: 0, r: 0.5, dmg: wDmg(w, 0.6), ttl: 0.5, gravity: 0, alive: true, age: 0, hitSet: new Set(), pierce: true, fromProc: true });
  if (has(w, 'wings_of_the_forsaken') && !pl.onGround && pl.jumpsUsed >= 2) for (const t of hits) later(w, 0.15, () => { if (t.alive) { w.projectiles.push({ owner: 'player', kind: 'blade', piece: 'sword_small', x: t.x, y: t.y + t.h + 4, vx: 0, vy: -24, r: 0.4, dmg: wDmg(w, 0.5), ttl: 0.5, gravity: 0, alive: true, age: 0, hitSet: new Set(), fromProc: true }); } });
}

export function onHeavy(w, pl, h) {
  const b = st(w);
  if (has(w, 'martyrs_flame') && h.full) {
    later(w, 0.1, () => blast(w, pl.x + pl.facing * 1.6, pl.y + 0.8, 2.2, wDmg(w, 1), 0xff7a2a, { burn: 2 }));
    b.martyr = (b.martyr || 0) + 0.34;
    if (b.martyr >= 1) { b.martyr -= 1; if (pl.flask > 0) pl.flask--; else if ((b.debt = (b.debt || 0) + 1) >= 3) { b.debt = 0; w.selfHarm?.(1); ev(w, { t: 'debt', x: pl.x, y: pl.y }); } }
  }
  if (has(w, 'sovereign_of_ash') && b.burnKills >= 3) { b.burnKills = 0; later(w, 0.1, () => { blast(w, pl.x + pl.facing * 1.5, pl.y + 1, 3.6, wDmg(w, 1.6), 0xff5a1a, { burn: 4 }); w.shake(0.7); }); }
  if (has(w, 'perfect_storm') && b.storm >= 3) {
    b.storm = 0;
    const targets = near(w, pl.x, pl.y + 1, 7).slice(0, 5);
    if (targets.length) ev(w, { t: 'lightning', pts: [{ x: pl.x, y: pl.y + 6 }, ...targets.map((e) => ({ x: e.x, y: e.y + e.h * 0.6 }))] });
    for (const e of targets) { w._hit(e, wDmg(w, 1.4), Math.sign(e.x - pl.x) || 1, pl, { fromProc: true }); if (!e.boss && !e.armored) e.vx = Math.sign(e.x - pl.x) * 12; }
    ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 3.5, color: 0xc8f0ff }); w.shake(0.6);
  }
  if (has(w, 'comet_dive') && !pl.onGround && pl.vy < -10) b.comet = true;
}

export function staggerMul(w, o) { return (has(w, 'burden_of_kings') && o.heavy ? 1.6 : 1) * (has(w, 'vengeful_guard') && o.heavy && st(w).vengeful ? 2 : 1); }
export function onStagger(w, e) { if (e.prey) e.preyStaggered = true; }
export function preyStagger(w, e) { return has(w, 'endless_hunt') && e.prey ? 1.5 : 1; }

export function onKill(w, e) {
  const pl = w.player, b = st(w);
  b.kills++; b.cleanKills++;
  if (has(w, 'ravenous_blade')) b.ravenous = Math.min(0.3, (b.ravenous || 0) + 0.02);
  if (has(w, 'soul_rend') && b.lastFull > w.time - 0.6) seeker(w, e.x, e.y + e.h * 0.6, wDmg(w, 0.7));
  if (has(w, 'plaguebearer') && e.poisonT > 0) {
    const clouds = (w.clouds ||= []);
    if (clouds.length >= B.maxClouds) clouds.shift();
    clouds.push({ x: e.x, y: e.y + 0.6, t: B.cloudTime, tick: 0 }); ev(w, { t: 'cloud', x: e.x, y: e.y + 0.6 });
  }
  if (has(w, 'executioners_mercy') && e.staggered) blast(w, e.x, e.y + e.h / 2, 2.6, wDmg(w, 0.75), 0xffe0a0, { skip: e, ring: true });
  if (has(w, 'ashen_brand') && e.burnT > 0) { const n = near(w, e.x, e.y + e.h / 2, 4, e)[0]; if (n) { n.burnT = Math.max(n.burnT || 0, 1.5); ev(w, { t: 'spark', x: n.x, y: n.y + n.h / 2, color: 0xff7a2a }); } }
  if (e.burnT > 0) b.burnKills++;
  if (has(w, 'shadow_pursuit') && !pl.onGround) { pl.dashBoost = true; ev(w, { t: 'mark', e: pl }); }
  if (has(w, 'skybreaker') && (e.flying || !e.onGround) && pl.jumpsUsed > 0) pl.jumpsUsed--;
  if (has(w, 'soul_shelter') && b.cleanKills >= 3) { b.cleanKills = 0; shield(w, 'soul_shelter'); }
  if (has(w, 'penance') && e.penanceT > 0) { pl.hp = Math.min(pl.stats.maxHp, pl.hp + 1); w.healFx(pl); }
  if (isElite(e)) {
    if (has(w, 'gravekeepers_gift') && !b.drankSince) { if (++b.frags >= 2) { b.frags = 0; pl.hp = Math.min(pl.stats.maxHp, pl.hp + 1); w.healFx(pl); } else ev(w, { t: 'fragment', x: e.x, y: e.y + e.h }); }
    if (has(w, 'hunger_of_the_void')) { b.hungerT = 8; ev(w, { t: 'bloodlust', x: pl.x, y: pl.y }); }
    if (has(w, 'hollow_king')) summon(w, 'hollow', e.x, e.y, 10, wDmg(w, 1.2), e);
  }
  if (has(w, 'crown_of_the_fallen') && b.kills % 5 === 0) summon(w, 'knight', pl.x - pl.facing, pl.y, 12, wDmg(w, 1));
  if (has(w, 'endless_hunt')) {
    const wasPrey = e.prey;
    const next = w.enemies.filter((n) => n.alive && n !== e && !n.prey).sort((a, c) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(c.x - pl.x, c.y - pl.y))[0];
    if (next && (wasPrey || !w.enemies.some((n) => n.alive && n.prey))) { next.prey = true; ev(w, { t: 'mark', e: next }); }
    if (wasPrey) b.huntT = 3;
  }
}

// Dash started / dash moving.
export function onDash(w, pl) {
  const b = st(w);
  if (has(w, 'ashen_carapace')) b.armor = 0;
  if (has(w, 'afterimage') && !(b.cd.afterimage > 0)) { b.cd.afterimage = 6; w.decoy = { x: pl.x, y: pl.y, w: pl.w, h: pl.h, vx: 0, vy: 0, t: 1.5, dead: false, stats: pl.stats }; ev(w, { t: 'decoy', x: pl.x, y: pl.y }); }
}
export function dashThrough(w, pl, e) { if (has(w, 'ghostwalk')) { e.ghostMark = true; ev(w, { t: 'mark', e }); } }

export function onPerfectDodge(w, pl, src) {
  const b = st(w);
  if (has(w, 'reversal')) { b.reversal = true; if (src?.x !== undefined) pl.facing = Math.sign(src.x - pl.x) || pl.facing; }
  if (has(w, 'phantom_step')) b.shade = true;
  if (has(w, 'second_skin')) shield(w, 'second_skin');
  if (has(w, 'hourglass_of_ruin')) for (const e of near(w, pl.x, pl.y + 1, 8)) { e.slowT = 2.5; e.slowMul = e.boss ? 0.75 : 0.5; ev(w, { t: 'slowed', e }); }
}

// Incoming damage to the player. Returns the damage that actually lands (0 = blocked).
export function incoming(w, dmg, src) {
  const pl = w.player, b = st(w);
  if (pl.shield) { pl.shield = false; ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 2, color: 0x9ae8ff }); w.sfx('block'); pl.invuln = Math.max(pl.invuln, 0.5); return 0; }
  let d = dmg;
  if (has(w, 'fragile_divinity')) d *= 1.2;
  if (has(w, 'stonebound') && b.stoneT > 0) { d *= 0.8; b.stoneT = 0; }
  if (has(w, 'iron_resolve') && b.resolveT > 0) d *= 0.5;
  if (has(w, 'ashen_carapace') && b.armor > 0) { const a = Math.min(b.armor, Math.ceil(d)); d -= a; b.armor -= a; ev(w, { t: 'spark', x: pl.x, y: pl.y + 1, color: 0xffb060, n: 14 }); }
  return roundMasks(w, Math.max(0, d));
}
export function onHurt(w, dmg, src) {
  const pl = w.player, b = st(w);
  b.cleanKills = 0; b.cleanHits = 0; b.bell = 0;
  if (has(w, 'ravenous_blade')) b.ravenous = (b.ravenous || 0) / 2;
  if (has(w, 'guardian_flame') && !(b.cd.guardian > 0)) { b.cd.guardian = 8; ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 3, color: 0xff7a2a }); for (const e of near(w, pl.x, pl.y + 1, 3.2)) { if (!e.boss && !e.armored) { e.vx = Math.sign(e.x - pl.x) * 12; e.vy = 6; } e.burnT = Math.max(e.burnT || 0, 2); } }
  if (has(w, 'penance') && src && src.alive !== undefined && src.alive) src.penanceT = 5;
  if (has(w, 'iron_resolve') && dmg >= 2 && !(b.cd.resolve > 0)) { b.cd.resolve = 18; b.resolveT = 3; ev(w, { t: 'wardup', x: pl.x, y: pl.y }); }
  if (has(w, 'vengeful_guard')) b.vengeful = true;
}
// Hits don't interrupt you (no hurt stagger/knockback) when these hold.
export const steadfast = (w) => (has(w, 'undying_will') && w.player.hp <= w.player.stats.maxHp * 0.25) || (has(w, 'unbroken_oath') && w.player.hp >= w.player.stats.maxHp);

// A fatal blow: returns true if a blessing saved you (revives from Phoenix/Bargain go through tryRevive).
export function onLethal(w) {
  const pl = w.player, b = st(w);
  if (has(w, 'deaths_refusal') && !b.refused) { b.refused = true; pl.dead = false; pl.hp = 1; pl.invuln = 1.5; pl.state = 'move'; ev(w, { t: 'revive', x: pl.x, y: pl.y }); w.sfx('parry'); w.slowmo = Math.max(w.slowmo, 0.5); return true; }
  if (has(w, 'heart_of_the_abyss') && !b.abyss) {
    b.abyss = true; const c = pl.flask; pl.flask = 0;
    pl.dead = false; pl.hp = Math.min(pl.stats.maxHp, 1 + c); pl.invuln = 2; pl.state = 'move';
    ev(w, { t: 'nova', x: pl.x, y: pl.y + 1, r: 4, color: 0x8a4aff }); ev(w, { t: 'revive', x: pl.x, y: pl.y }); w.sfx('boss'); return true;
  }
  return false;
}
export function onRevive(w) { // a revive was spent: Death's Bargain takes a max mask
  const s = w.player.stats;
  if (s.bargain > 0 && has(w, 'deaths_bargain')) { s.bargain--; s.maxHp = Math.max(2, s.maxHp - 1); w.player.hp = Math.min(w.player.hp, s.maxHp); }
}
export function onBossBeaten(w) {
  const s = w.player.stats, b = st(w);
  if (has(w, 'borrowed_time') && (b.bosses = (b.bosses || 0) + 1) % 2 === 0) { s.maxHp = Math.max(2, s.maxHp - 1); w.player.hp = Math.min(w.player.hp, s.maxHp); }
}
// Healing: returns how many masks a finished drink restores. Eclipse blocks healing entirely.
export function flaskHeal(w, base) {
  const b = st(w); b.drankSince = true;
  if (has(w, 'blood_covenant') && (b.drinks = (b.drinks || 0) + 1) % 2 === 0) return 0;
  return base;
}
export const canHeal = (w) => !(has(w, 'eclipse') && st(w).eclipseT > 0);
export function onBleed(w, e, hadBleed) {
  if (!has(w, 'rupture') || !hadBleed) return;
  e.rupture = (e.rupture || 0) + 1;
  if (e.rupture >= 5) { e.rupture = 0; w._hit(e, wDmg(w, 1.2), 1, w.player, { fromProc: true }); ev(w, { t: 'bleedburst', x: e.x, y: e.y + e.h * 0.5 }); }
}
export function onCrit(w) { if (has(w, 'the_unforgiven')) { const pl = w.player; pl.dashCd = 0; pl.dashLeft = pl.stats.dashes; pl.specialCd = Math.max(0, pl.specialCd - 1); if (pl.itemCd) pl.itemCd = pl.itemCd.map((c) => Math.max(0, c - 1)); } }
export const speedMul = (w) => { const b = st(w); return (b.danceT > 0 ? 1.12 : 1) * (b.huntT > 0 ? 1.2 : 1) * (b.hungerT > 0 ? 1.2 : 1); };
export const attackSpeedMul = (w) => 1 + 0.05 * (has(w, 'relentless_edge') ? st(w).relStacks || 0 : 0);

// Per-frame upkeep: timers, statuses, clouds, seekers, delayed hits, allies, decoy.
export function tick(w, dt) {
  const pl = w.player, b = st(w);
  for (const k of Object.keys(b.cd)) b.cd[k] -= dt;
  for (const k of ['stoneT', 'resolveT', 'danceT', 'huntT', 'hungerT', 'eclipseT', 'armorT']) if (b[k] > 0) b[k] -= dt;
  if (b.armorT <= 0) b.armor = 0;
  pl.speedMul = speedMul(w); pl.atkBless = attackSpeedMul(w);
  // falling height for Falling Star, landings for Comet Dive / Endless Ascent
  if (pl.onGround) { b.ascents = 0; if (b.comet) { b.comet = false; const fall = Math.max(0, (b.fallFrom ?? pl.y) - pl.y); for (const d of [-1, 1]) w.projectiles.push({ owner: 'player', kind: 'wave', x: pl.x + d * 0.8, y: pl.y + 0.5, vx: d * 12, vy: 0, r: 0.6, dmg: wDmg(w, Math.min(2.5, 0.6 + fall * 0.15)), ttl: 0.5, gravity: 0, alive: true, age: 0, hitSet: new Set(), pierce: true, ground: true, fromProc: true }); w.shake(0.5); w.sfx('slam'); } b.fallFrom = undefined; }
  else if (pl.vy < 0 && b.fallFrom === undefined) b.fallFrom = pl.y;
  else if (pl.vy > 0) b.fallFrom = undefined;
  // hover (Featherless Wings): hold jump while falling after the second jump
  if (has(w, 'featherless_wings') && !pl.onGround && pl.jumpsUsed >= 1 && pl.jumpHeld && pl.vy < 0 && (b.hover = (b.hover || 0) + dt) < 0.7) pl.vy = Math.max(pl.vy, -1.2);
  if (pl.onGround) b.hover = 0;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (e.poisonT > 0) { e.poisonT -= dt; if ((e.poisonTick -= dt) <= 0) { e.poisonTick = B.poisonEvery; w._hit(e, B.poisonTick, 0, e, { fromProc: true, quiet: true }); } }
    if (e.chillT > 0 && (e.chillT -= dt) <= 0) e.chill = 0;
    if (e.frozenT > 0) e.frozenT -= dt;
    if (e.slowT > 0 && (e.slowT -= dt) <= 0) e.slowMul = 1;
    if (e.chainT > 0) e.chainT -= dt;
    if (e.penanceT > 0) e.penanceT -= dt;
  }
  for (const c of w.clouds || []) {
    c.t -= dt; c.tick -= dt;
    if (c.tick <= 0) { c.tick = 0.5; for (const e of near(w, c.x, c.y, B.cloudR)) applyPoison(w, e); }
  }
  if (w.clouds) w.clouds = w.clouds.filter((c) => c.t > 0);
  for (const pr of w.projectiles) if (pr.seek && pr.alive) { // seekers home on the nearest foe
    const t = near(w, pr.x, pr.y, 12).filter((e) => !pr.hitSet.has(e)).sort((a, c) => Math.hypot(a.x - pr.x, a.y - pr.y) - Math.hypot(c.x - pr.x, c.y - pr.y))[0];
    if (t) { const dx = t.x - pr.x, dy = t.y + t.h / 2 - pr.y, d = Math.hypot(dx, dy) || 1; pr.vx += (dx / d * 16 - pr.vx) * Math.min(1, dt * 5); pr.vy += (dy / d * 16 - pr.vy) * Math.min(1, dt * 5); }
  }
  if (w.delayed?.length) { for (const d of w.delayed) if ((d.t -= dt) <= 0) { d.done = true; d.fn(); } w.delayed = w.delayed.filter((d) => !d.done); }
  if (w.decoy && (w.decoy.t -= dt) <= 0) w.decoy = null;
  for (const a of w.allies || []) { // spectral allies: walk to the nearest foe and strike
    a.ttl -= dt; a.cd -= dt;
    const t = near(w, a.x, a.y + 1, 14).sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
    if (t) { const dx = t.x - a.x; a.x += Math.sign(dx) * Math.min(Math.abs(dx) - 0.8 > 0 ? 6 * dt : 0, Math.abs(dx)); a.y += (t.y - a.y) * Math.min(1, dt * 4); a.facing = Math.sign(dx) || 1;
      if (Math.abs(dx) < 1.6 && a.cd <= 0) { a.cd = a.kind === 'hollow' ? 1.1 : 0.8; w._hit(t, a.dmg, a.facing, a, { fromProc: true }); ev(w, { t: 'allyhit', x: t.x, y: t.y + t.h / 2, kind: a.kind }); } }
    else { a.x += (pl.x - pl.facing * 1.2 - a.x) * Math.min(1, dt * 3); a.y += (pl.y - a.y) * Math.min(1, dt * 3); }
  }
  if (w.allies) w.allies = w.allies.filter((a) => a.ttl > 0);
}
export const hasBlessing = has;
