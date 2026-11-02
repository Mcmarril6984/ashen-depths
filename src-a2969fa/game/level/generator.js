import { ENEMY_TYPES } from '../enemies.js';
import { WEAPONS } from '../upgrades.js';
import { ITEM_DEFS } from '../items.js';
import { T } from '../constants.js';
import { makeRng } from '../rng.js';
import { CHUNKS } from './chunks.js';
import { ROOM_SHAPES, dressRoom, doorwayTiles } from './rooms.js';
// Each authored profile specifies a different route, hazard rhythm and room vocabulary.
export const FLOORS=[
 ['entry_halls','The Lantern Halls','flat'],['mine_shafts','The Abandoned Shafts','down'],
 ['broken_bridges','The Broken Bridges','bridge'],['great_gallery','The Great Gallery','tiers'],
 ['dwarf_king','The Hollow Throne','boss'],['foundry','The Cinder Foundry','lava'],
 ['chimneys','The Iron Chimneys','up'],['saw_works','The Saw Works','saws'],
 ['magma_lake','The Magma Lake','lake'],['forge_golem','The Colossus Crucible','boss'],
 ['ossuary','The Whispering Ossuary','narrow'],['catacombs','The Sunken Catacombs','tombs'],
 ['bone_pits','The Pits of Bone','spikes'],['tomb_towers','The Tomb Towers','tower'],
 ['bone_lord','The Bone Cathedral','boss'],['brimstone','The Brimstone Wastes','wide'],
 ['chain_bridges','The Hanging Chains','chains'],['spire','The Black Spire','spire'],
 ['gauntlet','The Last Gauntlet','arenas'],['demon','The Ashen Gate','boss']];
