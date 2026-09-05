import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Batch,basic,rng} from './art';
import {streetHeight,groundHeight} from './site';
import {trafficState,trafficMotion,pedestrianCrossingMotion,type TrafficRoute} from './signals';
export async function buildActivity(colliders:Array<{minX:number,maxX:number,minZ:number,maxZ:number}>=[]){const group=new T.Group(),loader=new GLTFLoader();
const [peopleAsset,cableAsset]=await Promise.all([loader.loadAsync('/models/pedestrian.glb'),loader.loadAsync('/models/powell-cable-car.glb')]);
const source=peopleAsset.scene;source.updateMatrixWorld(true);const original:T.Mesh[]=[];source.traverse(o=>{if(o instanceof T.Mesh)original.push(o);});const n=22;const walkers:Array<{root:T.Group,parts:T.Mesh[],limbs:T.Object3D[],path:T.Vector2[],phase:number,speed:number}>=[];
const routes=[
 [[-10,-4],[-10,4],[10,4],[10,-4]],
 [[-59,-29],[-59,29],[-44,29],[-44,-29]],
 [[59,29],[59,-29],[44,-29],[44,29]],
 [[-62,27.5],[-7,27.5],[-7,39.5],[-62,39.5]],
 [[7,27.5],[62,27.5],[62,39.5],[7,39.5]],
 [[-62,-39.5],[-7,-39.5],[-7,-25],[-42,-25],[-42,-27],[-62,-27]],
 [[62,-39.5],[7,-39.5],[7,-25],[42,-25],[42,-27],[62,-27]],
];
const pathLengths=routes.map(route=>route.reduce((sum,p,i)=>sum+Math.hypot(p[0]-route[(i+1)%route.length][0],p[1]-route[(i+1)%route.length][1]),0));
let routeSamples=0;const blockedSamples:Array<{route:number,x:number,z:number}>=[];
for(let ri=0;ri<routes.length;ri++)for(let j=0;j<routes[ri].length;j++){const a=routes[ri][j],b=routes[ri][(j+1)%routes[ri].length],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.2);for(let k=0;k<=steps;k++){const x=a[0]+(b[0]-a[0])*k/steps,z=a[1]+(b[1]-a[1])*k/steps;routeSamples++;if(colliders.some(c=>x+.26>c.minX&&x-.26<c.maxX&&z+.26>c.minZ&&z-.26<c.maxZ))blockedSamples.push({route:ri,x,z});}}
group.userData.routeValidation={samples:routeSamples,blocked:blockedSamples.slice(0,20),blockedCount:blockedSamples.length};
if(blockedSamples.length)console.warn('Pedestrian route needs correction',JSON.stringify(group.userData.routeValidation));

for(let i=0;i<n;i++){const root=source.clone(true);const parts:T.Mesh[]=[];root.traverse(o=>{if(o instanceof T.Mesh)parts.push(o);});const limbs=['LegL','LegR','ArmL','ArmR'].map(name=>root.getObjectByName(name)!);const rr=rng('walker'+i);root.scale.setScalar(.92+rr()*.13);walkers.push({root,parts,limbs,path:routes[i%routes.length].map(p=>new T.Vector2(...p)),phase:(Math.floor(i/routes.length)/Math.ceil((n-i%routes.length)/routes.length))*pathLengths[i%routes.length],speed:.9+(i%routes.length)*.037});}
const instances=original.map((o,j)=>{const clothing=o.name.includes('Torso')||o.name.includes('Sleeve');let material=o.material;if(clothing){material=(o.material as T.MeshStandardMaterial).clone();(material as T.MeshStandardMaterial).color.set(0xffffff);}const inst=new T.InstancedMesh(o.geometry,material,n);inst.castShadow=true;inst.receiveShadow=true;inst.name='Animated '+o.name;inst.instanceMatrix.setUsage(T.DynamicDrawUsage);for(let i=0;i<n;i++){const c=new T.Color(0xffffff);if(clothing)c.set([0x4f6776,0x9a664d,0xa8a294,0x40484b,0x7b8b73,0xc6bba8][i%6]);inst.setColorAt(i,c);}group.add(inst);return inst;});
function pathPose(points:T.Vector2[],distance:number){let total=0;const lengths=points.map((p,i)=>p.distanceTo(points[(i+1)%points.length]));lengths.forEach(x=>total+=x);let d=distance%total;for(let i=0;i<points.length;i++){if(d<=lengths[i]){const a=points[i],b=points[(i+1)%points.length],p=a.clone().lerp(b,d/lengths[i]);return{x:p.x,z:p.y,yaw:Math.atan2(b.x-a.x,b.y-a.y)};}d-=lengths[i];}return{x:0,z:10,yaw:0};}
const cable=cableAsset.scene;cable.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});cable.name='Powell–Hyde cable car';group.add(cable);
function car(color:number,family='sedan'){const b=new Batch(),paint=basic(color,.31,.32),glass=basic(0x364e57,.17,.45),chrome=basic(0x9da6a3,.22,.85),rubber=basic(0x222624,.97),lamp=basic(0xece9c6,.27),tail=basic(0x9b2722,.36);b.box(paint,0,.61,0,1.85,.46,4.3);b.box(paint,0,.93,.1,1.79,.24,3.7);b.box(glass,0,1.22,.14,1.55,.5,2.12);b.box(paint,0,1.5,.15,1.59,.09,2.06);
 for(const x of [-.80,.80]){b.box(paint,x,1.25,.13,.065,.48,.075);for(const z of [-1.8,1.83])b.box(z<0?lamp:tail,x*.72,.78,z,.52,.17,.10);for(const z of [-1.24,1.28]){b.add(new T.CylinderGeometry(.34,.34,.23,20),rubber,[x*1.06,.38,z],[1,1,1],new T.Euler(0,0,Math.PI/2));b.add(new T.CylinderGeometry(.21,.21,.241,12),chrome,[x*1.06,.38,z],[1,1,1],new T.Euler(0,0,Math.PI/2));}}
 b.box(chrome,0,.56,-2.17,1.48,.075,.055);b.box(chrome,0,.57,2.17,1.48,.075,.055);
 if(family==='crossover'){b.box(paint,0,1.1,.72,1.82,.25,1.6);b.box(glass,0,1.42,.48,1.60,.62,2.4);b.box(paint,0,1.76,.48,1.66,.1,2.52);for(const x of [-.57,.57])b.box(chrome,x,1.84,.42,.06,.065,2.3);}
 if(family==='taxi'){b.box(paint,0,1.57,.25,.68,.19,.32);b.box(lamp,0,1.69,.25,.62,.055,.26);for(const x of [-.945,.945])for(let z=-.55;z<1.3;z+=.18)b.box(Math.round(z*100)%2?rubber:chrome,x,.83,z,.025,.08,.09);}
 if(family==='delivery'){b.box(paint,0,1.42,.69,1.86,1.35,2.52);b.box(paint,0,2.1,.7,1.89,.12,2.58);b.box(chrome,0,1.44,1.971,.045,1.12,.025);for(const x of [-.32,.32])b.box(rubber,x,1.38,2.005,.18,.06,.035);}
 const result=b.finish();result.name=`Original ${family}`;result.userData.family=family;return result;}
