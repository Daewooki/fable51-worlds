#!/usr/bin/env node
/** Mechanical encoding of native canvas captures; no image enhancement. */
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const media=args.media||'media';
const fable=args.fable||'../kyoto-higashiyama/media/kyoto-higashiyama-walkthrough.mp4';
const union=args.union||'../union-square-sf-gpt-astra/media/fable51-vs-gpt6-astra-union-square.mp4';
const own=path.join(media,'kyoto-higashiyama-codex-walkover.mp4');
const comparison=path.join(media,'fable51-vs-gpt6-astra-kyoto.mp4');
await fs.access(fable);await fs.access(own);await fs.access(union);
const labels=path.join(media,'comparison-labels.png');
async function run(argv,label){
 console.log(label);const p=spawn('ffmpeg',['-y','-loglevel','error',...argv],{stdio:'inherit'});
 const [code]=await once(p,'close');if(code!==0)throw new Error(`ffmpeg ${label}: ${code}`);
}
// Reuse the existing evaluation header verbatim: labels, typography, colors and
// spacing. Its 1920x64 strip scales 2x above our full-resolution 3840px panels.
await run(['-i',union,'-frames:v','1','-vf','crop=1920:64:0:0,scale=3840:128:flags=lanczos','-update','1',labels],
 'Reuse Union Square title strip');
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
if(!('comparison-only' in args))await gif(own,path.join(media,'kyoto-higashiyama-codex-walkover.gif'),{duration:65.9,width:640,fps:8});
console.log('Comparison MP4 and preview ready.');
