/** Wall-clock rendered walk using real collision and no intermediate teleports. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const captureImages=!process.argv.includes('--no-images'),output=captureImages?'qa/livewalk':'qa/movement-profile';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-first-run']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.exposeFunction('saveWalkFrame',async(i,image)=>fs.writeFile(`${output}/${String(i).padStart(2,'0')}-walk.png`,Buffer.from(image.split(',')[1],'base64')));
page.on('console',m=>{if(m.text().startsWith('WALK '))console.log(m.text());});
try{
 await page.goto('http://localhost:5173',{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>window.__kyoto,{}, {timeout:120000});
 const result=await page.evaluate(async(captureImages)=>{
  const k=__kyoto,p=k.player,route=[];
  for(const point of k.route){route.push([...point]);if(point[0]===201&&point[1]===105)route.push([201,100],[177,100],[177,115],[201,115],[201,105]);if(point[0]===225&&point[1]===178)route.push([202,175],[169,175],[202,175],[202,192],[185,196],[202,192],[202,175],[225,178]);}
  k.setMode('qa');p.enabled=true;p.keys.clear();p.setPose({pos:[route[0][0],0,route[0][1]],yaw:-Math.PI/2});p.keys.add('KeyW');p.keys.add('ShiftLeft');p.pitch=.025;
  for(let i=0;i<60;i++)await new Promise(requestAnimationFrame);
  k.resetMetrics();const start=performance.now(),segments=[],intervals=[];let previous=performance.now(),distance=0,maxStep=0,passed=true;
  for(let i=1;i<route.length;i++){
   const target=route[i],segmentStart=performance.now();let reached=false,lastProgress=performance.now(),progressX=p.pos.x,progressZ=p.pos.z;
   while(performance.now()-segmentStart<90000){
    const now=await new Promise(requestAnimationFrame),raw=(now-previous)/1000;previous=now;intervals.push(raw);
    const dx=target[0]-p.pos.x,dz=target[1]-p.pos.z;if(Math.hypot(dx,dz)<.24){reached=true;break;}
    p.yaw=Math.atan2(-dx,-dz);const old=p.pos.clone();p.update(Math.min(raw,.05));distance+=Math.hypot(p.pos.x-old.x,p.pos.z-old.z);maxStep=Math.max(maxStep,Math.abs(p.pos.y-old.y));
    if(now-lastProgress>4000){if(Math.hypot(p.pos.x-progressX,p.pos.z-progressZ)<.1)break;lastProgress=now;progressX=p.pos.x;progressZ=p.pos.z;}
   }
   segments.push({index:i,target,end:p.pos.toArray(),reached,seconds:(performance.now()-segmentStart)/1000});
   console.log(`WALK ${i}/${route.length-1} ${reached?'passed':'BLOCKED'}`);
   if(captureImages){k.renderFrame();await window.saveWalkFrame(i,document.querySelector('#world').toDataURL('image/png'));}
   if(!reached){passed=false;break;}
  }
  p.keys.clear();p.enabled=false;
  // Finish the same walk by turning west, keeping the actual feet and eye height.
  p.yaw=1.74;p.pitch=-.075;p.applyCamera();
  for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);
  if(captureImages){k.renderFrame();await window.saveWalkFrame(39,document.querySelector('#world').toDataURL('image/png'));}
  const elapsed=(performance.now()-start)/1000,sorted=[...intervals].sort((a,b)=>b-a),low=sorted.slice(0,Math.max(1,Math.ceil(sorted.length*.01)));
  return{method:'Wall-clock native-GPU rendered first-person controller walk, Shift speed, one initial spawn only. Every step resolves collision/terrain. Finishes with a westward turn at the same player position and eye height.',captureImages,timingNote:captureImages?'Frame timing includes shadow recentering and PNG capture pauses.':'No screenshot exports during movement; timing includes actual rendering, animation, collision, first-visit uploads and shadow recentering.',passed,elapsedSeconds:elapsed,distance,maxStep,segments,finalPosition:p.pos.toArray(),finalOrientation:{yaw:p.yaw,pitch:p.pitch},averageFPS:intervals.length/intervals.reduce((a,b)=>a+b,0),onePercentLow:low.length/low.reduce((a,b)=>a+b,0),worstFrameMs:sorted[0]*1000,stats:k.stats()};
 },captureImages);
 await fs.writeFile(`${output}/result.json`,JSON.stringify({...result,createdAt:new Date().toISOString(),errors},null,2));console.log(JSON.stringify({passed:result.passed,seconds:result.elapsedSeconds,distance:result.distance,fps:result.averageFPS,low:result.onePercentLow,errors}));if(!result.passed||errors.length)process.exitCode=1;
}finally{await browser.close();}
