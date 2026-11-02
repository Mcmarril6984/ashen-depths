// Authored tile profiles, expanded into top-to-bottom ASCII. Two-tile rock shells.
// # rock, . air, = one-way ledge, ^ pit hazard, M ground enemy, W wisp.
const mirror = rows => rows.map(r => Array.from(r).reverse().join(''));
function cave(profile, height, {mark, ledges=[], pits=[], roof=[], enemies=[], air=[]}={}) {
 const w=profile.length+4, g=Array.from({length:height},()=>Array(w).fill('#'));
 for(let x=2;x<w-2;x++)for(let y=profile[x-2]+1;y<height-2;y++)g[y][x]='.';
 for(const [x,y,n] of roof)for(let xx=x;xx<x+n;xx++)for(let yy=y;yy<height-2;yy++)g[yy][xx]='#';
 for(const [x,n] of pits)for(let xx=x;xx<x+n;xx++){const floor=profile[xx-2];g[floor][xx]='.';g[floor-1][xx]='^';}
 for(const [x,y,n] of ledges)for(let xx=x;xx<x+n;xx++)if(g[y][xx]==='.')g[y][xx]='=';
 for(const x of enemies)g[profile[x-2]+1][x]='M';
 for(const [x,y] of air){
 const pocket=Array.from({length:w-4},(_,i)=>i+2).sort((a,b)=>Math.abs(a-x)-Math.abs(b-x)).find(xx=>g[y][xx]==='.'&&g[y+1][xx]==='.');
 if(pocket!==undefined)g[y][pocket]='W';
 }
 if(mark){const [ch,x]=mark;g[profile[x-2]+1][x]=ch;}
 return g.reverse().map(r=>r.join(''));
}
const flat=Array(24).fill(3);
const profiles=[
 flat,
 [3,3,3,3,5,5,5,5,7,7,7,7,9,9,9,9,11,11,11,11,13,13,15,15],
 [3,3,3,3,3,5,5,5,5,5,5,5,5,5,5,5,5,5,3,3,3,3,3,3],
 [3,3,3,3,5,5,5,5,3,3,3,3,3,3,5,5,5,5,3,3,3,3,3,3],
 [3,3,3,3,3,3,3,3,5,5,7,7,7,7,5,5,3,3,3,3,3,3,3,3],
 flat,flat,flat,
 [3,3,3,3,5,5,5,5,5,5,7,7,7,7,7,7,5,5,5,5,3,3,3,3],
 flat,flat,flat,
];
const combat=profiles.map((p,i)=>cave(p,i===1?22:16+i%4,{
 enemies:i===1?[4,10,18,24]:[4,9,17,23],
 ledges:i===1?[[3,8,4],[9,12,4],[16,16,4]]:[[7,6,4],[18,8+i%3,4],...([5,6,7,10].includes(i)?[[12,5,3]]:[])],
 pits:[5,6,7,10].includes(i)?[[12,3]]:[],
 roof:i===7?[[6,7,16]]:i===11?[[10,10,6]]:[],
 air:[[21,i===1?18:12]],
}));
// Dedicated descending shaft: a safe landing lies six tiles below its lip.
combat.push(cave([15,15,15,15,15,15,15,15,9,9,9,9,9,9,9,9,3,3,3,3,3,3,3,3],22,{enemies:[4,12,23],ledges:[[10,12,4],[18,6,4]],air:[[20,17]]}));
// New silhouettes retain a continuous readable rock floor band beneath the route.
const fill=(n,y=3)=>Array(n).fill(y);
const steps=(n,start,dir=1)=>Array.from({length:n},(_,i)=>start+dir*2*Math.floor(i/4));
const authored=[
 ['ambush',fill(10),10,{roof:[[2,7,10]],enemies:[3,5,7,9]}],
 ['shaft',steps(14,3),24,{ledges:[[3,7,3],[7,11,3],[11,15,3]],enemies:[4,9,14]}],
 ['raised-basin', [...fill(8),...fill(6,5),...fill(4,3),...fill(6,5),...fill(8)],18,{pits:[[17,2]],enemies:[5,12,25,31]}],
 ['gallery',fill(28),20,{ledges:[[4,9,10],[17,9,10]],enemies:[4,11,20,27],air:[[23,13]]}],
 ['collapsed',fill(22),16,{pits:[[7,3],[16,3]],ledges:[[7,5,3],[16,6,3]],enemies:[4,12,22]}],
 ['chasm-bridge',fill(32),24,{pits:[[9,18]],ledges:[[9,3,18],[11,7,4],[21,9,4]],enemies:[4,29,32]}],
 ['descent',steps(24,13,-1),22,{enemies:[4,10,18,24]}],
 ['pillars',[...fill(4),...fill(2,5),...fill(5),...fill(2,5),...fill(5),...fill(2,5),...fill(4)],18,{enemies:[3,10,17,24]}],
 ['alcove',fill(18),16,{ledges:[[5,5,4],[9,7,7]],roof:[[12,11,6]],enemies:[3,17,19]}],
 ['zigzag',steps(24,3),24,{ledges:[[3,8,5],[9,12,5],[15,16,4]],enemies:[4,10,18,25]}],
 ['low-vault',fill(14),12,{roof:[[6,8,7]],ledges:[[7,5,4]],enemies:[3,6,12,15]}],
 ['split-dais',[...fill(6),...fill(4,5),...fill(4,7),...fill(4,5),...fill(6)],20,{ledges:[[4,10,4],[21,10,4]],enemies:[4,9,16,23]}],
];
export const COMBAT_LAYOUTS=authored.flatMap(([id,p,h,opts])=>{
 const rows=cave(p,h,opts);
 if(id==='alcove') { const y=h-1-8; rows[y]=rows[y].substring(0,12)+'C'+rows[y].substring(13); }
 return [{id,rows},{id:id+'-mirror',rows:mirror(rows)}];
});
export const sizeClass=rows=>rows[0].length<=18?'small':rows[0].length<=28?'medium':'large';
function specials(ch){return [0,1,2].map(i=>cave(Array(14).fill(3),12+i*2,{mark:[ch,ch==='S'?4:12],ledges:i?[[5,7,4]]:[]}));}
const connector=[0,1,2].map(i=>cave(Array(6).fill(3),10,{pits:i?[[4,2]]:[],ledges:i?[[4,3,2]]:[],roof:[[2,8,6]]}));
const boss=cave(Array(40).fill(3),20,{mark:['S',4],enemies:[25],ledges:[[13,6,5],[24,6,5],[33,6,5]],roof:[[2,8,4]]});
const bossRows=boss.map(r=>r);bossRows[bossRows.length-1-4]=bossRows[bossRows.length-1-4].substring(0,39)+'E'+bossRows[bossRows.length-1-4].substring(40);
export const CHUNKS=Object.fromEntries(['halls','forge','hell'].map(b=>[b,{
 start:specials('S'),shrine:specials('A'),treasure:specials('C'),exit:specials('E'),
 combat:[...combat,...combat.map(mirror),...COMBAT_LAYOUTS.map(t=>t.rows)].map(rows=>b==='forge'?rows.map(r=>r.replace(/\^/g,'~')):rows),
 connector:connector.map(rows=>b==='forge'?rows.map(r=>r.replace(/\^/g,'~')):rows),boss:[bossRows],
}]));
