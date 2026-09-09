### Task 4: headless world browser helper

**Files:**
- Create: `studio/server/render/browser.mjs`
- Test: `studio/test/browser.test.mjs` (integration; requires the world dev server on 5173)

**Interfaces:**
- Produces: `WORLD_PORTS = { 'union-square-sf': 5173, 'kyoto-higashiyama': 5174 }`; `launchWorld({ world, width, height, time, quality='med', software=false })` → `{ browser, page, softwareRender: boolean }` with `window.__twin.ready` awaited (240 s); throws `Error('world load timeout')`.

- [ ] **Step 1: Write the failing test**

```js
import { it, expect } from 'vitest';
import { launchWorld } from '../server/render/browser.mjs';
it('loads union-square-sf headless and exposes __twin', async () => {
  const { browser, page, softwareRender } = await launchWorld({ world: 'union-square-sf', width: 640, height: 360, time: 'sunset', quality: 'low' });
  const ready = await page.evaluate(() => !!window.__twin?.ready);
  await browser.close();
  expect(ready).toBe(true); expect(typeof softwareRender).toBe('boolean');
}, 300000);
```

- [ ] **Step 2: Run** — `npx vitest run test/browser.test.mjs` → FAIL (module missing)

- [ ] **Step 3: Implement `studio/server/render/browser.mjs`**

```js
import { chromium } from 'playwright';
export const WORLD_PORTS = { 'union-square-sf': 5173, 'kyoto-higashiyama': 5174 };
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--hide-scrollbars'];
const SOFT = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'];

export async function launchWorld({ world, width = 1280, height = 720, time = 'sunset', quality = 'med', software = false, extraQuery = '' }) {
  const port = WORLD_PORTS[world]; if (!port) throw new Error(`unknown world ${world}`);
  const url = `http://localhost:${port}/?qa=1&ui=0&life=0&time=${time}&q=${quality}${extraQuery}`;
  const attempt = async (args, softwareRender) => {
    const browser = await chromium.launch({ headless: true, args });
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load' });
    const ok = await page.waitForFunction(() => window.__twin?.ready || window.__twinError, null, { timeout: 240000 }).then(() => true).catch(() => false);
    const state = ok ? await page.evaluate(() => ({ ready: !!window.__twin?.ready, err: window.__twinError || null })) : { ready: false, err: 'timeout' };
    if (!state.ready) { await browser.close(); throw new Error(`world load ${state.err || 'failed'}: ${errors.slice(0, 2).join(' | ')}`); }
    return { browser, page, softwareRender, errors };
  };
  if (software) return attempt(SOFT, true);
  try { return await attempt(GPU, false); }
  catch (e) { if (/timeout/.test(String(e))) throw e; return attempt(SOFT, true); }
}
```

- [ ] **Step 4: Run** (world dev server running) — Expected: PASS.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): headless world launcher with GPU/software fallback"`

---

