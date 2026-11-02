import { T } from './constants.js';
import { moveBody, groundAhead, wallAhead, lineOfSight } from './physics.js';
export const ENEMY_TYPES = {
  dummy:{hp:6,w:.8,h:1.7,contactDmg:0,gold:0,flying:false},
  skeleton:{hp:3,w:.8,h:1.7,contactDmg:1,gold:3,flying:false},
  skeleton_thrower:{hp:2,w:.8,h:1.7,contactDmg:1,gold:4,flying:false},
  dwarf_undead:{hp:5,w:1,h:1.5,contactDmg:1,gold:5,flying:false},
  undead_knight:{hp:8,w:1,h:1.9,contactDmg:2,gold:8,flying:false},
  wisp:{hp:2,w:.7,h:.7,contactDmg:1,gold:3,flying:true},
  goblin:{hp:2,w:.7,h:1.2,contactDmg:1,gold:3,flying:false},
  goblin_shaman:{hp:3,w:.7,h:1.3,contactDmg:1,gold:5,flying:false},
  rock_golem:{hp:14,w:1.6,h:2.6,contactDmg:2,gold:12,flying:false,armored:true},
  ghost:{hp:3,w:.9,h:1.6,contactDmg:0,gold:4,flying:true,alpha:.25,intangible:true},
  dwarf_bomber:{hp:4,w:.9,h:1.4,contactDmg:1,gold:5,flying:false},
  crystal_turret:{hp:4,w:1,h:1.6,contactDmg:1,gold:4,flying:false},
  dwarf_king:{hp:70,w:1.4,h:2.4,contactDmg:0,gold:50,flying:false,bossName:'The Hollow King'},
  forge_golem:{hp:90,w:2.4,h:3.6,contactDmg:0,gold:50,flying:false,armored:true,bossName:'The Forge Colossus'},
  bone_lord:{hp:80,w:1.2,h:2.6,contactDmg:0,gold:50,flying:false,bossName:'The Bone Lord'},
  demon:{bossName:'The Ash Demon',hp:100,w:2.4,h:3.2,contactDmg:0,gold:50,flying:true},
};
export function createEnemy(type,x,y,rng) {
  const spec=ENEMY_TYPES[type];
  if(!spec) throw new Error('Unknown enemy: '+type);
  return { ...spec,type,x,y,vx:0,vy:0,facing:rng&&rng.next()<.5?-1:1,maxHp:spec.hp,
    intro:!!spec.bossName,stunned:false,alive:true,remove:false,boss:!!spec.bossName,anim:spec.flying?'fly':'idle',telegraph:0,
    state:'idle',timer:.3,phase:1,attackIndex:0,age:0,homeX:x,homeY:y,guarding:false,noticed:false,hitChain:0,lastHitAge:-10,boneTimer:0 };
}
function enter(e,state,time,anim=state) {e.state=state;e.timer=time;e.anim=anim;e.telegraph=0;}
function melee(e,w,width=2,dmg=1) {
  w.spawnHitbox({src:e,x:e.x+e.facing*(e.w/2+width/2-.2),y:e.y,w:width,h:e.h,dmg,ttl:.16,knockX:e.facing*7,knockY:5});
}
function attack(e,w) {
  const p=w.player, dx=p.x-e.x, dy=p.y-e.y;
  if(e.type==='skeleton_thrower') {
    const x=e.x+e.facing*.6,y=e.y+1.3,flight=.9,gravity=12;
    w.spawnProjectile({src:e,x,y,vx:(p.x-x)/flight,vy:(p.y+.2-y)/flight+gravity*flight/2,r:.2,dmg:1,ttl:2.5,gravity,kind:'bone'});
    e.boneTimer=2.55;
    enter(e,'active',.2,'throw');
  } else if(e.type==='wisp') {
    const d=Math.max(.1,Math.hypot(dx,dy));e.vx=dx/d*10;e.vy=dy/d*10;
    melee(e,w,1.3);enter(e,'active',.28,'attack');
  } else {
    if(e.type==='dwarf_undead') e.vx=e.facing*12;
    if(e.type==='undead_knight') e.vx=e.facing*7;
    melee(e,w,e.type==='undead_knight'?2.7:2,e.type==='undead_knight'?2:1);
    enter(e,'active',e.type==='dwarf_undead'?.3:.16,e.comboSecond?'attack2':'attack');
  }
}
export function updateEnemy(e,dt,w) {
  if(e.remove) return;
  dt=Math.max(0,Math.min(dt,.05));e.age+=dt;e.timer-=dt;
  if(!e.alive) {e.vx=0;e.vy=0;if(e.timer<=0)e.remove=true;return;}
  if(e.type==='dummy') {
    e.guarding=false;e.telegraph=0;e.contactDmg=0;
    if(e.age-e.lastHitAge>=3)e.hp=e.maxHp;
    if(e.state==='hurt'&&e.timer>0){e.vx*=Math.exp(-10*dt);e.anim='hurt';}
    else {e.vx=0;enter(e,'idle',0,'idle');}
    e.vy=Math.max(-22,e.vy-46*dt);
    (w.moveBody||moveBody)(w.level,e,dt);
    return;
  }
  const p=w.player, dx=p.x-e.x, dy=p.y-e.y;
  if(e.boss){if(e.type==='demon')updateBoss(e,dt,w);else updateGroundBoss(e,dt,w);return;}
  if(NEW_TYPES.has(e.type)){updateNewEnemy(e,dt,w);return;}
  e.boneTimer=Math.max(0,e.boneTimer-dt);
  const sees=!p.dead&&Math.abs(dx)<14&&Math.abs(dy)<9&&
    (w.lineOfSight||lineOfSight)(w.level,e.x,e.y+e.h*.6,p.x,p.y+p.h*.5);
  const canAttack=sees&&Math.abs(dx)<12&&(e.type==='skeleton_thrower'||Math.abs(dy)<2);
  const safe=dir=>(w.groundAhead||groundAhead)(w.level,e,dir)&&!(w.wallAhead||wallAhead)(w.level,e,dir);
  e.guarding=false;
  if(e.state==='hurt') {
    e.vx*=Math.exp(-5*dt);
    if(e.timer<=0)enter(e,'recover',.5,'idle');
  } else if(e.state==='alert') {
    e.vx=0;e.vy=0;
    if(e.timer<=0)enter(e,'pursue',0,'walk');
  } else if(e.state==='windup') {
    e.vx=0;e.vy=0;
    const ramp=Math.min(1,1-e.timer/e.windupTime);
    e.telegraph=ramp;
    if(e.boss) {
      // Distinct visible preparations without requiring renderer changes:
      // draw back for a swoop, rise for a slam, hold and glow for the fan.
      if(e.telegraphKind==='swoop')e.vx=-e.facing*1.5;
      if(e.telegraphKind==='slam'){e.vy=2;e.telegraph=Math.sqrt(ramp);}
      if(e.telegraphKind==='fire')e.telegraph=ramp*ramp;
    }
    if(e.timer<=0) {
      if(canAttack&&(e.type!=='skeleton_thrower'||Math.abs(dx)>=4))attack(e,w);
      else enter(e,'recover',.5,'idle');
    }
  } else if(e.state==='active') {
    if(e.type==='dwarf_undead'&&(!safe(e.facing)||!(w.groundAhead||groundAhead)(w.level,{...e,x:e.x+e.vx*dt},e.facing))) {e.vx=0;enter(e,'recover',.8,'idle');}
    else if(e.timer<=0) {
      e.vx=0;e.vy=0;
      if(e.type==='skeleton'&&e.combo&&!e.comboSecond&&canAttack&&Math.abs(dx)<2.6) {
        e.comboSecond=true;e.windupTime=.4;enter(e,'windup',.4,'windup');
      } else enter(e,e.type==='wisp'?'retreat':'recover',e.boss&&e.phase===2?.5:.7,e.boss?'idle':e.flying?'fly':'idle');
    }
  } else if(e.state==='landing') {
    e.vx=0;e.vy=-7;
    if(e.onGround) {
      for(let i=-3;i<=3;i++) {
        const x=e.x+i*2;
        if(w.level.tiles[Math.floor(e.y-1)*w.level.w+Math.floor(x)]===T.SOLID)
          w.spawnHitbox({src:e,x,y:e.y,w:1.8,h:1.1,dmg:2,ttl:.16,knockX:i<0?-8:8,knockY:7});
      }
      w.shake?.(.65);e.vy=0;enter(e,'recover',.8,'idle');
    } else if(e.timer<=0)enter(e,'recover',.8,'idle');
  } else if(e.state==='retreat') {
    e.vx=-e.facing*4;e.vy=2;
    if(e.timer<=0)enter(e,'recover',.5,'fly');
  } else if(e.state==='recover') {
    e.vx=0;e.vy=0;if(e.timer<=0)enter(e,'pursue',0,'idle');
  } else if(sees&&!e.noticed) {
    e.noticed=true;e.facing=Math.sign(dx)||e.facing;e.vx=0;e.vy=0;enter(e,'alert',.25,'idle');
  } else {
    if(sees)e.facing=Math.sign(dx)||e.facing;
    const distance=Math.abs(dx),thrower=e.type==='skeleton_thrower';
    const range=e.boss?10:thrower?10:e.type==='dwarf_undead'?6:e.type==='wisp'?6:2.1;
    const boneBusy=thrower&&(w.projectiles?w.projectiles.some(b=>b.src===e&&b.kind==='bone'&&b.alive!==false):e.boneTimer>0);
    if(canAttack&&distance<=range&&(!thrower||(distance>=4&&!boneBusy))) {
      e.combo=e.type==='skeleton'&&e.attackIndex++%3===1;e.comboSecond=false;
      e.windupTime=e.boss?(e.phase===2?.4:.6):e.type==='undead_knight'?.6:.5;
      e.telegraphKind=e.boss?['swoop','slam','fire'][e.attackIndex%3]:e.type==='dwarf_undead'?'dust':'strike';
      enter(e,'windup',e.windupTime,'windup');
    } else if(e.flying) {
      e.anim='fly';e.vx=sees?Math.sign(dx)*(distance>range?3:distance<4?-2:0):0;
      e.vy=e.boss?Math.max(-3,Math.min(3,dy)):Math.max(-2,Math.min(2,p.y+2-e.y))+Math.sin(e.age*3)*.4;
    } else {
      e.guarding=e.type==='undead_knight'&&sees;
      const speed=e.type==='undead_knight'?1.7:e.type==='dwarf_undead'?2.8:2.6;
      const dir=thrower&&sees&&distance<5?-e.facing:e.facing;
      e.vx=safe(dir)?dir*speed:0;e.anim=e.vx?'walk':'idle';
      if(!sees&&!safe(dir))e.facing*=-1;
    }
  }
  if(!e.flying)e.vy=Math.max(-22,e.vy-46*dt);
  // Substeps keep high-speed knockback and dives from tunnelling through tiles.
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(e.vx),Math.abs(e.vy))*dt/.2));
  for(let i=0;i<steps;i++)(w.moveBody||moveBody)(w.level,e,dt/steps);
  if(e.boss) {
    const room=w.level.rooms?.find(r=>r.type==='boss');
    if(room) {
      e.x=Math.max(room.x+1+e.w/2,Math.min(room.x+room.w-1-e.w/2,e.x));
      e.y=Math.max(room.y+1,Math.min(room.y+room.h-e.h-1,e.y));
    }
  }
}
export function damageEnemy(e,dmg,dirX,w) {
  if(e.type==='ghost'&&e.alpha<.6)return {killed:false,blocked:true};
  if(!e.alive)return {killed:false,blocked:false};
  if(e.boss&&(e.intro||e.state==='phaseshift'))return {killed:false,blocked:true};
  // dirX is the incoming knockback direction: a frontal blow opposes facing.
  if(e.type==='undead_knight'&&e.guarding&&dirX*e.facing<0) {
    e.anim='block';w.sfx?.('block');return {killed:false,blocked:true};
  }
  if(e.type==='dummy')e.lastHitAge=e.age;
  e.hp=Math.max(e.type==='dummy'&&!e.mortal?1:0,e.hp-Math.max(0,dmg));
  if(e.hp===0) {e.alive=false;e.guarding=false;e.stunned=false;e.contactDmg=0;enter(e,'death',e.boss?3:1.2,'death');if(e.boss)(w.events||(w.events=[])).push({t:'bossDying',e});return {killed:true,blocked:false};}
  if(!e.boss&&!e.armored&&e.type!=='crystal_turret') {
    e.hitChain=e.age-e.lastHitAge<1?e.hitChain+1:1;e.lastHitAge=e.age;
    const stagger=e.hitChain>=3;if(stagger)e.hitChain=0;
    e.guarding=false;e.noticed=true;e.vx=Math.sign(dirX)*(e.type==='dummy'?2:6);e.vy=e.type==='dummy'?0:3;enter(e,'hurt',stagger?.5:.22,'hurt');
  }
  w.sfx?.('hit');return {killed:false,blocked:false};
}

