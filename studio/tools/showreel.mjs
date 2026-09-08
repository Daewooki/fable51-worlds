/**
 * The public showreel for the MV Studio fork.
 *
 *   cd studio && node tools/showreel.mjs [--out ../docs/media] [--skip-render]
 *
 * Produces `docs/media/mv-studio-showreel.mp4` (1920x1080 / 30 fps / H.264 CRF 20, silent),
 * `docs/media/showreel.gif`, `docs/media/showreel-poster.jpg` and one still from the Director
 * capture, by doing five things in order:
 *
 *   1. three previz renders (pangyo 20 s sunset->night with life, union 12 s sunset with life,
 *      kyoto 12 s sunset) driven through the *real* Director UI with Playwright — set keys on
 *      `window.__studio.ctx.shot`, Check path, Fix path until `path clear`, Render previz;
 *   2. a Playwright `recordVideo` capture of the Director itself — prompt -> path, the red
 *      collision bands, Fix path, scrubbing, Render previz — and a phone-camera moment driven
 *      by synthetic `cam` messages over the `/ws` relay;
 *   3. ffmpeg assembly: title card, the segments with 0.5 s xfades and lower-third captions,
 *      an end card;
 *   4. ffprobe verification;
 *   5. the GIF, the poster and the README still.
 *
 * Like `tools/e2e.mjs` and `tools/stage1_targetcut.mjs` it starts **its own** studio server on
 * its own port with its own projects dir, and rewrites the Director's `/api` and `/files`
 * calls to it, so a studio server already running on :5190 is neither needed nor disturbed and
 * **nothing is written under `studio/projects/`**. The one thing it does share with :5190 is
 * the `/ws` relay behind the Director's own origin — WebSockets cannot be re-routed by
 * `page.route` — which is why the phone moment reads its token from :5190.
 *
 * Requires: the three world dev servers (5173/5174/5175) and the Director UI (5180) up
 * (`npm run up`), ffmpeg/ffprobe 7.x on PATH, Playwright chromium, a GPU.
 *
 * Rendered segments are cached under `--work` (default %TMP%/mv-studio-showreel) so
 * `--skip-render` re-assembles the reel from them in seconds.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const STUDIO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = path.resolve(STUDIO, '..');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);

const OUT = path.resolve(ROOT, arg('out', 'docs/media'));
const WORK = path.resolve(arg('work', path.join(os.tmpdir(), 'mv-studio-showreel')));
const SEG_DIR = path.join(WORK, 'segments');
const PORT = Number(arg('port', 5210));
const UI = arg('ui', 'http://localhost:5180');
const LIVE_API = arg('live-api', 'http://localhost:5190'); // only for the /ws phone token
const API = `http://127.0.0.1:${PORT}`;
const SKIP_RENDER = has('skip-render');
const ONLY = arg('only', '');

const t0 = Date.now();
const secs = (ms) => (ms / 1000).toFixed(1);
const say = (...a) => console.log(`[${secs(Date.now() - t0)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ the three world shots */

// Every eye position below was checked against the live world with the same downward-ray
// probe the Director uses (`window.__twin.probePath`, `blocked = y < ground + 0.3 ||
// (structure && y < top + clearance)`), because "Fix path" lifts blocked *segments* but
// deliberately refuses to move a key that is itself inside a structure.

// Pangyo, 20 s, sunset -> night, life on. A half-circle aerial arc around the NCSOFT R&D
// Center at the world origin (r 340 -> 270 m, y 150 -> 120), a swing around the building's
// west side and down to its south forecourt (tour.json stop 2, `[0, 0.5, 44]`), a hard cut to
// 판교역로 at 8 m, a dolly south, and a climb that reveals the 판교역 / 알파돔시티 cluster.
// The descent goes *around* the tower rather than over it — a straight line from the arc to
// the forecourt passes through the NC massing (surface 55 m at [-35, 0]) — and the climb
// starts at z = 150, because the fitted straight 판교역로 runs through 삼성화재 판교사옥
// (surface 58.3 m at z = 240) and 카카오 판교아지트 (49.0 m at z = 260), the stage-1
// approximation the world's QA report records. `time: 'night'` rides on the cut key, so the
// change of hour is motivated by the cut rather than dissolving mid-move.
const PANGYO_KEYS = [
  { t: 0.0, m: 'air', eye: [219, 150, 260], look: [0, 30, 0] },
  { t: 2.6, m: 'air', eye: [-28, 143, 319], look: [0, 30, 0] },
  { t: 5.2, m: 'air', eye: [-230, 133, 193], look: [0, 30, 0] },
  { t: 7.8, m: 'air', eye: [-279, 126, -24], look: [0, 30, 0] },
  { t: 9.6, m: 'air', eye: [-180, 120, -200], look: [0, 30, 0] },
  { t: 11.0, m: 'air', eye: [-85, 45, -10], look: [0, 28, 0] },
  { t: 12.1, m: 'air', eye: [-55, 26, 45], look: [0, 26, 0] },
  { t: 13.1, m: 'air', eye: [0, 5, 52], look: [0, 24, 0] },
  { t: 14.1, m: 'air', eye: [86, 8, -32], look: [92, 8, 190], cut: true, time: 'night' },
  { t: 15.6, m: 'air', eye: [85, 8, 90], look: [95, 8, 300] },
  { t: 16.6, m: 'air', eye: [85, 9, 150], look: [98, 9, 340] },
  { t: 18.4, m: 'air', eye: [88, 66, 205], look: [130, 14, 430] },
  { t: 20.0, m: 'air', eye: [132, 118, 395], look: [195, 16, 530] },
];

