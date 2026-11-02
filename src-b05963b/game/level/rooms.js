import { T } from '../constants.js';

export const ROOM_SHAPES = ['colonnade','arena','stairs','canopy','corridor','vault','pit','balcony'];

// Local additions leave the entrance/exit landings and critical route intact.
// Every shelf is a deliberate 3–6 tile run; rock features grow from the floor.
export function dressRoom(r, start, end, put) {
 const x=r.x, mid=Math.max(start,end), flat=start===end;
 const shelf=(dx,y,n=4)=>{for(let j=0;j<n;j++)put(x+dx+j,y,T.PLATFORM);};
 if(start!==end)shelf(end>start?r.w-8:4,mid+2,3);
 const dais=(dx,n,height)=>{for(let j=0;j<n;j++)for(let y=start;y<start+height;y++)put(x+dx+j,y,T.SOLID);};
 switch(r.shape){
  case 'colonnade':
   shelf(6,mid+7);shelf(r.w-10,mid+7);shelf(Math.floor(r.w/2)-2,mid+4);
   if(flat){dais(7,3,2);dais(r.w-10,3,2);}break;
  case 'arena':
   if(flat){dais(5,4,2);dais(r.w-9,4,2);}
   shelf(Math.floor(r.w/2)-2,mid+4);break;
  case 'stairs':
   if(flat){dais(7,4,2);dais(11,4,4);dais(15,4,2);}
   else {shelf(7,mid+3);shelf(14,mid+5);}break;
  case 'canopy': shelf(3,mid+2,3);shelf(5,mid+4,5);shelf(11,mid+4,5);shelf(r.w-9,mid+7);break;
  case 'corridor': if(flat)dais(Math.floor(r.w/2)-2,4,2);break;
  case 'vault': shelf(5,mid+2);shelf(8,mid+4);shelf(12,mid+6,5);break;
  case 'pit':
   // A shallow cistern with an intact lower walking band; the existing biome
   // hazard profiles supply lethal pits without adding mandatory hazard gates.
   if(flat)for(let j=9;j<r.w-9;j++)for(let y=start-2;y<start;y++)put(x+j,y,T.EMPTY);
   shelf(Math.floor(r.w/2)-3,mid+2,6);
   break;
  case 'balcony': shelf(6,mid+2);shelf(10,mid+4,6);shelf(r.w-8,mid+2);break;
 }
}

// All open boundary tiles count, including optional rooms and horizontal edges.
export function doorwayTiles(level) {
 const out=[];
 for(const r of level.rooms)for(let x=r.x;x<r.x+r.w;x++)for(let y=r.y;y<r.y+r.h;y++){
  if(x!==r.x&&x!==r.x+r.w-1&&y!==r.y&&y!==r.y+r.h-1)continue;
  if(level.tiles[y*level.w+x]===T.EMPTY)out.push({x:x+.5,y:y+.5});
 }
 return out;
}
