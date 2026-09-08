import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-background-networking']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>console.error('PAGE',e.message));page.on('console',e=>{if(e.type()==='error')console.error('CONSOLE',e.text());});
await page.goto('http://localhost:5174/docs/hero-preview.html',{waitUntil:'networkidle'});
const stats={};
for(const name of ['pagoda','shrine','gate','temple']){
 await page.evaluate(name=>window.selectHero(name),name);
 await page.waitForTimeout(300);
 await page.screenshot({path:`qa/hero-selftests/${name}.png`});
 stats[name]=await page.evaluate(()=>window.heroStats);
}
await fs.writeFile('qa/hero-selftests/stats.json',JSON.stringify(stats,null,2));console.log(stats);await browser.close();
