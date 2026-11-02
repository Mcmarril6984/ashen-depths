import { T } from '../constants.js';

// Authored profiles expanded into top-to-bottom ASCII, as in chunks.js.
// All coordinates in the lesson definitions are local, with y pointing up.
const lessons = [
  {id:'move',w:20,entry:3,exit:4,profile:x=>x>=11?3:2,pits:[[7,2]]},
  {id:'jump',w:18,entry:4,exit:10,profile:x=>x<7?3:x<12?6:9},
  {id:'drop',w:14,entry:10,exit:5,profile:()=>4,roof:[[10,7,2]],platforms:[[2,9,8]]},
  {id:'dash',w:20,entry:5,exit:7,profile:x=>x<13?4:6,pits:[[7,6]]},
  {id:'walljump',w:14,entry:5,exit:14,profile:x=>x<6?4:x<9?4:13,roof:[[2,8,4]]},
  {id:'attack',w:26,entry:14,exit:14,profile:()=>13,enemies:[[8,14],[18,14]]},
  {id:'upslash',w:18,entry:14,exit:14,profile:()=>13,platforms:[[8,16,3]],enemies:[[9,17]]},
  {id:'pogo',w:21,entry:14,exit:18,profile:x=>x<14?13:17,pits:[[7,7]]},
  {id:'heal',w:16,entry:17,exit:17,profile:()=>16},
  {id:'shrine',w:24,entry:17,exit:17,profile:()=>16},
];
function ascii(s) {
  const h=Math.max(s.entry,s.exit)+14;
  const g=Array.from({length:h},()=>Array(s.w).fill('#'));
  for(let x=2;x<s.w-2;x++)for(let y=s.profile(x)+1;y<h-2;y++)g[y][x]='.';
  for(const [x,n] of s.pits||[])for(let xx=x;xx<x+n;xx++) {g[s.profile(xx)][xx]='.';g[s.profile(xx)-1][xx]=s.id==='move'?'.':'^';if(s.id==='pogo'){g[s.profile(xx)][xx]='^';g[s.profile(xx)-1][xx]='#';}}
  for(const [x,y,n] of s.roof||[])for(let xx=x;xx<x+n;xx++)for(let yy=y;yy<h-2;yy++)g[yy][xx]='#';
  for(const [x,y,n] of s.platforms||[])for(let xx=x;xx<x+n;xx++)g[y][xx]='=';
  // Overhead training niche: sword-up reaches through its thin stone shelf;
  // the underside stops a jump-sideways swing from reaching the dummy.
  if(s.id==='upslash') {
    for(let x=7;x<=11;x++){g[16][x]='#';g[19][x]='#';}
    for(let y=16;y<=19;y++){g[y][7]='#';g[y][11]='#';}
  }
  return g.reverse().map(r=>r.join(''));
}
export function generateTutorial() {
  let cursor=2,feet=5;
  const plans=lessons.map(s=>{const rows=ascii(s),p={...s,rows,x:cursor,y:feet-s.entry};cursor+=s.w;feet=p.y+s.exit;return p;});
  const shift=2-Math.min(...plans.map(p=>p.y));plans.forEach(p=>p.y+=shift);
  const w=cursor+2,h=Math.max(...plans.map(p=>p.y+p.rows.length))+2;
  const l={w,h,tiles:new Uint8Array(w*h).fill(T.SOLID),biome:'halls',spawn:null,exit:null,rooms:[],entities:[]};
  const put=(x,y,t)=>l.tiles[y*w+x]=t;
  const tip=(p,id,x0,x1)=>l.entities.push({kind:'tip',id,x0:p.x+x0,x1:p.x+x1,y0:p.y+1,y1:p.y+p.rows.length-2});
  for(const p of plans){
    l.rooms.push({type:'tutorial',id:p.id,x:p.x,y:p.y,w:p.w,h:p.rows.length});
    p.rows.forEach((row,i)=>Array.from(row).forEach((c,x)=>put(p.x+x,p.y+p.rows.length-1-i,({'#':T.SOLID,'=':T.PLATFORM,'^':T.SPIKES})[c]||T.EMPTY)));
    tip(p,p.id,2,p.id==='attack'?13:p.id==='shrine'?15:p.w-2);
    if(p.id==='attack')tip(p,'combo',13,p.w-2);
    if(p.id==='shrine')tip(p,'exit',15,p.w-2);
    for(const [x,y] of p.enemies||[])l.entities.push({kind:'enemy',type:'dummy',x:p.x+x+.5,y:p.y+y});
    l.entities.push({kind:'torch',x:p.x+3.5,y:p.y+p.entry+2.5});
    if(['attack','heal','shrine'].includes(p.id))l.entities.push({kind:'decor',name:'banner',x:p.x+4.5,y:p.y+p.entry});
  }
  // Doorways only join matching entry/exit floors. No bypasses above/below lessons.
  for(let i=1;i<plans.length;i++){
    const p=plans[i],y=p.y+p.entry;
    for(let x=p.x-2;x<p.x+2;x++)for(let yy=y;yy<y+4;yy++)put(x,yy,T.EMPTY);
  }
  const first=plans[0],last=plans[plans.length-1];
  l.spawn={x:first.x+3.5,y:first.y+first.entry};
  l.exit={x:last.x+20.5,y:last.y+last.exit};
  l.entities.push({kind:'shrine',x:last.x+8.5,y:last.y+last.entry},
    {kind:'enemy',type:'skeleton',x:last.x+17.5,y:last.y+last.entry});
  return l;
}
