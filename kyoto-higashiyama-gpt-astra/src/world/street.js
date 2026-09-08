import * as THREE from 'three';
import { cel } from '../core/toon.js';
import { box,cyl,rngKit } from '../core/util.js';
import { segments,nearestPath } from './route.js';
import { heightAt } from './terrain.js';

export function buildStreetDetails(ctx){
 const g=new THREE.Group();g.name='stone courses, drainage and utility streets';const rng=rngKit(813);
 const stone=[0xc4c0af,0xcac4b4,0xbab9ae,0xc1bbac,0xc9c5b7].map(color=>cel({color,bands:3}));
 const curb=cel({color:0xb0ac9c}),dark=cel({color:0x777c75}),mark=cel({color:0xdfd4bb});
 let stones=0;
 for(const s of segments){if((s.branch===0&&s.index>=22)||s.branch===7)continue;const dx=(s.b[0]-s.a[0])/s.length,dz=(s.b[1]-s.a[1])/s.length,ry=Math.atan2(dx,dz);const historical=s.a[0]>142;
 const stair=s.branch===0&&[5,15,17,20].includes(s.index);const spacing=stair?s.length*.16/(s.b[2]-s.a[2]):historical?.82:1.3;
 for(let dist=stair?spacing*.5:.35;dist<s.length-.2;dist+=spacing){let t=dist/s.length,x=s.a[0]+dx*dist,z=s.a[1]+dz*dist,w=s.a[3]+(s.b[3]-s.a[3])*t;const np=nearestPath(x,z);if(np.branch!==s.branch||np.index!==s.index)continue;
 for(const side of[-1,1]){
 let qx=x-dz*(w/2+.17)*side,qz=z+dx*(w/2+.17)*side;const cross=nearestPath(qx,qz);if(cross.d<cross.width/2-.12)continue;
 const c=box(.3,.12,spacing+.012,curb,qx,heightAt(qx,qz)+.06,qz);c.rotation.y=ry;g.add(c);
 const drain=box(.1,.025,spacing*.94,dark,x-dz*(w/2-.1)*side,heightAt(x,z)+.041,z+dx*(w/2-.1)*side);drain.rotation.y=ry;g.add(drain);
 if(!historical){let q=box(.065,.012,spacing,mark,x-dz*(w/2-.9)*side,heightAt(x,z)+.032,z+dx*(w/2-.9)*side);q.rotation.y=ry;g.add(q);}
 }
 if(historical){const count=Math.floor((w-.6)/.85),tw=(w-.58)/count;
 for(let j=0;j<count;j++){let side=(j+.5)*tw-(w-.58)/2;let px=x-dz*side,pz=z+dx*side;
 const p=box(tw-.035,.044,spacing-.032,stone[rng.int(0,stone.length-1)],px,heightAt(x,z)+.027,pz);p.rotation.y=ry;g.add(p);stones++;}
 }else{
 for(const side of[-1,1]){let p=box(.72,.03,spacing-.04,stone[(Math.floor(dist)+1)%stone.length],x-dz*(w/2-.48)*side,heightAt(x,z)+.02,z+dx*(w/2-.48)*side);p.rotation.y=ry;g.add(p);}
 }
 if(Math.round(dist*3)%23===0){const grate=new THREE.Group();for(let j=0;j<7;j++)grate.add(box(.18,.022,.014,dark,j*.026-.08,.04,0));grate.position.set(x-dz*(w/2-.3),heightAt(x,z),z+dx*(w/2-.3));grate.rotation.y=ry;g.add(grate);}
 }
 }
 g.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=false;}});ctx.add(g);ctx.stats.pavingStones=stones;
}
export function utilityPole(ctx,x,z,next){
 const y=heightAt(x,z),g=new THREE.Group(),pole=cel({color:0x8e9386}),metal=cel({color:0x565e57});g.position.set(x,y,z);g.name='utility pole';
 g.add(cyl(.095,.15,7,9,pole,0,3.5,0),box(1.6,.11,.12,metal,0,6.5,0),box(.2,.55,.2,pole,.12,5.8,0));
 for(let i=-1;i<=1;i++)g.add(cyl(.07,.07,.18,7,cel({color:0xc2c2a4}),i*.6,6.62,0));
 for(let j=0;j<3;j++)g.add(box(.025,.035,.2,metal,.13,1+j*.45,0));
 if(next){for(let k=-1;k<=1;k++){const pts=[];for(let i=0;i<=16;i++){let t=i/16;pts.push(new THREE.Vector3((next.x-x)*t+k*.45,6.6+(heightAt(next.x,next.z)-y)*t-Math.sin(t*Math.PI)*.8,(next.z-z)*t));}const curve=new THREE.CatmullRomCurve3(pts);g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,16,.013,4,false),metal));}}
 ctx.add(g);ctx.collide(x-.18,z-.18,x+.18,z+.18,y+7,y);
}