// Union Square, 12 s, sunset, life on. Built on the TOURS anchors in server/prompt.mjs — the
// aerial [40,140,260], the Dewey Monument [-22,6,24] and Apple Union Square [44,0.5,-36] —
// except that the Apple anchor is *inside* that building as far as the roof probe is
// concerned (surface 11.3 m), so the last key stops on the plaza side of its façade.
const UNION_KEYS = [
  { t: 0.0, m: 'air', eye: [40, 140, 260], look: [0, 10, 0] },
  { t: 3.0, m: 'air', eye: [20, 70, 140], look: [0, 12, 0] },
  { t: 5.4, m: 'air', eye: [-24, 22, 60], look: [-4, 14, 6] },
  { t: 7.4, m: 'air', eye: [-22, 8, 26], look: [0, 16, 0] },
  { t: 9.6, m: 'air', eye: [4, 6, -6], look: [40, 6, -50] },
  { t: 12.0, m: 'air', eye: [40, 5, -22], look: [46, 7, -62] },
];

// Kyoto Higashiyama, 12 s, sunset, life off (its adapter parks the world's own frame loop).
// Hanamikoji -> up over the machiya roofs -> Yasaka-dori -> the Yasaka Pagoda. Altitudes are
// ABSOLUTE: this world models the Higashiyama hillside, so the ground under Gion is already
// ~39 m, Yasaka-dori ~53-57 m and the pagoda's own top is 101 m. The TOURS anchors for this
// world are written at `y: 1.7` — a walker's eye height, not a sea-level altitude — so they
// are used here only for their x/z, with the altitude read from the terrain.
const KYOTO_KEYS = [
  { t: 0.0, m: 'air', eye: [-382, 41.4, -578], look: [-397, 43, -520] },
  { t: 1.8, m: 'air', eye: [-383, 41.8, -556], look: [-395, 45, -490] },
  { t: 3.4, m: 'air', eye: [-380, 60, -524], look: [-350, 52, -440] },
  { t: 5.2, m: 'air', eye: [-345, 84, -450], look: [-250, 62, -330] },
  { t: 7.0, m: 'air', eye: [-235, 96, -290], look: [-150, 62, -150] },
  { t: 8.6, m: 'air', eye: [-150, 70, -110], look: [-70, 58, -20] },
  { t: 10.2, m: 'air', eye: [-88.7, 57.5, -4.6], look: [-10, 70, 0] },
  { t: 12.0, m: 'air', eye: [-50, 61.5, -2], look: [0, 78, 0] },
];

const SHOTS = [
  {
    id: 'pangyo', world: 'pangyo-technovalley', life: true, time: 'sunset',
    name: 'showreel — pangyo 20 s sunset→night', keys: PANGYO_KEYS,
    caption: 'Pangyo Techno Valley — built from OpenStreetMap + SRTM in a day',
  },
  {
    id: 'union', world: 'union-square-sf', life: true, time: 'sunset',
    name: 'showreel — union square 12 s sunset', keys: UNION_KEYS,
    caption: 'Union Square — the upstream world, filmed by MV Studio',
  },
  {
    id: 'kyoto', world: 'kyoto-higashiyama', life: false, time: 'sunset',
    name: 'showreel — kyoto 12 s sunset', keys: KYOTO_KEYS,
    caption: 'Kyoto Higashiyama — same timeline, different engine',
  },
];

const DIRECTOR_UI_SEC = 15;   // the prompt -> path -> collisions -> fix -> scrub -> previz beat
const DIRECTOR_PHONE_SEC = 6; // the phone-as-camera beat
const TITLE_SEC = 3;
const END_SEC = 4;
const XFADE = 0.5;

/* ---------------------------------------------------------------------------- utilities */

