import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const output='qa/viewer';
const base=process.env.KYOTO_QA_URL||'http://localhost:5180';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-first-run']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,pass,detail)=>{checks.push({name,pass,...detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
const settle=()=>page.evaluate(async()=>{for(let i=0;i<40;i++)await new Promise(requestAnimationFrame);});
const pose=()=>page.evaluate(()=>({position:__kyoto.camera.position.toArray(),target:__kyoto.controls.target.toArray(),distance:__kyoto.camera.position.distanceTo(__kyoto.controls.target)}));
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
try{
 await page.goto(base,{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>window.__kyoto&&document.documentElement.dataset.ready==='true',{}, {timeout:120000});
 await settle();
 check('Viewer opens directly',await page.evaluate(()=>__kyoto.mode==='viewer'&&__kyoto.controls.enabled&&document.querySelector('#loading').hidden));
 check('App interface removed',await page.locator('#intro,.brand,.location-card,#route-panel,#settings-panel,#discovery,#begin').count()===0);
 check('Six scene viewpoints available',await page.locator('#viewpoint option').count()===6);
 await page.screenshot({path:`${output}/desktop.png`});
 const initial=await pose();
 await page.mouse.move(810,435);await page.mouse.down();await page.mouse.move(1010,475,{steps:20});await page.mouse.up();await settle();
 let current=await pose();
 check('Left drag orbits the scene',distance(initial.position,current.position)>2&&distance(initial.target,current.target)<.01);
 await page.mouse.wheel(0,-400);await settle();let zoomed=await pose();
 check('Scroll zooms',zoomed.distance<current.distance);
 await page.mouse.move(840,445);await page.mouse.down({button:'right'});await page.mouse.move(925,485,{steps:12});await page.mouse.up({button:'right'});await settle();
 let panned=await pose();check('Right drag pans',distance(panned.target,zoomed.target)>.5);
 await page.keyboard.press('ArrowLeft');await settle();
 check('Arrow keys pan the focused viewer',distance((await pose()).target,panned.target)>.01);
 await page.locator('#reset').click();await settle();
 current=await pose();check('Reset restores selected view',distance(current.position,initial.position)<.05&&distance(current.target,initial.target)<.05);
 for(const id of ['gion','yasaka','ninenzaka','kiyomizu','all']){
  await page.locator('#viewpoint').selectOption(id);await settle();
  const state=await page.evaluate(()=>({pos:__kyoto.camera.position.toArray(),fog:__kyoto.scene.fog.far,glError:__kyoto.renderer.getContext().getError()}));
  check(`Viewpoint ${id}`,state.glError===0&&state.pos.every(Number.isFinite));
  await page.screenshot({path:`${output}/${id}.png`});
  if(id==='all')check('Overview haze follows zoom',state.fog>700);
 }
 await page.locator('#viewpoint').selectOption('pagoda');await settle();
 await page.locator('#fullscreen').click();await page.waitForTimeout(100);
 check('Fullscreen control works',await page.evaluate(()=>Boolean(document.fullscreenElement)));
 await page.evaluate(()=>document.exitFullscreen());
 const shot=await page.evaluate(()=>__shot('pagoda-classic',1600,900));
 const image=Buffer.from(shot.dataURL.split(',')[1],'base64');await fs.writeFile(`${output}/hero-export.png`,image);
 check('Hero screenshot export remains 1600×900',image.readUInt32BE(16)===1600&&image.readUInt32BE(20)===900);
 await page.mouse.move(800,450);await page.mouse.down();await page.mouse.move(845,460,{steps:8});await page.mouse.up();await settle();
 check('Orbit resumes after screenshot tooling',await page.evaluate(()=>__kyoto.mode==='viewer'&&__kyoto.controls.enabled));
 await page.locator('#viewpoint').selectOption('pagoda');await settle();
 await page.setViewportSize({width:390,height:844});await settle();
 await page.screenshot({path:`${output}/mobile.png`});
 const size=await page.locator('#world').boundingBox();check('Viewer fills mobile viewport',size.width===390&&size.height===844);
 check('No runtime errors',errors.length===0,{errors});
 await fs.writeFile('qa/viewer-verification.json',JSON.stringify({date:new Date().toISOString(),checks,errors,pass:checks.every(c=>c.pass)},null,2));
 if(checks.some(c=>!c.pass))process.exitCode=1;
}finally{await browser.close();}
