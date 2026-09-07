#!/usr/bin/env node
/** Mechanical encoding of native canvas captures; no image enhancement. */
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const media=args.media||'media';
const fable=args.fable||'../kyoto-higashiyama/media/kyoto-higashiyama-walkthrough.mp4';
const own=path.join(media,'kyoto-higashiyama-codex-walkover.mp4');
const comparison=path.join(media,'fable51-vs-gpt6-astra-kyoto.mp4');
await fs.access(fable);await fs.access(own);
// Canvas2D keeps the label strip portable across FFmpeg builds without drawtext.
const browser=await chromium.launch({headless:true,executablePath:args.chrome||process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
let labelData;
try {
 const page=await browser.newPage();
 labelData=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=3840;c.height=80;
  const ctx=c.getContext('2d');ctx.fillStyle='#181a20';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#fff';ctx.font='44px Arial, sans-serif';ctx.textBaseline='middle';
  ctx.fillText('Codex / GPT-6 Astra — one-shot result',40,40);
  ctx.fillText('Claude Fable 5.1',1960,40);
  return c.toDataURL('image/png');
 });
}finally{await browser.close();}
const labels=path.join(media,'comparison-labels.png');
await fs.writeFile(labels,Buffer.from(labelData.split(',')[1],'base64'));
async function run(argv,label){
 console.log(label);const p=spawn('ffmpeg',['-y','-loglevel','error',...argv],{stdio:'inherit'});
 const [code]=await once(p,'close');if(code!==0)throw new Error(`ffmpeg ${label}: ${code}`);
}
// Preserve every pixel of both 1920x1080 sources. Labels occupy added headroom.
const graph=[
 '[0:v]trim=duration=53.9,setpts=PTS-STARTPTS,setsar=1[a]',
 '[1:v]trim=duration=53.9,setpts=PTS-STARTPTS,setsar=1[b]',
 '[a][b]hstack=inputs=2[pair]',
 '[2:v]setsar=1[labels]',
 '[labels][pair]vstack=inputs=2[out]'
].join(';');
await run(['-i',own,'-i',fable,'-loop','1','-i',labels,'-filter_complex',graph,'-map','[out]','-t','53.9','-an','-r','30',
 '-c:v','libx264','-preset','medium','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',comparison],'Encode equal-size comparison');
async function gif(input,output,{start=0,duration,width,fps}){
 const split=`fps=${fps},scale=${width}:-1:flags=lanczos,split[x][p];[p]palettegen=max_colors=128:stats_mode=diff[pal];[x][pal]paletteuse=dither=bayer:bayer_scale=5`;
 await run(['-ss',String(start),'-t',String(duration),'-i',input,'-filter_complex',split,'-an','-loop','0',output],`Encode ${output}`);
}
await gif(comparison,path.join(media,'preview.gif'),{start:30.4,duration:4,width:960,fps:10});
await gif(own,path.join(media,'kyoto-higashiyama-codex-walkover.gif'),{duration:65.9,width:640,fps:8});
console.log('Comparison MP4, comparison preview, and complete Codex walkover GIF ready.');
