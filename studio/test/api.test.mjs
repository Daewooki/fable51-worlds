import { it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
process.env.STUDIO_PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
const { createServer } = await import('../server/index.mjs');

let server; let base;
beforeAll(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

it('survives a malformed JSON body with 400 instead of crashing', async () => {
  const res = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not valid json' });
  expect(res.status).toBe(400);
});

it('still serves requests after the malformed body (process did not die)', async () => {
  const res = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'MV', world: 'union-square-sf' }) });
  expect(res.status).toBe(201);
  const p = await res.json();
  const jobsRes = await fetch(`${base}/api/projects/${p.id}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'nope' }) });
  expect(jobsRes.status).toBe(400);
});

it('POST prompt with provider none returns >= 2 keys', async () => {
  const create = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Prompt test', world: 'union-square-sf' }) });
  const p = await create.json();
  const res = await fetch(`${base}/api/projects/${p.id}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'a sweeping intro', durationSec: 6, provider: 'none' }) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.keys.length).toBeGreaterThanOrEqual(2);
});

it('GET /api/qr?url=... returns a PNG', async () => {
  const res = await fetch(`${base}/api/qr?url=${encodeURIComponent('https://x')}`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/png');
});

it('GET /api/qr?url=... rejects a url over 2048 chars', async () => {
  const longUrl = `https://x/${'a'.repeat(3000)}`;
  const res = await fetch(`${base}/api/qr?url=${encodeURIComponent(longUrl)}`);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toBe('url too long');
});

// Raw http.request so the Host header can be set to something the fetch API would refuse
// to forge; that header is exactly what the allowlist inspects.
function rawGet(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: pathname, method: 'GET', headers }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject); req.end();
  });
}

it('refuses a request whose Host is not this machine (DNS rebinding)', async () => {
  const res = await rawGet('/api/projects', { host: 'evil.example' });
  expect(res.status).toBe(403);
  expect(JSON.parse(res.body).error).toBe('bad host');
});

it('accepts localhost and 127.0.0.1 Hosts on any port', async () => {
  expect((await rawGet('/api/projects', { host: `localhost:${server.address().port}` })).status).toBe(200);
  expect((await rawGet('/api/projects', { host: '127.0.0.1:1' })).status).toBe(200);
});

it('rejects a traversal project id with 400 and writes nothing outside PROJECTS_DIR', async () => {
  const res = await rawGet('/api/projects/..%2F..');
  expect(res.status).toBe(400);
  const outside = path.resolve(process.env.STUDIO_PROJECTS, '..', 'escaped_here');
  expect(fs.existsSync(outside)).toBe(false);
});

it('PUT uses the URL id and 409s when the body disagrees', async () => {
  const created = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'PUT test', world: 'union-square-sf' }) });
  const p = await created.json();
  const bad = await fetch(`${base}/api/projects/${p.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, id: '../../escaped_here' }) });
  expect(bad.status).toBe(409);
  expect(JSON.parse(await bad.text()).error).toBe('id mismatch');
  // ...and nothing was written outside the projects dir.
  expect(fs.existsSync(path.resolve(process.env.STUDIO_PROJECTS, '..', '..', 'escaped_here'))).toBe(false);
  expect(fs.existsSync(path.resolve(process.env.STUDIO_PROJECTS, '..', 'escaped_here'))).toBe(false);
  // A matching id still round-trips.
  const ok = await fetch(`${base}/api/projects/${p.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, name: 'renamed' }) });
  expect(ok.status).toBe(200);
  expect((await ok.json()).name).toBe('renamed');
});

it('GET /api/config exposes a per-process phone token', async () => {
  const c = await (await fetch(`${base}/api/config`)).json();
  expect(typeof c.phoneToken).toBe('string');
  expect(c.phoneToken.length).toBeGreaterThanOrEqual(16);
});
