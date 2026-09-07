import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cel, flat } from '../core/toon.js';
import { SHOP_TYPES, shopType, makeVerticalShopSign, makeNorenTexture, makeWoodenSign } from './signage.js';
import { makeLantern, makeMenuBoard, makePotDisplay, makePlanter, makeBench, makeShopApron } from './details.js';

const M=new Map(), GEO=new Map();
function material(color,soft=false){const key=`${color}:${soft}`;if(!M.has(key))M.set(key,cel({color,bands:soft?'soft':3,tint:0x928398}));return M.get(key);}
function mapped(map){const key=map.uuid;if(!M.has(key))M.set(key,flat({color:0xffffff,map,side:THREE.DoubleSide,cache:false}));return M.get(key);}
function random(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function cube(g,w,h,d,m,x=0,y=0,z=0){if(w<=0||h<=0||d<=0)return;const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;}
function cyl(g,r,h,m,x,y,z,rx=0,rz=0,seg=6){const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),m);o.position.set(x,y,z);o.rotation.set(rx,0,rz);o.castShadow=true;g.add(o);return o;}
function rod(g,a,b,r,m){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);const o=cyl(g,r,start.distanceTo(end),m,...start.clone().add(end).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return o;}
function plane(g,w,h,map,x,y,z){const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mapped(map));o.position.set(x,y,z);g.add(o);return o;}

// Cached tile roof plates hold real semicircular cover-tile relief. Only the
// tile lips need separate geometry; the broad painted masses stay quiet.
function roofShape(width,depth,rise){
  const key=`roof:${width.toFixed(2)}:${depth.toFixed(2)}:${rise.toFixed(2)}`;
  if(GEO.has(key))return GEO.get(key);
  const n=Math.max(12,Math.round(width/.285)),across=n*4,rows=Math.ceil(depth/.36);
  const positions=[],uvs=[],indices=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=across;i++){
    const u=i/across,v=j/rows;
    const x=(u-.5)*width,z=v*depth;
    const cover=Math.pow(Math.max(0,Math.cos((i%4)*Math.PI/2)),2)*.043;
    const kick=v>.83?Math.pow((v-.83)/.17,2)*.052:0;
    positions.push(x,rise*(1-v)+cover+kick,z);
    uvs.push(u,v);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<across;i++){
    const a=j*(across+1)+i,b=a+across+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();GEO.set(key,geometry);return geometry;
}

/** Kyoto hirairi roof: ridge along X, eaves facing +Z and -Z. */
function tiledRoof(g,{w,d,y,rise=1.06,roof,trim,wall,detail=true}){
  const rw=w+.64,half=d/2+.54;
  for(const side of[-1,1]){
    const mesh=new THREE.Mesh(roofShape(rw,half,rise),roof);mesh.position.y=y;
    if(side<0)mesh.rotation.y=Math.PI;
    mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);
    const slab=cube(g,rw,.075,Math.hypot(half,rise),roof,0,y+rise*.5-.048,side*half*.5);
    slab.rotation.x=side*Math.atan2(rise,half);
    cube(g,rw,.105,.115,roof,0,y+.035,side*half);
    // Rows of overlapping clay tiles. Each edge is geometry, not a grid texture.
    const rowCount=Math.ceil(half/.38);
    for(let j=1;j<=rowCount;j++){
      const z=j/rowCount*half,yy=y+rise*(1-z/half)+.035+(j===rowCount?.05:0);
      cube(g,rw,.026,.035,trim,0,yy,side*z);
    }
    if(detail){
      const n=Math.max(10,Math.round(rw/.285));
      for(let i=0;i<=n;i++){
        const x=-rw/2+i*rw/n;
        const cap=new THREE.Mesh(new THREE.CylinderGeometry(.063,.063,.09,7),roof);cap.rotation.x=Math.PI/2;cap.position.set(x,y+.083,side*(half+.023));g.add(cap);
      }
      // Exposed rafters visible from the lane, beneath the roof rather than painted on it.
      const nRafters=Math.floor(rw/.42);
      for(let i=0;i<nRafters;i++){
        const x=-rw/2+.17+i*rw/nRafters;
        rod(g,[x,y+.18,side*(half-.65)],[x,y-.03,side*half],.032,trim);
      }
    }
  }
  cyl(g,.095,rw+.12,roof,0,y+rise+.075,0,0,Math.PI/2,8);
  cube(g,rw,.13,.16,roof,0,y+rise+.018,0);
  // Close both ends of the attic so roofs have volume at oblique street views.
  const shape=new THREE.Shape();shape.moveTo(-d/2,0);shape.lineTo(d/2,0);shape.lineTo(0,rise*.97);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:false});geometry.rotateY(Math.PI/2);
  for(const side of[-1,1]){const end=new THREE.Mesh(geometry,wall||trim);end.position.set(side*(w/2-.04),y,0);g.add(end);}
}

