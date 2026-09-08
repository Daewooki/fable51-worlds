import * as THREE from 'three';
import {cel,flat} from '../core/toon.js';
import {box,cyl,rngKit} from '../core/util.js';
import {makeMachiya} from './machiya.js';
import {makeYasakaShrine,makeStoneLantern} from './shrine.js';
import {makePagoda} from './pagoda.js';
import {buildContextTown} from './context.js';
import {buildDressing} from './dressing.js';
import {makeKiyomizuTemple,makeTempleGate} from './temple.js';
import {makeBicycle,makeVendingMachine,makeBench,makeCat,makePlanter,makeLantern} from './details.js';
import {makeTemplePlaque} from './signage.js';
import {heightAt,addTerrace,makeTerrain,makeRoads} from './terrain.js';
import {ROUTE,segments,nearestPath,districtAt,DISTRICTS} from './route.js';
import {buildStreetDetails,utilityPole} from './street.js';
import {buildVegetation} from './vegetation.js';
import {batchStatic} from './batching.js';

export function buildWorld(scene){
 const root=new THREE.Group();root.name='Kyoto · Gion to Kiyomizu';scene.add(root);const colliders=[],interactables=[],animated=[],plants=[],motions=[];let notify=()=>{};
 const stats={districts:DISTRICTS.length,buildings:0,shopfronts:0,landmarks:5,props:0,interactions:0};
 const ctx={add:o=>{root.add(o);return o;},collide:(x0,z0,x1,z1,top=100,bottom=-100)=>colliders.push({minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:bottom,maxY:top}),stats};
 function register(g){g.updateMatrixWorld(true);g.traverse(o=>{
 for(const i of o.userData.interactions||[]){const p=o.localToWorld(new THREE.Vector3(...i.position));if(interactables.some(r=>r.label===i.label&&r.position.distanceTo(p)<.05))continue;const record={...i,position:p,radius:i.radius||3.4,id:interactables.length};record.action=()=>{record.count=(record.count||0)+1;if(i.object){motions.push({object:i.object,t:0,kind:i.kind,original:i.object.position.clone()});}if(i.action)i.action();notify(record);};interactables.push(record);}
 for(const a of o.userData.animated||[]){if(a.object&&!animated.some(q=>q.object===a.object&&q.type===a.type)) animated.push({...a,base:a.object.rotation.clone(),basePos:a.object.position.clone()});}
 });
 for(const c of g.userData.colliders||[]){const corners=[];for(const x of[c.minX,c.maxX])for(const z of[c.minZ,c.maxZ])corners.push(g.localToWorld(new THREE.Vector3(x,c.minY||0,z)));colliders.push({minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minZ:Math.min(...corners.map(p=>p.z)),maxZ:Math.max(...corners.map(p=>p.z)),minY:g.position.y+(c.minY??0),maxY:g.position.y+(c.maxY??12)});}
 }
 function place(g,x,z,y=heightAt(x,z),rotation=0){g.position.set(x,y,z);g.rotation.y=rotation;ctx.add(g);register(g);return g;}
 function plant(x,z,type='sakura',scale=1,seed=0){plants.push({x,z,type,scale,seed:seed||plants.length*83+81});}
 // Level architectural precincts feed the same ground query used by the player.
 addTerrace(171,5,48,51,3.3);addTerrace(185,181,12,12,9.5);
 addTerrace(339,297,32,30,44,'deck');
 let terrain,roads;
 buildStreetDetails(ctx);
 const shrine=place(makeYasakaShrine(),149,5,3.3,-Math.PI/2);stats.buildings+=4;
 place(makePagoda({height:28}),185,182,9.5);stats.buildings++;
 const temple=place(makeKiyomizuTemple(),339,298,44);stats.buildings++;
 place(makeTempleGate(),295,279,38,-Math.PI/2);stats.buildings++;
 // Temple's vermilion three-storey pagoda beside the approach.
 place(makePagoda({height:19,levels:3,color:0xa35138}),313,294,heightAt(313,294));stats.buildings++;
 const rng=rngKit(51491),occupied=[];
 const roadSamples=[];for(const s of segments){for(let t=0;t<=1;t+=1/Math.ceil(s.length)){const px=s.a[0]+(s.b[0]-s.a[0])*t,pz=s.a[1]+(s.b[1]-s.a[1])*t,w=s.a[3]+(s.b[3]-s.a[3])*t,dx=(s.b[0]-s.a[0])/s.length,dz=(s.b[1]-s.a[1])/s.length;for(const side of[-.49,0,.49])roadSamples.push([px-dz*w*side,pz+dx*w*side]);}}
 function crossesRoad(x,z,w,d,ry){const c=Math.cos(ry),s=Math.sin(ry);return roadSamples.some(([px,pz])=>{if(Math.abs(px-x)>w+d||Math.abs(pz-z)>w+d)return false;const u=(px-x)*c-(pz-z)*s,v=(px-x)*s+(pz-z)*c;return Math.abs(u)<w/2+.16&&Math.abs(v)<d/2+.16;});}
 function blocked(x,z,r=0){return (x>140&&x<193&&z>-20&&z<34)||(Math.hypot(x-185,z-182)<10+r)||(x>283&&z>263)||(x>196&&x<227&&z>30&&z<64)||(x>180&&x<193&&z>103&&z<113);}
 const shopTypes=['tea','wagashi','pottery','incense','fans','kimono','crafts','souvenir','soba','tofu','coffee','confectionery','restaurant','matcha'];
 for(const s of segments){if(s.length<9)continue;const dx=(s.b[0]-s.a[0])/s.length,dz=(s.b[1]-s.a[1])/s.length;let count=0;
 for(let cursor=.7;cursor<s.length-4;){const width=rng.range(4.5,6.8),depth=rng.range(5.8,8),dist=cursor+width/2;cursor+=width+.24;if(dist+width/2>s.length-.6)break;const t=dist/s.length,rx=s.a[0]+dx*dist,rz=s.a[1]+dz*dist,roadW=s.a[3]+(s.b[3]-s.a[3])*t;
 for(const side of[-1,1]){let offset=roadW/2+depth/2+.5,x=rx-dz*offset*side,z=rz+dx*offset*side;
 if(blocked(x,z,1))continue;if(crossesRoad(x,z,width,depth,Math.atan2(dz*side,-dx*side)))continue;const np=nearestPath(x,z);if(np.d<roadW/2+depth*.29)continue;
 if(occupied.some(o=>Math.hypot(o.x-x,o.z-z)<(o.r+width)*.48))continue;
 const quiet=x>163&&x<214&&z>65&&z<145;
 if(quiet&&count%3!==0){continue;}
 const district=districtAt(rx,rz),seed=stats.buildings*71+528;
 const type=shopTypes[(stats.buildings*3+count)%shopTypes.length];
 const g=makeMachiya({width,depth,floors:2,seed,shopType:type,variant:stats.buildings%6,district:district.id,facadeType:quiet?'residence':'shop',noren:!quiet,timberTone:stats.buildings%4});
 g.name=`${district.name} · ${type} · ${stats.buildings}`;const y=heightAt(rx,rz);const foundation=box(width,.8,depth,cel({color:0x9c9584}),0,-.43,0);g.add(foundation);const ry=Math.atan2(dz*side,-dx*side);place(g,x,z,y,ry);
 const corners=[];for(const a of[-1,1])for(const b of[-1,1])corners.push(new THREE.Vector3(a*(width/2-.05),0,b*(depth/2-.3)).applyAxisAngle(new THREE.Vector3(0,1,0),ry).add(new THREE.Vector3(x,0,z)));
 // Conservative rectangular shell collision preserves street width at bends.
 ctx.collide(Math.min(...corners.map(p=>p.x)),Math.min(...corners.map(p=>p.z)),Math.max(...corners.map(p=>p.x)),Math.max(...corners.map(p=>p.z)),y+6,y-.5);
 stats.buildings++;if(g.userData.shop!==false)stats.shopfronts++;occupied.push({x,z,r:width});
 if(stats.buildings%5===0){plant(x-dz*side*(depth*.5+1.3),z+dx*side*(depth*.5+1.3),quiet?'maple':'shrub',quiet?.55:.32);}
 }
 count++;
 }
 }
 // Garden walls pace the quieter middle passage. Tile caps, buttresses, stone feet.
 const plaster=cel({color:0xd4c9ae}),stone=cel({color:0x9e9e8e}),timber=cel({color:0x71634e}),tile=cel({color:0x68746d});
 for(const side of[-1,1])for(let z=64;z<142;z+=3.1){if(side===-1&&(Math.abs(z-100)<4||Math.abs(z-115)<4))continue;let x=201+side*5.1,y=heightAt(x,z);const g=new THREE.Group();g.add(box(.38,1.15,3.1,stone,x,y+.57,z),box(.34,1.35,3.1,plaster,x,y+1.72,z),box(.58,.15,3.2,tile,x,y+2.44,z));for(let k=-1;k<=1;k++)g.add(box(.012,.015,3.06,timber,x-side*.202,y+.23+k*.26,z));ctx.add(g);ctx.collide(x-.25,z-1.55,x+.25,z+1.55,y+2.5,y);if(Math.floor(z)%3===0)plant(x+side*3,z,side===1?'bamboo':'maple',side===1?.8:.65);}
 // Architectural retaining stone behind the pagoda and beside ascending lanes.
 for(let z=199;z<249;z+=1.6){let p=nearestPath(230,z);const x=p.x+6.8,y=heightAt(p.x,p.z);ctx.add(box(.7,1.3,1.57,stone,x,y-.4,z));}
 // A sequence of deliberately framed blossom trees; no random trees in streets.
 const treePlaces=[[-8,-8,1.05],[12,8,.75],[42,-9,.8],[61,68,.78],[87,64,.85],[101,42,.7],[129,-8,.8],[145,-12,1.05],[144,21,.9],[161,-17,1.1],[185,-14,1.05],[194,22,1.1],[197,37,1.08],[218,43,1.2],[222,56,.8],[188,60,.75],[191,144,.85],[212,153,.65],[235,165,.95],[235,184,1.05],[214,168,.75],[237,205,.84],[213,210,.68],[237,237,.9],[216,253,.75],[255,248,.8],[268,278,.9],[286,262,1],[304,267,1],[288,294,1.1],[317,316,.8],[361,317,.85]];
 for(const[x,z,s]of treePlaces)plant(x,z,'sakura',s);
 for(let i=0;i<280;i++){const x=rng.range(297,432),z=rng.range(225,398);if(nearestPath(x,z).d<13||((x>320&&x<358)&&(z>275&&z<317)))continue;plant(x,z,['cedar','pine','maple','sakura'][i%8===0?3:i%3],rng.range(.6,1.4));}
 // Cedar compartments and broadleaf understory hold the eastern temple bank.
 for(let x=362;x<407;x+=3.5)for(let z=274;z<319;z+=3.5){
  const px=x+rng.range(-1.35,1.35),pz=z+rng.range(-1.35,1.35);
  // Keep the Okuno-in-side sightline open, while forest surrounds the stage.
  if(pz>312&&Math.abs((px-339)*34-(pz-299)*32)/46.7<5.5)continue;
  plant(px,pz,(x>390&&rng.next()<.5)?'cedar':rng.next()<.82?'maple':'pine',rng.range(.93,1.55));
 }
 for(let i=0;i<180;i++){
  const x=rng.range(357.8,409),z=rng.range(278,335);
  if(z>312&&Math.abs((x-339)*34-(z-299)*32)/46.7<5.5)continue;
  plant(x,z,i%5===0?'maple':'shrub',i%5===0?rng.range(.75,1.1):rng.range(1.65,3.0));
 }
 // The southern temple woods frame the westward city view below eye level.
 // They occupy hillside ground, away from the commercial approach and deck.
 for(let i=0;i<155;i++){
  const x=rng.range(229,317),z=rng.range(294,377);
  if(nearestPath(x,z).d<11)continue;
  plant(x,z,i%9===0?'sakura':i%7===0?'cedar':i%4===0?'pine':'maple',rng.range(1.05,1.62));
 }
 // Context-specific modern traces and quiet discoveries.
 for(const[x,z,ry]of[[62,15,.2],[105.5,53.3,0],[187,107,1.8],[220,182,1.7],[232,221,1.5]]){place(makeBicycle(),x,z,heightAt(x,z),ry);stats.props++;}
 for(const[x,z,ry]of[[37,-6,Math.PI],[112,35,Math.PI/2],[269,270.4,Math.PI]]){place(makeVendingMachine(),x,z,heightAt(x,z),ry);stats.props++;}
 for(const[x,z,ry]of[[188,39,0],[210,64,1.6],[198,133,1.6],[343,311,0]]){place(makeBench(),x,z,heightAt(x,z),ry);stats.props++;}
 place(makeCat(),80,59,heightAt(80,59),-.8);place(makeCat({color:0xc2a080}),222,170,heightAt(222,170),1.4);
 const polePos=[[11,-5.3],[48,-5.3],[75,17],[75,49],[119,37],[131,-5.7]];polePos.forEach(([x,z],i)=>utilityPole(ctx,x,z,i+1<polePos.length?{x:polePos[i+1][0],z:polePos[i+1][1]}:null));
 // A delivery kei truck waits in a shop's service bay in Gion.
 const truck=new THREE.Group(),body=cel({color:0xc9c5af}),glass=flat({color:0x687e7a}),rubber=cel({color:0x494d48});truck.add(box(1.5,.24,3.2,body,0,.57,0),box(1.48,1.13,1.13,body,0,1.19,1.02),box(1.25,.58,.025,glass,0,1.45,1.6),box(1.48,.36,1.87,body,0,.85,-.47));for(const x of[-.78,.78])for(const z of[-1.03,1.05]){let w=cyl(.3,.3,.16,12,rubber,x,.32,z);w.rotation.z=Math.PI/2;truck.add(w);}place(truck,29,-10,heightAt(29,-10),Math.PI/2);stats.props++;
 // Planked approaches share the route-height query and bridge the ravine.
 for(const s of segments){if(!((s.branch===0&&s.index>=22)||s.branch===7))continue;const dx=(s.b[0]-s.a[0])/s.length,dz=(s.b[1]-s.a[1])/s.length,ry=Math.atan2(dx,dz);for(let d=.1;d<s.length;d+=.32){const t=d/s.length,x=s.a[0]+dx*d,z=s.a[1]+dz*d;if(x>=323&&x<=355&&z>=282&&z<=312)continue;const y=heightAt(x,z),w=s.a[3]+(s.b[3]-s.a[3])*t;const b=box(w,.14,.305,timber,x,y-.065,z);b.rotation.y=ry;ctx.add(b);if(Math.round(d*10)%32<3){for(const side of[-1,1])ctx.add(box(.18,2.7,.18,timber,x-dz*(w/2-.25)*side,y-1.4,z+dx*(w/2-.25)*side));}}}
 // A physical interpretive plaque, no floating marker.
 const plaque=new THREE.Group();plaque.add(box(.08,1.3,.08,timber,0,.65,0),box(1.1,.56,.08,timber,0,1.4,0));const face=new THREE.Mesh(new THREE.PlaneGeometry(.99,.46),flat({map:makeTemplePlaque('東山の眺め'),side:THREE.DoubleSide}));face.position.set(0,1.4,.05);plaque.add(face);plaque.userData.interactions=[{position:[0,1.3,.7],label:'Look back over Kyoto',text:'The town settles into its basin below. Lantern streets, stone steps, temple roofs. The whole walk is somewhere in that soft afternoon haze.',kind:'overlook'}];place(plaque,349,311,44,Math.PI);
 ctx.plant=plant;ctx.register=register;buildDressing(ctx,heightAt);
 terrain=makeTerrain();scene.add(terrain);roads=makeRoads();scene.add(roads);
 const context=buildContextTown(occupied,plants);ctx.add(context.group);stats.contextBuildings=context.count;
 // Count complete placed prop assemblies before their meshes are merged.
 // A pottery shelf counts once, not once per bowl or geometry primitive.
 const propNames=new Set(['paper-lantern','handwritten-menu','city-bicycle','shop-display','quiet-tea-vending-machine','timber-bench','sleepy-lane-cat','doorstep-plant','garden-tsukubai','bamboo-garden-screen']);
 stats.propAssemblies={};root.traverse(o=>{if(propNames.has(o.name))stats.propAssemblies[o.name]=(stats.propAssemblies[o.name]||0)+1;});
 stats.standaloneDetailPlacements=stats.props;stats.props=Object.values(stats.propAssemblies).reduce((a,b)=>a+b,0)+2; // delivery truck and overlook plaque
 const batchStats=batchStatic(root);Object.assign(stats,batchStats);const vegetation=buildVegetation(scene,plants,heightAt);stats.vegetation=vegetation.stats;stats.interactions=interactables.length;
 return {root,heightAt,colliders,interactables,stats,plants,bounds:{minX:-60,maxX:430,minZ:-50,maxZ:382},set onDiscovery(fn){notify=fn;},update(dt,camera,time){
 for(const a of animated){const wave=Math.sin(time*1.08+(a.phase||0));if(a.type==='lantern')a.object.rotation.z=a.base.z+wave*(a.amount||.027);else if(a.type==='noren')a.object.rotation.x=a.base.x+wave*.035;}
 for(let i=motions.length-1;i>=0;i--){let m=motions[i];m.t+=dt;m.object.position.y=m.original.y+Math.sin(Math.min(1,m.t/2)*Math.PI)*.12;if(m.t>2){m.object.position.copy(m.original);motions.splice(i,1);}}
 vegetation.update(dt,camera,time);
 },setSeason(season){vegetation.setSeason?.(season);},terrainMesh:terrain,roads};
}
