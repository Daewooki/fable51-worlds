import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {buildSite,groundHeight,streetHeight,SITE_VERSION} from './site';
import {buildArchitecture} from './architecture';
import {makeVegetation} from './vegetation';
import {buildActivity} from './activity';
import {buildFurnishings} from './furnishings';
import {buildAppleInterior} from './experience/apple';
import {buildNintendoInterior} from './experience/nintendo';
import {interiorGround,installInteriorLighting} from './experience/integration';
import type {Collider,InteractiveTarget} from './experience/types';
import {stores,GEO_REFERENCE,worldToGeo,geoToWorld} from './experience/stores';
export {groundHeight,streetHeight};
export async function buildWorld(){
 const group=new T.Group();group.name='Union Square · July–August 2025';group.userData.siteAuthority=SITE_VERSION;
 const site=buildSite();group.add(site.group);
 const architecture=buildArchitecture();group.add(architecture.group);
 const furniture=buildFurnishings(groundHeight);group.add(furniture.group);
 const interiors=[buildAppleInterior(),buildNintendoInterior()];for(const interior of interiors){installInteriorLighting(interior);group.add(interior.group);}
 const walkHeight=interiorGround(interiors,groundHeight);
 const colliders:Collider[]=[...interiors.flatMap(i=>i.colliders),...architecture.colliders,...furniture.colliders,{minX:-4.7,maxX:4.7,minZ:32,maxZ:42},{minX:-4.7,maxX:4.7,minZ:-42,maxZ:-32},{minX:-3.0,maxX:3.0,minZ:-3.0,maxZ:3.0}];
 const loader=new GLTFLoader();const landmark=await loader.loadAsync('/models/dewey-monument.glb');landmark.scene.name='Dewey Monument · original Blender MCP mesh';landmark.scene.position.y=2.415;landmark.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});group.add(landmark.scene);
 const retail=await loader.loadAsync('/models/retail-displays.glb');const nintendo=interiors.find(i=>i.id==='nintendo')!;
 for(const [source,anchor,scale]of [['DisplayMario','displayMario',.92],['DisplayLink','displayLink',.97],['DisplayPikmin','displayPikmin',1],['DisplayPikachu','displayPikachu',.88],['DisplayAnimalCrossing','displayAnimalCrossing',1.1]] as const){const figure=retail.scene.children.find(o=>o.name.startsWith(source));const slot=nintendo.group.getObjectByName(anchor);if(!figure||!slot)throw Error('Missing authored retail figure '+source);figure.scale.setScalar(scale);figure.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});slot.add(figure);}
 const targets:InteractiveTarget[]=interiors.flatMap(i=>i.targets);
 for(const store of stores)targets.push({id:'store-'+store.id,title:store.name,category:'Storefront',position:store.front.clone(),radius:Math.max(7,store.width*.5),action:()=>{group.userData.selectedStore=store.id;},description:()=>`${store.name} · ${store.address} · ${store.status}. ${store.notes}`});
 const nightLights:T.PointLight[]=[];for(const [x,z] of [[-60,-33],[60,-33],[-60,33],[60,33],[-40,0],[40,0],[-30,28],[30,28]]){const light=new T.PointLight(0xffd6a1,0,23,2);light.position.set(x,groundHeight(x,z)+5.1,z);light.name='Plaza lamp illumination';group.add(light);nightLights.push(light);}
 const vegetation=makeVegetation(),sway:T.Group[]=[];
 const plant=(o:T.Group,x:number,z:number,y=groundHeight(x,z))=>{o.position.set(x,y,z);o.userData.groundVersion=SITE_VERSION;group.add(o);sway.push(o);colliders.push({minX:x-.4,maxX:x+.4,minZ:z-.4,maxZ:z+.4});};
 const palms=[[-58,-32],[-54,-37],[-61,-23],[57,-31],[61,-23],[52,-36],[-57,32],[-61,25],[-53,37],[57,32],[61,25],[52,37]];
 for(let i=0;i<palms.length;i++){const [x,z]=palms[i];plant(vegetation.palm('Phoenix palm '+i,8.2+(i%3)*1.3),x,z);}
 for(const side of [-1,1])for(let i=0;i<5;i++){const x=side*(14+i*5.4),z=-32+(i%2)*3;plant(vegetation.tree('Northern deciduous '+side+' '+i,7.2+(i%3)*.7),x,z,3.56);}
 for(const side of [-1,1])for(let i=0;i<4;i++){const x=side*(15+i*6.6);plant(vegetation.tree('South ornamental '+side+' '+i,3.2+(i%2)*.4),x,20.8,2.61);}
 for(const bed of site.beds){if(bed.kind==='lawn'&&bed.z>0){for(const dx of [-bed.w/2+.65,bed.w/2-.65]){const shrub=vegetation.hedge('Clipped south shrub '+bed.x+' '+bed.z+' '+dx,1.0,.85,.45);shrub.position.set(bed.x+dx,bed.y,bed.z);group.add(shrub);}}if(bed.kind==='hedge'){const h=vegetation.hedge('Hedge strip '+bed.x,bed.w,bed.d,.55);h.position.set(bed.x,bed.y,bed.z);group.add(h);}
 // Raised planted areas are major obstacles; perimeter ramps and central stairs remain clear.
 colliders.push({minX:bed.x-bed.w/2-.15,maxX:bed.x+bed.w/2+.15,minZ:bed.z-bed.d/2-.15,maxZ:bed.z+bed.d/2+.15});}
 const activity=await buildActivity(colliders);group.add(activity.group);
 const bounds=new T.Box3();group.updateMatrixWorld(true);let nonFinite=0,meshCount=0;group.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))nonFinite++;if(o instanceof T.Mesh){meshCount++;o.geometry.computeBoundingBox();}});bounds.setFromObject(group);group.userData.invariants={nonFinite,meshCount,colliders:colliders.length,seed:240514,siteVersion:SITE_VERSION};if(nonFinite)throw Error('Non-finite world transform');
 group.userData.geography={reference:GEO_REFERENCE,worldToGeo,geoToWorld};
 group.userData.interiors=interiors.map(i=>({id:i.id,bounds:i.bounds,floorIds:i.floors.map(f=>f.id)}));
 let night=false;const viewer=new T.Vector3();
 return{group,groundHeight:walkHeight,colliders,targets,stores,reset:()=>interiors.forEach(i=>i.reset()),setLighting:(mode:string)=>{night=mode==='night';(furniture.group.userData.lampMaterial as T.MeshStandardMaterial).emissiveIntensity=night?3:0;interiors.forEach(i=>i.setLighting?.(mode));nightLights.forEach(l=>l.intensity=night?95:0);},updateViewer:(position:T.Vector3)=>{viewer.copy(position);for(const i of interiors)i.group.visible=i.bounds.distanceToPoint(position)<175;for(const l of nightLights)l.visible=night&&l.position.distanceToSquared(position)<180*180;},update:(t:number,dt:number)=>{activity.update(t,dt);site.update(t);interiors.forEach(i=>{if(i.group.visible)i.update(t,dt);});sway.forEach((o,i)=>{o.rotation.z=Math.sin(t*.55+i*2.39)*.0018;o.rotation.x=Math.cos(t*.42+i)*.0011;});}};
}
