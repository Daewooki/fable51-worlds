### Task 3: world patches — studio bridge + asset override hook (union-square-sf)

**Files:**
- Create: `union-square-sf/src/debug/StudioBridge.ts`
- Modify: `union-square-sf/src/main.ts` (after `installQa(...)` call; and the `loadManifests([...])` array)
- Modify: `union-square-sf/src/assets/Assets.ts:76-90` (`load()`)
- Test: `union-square-sf/tools/qa/studio_bridge_test.mjs` (Playwright, run against the dev server)

**Interfaces:**
- Produces (postMessage protocol, both directions `{ type, id?, ...}`): parent→world `{type:'studio:cmd', id, cmd:'setCameraRaw', eye:[x,y,z], look:[x,y,z], fov?}` | `cmd:'setTime', p` | `cmd:'freeze', v` | `cmd:'pos'` | `cmd:'ping'`; world→parent `{type:'studio:ready'}` on load, `{type:'studio:res', id, ok, data?, error?}` per cmd, `{type:'studio:pos', pos:{x,y,z}}` every 250 ms.
- Produces: `Assets.overrides: Record<string,string>` loaded from `${BASE}data/asset_overrides.json` (missing file ⇒ `{}`); `Assets.load(rel)` uses `overrides[rel] ?? rel` for the file path only (manifest key unchanged).

- [ ] **Step 1: Find the exact patch points**

Run: `grep -n "installQa\|loadManifests" union-square-sf/src/main.ts` and `grep -n "load(rel" union-square-sf/src/assets/Assets.ts`. Note the line numbers (the `installQa({...})` call is near the end of `main()`; `loadManifests(['arch','street','retail','vehicles','veg','people'])` is the 4th statement).

- [ ] **Step 2: Create `StudioBridge.ts`**

```ts
// postMessage bridge so MV Studio can drive this world inside an iframe (?studio=1).
import * as THREE from 'three';
import type { TwinApi } from './Qa';
import type { App } from '../app/App';

export function installStudioBridge(app: App, twin: TwinApi) {
  const send = (msg: any) => window.parent !== window && window.parent.postMessage(msg, '*');
  const handlers: Record<string, (m: any) => any> = {
    ping: () => 'pong',
    setCameraRaw: (m) => { app.camera.position.set(m.eye[0], m.eye[1], m.eye[2]); app.camera.lookAt(m.look[0], m.look[1], m.look[2]); if (m.fov) { app.camera.fov = m.fov; app.camera.updateProjectionMatrix(); } return true; },
    setTime: (m) => { twin.setTime(m.p); return true; },
    freeze: (m) => { twin.freeze(!!m.v); return true; },
    setMode: (m) => { twin.setMode(m.m); return true; },
    pos: () => { const c = app.camera; const d = c.getWorldDirection(new THREE.Vector3()); return { eye: [c.position.x, c.position.y, c.position.z], look: [c.position.x + d.x * 10, c.position.y + d.y * 10, c.position.z + d.z * 10], fov: c.fov }; },
  };
  window.addEventListener('message', (ev) => {
    const m = ev.data; if (!m || m.type !== 'studio:cmd') return;
    try { const h = handlers[m.cmd]; if (!h) throw new Error(`unknown cmd ${m.cmd}`); send({ type: 'studio:res', id: m.id, ok: true, data: h(m) }); }
    catch (e: any) { send({ type: 'studio:res', id: m.id, ok: false, error: String(e?.message || e) }); }
  });
  setInterval(() => { const c = app.camera.position; send({ type: 'studio:pos', pos: { x: c.x, y: c.y, z: c.z } }); }, 250);
  send({ type: 'studio:ready' });
}
```

- [ ] **Step 3: Patch `main.ts`**

Add `'varco'` to the `loadManifests` array: `await Assets.loadManifests(['arch', 'street', 'retail', 'vehicles', 'veg', 'people', 'varco']);` (a missing manifest only logs `manifest missing varco`, which is fine).
Immediately after the existing `installQa({ ... })` call add:
```ts
  if (new URLSearchParams(location.search).get('studio') === '1') { const { installStudioBridge } = await import('./debug/StudioBridge'); installStudioBridge(app, (window as any).__twin); }
```
Also, in walk/orbit modes the controllers overwrite the camera each frame. When `studio=1`, disable them once after mode setup: add right after `setMode(mode);` near the end of `main()`:
```ts
  if (new URLSearchParams(location.search).get('studio') === '1') { walk.enabled = false; orbit.setEnabled(false); }
```

- [ ] **Step 4: Patch `Assets.load()`** — add an `overrides` map and use it for the file path:

```ts
  overrides: {} as Record<string, string>,
  async loadOverrides() { try { const r = await fetch(`${BASE}data/asset_overrides.json`); if (r.ok) this.overrides = await r.json(); } catch { /* none */ } },
```
and in `load(rel)` change `loader.load(\`${BASE}assets/models/${rel}.glb\`` to `loader.load(\`${BASE}assets/models/${this.overrides[rel] ?? rel}.glb\``. Call `await Assets.loadOverrides();` in `main.ts` right after `loadManifests`.

- [ ] **Step 5: Write the Playwright test** `union-square-sf/tools/qa/studio_bridge_test.mjs`

```js
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
```

- [ ] **Step 6: Run** — start `npm run dev` in `union-square-sf` (port 5173), then `node tools/qa/studio_bridge_test.mjs` → Expected: `PASS studio bridge`. Also `npm run typecheck` → no errors. Open `http://localhost:5173/` without `studio=1` and confirm walking still works (controllers untouched).

- [ ] **Step 7: Commit** — `git add union-square-sf/src union-square-sf/tools/qa/studio_bridge_test.mjs && git commit -m "feat(union-square-sf): studio postMessage bridge and asset override hook"`

---

