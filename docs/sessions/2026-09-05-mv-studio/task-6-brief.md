### Task 6: project store + job runner + server + WS relay

**Files:**
- Create: `studio/server/store.mjs`, `studio/server/jobs.mjs`, `studio/server/ws.mjs`, `studio/server/index.mjs`
- Test: `studio/test/store.test.mjs`, `studio/test/jobs.test.mjs`, `studio/test/ws.test.mjs`

**Interfaces:**
- `store.mjs`: `PROJECTS_DIR` (env `STUDIO_PROJECTS` or `studio/projects`), `listProjects()`, `readProject(id)`, `writeProject(p)` (validates, atomic write), `projectDir(id)`.
- `jobs.mjs`: `createJob({ projectId, type, input })` → job `{ id, projectId, type, input, status:'queued'|'running'|'done'|'failed', log: string (path), artifacts: {}, error? }`; `enqueue(job, runner)`; `getJob(id)`; runners are `async (job, log) => artifacts`; queue is sequential; log file `projects/<id>/jobs/<jobId>.log`.
- `ws.mjs`: `attachWs(httpServer)` → rooms; a client joins with `{type:'join', room:'phone'|'director', projectId}`; any message from `phone` is relayed to all `director` sockets of the same project as-is (and vice versa).
- `index.mjs` HTTP routes (JSON): `GET /api/projects`, `POST /api/projects {name, world}`, `GET /api/projects/:id`, `PUT /api/projects/:id`, `POST /api/projects/:id/jobs {type:'previz'|'finalize'|'export', shotId, ...}`, `GET /api/jobs/:id`, `GET /files/*` static under projects, `/` static app build; port env `STUDIO_PORT` default 5190.

- [ ] **Step 1: Write the failing tests**

`studio/test/store.test.mjs`:
```js
import { it, expect, beforeAll } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.STUDIO_PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
const { listProjects, readProject, writeProject } = await import('../server/store.mjs');
const { createProject } = await import('../schemas/project.mjs');
it('round-trips a project', async () => {
  const p = createProject({ name: 'MV', world: 'union-square-sf' }); await writeProject(p);
  expect((await listProjects()).map((x) => x.id)).toContain(p.id);
  expect((await readProject(p.id)).name).toBe('MV');
});
it('rejects invalid projects', async () => { await expect(writeProject({ id: 'x', name: '', world: 'mars', shots: [] })).rejects.toThrow(/project/); });
```
`studio/test/jobs.test.mjs`:
```js
import { it, expect } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.STUDIO_PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
const { createJob, enqueue, getJob } = await import('../server/jobs.mjs');
it('runs jobs sequentially and records artifacts/logs', async () => {
  const order = [];
  const j1 = createJob({ projectId: 'p1', type: 'previz', input: {} }), j2 = createJob({ projectId: 'p1', type: 'export', input: {} });
  const done = Promise.all([ enqueue(j1, async (job, log) => { log('a'); await new Promise((r) => setTimeout(r, 30)); order.push(1); return { mp4: 'x' }; }), enqueue(j2, async () => { order.push(2); return {}; }) ]);
  await done;
  expect(order).toEqual([1, 2]); expect(getJob(j1.id).status).toBe('done'); expect(getJob(j1.id).artifacts.mp4).toBe('x');
  expect(fs.readFileSync(getJob(j1.id).log, 'utf8')).toContain('a');
});
it('marks failures', async () => { const j = createJob({ projectId: 'p1', type: 'previz', input: {} }); await enqueue(j, async () => { throw new Error('boom'); }).catch(() => {}); expect(getJob(j.id).status).toBe('failed'); expect(getJob(j.id).error).toMatch(/boom/); });
```
`studio/test/ws.test.mjs`:
```js
import { it, expect } from 'vitest';
import http from 'node:http'; import { WebSocket } from 'ws';
import { attachWs } from '../server/ws.mjs';
it('relays phone messages to director sockets of the same project', async () => {
  const server = http.createServer(); attachWs(server); await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  const open = (room) => new Promise((res) => { const s = new WebSocket(`ws://localhost:${port}/ws`); s.on('open', () => { s.send(JSON.stringify({ type: 'join', room, projectId: 'p' })); res(s); }); });
  const director = await open('director'), phone = await open('phone');
  const got = new Promise((res) => director.on('message', (m) => res(JSON.parse(m.toString()))));
  await new Promise((r) => setTimeout(r, 50)); phone.send(JSON.stringify({ type: 'cam', q: [0, 0, 0, 1] }));
  expect((await got).type).toBe('cam'); director.close(); phone.close(); server.close();
});
```

- [ ] **Step 2: Run** → all three FAIL (modules missing)

- [ ] **Step 3: Implement**

`studio/server/store.mjs`:
```js
import fs from 'node:fs/promises'; import path from 'node:path';
import { validateProject } from '../schemas/project.mjs';
export const PROJECTS_DIR = process.env.STUDIO_PROJECTS || path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), 'projects');
export const projectDir = (id) => path.join(PROJECTS_DIR, id);
export async function listProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true }); const out = [];
  for (const d of await fs.readdir(PROJECTS_DIR)) { try { out.push(JSON.parse(await fs.readFile(path.join(PROJECTS_DIR, d, 'project.json'), 'utf8'))); } catch { /* skip */ } }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
