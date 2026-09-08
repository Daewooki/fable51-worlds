import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.KYOTO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const output='qa/material-comparison';await fs.mkdir(output,{recursive:true});const results=[];
try{
 await page.goto(process.env.KYOTO_QA_URL||'http://localhost:5173',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__kyoto);
 for(const id of ['pagoda-close','kiyomizu-stage','kiyomizu-veranda']){
  const pose=await page.evaluate(id=>__kyoto.heroes.find(h=>h.id===id),id);
  const selected=await page.evaluate(()=>{const found=new Set();__kyoto.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(m?.emissive&&m.emissiveIntensity>=.05&&m.emissiveIntensity<=.11&&m.emissive.getHex()===m.color?.getHex()){m.userData.qaSavedFill=m.emissiveIntensity;m.emissiveIntensity=0;found.add(m.uuid);}}});return found.size;});
  const before=await page.evaluate(async({id,pose})=>(await __shot(id,1600,900,pose)).dataURL,{id,pose});
  await fs.writeFile(`${output}/${id}-fill-off.png`,Buffer.from(before.split(',')[1],'base64'));
  await page.evaluate(()=>__kyoto.scene.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m?.userData.qaSavedFill!==undefined){m.emissiveIntensity=m.userData.qaSavedFill;delete m.userData.qaSavedFill;}}));
  const after=await page.evaluate(async({id,pose})=>(await __shot(id,1600,900,pose)).dataURL,{id,pose});
  await fs.writeFile(`${output}/${id}-fill-on.png`,Buffer.from(after.split(',')[1],'base64'));
  results.push({id,materialsCompared:selected,pose});console.log(id,selected);
 }
 await fs.writeFile(`${output}/comparison.json`,JSON.stringify({method:'Same browser, camera and source. Selected hero timber emissive intensities temporarily set to zero, then restored. These are controlled A/B renders, not edited images.',results},null,2));
}finally{await browser.close();}
