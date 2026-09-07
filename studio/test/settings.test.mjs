import { it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
process.env.STUDIO_PROJECTS = path.join(dir, 'projects');
process.env.STUDIO_SECRETS = path.join(dir, 'secrets.json');
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.VARCO_API_KEY; delete process.env.STUDIO_LLM;
const { createServer } = await import('../server/index.mjs');

let server, base;
beforeAll(async () => { server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
afterAll(async () => { await new Promise((r) => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });

const j = async (res) => ({ status: res.status, body: await res.json() });

it('GET /api/config reports providers, masked keys and the higgsfield state — never a key value', async () => {
  const { status, body } = await j(await fetch(`${base}/api/config`));
  expect(status).toBe(200);
  expect(body.provider).toBe('none');
  expect(body.providers).toEqual({ none: true, anthropic: false, openai: false });
  expect(Object.keys(body.keys).sort()).toEqual(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'VARCO_API_KEY']);
  expect(body.higgsfield).toHaveProperty('ok');
  expect(body.canEditKeys).toBe(true);
});

it('PUT /api/settings stores a key on this machine and the default provider follows it', async () => {
  const put = await j(await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ OPENAI_API_KEY: 'sk-test-openai-4242' }) }));
  expect(put.status).toBe(200);
  expect(put.body.keys.OPENAI_API_KEY).toEqual({ set: true, source: 'file', masked: '••••4242' });
  expect(JSON.stringify(put.body)).not.toContain('sk-test-openai-4242');
  const cfg = (await j(await fetch(`${base}/api/config`))).body;
  expect(cfg.provider).toBe('openai');
  expect(cfg.providers.openai).toBe(true);
  expect(JSON.stringify(cfg)).not.toContain('sk-test-openai-4242');
  expect(JSON.parse(fs.readFileSync(process.env.STUDIO_SECRETS, 'utf8'))).toEqual({ OPENAI_API_KEY: 'sk-test-openai-4242' });
});

it('rejects unknown keys and bad values', async () => {
  expect((await j(await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ PASSWORD: 'x' }) }))).status).toBe(400);
  expect((await j(await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ VARCO_API_KEY: 12 }) }))).status).toBe(400);
  expect((await j(await fetch(`${base}/api/settings/NOPE`, { method: 'DELETE' }))).status).toBe(400);
});

it('DELETE /api/settings/:name clears a saved key and the provider falls back to none', async () => {
  const del = await j(await fetch(`${base}/api/settings/OPENAI_API_KEY`, { method: 'DELETE' }));
  expect(del.status).toBe(200);
  expect(del.body.keys.OPENAI_API_KEY.set).toBe(false);
  expect((await j(await fetch(`${base}/api/config`))).body.provider).toBe('none');
});

it('prompt → path with a provider that has no key explains where to set it', async () => {
  const p = (await j(await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'S', world: 'union-square-sf' }) }))).body;
  const r = await j(await fetch(`${base}/api/projects/${p.id}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'x', durationSec: 4, provider: 'anthropic' }) }));
  expect(r.status).toBe(400);
  expect(r.body.error).toMatch(/ANTHROPIC_API_KEY.*Settings/);
});
