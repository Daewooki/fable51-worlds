#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const base=args.url||'http://localhost:5180/';
const files=[
 ['kyoto-higashiyama-codex-walkover.mp4',1920,1080,65.9],
 ['fable51-vs-gpt6-astra-kyoto.mp4',3840,1160,53.9],
 ['kyoto-higashiyama-codex-walkover.gif',640,360,65.9],
 ['preview.gif',960,290,4]
];
const checks=[];
for(const [file,width,height,duration] of files){
 const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames,avg_frame_rate:format=duration,size','-of','json',`media/${file}`],{encoding:'utf8'});
 if(probe.status!==0)throw new Error(probe.stderr);
 const data=JSON.parse(probe.stdout),stream=data.streams[0];
 const decode=spawnSync('ffmpeg',['-v','error','-i',`media/${file}`,'-f','null','-'],{encoding:'utf8'});
 const pass=stream.width===width&&stream.height===height&&Math.abs(Number(data.format.duration)-duration)<.2&&decode.status===0;
 checks.push({file,pass,...data,decodeErrors:decode.stderr});console.log(`${pass?'PASS':'FAIL'} ${file}`);
}
const browser=await chromium.launch({headless:true,executablePath:process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 // Establish the media origin; Chromium restricts local-network media in an
 // opaque about:blank origin. A JSON document avoids loading the scene itself.
 await page.goto(new URL('media/capture.json',base).href);
 for(const [file] of files.filter(f=>f[0].endsWith('.mp4'))){
  const url=new URL(`media/${file}`,base).href;
  await page.setContent(`<body style="margin:0;background:#181a20"><video id="v" muted controls playsinline style="width:100%;height:auto" src="${url}"></video></body>`);
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2,{}, {timeout:45000});
  await page.evaluate(async()=>{await document.querySelector('video').play();});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>1,{}, {timeout:15000});
  const state=await page.evaluate(async()=>{
   const v=document.querySelector('video');v.pause();
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Video seek timed out')),15000);
    v.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});v.currentTime=31;
   });
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return {error:v.error?.message||null,width:v.videoWidth,height:v.videoHeight,played:v.played.length>0,seekTime:v.currentTime};
  });
  await fs.mkdir('qa/media',{recursive:true});
  await page.screenshot({path:`qa/media/${file.replace('.mp4','.png')}`});
  checks.push({name:`Native browser playback: ${file}`,pass:state.played&&!state.error&&Math.abs(state.seekTime-31)<.2,...state});
 }
 const url=new URL('media/kyoto-higashiyama-codex-walkover.gif',base).href;
 await page.setContent(`<body style="margin:0"><img id="gif" src="${url}"></body>`);
 await page.waitForFunction(()=>document.querySelector('#gif').complete&&document.querySelector('#gif').naturalWidth>0);
 const first=await page.locator('#gif').screenshot();
 await page.waitForTimeout(1000);
 const next=await page.locator('#gif').screenshot();
 checks.push({name:'GIF animates in browser',pass:!first.equals(next)});
}finally{await browser.close();}
const report={verifiedAt:new Date().toISOString(),checks,pass:checks.every(c=>c.pass)};
await fs.writeFile('qa/media-verification.json',JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
