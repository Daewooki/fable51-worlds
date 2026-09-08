import * as THREE from 'three';
import { cel, flat } from '../core/toon.js';
import { box, cyl, bake } from '../core/util.js';
import { hullOutline } from '../core/outline.js';

let barkTexture;
function cypressBarkTexture(){
  if(barkTexture)return barkTexture;
  const cv=document.createElement('canvas');cv.width=512;cv.height=512;const c=cv.getContext('2d');
  c.fillStyle='#f3eee5';c.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=6){
    c.strokeStyle=y%18===0?'rgba(77,62,48,.24)':'rgba(89,73,56,.13)';c.lineWidth=y%18===0?1.2:.6;
    c.beginPath();c.moveTo(0,y);c.lineTo(512,y+.4);c.stroke();
    for(let j=0;j<16;j++){const x=(j*37+y*13)%512;c.strokeStyle='rgba(83,69,57,.09)';c.beginPath();c.moveTo(x,y+1);c.lineTo(x+11+(j%4)*8,y+4);c.stroke();}
  }
  barkTexture=new THREE.CanvasTexture(cv);barkTexture.colorSpace=THREE.SRGBColorSpace;barkTexture.anisotropy=8;return barkTexture;
}
/** Curved hip or gable roof, closed thickness, real fascia and roof ribs. */
export function makeCurvedRoof({width=10,depth=10,height=2.2,color=0x626874,edgeColor=0x9a9c99,gable=false,ridge=0,tiles=true,outline=false,bark=false}={}) {
  const group=new THREE.Group();
  const roofMat=cel({color,bands:3,flat:false,map:bark?cypressBarkTexture():null});
  const edgeMat=cel({color:edgeColor,bands:3});
  const nx=Math.max(16,Math.ceil(width*2)), nz=Math.max(12,Math.ceil(depth*1.5));
  const roofY=(x,z)=>{
    const a=Math.abs(z)/(depth*.5);
    const b=Math.max(0,(Math.abs(x)-ridge*.5)/(width*.5-ridge*.5||1));
    const t=Math.min(1,gable?a:Math.max(a,b));
    const lift=.22*Math.pow(t,8)*(gable?1:(.25+.75*Math.min(a,b))) + (gable?.34*Math.pow(Math.abs(x)/(width*.5),9)*Math.pow(a,3):0);
    return height*Math.pow(1-t,1.38)+lift;
  };
  const p=[],idx=[];
  if(gable){
    for(let layer=0;layer<2;layer++)for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
      const x=(ix/nx-.5)*width,z=(iz/nz-.5)*depth;p.push(x,roofY(x,z)-layer*.19,z);
    }
    const count=(nx+1)*(nz+1);
    for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
      const a=iz*(nx+1)+ix,b=a+1,c=a+nx+1,d=c+1;
      idx.push(a,c,b,b,c,d,count+a,count+b,count+c,count+b,count+d,count+c);
    }
    // Exterior fascia faces outward. Inward winding exposes a strip of sky
    // between the top edge trim and the underside from pedestrian cameras.
    const seam=(a,b)=>idx.push(a,a+count,b,b,a+count,b+count);
    for(let ix=0;ix<nx;ix++){seam(ix+1,ix);const a=nz*(nx+1)+ix;seam(a,a+1);}
    for(let iz=0;iz<nz;iz++){seam(iz*(nx+1),(iz+1)*(nx+1));seam((iz+1)*(nx+1)+nx,iz*(nx+1)+nx);}
  }else{
    // Four trapezoid panels meet exactly on the hips. A rectangular sampling grid
    // across max(x,z) produces saw-toothed normals along these structural seams.
    const outer=[[-width/2,depth/2],[width/2,depth/2],[width/2,-depth/2],[-width/2,-depth/2]];
    const inner=[[-ridge/2,0],[ridge/2,0],[ridge/2,0],[-ridge/2,0]];
    const rings=width<3?5:12,across=Math.max(3,Math.min(12,Math.ceil(width/2)));
    for(let side=0;side<4;side++){
      const next=(side+1)%4,base=p.length/3,layerSize=(rings+1)*(across+1);
      for(let layer=0;layer<2;layer++)for(let r=0;r<=rings;r++)for(let j=0;j<=across;j++){
        const t=r/rings,u=j/across;
        const ox=outer[side][0]*(1-u)+outer[next][0]*u,oz=outer[side][1]*(1-u)+outer[next][1]*u;
        const ix=inner[side][0]*(1-u)+inner[next][0]*u;
        const x=ix*(1-t)+ox*t,z=oz*t;p.push(x,roofY(x,z)-layer*.19,z);
      }
      for(let r=0;r<rings;r++)for(let j=0;j<across;j++){
        const a=base+r*(across+1)+j,b=a+1,c=a+across+1,d=c+1;
        idx.push(a,c,b,b,c,d,a+layerSize,b+layerSize,c+layerSize,b+layerSize,d+layerSize,c+layerSize);
      }
      for(let j=0;j<across;j++){
        const a=base+rings*(across+1)+j,b=a+1;idx.push(a,a+layerSize,b,b,a+layerSize,b+layerSize);
      }
    }
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geom.setIndex(idx);
  if(bark){const uv=[];for(let i=0;i<p.length;i+=3)uv.push(p[i]/width+.5,Math.abs(p[i+2])/(depth*.5));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}
  geom.computeVertexNormals();
  const roof=new THREE.Mesh(geom,roofMat);roof.name='curved-roof';roof.castShadow=true;roof.receiveShadow=true;group.add(roof);
  const line=(pts,r,mat)=>{const curve=new THREE.CatmullRomCurve3(pts);const m=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(4,pts.length*2),r,4,false),mat);group.add(m);};
  for(const s of [-1,1]){
    const pts=[];for(let i=0;i<=20;i++){const x=(i/20-.5)*width,z=s*depth*.5;pts.push(new THREE.Vector3(x,roofY(x,z)+.005,z));}line(pts,.07,edgeMat);
  }
  if(!gable)for(const s of [-1,1]){const pts=[];for(let i=0;i<=16;i++){const x=s*width*.5,z=(i/16-.5)*depth;pts.push(new THREE.Vector3(x,roofY(x,z),z));}line(pts,.07,edgeMat);}
  if(tiles){
    const tileMat=cel({color:new THREE.Color(color).lerp(new THREE.Color(0xb3b3ac),.19).getHex(),bands:3});
    for(let x=-width*.48;x<=width*.49;x+=.39){
      const pts=[];for(let i=0;i<=14;i++){const z=(i/14-.5)*depth;pts.push(new THREE.Vector3(x,roofY(x,z)+.045,z));}line(pts,.028,tileMat);
    }
  }
  const cap=box(Math.max(.25,gable?width:ridge+.25),.17,.23,edgeMat,0,height+.08,0);group.add(cap);
  if(outline)hullOutline(roof,{thickness:.0018,opacity:.7});
  return group;
}

