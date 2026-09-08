/** Deterministic continuous controller walk. Simulated time is NOT an FPS benchmark. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const base=process.argv[2]||'http://localhost:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-networking']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
page.on('console',m=>{if(m.text().startsWith('WALK:'))console.log(m.text());});
try{
 await page.goto(base,{waitUntil:'networkidle',timeout:120000});await page.waitForFunction(()=>!!window.__kyoto,{}, {timeout:120000});
 const result=await page.evaluate(()=>{
  const k=__kyoto,p=k.player,waypoints=[];
  for(const a of k.route){
    waypoints.push([...a]);
    if(a[0]===201&&a[1]===105)waypoints.push([201,100],[177,100],[177,115],[201,115],[201,105]);
    if(a[0]===225&&a[1]===178)waypoints.push([202,175],[169,175],[202,175],[202,192],[185,196],[202,192],[202,175],[225,178]);
  }
  k.setMode('qa');p.enabled=true;p.keys.clear();p.setPose({pos:[...waypoints[0].slice(0,1),0,waypoints[0][1]],yaw:0});
  p.keys.add('KeyW');const segments=[],problems=[];let simulated=0,maxHeightDelta=0,totalTravel=0;
  for(let i=1;i<waypoints.length;i++){
   const target=waypoints[i],start=p.pos.clone();let n=0,reached=false,stuck=0,last=p.pos.clone();
   for(;n<18000;n++){
    const dx=target[0]-p.pos.x,dz=target[1]-p.pos.z,d=Math.hypot(dx,dz);
    if(d<.20){reached=true;break;}
    p.yaw=Math.atan2(-dx,-dz);const oldY=p.pos.y,oldX=p.pos.x,oldZ=p.pos.z;p.update(1/60);simulated+=1/60;
    maxHeightDelta=Math.max(maxHeightDelta,Math.abs(p.pos.y-oldY));totalTravel+=Math.hypot(p.pos.x-oldX,p.pos.z-oldZ);
    if(n%120===119){const moved=Math.hypot(p.pos.x-last.x,p.pos.z-last.z);stuck=moved<.05?stuck+1:0;last.copy(p.pos);if(stuck>2)break;}
   }
   const row={segment:i,start:start.toArray(),target,end:p.pos.toArray(),reached,simulationSeconds:n/60};segments.push(row);console.log('WALK: '+i+' '+(reached?'passed':'BLOCKED')+' at '+p.pos.x.toFixed(2)+','+p.pos.z.toFixed(2));
   if(!reached){const near=k.world.colliders.filter(c=>p.pos.x>c.minX-.8&&p.pos.x<c.maxX+.8&&p.pos.z>c.minZ-.8&&p.pos.z<c.maxZ+.8);problems.push({...row,nearbyColliders:near});break;}
  }
  p.keys.clear();p.enabled=false;p.applyCamera();
  return {type:'continuous deterministic Player.update controller walk',simulatedSeconds:simulated,totalTravel,maxHeightDelta,reachedEnd:problems.length===0,segments,problems,finalPosition:p.pos.toArray(),heightAtFinal:k.world.heightAt(p.pos.x,p.pos.z)};
 });
 await fs.mkdir('qa/walkthrough',{recursive:true});await fs.writeFile('qa/walkthrough/controller-full-route.json',JSON.stringify(result,null,2));
 const image=await page.evaluate(()=>__shot('walkthrough-end',1600,900,{}));await fs.writeFile('qa/walkthrough/full-route-end.png',Buffer.from(image.dataURL.split(',')[1],'base64'));
 console.log(JSON.stringify({reachedEnd:result.reachedEnd,segments:result.segments.length,totalTravel:result.totalTravel,problems:result.problems},null,2));if(!result.reachedEnd)process.exitCode=1;
}finally{await browser.close();}
