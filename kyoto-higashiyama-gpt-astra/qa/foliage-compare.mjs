/** Exact paired browser captures of painted foliage ink, with geometry fixed. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='qa/foliage-comparison';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-first-run']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:5173',{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>window.__kyoto,{},{timeout:120000});
 await page.evaluate(()=>{__kyoto.world.update=()=>{};});
 const evidence=[];
 for(const id of ['maruyama-blossom','maruyama-garden','kiyomizu-stage']){
  for(const enabled of [0,1]){
   const shot=await page.evaluate(async({id,enabled})=>{__kyoto.pipeline.ink.mat.uniforms.uPaintedSurfaces.value=enabled;return __shot(id,1600,900);},{id,enabled});
   const file=`${id}-${enabled?'painted':'full-ink'}.png`;
   await fs.writeFile(`${out}/${file}`,Buffer.from(shot.dataURL.split(',')[1],'base64'));
   evidence.push({id,painted:!!enabled,file,metrics:shot.metrics});
  }
 }
 const mask=await page.evaluate(()=>{const rt=__kyoto.pipeline.rtScene,pixels=new Uint16Array(rt.width*rt.height*4);__kyoto.renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,pixels);let masked=0,opaque=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===15360)opaque++;else if(pixels[i]>0&&pixels[i]<15360)masked++;}return {format:'RGBA16F; alpha 0x3c00 is1',maskedPixels:masked,ordinaryOpaquePixels:opaque,totalPixels:rt.width*rt.height};});
 await fs.writeFile(`${out}/manifest.json`,JSON.stringify({createdAt:new Date().toISOString(),method:'Same browser world, same geometry/cameras, ambient updates frozen; only uPaintedSurfaces changes between each pair.',errors,mask,evidence},null,2));
 console.log(JSON.stringify({errors,mask,captures:evidence.length}));
}finally{await browser.close();}
