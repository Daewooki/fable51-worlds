import { it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
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