export async function readProject(id) { return JSON.parse(await fs.readFile(path.join(projectDir(id), 'project.json'), 'utf8')); }
export async function writeProject(p) {
  const errs = validateProject(p); if (errs.length) throw new Error(`invalid project: ${errs.join('; ')}`);
  const dir = projectDir(p.id); await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, 'project.json.tmp'); await fs.writeFile(tmp, JSON.stringify(p, null, 2)); await fs.rename(tmp, path.join(dir, 'project.json')); return p;
}
```
`studio/server/jobs.mjs`:
```js
import fs from 'node:fs'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
import { projectDir } from './store.mjs';
const jobs = new Map(); let chain = Promise.resolve();
export function createJob({ projectId, type, input }) {
  const id = randomUUID().slice(0, 8); const dir = path.join(projectDir(projectId), 'jobs'); fs.mkdirSync(dir, { recursive: true });
  const job = { id, projectId, type, input, status: 'queued', log: path.join(dir, `${id}.log`), artifacts: {}, createdAt: Date.now() };
  fs.writeFileSync(job.log, ''); jobs.set(id, job); return job;
}
export const getJob = (id) => jobs.get(id);
export const listJobs = (projectId) => [...jobs.values()].filter((j) => j.projectId === projectId);
export function enqueue(job, runner) {
  const run = async () => {
    job.status = 'running'; const log = (...a) => fs.appendFileSync(job.log, a.join(' ') + '\n');
    try { job.artifacts = (await runner(job, log)) || {}; job.status = 'done'; }
    catch (e) { job.status = 'failed'; job.error = String(e?.stack || e); log('ERROR', job.error); throw e; }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
```
`studio/server/ws.mjs`:
```js
import { WebSocketServer } from 'ws';
export function attachWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' }); const meta = new Map();
  wss.on('connection', (sock) => {
    sock.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.type === 'join') { meta.set(sock, { room: m.room, projectId: m.projectId }); return; }
      const me = meta.get(sock); if (!me) return;
      const target = me.room === 'phone' ? 'director' : 'phone';
      for (const [s, info] of meta) if (s !== sock && info.projectId === me.projectId && info.room === target && s.readyState === 1) s.send(raw.toString());
    });
    sock.on('close', () => meta.delete(sock));
  });
  return wss;
}
```
`studio/server/index.mjs`:
```js
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { listProjects, readProject, writeProject, projectDir, PROJECTS_DIR } from './store.mjs';
import { createProject } from '../schemas/project.mjs';
import { createJob, enqueue, getJob, listJobs } from './jobs.mjs';
import { attachWs } from './ws.mjs';
import { renderPreviz } from './render/previz.mjs';
import { runSeedance } from './finalize/seedance.mjs';
import { exportGlb } from './export/glb.mjs';
const PORT = Number(process.env.STUDIO_PORT || 5190);
const APP_DIST = path.resolve(new URL('../app/dist', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s ? JSON.parse(s) : {})); });
const RUNNERS = {
  previz: async (job, log) => { const p = await readProject(job.projectId); const shot = p.shots.find((s) => s.id === job.input.shotId); if (!shot) throw new Error('shot not found');
    const out = path.join(projectDir(p.id), 'shots', shot.id); fs.mkdirSync(out, { recursive: true });
    return renderPreviz({ world: p.world, shot, outDir: out, onProgress: (f, n) => { job.progress = f / n; if (f % 30 === 0) log('frame', f, '/', n); } }); },
  finalize: async (job, log) => runSeedance({ project: await readProject(job.projectId), ...job.input, log }),
  export: async (job, log) => { const p = await readProject(job.projectId); return exportGlb({ project: p, shotId: job.input.shotId, log }); },
};
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'); const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] === 'api') {
      if (seg[1] === 'projects' && !seg[2] && req.method === 'GET') return json(res, 200, await listProjects());
      if (seg[1] === 'projects' && !seg[2] && req.method === 'POST') { const b = await body(req); return json(res, 201, await writeProject(createProject(b))); }
      if (seg[1] === 'projects' && seg[2] && !seg[3] && req.method === 'GET') return json(res, 200, await readProject(seg[2]));
      if (seg[1] === 'projects' && seg[2] && !seg[3] && req.method === 'PUT') return json(res, 200, await writeProject(await body(req)));
      if (seg[1] === 'projects' && seg[2] && seg[3] === 'jobs' && req.method === 'GET') return json(res, 200, listJobs(seg[2]));
      if (seg[1] === 'projects' && seg[2] && seg[3] === 'jobs' && req.method === 'POST') { const b = await body(req); const job = createJob({ projectId: seg[2], type: b.type, input: b }); enqueue(job, RUNNERS[b.type]).catch(() => {}); return json(res, 202, job); }
      if (seg[1] === 'jobs' && seg[2]) { const j = getJob(seg[2]); return j ? json(res, 200, j) : json(res, 404, { error: 'no job' }); }
      return json(res, 404, { error: 'not found' });
    }
    const root = seg[0] === 'files' ? PROJECTS_DIR : APP_DIST; const rel = seg[0] === 'files' ? seg.slice(1).join('/') : (seg.join('/') || 'index.html');
    const file = path.join(root, rel); if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.png': 'image/png', '.glb': 'model/gltf-binary' };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
});
attachWs(server);
server.listen(PORT, () => console.log(`MV Studio server http://localhost:${PORT}`));
```
(Tasks 7 and 8 create `finalize/seedance.mjs` and `export/glb.mjs`; until then, create both files exporting stub functions that throw `Error('not implemented')` so the server boots.)

- [ ] **Step 4: Run** — `npx vitest run test/store.test.mjs test/jobs.test.mjs test/ws.test.mjs` → all PASS. `node server/index.mjs` boots and `curl -X POST localhost:5190/api/projects -d '{"name":"MV","world":"union-square-sf"}' -H 'content-type: application/json'` returns 201.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): project store, job runner, http api and phone/director ws relay"`

---