function lattice(g,{x,y,z,w,h,wood,back,spacing=.11,mushiko=false}){
  cube(g,w+.14,h+.12,.075,wood,x,y,z-.075);
  cube(g,w,h,.026,back,x,y,z-.026);
  const bars=Math.max(4,Math.floor(w/spacing));
  for(let i=0;i<=bars;i++)cube(g,mushiko?.067:.027,h,.072,wood,x-w/2+i*w/bars,y,z+.031);
  for(const yy of[mushiko?-h*.5:-h*.32,h*.32])cube(g,w+.04,.038,.08,wood,x,y+yy,z+.042);
  cube(g,w+.16,.055,.14,wood,x,y-h/2-.05,z+.017);
}

function shedEave(g,{w,z,y,depth,drop,roof,wood}){
  const surface=new THREE.Mesh(roofShape(w,depth,drop),roof);surface.position.set(0,y-drop,z);surface.castShadow=surface.receiveShadow=true;g.add(surface);
  cube(g,w,.11,.095,wood,0,y-drop+.04,z+depth);
  const n=Math.floor(w/.32);
  for(let i=0;i<=n;i++){
    const x=-w/2+i*w/n;
    rod(g,[x,y-.045,z],[x,y-drop-.012,z+depth],.023,wood);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.047,.047,.07,6),roof);cap.rotation.x=Math.PI/2;cap.position.set(x,y-drop+.07,z+depth+.025);g.add(cap);
  }
  for(let row=1;row<=3;row++){const t=row/3;cube(g,w,.025,.035,roof,0,y-drop*t+.023,z+depth*t);}
}

function bambooSkirt(g,x,z,w,m){
  // Inuyarai: curved bamboo splashboard, particularly characteristic of Gion.
  const count=Math.floor(w/.074);
  for(let i=0;i<=count;i++){
    const xx=x-w/2+w*i/count;
    const points=[new THREE.Vector3(xx,.035,z+.34),new THREE.Vector3(xx,.19,z+.31),new THREE.Vector3(xx,.44,z+.18),new THREE.Vector3(xx,.68,z+.025)];
    const curve=new THREE.CatmullRomCurve3(points);const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,5,.0145,4,false),m);g.add(mesh);
  }
  for(const[y,zz]of[[.15,z+.32],[.44,z+.18],[.65,z+.04]])rod(g,[x-w/2,y,zz],[x+w/2,y,zz],.018,m);
}

