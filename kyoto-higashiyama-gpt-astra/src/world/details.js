import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cel, flat } from '../core/toon.js';
import { makeLanternTexture, makeMenuBoard as menuTexture, makePriceStrip, makeVendingTexture, shopType } from './signage.js';

const M = new Map();
const materials = () => ({
  wood:mat(0x80634a), woodLight:mat(0xb29468), dark:mat(0x454840), metal:mat(0x74807b),
  cream:mat(0xe6d7b4), green:mat(0x718469), tile:mat(0x737f7c), brass:mat(0xb6955d),
});
function mat(color) {const key=`m:${color}`;if(!M.has(key))M.set(key,cel({color,bands:3,tint:0x89819a}));return M.get(key);}
function mapped(map) {const key=`t:${map.uuid}`;if(!M.has(key))M.set(key,flat({color:0xffffff,map,side:THREE.DoubleSide,cache:false}));return M.get(key);}
function cube(g,w,h,d,m,x=0,y=0,z=0) {const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;}
function cyl(g,rt,rb,h,m,x=0,y=0,z=0,seg=8) {const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;}
function tube(g,a,b,r,m,segments=6) {const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);const o=cyl(g,r,r,av.distanceTo(bv),m,...av.clone().add(bv).multiplyScalar(.5).toArray(),segments);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;}
function plane(g,w,h,map,x,y,z) {const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mapped(map));o.position.set(x,y,z);g.add(o);return o;}
function random(seed) {return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function place(g,o={}) {g.position.set(o.x||0,o.y||0,o.z||0);g.rotation.y=o.ry||0;return g;}

let lanternBody, lanternRibs;
function lanternGeometry() {
  if(lanternBody)return;
  const pts=[];
  for(let i=0;i<=14;i++){const t=i/14;pts.push(new THREE.Vector2(.22+Math.sin(t*Math.PI)*.115,-.39+t*.78));}
  lanternBody=new THREE.LatheGeometry(pts,16);
  const geos=[];
  for(let i=0;i<=14;i++){const t=i/14;const r=.223+Math.sin(t*Math.PI)*.116;const geo=new THREE.TorusGeometry(r,.007,3,16);geo.rotateX(Math.PI/2);geo.translate(0,-.39+t*.78,0);geos.push(geo);}
  for(const s of[-1,1]){const geo=new THREE.CylinderGeometry(.229,.229,.055,12);geo.translate(0,s*.414,0);geos.push(geo);}
  lanternRibs=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());
}

/** Origin is the suspension point. `size` is the scale of a 0.8 m lantern. */
export function makeLantern(o={}) {
  lanternGeometry();const g=new THREE.Group();g.name='paper-lantern';
  const m=materials(),size=o.size??.65;
  const hinge=new THREE.Group();hinge.position.y=-.16;hinge.userData.dynamic=true;g.add(hinge);
  const body=new THREE.Mesh(lanternBody,mapped(makeLanternTexture(o.text||'祇園',o.color||'#d77d68')));
  body.position.y=-.42*size;body.scale.setScalar(size);body.castShadow=false;body.receiveShadow=false;
  const ribs=new THREE.Mesh(lanternRibs,m.dark);ribs.position.copy(body.position);ribs.scale.copy(body.scale);
  hinge.add(body,ribs);tube(g,[0,0,0],[0,-.17,0],.012,m.dark);
  g.userData.swing=hinge;g.userData.glow=body;g.userData.animated=[{object:hinge,type:'lantern',phase:o.seed||0,amount:.035}];
  return place(g,o);
}

export function makeMenuBoard(o={}) {
  const g=new THREE.Group();g.name='handwritten-menu';const m=materials();
  const panel=new THREE.Group();panel.position.y=.6;panel.rotation.x=-.13;g.add(panel);
  cube(panel,.63,.86,.065,m.wood);plane(panel,.54,.76,menuTexture(o.type||o.shopType||'tea'),0,0,.037);
  for(const side of[-1,1]){tube(g,[side*.235,.03,-.2],[side*.235,1.05,.01],.024,m.wood);tube(g,[side*.235,.03,.2],[side*.235,1.05,.01],.024,m.wood);}
  tube(g,[-.25,.24,.16],[.25,.24,.16],.021,m.wood);return place(g,o);
}

