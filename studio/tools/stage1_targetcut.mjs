/**
 * One-off driver for the Pangyo stage-1 target cut (SDD task 3).
 *
 * Drives the *real* Director UI on :5180 with Playwright — create project -> create shot ->
 * set keys -> Check path -> (Fix path, if the check is not clear) -> Render previz — so the
 * whole studio integration (WORLDS, WORLD_PORTS, the world iframe, probePath over the bridge,
 * the job runner) is exercised exactly as a person would exercise it.
 *
 * Like tools/e2e.mjs it starts its own studio server, on --port (default 5193), and rewrites
 * the Director's /api and /files calls to it, so it neither needs nor disturbs a studio
 * server already running on :5190. Unlike e2e.mjs it points that server at the repo's real
 * projects dir, because the previz it renders is a deliverable.
 *
 * Requires pangyo-technovalley's dev server on :5175, the Director UI on :5180, ffmpeg on
 * PATH and Playwright chromium.
 *
 *   cd studio && node tools/stage1_targetcut.mjs
 */
import { GPU_ARGS } from '../server/render/browser.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const STUDIO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = Number(arg('port', 5193));
const UI = arg('ui', 'http://localhost:5180');
const PROJECTS = path.resolve(arg('projects', path.join(STUDIO, 'projects')));
const API = `http://127.0.0.1:${PORT}`;

