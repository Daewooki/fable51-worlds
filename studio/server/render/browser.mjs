import { chromium } from 'playwright';

export const WORLD_PORTS = { 'union-square-sf': 5173, 'kyoto-higashiyama': 5174 };

const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--hide-scrollbars'];
const SOFT = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'];

export async function launchWorld({ world, width = 1280, height = 720, time = 'sunset', quality = 'med', software = false, extraQuery = '', port: portOverride } = {}) {
  const port = portOverride ?? WORLD_PORTS[world];
  if (!port) throw new Error(`unknown world ${world}`);
  // `studio=1` as well as `qa=1`, exactly as the world contract in studio/README.md
  // documents ("The world is always opened as ?qa=1&ui=0&studio=1&life=0&time=&q="). It is
  // what tells a world that something else is driving its camera: union-square-sf switches
  // its own controllers off, kyoto-higashiyama parks its frame loop (its `qa=1` path is that
  // world's own capture tooling and must keep a live loop).
  const url = `http://localhost:${port}/?qa=1&ui=0&studio=1&life=0&time=${time}&q=${quality}${extraQuery}`;

  const attempt = async (args, softwareRender) => {
    const browser = await chromium.launch({ headless: true, args });
    const errors = [];
    try {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url, { waitUntil: 'load', timeout: 240000 });
      await page.waitForFunction(() => window.__twin?.ready || window.__twinError, null, { timeout: 240000 });
      const state = await page.evaluate(() => ({ ready: !!window.__twin?.ready, err: window.__twinError || null }));
      if (!state.ready) throw new Error(state.err || 'failed');
      return { browser, page, softwareRender, errors };
    } catch (e) {
      const rawMessage = String((e && e.message) || e);
      const isTimeout = /timeout/i.test(rawMessage);
      await browser.close().catch(() => {});
      const reason = isTimeout ? 'timeout' : rawMessage.slice(0, 200);
      const err = new Error(`world load ${reason}`);
      err.isTimeout = isTimeout;
      err.pageErrors = errors;
      throw err;
    }
  };

  if (software) return attempt(SOFT, true);
  try {
    return await attempt(GPU, false);
  } catch (e) {
    if (e.isTimeout) throw e;
    return attempt(SOFT, true);
  }
}