const mixes={halls:['skeleton','skeleton_thrower','goblin','crystal_turret'],forge:['dwarf_undead','dwarf_bomber','rock_golem','crystal_turret','goblin'],crypt:['skeleton','ghost','skeleton_thrower','undead_knight','wisp','goblin_shaman'],hell:['wisp','wisp','wisp','wisp','undead_knight','dwarf_bomber','rock_golem','ghost','goblin_shaman','skeleton_thrower','dwarf_undead','goblin','crystal_turret','skeleton']};
// Exact attainable HP budgets prevent a random room from becoming a golem wall.
function roster(pool,count,budget,rng) {
 const sums=[new Set([0])];
 for(let n=1;n<=count;n++)sums[n]=new Set([...sums[n-1]].flatMap(v=>pool.map(t=>v+ENEMY_TYPES[t].hp)));
 let remaining=[...sums[count]].sort((a,b)=>Math.abs(a-budget)-Math.abs(b-budget)||a-b)[0],out=[];
 for(let n=count;n>0;n--){const t=rng.pick(pool.filter(t=>sums[n-1].has(remaining-ENEMY_TYPES[t].hp)));out.push(t);remaining-=ENEMY_TYPES[t].hp;}
 return out;
}
export function generateFloor({seed,depth,allowedWeapons,allowedItems,enemyCountMul=1}) {
 depth=Math.max(1,Math.min(20,Math.floor(depth)||1));
 const rng=makeRng(seed),[archetype,floorName,style]=FLOORS[depth-1],biome=['halls','forge','crypt','hell'][Math.floor((depth-1)/5)];
 const boss=depth%5===0,n=boss?1:6, rw=style==='wide'?32:style==='narrow'?20:26;
 const w=boss?50:n*rw+8,h=boss?28:style==='down'?82:style==='spire'?89:style==='tower'?77:style==='up'?77:style==='tiers'?37:29;
 const l={w,h,depth,biome,archetype,floorName,tiles:new Uint8Array(w*h).fill(T.SOLID),rooms:[],entities:[],spawn:null,exit:null,criticalPath:[]};
 const put=(x,y,t)=>{if(x>0&&x<w-1&&y>0&&y<h-1)l.tiles[y*w+x]=t;};
 const entity=(kind,x,y,extra={})=>l.entities.push({kind,x,y,...extra});
 if(boss){
  if(depth===20){
   const rows=CHUNKS.hell.boss[0],x=3,y=4;
   l.rooms.push({x,y,w:rows[0].length,h:rows.length,type:'boss',shape:'arena',optional:false});
   rows.forEach((row,i)=>[...row].forEach((ch,j)=>{const xx=x+j,yy=y+rows.length-1-i;put(xx,yy,{'#':T.SOLID,'=':T.PLATFORM}[ch]||T.EMPTY);if(ch==='S')l.spawn={x:xx+.5,y:yy};if(ch==='M')entity('enemy',xx+.5,yy,{type:'demon'});if(ch==='E')l.exit={x:xx+.5,y:yy};}));
   for(const rx of [12,35])entity('decor',x+rx+.5,y+4,{name:'statue'});
   for(const rx of [10,20,30,39])entity('decor',x+rx+.5,y+4,{name:'pillar'});
  }else{
   const r={x:3,y:3,w:44,h:22,type:'boss',shape:'arena',optional:false};l.rooms.push(r);
   for(let x=5;x<45;x++)for(let y=7;y<23;y++)put(x,y,T.EMPTY);
   l.spawn={x:6.5,y:7};l.exit={x:42.5,y:7};entity('enemy',29.5,7,{type:archetype});
   const ledges=depth===5?[[15,9,5],[32,9,5]]:depth===10?[[13,9,6],[21,11,8],[33,9,6]]:[[12,9,7],[19,12,5],[25,15,7],[34,12,5]];
   for(const [x,y,len] of ledges)for(let j=0;j<len;j++)put(x+j,y,T.PLATFORM);
   if(depth===5)for(const x of [14,22,35])entity('decor',x,7,{name:'pillar'});
   if(depth===10)for(const x of [10,38]){put(x,6,T.LAVA);put(x+1,6,T.LAVA);}
  }
 }else{
  let base=['down'].includes(style)?65:12;
  for(let i=0;i<n;i++){
   const x=4+i*rw, start=base;
   const delta=style==='down'?-8:style==='spire'?10:style==='tower'?(i%2?10:6):style==='up'?8:style==='tiers'?(i%2? -4:4):0;
   const r={x,y:Math.min(start,start+delta)-2,w:rw,h:Math.abs(delta)+18,type:i===0?'start':i===3?'shrine':i===4?'treasure':'combat',optional:false,shape:ROOM_SHAPES[(((depth-1)%5)*6+i)%8],template:archetype+'-'+i};l.rooms.push(r);
   for(let j=0;j<rw;j++){
    const floor=start+Math.sign(delta)*Math.min(Math.abs(delta),2*Math.floor(Math.min(Math.max(j-4,0),16)/ (32/Math.abs(delta))));
    // Broad, flat landings on both sides of every seam.
    const fy=j<4?start:j>=20?start+delta:floor;
    for(let y=fy;y<Math.max(start,start+delta)+15;y++)put(x+j,y,T.EMPTY);
    const gap=['bridge','lava','lake','spikes','chains'].includes(style)&&j>=11&&j<=13;
    if(gap){for(let y=fy-5;y<fy;y++)put(x+j,y,T.EMPTY);put(x+j,fy-6,biome==='forge'?T.LAVA:T.SPIKES);}
    if(j===3){entity('pathlight',x+j+.5,fy+2.5);l.criticalPath.push({x:x+j+.5,y:fy});}
   }
   if(i===0)l.spawn={x:x+2.5,y:start};
   const end=start+delta;
   if(style==='tiers')for(const [xx,yy] of [[x+22,Math.max(start,end)+2],[x+19,Math.max(start,end)+4]])for(let j=0;j<3;j++)put(xx+j,yy,T.PLATFORM);
   if(i!==4&&['tiers','tombs','arenas'].includes(style))for(const dx of [5,14])for(let j=0;j<4;j++)put(x+dx+j,Math.max(start,end)+5,T.PLATFORM);
   if(['bridge','lava','lake','spikes','chains'].includes(style))for(let j=10;j<16;j++)put(x+j,start+2,T.PLATFORM);
   if(i!==4)dressRoom(r,start,end,put);
   if(style==='saws')entity('saw',x+10, start+1.5,{x2:x+18,y2:start+1.5,speed:3});
   if(i>0){
    const pool=[...mixes[biome],...(biome==='halls'&&depth>=3?['dwarf_undead']:[])];
    const baseCount=Math.round(depth===1?i<3?1:2:2+Math.floor((depth-1)/5)+(depth-1)%5*.5);
    const count=Math.round(baseCount*Math.max(0,Number.isFinite(enemyCountMul)?enemyCountMul:1));
    const stage=(depth-1)%5, band=Math.floor((depth-1)/5);
    const types=roster(depth===1&&i<3?['skeleton']:pool,count,Math.round(count*(depth===1?2.5:stage===0&&band>0?3.4+band*.6:2.5+stage*.65+band*.55)),rng);
    for(let k=0;k<count;k++){const rx=delta?[3.5,21.5,24.5][k%3]:(rw===20?[3.5,5.5,7.5,10.5,13.5,16.5]:[3.5,6.5,8.5,17.5,20.5,23.5])[k%6];entity('enemy',x+rx,delta&&rx>20?end:start,{type:types[k],elite:depth>=4&&rng.chance(depth/100)});}
   }
   if(i===3)entity('shrine',x+2.5,start);
   if(i===4){
    // An upper side tomb branches from the route and rejoins at either end.
    const sy=Math.max(start,end)+5;
    for(let j=5;j<rw-4;j++)put(x+j,sy,T.PLATFORM);
    for(const [xx,yy] of [[x+3, start+2],[x+5,start+4]])for(let j=0;j<3;j++)put(xx+j,yy,T.PLATFORM);
    if(delta>0)for(const [xx,yy] of [[x+23,end+2],[x+20,end+4]])for(let j=0;j<3;j++)put(xx+j,yy,T.PLATFORM);
    l.rooms.push({x:x+5,y:sy,w:rw-9,h:6,type:'treasure',shape:'vault',optional:true});
    entity('chest',x+12.5,sy+1);entity('merchant',x+8.5,sy+1);
    const weapons=[]; // one weapon per run (3.1): no altars
    if(weapons.length)entity('weapon',x+Math.min(18.5,rw-5.5),sy+1,{id:rng.pick(weapons).id});
    const items=ITEM_DEFS.filter(a=>!allowedItems||allowedItems.has(a.id));
    if(items.length)entity('item',x+Math.min(18.5,rw-5.5),sy+1,{id:rng.pick(items).id}); // item altar in the side tomb
   }
   base=end;
  }
  l.exit={x:4+n*rw-3.5,y:base};
 }
 // Presentation markers only: timings/hazards must be integrated by Claude before activation.
 const scenes={broken_bridges:['bridge_chase',2],great_gallery:['gallery_crossfire',3],
  foundry:['furnace_bellows',2],magma_lake:['rising_lava',3],
  ossuary:['ghost_ambush',2],tomb_towers:['bone_procession',3],
  chain_bridges:['chain_collapse',2],gauntlet:['last_stand_gate',3]};
 if(scenes[archetype]){const [id,index]=scenes[archetype],r=l.rooms.filter(r=>!r.optional)[index];
  l.entities.push({kind:'setpiece',id,x0:r.x+1,y0:r.y+2,x1:r.x+r.w-1,y1:r.y+r.h-1});}
 if(!boss){
  // Overlapping shape/profile shelves are composed into clean runs. The service
  // balcony remains continuous so all three reward stations share a safe floor.
  for(const r of l.rooms.filter(r=>!r.optional&&r.type!=='treasure'))for(let y=r.y;y<r.y+r.h;y++){
   for(let x=r.x;x<r.x+r.w;x++)if(l.tiles[y*w+x]===T.PLATFORM){
    let end=x;while(end<r.x+r.w&&l.tiles[y*w+end]===T.PLATFORM)end++;
    const len=end-x;
    if(len<3)for(let j=x;j<end;j++)put(j,y,T.EMPTY);
    else if(len>6){
     const groups=Math.ceil((len+1)/7), tiles=len-groups+1, base=Math.floor(tiles/groups), extra=tiles%groups;
     let cursor=x;for(let g=0;g<groups-1;g++){cursor+=base+(g<extra?1:0);put(cursor++,y,T.EMPTY);}
    }
    x=end-1;
   }
  }
  for(const p of l.criticalPath){
   const x=Math.floor(p.x), old=p.y;
   const ys=[];for(let y=1;y<h-2;y++)if(l.tiles[y*w+x]===T.EMPTY&&l.tiles[(y+1)*w+x]===T.EMPTY&&[T.SOLID,T.PLATFORM].includes(l.tiles[(y-1)*w+x]))ys.push(y);
   ys.sort((a,b)=>Math.abs(a-old)-Math.abs(b-old));
   p.y=ys[0];const light=l.entities.find(e=>e.kind==='pathlight'&&e.x===p.x);light.y=p.y+2.5;
  }
  const safe=new Uint8Array(w*h).fill(1);
  for(const d of [l.spawn,...doorwayTiles(l)])for(let x=Math.max(0,Math.ceil(d.x-6-.5));x<=Math.min(w-1,Math.floor(d.x+6-.5));x++)for(let y=Math.max(0,Math.ceil(d.y-3.5));y<=Math.min(h-1,Math.floor(d.y+3.5));y++)safe[y*w+x]=0;
  for(const r of l.rooms.filter(r=>!r.optional)){
   const foes=l.entities.filter(e=>e.kind==='enemy'&&e.x>=r.x&&e.x<r.x+r.w);
   const slots=new Map();
   for(const [index,e] of foes.entries()){
    const b=ENEMY_TYPES[e.type], candidates=slots.get(e.type)||[];
    if(!slots.has(e.type)){
    for(let x=r.x+1;x<r.x+r.w-1;x++)for(let y=r.y+1;y<r.y+r.h-2;y++){
     const p={x:x+.5,y};
     if(!safe[y*w+x]||Math.hypot(p.x-l.spawn.x,p.y-l.spawn.y)<10)continue;
     if(![T.SOLID,T.PLATFORM].includes(l.tiles[(y-1)*w+x]))continue;
     let clear=true;
     for(let xx=Math.floor(p.x-b.w/2+.001);xx<=Math.floor(p.x+b.w/2-.001);xx++)for(let yy=y;yy<y+b.h;yy++)if(l.tiles[yy*w+xx]!==T.EMPTY)clear=false;
     if(clear)candidates.push(p);
    }
    slots.set(e.type,candidates);
    }
    candidates.sort((a,b)=> (r.shape==='balcony'?b.y-a.y:0)||Math.abs(a.x-e.x)-Math.abs(b.x-e.x)||a.y-b.y);
    if(!candidates.length)throw new Error('No entrance-safe spawn '+depth+' '+r.shape+' '+e.type+' room '+r.x);
    Object.assign(e,candidates[index%Math.min(6,candidates.length)]);
   }
  }
 }
 entity('lift',l.exit.x,l.exit.y,{w:3});
 if(boss)for(let x=Math.ceil(l.spawn.x)+5;x<l.exit.x;x+=12){entity('pathlight',x,l.exit.y+2.5);l.criticalPath.push({x,y:l.exit.y});}
 return l;
}
