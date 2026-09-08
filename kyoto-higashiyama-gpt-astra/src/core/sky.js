import * as THREE from 'three';
import { flat } from './toon.js';
import { bake,trs,rngKit } from './util.js';

export function buildSky(scene) {
  const day={top:0x8cb9cd,mid:0xcce0df,haze:0xf5e7d4};
  const modes={morning:day,day,sunset:{top:0x9aa9c3,mid:0xe4cdcb,haze:0xffdab7},blue:{top:0x6d86af,mid:0xb1bfd2,haze:0xdfcfcb}};
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{uTop:{value:new THREE.Color(day.top)},uMid:{value:new THREE.Color(day.mid)},uHaze:{value:new THREE.Color(day.haze)}},
    vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vDirection;uniform vec3 uTop,uMid,uHaze;void main(){float h=normalize(vDirection).y;float t=clamp(h*1.15,0.0,1.0);float q=floor(t*42.0)/42.0;t=mix(t,q,.12);vec3 c=mix(uHaze,uMid,smoothstep(0.0,.28,t));c=mix(c,uTop,smoothstep(.2,.9,t));gl_FragColor=vec4(c,1.0);}`});
  const dome=new THREE.Mesh(new THREE.SphereGeometry(1290,32,18),skyMaterial);
  dome.name='Painted blue and warm paper sky';dome.renderOrder=-20;dome.frustumCulled=false;scene.add(dome);
  const rng=rngKit(52033),clouds=new THREE.Group();clouds.name='Quiet spring cloud banks';scene.add(clouds);
  const cloudParts=[[],[]];
  function cloudShape(w,h,offset=0) {
    const shape=new THREE.Shape(),points=[];
    points.push(new THREE.Vector2(-w*.5,0));
    for(let i=1;i<15;i++) {
      const t=i/15,envelope=Math.sin(Math.PI*t);
      const scallop=.58+.18*Math.sin(i*2.3+offset)+.08*Math.cos(i*1.14);
      points.push(new THREE.Vector2((t-.5)*w,h*envelope*scallop));
    }
    points.push(new THREE.Vector2(w*.5,0),new THREE.Vector2(w*.34,-h*.12),new THREE.Vector2(w*.07,-h*.17),new THREE.Vector2(-w*.26,-h*.14),points[0]);
    shape.moveTo(points[0].x,points[0].y);shape.splineThru(points.slice(1));shape.closePath();
    return new THREE.ExtrudeGeometry(shape,{depth:1.4,bevelEnabled:false,curveSegments:5});
  }
  for(let i=0;i<10;i++) {
    const a=i*Math.PI*2/10+rng.range(-.2,.2),r=rng.range(650,920);
    const x=Math.cos(a)*r,z=Math.sin(a)*r,y=rng.range(145,255),w=rng.range(125,245),h=rng.range(27,47);
    // Tangential placement keeps every bank broad when viewed from below.
    // Radial lobes previously collapsed to a tall blob when facing east.
    const ry=-a-Math.PI/2;
    cloudParts[0].push({geometry:cloudShape(w,h,i),matrix:trs(x,y,z,0,ry,0)});
    cloudParts[1].push({geometry:cloudShape(w*.86,h*.19,i+.3),matrix:trs(x+Math.cos(a)*2,y-h*.10,z+Math.sin(a)*2,0,ry,0)});
  }
  for(let i=0;i<cloudParts.length;i++) {
    const m=new THREE.Mesh(bake(cloudParts[i]),flat({color:[0xfff6e6,0xe7e6e0][i],fog:false,depthWrite:false,transparent:true,opacity:i===0?.64:.23,side:THREE.DoubleSide}));
    m.renderOrder=-19+i*.01;clouds.add(m);cloudParts[i].forEach(p=>p.geometry.dispose());
  }
  const horizon=new THREE.Group();horizon.name='Higashiyama ridges and Kyoto basin';scene.add(horizon);
  function ridge({x,z,angle,width,height,base,color,phase}) {
    const shape=new THREE.Shape();shape.moveTo(-width/2,-65);
    const n=160;
    for(let i=0;i<=n;i++) {
      const t=i/n,h=base+height*(.52+.22*Math.sin(t*9+phase)+.12*Math.sin(t*18+phase*.6)+.05*Math.cos(t*35));
      shape.lineTo((t-.5)*width,h);
    }
    shape.lineTo(width/2,-65);shape.closePath();
    const m=new THREE.Mesh(new THREE.ShapeGeometry(shape),flat({color,fog:false,side:THREE.DoubleSide}));
    m.position.set(x,0,z);m.rotation.y=angle;horizon.add(m);
  }
  ridge({x:900,z:180,angle:-Math.PI/2,width:1700,height:90,base:88,color:0xcdd5cb,phase:1.2});
  ridge({x:690,z:160,angle:-Math.PI/2,width:1450,height:83,base:62,color:0xb8c9bd,phase:2.1});
  ridge({x:505,z:165,angle:-Math.PI/2,width:1200,height:68,base:40,color:0xa4bba5,phase:1.4});
  ridge({x:-650,z:185,angle:Math.PI/2,width:1600,height:42,base:12,color:0xd3d8d3,phase:3.6});
  ridge({x:80,z:-620,angle:0,width:1700,height:62,base:12,color:0xd2d8ce,phase:.3});
  ridge({x:50,z:790,angle:Math.PI,width:1650,height:40,base:20,color:0xd1d4cb,phase:2.5});

  const cityColors=[0xc1c9bf,0xd1d2c6,0xb7c1b8,0xced4cc],city=[[],[],[],[]],roofs=[[],[],[],[]];
  const box=new THREE.BoxGeometry(1,1,1);
  const roofShape=new THREE.Shape();roofShape.moveTo(-.56,0);roofShape.lineTo(0,.38);roofShape.lineTo(.56,0);roofShape.closePath();
  const roof=new THREE.ExtrudeGeometry(roofShape,{depth:1,bevelEnabled:false});roof.translate(0,0,-.5);
  for(let i=0;i<1050;i++) {
    const x=rng.range(-565,-50),z=rng.range(-220,590),w=rng.range(3.8,8)*1.7,d=rng.range(4,9)*1.7,h=rng.range(3.2,10);
    const tone=rng.int(0,3),ground=-2+(x+50)*.006;
    city[tone].push(trs(x,ground+h/2,z,0,0,0,w,h,d));
    if(i%4!==0)roofs[tone].push(trs(x,ground+h,z,0,i%2?Math.PI/2:0,0,w,3,d));
  }
  function instance(g,mat,list,name) {
    const m=new THREE.InstancedMesh(g,mat,list.length);list.forEach((v,i)=>m.setMatrixAt(i,v));m.name=name;m.computeBoundingBox();m.computeBoundingSphere();horizon.add(m);return m;
  }
  for(let i=0;i<4;i++) {
    // These already use atmospheric haze colors and sit beyond the local
    // walking scene's fog range; applying that fog erases the entire basin.
    instance(box,flat({color:cityColors[i],fog:false}),city[i],'Kyoto basin buildings');
    instance(roof,flat({color:[0xa6b7b0,0xb5c1b8,0xa7b9b3,0xb9c5be][i],fog:false}),roofs[i],'Layered distant tile roofs');
  }
  let current='morning',season='spring';
  function setTime(mode) {
    const key=typeof mode==='number'?['morning','sunset','blue'][mode%3]:mode;
    const palette=modes[key]??day;current=key;
    skyMaterial.uniforms.uTop.value.set(palette.top);skyMaterial.uniforms.uMid.value.set(palette.mid);skyMaterial.uniforms.uHaze.value.set(palette.haze);
    if(season==='autumn'&&key!=='blue')skyMaterial.uniforms.uHaze.value.lerp(new THREE.Color(0xf8d8ad),.22);
  }
  function setSeason(value='spring'){season=value==='autumn'?'autumn':'spring';setTime(current);}
  return {dome,clouds,horizon,setTime,setSeason,update(camera,timeOfDay) {
    if(camera){dome.position.copy(camera.position);clouds.position.copy(camera.position).setY(camera.position.y*.45);}
    if(timeOfDay!==undefined&&timeOfDay!==current)setTime(timeOfDay);
  }};
}
