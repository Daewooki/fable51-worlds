import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProjects, readProject, writeProject, projectDir, PROJECTS_DIR } from './store.mjs';
import { createProject } from '../schemas/project.mjs';
import { createJob, enqueue, getJob, listJobs } from './jobs.mjs';
import { attachWs } from './ws.mjs';
import { renderPreviz } from './render/previz.mjs';
import { runSeedance } from './finalize/seedance.mjs';
import { exportGlb } from './export/glb.mjs';
const APP_DIST = fileURLToPath(new URL('../app/dist', import.meta.url));
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const BODY_LIMIT = 1024 * 1024;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const readBody = (req) => new Promise((resolve, reject) => {
  let s = ''; let size = 0; let settled = false;
  const fail = (err) => { if (settled) return; settled = true; reject(err); };
  req.on('data', (c) => {
    if (settled) return;
    size += c.length;
    if (size > BODY_LIMIT) { fail(new HttpError(413, 'body too large')); return; }
    s += c;
  });
  req.on('end', () => { if (settled) return; try { const v = s ? JSON.parse(s) : {}; settled = true; resolve(v); } catch { fail(new HttpError(400, 'invalid json')); } });
  req.on('error', (e) => fail(new HttpError(500, String(e?.message || e))));
});
const RUNNERS = {
  previz: async (job, log) => { const p = await readProject(job.projectId); const shot = p.shots.find((s) => s.id === job.input.shotId); if (!shot) throw new Error('shot not found');
    const out = path.join(projectDir(p.id), 'shots', shot.id); fs.mkdirSync(out, { recursive: true });
    return renderPreviz({ world: p.world, shot, outDir: out, onProgress: (f, n) => { job.progress = f / n; if (f % 30 === 0) log('frame', f, '/', n); } }); },
  finalize: async (job, log) => runSeedance({ project: await readProject(job.projectId), ...job.input, log }),
  export: async (job, log) => { const p = await readProject(job.projectId); return exportGlb({ project: p, shotId: job.input.shotId, log }); },
};
export function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x'); const seg = u.pathname.split('/').filter(Boolean);
      if (seg[0] === 'api') {
        if (seg[1] === 'projects' && !seg[2] && req.method === 'GET') return json(res, 200, await listProjects());
        if (seg[1] === 'projects' && !seg[2] && req.method === 'POST') { const b = await readBody(req); return json(res, 201, await writeProject(createProject(b))); }
        if (seg[1] === 'projects' && seg[2] && !seg[3] && req.method === 'GET') return json(res, 200, await readProject(seg[2]));
        if (seg[1] === 'projects' && seg[2] && !seg[3] && req.method === 'PUT') return json(res, 200, await writeProject(await readBody(req)));
        if (seg[1] === 'projects' && seg[2] && seg[3] === 'jobs' && req.method === 'GET') return json(res, 200, listJobs(seg[2]));
        if (seg[1] === 'projects' && seg[2] && seg[3] === 'jobs' && req.method === 'POST') {
          const b = await readBody(req);
          if (!RUNNERS[b.type]) return json(res, 400, { error: 'unknown job type' });
          const job = createJob({ projectId: seg[2], type: b.type, input: b }); enqueue(job, RUNNERS[b.type]).catch(() => {}); return json(res, 202, job);
        }
        if (seg[1] === 'jobs' && seg[2]) { const j = getJob(seg[2]); return j ? json(res, 200, j) : json(res, 404, { error: 'no job' }); }
        return json(res, 404, { error: 'not found' });
      }
      const root = seg[0] === 'files' ? PROJECTS_DIR : APP_DIST; const rel = seg[0] === 'files' ? seg.slice(1).join('/') : (seg.join('/') || 'index.html');
      const file = path.resolve(root, rel);
      if (!(file === root || file.startsWith(root + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      const ext = path.extname(file); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.png': 'image/png', '.glb': 'model/gltf-binary' };
      res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    } catch (e) {
      if (e instanceof HttpError) { json(res, e.status, { error: e.message }); if (e.status === 413) req.destroy(); return; }
      json(res, 500, { error: String(e?.message || e) });
    }
  });
  attachWs(server);
  return server;
}
if (process.argv[1] && process.argv[1].endsWith('index.mjs')) {
  const PORT = Number(process.env.STUDIO_PORT || 5190);
  const server = createServer();
  server.listen(PORT, () => console.log(`MV Studio server http://localhost:${PORT}`));
}
