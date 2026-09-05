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
