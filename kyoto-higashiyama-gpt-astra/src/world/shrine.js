import * as THREE from 'three';
import { cel, flat } from '../core/toon.js';
import { box, cyl, plane } from '../core/util.js';
import { makeCurvedRoof, compact } from './pagoda.js';

const textCache=new Map();
export function templeText(text,{paper='#e9e0be',ink='#44392f',vertical=true}={}){
  const key=text+paper+ink+vertical;if(textCache.has(key))return textCache.get(key);
  const canvas=document.createElement('canvas');canvas.width=vertical?256:768;canvas.height=vertical?768:256;
  const ctx=canvas.getContext('2d');ctx.fillStyle=paper;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle=ink;ctx.globalAlpha=.3;ctx.lineWidth=4;ctx.strokeRect(14,14,canvas.width-28,canvas.height-28);ctx.globalAlpha=1;
  ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${vertical?112:100}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  if(vertical){const chars=[...text],dy=Math.min(126,640/chars.length);chars.forEach((ch,i)=>ctx.fillText(ch,128,384+(i-(chars.length-1)/2)*dy));}
  else ctx.fillText(text,384,128,690);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;textCache.set(key,tex);return tex;
}
export function makeStoneLantern({height=2.6}={}){
  const group=new THREE.Group(),stone=cel({color:0xb3ad9c}),edge=cel({color:0x8d918b}),glow=flat({color:0xf4d890});
  group.add(box(.8,.16,.8,stone,0,.08,0),box(.6,.14,.6,stone,0,.23,0),cyl(.17,.24,1.05,8,stone,0,.8,0),box(.78,.18,.78,edge,0,1.39,0));
  group.add(box(.46,.48,.46,glow,0,1.71,0));for(const x of [-.27,.27])for(const z of [-.27,.27])group.add(box(.13,.65,.13,stone,x,1.74,z));
  const roof=makeCurvedRoof({width:1.12,depth:1.12,height:.4,color:0x8d918b,edgeColor:0x92988f,tiles:false});roof.position.y=2.05;group.add(roof,cyl(.04,.14,.3,6,stone,0,2.54,0));group.scale.setScalar(height/2.7);return group;
}
const lanternMaterials=new Map();
export function paperLantern(text='奉納',{color=0xffeed2,height=.72}={}){
  const key=text+color;
  if(!lanternMaterials.has(key))lanternMaterials.set(key,cel({color,bands:'soft',map:templeText(text),emissive:0x523917,emissiveIntensity:.13}));
  const group=new THREE.Group(),paper=lanternMaterials.get(key),frame=cel({color:0x554439});
  group.add(cyl(.20,.20,height,12,paper,0,0,0),cyl(.15,.15,.045,10,frame,0,height*.52,0),cyl(.15,.15,.045,10,frame,0,-height*.52,0));
  return group;
}
export function makeShrineGate({width=10,height=10,wing=true,label='八坂神社',roofShape='gable'}={}){
  const group=new THREE.Group(),red=cel({color:0xd65536}),redDark=cel({color:0xad4b33}),cream=cel({color:0xeee2be}),green=cel({color:0x467b70}),gold=cel({color:0xcbb26a}),stone=cel({color:0xb8b3a3});
  const w=width,upper=height*.42,ceiling=height*.69;
  for(const x of [-w*.38,-w*.18,w*.18,w*.38])for(const z of [-1.4,1.4]){
    group.add(cyl(.21,.23,ceiling,10,red,x,ceiling*.5,z),box(.6,.20,.6,stone,x,.10,z));
    group.add(box(.59,.22,.54,gold,x,upper-.22,z),box(.85,.22,.84,redDark,x,upper,z));
  }
  for(const s of [-1,1]){
    group.add(box(w*.21,upper-.8,2.7,cream,s*w*.28,(upper-.8)*.5,0));
    group.add(box(w*.19,upper*.68,.1,green,s*w*.28,upper*.40,1.41));
    for(let j=0;j<10;j++)group.add(box(.035,upper*.66,.035,cream,s*w*.28-w*.083+j*w*.018,upper*.40,1.49));
    for(const yy of [.55,upper*.78,upper-.35])group.add(box(w*.24,.15,.20,red,s*w*.28,yy,1.51));
  }
  group.add(box(w*.87,.34,3.5,red,0,upper,0),box(w*.8,ceiling-upper-.35,2.7,cream,0,(upper+ceiling)*.5,0));
  for(const z of [-1.43,1.43]){
    for(let i=-3;i<=3;i++){
      group.add(box(.14,ceiling-upper,.16,red,i*w*.116,(upper+ceiling)*.5,z));
      if(i%2===0)group.add(box(w*.082,.75,.07,green,i*w*.116,upper+1.1,z*1.01));
    }
    group.add(box(w*.85,.18,.18,red,0,upper+.7,z),box(w*.85,.15,.18,red,0,ceiling-.25,z));
    for(let i=-8;i<=8;i++)group.add(box(.08,.66,.08,red,i*w*.053,upper+.4,z*1.3));
    group.add(box(w*.9,.10,.12,red,0,upper+.74,z*1.3));
  }
  for(let i=-4;i<=4;i++)for(const z of [-1.8,1.8]){group.add(box(.32,.15,.64,redDark,i*w*.095,upper-.44,z),box(.58,.16,.92,red,i*w*.095,upper-.27,z),box(.9,.14,1.04,cream,i*w*.095,upper-.12,z));}
  // Double bracket stacks and individually modeled rafter ends below the eaves.
  for(let i=-5;i<=5;i++)for(const s of [-1,1]){
    const x=i*w*.085;group.add(box(.33,.18,.55,redDark,x,ceiling,s*1.6),box(.6,.16,.65,red,x,ceiling+.18,s*1.73),box(.36,.15,.88,cream,x,ceiling+.34,s*1.83));
  }
  const roof=makeCurvedRoof({width:w+2.8,depth:5.9,height:height*.25,color:0x6d7580,edgeColor:0xb2afa1,gable:roofShape==='gable',ridge:roofShape==='gable'?0:w*.48,outline:true});roof.position.y=ceiling+.5;group.add(roof);
  const plaque=plane(.72,1.26,flat({map:templeText(label,{paper:'#384c43',ink:'#f3e8bb'})}),0,ceiling-.62,1.54);group.add(plaque);
  if(wing)for(const s of [-1,1]){
    const wingG=new THREE.Group();wingG.position.x=s*(w*.5+3.0);wingG.add(box(6.4,3.1,.38,cream,0,1.55,0));
    for(let i=-3;i<=3;i++)wingG.add(box(.14,3.7,.72,red,i,1.85,0));
    for(const y of [.55,1.12,2.85,3.18])wingG.add(box(6.7,.12,.46,red,0,y,0));
    for(let i=-2;i<=2;i++){wingG.add(box(.76,1.1,.12,green,i,2,.26));for(let j=0;j<6;j++)wingG.add(box(.035,1.07,.035,cream,i-.30+j*.12,2,.34));}
    const roof=makeCurvedRoof({width:7.4,depth:3.3,height:1.35,color:0x6d7580,edgeColor:0xb2afa1,gable:true});roof.position.y=3.25;wingG.add(roof);group.add(wingG);
  }
  group.userData.colliders=[{minX:-w*.4,maxX:-w*.18,minZ:-1.7,maxZ:1.7},{minX:w*.18,maxX:w*.4,minZ:-1.7,maxZ:1.7}];
  return group;
}
function railing(g,x,z,width,mat,rot=0){const r=new THREE.Group();for(const y of [.45,.92])r.add(box(width,.10,.11,mat,0,y,0));for(let i=0;i<=Math.floor(width/.52);i++)r.add(box(.09,1.05,.09,mat,-width/2+i*.52,.525,0));r.position.set(x,0,z);r.rotation.y=rot;g.add(r);}
function makeBuden(){
  const g=new THREE.Group(),wood=cel({color:0x675242}),light=cel({color:0xaa916b}),stone=cel({color:0xb5af9c});g.add(box(10.4,.24,8.4,stone,0,.12,0),box(9.5,.32,7.8,wood,0,.40,0));
  for(const x of [-4.3,0,4.3])for(const z of [-3.4,3.4]){g.add(box(.25,4.5,.25,wood,x,2.55,z),box(.75,.17,.65,light,x,4.6,z));}
  for(const z of [-3.5,3.5]){g.add(box(9.5,.32,.3,wood,0,4.6,z));for(let r=0;r<3;r++)for(let j=0;j<14;j++){const l=paperLantern(['祇園','奉納','八坂','京料理','御神燈','花街'][j%6],{height:.71});l.position.set(-4.05+j*.625,4.03-r*.72,z+.03);g.add(l);}}
  for(const x of [-4.4,4.4])for(let r=0;r<2;r++)for(let j=0;j<9;j++){const l=paperLantern(['奉納','祇園'][j%2]);l.position.set(x,4.03-r*.75,-2.8+j*.7);g.add(l);}
  const roof=makeCurvedRoof({width:12.7,depth:10.3,height:3.4,ridge:5.4,color:0x716665,edgeColor:0xb0a183,tiles:false,bark:true});roof.position.y=4.75;g.add(roof);
  for(const s of [-1,1]){railing(g,0,s*4.35,11,light);railing(g,s*5.5,0,8.7,light,Math.PI/2);}return g;
}
function makeHonden(){
  const g=new THREE.Group(),red=cel({color:0xd76d42}),cream=cel({color:0xf4e2c3}),wood=cel({color:0x614536}),gold=cel({color:0xd3b167}),dark=flat({color:0x51474a});
  g.add(box(15,.5,12,cel({color:0xb2aba0}),0,.25,0),box(14,5.2,10.5,cream,0,3,0));
  for(const x of [-6.6,-3.3,0,3.3,6.6])for(const z of [-5.3,5.3]){g.add(cyl(.21,.23,5.5,10,red,x,3.05,z),box(.7,.17,.7,gold,x,5.65,z));}
  for(const y of [1.1,4.1,5.4])for(const z of [-5.36,5.36])g.add(box(14.5,.18,.22,red,0,y,z));
  for(let i=-2;i<=2;i++){g.add(box(2.7,2.4,.06,dark,i*2.7,2.4,5.33));for(let j=0;j<10;j++)g.add(box(.038,2.3,.04,wood,i*2.7-1.1+j*.25,2.4,5.38));}
  const roof=makeCurvedRoof({width:18.6,depth:16.0,height:5.7,ridge:5.3,color:0x7f695d,edgeColor:0xba9d73,tiles:false,bark:true});roof.position.y=5.6;g.add(roof);
  const portico=makeCurvedRoof({width:6.2,depth:4,height:1.4,gable:true,color:0x7f695d,edgeColor:0xc3a678});portico.position.set(0,4.4,6.1);g.add(portico);
  for(const x of [-2.5,2.5])g.add(cyl(.16,.18,4.3,8,red,x,2.2,7.1));
  // Offertory slats, real rope and bell; no floating icon.
  g.add(box(3,.9,.85,wood,0,.7,6.9));for(let i=-9;i<=9;i++)g.add(box(.085,.08,.81,gold,i*.15,1.19,6.9));
  const rope=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-2.4,4.1,6.7),new THREE.Vector3(0,3.8,6.7),new THREE.Vector3(2.4,4.1,6.7)]),18,.12,6,false),cel({color:0xd9c68f}));g.add(rope,cyl(.04,.04,2.3,6,cel({color:0xcbb380}),0,2.76,7));
  const bell=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),gold);bell.position.set(0,3.94,7);g.add(bell);
  for(const x of [-1.9,-.6,.6,1.9]){const p=plane(.18,.45,flat({color:0xfaf0dc,side:THREE.DoubleSide}),x,3.65,6.72);p.rotation.z=.24*(x>0?1:-1);g.add(p);}return g;
}
export function makeTemizuya(){
  const g=new THREE.Group(),wood=cel({color:0x907454}),stone=cel({color:0x979e97}),water=cel({color:0x85b9b3,bands:'soft',transparent:true,opacity:.82});
  for(const x of [-1.7,1.7])for(const z of [-1.25,1.25])g.add(box(.18,3.1,.18,wood,x,1.55,z));
  g.add(box(2.5,.7,1.6,stone,0,.7,0),box(2.2,.03,1.3,water,0,1.07,0));
  for(const s of [-1,1])g.add(box(2.6,.14,.14,stone,0,1.15,s*.77),box(.14,.14,1.6,stone,s*1.22,1.15,0));
  g.add(box(2.6,.08,.09,wood,0,1.28,.1));
  for(let i=-2;i<=2;i++){const ladle=cyl(.09,.09,.11,8,wood,i*.4,1.35,.35);const handle=box(.04,.045,.7,wood,i*.4,1.3,.75);g.add(ladle,handle);}
  const roof=makeCurvedRoof({width:4.8,depth:3.8,height:1.2,gable:true,color:0x7c7970});roof.position.y=3;g.add(roof);return g;
}
export function makeYasakaShrine(){
  const g=new THREE.Group();g.name='Yasaka-jinja precinct';
  const west=makeShrineGate();g.add(west);
  // Local +Z faces west after caller rotation -PI/2. Local +X then points south.
  const buden=makeBuden();buden.position.set(9,0,-27);buden.rotation.y=-Math.PI/2;g.add(buden);
  const honden=makeHonden();honden.position.set(-9,0,-27);honden.rotation.y=Math.PI/2;g.add(honden);
  const basin=makeTemizuya();basin.position.set(-8.5,0,-6);g.add(basin);
  const south=makeShrineGate({width:7.8,height:8.3,wing:false,label:'八坂神社'});south.position.set(24,0,-27);south.rotation.y=Math.PI/2;g.add(south);
  for(const x of [-16,18])for(const z of [-10,-22,-36]){const lantern=makeStoneLantern();lantern.position.set(x,0,z);g.add(lantern);}
  const board=cel({color:0xad8857}),wood=cel({color:0x77583e});
  // Ema rack tucked beside the exit, each plaque has actual depth.
  for(const x of [11.5,15.5])g.add(box(.16,2.4,.16,wood,x,1.2,-11));g.add(box(4.4,.18,.28,wood,13.5,2.3,-11));
  for(let row=0;row<3;row++)for(let j=0;j<11;j++)g.add(box(.28,.34,.04,board,11.85+j*.33,1.95-row*.44,-10.96));
  const emaRoof=makeCurvedRoof({width:4.9,depth:1.1,height:.45,gable:true,color:0x74756b,tiles:false});emaRoof.position.set(13.5,2.46,-11);g.add(emaRoof);
  g.add(plane(1.6,.5,flat({map:templeText('絵馬 奉納',{vertical:false})}),13.5,2.22,-10.81));
  const notice=plane(.65,1.35,flat({map:templeText('おみくじ') }),18,1.2,-14);g.add(notice,box(1.3,.85,.75,wood,18,.45,-14.5));
  g.userData.colliders=[...west.userData.colliders,{minX:4.5,maxX:13.5,minZ:-33,maxZ:-21},{minX:-16,maxX:-2,minZ:-35,maxZ:-19},{minX:-9.9,maxX:-7.1,minZ:-6.9,maxZ:-5.1},{minX:17.3,maxX:18.7,minZ:-15,maxZ:-14}];
  g.userData.interactions=[
    {position:[0,1.4,2.3],label:'Read the shrine gate',text:'八坂神社 · Yasaka-jinja\nThe vermilion west gate faces Shijō. Inside, the lantern stage and main hall follow the shrine’s south-facing axis.',kind:'read'},
    {position:[-8.5,1.2,-4],label:'Rinse at the temizuya',text:'A ladle of cool water. The sound runs softly into stone.',kind:'water'},
    {position:[-1.5,1.4,-27],label:'Ring the shrine bell',text:'A clear bell note rises above the roofs of Gion.',kind:'bell'},
    {position:[18,1.3,-12.5],label:'Draw an omikuji',text:'末吉 · A small blessing\nA familiar path may still lead to an unexpected view.',kind:'fortune'},
    {position:[13.5,1.4,-9.8],label:'Read the ema',text:'Small wooden tablets carry private hopes, sheltering together beneath the eaves.',kind:'read'},
    {position:[9,1.4,-19.4],label:'Listen beside the lantern stage',text:'奉納 · Lanterns from the surrounding tea houses keep their names in the courtyard.',kind:'lantern'},
    {position:[21,1.3,-27],label:'Stamp the Yasaka page',text:'八坂神社\nA keepsake of the first quiet courtyard on your walk.',kind:'stamp'},
  ];
  g.userData.footprint={minX:-20,maxX:29,minZ:-38,maxZ:3,height:12};return compact(g);
}
