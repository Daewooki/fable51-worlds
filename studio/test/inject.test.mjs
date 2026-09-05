import { it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { injectAsset, triCount } from '../tools/inject_asset.mjs';

const fixture = fileURLToPath(new URL('./fixtures/fixture.glb', import.meta.url));
const fixtureRot = fileURLToPath(new URL('./fixtures/fixture_rot.glb', import.meta.url));
let worldDir;

beforeAll(async () => {
  if (!fs.existsSync(fixture) || !fs.existsSync(fixtureRot)) {
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

it('bakes a node rotation (90deg about X) into POSITION and NORMAL, not just translation', async () => {
  const r = await injectAsset({ input: fixtureRot, worldDir, as: 'varco/bench_rot', height: 1 });
  const doc = await new NodeIO().read(r.glb);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION').getArray();
  const nrm = prim.getAttribute('NORMAL').getArray();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
    minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
    minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
  }
  // The prism's original height axis (4) was rotated onto Z; its original diameter (1) is now
  // the Y extent, which drives the height=1 scale (s=1) -- so X and Y extents stay ~1, Z stays ~4.
  expect(maxY - minY).toBeCloseTo(1, 2);
  expect(maxX - minX).toBeCloseTo(1, 2);
  expect(maxZ - minZ).toBeCloseTo(4, 1);
  for (let i = 0; i < nrm.length; i += 3) {
    const nx = nrm[i], ny = nrm[i + 1], nz = nrm[i + 2];
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 3);
    // Radial wall normals lay in the local X-Z plane before rotation; a 90deg rotation about X
    // moves them into the X-Y plane, so an unrotated (bug) normal would fail this.
    expect(Math.abs(nz)).toBeLessThan(0.05);
  }
});

it('triCount is mode-aware for TRIANGLE_STRIP (n-2 triangles, not n/3)', () => {
  const doc = new Document();
  const buf = doc.createBuffer();
  const positions = new Float32Array(10 * 3);
  const acc = doc.createAccessor().setArray(positions).setType('VEC3').setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', acc).setMode(5); // TRIANGLE_STRIP
  doc.createMesh('strip').addPrimitive(prim);
  expect(triCount(doc)).toBe(8);
});

it('rejects a non-positive height', async () => {
  await expect(injectAsset({ input: fixture, worldDir, as: 'varco/zero', height: 0 })).rejects.toThrow(/--height must be > 0/);
});