/** Bicycle lies lengthwise along local X; no fake painted wheel sprites. */
export function makeBicycle(o={}) {
  const g=new THREE.Group();g.name='city-bicycle';const m=materials(),paint=mat(o.color||0x7d9a8e);
  const axleY=.335, back=-.58,front=.58;
  for(const x of[back,front]){
    const tyre=new THREE.Mesh(new THREE.TorusGeometry(.322,.034,6,24),m.dark);tyre.position.set(x,axleY,0);g.add(tyre);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.287,.009,4,24),m.metal);rim.position.copy(tyre.position);g.add(rim);
    for(let i=0;i<10;i++){const a=i*Math.PI/5;tube(g,[x,axleY,0],[x+Math.cos(a)*.287,axleY+Math.sin(a)*.287,0],.0037,m.metal,4);}
    const hub=cyl(g,.035,.035,.11,m.metal,x,axleY,0,8);hub.rotation.x=Math.PI/2;
  }
  const A=[back,axleY,0],B=[-.06,.315,0],C=[-.19,.79,0],D=[.39,.79,0],E=[front,axleY,0];
  for(const[a,b]of[[A,B],[A,C],[B,C],[C,D],[B,D],[D,E]])tube(g,a,b,.023,paint);
  tube(g,C,[-.22,.96,0],.02,m.metal);cube(g,.27,.055,.19,m.dark,-.24,.96,0);
  tube(g,D,[.32,1.08,0],.024,m.metal);tube(g,[.32,1.08,0],[.35,1.08,.25],.02,m.metal);tube(g,[.32,1.08,0],[.35,1.08,-.25],.02,m.metal);
  for(const s of[-1,1])tube(g,[.35,1.08,s*.18],[.25,1.08,s*.26],.027,m.dark);
  const gear=cyl(g,.095,.095,.015,m.metal,-.06,.315,.04,12);gear.rotation.x=Math.PI/2;
  tube(g,[-.06,.315,.065],[-.05,.19,.09],.013,m.metal);cube(g,.12,.035,.07,m.dark,-.05,.18,.11);
  tube(g,[-.4,.62,-.055],[-.55,.06,-.22],.016,m.metal);
  // Wire basket and a rear carrier turn the scale reference into a lived-in object.
  for(const y of[.74,.99])for(const z of[-.15,.15])tube(g,[.46,y,z],[.83,y,z],.012,m.metal);
  for(const x of[.46,.83])for(const y of[.74,.99])tube(g,[x,y,-.15],[x,y,.15],.012,m.metal);
  for(let i=0;i<6;i++)for(const z of[-.15,.15])tube(g,[.46+i*.074,.74,z],[.46+i*.074,.99,z],.006,m.metal,4);
  for(const s of[-1,1]){tube(g,[-.83,.71,s*.09],[-.4,.71,s*.09],.012,m.metal);tube(g,[back,axleY,s*.04],[-.8,.71,s*.09],.01,m.metal);}
  cyl(g,.023,.028,.016,m.brass,.3,1.1,.18,10);
  g.userData.interactions=[{position:[.28,1.1,.2],label:'Ring the bicycle bell',text:'A bright little ring runs down the empty lane.',kind:'bell'}];
  return place(g,o);
}