// Boss attacks use committed world-space targets, independent of grunt range gates.
function updateBoss(e,dt,w) {
  const r=w.level.rooms.find(r=>r.type==='boss'), p=w.player;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const left=r.x+6+e.w/2, right=r.x+r.w-2-e.w/2;
  let floor=r.y+1;
  for(let y=r.y;y<r.y+r.h;y++)if(w.level.tiles[y*w.level.w+Math.floor((left+right)/2)]===T.SOLID)floor=y+1;else break;
  const top=r.y+r.h-2-e.h, hover=Math.min(top,floor+4.5);
  const event=t=>(w.events||(w.events=[])).push({t,e});
  const summon=()=>{
    const live=(w.enemies||[]).filter(a=>a.alive&&a.type==='wisp').length;
    for(let i=0;i<Math.min(2,3-live);i++)w.spawnEnemy?.('wisp',clamp(e.x+(i?3:-3),left,right),hover);
  };
  const steer=(x,y,speed=7)=>{e.vx=clamp((x-e.x)*5,-speed,speed);e.vy=clamp((y-e.y)*5,-speed,speed);};
  const recover=()=>{e.contactDmg=0;enter(e,'recover',e.phase===2?.6:.9,'fly');};
  const dive=()=>{
    const dx=e.aim.x-e.x,dy=e.aim.y-e.y,d=Math.max(.001,Math.hypot(dx,dy)),speed=e.phase===2?16:13;
    e.vx=dx/d*speed;e.vy=dy/d*speed;e.contactDmg=2;
    enter(e,'swoop',(d+4)/speed,'attack');
  };
  e.facing=Math.sign(p.x-e.x)||e.facing;e.contactDmg=0;
  if(e.intro){
    e.x=clamp(e.homeX,left,right);e.y=hover;e.homeY=hover;e.vx=e.vy=0;e.anim='fly';
    if(!p.dead&&p.x>=r.x+6&&p.x<r.x+r.w-2&&p.y>=floor&&p.y<r.y+r.h-2){e.intro=false;event('bossIntro');enter(e,'roar',1.6,'cast');}
    return;
  }
  if(e.phase===1&&!e.phasePending&&e.hp<=e.maxHp*.5){
    e.phasePending=true;e.stunned=false;e.waves=null;event('bossPhase');enter(e,'phaseshift',1.4,'cast');
  }
  if(e.waves){
    e.waveAge+=dt;
    while(e.waveIndex<e.waves.length&&e.waveAge>=e.waveIndex*.08){
      const x=e.waves[e.waveIndex++];w.spawnHitbox({src:e,x,y:e.slamY,w:1.4,h:1.4,dmg:2,ttl:.18,knockX:Math.sign(x-e.x)*8,knockY:7});
    }
    if(e.waveIndex===e.waves.length)e.waves=null;
  }
  if(e.state==='phaseshift'){
    e.vx=e.vy=0;e.telegraph=1;
    if(e.timer<=0){summon();e.phase=2;recover();}
  }else if(e.state==='roar'){
    e.vx=e.vy=0;if(e.timer<=0)recover();
  }else if(e.state==='windup'){
    e.vx=e.vy=0;e.telegraph=clamp(1-e.timer/e.windupTime,0,1);
    if(e.timer<=0){
      if(e.telegraphKind==='swoop'){e.returnAim={x:e.x,y:e.y};e.secondSwoop=false;dive();}
      else if(e.telegraphKind==='slam'){enter(e,'slam',2,'slam');e.vx=0;e.vy=-13;}
      else if(e.telegraphKind==='summon'){summon();recover();}
      else{
        const aim=Math.atan2(p.y+p.h*.5-(e.y+e.h*.5),p.x-e.x),n=e.phase===2?7:5;
        for(let i=0;i<n;i++){
          const a=aim+(i-(n-1)/2)*.3;
          w.spawnProjectile({src:e,x:e.x,y:e.y+e.h*.5,vx:Math.cos(a)*6,vy:Math.sin(a)*6,r:.28,dmg:1,ttl:5,gravity:0,kind:'fireball'});
        }recover();
      }
    }
  }else if(e.state==='swoop'){
    e.contactDmg=2;
    if(e.timer<=0||e.hitWallL||e.hitWallR||e.onGround){
      if(e.phase===2&&!e.secondSwoop){e.secondSwoop=true;e.aim={...e.returnAim};dive();}else recover();
    }
  }else if(e.state==='slam'){
    e.contactDmg=2;e.vx=0;e.vy=-13;
    if(e.y<=floor+.01){
      e.y=floor;e.vy=0;e.contactDmg=0;e.stunned=true;
      e.waves=[...e.slamXs].sort((a,b)=>Math.abs(a-e.x)-Math.abs(b-e.x));e.waveAge=0;e.waveIndex=0;
      enter(e,'stun',1.3,'hurt');w.shake?.(.65);
    }
  }else if(e.state==='stun'){
    e.vx=e.vy=0;e.anim=e.timer>1?'hurt':'idle';
    if(e.timer<=0){e.stunned=false;recover();}
  }else{
    steer(e.x,e.state==='rise'?hover:Math.min(hover,floor+1.2));
    if(e.timer<=0&&e.state!=='rise'){enter(e,'rise',.75,'fly');}
    else if(e.timer<=0&&!p.dead){
      const kind=e.phase===2&&(e.attackIndex+1)%4===0?'summon':['swoop','fire','slam'][e.cycleIndex||0];
      if(kind!=='summon')e.cycleIndex=((e.cycleIndex||0)+1)%3;
      e.attackIndex++;e.windupTime=e.phase===2?.5:.7;enter(e,'windup',e.windupTime,'windup');e.telegraphKind=kind;
      if(kind==='swoop')e.aim={x:clamp(p.x,left,right),y:clamp(p.y,floor,top)};
      if(kind==='slam'){
        e.slamY=floor;e.slamXs=[];
        for(let x=r.x+3;x<=r.x+r.w-3;x+=2)e.slamXs.push(x);
      }
    }
  }
  e.dropThrough=true;
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(e.vx),Math.abs(e.vy))*dt/.15));
  for(let i=0;i<steps;i++)(w.moveBody||moveBody)(w.level,e,dt/steps);
  e.x=clamp(e.x,left,right);e.y=clamp(e.y,floor,top);

}


