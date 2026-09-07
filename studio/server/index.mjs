import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { listProjects, readProject, writeProject, projectDir, PROJECTS_DIR } from './store.mjs';
import { createProject } from '../schemas/project.mjs';
import { createJob, enqueue, getJob, listJobs } from './jobs.mjs';
import { attachWs, isAllowedHost, PHONE_TOKEN } from './ws.mjs';
import { KEY_NAMES, keyStatus, writeSecrets, getKey, defaultProvider } from './secrets.mjs';
import { detectCli } from './finalize/seedance.mjs';

// detectCli() spawns the Higgsfield binary; the Settings panel polls /api/config, so cache it.
let cliCache = { at: 0, value: null };
function cliStatus() {
  if (Date.now() - cliCache.at > 30000) cliCache = { at: Date.now(), value: detectCli() };
  return cliCache.value;
}
// Writing keys is allowed only from this machine: with STUDIO_BIND=0.0.0.0 (phone camera) a
// LAN peer passes the Host allowlist, and must not be able to plant or wipe someone's keys.
const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
import { renderPreviz } from './render/previz.mjs';
import { runSeedance } from './finalize/seedance.mjs';
import { exportGlb } from './export/glb.mjs';
import { promptToKeys } from './prompt.mjs';
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
// First non-internal IPv4 address, for the phone-camera QR code (a phone on the same Wi-Fi
// can't reach `localhost`).
function lanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}
export function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      // Host allowlist first: this is what stops a hostile page the operator visits from
      // reaching the API by DNS rebinding (its requests carry that site's Host, not ours).
      if (!isAllowedHost(req.headers.host)) return json(res, 403, { error: 'bad host' });
      const u = new URL(req.url, 'http://x'); const seg = u.pathname.split('/').filter(Boolean);
      // Every /api/projects/<id>/... route resolves <id> to a directory, so it is validated
      // once here (projectDir() throws on anything but [A-Za-z0-9_-]{1,64}) rather than in
      // each handler. `%2e%2e%2f` survives URL.pathname un-decoded and fails the same test.
      if (seg[0] === 'api' && seg[1] === 'projects' && seg[2]) {
        try { projectDir(seg[2]); } catch { return json(res, 400, { error: 'invalid project id' }); }
      }
      if (seg[0] === 'api') {
        if (seg[1] === 'projects' && !seg[2] && req.method === 'GET') return json(res, 200, await listProjects());
        if (seg[1] === 'projects' && !seg[2] && req.method === 'POST') { const b = await readBody(req); return json(res, 201, await writeProject(createProject(b))); }
        if (seg[1] === 'projects' && seg[2] && !seg[3] && req.method === 'GET') return json(res, 200, await readProject(seg[2]));
        if (seg[1] === 'projects' && seg[2] && !seg[3] && req.method === 'PUT') {
          // The URL segment is the authority on which project is written; a body `id` that
          // disagrees is a client bug (or an attempt to write somewhere else) and is refused
          // rather than silently honoured.
          const b = await readBody(req);
          if (b.id !== undefined && b.id !== seg[2]) return json(res, 409, { error: 'id mismatch' });
          return json(res, 200, await writeProject({ ...b, id: seg[2] }));
        }
        if (seg[1] === 'projects' && seg[2] && seg[3] === 'jobs' && req.method === 'GET') return json(res, 200, listJobs(seg[2]));
        if (seg[1] === 'projects' && seg[2] && seg[3] === 'jobs' && req.method === 'POST') {
          const b = await readBody(req);
          if (!RUNNERS[b.type]) return json(res, 400, { error: 'unknown job type' });
          const job = createJob({ projectId: seg[2], type: b.type, input: b }); enqueue(job, RUNNERS[b.type]).catch(() => {}); return json(res, 202, job);
        }
        if (seg[1] === 'jobs' && seg[2]) { const j = getJob(seg[2]); return j ? json(res, 200, j) : json(res, 404, { error: 'no job' }); }
        if (seg[1] === 'projects' && seg[2] && seg[3] === 'prompt' && req.method === 'POST') {
          const b = await readBody(req);
          let p;
          try { p = await readProject(seg[2]); } catch { return json(res, 404, { error: 'project not found' }); }
          try {
            const keys = await promptToKeys({ world: p.world, prompt: b.prompt, durationSec: b.durationSec, provider: b.provider });
            return json(res, 200, { keys });
          } catch (e) {
            return json(res, 400, { error: String(e?.message || e) });
          }
        }
        if (seg[1] === 'qr' && !seg[2] && req.method === 'GET') {
          const url = u.searchParams.get('url') || '';
          if (url.length > 2048) return json(res, 400, { error: 'url too long' });
          if (!/^https?:\/\//i.test(url)) return json(res, 400, { error: 'url must be http(s)' });
          const png = await QRCode.toBuffer(url);
          res.writeHead(200, { 'content-type': 'image/png' });
          return res.end(png);
        }
        if (seg[1] === 'config' && !seg[2] && req.method === 'GET') {
          const provider = defaultProvider();
          const providers = { none: true, anthropic: !!getKey('ANTHROPIC_API_KEY'), openai: !!getKey('OPENAI_API_KEY') };
          const hasKey = !!providers[provider];
          // The Director UI is same-origin, so it can simply read the phone token here and
          // put it in the QR URL; the phone, which is not, must present it to join.
          // `keys` carries set/source/masked only — never a key value.
          return json(res, 200, { provider, hasKey, providers, keys: keyStatus(), higgsfield: cliStatus(), canEditKeys: isLoopback(req), phoneToken: PHONE_TOKEN });
        }
        if (seg[1] === 'settings' && !seg[2] && req.method === 'GET') return json(res, 200, { keys: keyStatus(), canEditKeys: isLoopback(req) });
        if (seg[1] === 'settings' && !seg[2] && req.method === 'PUT') {
          if (!isLoopback(req)) return json(res, 403, { error: 'keys can only be changed from this machine' });
          const b = await readBody(req);
          const unknown = Object.keys(b).filter((k) => !KEY_NAMES.includes(k));
          if (unknown.length) return json(res, 400, { error: `unknown key ${unknown[0]}` });
          try { writeSecrets(b); } catch (e) { return json(res, 400, { error: String(e?.message || e) }); }
          return json(res, 200, { keys: keyStatus() });
        }
        if (seg[1] === 'settings' && seg[2] && !seg[3] && req.method === 'DELETE') {
          if (!isLoopback(req)) return json(res, 403, { error: 'keys can only be changed from this machine' });
          if (!KEY_NAMES.includes(seg[2])) return json(res, 400, { error: `unknown key ${seg[2]}` });
          writeSecrets({ [seg[2]]: '' });
          return json(res, 200, { keys: keyStatus() });
        }
        if (seg[1] === 'lan-ip' && !seg[2] && req.method === 'GET') return json(res, 200, { ip: lanIp() });
        return json(res, 404, { error: 'not found' });
      }
      const root = seg[0] === 'files' ? PROJECTS_DIR : APP_DIST; const rel = seg[0] === 'files' ? seg.slice(1).join('/') : (seg.join('/') || 'index.html');
      const file = path.resolve(root, rel);
      if (!(file === root || file.startsWith(root + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      const ext = path.extname(file); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.png': 'image/png', '.glb': 'model/gltf-binary', '.md': 'text/markdown', '.py': 'text/x-python', '.log': 'text/plain' };
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
  // Loopback by default: the studio has no accounts and drives a CLI and an LLM key, so it
  // has no business being reachable from the LAN unless the operator asks for it (the phone
  // camera is the one reason to, and it needs STUDIO_BIND=0.0.0.0 plus the Director opened
  // on the LAN IP — see studio/README.md).
  const BIND = process.env.STUDIO_BIND || '127.0.0.1';
  const server = createServer();
  server.listen(PORT, BIND, () => console.log(`MV Studio server http://localhost:${PORT} (bound to ${BIND})`));
}
