import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.setContent(`<iframe id="w" src="http://localhost:5173/?qa=1&ui=0&studio=1&life=0&q=low" style="width:640px;height:360px"></iframe>`);
const ready = await page.evaluate(() => new Promise((res) => { window.addEventListener('message', (e) => { if (e.data?.type === 'studio:ready') res(true); }); setTimeout(() => res(false), 240000); }));
if (!ready) { console.error('FAIL: no studio:ready'); process.exit(1); }
const res = await page.evaluate(() => new Promise((res) => {
  const id = 'k1'; window.addEventListener('message', (e) => { if (e.data?.type === 'studio:res' && e.data.id === id) res(e.data); });
  document.getElementById('w').contentWindow.postMessage({ type: 'studio:cmd', id, cmd: 'setCameraRaw', eye: [10, 50, 10], look: [0, 0, 0], fov: 50 }, '*');
}));
const pos = await page.evaluate(() => new Promise((res) => { const id = 'k2'; window.addEventListener('message', (e) => { if (e.data?.type === 'studio:res' && e.data.id === id) res(e.data.data); }); document.getElementById('w').contentWindow.postMessage({ type: 'studio:cmd', id, cmd: 'pos' }, '*'); }));
console.log(JSON.stringify({ res, pos }));
await browser.close();
if (!res.ok || Math.abs(pos.eye[1] - 50) > 0.01 || Math.abs(pos.fov - 50) > 0.01) { console.error('FAIL: camera not applied'); process.exit(1); }
console.log('PASS studio bridge');
