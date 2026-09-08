/** Real browser capture: no screenshot compositing. Requires a running Vite server. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const base=arg('--url',process.env.KYOTO_QA_URL||'http://localhost:5173');
const output=arg('--output','qa/final');
const limit=Number(arg('--limit','999'));
const only=arg('--only','');
const useSoftware=args.includes('--software');
const executable=arg('--chrome',process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const opts={headless:true,args:['--no-first-run','--disable-background-networking',...(useSoftware?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]};
try{await fs.access(executable);opts.executablePath=executable;}catch{}
const browser=await chromium.launch(opts);
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});
page.on('console',e=>{if(e.type()==='error'&&!e.text().includes('404'))errors.push(e.text());});
await fs.mkdir(output,{recursive:true});
try{
 await page.goto(base,{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>!!window.__kyoto&&typeof window.__shot==='function',{},{timeout:120000});
 const heroes=await page.evaluate(()=>Array.isArray(__kyoto.heroes)?__kyoto.heroes:Object.entries(__kyoto.heroes).map(([id,h])=>({id,...h})));
 let selection=heroes.filter(h=>!only||new RegExp(only,'i').test(h.id||h.name||h.title||'' )).slice(0,limit);
 const manifest=[];
 const timed=args.includes('--profile');
 for(let i=0;i<selection.length;i++){
  const h=selection[i],id=String(h.id||h.name||h.title||`hero-${i+1}`).replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();
  const camera={...h,...(h.camera||{})};
  if(!camera.pos&&camera.position)camera.pos=camera.position;
  const image=await page.evaluate(async({id,camera})=>await __shot(id,1600,900,camera),{id,camera});
  const filename=`${String(i+1).padStart(2,'0')}-${id}.png`;
  const data=typeof image==='string'?image:image?.dataURL||image?.dataUrl;
  if(data?.startsWith('data:image/'))await fs.writeFile(path.join(output,filename),Buffer.from(data.split(',')[1],'base64'));
  else await page.screenshot({path:path.join(output,filename)});
  let frameTiming=null;
  if(timed){frameTiming=await page.evaluate(async()=>{
    const frame=()=>new Promise(r=>requestAnimationFrame(r));
    for(let i=0;i<60;i++)await frame();
    const times=[];let last=performance.now();for(let i=0;i<120;i++){await frame();const now=performance.now();times.push(now-last);last=now;}
    const sorted=[...times].sort((a,b)=>b-a),low=sorted.slice(0,Math.ceil(times.length*.01));
    return {method:'60 warm-up frames, then 120 unfiltered requestAnimationFrame intervals',averageFPS:1000/(times.reduce((a,b)=>a+b,0)/times.length),onePercentLow:1000/(low.reduce((a,b)=>a+b,0)/low.length),frameTimesMs:times};
  });}
  const stats=await page.evaluate(()=>typeof __kyoto.stats==='function'?__kyoto.stats():__kyoto.stats||{});
  const cameraSurface=await page.evaluate(()=>{
    const p=__kyoto.camera.position,height=__kyoto.world.heightAt(p.x,p.z);
    return {heightAt:height,clearance:p.y-height,intersectingColliders:__kyoto.world.colliders.filter(c=>p.x>c.minX&&p.x<c.maxX&&p.z>c.minZ&&p.z<c.maxZ&&p.y>(c.minY??-Infinity)&&p.y<(c.maxY??Infinity)).length};
  });
  manifest.push({id,file:filename,camera,stats,frameTiming,cameraSurface});console.log(`[${i+1}/${selection.length}] ${id}`);
 }
 const environment=await page.evaluate(()=>{
  const gl=__kyoto.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],devicePixelRatio,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 });
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({capturedAt:new Date().toISOString(),base,environment,softwareFlag:useSoftware,heroCount:manifest.length,errors,shots:manifest},null,2));
 if(errors.length)console.error('Browser errors:',errors);
 console.log(`Saved ${manifest.length} unmodified browser images to ${output}. GPU: ${environment.gpu}.`);
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
