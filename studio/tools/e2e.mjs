/**
 * MV Studio end-to-end check.
 *
 * Drives the whole pipeline through the server's HTTP API — the same calls the Director
 * UI makes — and asserts on the artifacts on disk rather than on anything the UI says:
 *
 *   create project -> prompt to keys (provider 'none') -> previz shot A (short, small)
 *   -> previz shot B (10 s, 1080p) -> finalize (driver 'manual') -> export GLB
 *
 * It starts its own studio server on its own port against a throwaway projects dir, so it
 * can be run while a real studio server is up and it never writes into the repo.
 *
 *   cd studio
 *   node tools/e2e.mjs                                   # union-square-sf, temp projects dir
 *   node tools/e2e.mjs --world kyoto-higashiyama
 *   node tools/e2e.mjs --projects D:/tmp/e2e --keep      # keep the artifacts to look at
 *
 * Requires: the world's Vite dev server up (5173 / 5174), ffmpeg + ffprobe on PATH,
 * Playwright chromium installed (the render and export jobs drive it inside the server).
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// Repo path may contain spaces, so never touch `import.meta.url.pathname`.
const STUDIO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);

const WORLD = arg('world', 'union-square-sf');
const PORT = Number(arg('port', 5191));
const PROJECTS = path.resolve(arg('projects', fs.mkdtempSync(path.join(os.tmpdir(), 'mv-e2e-'))));
const KEEP = flag('keep');
// 127.0.0.1, not `localhost`: the server binds loopback by default (STUDIO_BIND), and on
// Windows `localhost` can resolve to ::1 first. This also makes the Host header a literal
// the server's host allowlist accepts.
const BASE = `http://127.0.0.1:${PORT}`;

const timings = [];
const t0 = Date.now();
const secs = (ms) => (ms / 1000).toFixed(1);
let step = 0;
const say = (...a) => console.log(`[${secs(Date.now() - t0)}s]`, ...a);
function fail(msg) { console.error('FAIL:', msg); process.exitCode = 1; throw new Error(msg); }
function check(ok, msg) { if (!ok) fail(msg); say('  ok —', msg); }
async function timed(label, fn) {
  const s = Date.now(); say(`step ${++step}: ${label}`);
  const r = await fn();
  const ms = Date.now() - s; timings.push({ label, ms });
  say(`  done in ${secs(ms)}s`);
  return r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `connection: close` plus a retry: node's http server drops idle keep-alive sockets after
// 5 s, and undici will happily hand a poll to one that is closing under it — which shows up
// as a bare ECONNRESET part-way through a long render rather than as anything meaningful.
const api = async (method, url, body, tries = 4) => {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    let r;
    try {
      r = await fetch(BASE + url, {
        method,
        headers: { connection: 'close', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (e) { lastErr = e; await sleep(500 * (i + 1)); continue; }
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!r.ok) fail(`${method} ${url} -> ${r.status} ${text.slice(0, 300)}`);
    return json;
  }
  fail(`${method} ${url} -> network error after ${tries} tries: ${lastErr}`);
};

async function waitJob(job, label) {
  for (;;) {
    const j = await api('GET', `/api/jobs/${job.id}`);
    if (j.status === 'done') return j;
    if (j.status === 'failed') {
      const log = fs.existsSync(j.log) ? fs.readFileSync(j.log, 'utf8').slice(-1500) : '';
      fail(`${label} job failed: ${j.error}\n--- log tail ---\n${log}`);
    }
    await sleep(1000);
  }
}

function frameCount(mp4) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', mp4]).toString().trim());
}

/* ---------------------------------- server ---------------------------------- */
say(`world ${WORLD} · projects ${PROJECTS} · server port ${PORT}`);
fs.mkdirSync(PROJECTS, { recursive: true });
const server = spawn(process.execPath, [path.join(STUDIO, 'server', 'index.mjs')], {
  cwd: STUDIO,
  env: { ...process.env, STUDIO_PORT: String(PORT), STUDIO_PROJECTS: PROJECTS, STUDIO_LLM: 'none' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`  [server] ${d}`));

async function stop() {
  server.kill();
  await sleep(300);
}

try {
  await timed('studio server up', async () => {
    for (let i = 0; i < 60; i++) {
      try { const c = await api('GET', '/api/config'); return c; } catch { await sleep(500); }
    }
    fail('server did not come up');
  });

  /* --------------------------------- project -------------------------------- */
  const project = await timed('create project', () => api('POST', '/api/projects', { name: `e2e ${WORLD}`, world: WORLD }));
  check(!!project.id, `project ${project.id} created`);

  /* -------------------------------- prompt ---------------------------------- */
  const promptText = 'open high over the district at sunset, then drop into the street';
  const a = await timed('prompt -> keys (2 s, provider none)', () =>
    api('POST', `/api/projects/${project.id}/prompt`, { prompt: promptText, durationSec: 2, provider: 'none' }));
  const b = await timed('prompt -> keys (10 s, provider none)', () =>
    api('POST', `/api/projects/${project.id}/prompt`, { prompt: promptText, durationSec: 10, provider: 'none' }));
  check(a.keys.length >= 2 && a.keys[a.keys.length - 1].t === 2, `shot A keys: ${a.keys.length}, ends at t=${a.keys[a.keys.length - 1].t}`);
  check(b.keys.length >= 2 && b.keys[b.keys.length - 1].t === 10, `shot B keys: ${b.keys.length}, ends at t=${b.keys[b.keys.length - 1].t}`);

  const shotA = { id: 'shotA', name: 'A — 2 s 640x360', fps: 30, width: 640, height: 360, timeOfDay: 'sunset', keys: a.keys };
  const shotB = { id: 'shotB', name: 'B — 10 s 1080p', fps: 30, width: 1920, height: 1080, timeOfDay: 'sunset', keys: b.keys };
  project.shots = [shotA, shotB];
  await timed('save shots', () => api('PUT', `/api/projects/${project.id}`, project));

  /* -------------------------------- previz ---------------------------------- */
  const runPreviz = async (shot, wantFrames) => {
    const job = await api('POST', `/api/projects/${project.id}/jobs`, { type: 'previz', shotId: shot.id });
    const done = await waitJob(job, `previz ${shot.id}`);
    const mp4 = done.artifacts.mp4;
    check(fs.existsSync(mp4), `${shot.id} previz.mp4 written (${(fs.statSync(mp4).size / 1e6).toFixed(2)} MB)`);
    check(done.artifacts.frames === wantFrames, `${shot.id} rendered ${done.artifacts.frames} frames`);
    check(frameCount(mp4) === wantFrames, `${shot.id} ffprobe counts ${wantFrames} frames in the mp4`);
    if (done.artifacts.softwareRender) console.warn('  WARNING: softwareRender:true — the GPU path was refused, timings are not representative');
    return done;
  };
  await timed(`previz shot A (2 s, 640x360, 60 frames)`, () => runPreviz(shotA, 60));
  const bJob = await timed(`previz shot B (10 s, 1920x1080, 300 frames)`, () => runPreviz(shotB, 300));
  check(!bJob.artifacts.softwareRender, 'shot B used the GPU path (softwareRender:false)');

  /* ------------------------------- finalize --------------------------------- */
  await timed('finalize shot A (driver: manual)', async () => {
    const job = await api('POST', `/api/projects/${project.id}/jobs`, {
      type: 'finalize', shotId: shotA.id, driver: 'manual', mode: 'omni_reference',
      prompt: promptText, resolution: '1080p', duration: 5, aspect: '16:9', generateAudio: false,
    });
    const done = await waitJob(job, 'finalize');
    const card = done.artifacts.jobCard;
    check(done.artifacts.driver === 'manual', 'finalize fell back to the manual driver');
    check(fs.existsSync(card), `seedance-job.md written at ${card}`);
    check(path.basename(card) === 'seedance-job.md', 'job card is named seedance-job.md');
    const md = fs.readFileSync(card, 'utf8');
    check(md.includes('seedance_2_5'), 'job card names the seedance_2_5 model');
  });

  /* -------------------------------- export ---------------------------------- */
  await timed('export GLB + keys + blender script', async () => {
    const job = await api('POST', `/api/projects/${project.id}/jobs`, { type: 'export', shotId: shotA.id });
    const done = await waitJob(job, 'export');
    const glb = done.artifacts.glb;
    check(fs.existsSync(glb), `scene.glb written (${(fs.statSync(glb).size / 1e6).toFixed(1)} MB)`);
    check(path.basename(glb) === 'scene.glb', 'the GLB is named scene.glb');
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(glb);
    const meshes = doc.getRoot().listMeshes().length;
    check(meshes > 0, `glb parses with ALL_EXTENSIONS and has ${meshes} meshes`);
    check(fs.existsSync(done.artifacts.blenderScript), 'blender_import.py written');
    check(fs.existsSync(done.artifacts.keys), 'shot keys json written');
  });

  /* -------------------------------- summary --------------------------------- */
  console.log('\n--- timings (%s) ---', WORLD);
  for (const t of timings) console.log(`${secs(t.ms).padStart(7)}s  ${t.label}`);
  console.log(`${secs(Date.now() - t0).padStart(7)}s  TOTAL`);
  console.log(`\nPASS e2e ${WORLD}${KEEP ? ` — artifacts in ${PROJECTS}` : ''}`);
} finally {
  await stop();
  if (!KEEP && !arg('projects', null)) fs.rmSync(PROJECTS, { recursive: true, force: true });
}
