import * as T from 'three';
import { Batch, basic, label } from './art';

type Collider={minX:number,maxX:number,minZ:number,maxZ:number};
/** Original modeled furnishings; all photographs remain research-only. */
export function buildFurnishings(groundHeight:(x:number,z:number)=>number):{group:T.Group,colliders:Collider[]}{
 const group=new T.Group();group.name='Plaza cafes, seating and metalwork';
 const b=new Batch(),colliders:Collider[]=[];
 const stone=basic(0xb1b0a4,.87),darkStone=basic(0x555d59,.8),frame=basic(0xbfc3b9,.38,.58),dark=basic(0x263d3c,.6,.35),roof=basic(0xaaa99a,.63,.35),blue=basic(0x2864a5,.85),yellow=basic(0xe5c249,.8),cream=basic(0xe9e2c9,.8),wood=basic(0x60452d,.84),inside=basic(0x323933,.87),rust=basic(0x795641,.56,.45),bronze=basic(0x707970,.32,.6),white=basic(0xe9e9d5,.4);
 roof.side=T.DoubleSide;
 const glass=new T.MeshStandardMaterial({color:0x9aaca3,roughness:.14,metalness:.18,transparent:true,opacity:.24,depthWrite:false,side:T.DoubleSide});
 const lampGlow=new T.MeshStandardMaterial({name:'Plaza lamp diffuser',color:0xe9e2c9,emissive:0xffd5a0,emissiveIntensity:0,roughness:.7});
 const globe=new T.MeshStandardMaterial({color:0xb2bbb6,roughness:.14,metalness:.82});globe.name='plaza-chrome-globes';
 const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
 const collider=(x:number,z:number,w:number,d:number)=>colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});
 const sign=(text:string,x:number,y:number,z:number,w:number,h:number,rotation=0,bg='#263c37',fg='#eee6ca')=>{const m=label(text,w,h,bg,fg,Math.min(72,90*h/w*8));m.position.set(x,y,z);m.rotation.y=rotation;group.add(m);return m;};
 const bar=(a:number[],c:number[],r=.045,m:T.Material=frame)=>b.rod(m,v(a[0],a[1],a[2]),v(c[0],c[1],c[2]),r);
 const sphere=(m:T.Material,x:number,y:number,z:number,r:number)=>b.add(new T.SphereGeometry(r,12,8),m,[x,y,z]);
 function roofPanel(points:T.Vector3[],material:T.Material){const positions:number[]=[];for(let i=1;i<points.length-1;i++)positions.push(...points[0].toArray(),...points[i].toArray(),...points[i+1].toArray());const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();b.add(g,material);g.dispose();}
 function kiosk(cx:number,cz:number,side:number){
  const gy=groundHeight(cx,cz),sx=(x:number)=>cx+x*side;
  const pt=(x:number,y:number,z:number)=>v(sx(x),gy+y,cz+z);
  b.box(stone,cx,gy+.18,cz,9.3,.36,12.3);collider(cx,cz,9.4,12.4);
  // Deep shell, counter, fascia, and alternating transparent fixed/door bays.
  b.box(stone,sx(-4.28),gy+1.64,cz,.44,2.95,12);
  for(const z of [-5.82,5.82])b.box(stone,cx,gy+.55,cz+z,9,.75,.35);
  b.box(inside,sx(-3.91),gy+1.65,cz,.05,2.55,11.3);
  b.box(wood,sx(2.75),gy+.83,cz,.95,1.18,9.7);b.box(darkStone,sx(2.65),gy+1.46,cz,1.2,.14,9.9);
  for(let z=-5.75;z<6;z+=1.92){b.box(frame,sx(4.12),gy+1.95,cz+z,.13,3.26,.13);b.box(frame,sx(-4.1),gy+2.05,cz+z,.14,3.45,.13);}
  for(let z=-4.8;z<6;z+=1.92)b.box(glass,sx(4.11),gy+1.8,cz+z,.025,2.6,1.78);
  for(const z of [-5.83,5.83]){for(let x=-3.1;x<4;x+=2.1){b.box(frame,sx(x),gy+1.9,cz+z,.11,2.9,.11);b.box(glass,sx(x+.92),gy+1.91,cz+z,1.8,2.42,.025);}b.box(frame,cx,gy+3.15,cz+z,9,.13,.12);}
  b.box(frame,sx(4.1),gy+3.19,cz,.17,.18,11.8);b.box(frame,sx(4.1),gy+.43,cz,.14,.11,11.8);
  for(const z of [-1.05,1.05])bar([sx(4.2),gy+1.18,cz+z],[sx(4.2),gy+1.72,cz+z],.028,dark);
  // Coffee equipment and crockery can be seen behind glazing.
  if(cx<0){b.box(frame,sx(1.65),gy+1.71,cz+2,1.1,.48,.65);b.box(dark,sx(1.98),gy+1.77,cz+2,.08,.27,.57);
  for(let i=0;i<7;i++)b.cyl(cream,sx(2.48),gy+1.57,cz-3.8+i*.33,.075,.17,.082,10);
  for(let i=0;i<4;i++){b.box(wood,sx(-3.6),gy+1.0+i*.45,cz,1,.06,8.7);for(let j=0;j<9;j++)b.cyl(i%2?cream:wood,sx(-3.32),gy+1.13+i*.45,cz-3.4+j*.79,.09,.2,.09,8);}
  }
  // Asymmetric thin folded roof with lateral overhang and visibly separate ribs.
  const outline=[pt(-5,3.73,-6.5),pt(4.8,3.36,-5.7),pt(5.35,3.34,4.85),pt(-4.3,3.73,6.55)];
  roofPanel(outline,roof);roofPanel([...outline].reverse().map(p=>p.clone().add(v(0,-.11,0))),roof);
  for(let i=0;i<4;i++){bar(outline[i].toArray(),outline[(i+1)%4].toArray(),.11,frame);}
  for(let z=-5.65;z<=5.55;z+=.45)bar(pt(-4.65,3.77,z).toArray(),pt(4.64,3.43,z).toArray(),.029,frame);
  // Open veranda lattice, distinct from the solid roof.
  for(let z=-5.6;z<=5.6;z+=.62)bar(pt(4.4,3.39,z).toArray(),pt(6.0,3.33,z).toArray(),.033,frame);
  bar(pt(6,3.33,-5.8).toArray(),pt(6,3.33,5.8).toArray(),.06,frame);
  for(const z of [-5.7,5.7]){b.cyl(frame,sx(5.85),gy+1.66,cz+z,.095,3.32);collider(sx(5.85),cz+z,.3,.3);}
  sign(cx<0?'b. PATISSERIE':'UNION SQUARE',sx(4.21),gy+2.73,cz,7.8,.55,side*Math.PI/2);
  sign(cx<0?'PASTRIES & COFFEE':'EAST PAVILION',cx,gy+2.7,cz+(side>0?-5.91:5.91),5.3,.42,side>0?Math.PI:0);
  sign(cx<0?'COFFEE  ·  PASTRIES':'CLOSED',sx(4.24),gy+1.96,cz-3.83,1.5,.34,side*Math.PI/2,'#c5bda4','#233e37');
 }
 kiosk(-51,8,1);kiosk(51,-8,-1);
 function canopy(cx:number,cz:number,flip:number){
  const gy=groundHeight(cx,cz),height=(z:number)=>gy+3.5+.09*z;
  const outline=[v(cx-4.1,height(-5.6),cz-5.6),v(cx+4.1,height(-5.6),cz-5.6),v(cx+3.35,height(5.6),cz+5.6),v(cx-3.35,height(5.6),cz+5.6)];roofPanel(outline,glass);
  for(let i=0;i<4;i++)bar(outline[i].toArray(),outline[(i+1)%4].toArray(),.105);
  for(const dx of [-3.55,3.55])for(const dz of [-4.9,4.9]){bar([cx+dx,gy,cz+dz],[cx+dx,height(dz),cz+dz],.105);b.box(stone,cx+dx,gy+.2,cz+dz,.48,.4,.48);collider(cx+dx,cz+dz,.5,.5);}
  for(let z=-5.3;z<5.5;z+=.64)bar([cx-3.8,height(z),cz+z],[cx+3.8,height(z),cz+z],.035);
  for(const x of [-2.8,-1.4,0,1.4,2.8])bar([cx+x,height(-5.6),cz-5.6],[cx+x,height(5.6),cz+5.6],.05);
  sign('UNION SQUARE GARAGE',cx,gy+2.85,cz+flip*5.55,6.4,.5,flip<0?Math.PI:0);
  for(const x of [-2.8,2.8]){bar([cx+x,gy+.95,cz-4.5],[cx+x,gy+.95,cz+4.5],.04);for(let z=-4.5;z<=4.5;z+=1.5)bar([cx+x,gy,cz+z],[cx+x,gy+.95,cz+z],.035);}
 }
 canopy(-49,-14,-1);canopy(49,12,1);
 // Raised north stage: curved steel ribs trace a shallow open arch.
 {const cz=-29,y=groundHeight(0,cz);for(let i=0;i<13;i++){const theta=-.88+i/12*1.76,x=Math.sin(theta)*8,z=cz-Math.cos(theta)*3;bar([x,y,z],[x,y+4.4,z],.045);if(i%3===0)bar([x,y,z],[x,y+4.4,z],.075);}
 for(const h of [2.8,3.45,4.4])for(let i=0;i<28;i++){const a=-.88+i/28*1.76,c=-.88+(i+1)/28*1.76;bar([Math.sin(a)*8,y+h,cz-Math.cos(a)*3],[Math.sin(c)*8,y+h,cz-Math.cos(c)*3],.05);}
 for(const x of [-6.1,6.1]){b.cyl(frame,x,y+2.18,cz-1.91,.095,4.36);collider(x,cz-1.91,.3,.3);}}
 function chair(cx:number,cz:number,angle:number){const y=groundHeight(cx,cz),tr=(x:number,h:number,z:number)=>v(cx+Math.cos(angle)*x+Math.sin(angle)*z,y+h,cz-Math.sin(angle)*x+Math.cos(angle)*z);
  for(let i=-2;i<=2;i++)b.add(new T.BoxGeometry(.48,.035,.066),blue,tr(0,.46,i*.083),[1,1,1],new T.Euler(0,angle,0));
  for(const x of [-.235,.235]){bar(tr(x,.03,-.28).toArray(),tr(x,.45,.18).toArray(),.017,dark);bar(tr(x,.03,.28).toArray(),tr(x,.87,-.19).toArray(),.017,dark);bar(tr(x,.56,-.19).toArray(),tr(x,.86,-.19).toArray(),.017,blue);}
  for(const h of [.62,.71,.80,.89])bar(tr(-.235,h,-.19).toArray(),tr(.235,h,-.19).toArray(),.018,blue);
  collider(cx,cz,.54,.54);
 }
 function table(x:number,z:number,index:number){const y=groundHeight(x,z);b.cyl(blue,x,y+.74,z,.59,.055,.59,28);b.cyl(dark,x,y+.38,z,.035,.7);for(let i=0;i<4;i++){const a=i*Math.PI/2;bar([x,y+.32,z],[x+Math.cos(a)*.47,y+.04,z+Math.sin(a)*.47],.025,dark);}collider(x,z,1.08,1.08);
  for(let i=0;i<3+(index%2);i++){const a=i*Math.PI*2/(3+index%2)+.2;chair(x+Math.sin(a)*1.05,z+Math.cos(a)*1.05,a+Math.PI);}
  if(index%3!==1){const m=index===3?yellow:blue,h=2.55,r=1.72;b.cyl(frame,x,y+h/2,z,.026,h);const top=v(x,y+h+.28,z);for(let i=0;i<8;i++){const a=i*Math.PI/4,c=(i+1)*Math.PI/4,p=v(x+Math.cos(a)*r,y+h-.14,z+Math.sin(a)*r),q=v(x+Math.cos(c)*r,y+h-.14,z+Math.sin(c)*r);roofPanel([top,p,q],m);roofPanel([q,p,top],m);bar(top.toArray(),p.clone().add(v(0,-.025,0)).toArray(),.012,frame);bar([x,y+h-.7,z],v(x+Math.cos(a)*r*.6,y+h-.04,z+Math.sin(a)*r*.6).toArray(),.013,frame);}sphere(frame,x,y+h+.33,z,.05);}
 }
 let ti=0;for(const x of [-28,-18,18,28])for(const z of [-7,7])table(x,z,ti++);
 function bench(x:number,z:number,angle=0){const y=groundHeight(x,z);for(const dx of [-1.15,1.15]){const px=x+Math.cos(angle)*dx,pz=z-Math.sin(angle)*dx;b.box(stone,px,y+.26,pz,.42,.52,.6,angle);collider(px,pz,.5,.65);}for(let i=0;i<6;i++)b.box(darkStone,x+Math.sin(angle)*(i-2.5)*.092,y+.52,z+Math.cos(angle)*(i-2.5)*.092,2.9,.1,.08,angle);collider(x,z,Math.abs(Math.cos(angle))*2.9+Math.abs(Math.sin(angle))*.6,Math.abs(Math.sin(angle))*2.9+Math.abs(Math.cos(angle))*.6);}
 for(const x of [-40.5,40.5])for(const z of [-17,17])bench(x,z,Math.PI/2);
 for(const x of [-30,-20,20,30])bench(x,28.7);
 function bin(x:number,z:number){const y=groundHeight(x,z);b.cyl(dark,x,y+.49,z,.29,.92,.29,16);b.cyl(frame,x,y+.99,z,.32,.08,.32,16);b.cyl(inside,x,y+1.035,z,.23,.02,.23,16);for(let i=0;i<12;i++){const a=i*Math.PI/6;bar([x+Math.cos(a)*.295,y+.08,z+Math.sin(a)*.295],[x+Math.cos(a)*.295,y+.87,z+Math.sin(a)*.295],.012,frame);}collider(x,z,.62,.62);}
 for(const [x,z]of [[-42,23],[42,23],[-43,-25],[43,-25],[-57,0],[57,0]])bin(x,z);
 // Saucer-top lamps at the perimeter and near the paths.
 for(const [x,z]of [[-60,-33],[60,-33],[-60,33],[60,33],[-40,0],[40,0],[-33,-38],[33,-38],[-30,28],[30,28]]){const y=groundHeight(x,z);b.cyl(dark,x,y+.17,z,.21,.34);b.cyl(frame,x,y+2.65,z,.065,5.3,.085,12);b.cyl(frame,x,y+5.1,z,.28,.36,.11,16);b.cyl(lampGlow,x,y+5.35,z,.68,.045,.68,24);b.cyl(frame,x,y+5.39,z,.7,.055,.24,24);collider(x,z,.35,.35);}
 // R.M. Fischer's four southern light sculptures: an intentionally simplified original rendition.
 for(const x of [-31,-11,11,31]){const z=17.5,y=groundHeight(x,z);b.cyl(stone,x,y+.16,z,.36,.32);b.cyl(rust,x,y+1.32,z,.19,2.5,.15,16);b.cyl(bronze,x,y+2.52,z,.27,.13,.24,16);bar([x,y+2.55,z],[x,y+5.8,z],.052,bronze);sphere(globe,x,y+2.92,z,.32);for(let i=0;i<6;i++){const a=i*2.3,dy=3.35+i*.39,dx=Math.cos(a)*.27,dz=Math.sin(a)*.27;bar([x,y+dy-.2,z],[x+dx,y+dy,z+dz],.025,bronze);sphere(globe,x+dx,y+dy,z+dz,.13+(i%2)*.045);}collider(x,z,.75,.75);}
 // Short rail runs beside the central south stair; leave its middle fully open.
 for(const x of [-4.3,4.3]){for(let i=0;i<5;i++){const z=20+i*1.2,y=groundHeight(x,z);bar([x,y,z],[x,y+.92,z],.032);if(i<4){const z2=z+1.2,y2=groundHeight(x,z2);bar([x,y+.92,z],[x,y2+.92,z2],.04);bar([x,y+.48,z],[x,y2+.48,z2],.025);}}}
 // Low inner portals sit over the recessed drives; adjoining footways stay open.
 for(const z of [-33.5,33.5]){
  const top=groundHeight(6,z)+.7,front=z+(z<0?-.185:.185);
  b.box(darkStone,0,top-.19,z,8.75,.38,.34);
  sign('UNION SQUARE GARAGE',0,top-.18,front,7.9,.27,z<0?Math.PI:0,'#30413f','#d6dbcf');
  for(const x of [-4.25,4.25]){const floor=groundHeight(x,z);bar([x,floor,z],[x,top,z],.055);collider(x,z,.15,.15);}
 }
 group.add(b.finish());group.userData.lampMaterial=lampGlow;return{group,colliders};
}