function pottery(g,x,y,z,r,h,color) {
  const pts=[new THREE.Vector2(r*.48,0),new THREE.Vector2(r*.64,h*.06),new THREE.Vector2(r*.92,h*.38),new THREE.Vector2(r,h*.76),new THREE.Vector2(r*.83,h),new THREE.Vector2(r*.70,h),new THREE.Vector2(r*.72,h*.7),new THREE.Vector2(r*.32,h*.22)];
  const vessel=new THREE.Mesh(new THREE.LatheGeometry(pts,12),mat(color));vessel.position.set(x,y,z);vessel.castShadow=true;g.add(vessel);
  const lip=new THREE.Mesh(new THREE.TorusGeometry(r*.765,.009,4,12),mat(0xd6c8a7));lip.rotation.x=Math.PI/2;lip.position.set(x,y+h,z);g.add(lip);
  return vessel;
}

export function makePotDisplay(o={}) {
  const g=new THREE.Group();g.name='shop-display';const m=materials(),rng=random(o.seed||5),type=shopType(o.type||'pottery');
  const w=o.width||1.18,h=o.height||.84;
  const colors=[0x8ca8a5,0xd2c59f,0x708f9c,0xb08473,0xa8ad88,0xe0d0ac];
  const levels=o.tiers==='wall'?[h-.48,h]:[.18,h];
  for(const y of levels)cube(g,w,.045,.48,m.wood,0,y,0);
  for(const x of[-w/2+.035,w/2-.035])for(const z of[-.19,.19])cube(g,.055,h,.055,m.wood,x,h/2,z);
  const items=[];
  const columns=o.columns??4;
  for(let row=0;row<2;row++)for(let i=0;i<columns;i++){
    const x=columns===1?0:-w*.36+i*w*.72/(columns-1),y=levels[row]+.027,z=row===0?.01:-.02;
    if(['tea','incense','coffee'].includes(type.id)){
      const r=.07+rng()*.02;const can=cyl(g,r,r,.19,m.cream,x,y+.095,z,10);items.push(can);
      cyl(g,r*1.025,r*1.025,.025,m.brass,x,y+.2,z,10);
      const band=cyl(g,r*1.006,r*1.006,.065,mat(type.id==='tea'?0x7f9369:0xa78975),x,y+.1,z,10);items.push(band);
    }else if(['wagashi','matcha','confectionery','soba','tofu','restaurant'].includes(type.id)){
      cube(g,.23,.025,.25,m.cream,x,y+.015,z);
      for(let n=0;n<3;n++){const sweet=new THREE.Mesh(new THREE.SphereGeometry(.037,8,6),mat([0xd9afad,0xc6b68e,0x9daf78][(n+row)%3]));sweet.position.set(x+(n-1)*.061,y+.055,z);g.add(sweet);items.push(sweet);}
    }else if(type.id==='fans'){
      const fan=new THREE.Mesh(new THREE.CircleGeometry(.17,18,0,Math.PI),mat(colors[i%colors.length]));fan.position.set(x,y+.06,z);fan.rotation.z=(rng()-.5)*.25;g.add(fan);items.push(fan);
      for(let n=0;n<7;n++){const a=n*Math.PI/6;tube(g,[x,y+.06,z+.005],[x+Math.cos(a)*.16,y+.06+Math.sin(a)*.16,z+.005],.003,m.woodLight,4);}
    }else items.push(pottery(g,x,y,z,.09+rng()*.035,.11+rng()*.11,colors[(i+row*2)%colors.length]));
  }
  plane(g,w*.85,.16,makePriceStrip(type.id),0,h-.13,.247);
  g.userData.displayItems=items;return place(g,o);
}

