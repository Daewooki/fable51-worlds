import * as THREE from 'three';
import { cel, flat } from '../core/toon.js';
import { box, cyl, plane } from '../core/util.js';
import { makeCurvedRoof, compact } from './pagoda.js';
import { makeShrineGate, templeText, makeStoneLantern } from './shrine.js';

export function makeTempleGate(){
  const group=makeShrineGate({width:10,height:14,wing:false,label:'清水寺',roofShape:'hip'});group.name='Kiyomizu-dera Nio-mon';
  // Actual lattice bays, guardian silhouettes, multiple gold bracket accents.
  const stone=cel({color:0xb9b5a5}),bronze=cel({color:0x81745e});
  for(const s of [-1,1]){
    const guardian=new THREE.Group();guardian.position.set(s*6.4,0,2.4);
    guardian.add(box(1.4,.35,1.5,stone,0,.18,0),box(1.14,1.1,1.24,stone,0,.9,0),box(1.45,.18,1.5,stone,0,1.55,0));
    const body=new THREE.Mesh(new THREE.IcosahedronGeometry(.60,1),bronze);body.scale.set(.6,1,1);body.position.set(0,2.06,0);guardian.add(body);
    const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.35,1),bronze);head.position.set(0,2.65,.28);guardian.add(head);
    for(const x of [-.26,.26])guardian.add(box(.18,.62,.19,bronze,x,1.86,.27));
    group.add(guardian);
  }
  group.userData.interactions=[{position:[0,1.4,3.5],label:'Read the Nio-mon plaque',text:'清水寺 · Nio-mon\nBeyond the vermilion entrance, the roofs step east toward Mount Otowa.',kind:'read'}];
  group.userData.footprint={width:16,depth:7,height:14};return compact(group);
}

