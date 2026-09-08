import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { cel, flat } from '../core/toon.js';
import { bake, trs, rngKit } from '../core/util.js';

// Centralized collection, spatially bounded batches and high-key blossom
// shadows follow the Sakura Crossing study. All placements share heightAt.
const UP = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4(), _position = new THREE.Vector3();
const _rotation = new THREE.Quaternion(), _scale = new THREE.Vector3();
const TAU = Math.PI * 2;

function boughGeometry(detail=1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = 1 + .022 * Math.sin(x * 8 + y * 3) * Math.cos(z * 7) + .012 * Math.cos(y * 13 + x * 3);
    p.setXYZ(i, x * r, y * r, z * r);
  }
  g.deleteAttribute('normal');g.deleteAttribute('uv');
  const smooth=mergeVertices(g,1e-4);smooth.computeVertexNormals();g.dispose();
  return smooth;
}

function lanceGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.quadraticCurveTo(.15, .21, 0, .65);
  shape.quadraticCurveTo(-.15, .21, 0, 0);
  const g = new THREE.ShapeGeometry(shape, 3);
  return g;
}

export function buildVegetation(scene, placements = [], heightAt = () => 0) {
  const root = new THREE.Group(); root.name = 'Kyoto gardens and wooded hills'; scene.add(root);
  const cylinder = new THREE.CylinderGeometry(.65, 1, 1, 7);
  const leaves = boughGeometry();
  const blossoms = boughGeometry(2);
  // A tier is placed by its base, with a ragged rim rather than a perfectly
  // horizontal lampshade. Sugi stays a narrow vertical silhouette.
  const cedar = new THREE.ConeGeometry(1, 1, 7);cedar.translate(0,.5,0);
  const cedarVertices=cedar.attributes.position;
  for(let i=0;i<cedarVertices.count;i++) {
    const px=cedarVertices.getX(i),pz=cedarVertices.getZ(i),r=Math.hypot(px,pz);
    if(r>.1) {
      const angle=Math.atan2(pz,px),vary=1+.10*Math.sin(angle*3+1.3);
      cedarVertices.setXYZ(i,px*vary,cedarVertices.getY(i)+.075*Math.sin(angle*2+.7),pz*vary);
    }
  }
  cedar.computeVertexNormals();
  const lance = lanceGeometry();
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0,-.55);petalShape.bezierCurveTo(-.7,-.3,-.6,.5,-.13,.62);
  petalShape.lineTo(0,.43);petalShape.lineTo(.13,.62);petalShape.bezierCurveTo(.6,.5,.7,-.3,0,-.55);
  const petalGeo = new THREE.ShapeGeometry(petalShape, 3);
  const materials = {
    wood: cel({color:0x766655,bands:3,tint:0x948197}),
    bamboo: cel({color:0x849761,bands:'soft3',tint:0x839784}),
    bambooNode: cel({color:0xb8c38d,bands:'soft3',tint:0xa0ae9a}),
    pink: cel({color:0xffffff,bands:'soft',tint:0xe6bccf,flat:false,inkWeight:.22}),
    green: cel({color:0xffffff,bands:'soft3',tint:0x91a990,flat:false,inkWeight:.52}),
    needles: cel({color:0xffffff,bands:3,tint:0x80938e}),
    grass: cel({color:0x739367,bands:'soft3',side:THREE.DoubleSide}),
    petals: flat({color:0xffdfdf,side:THREE.DoubleSide}),
  };
  const cells = new Map(), types = {}, seasonalMeshes=[], counts = {trees:0,canopyClusters:0,branches:0,groundPetals:0,fallingPetals:150,instancedMeshes:0,drawCalls:0};
  function cellAt(x,z) {
    const key = `${Math.floor(x/64)},${Math.floor(z/64)}`;
    if (!cells.has(key)) cells.set(key,{wood:[],bamboo:[],bambooNode:[],pink:[],green:[],needles:[],grass:[],petals:[]});
    return cells.get(key);
  }
  function branch(cell, start, end, radius, kind='wood') {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), dir=b.clone().sub(a);
    _position.copy(a).add(b).multiplyScalar(.5);
    _rotation.setFromUnitVectors(UP,dir.clone().normalize());
    _scale.set(radius,dir.length(),radius);
    cell[kind].push({geometry:cylinder,matrix:new THREE.Matrix4().compose(_position,_rotation,_scale)});
    counts.branches++;
  }
  function blob(cell,kind,x,y,z,rx,ry,rz,color,rng) {
    cell[kind].push({matrix:trs(x,y,z,rng.range(-.25,.25),rng.range(0,TAU),rng.range(-.2,.2),rx,ry,rz),color,seasonal:kind==='pink'||cell.activeType==='maple'});
    counts.canopyClusters++;
  }

  placements.forEach((spot,index) => {
    const rng=rngKit(spot.seed??index*137+3107),s=spot.scale??1;
    const x=spot.x,z=spot.z,y=spot.y??heightAt(x,z),type=spot.type??'sakura';
    const cell=cellAt(x,z);cell.activeType=type;types[type]=(types[type]??0)+1;counts.trees++;
    if(type==='bamboo') {
      for(let i=0;i<7;i++) {
        const bx=x+rng.range(-.9,.9)*s,bz=z+rng.range(-.9,.9)*s,h=rng.range(4.3,6.8)*s;
        const dx=rng.range(-.24,.24)*s,dz=rng.range(-.24,.24)*s;
        branch(cell,[bx,y,bz],[bx+dx,y+h,bz+dz],.045*s,'bamboo');
        for(let n=1;n<h/(.53*s);n++) {
          const ty=n*.53*s,t=ty/h;
          branch(cell,[bx+dx*t,y+ty,bz+dz*t],[bx+dx*t,y+ty+.035*s,bz+dz*t],.052*s,'bambooNode');
        }
        for(let j=0;j<4;j++) {
          const cy=y+h*(.45+j*.14),a=rng.range(0,TAU),r=.65*s;
          branch(cell,[bx,cy,bz],[bx+Math.cos(a)*r,cy+.12*s,bz+Math.sin(a)*r],.014*s,'bamboo');
          for(let k=0;k<7;k++) {
            const d=k/7;
            cell.grass.push({matrix:trs(bx+Math.cos(a)*r*d,cy+.12*s*d,bz+Math.sin(a)*r*d,rng.range(.5,2),a+(k%2?.7:-.7),rng.range(-.9,.9),s*.58,s*.8,s*.58),color:0x718f64});
          }
        }
      }
      return;
    }
    if(type==='shrub'||type==='moss') {
      for(let i=0;i<8;i++) {
        const a=i*2.4,r=rng.range(.1,.65)*s;
        blob(cell,'green',x+Math.cos(a)*r,y+rng.range(.18,.45)*s,z+Math.sin(a)*r,.45*s,.3*s,.4*s,rng.pick([0x93aa77,0x718d64,0xaab888]),rng);
      }
      return;
    }
    if(type==='cedar') {
      const h=rng.range(8.5,11)*s,base=h*rng.range(.31,.39),crown=h-base;
      const rMax=h*rng.range(.125,.15),tierCount=7;
      const tones=[0x839b7a,0x6c896e,0x577663];
      branch(cell,[x,y,z],[x,y+h,z],.145*s);
      branch(cell,[x,y,z],[x,y+.58*s,z],.23*s);
      for(let i=0;i<tierCount;i++) {
        const t=i/tierCount,r=rMax*Math.pow(1-t,.83)*rng.range(.87,1.1);
        const angle=rng.range(0,TAU),tx=x+Math.cos(angle)*r*.11,tz=z+Math.sin(angle)*r*.11;
        const ty=y+base+crown*(t+rng.range(-.027,.027)),tierH=crown/tierCount*rng.range(2.1,2.55);
        cell.needles.push({matrix:trs(tx,ty,tz,rng.range(-.095,.095),rng.range(0,TAU),rng.range(-.09,.09),r,tierH,r*rng.range(.78,1.14)),color:tones[t>.61?0:t<.26?2:1]});
        counts.canopyClusters++;
        if(i===1||i===3||i===5) {
          // Asymmetric outward boughs break the repeated taper without
          // substituting round broadleaf canopies for cedar foliage.
          const a=angle+1.4,reach=r*.88,ex=x+Math.cos(a)*reach,ez=z+Math.sin(a)*reach;
          branch(cell,[x,ty+.26*s,z],[ex,ty+.12*s,ez],.024*s);
          cell.needles.push({matrix:trs(ex,ty-.15*s,ez,rng.range(-.15,.15),a,rng.range(-.15,.15),r*.39,tierH*.78,r*.51),color:tones[i%2]});
          counts.canopyClusters++;
        }
      }
      cell.needles.push({matrix:trs(x,y+base+crown*.86,z,.015,rng.range(0,TAU),-.022,rMax*.24,crown*.32,rMax*.22),color:tones[0]});
      counts.canopyClusters++;
      return;
    }
    const sakura=type==='sakura'||type==='cherry',pine=type==='pine';
    const trunkH=(sakura?2.8:pine?3.9:3.1)*s;
    const leanX=rng.range(-.35,.35)*s,leanZ=rng.range(-.3,.3)*s;
    const trunkTop=[x+leanX,y+trunkH,z+leanZ];
    branch(cell,[x,y,z],trunkTop,(pine?.21:.17)*s);
    for(let r=0;r<4;r++) {
      const a=r*TAU/4+.5;
      branch(cell,[x+Math.cos(a)*.42*s,y+.02,z+Math.sin(a)*.42*s],[x,y+.5*s,z],.07*s);
    }
    const limbCount=pine?5:5;
    const pinks=[0xffe8ee,0xfbd6e2,0xf1b6ce,0xf7cad9];
    const greens=type==='maple'?[0xa2b478,0x8fa575,0xb0ba81]:pine?[0x7b956e,0x65856a,0x93a17a]:[0x8eaa79,0x739b75,0xa1b486];
    for(let j=0;j<limbCount;j++) {
      const a=j*TAU/limbCount+rng.range(-.45,.45);
      const reach=rng.range(1.4,2.5)*s;
      const cy=y+trunkH+(pine?j*.3:rng.range(.35,1.45))*s;
      const bx=x+leanX+Math.cos(a)*reach,bz=z+leanZ+Math.sin(a)*reach;
      branch(cell,trunkTop,[bx,cy,bz],.078*s);
      const clusterCount=sakura?10:5;
      for(let k=0;k<clusterCount;k++) {
        const ca=k*2.399+rng.range(-.25,.25),spread=(k===0?0:rng.range(.25,sakura?.78:1.05))*s;
        const px=bx+Math.cos(ca)*spread,pz=bz+Math.sin(ca)*spread;
        const py=cy+rng.range(-.2,.65)*s;
        const radius=rng.range(sakura?.32:.55,sakura?.55:.88)*s;
        const tone=sakura?(py>cy+.3?pinks[0]:rng.pick(pinks)):rng.pick(greens);
        blob(cell,sakura?'pink':'green',px,py,pz,radius*(pine?1.3:1),radius*(pine?.27:.7),radius,tone,rng);
        if(k===1||k===4)branch(cell,[bx,cy,bz],[px,py,pz],.024*s);
        if(sakura&&k%3===0) {
          const edge=.46*s;
          blob(cell,'pink',px+Math.cos(ca)*edge,py+.13*s,pz+Math.sin(ca)*edge,.19*s,.14*s,.21*s,pinks[k%pinks.length],rng);
        }
      }
    }
    if(!pine)for(let j=0;j<5;j++)blob(cell,sakura?'pink':'green',x+leanX+rng.range(-.7,.7)*s,y+trunkH+1.1*s,z+leanZ+rng.range(-.7,.7)*s,(sakura?.48:.8)*s,(sakura?.3:.55)*s,(sakura?.46:.78)*s,sakura?0xfbd9e4:greens[2],rng);
    if(sakura) {
      for(let k=0;k<45;k++) {
        const a=rng.range(0,TAU),r=Math.sqrt(rng.next())*3.4*s;
        const px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,py=heightAt(px,pz)+.036;
        const size=rng.range(.036,.074);
        cell.petals.push({matrix:trs(px,py,pz,-Math.PI/2,0,rng.range(0,TAU),size,size,size),color:rng.pick(pinks),seasonal:true});
        counts.groundPetals++;
      }
    }
  });

  for(const [key,cell] of cells) {
    for(const kind of ['wood','bamboo','bambooNode']) {
      if(!cell[kind].length)continue;
      const mesh=new THREE.Mesh(bake(cell[kind]),materials[kind]);mesh.name=`${kind} / garden cell ${key}`;
      mesh.castShadow=kind==='wood';mesh.receiveShadow=true;root.add(mesh);counts.drawCalls++;
    }
    for(const kind of ['pink','green','needles','grass','petals']) {
      const list=cell[kind];if(!list.length)continue;
      const g=kind==='needles'?cedar:kind==='grass'?lance:kind==='petals'?petalGeo:kind==='pink'?blossoms:leaves;
      const mesh=new THREE.InstancedMesh(g,materials[kind],list.length);mesh.name=`${kind} / garden cell ${key}`;
      for(let i=0;i<list.length;i++){mesh.setMatrixAt(i,list[i].matrix);mesh.setColorAt(i,new THREE.Color(list[i].color));}
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      if(list.some(v=>v.seasonal))seasonalMeshes.push({mesh,list,kind,springColors:new Float32Array(mesh.instanceColor.array)});
      mesh.castShadow=(kind==='green'||kind==='needles') || (kind==='pink'&&Number(key.split(',')[0])%2===0);
      mesh.receiveShadow=false;mesh.computeBoundingBox();mesh.computeBoundingSphere();
      root.add(mesh);counts.instancedMeshes++;counts.drawCalls++;
    }
  }
  cylinder.dispose();

  const fallRng=rngKit(71631),falling=new THREE.InstancedMesh(petalGeo,materials.petals,counts.fallingPetals);
  falling.name='A handful of petals carried on the breeze';falling.frustumCulled=false;
  falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);falling.castShadow=false;falling.receiveShadow=false;
  const particleData=Array.from({length:counts.fallingPetals},()=>({x:fallRng.range(-22,22),z:fallRng.range(-22,22),y:fallRng.range(0,13),phase:fallRng.range(0,TAU),speed:fallRng.range(.18,.38),scale:fallRng.range(.023,.065)}));
  root.add(falling);counts.instancedMeshes++;counts.drawCalls++;
  let elapsed=0,currentSeason='spring';
  function setSeason(season='spring') {
    currentSeason=season==='autumn'?'autumn':'spring';
    const color=new THREE.Color();
    for(const entry of seasonalMeshes) {
      entry.mesh.instanceColor.array.set(entry.springColors);
      if(currentSeason==='autumn')for(let i=0;i<entry.list.length;i++) {
        if(!entry.list[i].seasonal)continue;
        const palette=entry.kind==='pink'?[0xd7a065,0xe7ba75,0xc58b5f,0xebc992]:[0xbc754e,0xd69053,0xe8b567,0xb98657];
        color.set(palette[i%palette.length]);entry.mesh.setColorAt(i,color);
      }
      entry.mesh.instanceColor.needsUpdate=true;
    }
    materials.petals.color.set(currentSeason==='autumn'?0xeab977:0xffdfdf);
    falling.count=currentSeason==='autumn'?90:counts.fallingPetals;
  }
  return {root,setSeason,stats:{...counts,types,spatialCells:cells.size},update(dt,camera,time) {
    elapsed=Number.isFinite(time)?time:elapsed+dt;
    if(!camera)return;
    const cx=Math.floor(camera.position.x/8)*8,cz=Math.floor(camera.position.z/8)*8;
    for(let i=0;i<particleData.length;i++) {
      const p=particleData[i],x=cx+p.x+Math.sin(elapsed*.17+p.phase)*2,z=cz+p.z+Math.cos(elapsed*.12+p.phase)*1.7;
      const y=camera.position.y-2+((p.y-elapsed*p.speed)%13+13)%13;
      _matrix.copy(trs(x,y,z,elapsed*.45+p.phase,elapsed*.17+p.phase,Math.sin(elapsed+p.phase),p.scale,p.scale,p.scale));
      falling.setMatrixAt(i,_matrix);
    }
    falling.instanceMatrix.needsUpdate=true;
  }};
}