/** Small working displays, each kept within a shop's existing half-metre apron. */
export function makeShopApron(o={}) {
  const g=new THREE.Group(),m=materials(),type=shopType(o.type||'pottery').id,rng=random(o.seed||5);g.name=`working-shop-apron-${type}`;
  function crate(x,y,w=.46){
    cube(g,w,.035,.31,m.woodLight,x,y+.025,0);
    for(const z of[-.165,.165])for(const h of[.08,.18,.28])cube(g,w,.065,.035,m.woodLight,x,y+h,z);
    for(const xx of[x-w/2,x+w/2])cube(g,.034,.31,.33,m.wood,xx,y+.16,0);
  }
  if(['pottery','crafts','souvenir'].includes(type)){
    crate(-.12,0,.49);crate(.2,.02,.3);
    for(let i=0;i<3;i++)pottery(g,-.27+i*.16,.17,.005,.069+i*.008,.1+rng()*.07,[0x869c99,0xd9caab,0x718994][i]);
    pottery(g,.21,.18,-.01,.093,.19,0xae8971);
    for(let i=0;i<3;i++){const plate=cyl(g,.113,.105,.025,m.cream,-.13,.33+i*.023,.015,12);plate.castShadow=true;}
  }else if(['tea','incense','coffee'].includes(type)){
    crate(0,0,.57);
    for(const x of[-.18,0,.18]){const y=.33+(x===0?.1:0);cyl(g,.064,.064,y-.18,m.cream,x,.18+(y-.18)/2,0,10);cyl(g,.066,.066,.026,m.brass,x,y+.012,0,10);}
    cube(g,.28,.18,.28,m.woodLight,.15,.46,.005);
    cube(g,.295,.025,.295,m.wood,.15,.565,.005);
  }else if(['fans','kimono'].includes(type)){
    for(const x of[-.25,.25])cube(g,.035,.61,.035,m.wood,x,.305,0);
    cube(g,.58,.045,.31,m.wood,0,.24,0);cube(g,.58,.045,.31,m.wood,0,.6,0);
    const cloth=[0x8b9c95,0xb59487,0xd1c3a4];
    for(let i=0;i<3;i++)cube(g,.36-i*.045,.037,.245,mat(cloth[i]),-.045,.28+i*.038,0);
    if(type==='fans')for(const x of[-.15,.12]){const fan=new THREE.Mesh(new THREE.CircleGeometry(.14,12,0,Math.PI),mat(0xccb799));fan.position.set(x,.625,.035);g.add(fan);}
    else for(let i=0;i<3;i++)cube(g,.38-i*.035,.04,.24,mat(cloth[(i+1)%3]),.03,.64+i*.04,0);
  }else{
    for(const x of[-.21,.21])for(const z of[-.12,.12])cube(g,.045,.39,.045,m.wood,x,.195,z);
    cube(g,.53,.055,.36,m.woodLight,0,.415,0);
    cube(g,.39,.025,.25,m.dark,-.03,.455,0);
    pottery(g,-.1,.474,0,.073,.075,0xc4c9ab);cyl(g,.085,.085,.025,m.cream,.13,.478,0,12);
    for(const x of[.105,.15]){const food=new THREE.Mesh(new THREE.SphereGeometry(.027,7,5),mat(type==='matcha'?0x95a879:0xd8b294));food.position.set(x,.517,0);g.add(food);}
  }
  return place(g,o);
}

export function makeVendingMachine(o={}) {
  const g=new THREE.Group();g.name='quiet-tea-vending-machine';const m=materials();const body=mat(0x8b9a7e);
  // Five box body leaves an actual retrieval cavity. The cup lands in that hole.
  cube(g,.88,1.18,.72,body,0,1.18,-.03);cube(g,.88,.23,.72,body,0,.135,-.03);
  for(const s of[-1,1])cube(g,.115,.37,.72,body,s*.382,.425,-.03);
  cube(g,.66,.34,.2,m.dark,0,.435,-.28);cube(g,.7,.035,.57,m.metal,0,.27,-.025);
  plane(g,.79,1.31,makeVendingTexture(),0,1.095,.337);
  cube(g,.88,.06,.76,m.cream,0,1.81,-.03);
  for(const s of[-1,1])cube(g,.15,.065,.55,m.dark,s*.29,.027,-.03);
  const drink=new THREE.Group();drink.userData.dynamic=true;drink.position.set(0,.29,.1);drink.visible=false;g.add(drink);
  cyl(drink,.044,.039,.145,m.cream,0,.072,0,12);cyl(drink,.045,.045,.045,m.green,0,.085,0,12);cyl(drink,.035,.035,.015,m.cream,0,.152,0,12);
  g.userData.interactions=[{position:[.1,1,.5],label:'Choose a cold tea',text:'The machine hums. A little bottle of green tea settles into the tray.',kind:'vending',object:drink,action:()=>{drink.visible=true;}}];
  return place(g,o);
}

