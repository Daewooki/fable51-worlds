import {chromium} from 'playwright';
import fs from 'node:fs/promises';
await fs.mkdir('qa/machiya-selftests',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-background-networking']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',e=>{if(e.type()==='error')console.error(e.text());});
await page.goto('http://localhost:5174/docs/machiya-preview.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>typeof window.selectArchitecture==='function');
const stats={};
for(const name of['gion','hill','street','details']){
 await page.evaluate(name=>window.selectArchitecture(name),name);
 await page.screenshot({path:`qa/machiya-selftests/${name}.png`});
 stats[name]=await page.evaluate(()=>window.architectureStats);
}
await fs.writeFile('qa/machiya-selftests/stats.json',JSON.stringify({errors,stats},null,2));console.log(JSON.stringify({errors,stats},null,2));await browser.close();