const NEW_TYPES=new Set(['goblin','goblin_shaman','rock_golem','ghost','dwarf_bomber','crystal_turret']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Full footprint checks are shared by teleport placement and floor shockwaves.
function clearBody(l,e,x,y) {
  if(x-e.w/2<1||x+e.w/2>l.w-1||y<1||y+e.h>l.h-1)return false;
  for(let yy=Math.floor(y+.0001);yy<=Math.floor(y+e.h-.0001);yy++)
    for(let xx=Math.floor(x-e.w/2+.0001);xx<=Math.floor(x+e.w/2-.0001);xx++)
      if(l.tiles[yy*l.w+xx]===T.SOLID)return false;
  return true;
}
function standable(l,e,x,y) {
  if(!clearBody(l,e,x,y))return false;
  for(const xx of [x-e.w/2+.001,x+e.w/2-.001])
    if(![T.SOLID,T.PLATFORM].includes(l.tiles[Math.floor(y-.001)*l.w+Math.floor(xx)]))return false;
  return true;
}
function updateNewEnemy(e,dt,w) {
  const p=w.player,l=w.level,dx=p.x-e.x,dy=p.y-e.y,distance=Math.abs(dx);
  const ghost=e.type==='ghost',turret=e.type==='crystal_turret',golem=e.type==='rock_golem';
  const shaman=e.type==='goblin_shaman',bomber=e.type==='dwarf_bomber';
  const sees=!p.dead&&distance<=12&&Math.abs(dy)<9&&(ghost||(w.lineOfSight||lineOfSight)(l,e.x,e.y+e.h/2,p.x,p.y+p.h/2));
  const eligible=sees&&(shaman||bomber||turret||Math.abs(dy)<2);
  e.cooldown=Math.max(0,(e.cooldown||0)-dt);
  e.bombs=(e.bombs||[]).filter(b=>{b.remaining-=dt;return b.remaining>0;});
  const bombCount=w.projectiles?w.projectiles.filter(b=>b.src===e&&b.kind==='bomb'&&b.alive!==false&&(b.ttl===undefined||b.ttl>0)).length:e.bombs.length;
  const recover=(t)=>{e.vx=e.vy=0;enter(e,'recover',t,ghost?'fly':'idle');};
  const shot=(kind,speed,extra={})=>{
    const x=e.x,y=e.y+e.h*.65,a=Math.atan2(p.y+p.h*.5-y,p.x-x);
    w.spawnProjectile({src:e,x,y,kind,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:kind==='orb'?.35:.2,dmg:1,ttl:kind==='orb'?5:3,gravity:0,...extra});
  };
  if(shaman&&sees&&distance<3&&e.state!=='blink'&&e.cooldown<=0){
    const room=l.rooms?.find(r=>e.x>=r.x&&e.x<r.x+r.w&&e.y>=r.y&&e.y<r.y+r.h);
    let spot;
    for(let y=Math.max(1,Math.ceil(e.y-1));y<=Math.min(l.h-2,Math.floor(e.y+1));y++)
      for(let x=1.5;x<l.w-1;x++)if(Math.abs(x-p.x)>=6&&Math.abs(x-p.x)<=8&&(!room||x-e.w/2>=room.x+1&&x+e.w/2<=room.x+room.w-1)&&standable(l,e,x,y))
        if(!spot||Math.abs(x-e.x)<Math.abs(spot.x-e.x))spot={x,y};
    if(spot){const events=w.events||(w.events=[]);events.push({t:'blink',x:e.x,y:e.y});e.x=spot.x;e.y=spot.y;events.push({t:'blink',x:e.x,y:e.y});e.cooldown=.5;enter(e,'blink',.5,'idle');}
  }
  if(e.waves){
    e.waveAge+=dt;
    while(e.waveIndex<e.waves.length&&e.waveAge>=Math.floor(e.waveIndex/2)*.1){
      const x=e.waves[e.waveIndex++];w.spawnHitbox({src:e,x,y:e.slamY,w:1.1,h:1.1,dmg:2,ttl:.18,knockX:Math.sign(x-e.x)*8,knockY:7});
    }
    if(e.waveIndex===e.waves.length)e.waves=null;
  }
  if(e.state==='hurt'){e.vx*=Math.exp(-5*dt);if(e.timer<=0)recover(.4);}
  else if(e.state==='windup'){
    e.vx=e.vy=0;e.telegraph=clamp(1-e.timer/e.windupTime,0,1);
    if(e.timer<=0){
      if(!eligible)recover(.5);
      else if(e.type==='goblin'){e.vx=e.facing*9;e.vy=9;enter(e,'leap',1,'attack');}
      else if(shaman){shot('orb',3.5,{homing:1.6});e.cooldown=1.9;enter(e,'cast',.2,'attack');}
      else if(bomber){
        if(bombCount<2){const x=e.x,y=e.y+e.h*.75,g=14,t=clamp(distance/7,.65,1.1);
          w.spawnProjectile({src:e,x,y,kind:'bomb',vx:(p.x-x)/t,vy:(p.y+.3-y)/t+g*t/2,r:.3,dmg:2,ttl:4,gravity:g,fuse:1.2,radius:1.8,bounce:true});e.bombs.push({remaining:1.2});}
        e.cooldown=2.5;enter(e,'throw',.25,'throw');
      }else if(golem){e.waves=[...e.slamXs];e.waveAge=0;e.waveIndex=0;w.shake?.(.5);enter(e,'slam',.3,'slam');}
      else if(ghost){const a=Math.atan2(p.y-e.y,dx);e.vx=Math.cos(a)*9;e.vy=Math.sin(a)*9;enter(e,'dash',clamp((Math.hypot(dx,dy)+2)/9,.25,1.5),'attack');}
      else {e.burstLeft=3;e.burstTimer=0;enter(e,'burst',.5,'idle');}
    }
  }else if(e.state==='leap'){
    if(e.onGround||e.timer<=0)recover(.6);else melee(e,w,.9);
  }else if(e.state==='dash'){
    if(e.timer<=0)recover(1.2);else melee(e,w,.9);
  }else if(e.state==='burst'){
    e.burstTimer-=dt;
    if(e.burstLeft&&e.burstTimer<=0){if(sees)shot('bolt',9);e.burstLeft--;e.burstTimer+=.15;}
    if(!e.burstLeft){e.cooldown=1.1;recover(.2);}
  }else if(['recover','blink','cast','throw','slam'].includes(e.state)){
    e.vx=e.vy=0;if(e.timer<=0)recoverTransition();
  }else{
    if(sees)e.facing=Math.sign(dx)||e.facing;
    const range=golem?4.5:e.type==='goblin'?3.5:ghost?5:12;
    if(eligible&&distance<=range&&(!shaman||distance>=6)&&(!bomber||distance>=5)&&e.cooldown<=0&&(!bomber||bombCount<2)){
      e.windupTime=golem?.8:shaman||turret?.6:ghost||bomber?.5:.35;
      enter(e,'windup',e.windupTime,'windup');e.telegraphKind=shaman?'cast':golem?'slam':'strike';
      if(golem){e.slamY=e.y;e.slamXs=[];for(let i=1;i<=3;i++)for(const dir of [-1,1]){const x=e.x+dir*(e.w/2+i*1.3);if(standable(l,{w:1.1,h:1.1},x,e.y))e.slamXs.push(x);}}
    }else{
      const dir=(shaman&&distance<6||bomber&&distance<5)?-e.facing:e.facing;
      const move=sees&&(!shaman&&!bomber||distance<(shaman?6:5)||distance>(shaman?9:8));
      e.vx=!turret&&move&&(ghost||(w.groundAhead||groundAhead)(l,e,dir)&&!(w.wallAhead||wallAhead)(l,e,dir))?dir*(golem?1.2:e.type==='goblin'?5:ghost?1.2:2.5):0;
      e.vy=ghost?clamp(dy,-1,1):0;e.anim=ghost?'fly':e.vx?(e.type==='goblin'?'run':'walk'):'idle';
    }
  }
  function recoverTransition(){if(e.state==='slam')recover(1.2);else enter(e,'pursue',0,ghost?'fly':'idle');}
  if(ghost){
    const solid=e.state==='windup'||e.state==='dash';e.alpha=clamp(e.alpha+(solid?1:-1)*dt/.3,.25,1);e.intangible=e.alpha<.6;e.contactDmg=e.state==='dash'?1:0;
    e.x=clamp(e.x+e.vx*dt,1+e.w/2,l.w-1-e.w/2);e.y=clamp(e.y+e.vy*dt,1,l.h-1-e.h);
  }else if(!turret){
    e.vy=Math.max(-22,e.vy-46*dt);
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(e.vx),Math.abs(e.vy))*dt/.15));
    for(let i=0;i<steps;i++)(w.moveBody||moveBody)(l,e,dt/steps);
  }else e.vx=e.vy=0;
}