export function makeBench(o={}) {
  const g=new THREE.Group();g.name='timber-bench';const m=materials(),w=o.width||1.55;
  for(let i=0;i<4;i++)cube(g,w,.065,.09,m.wood,0,.43,-.18+i*.12);
  for(const x of[-w*.36,w*.36])for(const z of[-.14,.14])cube(g,.09,.41,.09,m.dark,x,.205,z);
  if(o.red){cube(g,w*.98,.038,.44,mat(0xb96359),0,.48,0);}
  g.userData.interactions=[{position:[0,.7,.4],label:'Sit for a moment',text:'The city becomes very quiet. Somewhere beyond the eaves, a temple bell.',kind:'sit'}];return place(g,o);
}

export function makeCat(o={}) {
  const g=new THREE.Group();g.name='sleepy-lane-cat';g.userData.dynamic=true;const fur=mat(o.color||0xcbaa7f),dark=mat(0x55594e);
  const body=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),fur);body.scale.set(1,.85,1.65);body.position.y=.18;g.add(body);
  const head=new THREE.Group();head.position.set(0,.34,.21);g.add(head);
  const skull=new THREE.Mesh(new THREE.SphereGeometry(.125,10,8),fur);head.add(skull);
  for(const s of[-1,1]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.062,.115,3),fur);ear.position.set(s*.077,.101,0);head.add(ear);const eye=new THREE.Mesh(new THREE.BoxGeometry(.027,.009,.012),dark);eye.position.set(s*.053,.01,.111);head.add(eye);}
  const tail=new THREE.Mesh(new THREE.TorusGeometry(.14,.035,6,14,Math.PI*1.6),fur);tail.rotation.x=Math.PI/2;tail.position.set(.16,.065,-.18);g.add(tail);
  g.userData.interactions=[{position:[0,.45,.3],label:'Greet the cat',text:'One slow blink. You have apparently been accepted.',kind:'cat',object:head}];return place(g,o);
}

export function makePlanter(o={}) {
  const g=new THREE.Group();g.name='doorstep-plant';const m=materials();cyl(g,.15,.108,.27,mat(0xb48266),0,.135,0,10);cyl(g,.156,.156,.035,m.woodLight,0,.265,0,10);
  const green=mat(o.color||0x8f9e71),r=random(o.seed||3);
  if((o.seed||3)%3===0){
    tube(g,[0,.25,0],[.025,.67,0],.017,m.wood,5);
    for(let i=0;i<7;i++){const a=i*2.4,x=Math.cos(a)*.14,z=Math.sin(a)*.14,y=.45+r()*.2;const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.135,1),green);leaf.scale.set(1,.68,.85);leaf.position.set(x,y,z);g.add(leaf);}
  }else if((o.seed||3)%3===1){
    for(let i=0;i<5;i++){const a=i*2.4;const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,1),green);leaf.position.set(Math.cos(a)*.105,.34+r()*.075,Math.sin(a)*.105);leaf.scale.y=.8;g.add(leaf);}
  }else for(let i=0;i<7;i++){const a=i*2.4,hh=.23+r()*.3;const x=Math.cos(a)*.13,z=Math.sin(a)*.13;tube(g,[0,.25,0],[x,hh+.25,z],.01,m.green,4);const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.11,0),green);leaf.position.set(x,hh+.22,z);leaf.scale.set(.75,1.32,.75);leaf.rotation.z=(r()-.5)*1.8;g.add(leaf);}
  return place(g,o);
}