const cars=Array.from({length:9},(_,i)=>{const family=['sedan','crossover','taxi','sedan','delivery','crossover','sedan','taxi','delivery'][i];const g=car(family==='taxi'?0xcba33b:[0xdddcd3,0x687781,0xbbb7a8,0x383d42,0x8b3b31][i%5],family);group.add(g);return g;});
const trafficRoutes:TrafficRoute[]=cars.map((_,i)=>({axis:i<6?'eastWest':'northSouth',direction:i<3?1:i<6?-1:1,queue:i%3,speed:8}));
const cableRoute:TrafficRoute={axis:'northSouth',direction:-1,queue:0,speed:5,cable:true};
// Small original pigeon silhouette: breast, neck, beak, folded wings and tail.
const birdBatch=new Batch(),feather=basic(0x6c7478,.96),wing=basic(0x414b52,.94),iridescent=basic(0x455d58,.58,.15),beak=basic(0x65594a,.9),foot=basic(0x986b61,.92),eye=basic(0x141a1b,.45);
birdBatch.add(new T.SphereGeometry(1,10,7),feather,[0,.20,0],[.105,.13,.19]);birdBatch.add(new T.SphereGeometry(1,8,6),iridescent,[0,.33,-.11],[.059,.105,.063]);birdBatch.add(new T.SphereGeometry(1,8,6),feather,[0,.42,-.145],[.064,.062,.065]);birdBatch.add(new T.ConeGeometry(.022,.08,6),beak,[0,.413,-.23],[1,1,1],new T.Euler(-Math.PI/2,0,0));
for(const x of [-.095,.095]){birdBatch.add(new T.SphereGeometry(1,8,5),wing,[x,.22,.04],[.026,.095,.15]);birdBatch.add(new T.SphereGeometry(.01,6,4),eye,[x*.62,.433,-.17]);birdBatch.box(foot,x*.5,.052,.012,.012,.105,.014);birdBatch.box(foot,x*.5,.014,-.018,.015,.013,.072);}
birdBatch.box(wing,0,.18,.19,.075,.035,.16);const birdTemplate=birdBatch.finish(),birdMeshes:T.Mesh[]=[];birdTemplate.traverse(o=>{if(o instanceof T.Mesh)birdMeshes.push(o);});const birdCount=14;
const birdInstances=birdMeshes.map(m=>{const mesh=new T.InstancedMesh(m.geometry,m.material,birdCount);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Original plaza pigeons';group.add(mesh);return mesh;});
const birdPose=new T.Object3D();const birdCenters=Array.from({length:birdCount},(_,i)=>({x:(i%2?-1:1)*(17+(i%4)*1.7),z:-11+Math.floor(i/4)*2.2}));
group.userData.trafficSchedule={period:120,greenEastWest:[0,42],greenNorthSouth:[60,102],allRed:[[46,60],[106,120]],routes:trafficRoutes,cableRoute,model:'coordinated analytic queues, not surveyed signal timings'};
group.userData.sampleTraffic=(time:number)=>({signals:trafficState(time),cars:trafficRoutes.map(r=>trafficMotion(time,r)),cable:trafficMotion(time,cableRoute),crossingPedestrians:[pedestrianCrossingMotion(time,0),pedestrianCrossingMotion(time,1)]});

const phonePose=new T.Object3D(),phones=new T.InstancedMesh(new T.BoxGeometry(.074,.135,.014),basic(0x20272a,.3,.35),n);phones.name='Original pedestrian camera phones';group.add(phones);
function update(t:number,_dt:number){
const pausePhase=((t%48)+48)%48,walkTime=Math.floor(t/48)*38+Math.min(pausePhase,38);
walkers.forEach((w,i)=>{
 const seated=i>=18,p=pathPose(w.path,walkTime*w.speed+w.phase),paused=pausePhase>=38,photograph=paused&&i%2===0;
 if(seated){const x=[-30,-20,20,30][i-18],z=28.7;w.root.position.set(x,groundHeight(x,z)+.52-.91*w.root.scale.y,z);w.root.rotation.y=Math.PI;w.limbs.forEach((o,j)=>o.rotation.x=j<2?Math.PI/3:-.48);w.root.userData.behavior='seated';}
 else{w.root.position.set(p.x,groundHeight(p.x,p.z),p.z);w.root.rotation.y=p.yaw+Math.PI;const a=paused?0:Math.sin(walkTime*w.speed*5.7+i)*.42;w.limbs.forEach((o,j)=>{o.rotation.x=photograph&&j>1?-1.28:a*(j%2===0?1:-1)*(j>1?.7:1);});w.root.userData.behavior=photograph?'photographing':paused?'waiting':'walking';}
 if(i===16||i===17){const cross=pedestrianCrossingMotion(t,i-16);w.root.position.set(cross.x,groundHeight(cross.x,cross.z),cross.z);w.root.rotation.y=cross.yaw+Math.PI;const swing=cross.walking?Math.sin(t*5.9+i)*.4:0;w.limbs.forEach((o,j)=>o.rotation.x=swing*(j%2===0?1:-1)*(j>1?.7:1));w.root.userData.behavior=cross.walking?'crossing':'waiting';}
 const usingPhone=seated||(photograph&&i<16),forward=w.root.rotation.y-Math.PI;phonePose.position.set(w.root.position.x+Math.sin(forward)*.46,w.root.position.y+(seated?1.30:1.26)*w.root.scale.y,w.root.position.z+Math.cos(forward)*.46);phonePose.rotation.set(0,w.root.rotation.y,0);phonePose.scale.setScalar(usingPhone?1:.001);phonePose.updateMatrix();phones.setMatrixAt(i,phonePose.matrix);
 w.root.updateMatrixWorld(true);w.parts.forEach((m,j)=>instances[j].setMatrixAt(i,m.matrixWorld));
});phones.instanceMatrix.needsUpdate=true;phones.computeBoundingSphere();instances.forEach(o=>{o.instanceMatrix.needsUpdate=true;o.computeBoundingSphere();});
const cableMotion=trafficMotion(t,cableRoute),cz=cableMotion.coordinate;cable.position.set(-71,streetHeight(-71,cz),cz);cable.rotation.set(.032,Math.PI,0);cable.userData.motion=cableMotion;
cars.forEach((c,i)=>{const motion=trafficMotion(t,trafficRoutes[i]),d=motion.coordinate;let x:number,z:number;if(i<3){x=d;z=-55;c.rotation.y=-Math.PI/2;}else if(i<6){x=d;z=49;c.rotation.y=Math.PI/2;}else{x=73;z=d;c.rotation.y=Math.PI;}c.position.set(x,streetHeight(x,z),z);c.userData.motion=motion;});
birdCenters.forEach((center,i)=>{const phase=t*.24+i*1.83,hopPhase=((t+i*2.1)%23+23)%23,hop=hopPhase<.65?Math.sin(hopPhase/.65*Math.PI)*.23:0;const x=center.x+Math.sin(phase)*.7,z=center.z+Math.cos(phase)*.55;birdPose.position.set(x,groundHeight(x,z)+hop,z);birdPose.rotation.set(hopPhase>18?Math.sin(t*4+i)*.12:0,Math.atan2(Math.cos(phase)*.7,-Math.sin(phase)*.55)+Math.PI,0);birdPose.scale.setScalar(.88+(i%4)*.075);birdPose.updateMatrix();birdInstances.forEach(m=>m.setMatrixAt(i,birdPose.matrix));});birdInstances.forEach(m=>{m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();});
group.userData.behaviors={walking:walkers.filter(w=>w.root.userData.behavior==='walking').length,waiting:walkers.filter(w=>w.root.userData.behavior==='waiting').length,photographing:walkers.filter(w=>w.root.userData.behavior==='photographing').length,seated:4,crossing:walkers.filter(w=>w.root.userData.behavior==='crossing').length,pigeons:birdCount};group.userData.signals=trafficState(t);
}
update(0,0);return{group,update};}
