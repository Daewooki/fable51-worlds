import { it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { injectAsset } from '../tools/inject_asset.mjs';

const fixture = fileURLToPath(new URL('./fixtures/fixture.glb', import.meta.url));
let worldDir;

beforeAll(async () => {
  if (!fs.existsSync(fixture)) {
    await import('./fixtures/make_fixture.mjs');
  }
  worldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-'));
  fs.mkdirSync(path.join(worldDir, 'public/assets/models/street'), { recursive: true });
  fs.mkdirSync(path.join(worldDir, 'public/data'), { recursive: true });
  fs.writeFileSync(
    path.join(worldDir, 'public/assets/models/manifest_street.json'),
    JSON.stringify({ 'street/bench_plaza': { file: 'x', tris: 1 } })
  );
});

it('normalizes scale/origin, decimates to budget, writes manifest and override', async () => {
  const r = await injectAsset({ input: fixture, worldDir, as: 'varco/bench_test', kind: 'bench', height: 2, budget: 400, replace: 'street/bench_plaza' });
  const doc = await new NodeIO().read(r.glb);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION').getArray();
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (let i = 0; i < pos.length; i += 3) {
    minY = Math.min(minY, pos[i + 1]);
    maxY = Math.max(maxY, pos[i + 1]);
    minX = Math.min(minX, pos[i]);
    maxX = Math.max(maxX, pos[i]);
  }
  expect(maxY - minY).toBeCloseTo(2, 2);
  expect(minY).toBeCloseTo(0, 2);
  expect(Math.abs(minX + maxX)).toBeLessThan(0.02);
  expect(r.manifestEntry.tris).toBeLessThanOrEqual(400);
  expect(r.manifestEntry.height).toBeCloseTo(2, 2);
  const man = JSON.parse(fs.readFileSync(path.join(worldDir, 'public/assets/models/manifest_varco.json'), 'utf8'));
  expect(man['varco/bench_test']).toBeTruthy();
  const ov = JSON.parse(fs.readFileSync(path.join(worldDir, 'public/data/asset_overrides.json'), 'utf8'));
  expect(ov['street/bench_plaza']).toBe('varco/bench_test');
});

it('rejects an override target that is not in any manifest', async () => {
  await expect(injectAsset({ input: fixture, worldDir, as: 'varco/x', height: 1, replace: 'street/nope' })).rejects.toThrow(/not in manifest/);
});