function mergeLocalStatic(g){
  // Local merge limits startup memory, then the world can regroup these meshes
  // by spatial cell. Animated pivots and mapped materials remain separate.
  const buckets=new Map(),remove=[];g.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(g.matrixWorld).invert();
  g.traverse(o=>{
    if(!o.isMesh||Array.isArray(o.material)||o.material.map)return;
    let p=o;while(p&&p!==g){if(p.userData.dynamic)return;p=p.parent;}
    const key=`${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
    const geo=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
    const usable=geo.index?geo.toNonIndexed():geo;
    if(usable!==geo)geo.dispose();
    // Primitive UV attributes vary, and all these surfaces are untextured.
    usable.deleteAttribute('uv');
    if(!buckets.has(key))buckets.set(key,{geos:[],material:o.material,cast:o.castShadow,receive:o.receiveShadow});
    buckets.get(key).geos.push(usable);remove.push(o);
  });
  for(const bucket of buckets.values()){
    const geometry=mergeGeometries(bucket.geos,false);bucket.geos.forEach(geo=>geo.dispose());
    const mesh=new THREE.Mesh(geometry,bucket.material);mesh.castShadow=bucket.cast;mesh.receiveShadow=bucket.receive;mesh.name='machiya-structure';g.add(mesh);
  }
  remove.forEach(o=>o.removeFromParent());
}

/**
 * A Kyoto street house. Origin is footprint center at finished ground height;
 * facade faces local +Z. Root placement owns geographic terrain and collision.
 */
export function makeMachiya(o={}){
  const w=o.width??o.w??5.8,d=o.depth??o.d??7,floors=o.floors??2,seed=o.seed??1;
  const rng=random(seed),variant=o.variant??seed%7;
  const district=String(o.district||'').toLowerCase(),gion=/gion|hanami|ishibe/.test(district);
  const shop=o.shopType!==false&&o.facadeType!=='residence',type=shopType(o.shopType||seed%SHOP_TYPES.length);
  const h1=o.h1??2.65,h2=o.h2??(gion?1.66:1.79),H=h1+(floors>1?h2:0),rise=o.roofRise??1.03;
  const front=d/2,rec=o.recessedEntry===false?.48:(o.recess??.94);
  const g=new THREE.Group();g.name=`machiya-${type.id}-${seed}`;g.userData.shop=shop;g.userData.shopType=type.id;
  g.userData.interactions=[];g.userData.animated=[];
  const timberTones=gion?[0x665044,0x5f4d40,0x775141,0x855e48]:[0x83664b,0x725944,0x92714f,0x755b46];
  const tone=o.timberTone;
  const wood=material(tone===undefined?timberTones[variant%timberTones.length]:Number.isInteger(tone)&&tone>=0&&tone<timberTones.length?timberTones[tone]:tone);
  const dark=material(0x514a43),inside=material(0x615b55),roof=material([0x788683,0x6e7c7b,0x84918a][seed%3]);
  const tileShadow=material(0x64726f),stone=material(0xa7a594),bamboo=material(0xaea17d);
  const plasters=gion?[0xd9c6a5,0xb6795c,0xe4d5b6,0xd3c1a2]:[0xebdfbf,0xdacda9,0xf0e5c9,0xe2d6b7];
  const plaster=material(o.plasterTone??plasters[variant%plasters.length]);
  const glass=material(0x89968a,true),paper=material(0xd0c6a7,true);

  // Ground floor mass ends behind the entry. Real reveals catch cool bounce.
  cube(g,w,h1,d-rec,plaster,0,h1/2,-rec/2);
  cube(g,w+.12,.17,d+.12,stone,0,.085,0);
  cube(g,w-.13,.055,rec+.03,wood,0,.185,front-rec/2);
  const post=.115;
  for(const x of[-w/2+post/2,w/2-post/2])cube(g,post,H,.22,wood,x,H/2,front-.04);
  cube(g,w,.21,.24,wood,0,h1-.105,front-.04);
  cube(g,w,.24,.12,wood,0,.31,front-.015);

  // Door and shop window differ in actual depth. A dark back wall is visible
  // behind the threshold and never coincides with the glass/lattice plane.
  const doorW=Math.min(1.35,w*.24),doorX=(variant%2?1:-1)*w*.255;
  const doorZ=front-rec+.055;
  cube(g,doorW,2.13,.055,dark,doorX,1.28,doorZ);
  for(const x of[doorX-doorW/2-.04,doorX+doorW/2+.04])cube(g,.09,2.36,.31,wood,x,1.37,front-.13);
  for(const x of[doorX-doorW/2-.045,doorX+doorW/2+.045])cube(g,.09,2.31,rec,wood,x,1.35,front-rec/2);
  cube(g,doorW+.18,.12,.42,wood,doorX,2.52,front-.16);
  cube(g,doorW+.13,.08,.4,stone,doorX,.21,front+.1);
  lattice(g,{x:doorX,y:1.38,z:doorZ+.065,w:doorW-.13,h:1.84,wood,back:inside,spacing:.105});
  cube(g,.025,.18,.034,bamboo,doorX+doorW*.3,1.22,doorZ+.145);

  const edges=[[-w/2+.2,doorX-doorW/2-.16],[doorX+doorW/2+.16,w/2-.2]];
  let displayX=0,displayWidth=1;
  for(const[left,right]of edges){
    const ww=right-left;if(ww<.2)continue;const x=(left+right)/2;
    if(ww>displayWidth){displayX=x;displayWidth=ww;}
    cube(g,ww,.42,.13,wood,x,.46,front+.02);
    if(gion||!shop||ww<1.2){lattice(g,{x,y:1.52,z:front+.1,w:ww-.06,h:1.44,wood,back:glass,spacing:gion?.074:.115});}
    else{
      cube(g,ww,1.56,.03,inside,x,1.48,front-rec+.065);
      for(const xx of[left+.03,right-.03])cube(g,.065,1.67,rec,wood,xx,1.63,front-rec/2);
      cube(g,ww,.095,rec,wood,x,2.36,front-rec/2);
      const backShelf=makePotDisplay({type:type.id,width:ww*.87,height:1.57,tiers:'wall',columns:Math.max(4,Math.min(8,Math.floor(ww/.32))),seed:seed+Math.round(x*30)});
      backShelf.position.set(x,0,front-rec+.36);g.add(backShelf);
      cube(g,ww,.12,.44,wood,x,.85,front-.1);
      for(const xx of[left,right])cube(g,.075,1.67,.075,wood,xx,1.63,front+.045);
      // Sliding window frames and a slim vertical reflection keep display bays open.
      cube(g,.045,1.57,.06,wood,x,1.58,front+.055);
      const pane=new THREE.Mesh(new THREE.PlaneGeometry(ww-.13,1.52),flat({color:0xc6d2bc,transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide,cache:false}));pane.position.set(x,1.57,front-.035);g.add(pane);
      cube(g,ww,.075,.1,wood,x,2.36,front+.02);
    }
    cube(g,ww,.15,.1,plaster,x,2.48,front-.035);
  }

  // Upper floor has plaster piers and low insect-cage or timber lattice windows.
  if(floors>1){
    const set=.11,upperFront=front-set;
    cube(g,w,h2,d-.28,plaster,0,h1+h2/2,-.14);
    cube(g,w,.22,.2,wood,0,h1+.04,upperFront+.02);
    cube(g,w,.22,.2,wood,0,H-.09,upperFront+.02);
    const columns=Math.max(2,Math.round(w/2.05)),cell=(w-.4)/columns;
    for(let i=0;i<columns;i++){
      const x=-w/2+.2+cell*(i+.5),isMushiko=variant%4===0;
      const framed=!gion&&variant%3!==2;
      const wh=isMushiko?.72:h2-(framed?.7:.46),ww=isMushiko?cell*.76:cell-(framed?.58:.18);
      lattice(g,{x,y:h1+h2*.53,z:upperFront+.07,w:ww,h:wh,wood:isMushiko?plaster:wood,back:gion?dark:glass,spacing:isMushiko?.12:(gion?.079:.12),mushiko:isMushiko});
      if(gion&&variant%3===1){
        // Summer bamboo blinds remain a shallow object in front of upper glass.
        for(let j=0;j<15;j++)cube(g,ww,.025,.038,bamboo,x,h1+.42+j*.06,upperFront+.155);
        for(const xx of[-ww*.31,ww*.31])cube(g,.012,.89,.016,wood,x+xx,h1+.84,upperFront+.18);
      }
      if(i<columns-1)cube(g,.11,h2,.14,wood,x+cell/2,h1+h2/2,upperFront+.04);
    }
    // On occasional hill houses an upper balustrade gives the classic pagoda-lane rhythm.
    if(!gion&&variant%3===2){
      for(const yy of[h1+.16,h1+.64])cube(g,w-.3,.065,.09,wood,0,yy,front+.21);
      for(let i=0;i<Math.floor(w/.21);i++)cube(g,.029,.51,.06,wood,-w/2+.22+i*.21,h1+.39,front+.21);
    }
  }

  // Street corners expose the end wall. Privacy casements, rain cladding and
  // closed service doors give that elevation actual architecture at eye level.
  for(const s of[-1,1]){
    for(let i=0;i<=Math.ceil((d-.3)/1.7);i++){const z=-d/2+.15+i*(d-.3)/Math.ceil((d-.3)/1.7);cube(g,.075,H,.085,wood,s*(w/2+.017),H/2,z);}
    cube(g,.07,.13,d,wood,s*(w/2+.025),h1,0);
    const end=new THREE.Group();end.position.x=s*(w/2+.059);end.rotation.y=s*Math.PI/2;g.add(end);
    const baseH=variant%3===0?1.25:.92;
    cube(end,d-.14,baseH,.042,variant%2?dark:wood,0,baseH/2+.18,.018);
    for(let k=1;k<Math.ceil(baseH/.16);k++)cube(end,d-.13,.012,.021,tileShadow,0,.18+k*.16,.049);
    cube(end,d-.08,.055,.09,wood,0,baseH+.19,.051);
    if(floors>1){
      const casements=variant%3===1?1:2,spacing=d*.25;
      for(let k=0;k<casements;k++){
        const xx=casements===1?-s*d*.12:(k-.5)*spacing*2,ww=casements===1?1.3:.92,hh=variant%3===2?.63:.83;
        lattice(end,{x:xx,y:h1+h2*.53,z:.043,w:ww,h:hh,wood,back:glass,spacing:.115});
        cube(end,ww+.25,.055,.23,roof,xx,h1+h2*.53+hh/2+.11,.08);
        if(variant%3===1){for(let j=0;j<8;j++)cube(end,ww-.04,.031,.035,bamboo,xx,h1+h2*.53-hh/2+.07+j*.083,.157);}
      }
    }
    if((variant+(s>0?1:0))%3!==2){
      const xx=s*d*.245;
      cube(end,.94,1.92,.06,wood,xx,1.15,.052);cube(end,.78,1.73,.035,dark,xx,1.16,.091);
      for(let k=0;k<6;k++)cube(end,.027,1.7,.026,wood,xx-.34+k*.136,1.16,.123);
      cube(end,.055,.18,.04,bamboo,xx+.25,1.08,.155);
      cube(end,1.08,.075,.19,stone,xx,.225,.062);
      const light=cube(end,.14,.18,.12,paper,xx+.65,1.91,.11);cube(end,.21,.047,.18,dark,xx+.65,2.02,.105);
      light.castShadow=false;
    }else{
      lattice(end,{x:s*d*.16,y:1.73,z:.057,w:1.04,h:.52,wood,back:dark,spacing:.1});
      const meterX=-s*d*.29;
      cube(end,.22,.3,.105,stone,meterX,1.39,.092);cyl(end,.044,.018,glass,meterX,1.43,.155,Math.PI/2,0,10);
      cyl(end,.016,1.14,dark,meterX,.71,.097);
    }
  }
  tiledRoof(g,{w,d,y:H,rise,roof,trim:tileShadow,wall:plaster,detail:true});
  shedEave(g,{w:w+.4,z:front-.09,y:h1+.16,depth:.86,drop:.27,roof,wood});

  // Gutters, downpipes, rain chain, wall meter and AC retain contemporary Kyoto.
  cyl(g,.044,w+.49,dark,0,h1-.112,front+.79,0,Math.PI/2,8);
  const pipeX=(variant%2?1:-1)*(w/2+.055);
  cyl(g,.033,h1-.18,dark,pipeX,(h1-.18)/2+.08,front+.06);
  rod(g,[pipeX,h1-.09,front+.78],[pipeX,h1-.28,front+.06],.034,dark);
  if(seed%3===0){
    const chainX=-pipeX;
    for(let i=0;i<21;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.028,.005,3,7),material(0x9d977e));ring.position.set(chainX,.21+i*.105,front+.69);ring.rotation.y=i%2?Math.PI/2:0;g.add(ring);}
    cyl(g,.18,.065,stone,chainX,.13,front+.69,0,0,10);
  }
  if(!gion&&seed%4===0){
    const acX=w/2-.52;cube(g,.7,.46,.31,material(0xc5c7ad),acX,2.88,front+.12);
    for(let i=0;i<6;i++)cube(g,.54,.018,.03,tileShadow,acX,2.73+i*.05,front+.285);
    cube(g,.16,.3,.09,stone,-w/2+.27,1.56,front+.14);cyl(g,.015,.58,dark,-w/2+.27,1.12,front+.12);
  }

  if(gion){
    for(const[left,right]of edges)if(right-left>.55)bambooSkirt(g,(left+right)/2,front+.1,right-left-.02,bamboo);
  }

  if(shop){
    // Signs are deliberately small enough to belong to the facade.
    const sx=-Math.sign(doorX)*(w/2-.34),signHeight=gion?.94:1.16;
    const boardZ=front+.22;
    cube(g,.36,signHeight,.095,wood,sx,1.84,boardZ);
    plane(g,.3,signHeight-.07,makeVerticalShopSign(type.id,{dark:gion}),sx,1.84,boardZ+.051);
    if(!gion&&variant%2===0){
      const blade=new THREE.Group();blade.position.set(sx,2.6,front+.39);blade.rotation.y=-Math.sign(sx)*Math.PI/2;g.add(blade);
      cube(blade,.44,1.27,.09,wood);plane(blade,.37,1.18,makeVerticalShopSign(type.id),0,0,.049);const reverse=plane(blade,.37,1.18,makeVerticalShopSign(type.id),0,0,-.049);reverse.rotation.y=Math.PI;
      rod(g,[sx,3.2,front-.03],[sx,3.2,front+.68],.022,wood);
    }
    if(variant%3===1){cube(g,1.62,.46,.095,wood,doorX,2.1,front-rec+.135);plane(g,1.52,.39,makeWoodenSign(type.name,type.subtitle,{dark:gion}),doorX,2.1,front-rec+.186);}

    const clothWidth=Math.min(1.8,doorW+.23),clothHeight=.58;
    const clothPivot=new THREE.Group();clothPivot.position.set(doorX,2.34,front-.16);clothPivot.userData.dynamic=true;clothPivot.visible=o.noren!==false;g.add(clothPivot);
    const clothMap=makeNorenTexture(type.id),panels=3;
    for(let i=0;i<panels;i++){
      const geometry=new THREE.PlaneGeometry(clothWidth/panels-.018,clothHeight,3,4),uv=geometry.attributes.uv;
      for(let j=0;j<uv.count;j++)uv.setX(j,(uv.getX(j)+i)/panels);
      const cloth=new THREE.Mesh(geometry,mapped(clothMap));cloth.position.set(-clothWidth/2+(i+.5)*clothWidth/panels,-clothHeight/2,0);cloth.rotation.y=(i-1)*.027;cloth.receiveShadow=false;cloth.castShadow=false;clothPivot.add(cloth);
    }
    cyl(g,.022,clothWidth+.17,wood,doorX,2.38,front-.16,0,Math.PI/2,6);
    g.userData.animated.push({object:clothPivot,type:'noren',phase:seed*.73,amount:.025});
    g.userData.interactions.push({position:[doorX,1.5,front+.42],label:`${type.action} · ${type.name}`,text:type.item,kind:type.kind,object:clothPivot});
    if(seed%3===0)g.userData.interactions.push({position:[sx,1.5,front+.5],label:'Read the shop sign',text:`${type.name} — ${type.en}. ${type.subtitle}.`,kind:'sign'});

    if(gion||seed%2===0){
      const lantern=makeLantern({text:gion?'祇園':type.name.slice(0,2),color:gion?'#bf6753':'#d49a77',size:gion?.54:.51,seed});
      lantern.position.set(doorX+Math.sign(doorX)*(doorW/2+.19),2.45,front+.29);g.add(lantern);
      for(const a of lantern.userData.animated)g.userData.animated.push(a);
      lantern.userData.animated=[];
      rod(g,[lantern.position.x,2.46,front-.1],[lantern.position.x,2.46,front+.32],.025,wood);
    }
    const merch=makePotDisplay({type:type.id,width:Math.min(1.35,displayWidth*.9),height:gion?.48:.96,seed});
    merch.position.set(displayX,0,front-(gion?.36:.21));g.add(merch);
    const mealShop=['soba','tofu','restaurant','coffee','matcha'].includes(type.id);
    if((gion&&seed%4===0)||(!gion&&(mealShop||seed%3===1))){const board=makeMenuBoard({type:type.id});board.position.set(doorX-Math.sign(doorX)*(doorW/2+.38),0,front+.46);board.rotation.y=(rng()-.5)*.3;g.add(board);}
    if(!gion&&seed%3!==1&&seed%4!==1){
      const apron=makeShopApron({type:type.id,seed});apron.position.set(displayX,0,front+.28);g.add(apron);
    }
    if(!gion&&seed%4===1){const bench=makeBench({width:1.27,red:seed%2===1});bench.position.set(displayX,0,front+.54);g.add(bench);g.userData.interactions.push({...bench.userData.interactions[0],position:[displayX,.7,front+.97]});bench.userData.interactions=[];}
  }
  if(seed%3===0||(!shop&&seed%2===0)){const plant=makePlanter({seed:seed*17+variant*13});plant.position.set((variant%2?-1:1)*(w/2-.25),0,front+.31);g.add(plant);}

  g.userData.width=w;g.userData.depth=d;g.userData.height=H+rise+.18;g.userData.front=front;
  g.userData.footprint={width:w,depth:d,height:H};
  // Keep a real route-facing apron gap when registering collision: depth of
  // the door recess is semantic metadata, not an invisible full-footprint wall.
  g.userData.recess={depth:rec,doorX,width:doorW};
  mergeLocalStatic(g);
  return g;
}

export { SHOP_TYPES };
