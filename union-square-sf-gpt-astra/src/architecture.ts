import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { streetHeight } from './site';

/** Original geometry authored for this project. Metres; X east, Y up, Z south.
 * Building measurements are reference-derived estimates, not survey data.
 * See ARCHITECTURE_LOG.md and references/SOURCES.md for provenance/limits. */
export interface ArchitectureCollider { minX:number; maxX:number; minZ:number; maxZ:number; minY?:number; maxY?:number }
type MatName = 'hotel'|'hotelLight'|'hotelDark'|'copper'|'cream'|'white'|'gray'|'roof'|'charcoal'|'metal'|'bronze'|'red'|'wood'|'glassA'|'glassB'|'glassC'|'curtain'|'interior'|'warm'|'green'|'paleGreen'|'terracotta'|'orange'|'brick'|'glassFacadeA'|'glassFacadeB';
type Transform = { x:number; z:number; y:number; angle:number; name:string };
const groundAt = (x:number,z:number) => streetHeight(x,z)+.12;
const boxBase = new THREE.BoxGeometry(1,1,1);
const palette: Record<MatName,{color:number;roughness:number;metalness?:number}> = {
  hotel:{color:0x817968,roughness:.9}, hotelLight:{color:0xaba18c,roughness:.82}, hotelDark:{color:0x656153,roughness:.92},
  copper:{color:0x405953,roughness:.66,metalness:.4}, cream:{color:0xd2cec1,roughness:.86}, white:{color:0xe5e2d8,roughness:.82},
  gray:{color:0x9b9c97,roughness:.82}, roof:{color:0x676b67,roughness:.94}, charcoal:{color:0x282d2d,roughness:.6},
  metal:{color:0x838d8c,roughness:.34,metalness:.68}, bronze:{color:0x67563b,roughness:.43,metalness:.62}, red:{color:0x8d1738,roughness:.9},
  wood:{color:0xa98056,roughness:.77}, glassA:{color:0x263b46,roughness:.14,metalness:.18}, glassB:{color:0x4b626b,roughness:.13,metalness:.15},
  glassC:{color:0x76848b,roughness:.18,metalness:.12},glassFacadeA:{color:0x42525c,roughness:.065,metalness:.48},glassFacadeB:{color:0x5c6a71,roughness:.09,metalness:.38}, curtain:{color:0xabaeaa,roughness:.88}, interior:{color:0x242b2c,roughness:1},
  warm:{color:0xe3d6b4,roughness:.8}, green:{color:0x39542d,roughness:1},paleGreen:{color:0x65735e,roughness:.93},terracotta:{color:0x99756a,roughness:.87},orange:{color:0xb68c65,roughness:.88},brick:{color:0x8b5447,roughness:.96},
};