const jfetch = async (url, init) => {
  const r = await fetch(url, { headers: { connection: 'close', ...(init?.headers || {}) }, ...init });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init?.method || 'GET'} ${url} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}\n${String(r.stderr).slice(-2500)}`);
  return r;
}
// Every filter-bearing call runs with cwd = WORK and names its fonts and caption files
// *relatively*: a Windows absolute path inside a filter option value would have to survive two
// levels of parser escaping for its drive colon, and a relative name has no colon at all.
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { cwd: WORK });

function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format',
    '-show_streams', '-count_frames', '-select_streams', 'v:0', file]);
  const j = JSON.parse(r.stdout);
  const v = j.streams[0];
  const [num, den] = String(v.r_frame_rate).split('/').map(Number);
  return {
    file, width: v.width, height: v.height,
    fps: den ? num / den : num,
    frames: Number(v.nb_read_frames),
    duration: Number(j.format.duration),
    bytes: Number(j.format.size),
  };
}

// The three faces the reel uses, staged into WORK so the filtergraph can name them relatively.
const FONTS = { bold: 'arialbd.ttf', regular: 'arial.ttf', korean: 'malgun.ttf' };
const FONT = FONTS.bold, FONT_REG = FONTS.regular, FONT_KR = FONTS.korean;
function stageFonts() {
  const dir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
  for (const f of Object.values(FONTS)) {
    const dest = path.join(WORK, f);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(dir, f), dest);
  }
}

let textSeq = 0;
/** drawtext reads its string from a file, so no caption ever has to be escaped for the parser. */
function textFile(s) {
  const name = `text-${String(++textSeq).padStart(2, '0')}.txt`;
  fs.writeFileSync(path.join(WORK, name), s, 'utf8');
  return name;
}

/** A lower-third caption that fades in at `from` and out by `to` (segment-local seconds). */
function lowerThird(text, from, to) {
  const a = `min(1,min(max(0,(t-${from.toFixed(2)})/0.45),max(0,(${to.toFixed(2)}-t)/0.45)))`;
  return `drawtext=fontfile=${FONT}:textfile=${textFile(text)}:x=64:y=h-136:fontsize=42`
    + `:fontcolor=white:box=1:boxcolor=0x0a0c12@0.62:boxborderw=22:alpha='${a}'`;
}

/* ------------------------------------------------------------------ the private studio server */

function startServer() {
  fs.mkdirSync(WORK, { recursive: true });
  const projects = path.join(WORK, 'projects');
  fs.mkdirSync(projects, { recursive: true });
  say(`studio server :${PORT} · projects ${projects}`);
  const server = spawn(process.execPath, [path.join(STUDIO, 'server', 'index.mjs')], {
    cwd: STUDIO,
    env: { ...process.env, STUDIO_PORT: String(PORT), STUDIO_PROJECTS: projects, STUDIO_LLM: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`  [server] ${d}`));
  return server;
}

/** Re-point the Director's own /api and /files calls at our server (same trick as stage1_targetcut). */
async function routeApi(page) {
  await page.route((url) => url.pathname.startsWith('/api') || url.pathname.startsWith('/files'), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const r = await fetch(API + u.pathname + u.search, {
      method: req.method(),
      headers: { ...req.headers(), host: `127.0.0.1:${PORT}`, origin: API, referer: API + '/', connection: 'close' },
      body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(),
    });
    const body = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) headers[k] = v; });
    await route.fulfill({ status: r.status, headers, body });
  });
}

/** `path-status` settles when the same terminal message is read twice a second apart. */
const SETTLED = () => {
  const t = document.getElementById('path-status').textContent || '';
  return /path clear|collision|path check failed/.test(t) ? t : false;
};
/**
 * Click "Fix path" and wait for *this* run of it to report.
 *
 * `runPathFix()` writes its outcome into `#status-line`, which is also where **Generate**'s own
 * automatic fix leaves "path fixed — …". Waiting on that text without clearing it first matches
 * the previous run instantly and reads the pre-fix collision report back as the result.
 */
async function clickFixPath(page) {
  await page.waitForSelector('#vc-fix:not([disabled])', { timeout: 60000 });
  await page.evaluate(() => { document.getElementById('status-line').textContent = ''; });
  await page.click('#vc-fix');
  await page.waitForFunction(() => /path fixed|path already clear|could not fix|path fix failed/
    .test(document.getElementById('status-line').textContent || ''), null, { timeout: 300000 });
  return page.evaluate(() => document.getElementById('status-line').textContent);
}

async function waitPath(page, label) {
  let status;
  for (;;) {
    await page.waitForFunction(SETTLED, null, { timeout: 300000 });
    status = await page.evaluate(SETTLED);
    await sleep(1200);
    const again = await page.evaluate(SETTLED);
    if (again && again === status) break;
  }
  say(`  ${label}: ${status}`);
  return status;
}

async function newProjectAndShot(page, { project, world, shot, fps = 30, width = 1920, height = 1080, time = 'sunset', life = false }) {
  await page.fill('#np-name', project);
  await page.selectOption('#np-world', world);
  await page.click('#np-create');
  await page.waitForFunction(() => document.querySelector('#shot-select') !== null, null, { timeout: 30000 });
  await sleep(400);
  await page.fill('#ns-name', shot);
  await page.fill('#ns-fps', String(fps));
  await page.fill('#ns-w', String(width));
  await page.fill('#ns-h', String(height));
  await page.selectOption('#ns-time', time);
  if (life) await page.check('#ns-life');
  await page.click('#ns-create');
  await page.waitForFunction(() => !!window.__studio, null, { timeout: 300000 });
  return page.evaluate(() => ({
    projectId: window.__studio.ctx.project.id,
    shotId: window.__studio.ctx.shot.id,
  }));
}

