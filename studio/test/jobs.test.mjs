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
