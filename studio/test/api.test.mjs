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
