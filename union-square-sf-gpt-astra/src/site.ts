import * as T from 'three';
import {trafficState} from './signals';
import {Batch,basic,rng,surface,label} from './art';
export const SITE_VERSION='survey-assumption-2025-supplement-v3';
export const streetHeight=(x:number,z:number)=>1.8-.032*z-.003*x+Math.max(0,-z-125)*.065;
const clamp=T.MathUtils.clamp;
export function groundHeight(x:number,z:number){
 if(Math.abs(x)>65||Math.abs(z)>42)return streetHeight(x,z)+(Math.abs(x)>81||Math.abs(z)>59?.14:0);
 if(Math.abs(x)<4.5&&Math.abs(z)>32&&Math.abs(z)<42)return streetHeight(x,z)+.14-(42-Math.abs(z))*.31;
 let y=2.4;
 if(z< -12)y=z>=-15.6?2.4+Math.ceil((-z-12)/.6)*.15:3.3+clamp((-z-26)/16,0,1)*.24;
 if(z>24)y=z<28?2.4-Math.floor((z-24)/.5)*.15:z<32?1.2:1.2-Math.min(7,Math.floor((z-32)/1.2))*.15;
 // Wide side promenades provide ramped circulation around step banks.
 if(Math.abs(x)>40){
  if(z< -15)y=2.4+clamp((-z-15)/21,0,1)*1.02;
  else if(z>15)y=2.4-clamp((z-15)/25,0,1)*2.2;
  else y=2.4;
 }
 const edge=clamp(Math.max((Math.abs(x)-58)/7,(Math.abs(z)-39)/3),0,1);
 return T.MathUtils.lerp(y,streetHeight(x,z)+.14,edge);
}
function pavement(name:string,c1:string,c2:string){const ca=document.createElement('canvas');ca.width=ca.height=1024;const c=ca.getContext('2d')!,r=rng(name);c.fillStyle='#777771';c.fillRect(0,0,1024,1024);
for(let j=0;j<8;j++)for(let i=0;i<8;i++){c.fillStyle=r()>.5?c1:c2;c.fillRect(i*128+1,j*128+1,126,126);for(let k=0;k<380;k++){const v=r()>.5?255:30;c.fillStyle=`rgba(${v},${v},${v},${r()*.10})`;c.fillRect(i*128+r()*126,j*128+r()*126,1,1);}}
const tex=new T.CanvasTexture(ca);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=16;const m=new T.MeshStandardMaterial({map:tex,bumpMap:tex,bumpScale:.012,roughness:.83});m.name=name;return m;}
function patch(x0:number,x1:number,z0:number,z1:number,height:(x:number,z:number)=>number,m:T.Material,step=1){const nx=Math.ceil((x1-x0)/step),nz=Math.ceil((z1-z0)/step);const geo=new T.PlaneGeometry(x1-x0,z1-z0,nx,nz);geo.rotateX(-Math.PI/2);geo.translate((x1+x0)/2,0,(z1+z0)/2);const p=geo.attributes.position,uv=geo.attributes.uv;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,height(x,z));uv.setXY(i,x/8,z/8);}geo.computeVertexNormals();const mesh=new T.Mesh(geo,m);mesh.receiveShadow=true;return mesh;}
export function buildSite(){const g=new T.Group(),b=new Batch();g.name='Measured paving and street grades';
const tan=pavement('Sand-colored granite','#a5907b','#ab9681'),gray=pavement('Slate-gray granite','#535d60','#5b6567'),concrete=pavement('Sidewalk slabs','#adada5','#b8b7af');const asphalt=surface('asphalt aggregate',0x454b50,1,.94),line=basic(0xe5e2cc,.86),yellow=basic(0xe6b442),steel=basic(0x6c726e,.32,.7),slot=basic(0x161a1b,.98),soil=surface('Planting soil',0x514b34,2,.96),lawn=surface('Irrigated mown lawn',0x647c36,3,.94);
// Excavate both public interior footprints. Their floors own support and appearance;
// sloping outdoor asphalt must not rise through Apple or cap Nintendo's basement.
const excavations=[[-107.2,-84.99,19.8,44.2],[23.3,65.2,-106.4,-63.99]];
function subtract(rect:number[],hole:number[]):number[][]{const [a,b,c,d]=rect,[x0,x1,z0,z1]=hole,l=Math.max(a,x0),r=Math.min(b,x1),n=Math.max(c,z0),s=Math.min(d,z1);if(l>=r||n>=s)return[rect];return[[a,l,c,d],[r,b,c,d],[l,r,c,n],[l,r,s,d]].filter(v=>v[1]>v[0]&&v[3]>v[2]);}
let asphaltRects=[[-1200,-65,-1200,1200],[65,1200,-1200,1200],[-65,65,-1200,-42],[-65,65,42,1200]];
for(const hole of excavations)asphaltRects=asphaltRects.flatMap(rect=>subtract(rect,hole));
for(const [x0,x1,z0,z1]of asphaltRects)g.add(patch(x0,x1,z0,z1,(x,z)=>streetHeight(x,z)-.025,asphalt,30));
for(const [x0,x1,z0,z1] of [[-85,-81,-220,220],[81,85,-220,220],[-220,220,-64,-59],[-220,220,59,64]])g.add(patch(x0,x1,z0,z1,(x,z)=>streetHeight(x,z)+.14,concrete,2));
const park=patch(-65,65,-42,42,(x,z)=>groundHeight(x,z)-.018,tan,.6);
const parkPos=park.geometry.attributes.position,oldIndex=park.geometry.index!,kept:number[]=[];
for(let i=0;i<oldIndex.count;i+=3){const ids=[oldIndex.getX(i),oldIndex.getX(i+1),oldIndex.getX(i+2)];const cx=ids.reduce((a,j)=>a+parkPos.getX(j),0)/3,cz=ids.reduce((a,j)=>a+parkPos.getZ(j),0)/3;if(!(Math.abs(cx)<4.55&&Math.abs(cz)>31.8))kept.push(...ids);}
park.geometry.setIndex(kept);g.add(park);
// Recessed garage drives: paired lane slots, retaining walls and a low portal.
for(const side of [-1,1]){
 const z0=side<0?-42:32,z1=side<0?-32:42;
 g.add(patch(-4.5,4.5,z0,z1,(x,z)=>streetHeight(x,z)+.14-(42-Math.abs(z))*.31,asphalt,.5));
 for(const x of [-4.6,4.6])for(let k=0;k<20;k++){const z=side*(32.25+k*.5),top=groundHeight(x+Math.sign(x)*.5,z),bottom=streetHeight(x,z)+.14-(42-Math.abs(z))*.31;b.box(concrete,x,(top+bottom)/2,z,.22,Math.max(.15,top-bottom),.505);}
 for(let k=0;k<20;k++){const iz=side*(32.25+k*.5),iy=streetHeight(0,iz)+.14-(42-Math.abs(iz))*.31;b.box(concrete,0,iy+.10,iz,.54,.20,.505);}
 const z=side*32.1,y=groundHeight(5.2,z);b.box(concrete,0,y-.08,z,9.4,.28,1.1);b.box(slot,0,y-1.22,z-side*.2,8.9,2.12,.1);
 for(const x of [-3.8,0,3.8])b.box(yellow,x,streetHeight(x,z)-1.5,z,.12,.7,.15);
}

// Central plaza: alternating east-west bands, with perpendicular central monument panel.
for(let z=-12;z<16;z+=6){g.add(patch(-37.35,37.35,z,Math.min(z+4,16),()=>2.404,gray,3));if(z+4<16)g.add(patch(-37.35,37.35,z+4,Math.min(z+6,16),()=>2.406,tan,3));}
g.add(patch(-5.6,5.6,-12,16,()=>2.41,tan,2));
// Stage six-riser stair bank with four broad dark granite tiers, angular cutouts represented in plan.
for(let i=0;i<6;i++){const z=-12-(i+.5)*.6;const top=2.4+(i+1)*.15;b.box(gray,0,top-.08,z,74.7,.16,.60);}
g.add(patch(-37.35,37.35,-24,-15.6,()=>3.301,gray,2));
for(const x of [-30,-16,16,30])for(let i=0;i<8;i++){const z=24+(i+.5)*.5,top=2.4-i*.15;b.box(tan,x,top-.1,z,10,.20,.5);}
for(const x of [-32,-22,22,32])for(let i=0;i<7;i++){const z=32+(i+.5)*1.2,top=1.2-i*.15;b.box(tan,x,top-.1,z,8,.20,1.2);}
const beds:Array<{x:number,z:number,w:number,d:number,y:number,kind:string}>=[];
function bed(x:number,z:number,w:number,d:number,y:number,kind='lawn'){b.box(tan,x,y-.05,z,w+.44,.38,d+.44);b.box(kind==='lawn'?lawn:soil,x,y+.148,z,w,.018,d);beds.push({x,z,w,d,y:y+.16,kind});}
for(const x of [-24,24])bed(x,-32.4,24,12,3.4);
for(const x of [-28,-16,16,28])for(const z of [31,37])bed(x,z,9.3,3.5,groundHeight(x,z)+.11);
for(const x of [-25,25])bed(x,20.8,24,3.7,2.45,'hedge');
// Curbs and roadway detail all follow the street grade authority.
for(const side of [-1,1]){
 for(const orient of [0,1]){const len=orient===0?84:130;const geo=new T.BoxGeometry(orient===0?.20:len,.20,orient===0?len:.20);const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+(orient===0?side*65:0),z=p.getZ(i)+(orient===1?side*42:0);p.setXYZ(i,x,p.getY(i)+streetHeight(x,z)+.07,z);}geo.computeVertexNormals();b.add(geo,concrete);}
 for(let z=-220;z<220;z+=6){b.box(line,side*74,streetHeight(side*74,z)+.015,z,.12,.02,2.6);}
 for(let x=-220;x<220;x+=6){b.box(line,x,streetHeight(x,side*52)+.017,side*52,2.6,.02,.12);}
}
// Powell twin 3ft6in-gauge tracks plus each center cable slot.
for(const cx of [-77,-71]){
 g.add(patch(cx-.036,cx+.036,-420,420,(x,z)=>streetHeight(x,z)+.021,slot,4));
 for(const dx of [-.5334,.5334]){g.add(patch(cx+dx-.065,cx+dx+.065,-420,420,(x,z)=>streetHeight(x,z)+.022,slot,4));g.add(patch(cx+dx-.0275,cx+dx+.0275,-420,420,(x,z)=>streetHeight(x,z)+.032,steel,4));}
}
// Crosswalk ladders at all four corners.
for(const sx of [-1,1])for(const sz of [-1,1]){
 for(let i=0;i<10;i++){let x=sx*(65.5+i*1.6),z=sz*46;b.box(line,x,streetHeight(x,z)+.025,z,.75,.023,3.2);}
 for(let i=0;i<10;i++){let x=sx*68,z=sz*(42.5+i*1.7);b.box(line,x,streetHeight(x,z)+.026,z,3.2,.023,.8);}
}
// Stockton red transit lane, with white lettering further from the corners.
const bus=basic(0x8b4842,.9);g.add(patch(76.9,80.8,-220,220,(x,z)=>streetHeight(x,z)+.012,bus,3));
for(const z of [-110,-13,90]){const s=label('BUS ONLY',3.2,.7,'#88443e','#eeeece',115);s.rotation.x=-Math.PI/2;s.rotation.z=Math.PI/2;s.position.set(78.7,streetHeight(78.7,z)+.037,z);g.add(s);}
// Signals and familiar green street-name plates at the corners.
const polemat=basic(0x505751,.45,.65),black=basic(0x242826);
const signals:Array<{axis:'eastWest'|'northSouth',materials:T.MeshStandardMaterial[]}>=[];
for(const sx of [-1,1])for(const sz of [-1,1]){const x=sx*63,z=sz*40,y=groundHeight(x,z);b.cyl(polemat,x,y+2.3,z,.065,4.6);b.rod(polemat,new T.Vector3(x,y+4.5,z),new T.Vector3(x+sx*6,y+4.5,z),.055);b.box(black,x+sx*5.7,y+3.95,z,.33,.95,.25);
 for(const axis of ['eastWest','northSouth'] as const){const materials=[0xee3325,0xf1bb33,0x3eb779].map(color=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0,roughness:.5}));signals.push({axis,materials});const head=new T.Group();head.position.set(x+sx*5.7,y+3.95,z);head.rotation.y=axis==='eastWest'?sx*Math.PI/2:sz<0?Math.PI:0;const backing=new T.Mesh(new T.BoxGeometry(.33,.95,.25),black);head.add(backing);for(let i=0;i<3;i++){const bulb=new T.Mesh(new T.SphereGeometry(.105,12,8),materials[i]);bulb.position.set(0,.29-i*.27,.14);bulb.scale.z=.35;head.add(bulb);}g.add(head);}
 const sign=label(sz<0?'POST ST':'GEARY ST',1.7,.33,'#286044','#f3f1dd',145);sign.position.set(x,y+3.4,z+.08);g.add(sign);const s=label(sx<0?'POWELL ST':'STOCKTON ST',1.9,.33,'#286044','#f3f1dd',140);s.rotation.y=Math.PI/2;s.position.set(x+.08,y+3.78,z);g.add(s);
}
// Manhole and inspection covers embedded in street surface.
for(const [x,z]of [[-74,-28],[-71,23],[74,22],[26,52],[-27,-52]]){b.cyl(steel,x,streetHeight(x,z)+.035,z,.36,.015,.36,32);for(let i=-3;i<=3;i++)b.box(slot,x+i*.08,streetHeight(x,z)+.046,z,.018,.01,.5);}
g.add(b.finish());
return{group:g,beds,update:(time:number)=>{const phase=trafficState(time);for(const head of signals){const on=phase[head.axis]==='red'?0:phase[head.axis]==='amber'?1:2;head.materials.forEach((m,i)=>{m.emissiveIntensity=i===on?3:0;m.color.setHex(i===on?[0xee3325,0xf1bb33,0x3eb779][i]:0x202623);});}g.userData.signals=phase;}};}
