import { PLAYER } from './constants.js';
import { WEAPON_DEFS, STARTER_WEAPON } from './weapons.js';

export function makeStats() {
  return {
    maxHp:PLAYER.maxHp, dmg:1, attackSpeed:1, moveSpeed:PLAYER.runSpeed,
    dashes:1, jumps:1, critChance:0, flaskCharges:PLAYER.flaskCharges,
    special:null, killsPerHeal:0, dashDamage:0, thorns:0,
    weapon:STARTER_WEAPON, bleedBurst:false, ignite:false, stormEvery:0, riposte:false,
    phantomDash:false, dashTrail:false, bladeReturn:false, pogoWave:false,
    ward:0, revives:0, soulHarvest:false, lastStand:false, windBlades:false,
    bloodlust:false, juggle:false, execute:false, deflect:false,
    shadowStep:false, flaskNova:false,
    cinderBlood:false, stormBrand:false, slipstream:false, aerialFuse:false, bloodEcho:false, thunderClap:false,
  };
}

// Each blessing sets one mechanic; these keys are the runtime contract.
const definitions = [
  ['serrated_edge','Serrated Edge','Hits stack bleed; 3 stacks burst for heavy damage around the target','common','🩸','bleedBurst',true,['bleed']],
  ['kindled_blade','Kindled Blade','Hits ignite foes; burning foes explode when they die','rare','🔥','ignite',true,['fire']],
  ['storm_crown','Storm Crown','Every 5th hit calls lightning that arcs between foes','rare','⚡','stormEvery',5,['storm']],
  ['riposte','Riposte','Attack just as a blow lands to parry: no damage, the attacker is stunned, your counter crits','epic','🤺','riposte',true],
  ['phantom_dash','Phantom Dash','Dashing through foes marks them; your next hit on a mark deals double','rare','👻','phantomDash',true,['dash']],
  ['ember_trail','Ember Trail','Your dash leaves a burning trail','common','🔥','dashTrail',true,['dash','fire']],
  ['boomerang_blade','Boomerang Blade','Your combo finisher throws your blade; it returns through foes','rare','🪃','bladeReturn',true],
  ['pogo_storm','Pogo Storm','Down-slash bounces release a shockwave and refresh your dash','common','🌪️','pogoWave',true,['air']],
  ['warding_sigil','Warding Sigil','A ward absorbs one hit, then explodes; recharges in 12 s','rare','🛡️','ward',12],
  ['phoenix_ember','Phoenix Ember','Once per run, rise from death in a burst of fire','epic','🐦‍🔥','revives',1],
  ['soul_harvest','Soul Harvest','Kills drop soul orbs; gather 3 to heal 1','common','🔮','soulHarvest',true],
  ['last_stand','Last Stand','At 1 HP every hit is a critical','rare','❤️‍🔥','lastStand',true],
  ['wind_blades','Wind Blades','At 8+ combo your swings fire piercing wind blades','rare','🌬️','windBlades',true,['combo']],
  ['bloodlust','Bloodlust','Kills refresh your dash and jumps and grant a moment of invulnerability','common','🦇','bloodlust',true,['dash','air']],
  ['juggler','Juggler','Up-slashes launch foes into the air and keep them there','rare','🤹','juggle',true,['air']],
  ['executioner','Executioner','Foes under 20% HP glow; your next hit finishes them','common','🪓','execute',true],
  ['deflect','Deflect','Your slashes send projectiles back at their owner','common','🗡️','deflect',true],
  ['shadow_step','Shadow Step','Dash toward a nearby foe to blink behind it','epic','🌑','shadowStep',true,['dash']],
  ['flask_nova','Flask Nova','Drinking the flask blasts nearby foes away','common','🧪','flaskNova',true],
  ['cinder_blood','Cinder Blood','A 3-stack bleed burst ignites every foe within 3 tiles for 3 s','rare','🔥','cinderBlood',true,['bleed','fire']],
  ['storm_brand','Storm Brand','Lightning consumes a phantom mark to arc to one extra foe within 5 tiles','rare','⚡','stormBrand',true,['storm','dash']],
  ['slipstream','Slipstream','An airborne dash primes your next down-slash bounce to launch two piercing wind blades','common','🌬️','slipstream',true,['dash','air']],
  ['aerial_fuse','Aerial Fuse','Up-slashing a burning foe detonates its burn in a 3-tile blast; 2 s per-foe cooldown','rare','☄️','aerialFuse',true,['fire','air']],
  ['blood_echo','Blood Echo','Your combo finisher spreads one bleed stack from its target to other foes within 3 tiles','common','🩸','bloodEcho',true,['bleed','combo']],
  ['thunder_clap','Thunder Clap','A down-slash bounce at 8+ combo calls lightning on the bounced foe; 2 s cooldown','rare','🌩️','thunderClap',true,['storm','air','combo']],
  ['feather_step','Feather Step','Double jump','epic','🪶','jumps',2],
  ['firebolt','Firebolt','Piercing fireball; 3 s cooldown','epic','☄️','special','firebolt'],
  ['shockwave','Shockwave','Special ground slam','epic','💥','special','shockwave'],
];
export const UPGRADES=definitions.map(([id,name,desc,rarity,icon,field,value,tags])=>({
  id,name,desc,rarity,icon,maxStacks:1,
  ...(tags?{tags}:{}),
  ...(field==='special'?{requires:stats=>!stats.special}:{}),
}));
const weights={common:6,rare:3,epic:1};
export function rollChoices(rng,owned={},n=3,stats=makeStats(),allowed) {
  if(typeof n==='object'){stats=n;n=3;}
  const pool=UPGRADES.filter(u=>(!allowed||allowed.blessings.has(u.id))&&(owned[u.id]||0)<u.maxStacks&&(!u.requires||u.requires(stats)));
  const tags=new Set(UPGRADES.filter(u=>owned[u.id]>0).flatMap(u=>u.tags||[]));
  const result=[];
  while(pool.length&&result.length<n) {
    // Reserve the first slot for a weighted synergy choice when one exists.
    const matching=result.length===0?pool.filter(u=>(u.tags||[]).some(t=>tags.has(t))):[];
    const candidates=matching.length?matching:pool;
    let r=rng.next()*candidates.reduce((s,u)=>s+weights[u.rarity],0),i=0;
    while(i<candidates.length-1&&(r-=weights[candidates[i].rarity])>=0)i++;
    const choice=candidates[i];
    result.push(choice);pool.splice(pool.indexOf(choice),1);
  }
  return result;
}
export function applyUpgrade(stats,id) {
  const definition=definitions.find(u=>u[0]===id);
  if(!definition)throw new Error('Unknown upgrade: '+id);
  stats[definition[5]]=definition[6];
  return stats;
}

export const WEAPONS=WEAPON_DEFS.map(w=>({...w,special:w.id}));
export function equipWeapon(stats,id) {
  if(!WEAPONS.some(w=>w.id===id))throw new Error('Unknown weapon: '+id);
  stats.weapon=id;return stats;
}
// An exhausted blessing pool produces fewer offers rather than invalid duplicates.
export function rollShop(rng,owned={},stats=makeStats(),depth=1,allowed) {
  const weapon=null; // one weapon per run (3.1): chosen in the Hearth, never sold
  const offer=(kind,item,price)=>({kind,id:item.id,name:item.name,desc:item.desc,icon:item.icon,price});
  return [
    offer('heal',{id:'heal',name:'Hearty Stew',desc:'Restore 3 HP',icon:'🍲'},25+5*depth),
    ...(weapon?[offer('weapon',weapon,({common:60,rare:90,epic:120})[weapon.rarity]+15*depth)]:[]),
    ...rollChoices(rng,owned,2,stats,allowed).map(u=>offer('blessing',u,({common:45,rare:80,epic:130})[u.rarity]+10*depth)),
  ];
}
