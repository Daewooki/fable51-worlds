import * as T from 'three';
import {Batch,basic,rng,surface} from './art';
// Original site-specific grammar. Method prior: ez-tree pinned source: grow a
// deterministic tapered skeleton first; all leaves attach to terminal branches.
export function makeVegetation(){
const bark=surface('weathered bark',0x71675a,2,.96), palmBark=surface('palm trunk scars',0x786f5d,3,.96);
const greens=[0x3f542a,0x526532,0x5e713a,0x6b7d41,0x485f30].map(c=>basic(c,.87));greens.forEach(m=>m.side=T.DoubleSide);
const palms=[0x415525,0x586830,0x71803e,0x6d773c].map(c=>basic(c,.85));palms.forEach(m=>m.side=T.DoubleSide);
// Original leaf vein/lamina relief texture; physically small detail, not a canopy image.
const lc=document.createElement('canvas');lc.width=128;lc.height=256;const ctx=lc.getContext('2d')!;ctx.fillStyle='#999999';ctx.fillRect(0,0,128,256);ctx.strokeStyle='#d5d5d5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(64,0);ctx.lineTo(64,256);ctx.stroke();for(let y=22;y<245;y+=28){ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(64,y);ctx.lineTo(11,y+25);ctx.moveTo(64,y);ctx.lineTo(117,y+25);ctx.stroke();}const vein=new T.CanvasTexture(lc);vein.anisotropy=4;greens.forEach(m=>{m.bumpMap=vein;m.bumpScale=.0025;m.roughness=.76;});
const leaf=new T.BufferGeometry();const lv=[0,.012,.095],luv=[.5,.5],li:number[]=[];const count=12;
for(let i=0;i<count;i++){const a=i/count*Math.PI*2;const z=.1+.1*Math.cos(a),x=.046*Math.sin(a)*(.85+.15*Math.cos(a));lv.push(x,.009*Math.sin(a)**2,z);luv.push(x/.1+.5,z/.2);li.push(0,1+i,1+(i+1)%count);}
leaf.setAttribute('position',new T.Float32BufferAttribute(lv,3));leaf.setAttribute('uv',new T.Float32BufferAttribute(luv,2));leaf.setIndex(li);leaf.computeVertexNormals();

function tree(id:string,height=8){const r=rng(id),b=new Batch();type Branch={a:T.Vector3,b:T.Vector3,r:number,level:number};const skeleton:Branch[]=[];
function grow(a:T.Vector3,dir:T.Vector3,len:number,rad:number,level:number){const end=a.clone().addScaledVector(dir,len);skeleton.push({a,b:end,r:rad,level});if(level<3){let count=level===0?9:5;for(let k=0;k<count;k++){const t=level===0?.42+.55*(k+r())/count:.3+.68*(k+r())/count;const p=a.clone().lerp(end,t);const angle=k*2.399+r()*.7;const d=new T.Vector3(Math.cos(angle)*(.65+r()*.25),.32+r()*.65,Math.sin(angle)*(.65+r()*.25)).normalize();grow(p,d,len*(level===0?.57:.5)*( .8+r()*.3),rad*.44,level+1);}}}
grow(new T.Vector3(),new T.Vector3(.015,1,.02),height*.7,.19+height*.013,0);
for(const s of skeleton){b.rod(bark,s.a,s.b,s.r,s.r*.37);if(s.level===3){const d=s.b.clone().sub(s.a);for(let k=0;k<64;k++){const t=(k+r())/64;const p=s.a.clone().addScaledVector(d,t);const a=k*2.399;const twig=p.clone().add(new T.Vector3(Math.cos(a)*.20,.08,Math.sin(a)*.20));b.rod(bark,p,twig,.007,.0018);const sz=.68+r()*.5;b.add(leaf,greens[k%greens.length],twig,[sz,sz,sz],new T.Euler(r()*1.8,r()*6.28,r()*.8));}}}
const g=b.finish();g.name=id;g.userData.kind='tree';g.userData.skeletonBranches=skeleton.length;return g;}
function palm(id:string,height=10){const r=rng(id),b=new Batch();b.cyl(palmBark,0,height/2,0,.43,height,.29,18);for(let i=0;i<height*9;i++){const y=i/9;b.cyl(palmBark,.016*Math.sin(y),y,0,.433-y/height*.13,.04,.43-y/height*.13,16);}
const crown=new Batch();
for(let row=0;row<11;row++)for(let j=0;j<12;j++){const a=j*Math.PI/6+(row%2)*Math.PI/12;const y=height-1.8+row*.15;const rad=.34+row*.014;crown.add(new T.BoxGeometry(.19,.23,.07),palmBark,[Math.sin(a)*rad,y,Math.cos(a)*rad],[1,1,1],new T.Euler(.15,a,Math.PI/4));}
crown.cyl(palmBark,0,height-.15,0,.57,.8,.43,12);
for(let j=0;j<58;j++){const angle=j*2.399+r()*.2;const len=3.6+r()*1.5;const lift=j<14?4.5:j<36?2.8:1.0;const pts:T.Vector3[]=[];
for(let i=0;i<=14;i++){const t=i/14;const reach=len*t;pts.push(new T.Vector3(Math.cos(angle)*reach,height+.25+lift*Math.sin(t*Math.PI*.64)-2.5*t*t,Math.sin(angle)*reach));}
for(let i=0;i<14;i++)crown.rod(palms[j%4],pts[i],pts[i+1],.038*(1-i/16),.02*(1-i/16));
for(let k=1;k<66;k++){const t=k/66;const ix=t*14;const p=pts[Math.floor(ix)].clone().lerp(pts[Math.min(14,Math.floor(ix)+1)],ix%1);const width=(1.0*Math.sin(t*Math.PI)**.7+.08)*(1-t*.2);
for(const side of [-1,1]){const out=new T.Vector3(Math.cos(angle+side*1.1),-.25,Math.sin(angle+side*1.1));const tip=p.clone().addScaledVector(out,width);tip.y-=.15;const mid=p.clone().lerp(tip,.45);mid.y+=.05;const cross=new T.Vector3(-Math.sin(angle)*.047,0,Math.cos(angle)*.047);const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute([...p.toArray(),...mid.clone().add(cross).toArray(),...tip.toArray(),...mid.clone().sub(cross).toArray()],3));geom.setIndex([0,1,2,0,2,3]);geom.computeVertexNormals();crown.add(geom,palms[(j+k)%4]);}
}}
const g=b.finish();g.add(crown.finish());g.name=id;g.userData.kind='palm';return g;}
function hedge(id:string,w:number,d:number,h=.7){const b=new Batch(),r=rng(id);const stem=basic(0x514b35,.95);for(let x=-w/2+.15;x<w/2;x+=.3)for(let z=-d/2+.15;z<d/2;z+=.3){b.cyl(stem,x,h*.5,z,.008,h,.004,5);for(let j=0;j<65;j++){const a=j*2.4;const p=new T.Vector3(x+Math.cos(a)*r()*.23,.1+r()*h,z+Math.sin(a)*r()*.23);b.rod(stem,new T.Vector3(x,p.y*.85,z),p,.003,.0008);b.add(leaf,greens[j%5],p,[.5,.5,.5],new T.Euler(r()*Math.PI,r()*6.28,0));}}
const g=b.finish();g.name=id;return g;}
return{tree,palm,hedge};}
