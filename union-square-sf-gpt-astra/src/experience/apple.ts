import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { streetHeight } from '../site';
import { type Interior, type InteractiveTarget, type Collider, type WalkSurface, point, rectCollider, rectFloor, stairFloor } from './types';

/** Original public-interior interpretation. Foster plans inform the 4.5m level,
 * paired straight glass stairs and room sequence; baseline outer envelope retained.
 * Reference photographs are research only. See references/SUPPLEMENT_APPLE.md. */
export function buildAppleInterior():Interior {
 const frame={x:44.1,y:streetHeight(44.1,-64)+.12,z:-64,yaw:0};
 const group=new THREE.Group();group.name='Apple public interior — supplemental 2025 interpretation';group.position.set(frame.x,frame.y,frame.z);
 const floors:WalkSurface[]=[],colliders:Collider[]=[],targets:InteractiveTarget[]=[];
 const mats={stone:new THREE.MeshStandardMaterial({color:0xd5d4cd,roughness:.72}),metal:new THREE.MeshStandardMaterial({color:0xa5aeae,metalness:.68,roughness:.28}),oak:new THREE.MeshStandardMaterial({color:0xbc9364,roughness:.68}),dark:new THREE.MeshStandardMaterial({color:0x192022,roughness:.43}),glass:new THREE.MeshStandardMaterial({name:'architecture-glass-Apple-interior',color:0xb7ced0,transparent:true,opacity:.13,depthWrite:false,metalness:.15,roughness:.08,side:THREE.DoubleSide,envMapIntensity:1.4}),light:new THREE.MeshStandardMaterial({color:0xeaece5,emissive:0xd9e2d8,emissiveIntensity:.48,roughness:.8}),leaf:new THREE.MeshStandardMaterial({color:0x386a36,roughness:.94}),bark:new THREE.MeshStandardMaterial({color:0x76604c,roughness:1}),green:new THREE.MeshStandardMaterial({color:0x344d2e,roughness:1}),leather:new THREE.MeshStandardMaterial({color:0x926340,roughness:.79})};
 // Fine original material variation; public photographs remain references only.
 for(const key of ['stone','oak'] as const){const m=mats[key];m.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 appleSurface;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n appleSurface=position;');shader.fragmentShader='varying vec3 appleSurface;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float g=fract(sin(dot(floor(appleSurface*180.),vec3(12.9898,78.233,45.11)))*43758.5453);
  float grainFade=1.-smoothstep(.015,.08,length(fwidth(appleSurface)));
  diffuseColor.rgb*=${key==='oak'?'(.97+.035*sin(appleSurface.z*90.+sin(appleSurface.x*1.8)*3.)+(g-.5)*.055*grainFade)':'(.985+(g-.5)*.055*grainFade)'};`);};m.customProgramCacheKey=()=>`apple-original-${key}-grain-v1`;}
 type K=keyof typeof mats;const batches=new Map<K,THREE.BufferGeometry[]>();
 function add(g:THREE.BufferGeometry,k:K,x:number,y:number,z:number,rx=0,ry=0,rz=0){g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));const list=batches.get(k)||[];list.push(g);batches.set(k,list);}
 function box(k:K,x:number,y:number,z:number,w:number,h:number,d:number){add(new THREE.BoxGeometry(w,h,d),k,x,y,z);}
 function obstacle(name:string,x:number,z:number,w:number,d:number,y0:number,y1:number){colliders.push(rectCollider(frame,name,x,z,w,d,y0,y1));}
 function target(id:string,title:string,category:string,x:number,y:number,z:number,radius:number,action:()=>void,description:()=>string,object?:THREE.Object3D){targets.push({id:`apple-${id}`,title,category,position:point(frame,x,y,z),radius,action,description,object});}
 // White terrazzo ground and tapered, cantilevered upper slab. Stair holes are
 // represented in both visible geometry and registered walk support surfaces.
 box('stone',0,-.13,-14.8,41.2,.26,29.8);floors.push(rectFloor(frame,'apple-ground',0,-14.8,41.2,29.8,0));
 box('stone',0,4.35,-17.7,32.2,.30,21);for(const x of [-10.0625,10.0625])box('stone',x,4.35,-29,12.075,.30,1.6);box('stone',0,4.41,-7.05,32.2,.18,.32);
 for(const x of [-18.35,18.35])box('stone',x,4.35,-22.1,4.5,.30,15.4);
 floors.push(rectFloor(frame,'apple-upper',0,-18.5,40.9,22.6,4.5,[{x:-18.35,z:-10.7,w:4.6,d:7.4},{x:18.35,z:-10.7,w:4.6,d:7.4}]));
 for(const x of [-20.55,20.55]){box('metal',x,6.35,-14.8,.18,12.7,29.6);obstacle('Apple metal side wall',x,-14.8,.3,29.8,-.3,13);}
 // Central service spine; its south face is the Forum display, its north face
 // accessory cabinetry. Both ends stay open to the Genius Grove behind.
 box('metal',0,8.1,-22,27,7.2,.42);obstacle('Apple upper service spine',0,-22,27,.55,4.5,12.2);
 for(const x of [-12.3,12.3]){box('metal',x,2.2,-29.8,16.5,4.4,.2);obstacle('Apple lower rear wall',x,-29.8,16.5,.3,0,4.4);}
 box('metal',0,1.7,-29.8,8.1,3.4,.2);obstacle('Apple rear stair foundation',0,-29.8,8.1,.3,0,3.4);
 box('metal',0,1.7,-28.8,30,3.4,.38);obstacle('Apple ground rear cabinetry',0,-28.8,30,.6,0,3.5);
 for(let i=0;i<14;i++){const x=-13.7+i*2.1;box('oak',x,2.0,-28.61,2.0,2.62,.07);box('light',x,2.0,-28.55,1.82,2.4,.06);for(let r=0;r<3;r++)for(let c=0;c<3;c++)box((c+r+i)%3?'dark':'oak',x-.53+c*.53,1.25+r*.58,-28.46,.26,.38,.07);}
 // Two 2.13m clear glass stairs ascend northward. Thirty .15m risers; the
 // public plans establish location and levels, the exact tread count is authored.
 for(const x of [-18.1,18.1]){
  const n=30,start=-3,end=-14.4,run=(start-end)/n;
  for(let i=0;i<n;i++){const y=i*.15,z=start-(i+.5)*run;box('glass',x,y-.045,z,2.13,.09,run);box('metal',x,y-.035,z+run/2-.02,2.13,.04,.027);}
  floors.push(stairFloor(frame,`apple-stair-${x<0?'west':'east'}`,x,start,end,2.13,0,4.5,n));
  // Thin stringers and safety glass parallel the stair pitch.
  const length=Math.hypot(11.4,4.5),angle=Math.atan2(4.5,11.4);
  for(const s of [-1,1]){
   add(new THREE.BoxGeometry(.055,1.05,length),'glass',x+s*1.12,2.70,-8.7,angle);
   add(new THREE.BoxGeometry(.045,.055,length),'metal',x+s*1.12,3.225,-8.7,angle);
   // Segment collision follows stair height, allowing the ground level beneath.
   for(let i=0;i<30;i++)obstacle('Apple stair glass guard',x+s*1.12,start-(i+.5)*run,.07,run+.02,i*.15,(i+1)*.15+1.03);
  }
 }
 // Front mezzanine guard and stair-well edges.
 box('glass',0,5.03,-6.99,32.2,1.06,.045);box('metal',0,5.56,-6.99,32.2,.045,.05);obstacle('Apple upper front glass guard',0,-6.99,32.2,.09,4.5,5.59);
 for(const x of [-16.09,16.09]){box('glass',x,5.03,-10.73,.045,1.06,7.35);box('metal',x,5.56,-10.73,.05,.045,7.35);obstacle('Apple upper stair opening guard',x,-10.73,.08,7.35,4.5,5.59);}
 // Original device screens use geometric canvas graphics, not downloaded art.
 function displayTexture(label:string,mode:number){const c=document.createElement('canvas');c.width=512;c.height=288;const g=c.getContext('2d')!;const grad=g.createLinearGradient(0,0,512,288);grad.addColorStop(0,mode%2?'#133d54':'#605076');grad.addColorStop(1,mode%2?'#8bbeba':'#d89569');g.fillStyle=grad;g.fillRect(0,0,512,288);for(let i=0;i<5;i++){g.strokeStyle=`rgba(255,255,255,${.08+i*.03})`;g.lineWidth=14;g.beginPath();g.arc(350,140,45+i*29,0,Math.PI*2);g.stroke();}g.fillStyle='#ffffff';g.font='24px sans-serif';g.fillText(label,25,245);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
 const deviceTextures=[displayTexture('Explore · Photography',0),displayTexture('Explore · Sound',1),displayTexture('Explore · Creativity',2)];
 const deviceResets:Array<()=>void>=[];let inspected=0;
 function table(x:number,z:number,y:number,id:number,devices:boolean){
  box('oak',x,y+.755,z,4.1,.11,1.45);for(const dx of [-1.75,1.75])for(const dz of [-.51,.51])box('oak',x+dx,y+.35,z+dz,.13,.70,.13);
  obstacle('Apple oak product table',x,z,4.1,1.45,y,y+.82);
  if(devices)for(let j=0;j<3;j++){
   const xx=x+(j-1)*1.12,family=id%3,sw=family===0?.34:family===1?.21:.082,sh=family===0?.215:family===1?.28:.148,sy=y+.845+sh/2;box('metal',xx,y+.833,z,sw+.07,.045,family===0?.28:.105);box('metal',xx,sy,z-.055,sw+.022,sh+.022,.024);
   const m=new THREE.MeshBasicMaterial({map:deviceTextures[(id+j)%3]});const panel=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),m);panel.position.set(xx,sy,z-.041);group.add(panel);
   let mode=(id+j)%3;deviceResets.push(()=>{mode=(id+j)%3;m.map=deviceTextures[mode];m.needsUpdate=true;});target(`device-${id}-${j}`,'Explore display device','Device',xx,sy,z,2.4,()=>{mode=(mode+1)%3;m.map=deviceTextures[mode];m.needsUpdate=true;inspected++;},()=>`Interactive display ${mode+1} of 3. Original photography, sound and creativity demo artwork; ${inspected} device explorations.`,panel);
  }
 }
 let tableId=0;for(const z of [-4.7,-10.1,-15.5])for(const x of [-12,-4,4,12])table(x,z,0,tableId++,true);
 for(const x of [-12,-4,4,12])table(x,-10.2,4.5,tableId++,false);for(const x of [-12,12])table(x,-16.5,4.5,tableId++,false);
 // Seats are explicit actions with stored world-space camera/feet suggestions;
 // root interaction controller consumes userData.seatPosition and seatLookAt.
 let seated='';for(let r=0;r<3;r++)for(let c=0;c<5;c++){
  const x=(c-2)*1.5,z=-14.2-r*1.65;box('oak',x,4.72,z,.61,.44,.61);box((r+c)%3?'leather':'dark',x,4.72,z+.307,.47,.32,.016);box('dark',x,4.755,z+.318,.12,.035,.006);if((r+c)%4===0)box('leather',x,4.945,z,.57,.01,.57);obstacle('Apple Forum seat',x,z,.61,.61,4.5,4.94);
  const anchor=new THREE.Object3D();anchor.position.set(x,4.94,z);anchor.userData.seatPosition=point(frame,x,4.94,z).toArray();anchor.userData.seatLookAt=point(frame,0,8,-21.7).toArray();group.add(anchor);
  target(`seat-${r}-${c}`,'Sit in the Forum','Seat',x,5.1,z,1.6,()=>{seated=`Row ${r+1}, seat ${c+1}`;},()=>`${seated||'Available seat'}. Face the Forum screen; use movement to stand.`,anchor);
 }
 const forumTextures=[displayTexture('Today at Apple · Create together',1),displayTexture('Photo walk · Light and architecture',0),displayTexture('Make a scene · Colour and form',2)];
 let demo=0;const forumMat=new THREE.MeshBasicMaterial({map:forumTextures[0]});const forum=new THREE.Mesh(new THREE.PlaneGeometry(9.1,5.12),forumMat);forum.position.set(0,7.7,-21.75);group.add(forum);box('dark',0,7.7,-21.86,9.27,5.29,.12);
 target('forum','Change Forum presentation','Presentation',0,6.1,-20.2,4.5,()=>{demo=(demo+1)%3;forumMat.map=forumTextures[demo];forumMat.needsUpdate=true;},()=>`Original local presentation ${demo+1} of 3. This is an authored visual demo, not live Apple programming.`,forum);
 function tree(x:number,z:number,y:number,index:number){
  add(new THREE.CylinderGeometry(.82,.82,.52,18),'stone',x,y+.26,z);add(new THREE.TorusGeometry(.76,.12,5,18),'oak',x,y+.53,z,Math.PI/2);add(new THREE.CylinderGeometry(.065,.12,2.7,8),'bark',x,y+1.88,z);
  for(let j=0;j<5;j++){const a=j*2.399+index;add(new THREE.IcosahedronGeometry(.81,1),'leaf',x+Math.sin(a)*.48,y+3.1+(j%2)*.38,z+Math.cos(a)*.42);}
  obstacle('Apple Genius Grove planter',x,z,1.6,1.6,y,y+.55);
 }
 for(let i=0;i<8;i++)tree(-14+i*4,-24.3,4.5,i);for(const x of [-12,-4,4,12])table(x,-27.15,4.5,tableId++,false);
 // The rear public court is elevated relative to Post, one short stair below
 // Genius Grove. Exact Asawa artwork is left to existing public-art scope.
 const courtY=3.4;box('stone',0,1.45,-35.9,40.7,3.9,12.2);floors.push(rectFloor(frame,'apple-rear-court',0,-35.9,40.7,12.2,courtY));
 for(let i=0;i<8;i++){const y=4.5-i*1.1/8,z=-28.2-(i+.5)*.4;box('stone',0,y-.06,z,8,.12,.4);}
 floors.push(stairFloor(frame,'apple-rear-court-stair',0,-28.2,-31.4,8,4.5,3.4,8));
 // Rear floor opening is required for a descending route rather than an overlaid
 // upper support surface. Narrow landing reaches the upper start.
 floors[1]=rectFloor(frame,'apple-upper',0,-18.5,40.9,22.6,4.5,[{x:-18.35,z:-10.7,w:4.6,d:7.4},{x:18.35,z:-10.7,w:4.6,d:7.4},{x:0,z:-30,w:8.05,d:3.6}]);
 // Court edges prevent accidental falls; passage returns through the store.
 for(const x of [-20.3,20.3]){box('stone',x,courtY+.45,-35.9,.25,.9,12.1);obstacle('Apple rear court edge',x,-35.9,.3,12.2,courtY,courtY+1.1);}
 box('stone',0,courtY+.48,-42,40.6,.96,.35);obstacle('Apple rear court north edge',0,-42,40.6,.4,courtY,courtY+1.1);
 box('green',-20.1,9.2,-36.1,.22,11.6,11.5);for(let i=0;i<140;i++)add(new THREE.IcosahedronGeometry(.27,0),'leaf',-19.89,3.9+(i%17)*.62,-30.8-Math.floor(i/17)*1.28);
 for(const x of [-13,13])for(const z of [-33.6,-38.8])tree(x,z,courtY,Math.round(x+z));
 // The lower public ceiling has luminous panels too, as in Apple's gallery.
 for(let r=0;r<3;r++)for(let c=0;c<6;c++)box('light',-13.375+c*5.35,4.186,-10.7-r*7,5.25,.022,6.90);
 for(const x of [-18.35,18.35])for(const z of [-18.2,-25.7])box('light',x,4.186,z,4.32,.022,7.30);
 // Seven by four luminous panels, with steel seams, supplement sun entering
 // through front/rear walls. Emissive surfaces carry no fake point lights.
 for(let r=0;r<4;r++)for(let c=0;c<7;c++)box('light',-17.1+c*5.7,12.37,-4-r*6.3,5.53,.045,6.1);
 // Monumental sliding facade: pair of 6.25m leaves travel behind fixed panels.
 // Open is the default ordinary-day state. Central opening is genuinely clear.
 const doors:THREE.Group[]=[];let doorOpen=true,doorAmount=1;
 for(const s of [-1,1]){
  box('glass',s*13.36,6.25,.015,14.22,12.5,.045);obstacle('Apple fixed front glazing',s*13.36,0,14.22,.1,0,12.7);
  const door=new THREE.Group();door.position.set(s*(3.125+6.25),0,.10);const pane=new THREE.Mesh(new THREE.BoxGeometry(6.25,12.5,.045),mats.glass);pane.position.y=6.25;door.add(pane);const rail=new THREE.Mesh(new THREE.BoxGeometry(.045,12.5,.065),mats.metal);rail.position.set(-s*3.105,6.25,0);door.add(rail);group.add(door);doors.push(door);
 }
 const closedDoor=rectCollider(frame,'Apple sliding entrance doors',0,.1,12.5,.16,0,12.5);closedDoor.enabled=()=>doorAmount<.97;colliders.push(closedDoor);
 target('entrance','Open / close Apple entrance','Door',0,1.6,1,5,()=>{doorOpen=!doorOpen;},()=>`Monumental sliding glass doors: ${doorOpen?'open':'closed'}.`,doors[0]);
 // Rear transparent wall above the courtyard with central accessible opening.
 for(const s of [-1,1]){box('glass',s*12.3,8.5,-29.7,16.5,7.6,.045);obstacle('Apple rear glass wall',s*12.3,-29.7,16.5,.1,4.5,12.3);}
 // Static geometry consolidated by material, preserving independent moving doors.
 for(const [key,list] of batches){const geom=mergeGeometries(list,false);if(!geom)throw new Error(`Apple geometry merge ${key}`);list.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geom,mats[key]);mesh.name=`Apple original interior ${key}`;mesh.castShadow=key!=='glass'&&key!=='light';mesh.receiveShadow=true;group.add(mesh);}
 return{id:'apple',group,floors,colliders,targets,entry:point(frame,0,0,1.8),bounds:new THREE.Box3(point(frame,-21,-.4,-42.3),point(frame,21,13.3,1.9)),update:(_time,dt)=>{doorAmount=THREE.MathUtils.damp(doorAmount,doorOpen?1:0,3,dt);doors.forEach((d,i)=>d.position.x=(i===0?-1:1)*(3.125+6.25*doorAmount));},reset:()=>{doorOpen=true;doorAmount=1;demo=0;forumMat.map=forumTextures[0];seated='';inspected=0;doors.forEach((d,i)=>d.position.x=(i===0?-1:1)*9.375);deviceResets.forEach(reset=>reset());}};
}