// Ground bosses share the demon presentation contract, with committed attack markers.
function updateGroundBoss(e,dt,w) {
 const r=w.level.rooms.find(r=>r.type==='boss'),p=w.player;
 const left=r.x+2+e.w/2,right=r.x+r.w-2-e.w/2,floor=r.y+4;
 const event=t=>(w.events||(w.events=[])).push({t,e,x:e.x,y:e.y});
 const recover=(time=.9)=>{e.vx=0;e.stunned=true;enter(e,'stun',time,'hurt');};
 const summon=()=>{
  const type=e.type==='dwarf_king'?'dwarf_undead':'skeleton';
  if((w.enemies||[]).filter(a=>a.alive&&a.type===type).length>=4)return;
  for(const x of [left+5,right-5])w.spawnEnemy?.(type,x,floor);
 };
 e.contactDmg=0;
 if(e.intro){e.vx=e.vy=0;e.anim='idle';if(!p.dead&&p.x>=r.x+6){e.intro=false;event('bossIntro');enter(e,'roar',1.6,'cast');}return;}
 if(e.phase===1&&!e.phasePending&&e.hp<=e.maxHp/2){e.phasePending=true;e.stunned=false;e.waves=null;event('bossPhase');enter(e,'phaseshift',1.4,'cast');}
 if(e.waves){
  e.waveAge+=dt;
  while(e.waveIndex<e.waves.length&&e.waveAge>=e.waveIndex*(e.telegraphKind==='spikes'?.12:.07)){
   const x=e.waves[e.waveIndex++];w.spawnHitbox({src:e,x,y:e.slamY,w:1.5,h:e.telegraphKind==='erupt'?8:1.6,dmg:2,ttl:.25,knockX:Math.sign(x-e.x)*8,knockY:7});
  }
  if(e.waveIndex===e.waves.length){e.waves=null;if(e.doubleSlam){e.doubleSlam=false;e.waves=[...e.slamXs];e.waveAge=-.35;e.waveIndex=0;}}
 }
 if(e.state==='phaseshift'){
  e.vx=0;e.telegraph=1;if(e.timer<=0){e.phase=2;if(e.type==='dwarf_king')summon();recover(.8);}
 }else if(e.state==='roar'){e.vx=0;if(e.timer<=0)recover(.5);}
 else if(e.state==='stun'){e.vx=0;if(e.timer<=0){e.stunned=false;enter(e,'idle',.15,'idle');}}
 else if(e.state==='windup'){
  e.vx=0;e.telegraph=clamp(1-e.timer/e.windupTime,0,1);
  if(e.timer<=0){
   const kind=e.telegraphKind;
   if(kind==='charge'||kind==='dash'){e.facing=Math.sign(e.aim.x-e.x)||e.facing;e.vx=e.facing*(kind==='charge'?13:17);enter(e,'rush',3,'attack');}
   else if(kind==='rock'){
    w.spawnProjectile({src:e,kind:'bomb',x:e.x,y:e.y+e.h*.8,vx:(e.aim.x-e.x)/.9,vy:7,gravity:14,r:.4,ttl:3,fuse:.9,radius:2.2,dmg:2,bounce:true});recover(1.2);
   }else if(kind==='summon'){summon();recover(1);}
   else{e.waves=[...e.slamXs];e.waveAge=0;e.waveIndex=0;e.doubleSlam=e.type==='dwarf_king'&&e.phase===2;w.shake?.(.5);recover(e.doubleSlam?1.8:1.2);}
  }
 }else if(e.state==='rush'){
  e.contactDmg=2;
  if(e.hitWallL||e.hitWallR||e.x<=left+.05||e.x>=right-.05||e.timer<=0)recover(1.2);
 }else if(!p.dead&&e.timer<=0){
  const cycle=e.type==='dwarf_king'?['slam','charge']:e.type==='forge_golem'?(e.phase===2?['erupt','slam','erupt','rock']:['slam','erupt','rock']):['dash','spikes','summon'];
  const kind=cycle[e.attackIndex++%cycle.length];
  if(e.type==='bone_lord'&&e.phase===2&&kind==='dash'){
   event('blink');e.x=p.x<(left+right)/2?right-3:left+3;event('blink');
  }
  e.facing=Math.sign(p.x-e.x)||1;e.aim={x:clamp(p.x,left,right),y:floor};
  e.windupTime=e.phase===2?.65:.9;enter(e,'windup',e.windupTime,'windup');e.telegraphKind=kind;e.slamY=floor;
  if(kind==='erupt')e.slamXs=Array.from({length:e.phase===2?6:4},(_,i)=>left+3+i*(right-left-6)/(e.phase===2?5:3));
  else if(kind==='spikes'){e.slamXs=[];for(let x=e.x+e.facing*2;x>left&&x<right;x+=e.facing*2)e.slamXs.push(x);}
  else if(kind==='slam')e.slamXs=[-4,-2,0,2,4].map(n=>clamp(e.x+n,left+1,right-1));
 }
 e.dropThrough=true;e.vy=Math.max(-22,e.vy-46*dt);
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(e.vx),Math.abs(e.vy))*dt/.15));
 for(let i=0;i<steps;i++)(w.moveBody||moveBody)(w.level,e,dt/steps);
 const hitBoundary=e.x<left||e.x>right;
 e.x=clamp(e.x,left,right);e.y=Math.max(floor,e.y);
 if(e.state==='rush'&&(hitBoundary||e.hitWallL||e.hitWallR))recover(1.2);
}
