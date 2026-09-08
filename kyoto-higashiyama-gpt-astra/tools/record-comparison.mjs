#!/usr/bin/env node
/** Record the frozen Three.js viewer. Only camera and animation time are driven.
 * The first 53.9 seconds follow the published Fable tour's beat timing; cameras
 * use this world's pre-existing authored views. See media/COMPARISON.md.
 * No geometry, materials, lighting or grading are changed for the recording.
 */
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const opts=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const base=opts.url||process.env.KYOTO_QA_URL||'http://localhost:5180';
const output=opts.out||'media';
const fps=Number(opts.fps||30), width=Number(opts.width||1920), height=Number(opts.height||1080);
const sampleOnly=Boolean(opts.samples);
export const SHOTS=[
 {id:'over-the-roofs',t0:0,t1:6.1,moveEnd:5.6,air:true,from:[248,62,220],to:[234,46,201],target:[185,25,182]},
 {id:'hanamikoji-north',t0:6.1,t1:13.3,push:1.8,pan:.19,label:'Hanamikoji; Shirakawa is absent'},
 {id:'yasaka-court',t0:13.3,t1:20.5,orbit:-.20,pivot:18,label:'Yasaka Shrine lantern court'},
 {id:'maruyama-blossom',t0:20.5,t1:27.1,rise:4.2,tilt:-.15,label:'Maruyama blossom; no weeping cherry'},
 {id:'pagoda-classic',t0:27.1,t1:35.1,push:2,tilt:.16,label:'Yasaka Pagoda'},
 {id:'sannenzaka-steps',t0:35.1,t1:42.7,moveEnd:42.1,push:6.4,label:'Sannenzaka steps'},
 {id:'kiyomizu-gate',t0:42.7,t1:53.9,moveEnd:50.9,push:-5.2,tilt:-.10,label:'Kiyomizu Nio-mon; Fable shows Saimon'},
 {id:'kiyomizu-stage',t0:53.9,t1:60.9,push:-3,label:'Codex-only extension: timber stage'},
 {id:'entire-scene',t0:60.9,t1:65.9,air:true,from:[430,265,460],to:[480,330,510],target:[190,18,158],label:'Codex-only extension: entire model'},
];
const duration=SHOTS.at(-1).t1;
await fs.mkdir(output,{recursive:true});
await fs.mkdir(path.join(output,'stills'),{recursive:true});
const errors=[];
const browser=await chromium.launch({headless:true,
 executablePath:opts.chrome||process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-first-run','--disable-background-networking']});
const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
// Park the viewer's native loop only after loading and sizing have completed.
await page.addInitScript(()=>{
 const native=window.requestAnimationFrame.bind(window);
 window.requestAnimationFrame=cb=>native(t=>{if(!window.__capturePaused)cb(t);});
});
let encoder;
try {
 await page.goto(base,{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',{}, {timeout:120000});
 await page.evaluate(async({width,height})=>{
  await __shot('pagoda-classic',width,height);
  window.__capturePaused=true;
  window.__filmFrame=(shot,k,t,dt)=>{
   const s=__kyoto, cam=s.camera, e=k<.5?2*k*k:1-(-2*k+2)**2/2;
   if(shot.air){
    s.setMode('viewer');s.controls.enabled=false;
    cam.position.set(...shot.from.map((v,i)=>v+(shot.to[i]-v)*e));
    s.controls.target.fromArray(shot.target);cam.lookAt(...shot.target);cam.fov=52;
   }else{
    s.setMode('qa');
    const hero=s.heroes.find(h=>h.id===shot.id);
    cam.position.fromArray(hero.pos);cam.lookAt(...hero.target);cam.fov=hero.fov;
    const yaw0=cam.rotation.y,pitch0=cam.rotation.x;
    let x=hero.pos[0],z=hero.pos[2],yaw=yaw0;
    if(shot.orbit){
     const a=shot.orbit*e,px=x-Math.sin(yaw0)*shot.pivot,pz=z-Math.cos(yaw0)*shot.pivot;
     const dx=x-px,dz=z-pz;
     x=px+dx*Math.cos(a)+dz*Math.sin(a);z=pz-dx*Math.sin(a)+dz*Math.cos(a);yaw+=a;
    }else{
     x-=Math.sin(yaw0)*(shot.push||0)*e;z-=Math.cos(yaw0)*(shot.push||0)*e;
     yaw+=(shot.pan||0)*e;
    }
    const ground0=s.world.heightAt(hero.pos[0],hero.pos[2]);
    const eye=hero.pos[1]-ground0;
    cam.position.set(x,s.world.heightAt(x,z)+eye+(shot.rise||0)*e,z);
    cam.rotation.set(pitch0+(shot.tilt||0)*e,yaw,0,'YXZ');
   }
   cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
   s.world.update(dt,cam,t);s.renderFrame();
   const p=cam.position;
   return {png:document.querySelector('#world').toDataURL('image/png'),
    pos:p.toArray(),clearance:p.y-s.world.heightAt(p.x,p.z),
    colliders:s.world.colliders.filter(c=>p.x>c.minX&&p.x<c.maxX&&p.z>c.minZ&&p.z<c.maxZ&&p.y>(c.minY??-Infinity)&&p.y<(c.maxY??Infinity)).length};
  };
 },{width,height});
 const environment=await page.evaluate(()=>{
  const gl=__kyoto.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {userAgent:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 });
 const audits=[],obstructedFrames=[];let minimumClearance=Infinity,frameCount=0;
 if(sampleOnly){
  for(const shot of SHOTS)for(const k of [0,.5,1]){
   const frame=await page.evaluate(({shot,k,t})=>__filmFrame(shot,k,t,1/30),{shot,k,t:shot.t0+(shot.t1-shot.t0)*k});
   const {png,...audit}=frame;audits.push({shot:shot.id,k,...audit});
   await fs.writeFile(path.join(output,'stills',`${shot.id}-${k}.png`),Buffer.from(png.split(',')[1],'base64'));
  }
 }else{
  encoder=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',String(fps),'-i','pipe:0',
   '-an','-c:v','libx264','-preset','medium','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',
   path.join(output,'kyoto-higashiyama-codex-walkover.mp4')],{stdio:['pipe','ignore','pipe']});
  let encoderError='';encoder.stderr.on('data',d=>encoderError+=d);
  const finished=once(encoder,'close');
  const total=Math.round(duration*fps),started=Date.now();
  for(let f=0;f<total;f++){
   const t=f/fps,shot=SHOTS.find(s=>t>=s.t0&&t<s.t1)||SHOTS.at(-1);
   const k=Math.min(1,(t-shot.t0)/((shot.moveEnd||shot.t1)-shot.t0));
   const frame=await page.evaluate(({shot,k,t,dt})=>__filmFrame(shot,k,t,dt),{shot,k,t,dt:1/fps});
   frameCount++;minimumClearance=Math.min(minimumClearance,frame.clearance);
   if(frame.colliders||frame.clearance<=0)obstructedFrames.push({f,t,shot:shot.id,pos:frame.pos,clearance:frame.clearance,colliders:frame.colliders});
   const png=Buffer.from(frame.png.split(',')[1],'base64');
   if(!encoder.stdin.write(png))await once(encoder.stdin,'drain');
   if(f%fps===0){const{png:_,...audit}=frame;audits.push({t,shot:shot.id,...audit});}
   if(f===Math.round((shot.t0+(shot.moveEnd||shot.t1))/2*fps))await fs.writeFile(path.join(output,'stills',`${shot.id}.png`),png);
   if(f%(fps*5)===0)console.log(`${f}/${total} frames · ${shot.id} · ${(f/((Date.now()-started)/1000)).toFixed(1)} capture fps`);
  }
  encoder.stdin.end();const [code]=await finished;
  if(code!==0)throw new Error(`ffmpeg exited ${code}: ${encoderError}`);
 }
 const files=await fs.readdir('src',{recursive:true});
 const hash=crypto.createHash('sha256');
 for(const file of files.sort()){const p=path.join('src',file);if((await fs.stat(p)).isFile())hash.update(file).update(await fs.readFile(p));}
 await fs.writeFile(path.join(output,sampleOnly?'camera-samples.json':'capture.json'),JSON.stringify({
  capturedAt:new Date().toISOString(),sourceSha256:hash.digest('hex'),base,width,height,fps,duration,
  comparisonDuration:53.9,environment,errors,shots:SHOTS,audits,frameCount,minimumClearance,obstructedFrames,
  method:'Native Three.js canvas; fixed animation timestep; camera-only recording. Shot timing aligned with Fable; framing and coverage differ. No added post effects.'
 },null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(`Saved ${sampleOnly?'camera samples':'walkover recording'} to ${output}`);
}finally{encoder?.stdin.end();await browser.close();}
