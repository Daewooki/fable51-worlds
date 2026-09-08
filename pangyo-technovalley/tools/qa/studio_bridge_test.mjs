import { chromium } from 'playwright';
const LAUNCH_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--enable-unsafe-swiftshader', '--hide-scrollbars'];

async function waitReady(page) {
  const ready = await page.evaluate(() => new Promise((res) => { window.addEventListener('message', (e) => { if (e.data?.type === 'studio:ready') res(true); }); setTimeout(() => res(false), 240000); }));
  if (!ready) { console.error('FAIL: no studio:ready'); process.exit(1); }
}

function postCmd(page, cmd) {
  return page.evaluate((cmd) => new Promise((res) => {
    window.addEventListener('message', function onMsg(e) { if (e.data?.type === 'studio:res' && e.data.id === cmd.id) { window.removeEventListener('message', onMsg); res(e.data); } });
    document.getElementById('w').contentWindow.postMessage(cmd, '*');
  }), cmd);
}

const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });

// --- scenario 1: default (walk) mode ---
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.setContent(`<iframe id="w" src="http://localhost:5175/?qa=1&ui=0&studio=1&life=0&q=low" style="width:640px;height:360px"></iframe>`);
await waitReady(page);

const res = await postCmd(page, { type: 'studio:cmd', id: 'k1', cmd: 'setCameraRaw', eye: [10, 50, 10], look: [0, 0, 0], fov: 50 });
const pos = (await postCmd(page, { type: 'studio:cmd', id: 'k2', cmd: 'pos' })).data;
console.log(JSON.stringify({ res, pos }));
if (!res.ok || Math.abs(pos.eye[1] - 50) > 0.01 || Math.abs(pos.fov - 50) > 0.01) { console.error('FAIL: camera not applied'); process.exit(1); }

// --- unknown-command error path ---
const bad = await postCmd(page, { type: 'studio:cmd', id: 'k3', cmd: 'nope' });
console.log(JSON.stringify({ bad }));
if (bad.ok !== false || !bad.error) { console.error('FAIL: unknown cmd did not return ok:false with an error'); process.exit(1); }
await page.close();

// --- scenario 2: orbit mode — camera must stick after several frames (re-assert fix) ---
const page2 = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page2.setContent(`<iframe id="w" src="http://localhost:5175/?qa=1&ui=0&studio=1&life=0&q=low&mode=orbit" style="width:640px;height:360px"></iframe>`);
await waitReady(page2);
const res2 = await postCmd(page2, { type: 'studio:cmd', id: 'o1', cmd: 'setCameraRaw', eye: [10, 50, 10], look: [0, 0, 0], fov: 50 });
if (!res2.ok) { console.error('FAIL: orbit-mode camera set did not ack'); process.exit(1); }
await page2.waitForTimeout(400);
const pos2 = (await postCmd(page2, { type: 'studio:cmd', id: 'o2', cmd: 'pos' })).data;
console.log(JSON.stringify({ res2, pos2 }));
if (Math.abs(pos2.eye[1] - 50) > 0.01) { console.error('FAIL: orbit controller overwrote camera after setCameraRaw'); process.exit(1); }
await page2.close();

await browser.close();
console.log('PASS studio bridge');