/** Hondo/stage origin is DECK HEIGHT. The real support structure descends 13m. */
export function makeKiyomizuTemple(){
  const g=new THREE.Group();g.name='Kiyomizu-dera Hondo and wooden stage';
  const wood=cel({color:0x74604d,emissive:0x74604d,emissiveIntensity:.085}),pale=cel({color:0xa5906d,emissive:0xa5906d,emissiveIntensity:.06}),beam=cel({color:0x5f5044,emissive:0x5f5044,emissiveIntensity:.1}),rail=cel({color:0x8c806d}),roofMat=cel({color:0x796d66}),cream=cel({color:0xe1d6b9}),dark=flat({color:0x3a3639}),gold=cel({color:0xbd9b53});
  const posts=cel({color:0x896e53,emissive:0x896e53,emissiveIntensity:.10});
  // Individual planks and real 6 x 11 timber grid remain visible from across the ravine.
  g.add(box(32,.32,30,beam,0,-.21,-1));
  for(let i=0;i<65;i++)g.add(box(.46,.09,29.9,i%5===0?pale:wood,-15.76+i*.49,-.015,-1));
  for(let col=0;col<11;col++)for(let row=0;row<6;row++){
    const x=-14.5+col*2.9,z=-.5+row*2.66;
    const h=12.8-row*.12;
    g.add(cyl(.29,.38,h,8,posts,x,-h*.5-.32,z),box(.94,.32,.94,cel({color:0x9e9b89}),x,-h-.24,z));
    for(const y of [-2.5,-5.5,-8.5,-11.3])g.add(box(.85,.34,.65,wood,x,y,z));
  }
  for(const y of [-1.05,-3.1,-6.1,-9.1,-11.8]){
    for(let row=0;row<6;row++)g.add(box(31.2,.31,.35,wood,0,y,-.5+row*2.66));
    for(let col=0;col<11;col++)g.add(box(.33,.31,14.6,wood,-14.5+col*2.9,y,6.25));
  }
  // Main worship volume remains behind the deep open veranda.
  g.add(box(25.4,5.8,.38,wood,0,2.96,-12.8),box(.35,5.8,12,wood,-12.7,2.96,-6.8),box(.35,5.8,12,wood,12.7,2.96,-6.8));
  g.add(box(23.7,3.85,.10,dark,0,2.3,-6.6));
  for(let i=-4;i<=4;i++){
    const x=i*2.8;g.add(cyl(.21,.26,6.8,10,posts,x,3.4,.2),box(.65,.3,.8,pale,x,6.55,.2));
    for(const z of [-6.5,-12])g.add(cyl(.22,.27,6.6,10,posts,x,3.3,z));
    g.add(box(2.45,2.75,.15,i===0?gold:wood,x,2.22,-6.43));
    for(let k=0;k<10;k++)g.add(box(.055,2.7,.06,beam,x-1.04+k*.23,2.22,-6.32));
  }
  for(const z of [.25,-6.5,-12.2])for(const y of [4.55,5.8,6.4])g.add(box(28,.24,.27,pale,0,y,z));
  // Bracket/rafter rhythm is actual geometry under the broad hipped cypress roof.
  for(let i=-16;i<=16;i++)for(const s of [-1,1]){
    const x=i*.91,z=-6+s*9.0;g.add(box(.16,.18,2.15,pale,x,6.53,z),box(.42,.25,.54,wood,x,6.45,z*.84));
  }
  const roof=makeCurvedRoof({width:36.5,depth:28,height:9.8,ridge:12.5,color:0x786b63,edgeColor:0xb8aa87,tiles:false,outline:true,bark:true});roof.position.set(0,6.8,-6);g.add(roof);
  // Two irimoya-style projecting gables seen in the classic ravine view.
  for(const s of [-1,1]){
    const wing=makeCurvedRoof({width:8.1,depth:7.5,height:2.85,gable:true,color:0x786b63,edgeColor:0xb8aa87,tiles:false,bark:true});wing.rotation.y=Math.PI/2;wing.position.set(s*10,6.65,3);g.add(wing);
    const pediment=new THREE.Shape();pediment.moveTo(-2.35,0);pediment.lineTo(0,2.0);pediment.lineTo(2.35,0);pediment.closePath();
    const face=new THREE.Mesh(new THREE.ShapeGeometry(pediment),cream);face.position.set(s*10,6.93,6.66);g.add(face);
    for(let j=-5;j<=5;j++){const h=Math.max(.2,1.8-Math.abs(j)*.3);g.add(box(.08,h,.10,wood,s*10+j*.38,6.93+h*.5,6.73));}
  }
  // Broad stage has railing on exposed edges, leaving a clear west entry.
  const railing=(width,x,z,rot=0)=>{
    const r=new THREE.Group();r.add(box(width,.17,.18,rail,0,1.04,0),box(width,.1,.12,rail,0,.48,0));
    for(let k=0;k<=Math.floor(width/.68);k++){const p=-width*.5+k*.68;r.add(box(.105,1.05,.105,rail,p,.53,0));}
    for(const p of [-width*.5,width*.5]){r.add(cyl(.15,.15,1.22,8,beam,p,.61,0));const jewel=new THREE.Mesh(new THREE.SphereGeometry(.19,8,6),rail);jewel.position.set(p,1.25,0);r.add(jewel);}
    r.position.set(x,0,z);r.rotation.y=rot;g.add(r);
  };
  railing(32,0,13.7);railing(11.2,15.78,8.1,Math.PI/2);railing(8.6,-15.78,9.5,Math.PI/2);
  // Match the veranda guard rail and small resting places to human height.
  for(const x of [-9,9])g.add(box(3.4,.13,.62,pale,x,.57,1.6),box(.17,.52,.5,beam,x-1.3,.27,1.6),box(.17,.52,.5,beam,x+1.3,.27,1.6));
  g.add(plane(1.4,2.1,flat({map:templeText('清水の舞台',{paper:'#70604a',ink:'#f0e4c1'})}),-12.2,2.4,.41));
  const offertory=box(3.2,.95,1.2,wood,0,.57,-3.5);g.add(offertory);for(let i=-10;i<=10;i++)g.add(box(.09,.06,1.12,gold,i*.15,1.08,-3.5));
  // Carved metal shoes, grain-colored joints, low information board.
  for(const x of [-11.2,-5.6,5.6,11.2])g.add(box(.66,.12,.66,beam,x,.08,.2));
  const info=new THREE.Group();info.position.set(11.8,0,10.8);info.add(box(.12,.9,.12,beam,0,.45,0),plane(1.3,.64,flat({map:templeText('京都を望む',{vertical:false})}),0,1.13,.07));g.add(info);
  g.userData.colliders=[
    {minX:-13.1,maxX:13.1,minZ:-13.1,maxZ:-6.2,minY:0,maxY:7},
    {minX:-16.1,maxX:16.1,minZ:13.45,maxZ:14.1,minY:0,maxY:1.4},
    {minX:15.45,maxX:16.1,minZ:2.5,maxZ:14.1,minY:0,maxY:1.4},
    {minX:-16.1,maxX:-15.45,minZ:5.1,maxZ:14.1,minY:0,maxY:1.4},
    {minX:-1.7,maxX:1.7,minZ:-4.15,maxZ:-2.85,minY:0,maxY:1.1},
  ];
  g.userData.walkables=[{minX:-16,maxX:16,minZ:-16,maxZ:14,height:0}];
  g.userData.interactions=[
    {position:[-12.2,1.4,2.1],label:'Read about the wooden stage',text:'清水の舞台\nThe timber stage reaches over the valley. Its columns and horizontal ties are modeled all the way to the hillside below.',kind:'read'},
    {position:[0,1.3,-1.8],label:'Pause before the main hall',text:'The open veranda holds a cool, quiet shade. Wind moves through the timber joints.',kind:'bell'},
    {position:[-9,1.1,2.6],label:'Rest on the veranda bench',text:'Take a moment. The route from Gion has become a line of roofs below you.',kind:'sit'},
    {position:[11.8,1.3,9.6],label:'Find Kyoto in the haze',text:'京都 · Kyoto\nWest of the temple, the basin opens into a sea of low roofs and distant hills.',kind:'photo'},
    {position:[0,1.2,12.5],label:'Listen from the stage',text:'A bell, a breeze, and the soft sound of the city far below.',kind:'chime'},
    {position:[9,1.2,2.6],label:'Stamp the Kiyomizu page',text:'清水寺\nA final impression from the hillside. Your walk has reached the wooden stage.',kind:'stamp'},
  ];
  g.userData.footprint={minX:-19,maxX:19,minZ:-21,maxZ:14,minY:-13,maxY:17};return compact(g);
}