/** Material batching keeps hundreds of brackets a handful of draw calls. */
export function compact(group){
  group.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(group.matrixWorld).invert(),buckets=new Map(),remove=[];
  group.traverse(o=>{
    if(!o.isMesh||o.userData.isOutline||o.children.some(c=>c.userData.isOutline)||o.userData.animated)return;
    if(Array.isArray(o.material))return;
    const key=o.material.uuid;
    if(!buckets.has(key))buckets.set(key,{mat:o.material,parts:[]});
    buckets.get(key).parts.push({geometry:o.geometry,matrix:new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld)});remove.push(o);
  });
  remove.forEach(o=>o.removeFromParent());
  for(const b of buckets.values())if(b.parts.length){const mesh=new THREE.Mesh(bake(b.parts),b.mat);mesh.castShadow=!b.mat.transparent;mesh.receiveShadow=true;group.add(mesh);}
  return group;
}

export function makePagoda({height=28,levels=5,color=0x554239}={}){
  const group=new THREE.Group();group.name=levels===5?'Hokan-ji Yasaka Pagoda':'Kiyomizu-dera three-storey pagoda';
  // Painted brown bounce keeps bracket layers readable under the deep eaves.
  const wood=cel({color,bands:3,emissive:color,emissiveIntensity:.09}),posts=cel({color:0x796450,emissive:0x796450,emissiveIntensity:.10}),timberLight=cel({color:0x8a7056,emissive:0x8a7056,emissiveIntensity:.10}),plaster=cel({color:0x968b74}),stone=cel({color:0x858481}),dark=flat({color:0x383738}),gold=cel({color:0xa88d5a});
  group.add(box(8.2,.45,8.2,stone,0,.225,0),box(7.7,.22,7.7,stone,0,.56,0));
  const finialH=height*.22,bodyH=height-finialH-.7,step=bodyH/levels;
  for(let level=0;level<levels;level++){
    const y=.7+level*step,w=5.2-level*.40,roofW=10.6-level*.54,h=step*.55;
    const infill=level>0?wood:plaster;
    const overlap=level>0?.9:0;
    group.add(box(w,h+overlap,w,wood,0,y+(h-overlap)*.5,0));
    for(const side of [-1,1]){
      group.add(box(w-.18,h*.42,.10,infill,0,y+h*.61,side*(w*.5+.04)),box(.10,h*.42,w-.18,infill,side*(w*.5+.04),y+h*.61,0));
      for(let j=-2;j<=2;j++){
        const c=j*w/5;
        group.add(box(.16,h+.35,.2,posts,c,y+h*.5,side*(w*.5+.15)),box(.2,h+.35,.16,posts,side*(w*.5+.15),y+h*.5,c));
        for(const axis of [0,1]){
          const x=axis?side*(w*.5+.14):c,z=axis?c:side*(w*.5+.14);
          group.add(box(.42,.19,.42,wood,x,y+h+.04,z),box(.7,.14,.7,timberLight,x,y+h+.23,z),box(.22,.28,.22,wood,x,y+h+.32,z));
        }
      }
      // Slatted shutters and veranda rails on all four faces.
      for(let j=-8;j<=8;j++){
        const c=j*w/19;
        group.add(box(.055,h*.45,.13,wood,c,y+h*.61,side*(w*.5+.105)),box(.13,h*.45,.055,wood,side*(w*.5+.105),y+h*.61,c));
      }
      group.add(box(w+.6,.12,.12,timberLight,0,y+.5,side*(w*.5+.4)),box(.12,.12,w+.6,timberLight,side*(w*.5+.4),y+.5,0));
      for(let j=-5;j<=5;j++){
        group.add(box(.085,.46,.085,timberLight,j*w/10,y+.27,side*(w*.5+.4)),box(.085,.46,.085,timberLight,side*(w*.5+.4),y+.27,j*w/10));
      }
    }
    const roof=makeCurvedRoof({width:roofW,depth:roofW,height:step*.41,color:0x5d6268,edgeColor:0x9c9c92,outline:level===4||level===0});roof.position.y=y+h+.38;group.add(roof);
    // Deep eave brackets: a rhythmic visible underside rather than a black slab.
    for(let i=-8;i<=8;i++)for(const s of [-1,1]){
      group.add(box(.10,.13,1.1,timberLight,i*(roofW-.7)/18,y+h+.34,s*(w*.5+.52)),box(1.1,.13,.10,timberLight,s*(w*.5+.52),y+h+.34,i*(roofW-.7)/18));
    }
  }
  const top=.7+levels*step+.22;
  group.add(cyl(.09,.16,finialH,10,dark,0,top+finialH*.45,0));
  for(let i=0;i<9;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.38-i*.014,.053,6,18),gold);ring.rotation.x=Math.PI/2;ring.position.y=top+.4+i*.35;group.add(ring);
  }
  group.add(cyl(.0,.26,.7,8,gold,0,top+finialH-.18,0));
  const jewel=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),gold);jewel.position.y=top+finialH+.22;group.add(jewel);
  group.userData.colliders=[{minX:-3.8,maxX:3.8,minZ:-3.8,maxZ:3.8,minY:0,maxY:height}];
  group.userData.interactions=[{position:[0,1.4,4.7],label:levels===5?'Read the Hōkan-ji stone':'Read about the three-storey pagoda',text:levels===5?'八坂の塔 · Hōkan-ji\nFive diminishing roofs rise above the town. This pagoda has watched generations walk these slopes.':'清水寺 三重塔 · Kiyomizu-dera\nThree vermilion storeys mark the temple precinct above the approach. The five-storey Yasaka Pagoda is farther downhill.',kind:'read'}];
  group.userData.footprint={width:10,depth:10,height};
  return compact(group);
}
