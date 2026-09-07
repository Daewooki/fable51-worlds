import * as THREE from 'three';
import { box, cyl } from '../core/util.js';
import { cel, flat } from '../core/toon.js';
import { nearestPath } from './route.js';
import { makeLantern, makeBench, makePlanter } from './details.js';
import { makeStoneLantern } from './shrine.js';
import { makeWoodenSign } from './signage.js';

/** Authored pocket gardens and view-terminating walls. Terrain remains authoritative. */
export function buildDressing(ctx,heightAt){
 const stone=cel({color:0x999a86,bands:3}),stoneLight=cel({color:0xb8b5a0,bands:3}),plaster=cel({color:0xe0d2af,bands:3}),wood=cel({color:0x78644a,bands:3}),tile=cel({color:0x717e78,bands:3}),bamboo=cel({color:0xa2a67c,bands:3}),moss=cel({color:0x8c9f75,bands:'soft'});
 const groups=[];let props=0;
 const add=(g)=>{ctx.add(g);ctx.register?.(g);groups.push(g);return g;};
 const safe=(x,z,margin=.48)=>{const p=nearestPath(x,z);return p.d>p.width/2+margin;};
 const collider=(x,z,w,d,y,h)=>{if(safe(x,z,Math.max(w,d)/2+.05))ctx.collide(x-w/2,z-d/2,x+w/2,z+d/2,y+h,y-.1);};
 const plant=(x,z,type,scale)=>{if(safe(x,z,.3))ctx.plant?.(x,z,type,scale);};
 const detail=(g,x,z,ry=0,w=0,d=0,h=0)=>{const y=heightAt(x,z);g.position.set(x,y,z);g.rotation.y=ry;add(g);if(w&&d)collider(x,z,w,d,y,h);props++;return g;};
 function wall(x,z,len,axis='x',height=1.72,{gap=null,aged=false}={}){
  const g=new THREE.Group();g.name='garden-stone-and-plaster-wall';
  const n=Math.ceil(len/1.15),step=len/n;
  for(let i=0;i<n;i++){
   const u=-len/2+(i+.5)*step;
   if(gap&&Math.abs(u-gap.at)<gap.width/2+.1)continue;
   const px=x+(axis==='x'?u:0),pz=z+(axis==='z'?u:0);
   if(!safe(px,pz,.52))continue;
   const y=heightAt(px,pz),w=axis==='x'?step:.36,d=axis==='z'?step:.36;
   g.add(box(w,.45,d,stone,px,y+.225,pz),box(w-.018,height-.45,d-.025,plaster,px,y+.45+(height-.45)/2,pz));
   g.add(box(axis==='x'?step+.025:.61,.12,axis==='z'?step+.025:.61,tile,px,y+height+.02,pz));
   // Two sloped tile courses, a visible ridge, and slender plaster coping.
   const cap1=box(axis==='x'?step+.04:.33,.055,axis==='z'?step+.04:.33,tile,px+(axis==='z'?.13:0),y+height+.085,pz+(axis==='x'?.13:0));
   const cap2=cap1.clone();cap2.position.set(px-(axis==='z'?.13:0),y+height+.085,pz-(axis==='x'?.13:0));
   if(axis==='x'){cap1.rotation.x=.2;cap2.rotation.x=-.2;}else{cap1.rotation.z=-.2;cap2.rotation.z=.2;}
   g.add(cap1,cap2,box(axis==='x'?step+.045:.095,.09,axis==='z'?step+.045:.095,tile,px,y+height+.16,pz));
   // Broad stone joints stay subordinate to the facade lattice.
   for(const s of[-1,1])for(const hh of[.13,.3])g.add(box(axis==='x'?step-.045:.012,.018,axis==='z'?step-.045:.012,stoneLight,px+(axis==='z'?s*.187:0),y+hh,pz+(axis==='x'?s*.187:0)));
   if(i%3===0)g.add(box(axis==='x'?.19:.42,height+.12,axis==='z'?.19:.42,aged?stone:plaster,px,y+height/2+.03,pz));
   if(aged&&i%2===0){const patch=new THREE.Mesh(new THREE.IcosahedronGeometry(.33,0),moss);patch.scale.set(axis==='x'?1.3:.38,.24,axis==='z'?1.3:.38);patch.position.set(px,y+.11,pz);g.add(patch);}
   // Test full wall-span radius against the route, not merely its center.
   collider(px,pz,w,d,y,height+.2);
  }
  add(g);return g;
 }
 function gate(x,z,{width=2.3,label='露地',ry=0}={}){
  const g=new THREE.Group();g.name='quiet-timber-garden-gate';
  for(const s of[-1,1]){g.add(box(.17,2.12,.18,wood,s*width/2,1.06,0),box(.26,.22,.28,stone,s*width/2,.11,0));}
  g.add(box(width+.45,.16,.22,wood,0,2.03,0));
  for(const s of[-1,1]){const cap=box(width+.63,.105,.65,tile,0,2.14,s*.24);cap.rotation.x=s*.23;g.add(cap);}
  g.add(box(width+.67,.12,.13,tile,0,2.28,0));
  // Narrow closed panel to one side leaves a real people-width opening.
  for(let i=0;i<7;i++)g.add(box(.027,1.56,.065,wood,-width*.47+i*.075,.98,.035));
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(.76,.25),flat({map:makeWoodenSign(label,'静かな小径'),side:THREE.DoubleSide}));sign.position.set(.18,1.91,.13);g.add(sign);
  const lantern=makeLantern({text:'庭',color:'#d3b68b',size:.46});lantern.position.set(width*.32,1.9,.17);g.add(lantern);
  detail(g,x,z,ry);return g;
 }
 function steppingPath(points,width=.75){
  const g=new THREE.Group();g.name='garden-stepping-stones';
  for(let p=1;p<points.length;p++){
   const a=points[p-1],b=points[p],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/.95));
   for(let i=p===1?0:1;i<=n;i++){const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
    const slab=box(width,.075,.64,stoneLight,x,heightAt(x,z)-.012,z);slab.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1])+(i%2?-.08:.05);g.add(slab);
   }
  }
  add(g);
 }
 function mossBed(x,z,rx,rz,seed=0){
  const n=18,pos=[x,heightAt(x,z)+.009,z],idx=[];
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2,r=1+Math.sin(i*2.17+seed)*.11,px=x+Math.cos(a)*rx*r,pz=z+Math.sin(a)*rz*r;pos.push(px,heightAt(px,pz)+.009,pz);}
  for(let i=0;i<n;i++)idx.push(0,(i+1)%n+1,i+1);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,moss);mesh.name='terrain-following-moss-bed';mesh.receiveShadow=true;add(mesh);
 }
 function basin(x,z){
  const g=new THREE.Group();g.name='garden-tsukubai';
  const base=new THREE.Mesh(new THREE.DodecahedronGeometry(.64,0),stone);base.scale.set(1,.48,1);base.position.y=.26;g.add(base);
  const lip=new THREE.Mesh(new THREE.TorusGeometry(.34,.085,5,18),stoneLight);lip.rotation.x=Math.PI/2;lip.position.y=.52;g.add(lip);
  const water=new THREE.Mesh(new THREE.CircleGeometry(.31,24),flat({color:0x90b5a6}));water.rotation.x=-Math.PI/2;water.position.y=.516;g.add(water);
  g.add(cyl(.043,.043,1.1,7,bamboo,.4,.55,-.35));
  const spout=cyl(.045,.045,.71,7,bamboo,.19,.9,-.35);spout.rotation.z=Math.PI/2;g.add(spout);
  const trickle=cyl(.009,.009,.36,5,flat({color:0xc7ded2,transparent:true,opacity:.62,depthWrite:false}),-.14,.706,-.35);g.add(trickle);
  g.userData.interactions=[{position:[0,1,.7],label:'Listen to the garden water',text:'A bamboo spout drops water into the worn stone basin. The sound is smaller than the garden.',kind:'water'}];
  detail(g,x,z,0,1.1,1.1,.6);
 }
 function lanternAt(x,z,scale=.76){const g=makeStoneLantern();g.scale.setScalar(scale);detail(g,x,z,0,.55,.55,2.0*scale);}
 function bambooScreen(x,z,len,axis='x'){
  const g=new THREE.Group();g.name='bamboo-garden-screen';
  for(let u=-len/2;u<=len/2;u+=.12){const px=x+(axis==='x'?u:0),pz=z+(axis==='z'?u:0);if(!safe(px,pz,.5))continue;const y=heightAt(px,pz);g.add(cyl(.023,.023,1.42,5,bamboo,px,y+.71,pz));}
  for(const h of[.29,1.1]){const y=heightAt(x,z);g.add(box(axis==='x'?len:.055,.058,axis==='z'?len:.055,wood,x,y+h,z));}
  add(g);
 }
 // South of Hanamikoji: the walking route turns east at z55, so this screen
 // terminates the long view without closing any route or its northern apron.
 wall(67.4,64.2,12.8,'x',2.12,{gap:{at:-2.5,width:2.35}});
 gate(64.9,64.2,{label:'小さな庭',width:2.1});
 steppingPath([[64.9,62.7],[64.9,67],[67.1,68.4]],.76);
 for(const[x,z,type,s]of[[61.2,68,'pine',.95],[68.5,69.5,'sakura',.85],[73,68,'maple',.82],[59.8,65.7,'shrub',.7],[73.4,65.8,'shrub',.68]])plant(x,z,type,s);
 lanternAt(62.8,65.4,.69);detail(makeBench({width:1.4}),70.4,65.7,Math.PI);

 // A pocket garden between the two Maruyama pedestrian branches. Paths stay
 // open on both sides; the planting deliberately encloses the empty interior.
 wall(206.8,42.1,11.1,'x',1.22,{gap:{at:0,width:2.8},aged:true});
 gate(206.8,42.1,{label:'春の庭',width:2.55});
 wall(212.4,49.8,12.2,'z',1.4,{gap:{at:1.5,width:2.4},aged:true});
 bambooScreen(201.3,49.2,8.1,'z');
 steppingPath([[206.8,40.8],[206.8,44.1],[209.1,46.4],[207.8,50.1],[211.8,51.3]],.81);
 basin(205.4,47.3);lanternAt(209.7,44.2,.69);lanternAt(204.1,53.1,.79);
 for(const[x,z,rx,rz]of[[205.1,47.4,1.65,1.2],[203.8,44.8,1.45,1.2],[210.6,47.5,1.35,1.25],[204.5,51.6,1.55,1.35],[209.8,54.5,1.55,.95]])mossBed(x,z,rx,rz,x+z);
 detail(makeBench({width:1.7,red:true}),207.4,53.4,Math.PI,1.7,.7,.55);
 for(const[x,z,type,s]of[[203.8,44.8,'maple',.78],[210.5,47.4,'sakura',.82],[204.5,51.6,'pine',.62],[207.4,56.1,'sakura',.88],[201.6,45.3,'bamboo',.71],[210.7,54.8,'shrub',.75],[203.9,49.4,'shrub',.68],[211.3,43.6,'shrub',.6]])plant(x,z,type,s);

 // Ishibe-like dogleg: enclosed side gardens and lower plaster screens give
 // the loop a quieter material language than the commercial route outside it.
 wall(187.8,97.4,22.5,'x',1.83,{gap:{at:-5.1,width:2.25},aged:true});
 gate(182.7,97.4,{label:'石畳の路地',width:2.1});
 wall(174.3,107.1,18,'z',1.92,{gap:{at:.6,width:2.3},aged:true});
 gate(174.3,107.7,{label:'庭の入口',width:2.12,ry:Math.PI/2});
 wall(188.2,117.7,22,'x',1.68,{gap:{at:4.9,width:2.15},aged:true});
 wall(185.8,103.1,12.6,'x',1.43,{gap:{at:.5,width:2.2},aged:true});
 wall(179.9,108.5,7.1,'z',1.35,{aged:true});
 bambooScreen(188.1,111.1,7.7,'x');
 steppingPath([[186.3,102.5],[186.3,105.2],[183.5,107.3]],.67);
 basin(183.3,107.7);lanternAt(180.8,105,.68);lanternAt(195.8,116.8,.64);
 mossBed(183.1,108,1.65,1.05,19);mossBed(186.8,108.6,1.6,1.2,29);
 detail(makeBench({width:1.28}),189.6,104.7,Math.PI/2,.5,1.28,.5);
 for(const[x,z,type,s]of[[178,94.4,'bamboo',.9],[184.1,94.8,'maple',.75],[194.4,95.1,'sakura',.69],[171.5,102.8,'maple',.83],[171.2,111.3,'bamboo',.92],[182.2,108.7,'shrub',.67],[186.8,108.6,'maple',.66],[188.9,119.9,'pine',.83],[197.1,119.6,'maple',.74]])plant(x,z,type,s);
 // Functional work traces: doorstep pots and a tea-rest bench at garden entries.
 for(const[x,z]of[[64,63.1],[205.3,41.2],[183.5,98.1],[175.2,106.5],[192.8,116.6]])if(safe(x,z,.25))detail(makePlanter({seed:Math.round(x+z)}),x,z);
 if(ctx.stats)ctx.stats.props+=props;
 return {groups,props,areas:['Hanamikoji garden screen','Maruyama pocket garden','Ishibe garden loop']};
}
