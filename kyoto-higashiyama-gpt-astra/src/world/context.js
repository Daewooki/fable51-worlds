import * as THREE from 'three';
import {cel} from '../core/toon.js';
import {box,rngKit} from '../core/util.js';
import {heightAt} from './terrain.js';
import {nearestPath} from './route.js';
/** Secondary town fabric keeps every framed lane within the Kyoto basin.
 * These quiet lower-detail buildings are explicitly separate from authored shops. */
export function buildContextTown(occupied,plants){
 const group=new THREE.Group();group.name='Surrounding Higashiyama town fabric';group.userData.batchCell=110;const rng=rngKit(792),walls=[0xb9b29e,0xc5baa2,0xa6ab9b,0xb9afa0].map(color=>cel({color})),roofs=[0x697c77,0x717e7d,0x788783,0x7d8175].map(color=>cel({color})),wood=cel({color:0x797364}),window=cel({color:0x8f9988});let count=0;
 for(let z=-38;z<284;z+=12.7){for(let x=-58;x<282;x+=12.8){const px=x+rng.range(-2,2),pz=z+rng.range(-2,2),p=nearestPath(px,pz);if(p.d<14||p.d>90)continue;if(px>141&&px<229&&pz>-22&&pz<67)continue;if(px>172&&px<221&&pz>68&&pz<146)continue;if(Math.hypot(px-185,pz-182)<20)continue;if(occupied.some(o=>Math.hypot(o.x-px,o.z-pz)<o.r*.55+6))continue;if(plants.some(o=>Math.hypot(o.x-px,o.z-pz)<2))continue;
 const w=rng.range(6.2,9.4),d=rng.range(7.5,10),h=rng.range(3.7,5.5),y=heightAt(px,pz),g=new THREE.Group(),m=roofs[count%roofs.length];g.position.set(px,y,pz);g.add(box(w,h,d,walls[count%4],0,h/2,0));
 const rw=w+.75,rd=d+.9,rise=1.05;const points=[[-rw/2,0,-rd/2],[rw/2,0,-rd/2],[-rw/2,rise,0],[rw/2,rise,0],[-rw/2,0,rd/2],[rw/2,0,rd/2]],positions=points.flat(),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex([0,2,1,1,2,3,2,4,3,3,4,5,0,4,2,1,3,5,0,1,4,1,5,4]);geo.computeVertexNormals();const roof=new THREE.Mesh(geo,m);roof.position.y=h;roof.castShadow=true;g.add(roof);g.add(box(rw,.12,.2,m,0,h+rise,0));
 for(const face of[-1,1]){g.add(box(w,.15,.11,wood,0,h*.5,face*(d/2+.055)),box(w,.14,.11,wood,0,.2,face*(d/2+.055)));for(const k of[-.31,.24]){g.add(box(w*.28,1.05,.08,window,w*k,h*.69,face*(d/2+.06)));for(let n=-2;n<=2;n++)g.add(box(.045,1.08,.1,wood,w*k+n*.23,h*.69,face*(d/2+.11)));}for(const k of[-.48,0,.48])g.add(box(.13,h,.14,wood,w*k,h/2,face*(d/2+.09)));}
 for(const face of[-1,1]){g.add(box(.12,.13,d,wood,face*(w/2+.04),h*.5,0));for(const k of[-.28,.26]){g.add(box(.075,1.03,d*.22,window,face*(w/2+.06),h*.70,d*k));for(let n=-2;n<=2;n++)g.add(box(.095,1.08,.052,wood,face*(w/2+.1),h*.70,d*k+n*.24));}for(const k of[-.47,0,.47])g.add(box(.12,h,.13,wood,face*(w/2+.07),h/2,d*k));}
 g.traverse(o=>{if(o.isMesh){o.receiveShadow=false;o.castShadow=false;}});group.add(g);count++;
 }}return{group,count};
}