const t0 = Date.now();
const secs = (ms) => (ms / 1000).toFixed(1);
const say = (...a) => console.log(`[${secs(Date.now() - t0)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 8 s, 1920x1080, sunset — aerial over the NC R&D Center, descend to its forecourt, then
// south down 판교역로 toward 판교역. Key 1 is tour.json stop 1 verbatim; keys 2-5 keep the
// stops' ground positions but carry authored altitudes, because the tour's street-level eye
// heights would make an 8 s move dive 140 m and climb back out twice, and because the
// fitted (axis-aligned) 판교역로 runs through 삼성화재 판교사옥's massing at z ~ 210-260 and
// through the 카카오 판교아지트 block south of z ~ 380, so the southbound leg rises over them
// and ends looking down on the 판교역 / 알파돔시티 cluster rather than inside it.
const KEYS = [
  { t: 0.0, m: 'air', eye: [40, 140, 220], look: [0, 20, 0], cap: 'NCSOFT R&D Center · 판교테크노밸리' },
  { t: 2.2, m: 'air', eye: [26, 66, 110], look: [0, 28, 10] },
  { t: 4.0, m: 'air', eye: [86, 30, 10], look: [90, 8, 250] },
  { t: 6.0, m: 'air', eye: [80, 55, 110], look: [92, 10, 370] },
  { t: 8.0, m: 'air', eye: [45, 85, 300], look: [105, 12, 530], cap: '판교역 · 알파돔시티' },
];

const jfetch = async (url, init) => {
  const r = await fetch(url, { headers: { connection: 'close', ...(init?.headers || {}) }, ...init });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init?.method || 'GET'} ${url} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

fs.mkdirSync(PROJECTS, { recursive: true });
say(`studio server :${PORT} · projects ${PROJECTS}`);
const server = spawn(process.execPath, [path.join(STUDIO, 'server', 'index.mjs')], {
  cwd: STUDIO,
  env: { ...process.env, STUDIO_PORT: String(PORT), STUDIO_PROJECTS: PROJECTS, STUDIO_LLM: 'none' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`  [server] ${d}`));

let browser;
try {
  for (let i = 0; ; i++) {
    try { await jfetch(`${API}/api/config`); break; } catch (e) { if (i > 60) throw e; await sleep(500); }
  }
  say('studio server up');

  browser = await chromium.launch({
    headless: true,
    args: GPU_ARGS,
  });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  page.on('pageerror', (e) => console.error('  [page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [page console]', m.text()); });

  // Re-point the Director's own /api and /files calls at our server. `fulfill` (rather than
  // `continue({url})`) keeps the response same-origin as far as the page is concerned, so no
  // CORS or Host-allowlist question arises.
  await page.route((url) => url.pathname.startsWith('/api') || url.pathname.startsWith('/files'), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const to = API + u.pathname + u.search;
    const r = await fetch(to, {
      method: req.method(),
      headers: { ...req.headers(), host: `127.0.0.1:${PORT}`, origin: API, referer: API + '/', connection: 'close' },
      body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(),
    });
    const body = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) headers[k] = v; });
    await route.fulfill({ status: r.status, headers, body });
  });

  await page.goto(UI, { waitUntil: 'load', timeout: 120000 });
  say('Director UI loaded');

  /* ------------------------------------------------------------------ project + shot */
  await page.fill('#np-name', 'Pangyo stage 1');
  await page.selectOption('#np-world', 'pangyo-technovalley');
  await page.click('#np-create');
  await page.waitForFunction(() => document.querySelector('#shot-select') !== null, null, { timeout: 30000 });
  await sleep(500);

  await page.fill('#ns-name', 'target cut — 8 s 1080p sunset');
  await page.fill('#ns-fps', '30');
  await page.fill('#ns-w', '1920');
  await page.fill('#ns-h', '1080');
  await page.selectOption('#ns-time', 'sunset');
  await page.click('#ns-create');
  say('project + shot created; waiting for the world iframe…');

  // mountWorldForShot() publishes __studio once the world's bridge is ready.
  await page.waitForFunction(() => !!window.__studio, null, { timeout: 300000 });
  const worldMs = Date.now() - t0;
  say(`world ready in the Director iframe (${secs(worldMs)}s)`);

  const meta = await page.evaluate(() => ({
    projectId: window.__studio.ctx.project.id,
    shotId: window.__studio.ctx.shot.id,
    world: window.__studio.ctx.project.world,
    shot: { fps: window.__studio.ctx.shot.fps, width: window.__studio.ctx.shot.width, height: window.__studio.ctx.shot.height, timeOfDay: window.__studio.ctx.shot.timeOfDay },
    iframeSrc: document.getElementById('world').src,
  }));
  say('project', JSON.stringify(meta));

  /* ------------------------------------------------------------------------- keys */
  await page.evaluate(async (keys) => {
    const ctx = window.__studio.ctx;
    ctx.shot.keys = keys;
    await ctx.save();
    ctx.refresh();
  }, KEYS);
  say('keys set');

  /* ------------------------------------------------------- collision check + fix */
  // `updateScrubber()` also schedules a debounced auto-check on every refresh, so a settled
  // reading is one that matches a terminal message twice in a row a second apart — otherwise
  // we can read the result of the manual check just before the debounced one repaints
  // "checking path…" over it.
  const SETTLED = () => {
    const t = document.getElementById('path-status').textContent || '';
    return /path clear|collision|path check failed/.test(t) ? t : false;
  };
  const waitPath = async (label) => {
    let status;
    for (;;) {
      await page.waitForFunction(SETTLED, null, { timeout: 300000 });
      status = await page.evaluate(SETTLED);
      await sleep(1200);
      const again = await page.evaluate(SETTLED);
      if (again && again === status) break;
    }
    say(`${label}: ${status}`);
    return status;
  };

  await page.click('#vc-check');
  const before = await waitPath('check path');

  let after = before;
  if (!/path clear/.test(before)) {
    await page.waitForSelector('#vc-fix:not([disabled])', { timeout: 60000 });
    await page.click('#vc-fix');
    // runPathFix() leaves the collision list on screen while it works (it only repaints
    // `path-status` at the end), so the thing to wait on is its own status line, not that.
    await page.waitForFunction(() => /path fixed|path already clear|could not fix|path fix failed/
      .test(document.getElementById('status-line').textContent || ''), null, { timeout: 300000 });
    say('fix status line:', await page.evaluate(() => document.getElementById('status-line').textContent));
    after = await waitPath('after fix path');
  }
  const finalKeys = await page.evaluate(() => JSON.parse(JSON.stringify(window.__studio.ctx.shot.keys)));
  say('final keys', JSON.stringify(finalKeys));
  if (!/path clear/.test(after)) throw new Error(`path is still not clear: ${after}`);

  /* ---------------------------------------------------------------------- previz */
  const renderT0 = Date.now();
  await page.click('#job-previz');
  say('previz job started');
  let job = null;
  for (;;) {
    const jobs = await jfetch(`${API}/api/projects/${meta.projectId}/jobs`);
    job = jobs.find((j) => j.type === 'previz');
    if (job && job.status === 'done') break;
    if (job && job.status === 'failed') throw new Error(`previz failed: ${job.error}`);
    await sleep(2000);
  }
  const renderMs = Date.now() - renderT0;
  say(`previz done in ${secs(renderMs)}s`, JSON.stringify(job.artifacts));

  const out = {
    projectId: meta.projectId, shotId: meta.shotId, iframeSrc: meta.iframeSrc, shot: meta.shot,
    authoredKeys: KEYS, finalKeys,
    pathBefore: before, pathAfter: after,
    worldReadyMs: worldMs, renderMs, artifacts: job.artifacts,
  };
  fs.writeFileSync(path.join(PROJECTS, meta.projectId, 'stage1-targetcut.json'), JSON.stringify(out, null, 2));
  console.log('\nRESULT ' + JSON.stringify(out));
} finally {
  await browser?.close().catch(() => {});
  server.kill();
  await sleep(400);
}