/* ----------------------------------------------------------------------- 1. world renders */

async function renderShot(spec) {
  const dest = path.join(SEG_DIR, `${spec.id}.mp4`);
  if (SKIP_RENDER && fs.existsSync(dest)) { say(`  ${spec.id}: cached (${probe(dest).duration.toFixed(2)} s)`); return { dest, cached: true }; }

  const attempt = async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--hide-scrollbars'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
      page.on('pageerror', (e) => console.error('  [page error]', e.message));
      await routeApi(page);
      await page.goto(UI, { waitUntil: 'load', timeout: 120000 });

      const worldT0 = Date.now();
      const meta = await newProjectAndShot(page, {
        project: `Showreel ${spec.id}`, world: spec.world, shot: spec.name,
        time: spec.time, life: spec.life,
      });
      say(`  ${spec.id}: world ready in the Director iframe (${secs(Date.now() - worldT0)}s) ${JSON.stringify(meta)}`);

      await page.evaluate(async (keys) => {
        const ctx = window.__studio.ctx;
        ctx.shot.keys = keys;
        await ctx.save();
        ctx.refresh();
      }, spec.keys);

      await page.click('#vc-check');
      const before = await waitPath(page, 'check path');
      let after = before;
      if (!/path clear/.test(before)) {
        say('  fix:', await clickFixPath(page));
        after = await waitPath(page, 'after fix path');
      }
      if (!/path clear/.test(after)) throw new Error(`path is still not clear: ${after}`);
      const finalKeys = await page.evaluate(() => JSON.parse(JSON.stringify(window.__studio.ctx.shot.keys)));

      const renderT0 = Date.now();
      await page.click('#job-previz');
      say(`  ${spec.id}: previz started (${spec.keys[spec.keys.length - 1].t} s @ 1920×1080, life=${spec.life})`);
      let job = null, lastLog = 0;
      for (;;) {
        const jobs = await jfetch(`${API}/api/projects/${meta.projectId}/jobs`);
        job = jobs.find((j) => j.type === 'previz');
        if (job?.status === 'done') break;
        if (job?.status === 'failed') throw new Error(`previz failed: ${job.error}`);
        if (Date.now() - lastLog > 30000) { lastLog = Date.now(); say(`  ${spec.id}: ${job?.progress ?? ''} …`); }
        await sleep(2000);
      }
      const renderMs = Date.now() - renderT0;
      const src = path.join(WORK, 'projects', meta.projectId, 'shots', meta.shotId, 'previz.mp4');
      if (!fs.existsSync(src)) throw new Error(`previz.mp4 missing at ${src}`);
      fs.mkdirSync(SEG_DIR, { recursive: true });
      fs.copyFileSync(src, dest);
      say(`  ${spec.id}: previz done in ${secs(renderMs)}s -> ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
      return { renderMs, before, after, finalKeys, artifacts: job.artifacts, warnings: job.warnings || [] };
    } finally {
      await browser.close().catch(() => {});
    }
  };

  try {
    return { dest, ...(await attempt()) };
  } catch (e) {
    say(`  ${spec.id}: FAILED (${e.message}) — retrying once`);
    await sleep(4000);
    return { dest, ...(await attempt()) };
  }
}

/* ------------------------------------------------------- 2. the Director UI screen capture */

async function captureDirector() {
  const uiSeg = path.join(SEG_DIR, 'director-ui.mp4');
  const phSeg = path.join(SEG_DIR, 'director-phone.mp4');
  if (SKIP_RENDER && fs.existsSync(uiSeg) && fs.existsSync(phSeg)) { say('director capture: cached'); return { uiSeg, phSeg }; }

  const vidDir = path.join(WORK, 'capture');
  fs.rmSync(vidDir, { recursive: true, force: true });
  fs.mkdirSync(vidDir, { recursive: true });

  // The Director's /ws goes to whatever origin served the page (the running :5190 behind the
  // :5180 proxy) — page.route cannot re-route a WebSocket — so the phone leg uses that
  // server's per-process token. Everything else still goes to our own server.
  let phoneToken = '';
  try { phoneToken = (await jfetch(`${LIVE_API}/api/config`)).phoneToken || ''; } catch { /* phone beat degrades to the QR only */ }

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: vidDir, size: { width: 1920, height: 1080 } },
  });
  // A collision check on a 1080p world takes tens of seconds of *waiting*, which is nothing to
  // watch. So rather than time-lapsing the whole session, each beat contributes one short
  // window of the recording — the seconds either side of the moment something changes on
  // screen — and the reel segment is those windows cut together and nudged to length.
  const uiClips = [];
  const phoneClips = [];
  let webm;
  try {
    const page = await ctx.newPage();
    const recT0 = Date.now();
    const at = () => (Date.now() - recT0) / 1000;
    // Clips must not overlap, or the cut repeats the same seconds two or three times: a beat
    // that took less than `tail` to finish starts where the previous clip ended, not earlier.
    const push = (list, from, to) => {
      const floor = list.length ? list[list.length - 1].to : 0;
      const start = Math.max(0, from, floor);
      if (to - start > 0.4) list.push({ from: start, to });
    };
    /** the last `tail` seconds of a beat that ended now, plus `lead` seconds of reaction */
    const beat = (list, from, tail, lead = 1.2) => {
      const to = at() + lead;
      push(list, Math.max(from, to - lead - tail), to);
    };
    page.on('pageerror', (e) => console.error('  [page error]', e.message));
    await routeApi(page);
    await page.goto(UI, { waitUntil: 'load', timeout: 120000 });

    const meta = await newProjectAndShot(page, {
      project: 'Showreel director', world: 'pangyo-technovalley',
      shot: 'prompt → path → previz', width: 960, height: 540, time: 'sunset', life: true,
    });
    say(`  capture: world ready ${JSON.stringify(meta)}`);
    await sleep(1500);

    /* --- beat 1: a sentence becomes a camera path -------------------------------------- */
    let t = at();
    await page.click('#pp-prompt');
    await page.type('#pp-prompt', 'aerial over the NCSOFT R&D Center, then down to 판교역로 and south to 판교역', { delay: 45 });
    await page.fill('#pp-duration', '6');
    await sleep(900);
    push(uiClips, t, at());

    t = at();
    await page.click('#pp-generate');
    await page.waitForFunction(() => (window.__studio?.ctx?.shot?.keys?.length || 0) >= 3, null, { timeout: 120000 });
    await waitPath(page, 'generated');
    beat(uiClips, t, 2.5, 1.4);

    /* --- beat 2: re-block it as a street-level dolly and watch the check go red --------
     * Four keys that are each clear on their own, down 판교역로 at 8-9 m; the long last
     * segment crosses 삼성화재 판교사옥 (surface 58 m), which is the world's own documented
     * stage-1 approximation and exactly the kind of blocked *segment* Fix path exists for.
     * (Deliberately not "the generated path dropped to y = 8": that puts anchor keys inside
     * the NC tower, and a key inside a structure is a case Fix path refuses by design.) */
    t = at();
    await page.evaluate(async () => {
      const ctx = window.__studio.ctx;
      ctx.shot.keys = [
        { t: 0.0, m: 'air', eye: [86, 8, -32], look: [92, 8, 190] },
        { t: 2.0, m: 'air', eye: [85, 8, 90], look: [95, 8, 300] },
        { t: 3.5, m: 'air', eye: [85, 9, 150], look: [98, 9, 340] },
        { t: 6.0, m: 'air', eye: [130, 8, 390], look: [195, 12, 530] },
      ];
      await ctx.save();
      ctx.refresh();
    });
    const bad = await waitPath(page, 'flown at 8 m down 판교역로');
    beat(uiClips, t, 2.5, 1.8);

    /* --- beat 3: Fix path -------------------------------------------------------------- */
    if (!/path clear/.test(bad)) {
      t = at();
      say('  fix:', await clickFixPath(page));
      await waitPath(page, 'after fix');
      beat(uiClips, t, 2.5, 1.8);
    }

    /* --- beat 4: scrub the timeline ---------------------------------------------------- */
    t = at();
    for (const frac of [0.25, 0.5, 0.75, 1.0]) {
      await page.evaluate((f) => {
        const el = document.getElementById('scrub');
        el.value = String(Number(el.max) * f);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, frac);
      await sleep(1000);
    }
    push(uiClips, t, at());

    /* --- beat 5: render previz --------------------------------------------------------- */
    t = at();
    await page.click('#job-previz');
    await sleep(5500);
    push(uiClips, t, at());

    /* --- beat 6: the phone is the camera ----------------------------------------------- */
    // The phone panel is the last thing in the left column and sits below the fold at 1080p,
    // so open it *and* scroll it into view — the QR is the point of this beat.
    await page.evaluate(() => { document.getElementById('phone-details').open = true; });
    await page.waitForSelector('#ph-qr', { timeout: 20000 });
    await page.evaluate(() => document.getElementById('phone-details').scrollIntoView({ block: 'end' }));
    await sleep(2000);
    t = at();
    if (phoneToken) {
      const phone = await ctx.newPage();
      await phone.goto(`${UI}/phone/?projectId=${encodeURIComponent(meta.projectId)}&token=${encodeURIComponent(phoneToken)}`,
        { waitUntil: 'load', timeout: 60000 });
      await phone.waitForFunction(() => window.__ws && window.__ws.readyState === 1, null, { timeout: 20000 });
      await sleep(400);
      t = at() - 2.0; // keep a couple of seconds of the QR panel before the camera starts moving
      // A slow yaw pan with a gentle dolly, as a hand holding a phone would produce.
      for (let i = 0; i < 70; i++) {
        await phone.evaluate((yaw) => {
          const h = yaw / 2;
          window.__ws.send(JSON.stringify({ type: 'cam', q: [0, Math.sin(h), 0, Math.cos(h)], dolly: 0.55, zoom: 62, ts: Date.now() }));
        }, -0.9 + i * 0.02);
        await sleep(110);
      }
      await phone.close();
      say('  capture: phone camera drove the viewport (70 synthetic cam samples)');
    } else {
      say('  capture: no phone token from :5190 — the QR panel is shown but not driven');
      await sleep(8000);
    }
    await sleep(800);
    push(phoneClips, Math.max(0, t), at());

    webm = await page.video().path();
    await page.close();
  } finally {
    await ctx.close();
    await browser.close().catch(() => {});
  }

  const src = probe(webm);
  say(`  capture: ${webm} ${src.duration.toFixed(1)} s ${src.width}×${src.height}`);
  say(`  ui clips ${JSON.stringify(uiClips.map((c) => [+c.from.toFixed(1), +c.to.toFixed(1)]))}`);
  say(`  phone clips ${JSON.stringify(phoneClips.map((c) => [+c.from.toFixed(1), +c.to.toFixed(1)]))}`);

  // Playwright's video starts with the page, so a clip's wall-clock offsets are its offsets
  // into the file. Cut them together, then nudge the result to its slot in the reel.
  const cutClips = (dest, clips, target) => {
    const use = clips
      .map((c) => ({ from: Math.max(0, c.from), to: Math.min(c.to, src.duration) }))
      .filter((c) => c.to - c.from > 0.4);
    if (!use.length) throw new Error(`no usable clips for ${path.basename(dest)}`);
    const span = use.reduce((a, c) => a + (c.to - c.from), 0);
    const speed = Math.max(0.6, span / target);
    const parts = use.map((c, i) => `[0:v]trim=start=${c.from.toFixed(2)}:end=${c.to.toFixed(2)},setpts=PTS-STARTPTS[c${i}]`);
    const chain = use.map((_, i) => `[c${i}]`).join('');
    parts.push(`${chain}concat=n=${use.length}:v=1:a=0,setpts=PTS/${speed.toFixed(4)},fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[out]`);
    ffmpeg(['-y', '-i', webm, '-filter_complex', parts.join(';'), '-map', '[out]', '-an',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', dest]);
    say(`  capture -> ${path.basename(dest)}: ${use.length} clips, ${span.toFixed(1)} s at ${speed.toFixed(2)}× = ${probe(dest).duration.toFixed(2)} s`);
  };
  fs.mkdirSync(SEG_DIR, { recursive: true });
  cutClips(uiSeg, uiClips, DIRECTOR_UI_SEC);
  cutClips(phSeg, phoneClips, DIRECTOR_PHONE_SEC);
  return { uiSeg, phSeg, marks: { uiClips, phoneClips }, rawSeconds: src.duration };
}

/* ------------------------------------------------------------------------- 3. the assembly */

function assemble(segments, outFile) {
  // inputs: [0] title card, [1..n] segments, [n+1] end card
  const inputs = [];
  inputs.push('-f', 'lavfi', '-t', String(TITLE_SEC), '-i', 'color=c=0x0a0c12:s=1920x1080:r=30');
  for (const s of segments) inputs.push('-i', s.file);
  inputs.push('-f', 'lavfi', '-t', String(END_SEC), '-i', 'color=c=0x0a0c12:s=1920x1080:r=30');

  const filters = [];
  // title card
  filters.push(
    `[0:v]format=yuv420p,setsar=1`
    + `,drawtext=fontfile=${FONT}:textfile=${textFile('MV Studio')}:x=(w-tw)/2:y=(h/2)-110:fontsize=132:fontcolor=white`
    + `,drawtext=fontfile=${FONT_REG}:textfile=${textFile('film AI-built cities')}:x=(w-tw)/2:y=(h/2)+52:fontsize=52:fontcolor=0xc8cede`
    + `,fade=t=in:st=0:d=0.6,fade=t=out:st=${(TITLE_SEC - 0.6).toFixed(2)}:d=0.6[v0]`,
  );
  segments.forEach((s, i) => {
    const capTo = Math.min(s.duration - 0.6, 7.0);
    filters.push(`[${i + 1}:v]fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,${lowerThird(s.caption, 0.4, capTo)}[v${i + 1}]`);
  });
  const n = segments.length + 1;
  filters.push(
    `[${n}:v]format=yuv420p,setsar=1`
    + `,drawtext=fontfile=${FONT}:textfile=${textFile('github.com/Daewooki/fable51-worlds')}:x=(w-tw)/2:y=(h/2)-118:fontsize=60:fontcolor=white`
    + `,drawtext=fontfile=${FONT_REG}:textfile=${textFile('Fork of PhiloLabs/fable51-worlds · Built with Claude Code · OpenStreetMap © contributors')}:x=(w-tw)/2:y=(h/2)-16:fontsize=34:fontcolor=0xaab2c4`
    + `,drawtext=fontfile=${FONT_KR}:textfile=${textFile('판교테크노밸리 · 유니언스퀘어 · 히가시야마')}:x=(w-tw)/2:y=(h/2)+60:fontsize=38:fontcolor=0x7f8ba3`
    + `,fade=t=in:st=0:d=0.6,fade=t=out:st=${(END_SEC - 0.8).toFixed(2)}:d=0.8[v${n}]`,
  );

  // xfade chain
  const durations = [TITLE_SEC, ...segments.map((s) => s.duration), END_SEC];
  let prev = 'v0', offset = 0;
  const timeline = [];
  for (let i = 1; i <= n; i++) {
    offset += durations[i - 1] - XFADE;
    const label = i === n ? 'vout' : `x${i}`;
    filters.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${label}]`);
    timeline.push({ index: i, startsAt: +offset.toFixed(3) });
    prev = label;
  }
  const total = durations.reduce((a, b) => a + b, 0) - n * XFADE;

  ffmpeg(['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-an',
    '-c:v', 'libx264', '-crf', String(arg('crf', '20')), '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-r', '30', '-movflags', '+faststart', outFile]);
  return { total, timeline, durations };
}

