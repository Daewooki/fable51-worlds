import { it, expect } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
process.env.STUDIO_PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
const { exportGlb } = await import('../server/export/glb.mjs');
const { createProject, createShot } = await import('../schemas/project.mjs');
const { writeProject } = await import('../server/store.mjs');
it('exports the world scene to a parseable glb with meshes', async () => {
  const p = createProject({ name: 'e', world: 'union-square-sf' }); const s = createShot({ name: 's' }); s.keys = [{ t: 0, m: 'air', eye: [0, 50, 0], look: [0, 0, 0] }]; p.shots.push(s); await writeProject(p);
  const r = await exportGlb({ project: p, shotId: s.id, log: () => {} });
  const doc = await new NodeIO().read(r.glb);
  expect(doc.getRoot().listMeshes().length).toBeGreaterThan(0); expect(fs.existsSync(r.blenderScript)).toBe(true);
}, 400000);
