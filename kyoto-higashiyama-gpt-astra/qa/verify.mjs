/** Runtime controls, interaction access, shader and frame-time checks.
 * Continuous physical walking is separately exercised by walkthrough.mjs.
 * Requires a running Vite server; writes evidence, never invented scores.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const url=value('--url',process.env.KYOTO_QA_URL||'http://localhost:5173');
const output=value('--output','qa/runtime-verification.json');
const executable=value('--chrome',process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const options={headless:true,args:['--no-first-run',...(args.includes('--software')?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]};
try{await fs.access(executable);options.executablePath=executable;}catch{}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={createdAt:new Date().toISOString(),url,viewport:[1920,1080],softwareFlag:args.includes('--software'),checks:[],pageErrors:[],consoleErrors:[]};
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|404/.test(m.text()))report.consoleErrors.push(m.text());});
const check=(name,pass,detail={})=>{report.checks.push({name,pass,...detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
try {
 await page.goto(url,{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>window.__kyoto&&document.documentElement.dataset.ready==='true',{}, {timeout:120000});
 const initial=await page.evaluate(()=>({stats:__kyoto.stats(),mode:__kyoto.mode,heroes:__kyoto.heroes.length,shaderPatch:__kyoto.scene.children.length}));
 report.initialStats=initial.stats;check('World initializes',initial.mode==='intro');check('At least 30 authored cameras',initial.heroes>=30,{count:initial.heroes});
 await page.locator('#settings').click();
 check('Settings opens',await page.locator('#settings-panel').isVisible());
 const oldInk=await page.evaluate(()=>__kyoto.pipeline.enabled.ink);await page.locator('#ink-toggle').click();
 check('Ink button changes renderer',await page.evaluate(old=>__kyoto.pipeline.enabled.ink!==old,oldInk));await page.locator('#ink-toggle').click();
 const oldGrade=await page.evaluate(()=>__kyoto.pipeline.enabled.grade);await page.locator('#grade-toggle').click();
 const gradeState=await page.evaluate(()=>{__kyoto.renderFrame();return {enabled:__kyoto.pipeline.enabled.grade,uniform:__kyoto.pipeline.grade.mat.uniforms.uEnabled.value};});
 check('Grade button changes shader while retaining output conversion',gradeState.enabled!==oldGrade&&gradeState.uniform===0,gradeState);
 await page.locator('#grade-toggle').click();await page.locator('[data-close="settings-panel"]').click();
 const spring=await page.evaluate(()=>{const o=__kyoto.scene.getObjectByProperty('name','pink / garden cell 0,0');let mesh=o;if(!mesh)__kyoto.scene.traverse(x=>{if(!mesh&&x.name.startsWith('pink /'))mesh=x;});window.__qaSeasonMesh=mesh;return mesh?Array.from(mesh.instanceColor.array.slice(0,12)):[];});
 await page.locator('#season').click();const autumn=await page.evaluate(()=>window.__qaSeasonMesh?Array.from(__qaSeasonMesh.instanceColor.array.slice(0,12)):[]);
 check('Autumn changes actual foliage colors',spring.length>0&&JSON.stringify(spring)!==JSON.stringify(autumn),{label:await page.locator('#season-label').textContent()});
 await page.locator('#season').click();const restored=await page.evaluate(()=>Array.from(__qaSeasonMesh.instanceColor.array.slice(0,12)));
 check('Spring restores original foliage',JSON.stringify(spring)===JSON.stringify(restored));
 const oldTime=await page.locator('#light-label').textContent();await page.keyboard.press('t');
 check('Time-of-day keyboard control',oldTime!==await page.locator('#light-label').textContent());
 await page.locator('#photo').click();check('Photo mode opens and freezes walker',await page.evaluate(()=>__kyoto.mode==='photo'&&!__kyoto.player.enabled));
 const before=await page.locator('#photo-counter').textContent();await page.locator('#next-view').click();check('Photo camera advances',before!==await page.locator('#photo-counter').textContent());await page.locator('#close-photo').click();
 await page.locator('#route-toggle').click();check('Route panel opens',await page.locator('#route-panel').isVisible());await page.locator('.destination[data-id="ninenzaka"]').click();
 check('Map destination moves player to Ninenzaka',await page.evaluate(()=>Math.hypot(__kyoto.player.pos.x-225,__kyoto.player.pos.z-185)<3));
 await page.keyboard.press('c');check('Coordinate and performance HUD toggles',await page.locator('#debug').isVisible());await page.keyboard.press('c');
 const audioBefore=await page.locator('#sound').getAttribute('aria-label');await page.locator('#sound').click();check('Ambient sound control changes state',audioBefore!==await page.locator('#sound').getAttribute('aria-label'));await page.locator('#sound').click();

 const interactionResult=await page.evaluate(async()=>{
  const {nearestPath}=await import('/src/world/route.js');const app=__kyoto,p=app.player,w=app.world;app.setMode('qa');p.enabled=true;p.keys.clear();
  const reachable=[],unreachable=[];
  const free=(x,z,y)=>!w.colliders.some(c=>!c.disabled&&c.maxY>y+.42&&c.minY<y+1.8&&x>c.minX-.28&&x<c.maxX+.28&&z>c.minZ-.28&&z<c.maxZ+.28);
  for(const target of w.interactables){let found=null;
   for(const radius of[1.4,2,2.65]){for(let a=0;a<16;a++){
    const angle=a*Math.PI/8,x=target.position.x+Math.cos(angle)*radius,z=target.position.z+Math.sin(angle)*radius,y=w.heightAt(x,z),path=nearestPath(x,z);
    if(path.d>Math.max(12,path.width/2+4)||!free(x,z,y))continue;
    const dx=target.position.x-x,dz=target.position.z-z,dy=target.position.y-y-1.68;
    const pose={pos:[x,y,z],yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))};p.setPose(pose);
    if(p.pick([target])){found={id:target.id,label:target.label,kind:target.kind,pose};break;}
   }if(found)break;}
   if(found)reachable.push(found);else unreachable.push({id:target.id,label:target.label,position:target.position.toArray()});
  }
  return {total:w.interactables.length,approachable:reachable.length,reachable,unreachable,note:'Candidate poses are collision-free within 12m of a mapped walking corridor, with real player facing/range and AABB occlusion tests. This does not substitute for a pathfinding proof of every shop recess.'};
 });
 report.interactions=interactionResult;check('At least 30 registered interactions',interactionResult.total>=30,{count:interactionResult.total});check('At least 30 interactions can be approached',interactionResult.approachable>=30,{approachable:interactionResult.approachable,total:interactionResult.total});
 const selected=await page.evaluate(list=>{const a=__kyoto;a.setMode('walk');a.player.enabled=true;for(const item of list){a.player.setPose(item.pose);const picked=a.player.pick();if(picked)return {id:picked.id,label:picked.label,before:picked.count||0};}return null;},interactionResult.reachable);
 if(selected){await page.keyboard.press('e');await page.waitForTimeout(150);const result=await page.evaluate(id=>({count:__kyoto.world.interactables[id].count||0,visible:!document.querySelector('#discovery').classList.contains('hidden'),title:document.querySelector('#discovery h3').textContent}),selected.id);check('E invokes a nearby discovery and displays its response',result.count===selected.before+1&&result.visible&&result.title===selected.label,{selected: selected.label,result});await page.locator('#close-discovery').click();}else check('E invokes a nearby discovery and displays its response',false,{reason:'No approachable interaction candidate found.'});
 const alphaStatus=await page.evaluate(async()=>{const a=__kyoto,previous={...a.pipeline.enabled},results=[];for(const grade of[false,true]){a.pipeline.enabled.ink=false;a.pipeline.enabled.grade=grade;const shot=await __shot('maruyama-blossom',320,180),blob=await(await fetch(shot.dataURL)).blob(),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)transparent++;results.push({ink:false,grade,transparentPixels:transparent,totalPixels:pixels.length/4});bitmap.close();}Object.assign(a.pipeline.enabled,previous);return results;});
 report.outputAlpha=alphaStatus;check('Painted foliage screenshots remain opaque with ink off and grade on or off',alphaStatus.every(s=>s.transparentPixels===0),{samples:alphaStatus});
 const shaderStatus=await page.evaluate(()=>{const a=__kyoto;a.setMode('qa');a.showHero(17);a.renderFrame();const gl=a.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webglVersion:gl.getParameter(gl.VERSION),glError:gl.getError(),programs:a.renderer.info.programs.map(p=>({id:p.id,runnable:p.diagnostics?.runnable??null})),stats:a.stats()};});
 report.rendering=shaderStatus;check('WebGL compiles scene without reported shader errors',shaderStatus.glError===0&&!shaderStatus.programs.some(p=>p.runnable===false),{glError:shaderStatus.glError,programCount:shaderStatus.programs.length});
 // Measure unfiltered requestAnimationFrame intervals after warmup. Long frames
 // remain in the sample, unlike a misleading implementation that drops stalls.
 await page.waitForTimeout(1000);
 report.performance=await page.evaluate(()=>new Promise(resolve=>{const samples=[],start=performance.now();let last=start;function tick(now){samples.push((now-last)/1000);last=now;if((now-start)<8000&&samples.length<480){requestAnimationFrame(tick);return;}const sum=samples.reduce((a,b)=>a+b,0),descending=[...samples].sort((a,b)=>b-a),worst=descending.slice(0,Math.max(1,Math.ceil(samples.length*.01)));resolve({samples:samples.length,elapsedSeconds:sum,averageFPS:samples.length/sum,onePercentLow:worst.length/worst.reduce((a,b)=>a+b,0),worstFrameMs:descending[0]*1000,renderSize:__kyoto.pipeline.size.toArray(),drawCalls:__kyoto.renderer.info.render.calls,triangles:__kyoto.renderer.info.render.triangles,sceneCpuMs:__kyoto.pipeline.stats.sceneCpuMs,postCpuMs:__kyoto.pipeline.stats.postCpuMs,timingNote:'CPU fields measure submission, not GPU duration. FPS uses all wall-clock frame intervals, including stalls. Headless run may contend with parallel QA browsers.'});}requestAnimationFrame(tick);}));
 check('Measured desktop frame-rate minimum',report.performance.averageFPS>=45,{averageFPS:report.performance.averageFPS,onePercentLow:report.performance.onePercentLow});
 check('No browser runtime errors',report.pageErrors.length===0&&report.consoleErrors.length===0,{pageErrors:report.pageErrors,consoleErrors:report.consoleErrors});
 report.pass=report.checks.every(c=>c.pass);
} catch(error){report.fatalError=error.stack;report.pass=false;console.error(error);} finally {
 await fs.mkdir(new URL('.',new URL(output,`file://${process.cwd()}/`)),{recursive:true});
 await fs.writeFile(output,JSON.stringify(report,null,2));await browser.close();
}
console.log(`Runtime evidence written to ${output}`);if(!report.pass)process.exitCode=1;
