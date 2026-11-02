import { PLAYER } from './constants.js';
import { WEAPON_DEFS, STARTER_WEAPON } from './weapons.js';
import { BLESSINGS, rollBlessings, addBlessing, removeBlessing } from './blessings.js';
import { ITEM_DEFS } from './items.js';

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
    bless:{}, dashCdMul:1, flaskSpeed:1, items:[null,null],
    cinderBlood:false, stormBrand:false, slipstream:false, aerialFuse:false, bloodEcho:false, thunderClap:false,
  };
}

// Blessings (3.1): defined in blessings.js. These wrappers keep the old call sites working.
export const UPGRADES=BLESSINGS;
export function rollChoices(rng,owned={},n=3,stats=makeStats(),allowed,depth=1) {
  return rollBlessings(rng,stats,n,depth,allowed?.blessings);
}
export function applyUpgrade(stats,id) { addBlessing(stats,id); return stats; }
export function dropUpgrade(stats,id) { removeBlessing(stats,id); return stats; }

export const WEAPONS=WEAPON_DEFS.map(w=>({...w,special:w.id}));
export function equipWeapon(stats,id) {
  if(!WEAPONS.some(w=>w.id===id))throw new Error('Unknown weapon: '+id);
  stats.weapon=id;return stats;
}
// An exhausted blessing pool produces fewer offers rather than invalid duplicates.
export function rollShop(rng,owned={},stats=makeStats(),depth=1,allowed) {
  const rarityPrice=u=>({offense:45,movement:45,defense:45,cursed:70,legendary:140})[u.cat]||50;
  const weapon=null; // one weapon per run (3.1): chosen in the Hearth, never sold
  const offer=(kind,item,price)=>({kind,id:item.id,name:item.name,desc:item.desc,icon:item.icon,price});
  return [
    offer('heal',{id:'heal',name:'Hearty Stew',desc:'Restore 3 HP',icon:'🍲'},25+5*depth),
    ...(()=>{const pool=ITEM_DEFS.filter(i=>!(stats.items||[]).includes(i.id)&&(!allowed?.items||allowed.items.has(i.id)));if(!pool.length)return [];const it=pool[Math.floor(rng.next()*pool.length)];return [{...offer('item',it,40+8*depth),kind:'item'}];})(),
    ...(weapon?[offer('weapon',weapon,({common:60,rare:90,epic:120})[weapon.rarity]+15*depth)]:[]),
    ...rollChoices(rng,owned,2,stats,allowed,depth).map(u=>offer('blessing',u,rarityPrice(u)+10*depth)),
  ];
}
