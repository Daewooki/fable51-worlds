import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function rng(name:string){let s=240514;for(const c of name)s=Math.imul(s^c.charCodeAt(0),16777619);return()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function surface(name:string,color:number,scale=1,roughness=.8){
const r=rng(name),canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d')!;const co=new T.Color(color);const im=c.createImageData(256,256);
for(let y=0;y<256;y++)for(let x=0;x<256;x++){let v=1+(r()-.5)*.14+.028*Math.sin(x*.13)*Math.sin(y*.11);const i=(y*256+x)*4;im.data[i]=Math.min(255,co.r*255*v);im.data[i+1]=Math.min(255,co.g*255*v);im.data[i+2]=Math.min(255,co.b*255*v);im.data[i+3]=255;}c.putImageData(im,0,0);
const map=new T.CanvasTexture(canvas);map.colorSpace=T.LinearSRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(scale,scale);map.anisotropy=8;
const m=new T.MeshStandardMaterial({map,color:0xffffff,roughness});m.name=name;return m;
}
export class Batch{
 group=new T.Group(); bins=new Map<T.Material,T.BufferGeometry[]>();
 add(g:T.BufferGeometry,m:T.Material,p:T.Vector3|number[]=[0,0,0],s:number[]=[1,1,1],rot:T.Euler=new T.Euler()){
 const v=Array.isArray(p)?new T.Vector3(...p):p;const mat=new T.Matrix4().compose(v,new T.Quaternion().setFromEuler(rot),new T.Vector3(...s));g=g.clone().applyMatrix4(mat);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));g.deleteAttribute('uv1');g.deleteAttribute('tangent');
 if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
 const a=this.bins.get(m)||[];a.push(g);this.bins.set(m,a);
 }
 box(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,rot=0){this.add(new T.BoxGeometry(1,1,1),m,[x,y,z],[w,h,d],new T.Euler(0,rot,0));}
 cyl(m:T.Material,x:number,y:number,z:number,r:number,h:number,rt=r,n=16){this.add(new T.CylinderGeometry(rt,r,h,n),m,[x,y,z]);}
 rod(m:T.Material,a:T.Vector3,b:T.Vector3,r:number,rt=r){const g=new T.CylinderGeometry(rt,r,a.distanceTo(b),7);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));this.add(g,m,a.clone().add(b).multiplyScalar(.5));}
 finish(){for(const [m,gs]of this.bins){const merged=mergeGeometries(gs);merged.userData.rootBatch=true;const mesh=new T.Mesh(merged,m);mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);gs.forEach(g=>g.dispose());}return this.group;}
}
export const basic=(c:number,r=.7,metalness=0)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness});
export function label(text:string,w:number,h:number,bg:string,fg:string,size=60){const ca=document.createElement('canvas');ca.width=1024;ca.height=Math.round(1024*h/w);const c=ca.getContext('2d')!;c.fillStyle=bg;c.fillRect(0,0,ca.width,ca.height);c.fillStyle=fg;c.font=`500 ${size}px Arial`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,512,ca.height/2,980);const tx=new T.CanvasTexture(ca);tx.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:tx,roughness:.6,side:T.FrontSide}));return mesh;}
