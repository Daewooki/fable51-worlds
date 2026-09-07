import * as THREE from 'three';
import { nearestPath, segments } from './route.js';
import { cel } from '../core/toon.js';

const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const smooth = (x) => { x=clamp(x,0,1); return x*x*(3-2*x); };
export const terraces = [];
/** A ground pad reshapes earth; a deck is a separate elevated walkable surface. */
export function addTerrace(x,z,w,d,y,kind='ground') { terraces.push({x,z,w,d,y,kind}); }

function routeHeight(p) {
  const stairs=p.branch===0&&[5,15,17,20].includes(p.index);
  if(stairs&&p.t>=1-1e-8)return p.b[2];
  return stairs ? p.a[2]+Math.floor((p.y-p.a[2]+1e-7)/.16)*.16 : p.y;
}

function baseHeight(x,z) {
  const p=nearestPath(x,z),road=routeHeight(p),distance=p.d-p.width/2;
  if(distance<3)return road;
  const blend=clamp((distance-3)/22,0,1);
  const base=Math.max(-.8,x*.042+z*.033+20/(1+Math.exp(-(x-266)/24)));
  const ridgeShape=1+.27*Math.sin(z*.017)+.11*Math.sin(z*.048+1.3);
  const hill=Math.max(0,x-322)*.28*ridgeShape+Math.max(0,z-330)*.035;
  // Gion is on Kyoto's basin floor. The southern foothills enter gradually
  // beyond Maruyama; lifting every block by the full east/south gradient made
  // context houses perch on artificial five-metre banks beside flat lanes.
  const plain=Math.max(-.8,x*.009+z*.006);
  const foothills=smooth((x-140)/90)*smooth((z-30)/120);
  const offRoad=plain+(base+hill-plain)*foothills;
  const raw=road*(1-blend)+offRoad*blend;
  // Outside the authored eastern hills, bury the finite terrain-mesh rim
  // beneath the distant painted ridge. A rising cut edge otherwise makes a
  // straight wall across the sky, especially from Shijo's eastward opening.
  const fringe=smooth((x-435)/75);
  return raw+(54-raw)*fringe;
}

function padHeight(x,z) {
  let y=baseHeight(x,z);
  for(const q of terraces) {
    if(q.kind==='deck')continue;
    const inside=Math.min(q.w/2-Math.abs(x-q.x),q.d/2-Math.abs(z-q.z));
    if(inside<=0)continue;
    // Blend INSIDE the last five metres of a pad: its footprint has no cliff.
    // Hero buildings remain level at the middle while entrances follow ramps.
    const weight=smooth(inside/Math.min(5,Math.min(q.w,q.d)*.35));
    y+=(q.y-y)*weight;
  }
  return y;
}

/** The visible earth, including the wooded ravine below the wooden stage. */
export function terrainAt(x,z) {
  let y=padHeight(x,z);
  const outsideX=Math.max(301-x,0,x-398),outsideZ=Math.max(296-z,0,z-358);
  const ravine=smooth(1-Math.hypot(outsideX,outsideZ)/15);
  if(ravine>0) {
    const floor=31.2+clamp((z-296)/62,0,1)*3.1+.35*Math.sin((x-323)*.18);
    y+=(Math.min(y,floor)-y)*ravine;
  }
  return y;
}

/** The only navigable-height query: earth, exact stair treads, bridge, or deck. */
export function heightAt(x,z) {
  for(let i=terraces.length-1;i>=0;i--) {
    const q=terraces[i];
    if(q.kind==='deck'&&Math.abs(x-q.x)<=q.w/2&&Math.abs(z-q.z)<=q.d/2)return q.y;
  }
  const p=nearestPath(x,z);
  // The final approach includes a short timber connection to the stage. Its
  // geometry is authored by the world builder; the ground remains below it.
  if(((p.branch===0&&p.index>=22)||p.branch===7)&&p.d<=p.width/2+.12)return routeHeight(p);
  return terrainAt(x,z);
}

export function makeTerrain() {
  const geo=new THREE.PlaneGeometry(720,660,240,220);geo.rotateX(-Math.PI/2);geo.translate(160,0,145);
  const p=geo.attributes.position,c=[],color=new THREE.Color();
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i);p.setY(i,terrainAt(x,z)-.10);
    const n=nearestPath(x,z);color.set(x>305?0x859a77:n.d<23?0xb6ad96:0x9ca88b);
    color.offsetHSL(0,0,Math.sin(x*.087)*Math.cos(z*.05)*.035);c.push(color.r,color.g,color.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,cel({color:0xffffff,vertexColors:true,bands:3}));
  m.receiveShadow=true;m.name='Authoritative ground beneath lanes and timber stage';m.userData.noBatch=true;return m;
}

export function makeRoads() {
  const group=new THREE.Group(),positions=[],colors=[],indices=[],gray=new THREE.Color();
  function crossSection(s,t,offset=0) {
    const dx=(s.b[0]-s.a[0])/s.length,dz=(s.b[1]-s.a[1])/s.length;
    const x=s.a[0]+dx*s.length*t,z=s.a[1]+dz*s.length*t,w=(s.a[3]+(s.b[3]-s.a[3])*t)/2;
    const q=clamp(t+offset,0,1),sampleX=s.a[0]+dx*s.length*q,sampleZ=s.a[1]+dz*s.length*q;
    const y=heightAt(sampleX,sampleZ)+.018;
    for(const side of[-1,1]) {
      positions.push(x-dz*w*side,y,z+dx*w*side);
      gray.set(x<142?0x9c9898:0xcac2ae);colors.push(gray.r,gray.g,gray.b);
    }
  }
  for(const s of segments) {
    if((s.branch===0&&s.index>=22)||s.branch===7)continue;
    const start=positions.length/3,steps=[0,1];
    const n=Math.ceil(s.length/.45);
    for(let i=1;i<n;i++)steps.push(i/n);
    const stair=s.branch===0&&[5,15,17,20].includes(s.index);
    const cuts=[];
    if(stair){for(let h=s.a[2]+.16;h<s.b[2]-1e-7;h+=.16)cuts.push((h-s.a[2])/(s.b[2]-s.a[2]));cuts.push(1);}
    steps.push(...cuts);steps.sort((a,b)=>a-b);
    let previous=-1;
    for(const t of steps) {
      if(Math.abs(t-previous)<1e-7)continue;previous=t;
      const cut=cuts.some(c=>Math.abs(c-t)<1e-7);
      // Coincident low/high cross-sections create a real vertical stone riser.
      if(cut)crossSection(s,t,-1e-6);
      crossSection(s,t,cut?1e-6:0);
    }
    const end=positions.length/3;
    for(let a=start;a<end-2;a+=2)indices.push(a,a+1,a+2,a+1,a+3,a+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const m=new THREE.Mesh(g,cel({color:0xffffff,bands:3,vertexColors:true,side:THREE.DoubleSide}));
  m.receiveShadow=true;m.userData.noBatch=true;m.name='Stone lanes and exact .16m risers';group.add(m);return group;
}
