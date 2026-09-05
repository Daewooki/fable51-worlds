import * as T from 'three';
import type {Interior} from './types';
/** A support surface is selected using the previous feet level, so a basement
 * cannot snap up to an outdoor street plane or the floor above it. Stair callbacks
 * have priority only when their next tread is reachable in one walking step. */
export function interiorGround(interiors:Interior[],outdoor:(x:number,z:number)=>number){
 return (x:number,z:number,previousFeetY?:number)=>{
  const inside=interiors.filter(i=>x>=i.bounds.min.x&&x<=i.bounds.max.x&&z>=i.bounds.min.z&&z<=i.bounds.max.z);
  if(!inside.length)return outdoor(x,z);
  const feet=previousFeetY??outdoor(x,z),supports=inside.flatMap(i=>i.floors.filter(f=>f.contains(x,z)).map(f=>({id:f.id,y:f.height(x,z)})));
  const reachable=supports.filter(f=>f.y<=feet+.24);
  const stair=reachable.filter(f=>f.id.includes('stair')&&Math.abs(f.y-feet)<.36).sort((a,b)=>Math.abs(a.y-feet)-Math.abs(b.y-feet))[0];
  if(stair)return stair.y;
  if(reachable.length)return Math.max(...reachable.map(f=>f.y));
  // Narrow exterior bounds include thresholds/courtyard edges; no support means
  // ordinary sidewalk, unless already beneath grade where the previous level holds.
  return feet<outdoor(x,z)-1?feet:outdoor(x,z);
 };
}
export function installInteriorLighting(interior:Interior){
 if(interior.id!=='apple')return;
 const lights:T.PointLight[]=[];
 for(const [x,y,z]of [[-11,3.8,-8],[11,3.8,-16],[-10,8.3,-18],[10,8.3,-26]]){const light=new T.PointLight(0xf4f6e5,65,22,2);light.position.set(x,y,z);interior.group.add(light);lights.push(light);}
 interior.setLighting=(mode)=>{for(const l of lights)l.intensity=mode==='night'?85:65;};
}