export function buildArchitecture(): {group:THREE.Group;colliders:ArchitectureCollider[]} {
  const group = new THREE.Group(); group.name='Reference-authored Union Square enclosing architecture';
  const colliders:ArchitectureCollider[]=[];
  const materials = {} as Record<MatName,THREE.MeshStandardMaterial>;
  for(const [key,p] of Object.entries(palette)) {
    const m=new THREE.MeshStandardMaterial({...p,envMapIntensity:key.startsWith('glass')?1.4:.7});
    m.name=`architecture-${key}`;
    if(['hotel','hotelLight','hotelDark','cream','white','gray','terracotta','orange','brick'].includes(key)) {
      // Original small-scale stone mottling in world space. No photograph textures.
      m.onBeforeCompile=s=>{
        s.vertexShader='varying vec3 architecturalPosition;\n'+s.vertexShader;
        s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n architecturalPosition=(modelMatrix*vec4(position,1.0)).xyz;');
        s.fragmentShader='varying vec3 architecturalPosition;\n'+s.fragmentShader;
        s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec3 ap=architecturalPosition;
          float stoneGrain=fract(sin(dot(floor(ap*38.),vec3(12.9898,78.233,42.419)))*43758.5453);
          float stoneSoft=sin(ap.x*1.31+sin(ap.y*1.82))*sin(ap.z*.77+ap.y*1.34);
          float grainFade=1.-smoothstep(.012,.06,length(fwidth(ap)));
          diffuseColor.rgb*=.98+.025*stoneSoft+(stoneGrain-.5)*.085*grainFade;`);
      };
      m.customProgramCacheKey=()=> 'architectural-stone-v1';
    }
    materials[key as MatName]=m;
  }
  // Each building is merged by material, preserving useful block-sized culling.
  let active:Transform={x:0,z:0,y:0,angle:0,name:'none'};
  let bucket=new Map<MatName,THREE.BufferGeometry[]>();
  const unit=new THREE.Vector3(1,1,1),matrix=new THREE.Matrix4(),temp=new THREE.Object3D();
  function begin(name:string,x:number,z:number,angle=0,y=groundAt(x,z)) {
    finish(); active={name,x,z,y,angle};bucket=new Map();
  }
  function add(geo:THREE.BufferGeometry,mat:MatName,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
    temp.position.set(x,y,z);temp.rotation.set(rx,ry,rz);temp.scale.copy(unit);temp.updateMatrix();
    geo.applyMatrix4(temp.matrix);
    if(!geo.index)geo.setIndex(Array.from({length:geo.attributes.position.count},(_,i)=>i));
    let list=bucket.get(mat);if(!list){list=[];bucket.set(mat,list);}list.push(geo);
  }
  function box(mat:MatName,x:number,y:number,z:number,w:number,h:number,d:number,rz=0,cut=true) {
    if(cut && active.name==='Westin St. Francis historic Powell facade' && rz===0){
      const cutTop=groundAt(-85,32)+4.8-active.y;
      const lo=[Math.max(x-w/2,-44.03),Math.max(y-h/2,groundAt(-85,32)-3.95-active.y),Math.max(z-d/2,-22.05)];
      const hi=[Math.min(x+w/2,-19.97),Math.min(y+h/2,cutTop),Math.min(z+d/2,.56)];
      if(lo.every((v,i)=>v<hi[i])){
        const a=[x-w/2,y-h/2,z-d/2],b=[x+w/2,y+h/2,z+d/2];
        const piece=(aa:number[],bb:number[])=>{if(aa.every((v,i)=>v<bb[i]))box(mat,(aa[0]+bb[0])/2,(aa[1]+bb[1])/2,(aa[2]+bb[2])/2,bb[0]-aa[0],bb[1]-aa[1],bb[2]-aa[2],0,false);};
        piece(a,[lo[0],b[1],b[2]]);piece([hi[0],a[1],a[2]],b);
        piece([lo[0],a[1],a[2]],[hi[0],lo[1],b[2]]);piece([lo[0],hi[1],a[2]],[hi[0],b[1],b[2]]);
        piece([lo[0],lo[1],a[2]],[hi[0],hi[1],lo[2]]);piece([lo[0],lo[1],hi[2]],[hi[0],hi[1],b[2]]);return;
      }
    }
    temp.position.set(x,y,z);temp.rotation.set(0,0,rz);temp.scale.set(w,h,d);temp.updateMatrix();
    const geo=boxBase.clone().applyMatrix4(temp.matrix);
    let list=bucket.get(mat);if(!list){list=[];bucket.set(mat,list);}list.push(geo);
  }
  function cyl(mat:MatName,x:number,y:number,z:number,r:number,h:number,segments=12,rt=r) {
    add(new THREE.CylinderGeometry(rt,r,h,segments),mat,x,y,z);
  }
  function finish(){
    if(!bucket.size)return;
    const building=new THREE.Group();building.name=active.name;building.position.set(active.x,active.y,active.z);building.rotation.y=active.angle;
    for(const [key,geos] of bucket){
      const geo=mergeGeometries(geos,false);if(!geo)throw new Error(`Architecture merge failed: ${active.name}/${key}`);
      geos.forEach(g=>g.dispose());geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,materials[key]);mesh.name=`${active.name}: ${key}`;mesh.castShadow=!key.startsWith('glass');mesh.receiveShadow=true;building.add(mesh);
    }
    group.add(building);bucket.clear();
  }
  function collider(u:number,d:number,w:number,depth:number){
    const ca=Math.cos(active.angle),sa=Math.sin(active.angle);
    const x=active.x+u*ca+d*sa,z=active.z-u*sa+d*ca;
    const halfX=(Math.abs(ca)*w+Math.abs(sa)*depth)/2,halfZ=(Math.abs(sa)*w+Math.abs(ca)*depth)/2;
    const full={minX:x-halfX,maxX:x+halfX,minZ:z-halfZ,maxZ:z+halfZ};
    if(active.name==='Westin St. Francis historic Powell facade'){
      const minX=Math.max(full.minX,-107.05),maxX=Math.min(full.maxX,-84.44),minZ=Math.max(full.minZ,19.97),maxZ=Math.min(full.maxZ,44.03);
      if(minX<maxX&&minZ<maxZ){
        const pieces=[{...full,maxX:minX},{...full,minX:maxX},{minX,maxX,minZ:full.minZ,maxZ:minZ},{minX,maxX,minZ:maxZ,maxZ:full.maxZ}];
        pieces.forEach(p=>{if(p.minX<p.maxX&&p.minZ<p.maxZ)colliders.push(p);});
        colliders.push({minX,maxX,minZ,maxZ,minY:groundAt(-85,32)+4.8});return;
      }
    }
    colliders.push(full);
  }
  function shell(w:number,h:number,d:number,mat:MatName='cream',u=0,front=0){
    box(mat,u,h/2,front-d/2-1.15,w,h,d-2.3);
    box('roof',u,h+.1,front-d/2,w-.5,.3,d-.5);collider(u,front-d/2,w,d);
  }
  function ledge(w:number,y:number,front=0,mat:MatName='cream',u=0,depth=.75){
    box(mat,u,y,front+.08,w+.5,.20,depth);
    box(mat,u,y+.15,front+.18,w+.8,.12,depth+.26);
  }
  function cornice(w:number,y:number,front=0,mat:MatName='cream',u=0,ornate=false){
    ledge(w,y-.7,front,mat,u,1.05);box(mat,u,y-.28,front+.1,w+.9,.56,.9);
    box(mat,u,y+.05,front+.3,w+1.35,.22,1.4);box(mat,u,y+.26,front+.38,w+1.65,.17,1.65);
    if(ornate)for(let x=u-w/2+.6;x<u+w/2;x+=.85)box(mat,x,y-.54,front+.52,.26,.46,.55);
  }
  function window(x:number,y:number,w:number,h:number,front=0,trim:MatName='cream',seed=0,decorated=false){
    const glass:MatName=(seed%11<2?'glassC':seed%3===0?'glassB':'glassA');
    box('interior',x,y,front-.39,w+.1,h+.1,.14);
    box(glass,x,y,front-.25,w-.14,h-.13,.07);
    if(seed%7===1||seed%7===2){box('curtain',x-w*.31,y,front-.15,w*.24,h-.23,.018);box('curtain',x+w*.31,y,front-.15,w*.24,h-.23,.018);}
    if(seed%13===4)box('curtain',x,y+h*.3,front-.14,w-.2,h*.29,.025);
    box(trim,x-w/2-.09,y,front+.01,.18,h+.36,.40);box(trim,x+w/2+.09,y,front+.01,.18,h+.36,.40);
    box(trim,x,y+h/2+.1,front+.02,w+.4,.2,.46);box(trim,x,y-h/2-.13,front+.18,w+.54,.2,.68);
    box('charcoal',x,y,front-.13,.075,h-.10,.12);box('charcoal',x,y+h*.16,front-.13,w-.1,.07,.12);
    if(decorated){box(trim,x,y+h/2+.35,front+.12,w+.68,.14,.56);box(trim,x,y+h/2+.65,front+.02,.36,.5,.5);}
  }
  function facadeGrid(w:number,h:number,cols:number,rows:number,mat:MatName='cream',front=0,u=0,start=6.8,floorH=3.75,windowWidth=1.6,windowHeight=2.4){
    // Solid piers and spandrels stand forward of recessed glazing.
    const step=w/cols;
    for(let c=0;c<=cols;c++)box(mat,u-w/2+c*step,h/2,front-.18,Math.max(.4,step-windowWidth-.38),h,.65);
    box(mat,u,start/2,front-.95,w,start,.65);
    for(let r=0;r<rows;r++){
      const yy=start+r*floorH+floorH/2;
      box(mat,u,yy+floorH/2,front-.12,w,Math.max(.4,floorH-windowHeight-.12),.7);
      for(let c=0;c<cols;c++)window(u-w/2+(c+.5)*step,yy,windowWidth,windowHeight,front,mat,r*31+c*3,r===rows-2);
    }
    box(mat,u,(start+rows*floorH+h)/2,front-.1,w,Math.max(.1,h-start-rows*floorH),.8);
  }
  function sideGrid(w:number,h:number,d:number,cols:number,rows:number,mat:MatName='cream',u=0,front=0,start=7.0,floorH=3.75){
    // Side windows and corner courses remain visible from intersections/courts.
    for(const sign of [-1,1]){
      box(mat,u+sign*(w/2-.16),h/2,front-d/2,.4,h,d);
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const zz=front-2.5-(d-4)/cols*(c+.5),yy=start+(r+.5)*floorH;
        box((c+r)%4===0?'glassB':'glassA',u+sign*(w/2+.045),yy,zz,.06,2.3,1.6);
        box(mat,u+sign*(w/2+.15),yy-1.29,zz,.43,.19,2.0);
        box('charcoal',u+sign*(w/2+.09),yy,zz,.11,2.3,.07);
      }
      for(let y=7;y<h;y+=floorH)box(mat,u+sign*(w/2+.07),y,front-d/2,.3,.1,d);
    }
    for(let r=0;r<rows;r++)for(let c=0;c<Math.floor(w/4);c++)box('glassA',u-w/2+2+c*4,start+(r+.5)*floorH,front-d-.03,1.5,2.3,.06);
  }
  function stoneCourses(w:number,h:number,front=0,u=0,mat:MatName='hotelLight'){
    for(let y=.45;y<h;y+=.43)box(mat,u,y,front+.015,w,.025,.08);
    for(let y=.5;y<h;y+=.86)for(let x=u-w/2+.9+((Math.round(y/.86)%2)*.8);x<u+w/2;x+=1.75)box('hotelDark',x,y+.19,front+.056,.018,.40,.012);
  }
  function archShape(width:number,height:number){
    const s=new THREE.Shape();const r=width/2,stem=height-r;
    s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,stem);s.absarc(0,stem,r,0,Math.PI,false);s.lineTo(-r,0);return s;
  }
  function arch(x:number,y:number,width:number,height:number,front=0,awning=false){
    const shape=archShape(width+.56,height+.26);const path=new THREE.Path();const r=width/2,stem=height-r;
    path.moveTo(-r,0);path.lineTo(-r,stem);path.absarc(0,stem,r,Math.PI,0,true);path.lineTo(r,0);path.lineTo(-r,0);shape.holes.push(path);
    add(new THREE.ExtrudeGeometry(shape,{depth:.48,bevelEnabled:false,curveSegments:14}),'hotelLight',x,y,front-.05);
    add(new THREE.ShapeGeometry(archShape(width,height),14),'glassA',x,y,front+.12);
    box('bronze',x,y+1.23,front+.04,.09,2.46,.16);box('bronze',x,y+1.75,front+.04,width,.07,.16);
    if(awning){
      // Segmented curved maroon canopy follows the arch top.
      const g=new THREE.SphereGeometry(width*.52,14,6,0,Math.PI,0,Math.PI/2);g.scale(1,.84,.78);
      add(g,'red',x,y+height-width*.49,front+.1,0,0,0);
      box('red',x,y+height-width*.49-.14,front+.45,width+.13,.28,.79);
    }
    box('hotelLight',x,y+height+.16,front+.3,.38,.55,.65);
  }
  function sign(text:string,x:number,y:number,z:number,w:number,h:number,color='#deddd4',bg='transparent',serif=false,weight='500'){
    // Only original system-font signage; no facade/reference images in runtime.
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(128,Math.round(1024*h/w));
    const ctx=canvas.getContext('2d')!;if(bg!=='transparent'){ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);}
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
    const family=serif?'Georgia, serif':'Arial, sans-serif';let fs=canvas.height*.73;ctx.font=`${weight} ${fs}px ${family}`;
    while(ctx.measureText(text).width>canvas.width*.94){fs*=.96;ctx.font=`${weight} ${fs}px ${family}`;}
    ctx.fillText(text,canvas.width/2,canvas.height*.53);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
    const m=new THREE.MeshStandardMaterial({map:tex,transparent:true,alphaTest:.1,roughness:.83,side:THREE.DoubleSide,depthWrite:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);mesh.name=`Original text: ${text}`;
    const ca=Math.cos(active.angle),sa=Math.sin(active.angle);mesh.position.set(active.x+x*ca+z*sa,active.y+y,active.z-x*sa+z*ca);mesh.rotation.y=active.angle;group.add(mesh);
  }
  function roofPlant(w:number,d:number,h:number,u=0,front=0){
    for(let i=0;i<Math.max(2,Math.floor(w/14));i++){
      const x=u-w*.27+i*8.5,z=front-d*.62;
      box('gray',x,h+1.1,z,4.3,1.9,3.1);box('metal',x,h+2.08,z,4.6,.16,3.35);
      for(let n=0;n<6;n++)box('charcoal',x-1.8+n*.72,h+1.2,z+1.61,.12,1.15,.06);
      cyl('metal',x+.7,h+2.4,z-.7,.45,.75,10);
    }
    box('gray',u+w*.23,h+1.9,front-d*.76,w*.22,3.8,d*.2);
  }
  function shopfront(w:number,front=0,y=0,u=0,mat:MatName='cream',step=4.5){
    const count=Math.floor(w/step),s=w/count;
    for(let i=0;i<count;i++){
      const x=u-w/2+s*(i+.5);
      box('interior',x,y+2.15,front-.25,s-.32,4.25,.13);
      box(i%3===0?'glassB':'glassA',x,y+2.1,front-.12,s-.42,3.98,.06);
      box(mat,x-s/2,y+2.5,front+.04,.32,5,.65);box('metal',x,y+2.1,front,.06,4,.11);
      box('metal',x,y+3.15,front,s-.4,.06,.11);box('metal',x,y+.1,front+.04,s-.32,.18,.22);
      if(i%4===1){box('warm',x-.62,y+1.15,front+.01,.5,1.55,.03);box('warm',x+.64,y+1.0,front+.01,.45,1.25,.03);}
    }
    box(mat,u,y+4.85,front+.04,w,.9,.7);
  }

  // POWELL / WEST: the Beaux-Arts St. Francis, three projecting wings and two slots.
  begin('Westin St. Francis historic Powell facade',-85,0,Math.PI/2);
  const hotelW=88,hotelH=53.4,hotelD=40;
  shell(hotelW,hotelH,hotelD,'hotel',0,-13);
  // Common rusticated arcade at street level.
  box('hotel',0,3.4,-.43,hotelW,6.8,1.0);stoneCourses(hotelW,6.8,-.03);
  for(let x=-41.8;x<43;x+=3.8)if(x < -44.1 || x > -19.9)arch(x,.28,2.55,4.95,.06,true);
  ledge(hotelW,6.55,.05,'hotelLight',0,1.15);cornice(hotelW,8.0,.0,'hotelLight',0,true);
  for(let x=-43.5;x<44;x+=.72){cyl('hotelLight',x,7.22,.72,.08,1.0,7,.065);box('hotelLight',x,7.69,.72,.20,.14,.20);}box('hotelLight',0,7.78,.74,88.2,.15,.49);
  for(const [u,w,columns] of [[-34.25,19.5,5],[-5.75,20.5,5],[29.1,29.8,7]] as number[][]){
    const d=38;box('hotel',u,(hotelH+8)/2,-d/2,w,hotelH-8,d-1.9);
    facadeGrid(w,hotelH,columns,11,'hotel',0,u,8.6,3.83,1.44,2.34);
    sideGrid(w,hotelH,d,8,11,'hotel',u,0,8.6,3.83);
    // Joint courses terminate at the window openings, producing stone scale at street level.
    const bay=w/columns;
    for(let c=0;c<=columns;c++)for(let y=9;y<47;y+=.52){
      box('hotelDark',u-w/2+c*bay,y,.147,Math.max(.35,bay-1.90),.017,.028);
    }
    for(let r=0;r<10;r++){
      const y=8.6+(r+1)*3.83;
      box('hotelLight',u,y-.32,.235,w,.065,.07);
      if(r===3||r===6||r===8)for(let c=0;c<columns;c++){
        const x=u-w/2+(c+.5)*bay;
        const pediment=new THREE.Shape();pediment.moveTo(-1.15,0);pediment.lineTo(0,.46);pediment.lineTo(1.15,0);pediment.closePath();
        add(new THREE.ExtrudeGeometry(pediment,{depth:.25,bevelEnabled:false}),'hotelLight',x,y-.67,.14);
        box('hotelDark',x,y-.73,.28,1.78,.045,.12);
      }
    }
    // Rusticated corner quoins, fine shadow grooves on projecting vertical edges.
    for(const sx of [-1,1])for(let y=8.6;y<47;y+=.46)box('hotelLight',u+sx*(w/2-.55),y,.23,1.1,.1,.2);
    for(const y of [12.1,38.9,46.4])ledge(w,y,0,'hotelLight',u,.74);
    // Projecting ninth-floor balcony with corbels and metal rail.
    box('hotelLight',u,39.17,.82,w+.25,.25,2.1);
    for(let x=u-w/2+.5;x<u+w/2;x+=1.25){box('hotelLight',x,38.62,.60,.38,.78,1.16);box('bronze',x,39.87,1.72,.038,1.04,.045);}
    box('bronze',u,40.4,1.72,w,.06,.06);box('bronze',u,39.65,1.72,w,.05,.05);
    // Upper frieze rosettes and green copper roof cornice.
    for(let c=0;c<columns;c++){
      const xx=u-w/2+(c+.5)*w/columns;
      box('hotelLight',xx,51.07,.1,2.12,2.86,.26);
      window(xx,51.05,1.15,1.74,.35,'hotelLight',c);
      if(c<columns-1){
        const gx=xx+w/columns*.5;add(new THREE.TorusGeometry(.43,.095,5,14),'hotelLight',gx,51.1,.34);
        box('hotelLight',gx,51.1,.16,1.25,1.5,.22);
      }
    }
    cornice(w,53.4,0,'copper',u,true);
    box('copper',u,53.9,-d/2,w+1.0,.33,d+.8);
    for(let x=u-w/2+.3;x<u+w/2;x+=2.5){add(new THREE.SphereGeometry(.18,8,5),'copper',x,54.38,.25);box('copper',x,54.03,.2,.46,.3,.53);}
    collider(u,-d/2,w,d);
  }
  // Deep slot walls are visibly behind the projecting wings.
  facadeGrid(9.7,52.8,3,11,'hotelDark',-12.65,-19.6,8.6,3.83,1.35,2.25);
  facadeGrid(9.6,52.8,3,11,'hotelDark',-12.65,9.45,8.6,3.83,1.35,2.25);
  cornice(9.7,52.9,-12.7,'copper',-19.6,true);cornice(9.6,52.9,-12.7,'copper',9.45,true);
  // Entrance canopy, doors, lamps and hotel identity.
  box('bronze',-19.7,3.2,1.6,8.7,.24,3.6);box('glassC',-19.7,3.4,1.6,8.2,.12,3.1);
  for(const xx of [-23.5,-15.9])cyl('bronze',xx,1.65,2.85,.085,3.3);
  // Glazed revolving-door drum and its radial leaves, beneath the entrance canopy.
  add(new THREE.CylinderGeometry(1.1,1.1,2.72,24,1,true,0,Math.PI*2),'glassB',-19.7,1.40,.48);
  for(const y of [.09,2.76])add(new THREE.TorusGeometry(1.12,.055,6,24),'bronze',-19.7,y,.48,Math.PI/2);
  cyl('bronze',-19.7,1.4,.48,.046,2.8);
  for(const dx of [-1.08,1.08])box('bronze',-19.7+dx,1.4,.48,.056,2.72,.056);
  box('bronze',-19.7,1.4,.48,2.15,.048,.07);box('bronze',-19.7,1.4,.48,.07,.048,2.15);
  box('glassC',-19.7,1.42,.48,2.06,2.54,.025);box('glassC',-19.7,1.42,.48,.025,2.54,2.06);
  sign('THE WESTIN ST. FRANCIS',-19.7,5.8,.69,11.8,.55,'#d7ccaa','transparent',true);
  for(const x of [-42,-30,-10,10,29,43]){
    cyl('bronze',x,4.1,1.1,.08,2.8);for(const dx of [-.3,0,.3])add(new THREE.SphereGeometry(.17,10,7),'warm',x+dx,5.42+Math.abs(dx)*.5,1.1);
  }
  for(const xx of [-34,-6,29]){
    cyl('metal',xx,62,-6,.047,15);
    box('cream',xx,53.9,-6,1.1,.35,1.1);
    for(let row=0;row<13;row++){
      const yy=66.9-row*.135;
      box(row%2===0?'red':'white',xx+1.45,yy,-5.98,2.8,.13,.022);
    }
    box('glassA',xx+.66,66.46,-5.95,1.25,.98,.018);
    for(let row=0;row<4;row++)for(let col=0;col<5;col++)box('white',xx+.18+col*.23,66.12+row*.21,-5.935,.046,.046,.014);
  }
  roofPlant(84,36,54);

  // The 1972 tower is set behind the older wings, never substitutes for them.
  begin('St. Francis modern tower behind historic hotel',-122,0,Math.PI/2);
  shell(79,99,26,'gray');
  for(let c=0;c<19;c++){
    const x=-37+c*4.12;
    box('glassA',x,52,-.55,2.3,90,.11);
    box('cream',x-1.7,51.7,.16,.76,96,.85);
    for(let r=0;r<29;r++)box('gray',x,8+r*3.08,-.10,3.35,.26,.26);
  }
  for(let y=8;y<97;y+=3.08)for(const sx of [-1,1])box('glassB',sx*39.6,y,-13,.09,2.2,21);
  box('cream',0,100.5,-12,81,4.8,27);
  for(const x of [-31,-10,11,32]){box('cream',x,102.3,-10,16,7.6,24);box('hotelLight',x,98.5,1.0,14,.65,2.7);for(let dx=-7;dx<8;dx+=2.8)box('hotelLight',x+dx,102.3,2.1,.30,7.6,.7);}
  for(let x=-39;x<40;x+=3.3)box('hotelLight',x,101,-.05,.48,6.3,.72);
  roofPlant(70,24,104);

  // NORTH / POST: separate frontage identities and heights preserve the skyline.
  begin('Post Powell corner historic retail',-56,-64);
  shell(20,19,29,'hotelLight');facadeGrid(20,19,6,3,'hotelLight',0,0,5,3.8,1.9,2.35);
  shopfront(20);cornice(20,19,0,'hotelDark',0,true);ledge(20,5.2);sideGrid(20,19,29,7,3,'hotelLight',0,0,5,3.8);roofPlant(20,28,19);

  begin('Saks Fifth Avenue 384 Post',-31.5,-64);
  shell(29,31.4,36,'white');
  // Large thin piers, shallow blind inset panels and upper black windows.
  shopfront(29,0,0,0,'white',4.8);
  for(let c=0;c<7;c++){
    const x=-12.4+c*4.13;
    box('cream',x,15.4,-.02,3.30,19.7,.5);
    box('white',x-1.99,17.0,.15,.65,24.0,1.0);
    for(let r=0;r<4;r++)box('white',x,8.1+r*4.25,.31,3.8,.28,.8);
    window(x,27.6,2.3,2.95,.06,'white',c+1);
  }
  ledge(29,25.6,.1,'white');cornice(29,31.2,0,'white');
  sign('SAKS FIFTH AVENUE',0,31.92,1.48,26.5,1.3,'#242825','transparent',true);
  sign('SAKS FIFTH AVENUE',0,5.2,.67,12.5,.54,'#383a34','transparent',true);
  sideGrid(29,31,36,8,6,'white',0,0,6.2,3.8);roofPlant(28,34,31.4);

  begin('Tiffany & Co. 350 Post stone grid',-4.6,-64);
  shell(24.8,43,34,'cream');
  const tw=24.8,tc=6,tf=3.85;
  shopfront(tw,0,0,0,'cream',4.13);
  for(let c=0;c<=tc;c++)box('cream',-tw/2+c*tw/tc,24,.09,.73,37.8,.85);
  for(let r=0;r<9;r++){
    const yy=7.2+r*tf;
    box('cream',0,yy-1.8,.10,tw,.55,.8);
    for(let c=0;c<tc;c++){
      const xx=-tw/2+(c+.5)*tw/tc;
      box((c+r)%4===0?'glassB':'glassA',xx,yy,-.11,3.30,3.24,.1);
      box('metal',xx,yy,-.03,.045,3.2,.08);
    }
  }
  box('cream',0,41.7,0,tw,2.8,1.1);sign('TIFFANY & CO.',0,42.2,.58,15.8,.85,'#31332f','transparent',true);
  for(let c=0;c<6;c++)box('paleGreen',-10.33+c*4.13,3.12,.02,3.27,4.7,.10);
  sign('TIFFANY & CO.',0,5.0,.6,10.5,.55,'#f3eee3','transparent',true);
  sideGrid(24.8,43,34,7,9,'cream',0,0,5.7,3.85);roofPlant(24,32,43);

  begin('Williams Sonoma ornate white 340 Post',14.9,-64);
  shell(14.2,17.3,32,'white');shopfront(14.2,0,0,0,'white',4.7);
  for(let x=-4.7;x<6;x+=4.7){
    arch(x,11,2.8,4.3,.0,false);window(x,8.0,2.7,3.3,.08,'white',Math.round(x+20));
    box('white',x,5.6,.31,3.7,.42,1.1);
  }
  for(let x=-6.85;x<7;x+=4.7)box('white',x,10.7,.17,.38,10.7,.85);
  cornice(14.2,16.8,.0,'white',0,true);sign('WILLIAMS SONOMA',0,5.4,.9,12.5,.54,'#37392f','transparent',true);
  box('green',8.0,9,-15,1,17.5,30);roofPlant(13,30,17.5);

  // Apple exterior envelope retained from initial-one-shot; new public interior,
  // openings, all floor surfaces and bounded collisions live in experience/apple.ts.
  begin('Apple Union Square 300 Post glass pavilion',44.1,-64);
  box('metal',0,13.15,-14.6,43.2,.65,30.8);box('gray',0,12.6,-15,42.2,.30,30);
  box('metal',-21,6.5,-14.8,.75,13,30);box('metal',21,6.5,-14.8,.75,13,30);
  box('metal',0,12.85,0,43.2,.85,1.1);box('metal',-20.9,6.4,0,.9,12.8,1.1);box('metal',20.9,6.4,0,.9,12.8,1.1);
  // The familiar bitten-apple silhouette drawn originally as curves.
  const logo=new THREE.Shape();logo.moveTo(0,-.88);logo.bezierCurveTo(-.2,-1.12,-.39,-1.1,-.58,-.92);logo.bezierCurveTo(-1.08,-.4,-1.13,.41,-.71,.69);logo.bezierCurveTo(-.4,.95,-.12,.67,.08,.7);logo.bezierCurveTo(.33,.75,.69,1.0,.93,.59);logo.bezierCurveTo(.40,.31,.39,-.20,.93,-.43);logo.bezierCurveTo(.71,-.94,.39,-1.12,.19,-.94);logo.bezierCurveTo(.13,-.9,.06,-.85,0,-.88);
  add(new THREE.ShapeGeometry(logo,16),'white',0,9.55,-5.9);
  const leaf=new THREE.Shape();leaf.moveTo(.08,.85);leaf.quadraticCurveTo(.04,1.45,.63,1.55);leaf.quadraticCurveTo(.66,1.01,.08,.85);add(new THREE.ShapeGeometry(leaf),'white',0,9.55,-5.9);
  // Roof panel seams are geometric to remain readable from the saved overview.
  for(let x=-20;x<22;x+=3.5)box('charcoal',x,13.51,-14.6,.025,.014,29.7);
  for(let z=-29;z<1;z+=3.0)box('charcoal',0,13.51,z,42,.015,.025);

  begin('Grand Hyatt 345 Stockton behind Apple',47,-107);
  shell(43,111,36,'cream');
  for(let c=0;c<8;c++){
    const xx=-17.1+c*4.9;
    box('glassA',xx,62,-.36,3.9,95,.12);
    box('cream',xx-2.18,62,.06,.61,99,.9);
    for(let r=0;r<30;r++)box('cream',xx,15+r*3.12,.09,4.5,.45,.5);
  }
  for(const sx of [-1,1]){
    box('cream',sx*21.45,58,-18,.50,106,36);
    for(let r=0;r<30;r++)for(let c=0;c<5;c++)box('glassB',sx*21.72,16+r*3.13,-5.3-c*5.9,.08,2.36,4.0);
  }
  box('cream',0,112,-17.5,44,3,36);roofPlant(42,34,113.5);
  sign('GRAND HYATT',0,110.9,.60,18,1.03,'#6b6557');

  // SOUTH / GEARY: Macy's pale department-store block and six-storey glazed addition.
  // Local facade +X runs west, so u-positive is the Powell half.
  begin("Macy's Union Square Geary facade",0,64,Math.PI);
  shell(130,35.7,54,'cream');
  // High eastern limestone volume (left when viewing south from the plaza).
  const eastU=-42.5,eastW=45;
  box('cream',eastU,23,-28,eastW,46,54);
  facadeGrid(eastW,44.2,10,8,'cream',.02,eastU,5.9,4.15,2.12,2.28);
  sideGrid(eastW,44.2,54,12,8,'cream',eastU,.02,5.9,4.15);
  shopfront(eastW,.08,0,eastU,'cream',4.5);
  box('cream',eastU,43.9,.09,eastW,5.1,1.0);
  sign("macy’s",eastU+1.0,44.0,.69,21,4.4,'#373936');
  sign('★',eastU-9.3,44.3,.72,2.4,2.8,'#ab2631');
  cornice(eastW,46,.02,'cream',eastU);
  for(let y=1;y<45;y+=1.08)for(let x=eastU-eastW/2+.2;x<eastU+eastW/2;x+=3.0){const xx=x+(Math.round(y/1.08)%2)*1.5;box('gray',xx,y,.055,.015,1.06,.016);}
  // Curtain-wall atrium projects in three subtle bays; solid piers connect old and new.
  const glazedU=19.6,glazedW=79.2;
  box('gray',glazedU,17.4,-.40,glazedW,34.7,.52);
  for(let r=0;r<6;r++){
    const yy=6.35+r*4.65;
    for(let c=0;c<16;c++){
      const xx=glazedU-glazedW/2+(c+.5)*glazedW/16;
      const zz=(c>=5&&c<=10)?.69:.1;
      box((r+c)%4===0?'glassFacadeB':'glassFacadeA',xx,yy,zz,4.72,4.13,.10);
      box('metal',xx-2.45,yy,zz+.12,.14,4.55,.25);box('metal',xx,yy+2.12,zz+.09,4.94,.36,.27);
      box('metal',xx,yy,zz+.14,.065,4.1,.18);box('metal',xx,yy-.36,zz+.16,4.68,.055,.11);
      // Behind-glass display shapes are restrained and vary by floor.
      if(r<3&&(c+r)%3===1){box('curtain',xx+.85,yy-.71,zz+.066,.78,1.83,.05);box('warm',xx-1.05,yy-1.10,zz+.066,.8,.65,.05);}
    }
    box('gray',glazedU,yy+2.41,.13,glazedW,.38,.8);
  }
  for(const xx of [-22,-16,8,32,58,64])box('gray',xx,17.3,.42,1.0,34.6,1.4);
  // Roof restaurant terrace with rail and shallow overhang.
  box('gray',glazedU,34.18,1.7,glazedW+1.0,.40,4.1);
  box('metal',glazedU,35.45,3.60,glazedW,.06,.08);
  for(let x=glazedU-glazedW/2+.3;x<glazedU+glazedW/2;x+=1.25)box('metal',x,34.91,3.60,.055,1.10,.06);
  box('gray',glazedU,37.2,-.35,glazedW+1,.42,6.7);
  for(let x=glazedU-glazedW/2+2;x<glazedU+glazedW/2;x+=5.9)box('metal',x,35.6,-1.1,.13,2.9,.13);
  sign("macy’s",21.8,36.4,3.73,23.2,4.15,'#d2d4d0');
  sign('The Cheesecake Factory',-19.0,26.9,1.18,6.8,1.03,'#d1d0c8','transparent',true);
  sign("macy’s",20,3.9,1.08,10,1.05,'#d9d8cf');
  shopfront(84,1.0,0,23,'gray',4.5);
  sign('LOUIS VUITTON',-46.5,4.83,.65,13,.61,'#dfd9c7','#272825');
  sideGrid(130,35,54,12,7,'cream',0,0,5.8,4.15);roofPlant(124,52,37.6);roofPlant(40,45,46,-42);
  for(const xx of [1,16,32]){cyl('metal',xx,42.7,-1.2,.045,11.2);box('gray',xx,37.3,-1.2,.5,.3,.5);}

  // EAST / STOCKTON. Historic masses verified against SF Planning's street photographs.
  // Black fire escapes create the characteristic west-face silhouettes and parallax.
  function fireEscape(x:number,floors:number,start=8,floorHeight=3.65,front=.65){
    for(let r=0;r<floors;r++){
      const y=start+r*floorHeight;
      box('charcoal',x,y,front+.55,3.3,.10,1.3);
      for(let dx=-1.5;dx<1.6;dx+=.29)box('charcoal',x+dx,y+.53,front+1.18,.035,1.0,.04);
      box('charcoal',x,y+1.04,front+1.18,3.32,.055,.055);
      for(const sx of [-1,1]){
        box('charcoal',x+sx*1.64,y+.55,front+.55,.04,1.1,1.3);
        box('charcoal',x+sx*1.64,y+1.08,front+.55,.055,.055,1.3);
        box('charcoal',x+sx*1.18,y-.45,front+.44,.05,1.0,.055,sx*.47);
      }
      if(r<floors-1){
        const diagonalLength=Math.hypot(2.3,floorHeight),angle=-Math.atan2(2.3,floorHeight);
        for(const dz of [0,.48])box('charcoal',x,y+floorHeight/2,front+.59+dz,.055,diagonalLength,.05,angle);
        for(let k=0;k<12;k++)box('charcoal',x-1.15+k*2.3/11,y+k*floorHeight/11,front+.83,.12,.055,.61);
      }
    }
    box('charcoal',x,4.5,front+.40,.05,5.0,.06);
    for(let y=2.3;y<7;y+=.33)box('charcoal',x,y,front+.4,.72,.035,.04);
    for(const dx of [-.36,.36])box('charcoal',x+dx,4.5,front+.4,.04,5,.04);
  }
  begin('275–299 Post 1909 warm stone corner',85,-37,-Math.PI/2);
  shell(14,26.8,39,'orange');facadeGrid(14,26.8,4,5,'orange',0,0,6.5,3.85,1.72,2.55);
  shopfront(14,0,0,0,'charcoal',3.5);cornice(14,26.8,0,'charcoal',0,true);
  for(const y of [6.1,10.3,14.15,18,21.85])ledge(14,y,.03,'orange',0,.55);
  sideGrid(14,26.8,39,9,5,'orange',0,0,6.5,3.85);roofPlant(13,37,27);
  fireEscape(0,5,6.85,3.85);

  begin('250–260 Stockton 1908 narrow gray stone',85,-25,-Math.PI/2);
  shell(10,25.7,38,'gray');facadeGrid(10,25.7,3,5,'gray',0,0,6,3.82,1.89,2.58);
  shopfront(10,0,0,0,'charcoal',3.33);cornice(10,25.7,0,'gray',0,true);
  for(const x of [-4.7,4.7])box('gray',x,15,.25,.45,21,.65);
  fireEscape(.0,5,6.40,3.82,.54);roofPlant(9,36,25.9);

  begin('234–240 Stockton cream and green tall frontage',85,-12,-Math.PI/2);
  shell(16,42.2,38,'cream');facadeGrid(16,41,4,9,'cream',0,0,6.7,3.81,1.88,2.50);
  shopfront(16,0,0,0,'cream',4);
  // Green enamel lintels, belt courses, and roof frieze distinguish this taller third bay.
  for(let r=0;r<9;r++)for(let c=0;c<4;c++){
    const xx=-6+c*4,yy=6.7+(r+.5)*3.81;
    box('copper',xx,yy+1.48,.27,2.50,.20,.57);
    box('copper',xx,yy-1.37,.27,2.42,.14,.56);
    if(r>1)for(const dx of [-1.16,1.16])box('copper',xx+dx,yy,.14,.12,2.75,.32);
  }
  for(const yy of [6,14.55,37.6])cornice(16,yy,.04,'copper');
  cornice(16,42.1,.02,'cream',0,true);sideGrid(16,42,38,8,9,'cream',0,0,6.7,3.81);
  roofPlant(15,36,42.3);
  // Dated rooftop billboard evidence is not used to invent a contemporary advertisement.

  begin('218–222 Stockton 1908 red brick lane corner',85,10,-Math.PI/2);
  shell(12,19.2,39,'brick');facadeGrid(12,18.9,3,3,'brick',0,0,6.8,3.73,1.55,2.86);
  shopfront(12,0,0,0,'charcoal',4);
  for(let r=0;r<3;r++)for(let c=0;c<3;c++){
    const xx=-4+c*4,yy=6.8+(r+.5)*3.73;
    window(xx,yy,1.55,2.84,.10,'cream',r*4+c);
    for(const dx of [-.48,.48])box('cream',xx+dx,yy,.0,.055,2.8,.18);
    for(const dy of [-.65,.2,.95])box('cream',xx,yy+dy,.0,1.5,.05,.18);
  }
  ledge(12,6.2,.1,'gray');ledge(12,14.2,.1,'cream');cornice(12,19.2,.0,'cream',0,true);
  sideGrid(12,19,39,8,3,'brick',0,0,6.8,3.73);fireEscape(1.8,3,7.0,3.73,.4);roofPlant(11,36,19.4);

  // One Union Square: 1987 limestone grid and two-level retail, documented owner photo.
  begin('One Union Square former Bvlgari Stockton at Geary',85,30,-Math.PI/2);
  shell(28,32,41,'cream');
  shopfront(28,0,0,0,'cream',5.6);shopfront(28,0,5.5,0,'cream',5.6);
  facadeGrid(28,31.7,5,5,'cream',0,0,10.7,4.08,3.88,3.03);
  for(const x of [-8.4,-2.8,2.8,8.4])for(const dx of [-2.02,2.02])box('cream',x+dx,21.0,.42,.15,20.5,.55);
  for(const yy of [5.3,10.4,31.8,32.4]){
    box('cream',0,yy,.08,28.4,.34,.85);box('charcoal',0,yy+.19,.39,28.6,.13,.19);
  }
  box('cream',0,32.95,.0,19.7,.85,.8);box('charcoal',0,33.42,.25,20.0,.13,.5);
  box('bronze',0,33.43,.25,1.10,1.85,.65);add(new THREE.SphereGeometry(.55,12,8),'bronze',0,34.34,.13);
  // Summer 2025: Bvlgari has relocated to Grant Avenue; old lettering presence
  // is uncertain, so this retained architectural frontage has neutral glazing.
  sign('ONE UNION SQUARE',0,10.47,.61,13.5,.48,'#9a9586','transparent',true);
  sideGrid(28,32,41,8,5,'cream',0,0,10.7,4.08);roofPlant(27,39,33.3);

  begin('Tall terracotta tower behind One Union Square',115,27,-Math.PI/2);
  shell(25,70,27,'orange');facadeGrid(25,69.5,6,17,'orange',0,0,6,3.72,2.05,2.65);
  sideGrid(25,70,27,6,17,'orange',0,0,6,3.72);cornice(25,70,.0,'orange');roofPlant(24,25,70.2);

  // Maiden Lane has facing shopfronts deep enough to walk into and see a street, not a wall.
  for(const side of [-1,1]){
    begin(`Maiden Lane ${side<0?'north':'south'} retail return`,120,side*4,side<0?0:Math.PI);
    shell(50,side<0?23:30,23,'cream');facadeGrid(50,side<0?23:30,12,side<0?4:6,'cream',0,0,6,3.7,1.8,2.25);
    shopfront(50,0,0,0,'cream',4.15);cornice(50,side<0?23:30);roofPlant(47,21,side<0?23:30);
  }

  // Diagonal southeast: Neiman Marcus diamond cladding and rounded glazed corner.
  begin('Neiman Marcus 150 Stockton south of Geary',103,64,Math.PI);
  const nmShape=new THREE.Shape();nmShape.moveTo(-18,0);nmShape.lineTo(11,0);nmShape.absarc(11,7,7,-Math.PI/2,0,false);nmShape.lineTo(18,49);nmShape.lineTo(-18,49);nmShape.closePath();
  const nmCore=new THREE.ExtrudeGeometry(nmShape,{depth:28,bevelEnabled:false,curveSegments:24});nmCore.rotateX(-Math.PI/2);add(nmCore,'hotel');
  collider(0,-24.5,36,49);
  shopfront(28,0,0,-4,'hotelLight',4.65);
  box('hotelLight',-3.5,17.3,.04,29,20.9,.38);
  for(let r=0;r<6;r++)for(let c=0;c<9;c++){
    const x=-16.5+c*3,y=8.2+r*3.1;
    box('hotelDark',x,y,.35,1.8,1.8,.10,Math.PI/4);box('cream',x,y,.42,.88,.88,.08,Math.PI/4);
  }
  cornice(29,28,0,'hotelLight',-3.5);sign('NEIMAN MARCUS',-4,5.2,.65,22,1,'#e9e4d7','#47453f',true);
  // Quarter-cylinder glass, divided radially and by level with metal mullions.
  add(new THREE.CylinderGeometry(7.035,7.035,25.4,28,1,true,0,Math.PI/2),'glassB',11,14.9,-7);
  for(let y=3;y<28.1;y+=3.12)add(new THREE.TorusGeometry(7.09,.085,5,28,Math.PI/2),'metal',11,y,-7,Math.PI/2,0,0);
  for(let a=0;a<=Math.PI/2+.01;a+=Math.PI/20)box('metal',11+Math.sin(a)*7.12,15,-7+Math.cos(a)*7.12,.11,25.9,.11);
  box('roof',-3.5,28.13,-24.5,29,.20,49);roofPlant(27,45,28.2,-3.5);

  // North-west and deeper blocks: individually scaled massing and detailed windows.
  function background(name:string,x:number,z:number,w:number,d:number,h:number,mat:MatName='cream',angle=0){
    begin(name,x,z,angle);shell(w,h,d,mat);
    const rows=Math.max(3,Math.floor((h-7)/3.45)),cols=Math.max(3,Math.floor(w/3.5));
    facadeGrid(w,h,cols,rows,mat,0,0,6.3,(h-7)/rows,Math.min(1.85,w/cols*.51),2.05);
    sideGrid(w,h,d,Math.max(3,Math.floor(d/4.7)),rows,mat,0,0,6.3,(h-7)/rows);
    cornice(w,h,0,mat,0,h<48);shopfront(w,0,0,0,mat,4.5);roofPlant(w-1,d-1,h+.2);
  }
  background('Northwest Powell Post historic corner',-102,-64,32,36,33,'hotelLight');
  background('Northwest rear Powell mid-rise',-104,-107,35,31,52,'cream');
  background('Northwest stepped tower base',-46,-125,29,32,67,'cream');
  background('Northwest stepped tower crown',-46,-132,19,20,87,'cream');
  background('Post rear central office',-9,-135,33,32,76,'cream');
  background('Northeast Stockton hotel background',102,-91,32,42,65,'hotelLight',-Math.PI/2);
  background('Northeast O Farrell distant office',145,-103,36,47,83,'cream',-Math.PI/2);
  background('West Geary corner hotel',-102,64,35,43,30,'cream',Math.PI);
  background('West Geary rear midrise',-153,75,33,43,44,'terracotta',Math.PI);
  background('Southwest Powell commercial',-99,110,31,35,51,'cream',Math.PI/2);
  background('Southwest Powell tower',-111,160,35,39,72,'hotelLight',Math.PI/2);
  background('South midblock retail support',-18,136,72,45,38,'hotelLight',Math.PI);
  background('Southeast Stockton continuation',107,143,35,52,45,'cream',-Math.PI/2);
  background('East midblock light stone office',153,30,39,42,57,'cream',-Math.PI/2);
  background('Far west city continuation',-197,0,66,54,68,'cream',Math.PI/2);
  background('Far north west skyline',-112,-190,41,38,61,'hotelLight');
  background('Far north center skyline',-20,-198,45,44,92,'cream');
  background('Far north east skyline',113,-187,39,39,72,'gray');
  background('Far southeast skyline',166,141,38,45,67,'cream',Math.PI);
  background('Far south center skyline',15,215,66,42,70,'cream',Math.PI);
  // Low-detail, original city-support masses continue the actual street corridors.
  // They are not represented as surveyed reconstructions of the distant addresses.
  // All distant geometry is merged in four sectors/materials rather than per-window draw calls.
  function farBuilding(cx:number,cz:number,w:number,d:number,h:number,mat:MatName){
    const base=groundAt(cx,cz);
    box(mat,cx,base+(h-8)/2,cz,w,h+8,d);
    box('roof',cx,base+h+.12,cz,w+.2,.24,d+.2);
    for(const sx of [-1,1])box(mat,cx+sx*(w/2-.16),base+h+.55,cz,.35,1.1,d);
    for(const sz of [-1,1])box(mat,cx,base+h+.55,cz+sz*(d/2-.16),w,1.1,.35);
    const cols=Math.max(5,Math.floor(w/3.5)),rows=Math.max(5,Math.floor((h-5)/3.5));
    for(const sign of [-1,1]){
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const xx=cx-w/2+(c+.5)*w/cols,yy=base+5+(r+.42)*(h-6)/rows;
        add(new THREE.PlaneGeometry(w/cols*.53,2.06),(r+c)%8===0?'glassB':'glassA',xx,yy,cz+sign*(d/2+.035),0,sign<0?Math.PI:0);
      }
      for(const yy of [base+4.4,base+h-2.0])box(mat,cx,yy,cz+sign*(d/2+.17),w+.35,.25,.52);
      const sideCols=Math.max(5,Math.floor(d/4.0));
      for(let r=0;r<rows;r++)for(let c=0;c<sideCols;c++){
        const zz=cz-d/2+(c+.5)*d/sideCols,yy=base+5+(r+.42)*(h-6)/rows;
        add(new THREE.PlaneGeometry(d/sideCols*.52,2.06),(r+c)%7===0?'glassB':'glassA',cx+sign*(w/2+.035),yy,zz,0,sign*Math.PI/2);
      }
    }
    box('gray',cx+w*.17,base+h+1.8,cz-d*.12,w*.22,3.6,d*.21);
    box('metal',cx-w*.24,base+h+.75,cz+d*.15,4,1.5,3.1);
  }
  const farHues:MatName[]=['cream','hotelLight','terracotta','hotel','gray','orange'];
  for(const sector of ['north','south'] as const){
    begin(`Distant ${sector} city context`,0,0,0,0);
    for(let row=0;row<3;row++)for(let col=0;col<8;col++){
      const cx=[-294,-176,-114,-32,33,116,178,296][col];
      const width=[68,58,58,63,64,60,60,74][col];
      const cz=(sector==='north'?-1:1)*((sector==='north'?277:295)+row*85);
      const height=[37,54,43,66,52,41,58,34][(col+row*3)%8]+(sector==='north'?7:0);
      farBuilding(cx,cz,width,59+(col%3)*3,height,farHues[(col+row*2)%farHues.length]);
    }
  }
  for(const sector of ['west','east'] as const){
    begin(`Distant ${sector} city context`,0,0,0,0);
    for(let row=0;row<3;row++)for(let col=0;col<5;col++){
      const cx=(sector==='west'?-1:1)*(282+row*85),cz=[-166,-85,0,93,173][col];
      farBuilding(cx,cz,59,56+(col%2)*8,[38,54,65,47,32][(col+row)%5],farHues[(row*3+col+1)%farHues.length]);
    }
  }
  begin('Market-end distant streetscape beyond walking boundary',0,0,0,0);
  farBuilding(-77,550,90,58,46,'hotelLight');farBuilding(73,550,81,56,54,'cream');
  finish();
  group.userData.provenance='Original procedural meshes: src/architecture.ts; reference-derived 2023–2024 ordinary-day building ensemble.';
  group.userData.estimatedDimensions=true;
  return {group,colliders};
}


/** A single plaza-centre reflection probe gives glass and chrome fixtures local streetscape reflections.
 * This is a static, parallax-limited approximation, refreshed for a lighting change.
 * No downloaded environment imagery and no ongoing cubemap render cost. */
export function applyArchitectureProbe(scene:THREE.Scene,renderer:THREE.WebGLRenderer):()=>void {
  const glazing=new Set<THREE.MeshStandardMaterial>();
  scene.traverse(o=>{
    const mesh=o as THREE.Mesh;
    for(const m of(Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[])) {
      if(m instanceof THREE.MeshStandardMaterial&&(m.name.startsWith('architecture-glass')||m.name==='plaza-chrome-globes'))glazing.add(m);
    }
  });
  const cubeTarget=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType,generateMipmaps:false});
  const camera=new THREE.CubeCamera(1,450,cubeTarget);camera.position.set(0,18,0);
  // Revert to sky lighting for capture; a previous scene probe must not feed itself.
  for(const mat of glazing){mat.envMap=null;mat.needsUpdate=true;}
  const oldAutoClear=renderer.autoClear;renderer.autoClear=true;
  try {camera.update(renderer,scene);} finally {renderer.autoClear=oldAutoClear;}
  const pmrem=new THREE.PMREMGenerator(renderer);const probe=pmrem.fromCubemap(cubeTarget.texture);
  cubeTarget.dispose();pmrem.dispose();
  for(const mat of glazing){mat.envMap=probe.texture;mat.envMapIntensity=(mat.name.includes('glassFacade')||mat.name==='plaza-chrome-globes')?2.2:1.45;mat.needsUpdate=true;}
  let disposed=false;
  return ()=>{
    if(disposed)return;disposed=true;
    for(const mat of glazing)if(mat.envMap===probe.texture){mat.envMap=null;mat.needsUpdate=true;}
    probe.dispose();
  };
}
