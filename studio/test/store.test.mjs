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