/* --------------------------------------------------------------------------------- main */

fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(SEG_DIR, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
stageFonts();

const report = { startedAt: new Date().toISOString(), work: WORK, out: OUT, shots: {}, };
let server = null;
try {
  if (!SKIP_RENDER || SHOTS.some((s) => !fs.existsSync(path.join(SEG_DIR, `${s.id}.mp4`)))
      || !fs.existsSync(path.join(SEG_DIR, 'director-ui.mp4'))) {
    server = startServer();
    for (let i = 0; ; i++) {
      try { await jfetch(`${API}/api/config`); break; } catch (e) { if (i > 60) throw e; await sleep(500); }
    }
    say('studio server up');
  }

  for (const spec of SHOTS) {
    if (ONLY && !ONLY.split(',').includes(spec.id)) continue;
    say(`${spec.id}: rendering ${spec.world}`);
    report.shots[spec.id] = await renderShot(spec);
  }

  let capture = { uiSeg: path.join(SEG_DIR, 'director-ui.mp4'), phSeg: path.join(SEG_DIR, 'director-phone.mp4') };
  if (!ONLY || ONLY.split(',').includes('director')) {
    say('director: capturing the UI');
    capture = await captureDirector();
    report.capture = { marks: capture.marks, rawSeconds: capture.rawSeconds };
  }

  // `--only` is the piecewise/debug mode: render what was asked for and stop, rather than
  // failing in the assembler on the segments that were deliberately not made.
  if (ONLY) {
    say(`--only ${ONLY}: stopping before assembly`);
    console.log('\nRESULT ' + JSON.stringify(report, null, 2));
    server?.kill(); await sleep(400); process.exit(0);
  }

  /* -------------------------------------------------------------------------- assembly */
  const segments = [
    ...SHOTS.map((s) => ({ id: s.id, file: path.join(SEG_DIR, `${s.id}.mp4`), caption: s.caption })),
    { id: 'director-ui', file: capture.uiSeg, caption: 'Prompt → camera path → collisions found and fixed → previz' },
    { id: 'director-phone', file: capture.phSeg, caption: 'Your phone is the camera' },
  ];
  for (const s of segments) {
    if (!fs.existsSync(s.file)) throw new Error(`missing segment ${s.id}: ${s.file}`);
    const p = probe(s.file);
    s.duration = p.duration; s.probe = p;
    say(`segment ${s.id}: ${p.duration.toFixed(2)} s · ${p.width}×${p.height} · ${p.frames} frames · ${(p.bytes / 1e6).toFixed(1)} MB`);
  }
  report.segments = segments.map((s) => ({ id: s.id, duration: +s.duration.toFixed(2), ...s.probe, caption: s.caption }));

  const reel = path.join(OUT, 'mv-studio-showreel.mp4');
  say('assembling…');
  const asm = assemble(segments, reel);
  let rp = probe(reel);
  say(`reel: ${rp.duration.toFixed(2)} s · ${rp.width}×${rp.height} · ${rp.frames} frames · ${(rp.bytes / 1e6).toFixed(1)} MB`);
  if (rp.bytes > 60e6) {
    say('reel over 60 MB — re-encoding at CRF 23');
    argv.push('--crf', '23');
    assemble(segments, reel);
    rp = probe(reel);
    say(`reel: ${(rp.bytes / 1e6).toFixed(1)} MB at CRF 23`);
  }
  report.reel = rp;
  report.timeline = asm.timeline;

  /* ------------------------------------------------------------------------------- gif */
  // The 12 s that best sells the tool: the Pangyo dive, the cut to street level at night and
  // the climb to the 판교역 skyline — i.e. the tail of the pangyo segment, after its own
  // lower third has faded, so the GIF carries a caption of its own at GIF scale.
  const pangyoStart = asm.timeline[0].startsAt;             // reel time where pangyo takes over
  const gifStart = Math.max(0, pangyoStart + Math.min(7.2, segments[0].duration - 12.4));
  const gifSec = 12;
  const gif = path.join(OUT, 'showreel.gif');
  const palette = path.join(WORK, 'palette.png');
  const gifCap = `drawtext=fontfile=${FONT}:textfile=${textFile('Pangyo Techno Valley · sunset to night · MV Studio')}`
    + `:x=18:y=h-46:fontsize=20:fontcolor=white:box=1:boxcolor=0x0a0c12@0.6:boxborderw=10`;
  // Twelve seconds of a lit city with the crowd running is expensive as GIF, so this is a
  // ladder from best-looking to smallest: drop the frame rate, then the palette, then add a
  // temporal denoise (which is what actually buys the LZW its compression back), then dither
  // flat, and only give up the 720 px width as the last resort. First rung under 8 MB wins.
  const RUNGS = [
    { px: 720, fps: 13, colors: 200, dn: '', dither: 'bayer:bayer_scale=3' },
    { px: 720, fps: 10, colors: 96, dn: 'hqdn3d=4:3:6:4', dither: 'bayer:bayer_scale=5' },
    { px: 720, fps: 10, colors: 64, dn: 'hqdn3d=8:6:12:8', dither: 'none' },
    { px: 640, fps: 10, colors: 64, dn: 'hqdn3d=8:6:12:8', dither: 'none' },
  ];
  let gifMB = Infinity, rung = RUNGS[0];
  for (const r of RUNGS) {
    const chain = `fps=${r.fps},scale=${r.px}:-2:flags=lanczos,${r.dn ? r.dn + ',' : ''}${gifCap}`;
    ffmpeg(['-y', '-ss', gifStart.toFixed(2), '-t', String(gifSec), '-i', reel, '-vf', `${chain},palettegen=max_colors=${r.colors}:stats_mode=diff`, palette]);
    ffmpeg(['-y', '-ss', gifStart.toFixed(2), '-t', String(gifSec), '-i', reel, '-i', palette,
      '-lavfi', `${chain}[x];[x][1:v]paletteuse=dither=${r.dither}`, gif]);
    gifMB = fs.statSync(gif).size / 1e6;
    rung = r;
    if (gifMB <= 8) break;
    say(`gif ${gifMB.toFixed(1)} MB at ${r.px} px / ${r.fps} fps / ${r.colors} colours — going down a rung`);
  }
  say(`gif: ${gifStart.toFixed(1)}s +${gifSec}s -> ${gifMB.toFixed(2)} MB (${rung.px} px, ${rung.fps} fps, ${rung.colors} colours)`);
  report.gif = { startsAt: +gifStart.toFixed(2), seconds: gifSec, bytes: fs.statSync(gif).size, ...rung };

  /* --------------------------------------------------- poster + sampled frames + README still */
  const poster = path.join(OUT, 'showreel-poster.jpg');
  ffmpeg(['-y', '-ss', (pangyoStart + 3.0).toFixed(2), '-i', reel, '-frames:v', '1', '-q:v', '4', poster]);
  say(`poster: ${(fs.statSync(poster).size / 1024).toFixed(0)} KB`);

  // The README still of the Director: the phone beat, where the prompt panel, the generated
  // keys, the phone QR and a phone-driven camera are all on screen at once. A 1280 px
  // screenshot of a flat-coloured UI quantises to 64 colours with no visible loss and a fifth
  // of the bytes (137 KB against 756 KB), which keeps it well under the README's 300 KB.
  const phoneStart = asm.timeline[4].startsAt;
  const still = path.join(OUT, 'director-prompt.png');
  ffmpeg(['-y', '-ss', (phoneStart + 4.5).toFixed(2), '-i', reel, '-frames:v', '1',
    '-vf', 'scale=1280:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none', still]);
  say(`director still: ${(fs.statSync(still).size / 1024).toFixed(0)} KB`);

  const samples = [];
  for (let i = 0; i < 4; i++) {
    const at = (rp.duration * (i + 1)) / 5;
    const f = path.join(OUT, `showreel-f${i + 1}.png`);
    ffmpeg(['-y', '-ss', at.toFixed(2), '-i', reel, '-frames:v', '1', '-vf', 'scale=960:-2', f]);
    samples.push({ at: +at.toFixed(2), file: f });
  }
  report.samples = samples;

  fs.writeFileSync(path.join(WORK, 'showreel.json'), JSON.stringify(report, null, 2));
  console.log('\nRESULT ' + JSON.stringify({
    reel: { file: reel, ...rp },
    gif: { file: gif, bytes: fs.statSync(gif).size },
    poster: { file: poster, bytes: fs.statSync(poster).size },
    still: { file: still, bytes: fs.statSync(still).size },
    samples: samples.map((s) => s.file),
    segments: report.segments.map((s) => `${s.id} ${s.duration}s`),
    report: path.join(WORK, 'showreel.json'),
  }, null, 2));
} finally {
  server?.kill();
  await sleep(500);
}
