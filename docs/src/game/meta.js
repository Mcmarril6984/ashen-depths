import { UPGRADES, WEAPONS } from './upgrades.js';

export const BASE_BLESSINGS = ['serrated_edge','kindled_blade','ember_trail','pogo_storm','soul_harvest','executioner','deflect','bloodlust','feather_step','firebolt'];
export const BASE_WEAPONS = ['sword'];
const catalog = (cat, source, rows) => rows.map(([id,cost,requires]) => {
  const {name,desc,icon}=source.find(item=>item.id===id);
  return {id,cat,name,desc,icon,cost,target:id,...(requires?{requires}:{} )};
});
export const BOSS_IDS=['dwarf_king','forge_golem','bone_lord','demon'];
export const startDepth=biome=>({halls:1,forge:6,crypt:11,hell:16}[biome]||1);
export const UNLOCKS = [
  ...[['forge','dwarf_king','The Forge'],['crypt','forge_golem','The Sunken Crypt'],['hell','bone_lord','The Hell Gate']].map(([biome,boss,name])=>({id:'start_'+biome,cat:'start',name,desc:'Begin your descent at '+name,icon:'🔥',cost:0,condition:{boss}})),
  ...catalog('blessing',UPGRADES,[['cinder_blood',40],['storm_brand',55],['slipstream',30],['aerial_fuse',50],['blood_echo',35],['thunder_clap',60],['storm_crown',35],['riposte',60],['phantom_dash',35],['boomerang_blade',40],['warding_sigil',40],['phoenix_ember',80],['last_stand',40],['wind_blades',45],['juggler',35],['shadow_step',60,['phantom_dash']],['flask_nova',25],['shockwave',30]]),
  ...catalog('weapon',WEAPONS,[['dagger',25],['axe',35],['mace',45],['greatsword',60,['axe']],['hammer',70,['mace']]]),
  ...[
    ['loadout','feature','Armory Rack',30,"Choose your starting weapon from those you've unlocked",'⚔️'],
    ['shrine_reroll','feature','Shrine Candle',40,"Reroll a shrine's blessings once",'🕯️'],
    ['merchant_reroll','feature','Haggling',40,"Reroll a merchant's wares once per floor",'🪙'],
    ['rage_flask','flask','Rage Draught',45,'Heals 1; for 5 s your hits explode','🔥'],
    ['ward_flask','flask','Warding Tonic',45,'Heals 1 and grants a shield that blocks the next hit','🛡️'],
  ].map(([id,cat,name,cost,desc,icon])=>({id,cat,name,cost,desc,icon})),
  ...[
    ['vow_haste','Vow of Haste','Enemies move and attack 30% faster',.25,'⚡'],
    ['vow_hordes','Vow of Hordes','Half again as many enemies',.3,'💀'],
    ['vow_ash','Vow of Ash','No flask',.35,'🔥'],
    ['vow_glass','Vow of Glass','You have 3 max HP',.4,'💎'],
  ].map(([id,name,desc,emberBonus,icon])=>({id,cat:'vow',name,desc,emberBonus,icon,cost:0,condition:{best:3}})),
];
export function defaultMeta() {
  return {v:1,ember:0,unlocked:{},best:1,runs:0,wins:0,kills:0,bestiary:{},bosses:Object.fromEntries(BOSS_IDS.map(id=>[id,false])),loadout:{weapon:'sword',flask:'heal',vows:[],startBiome:'halls'}};
}
const count=(n,fallback=0)=>typeof n==='number'&&Number.isFinite(n)?Math.max(fallback,Math.floor(n)):fallback;
const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
export function normalizeMeta(obj) {
  const m=defaultMeta();
  try {
    if(!object(obj))return m;
    for(const key of ['ember','best','runs','wins','kills'])m[key]=count(obj[key],key==='best'?1:0);
    if(object(obj.unlocked))for(const u of UNLOCKS)if(u.cat!=='vow'&&obj.unlocked[u.id]===true)m.unlocked[u.id]=true;
    if(object(obj.bestiary))for(const [key,value] of Object.entries(obj.bestiary))if(!['__proto__','constructor','prototype'].includes(key))m.bestiary[key]=count(value);
    if(object(obj.bosses))for(const id of BOSS_IDS)m.bosses[id]=obj.bosses[id]===true;
    if(object(obj.loadout))m.loadout={...obj.loadout};
    m.loadout=sanitizeLoadout(m);
  } catch { return defaultMeta(); }
  return m;
}
export function isUnlocked(meta,id) {
  if(BASE_BLESSINGS.includes(id)||BASE_WEAPONS.includes(id))return true;
  const u=UNLOCKS.find(u=>u.id===id);
  if(u?.condition?.boss)return meta?.bosses?.[u.condition.boss]===true;
  return !!u&&(u.cat==='vow'?count(meta?.best,1)>=u.condition.best:meta?.unlocked?.[id]===true);
}
export function canBuy(meta,id) {
  const u=UNLOCKS.find(u=>u.id===id);
  if(isUnlocked(meta,id))return {ok:false,reason:'owned'};
  if(!u||u.requires?.some(id=>!isUnlocked(meta,id)))return {ok:false,reason:'locked'};
  if(u.condition&&(u.condition.boss?meta?.bosses?.[u.condition.boss]!==true:count(meta?.best,1)<u.condition.best))return {ok:false,reason:'condition'};
  if(count(meta?.ember)<u.cost)return {ok:false,reason:'ember'};
  return {ok:true,reason:null};
}
export function buy(meta,id) {
  const m=normalizeMeta(meta),check=canBuy(m,id);
  if(!check.ok)throw new Error(check.reason);
  m.ember-=UNLOCKS.find(u=>u.id===id).cost;m.unlocked[id]=true;return m;
}
const allowed=(meta,cat,base)=>new Set([...base,...UNLOCKS.filter(u=>u.cat===cat&&isUnlocked(meta,u.id)).map(u=>u.target)]);
export const allowedBlessings=meta=>allowed(meta,'blessing',BASE_BLESSINGS);
export const allowedWeapons=meta=>allowed(meta,'weapon',BASE_WEAPONS);
export function vowMods(vows) {
  const ids=new Set(Array.isArray(vows)?vows:[]);
  return {enemySpeed:ids.has('vow_haste')?1.3:1,enemyCountMul:ids.has('vow_hordes')?1.5:1,noFlask:ids.has('vow_ash'),maxHp:ids.has('vow_glass')?3:null,emberMul:1+UNLOCKS.filter(u=>u.cat==='vow'&&ids.has(u.id)).reduce((n,u)=>n+u.emberBonus,0)};
}
export function emberReward({depth,kills,gold,won,bossesBeaten}={},vows) {
  const base=Math.floor((count(depth,1)-1)*6+count(kills)*.5+count(gold)/12+(won?40:0)+25*new Set((Array.isArray(bossesBeaten)?bossesBeaten:[]).filter(id=>BOSS_IDS.includes(id))).size);
  return Math.max(1,Math.floor(base*vowMods(vows).emberMul));
}
export function recordRun(meta,run={},vows) {
  const m=normalizeMeta(meta),before=UNLOCKS.filter(u=>canBuy(m,u.id).ok).map(u=>u.id),previouslyUnlocked=new Set(UNLOCKS.filter(u=>isUnlocked(m,u.id)).map(u=>u.id));
  const reward=emberReward(run,vows);
  for(const id of Array.isArray(run.bossesBeaten)?run.bossesBeaten:[])if(BOSS_IDS.includes(id))m.bosses[id]=true;
  m.ember+=reward;m.best=Math.max(m.best,count(run.depth,1));m.runs++;m.wins+=run.won?1:0;m.kills+=count(run.kills);
  if(object(run.killsByType))for(const [key,value] of Object.entries(run.killsByType))if(!['__proto__','constructor','prototype'].includes(key))m.bestiary[key]=count(m.bestiary[key])+count(value);
  return {meta:m,reward,newlyAffordable:UNLOCKS.filter(u=>canBuy(m,u.id).ok&&!before.includes(u.id)).map(u=>u.id),newlyUnlocked:UNLOCKS.filter(u=>['vow','start'].includes(u.cat)&&isUnlocked(m,u.id)&&!previouslyUnlocked.has(u.id)).map(u=>u.id)};
}
export function sanitizeLoadout(meta) {
  const l=meta?.loadout||{};
  return {weapon:isUnlocked(meta,'loadout')&&allowedWeapons(meta).has(l.weapon)?l.weapon:'sword',flask:['rage_flask','ward_flask'].includes(l.flask)&&isUnlocked(meta,l.flask)?l.flask:'heal',vows:[...new Set(Array.isArray(l.vows)?l.vows:[])].filter(id=>UNLOCKS.some(u=>u.id===id&&u.cat==='vow')&&isUnlocked(meta,id)),startBiome:['forge','crypt','hell'].includes(l.startBiome)&&isUnlocked(meta,'start_'+l.startBiome)?l.startBiome:'halls'};
}
