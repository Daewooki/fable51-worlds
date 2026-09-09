### Task 9: VARCO asset injector + fetch helper

**Files:**
- Create: `studio/tools/inject_asset.mjs`, `studio/tools/varco_fetch.mjs`, `studio/test/fixtures/make_fixture.mjs` (generates `fixture.glb`: a 2 m tall textured box with 1,000+ tris)
- Test: `studio/test/inject.test.mjs`

**Interfaces:**
- Produces: `injectAsset({ input, worldDir, as, kind='prop', height, scale, budget=2000, replace })` → `{ glb, manifestEntry, override? }`; CLI `node tools/inject_asset.mjs in.glb --world union-square-sf --as varco/name --height 2.1 [--replace street/bench_plaza] [--budget 2000]`. Manifest entry shape: `{ file, tris, bbox_threejs:{min,max}, sizeBytes, kind, height, footprint:[w,d], front:'-Z', origin:'bottom_center', source:'varco' }`.

- [ ] **Step 1: Fixture generator + failing test**

`studio/test/fixtures/make_fixture.mjs`:
```js
import { Document, NodeIO } from '@gltf-transform/core';
const doc = new Document(); const buf = doc.createBuffer();
const N = 24; const pos = [], idx = []; // a ring-extruded prism, 24 segments, height 4, radius 0.5 -> ~1,100 tris after fan caps
for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pos.push(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, Math.cos(a) * 0.5, 4, Math.sin(a) * 0.5); }
for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1); }
for (let s = 0; s < 20; s++) for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(i * 2 + 1, j * 2 + 1, (s % 2) * 2); } // extra tris to exceed budget
const p = doc.createAccessor().setArray(new Float32Array(pos)).setType('VEC3').setBuffer(buf);
const ix = doc.createAccessor().setArray(new Uint16Array(idx)).setBuffer(buf);
const mat = doc.createMaterial('VarcoMat').setBaseColorFactor([0.8, 0.2, 0.2, 1]);
const prim = doc.createPrimitive().setAttribute('POSITION', p).setIndices(ix).setMaterial(mat);
const mesh = doc.createMesh('fixture').addPrimitive(prim); const node = doc.createNode('fixture').setMesh(mesh).setTranslation([3, 1, 0]);
doc.createScene().addChild(node);
await new NodeIO().write(new URL('./fixture.glb', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), doc); console.log('fixture written');
```
`studio/test/inject.test.mjs`:
```js
import { it, expect, beforeAll } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { injectAsset } from '../tools/inject_asset.mjs';
const fixture = new URL('./fixtures/fixture.glb', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
let worldDir;
beforeAll(() => { worldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-')); fs.mkdirSync(path.join(worldDir, 'public/assets/models/street'), { recursive: true }); fs.mkdirSync(path.join(worldDir, 'public/data'), { recursive: true });
  fs.writeFileSync(path.join(worldDir, 'public/assets/models/manifest_street.json'), JSON.stringify({ 'street/bench_plaza': { file: 'x', tris: 1 } })); });
it('normalizes scale/origin, decimates to budget, writes manifest and override', async () => {
  const r = await injectAsset({ input: fixture, worldDir, as: 'varco/bench_test', kind: 'bench', height: 2, budget: 400, replace: 'street/bench_plaza' });
  const doc = await new NodeIO().read(r.glb); const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION').getArray(); let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (let i = 0; i < pos.length; i += 3) { minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]); minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]); }
  expect(maxY - minY).toBeCloseTo(2, 2); expect(minY).toBeCloseTo(0, 2); expect(Math.abs(minX + maxX)).toBeLessThan(0.02);
  expect(r.manifestEntry.tris).toBeLessThanOrEqual(400); expect(r.manifestEntry.height).toBeCloseTo(2, 2);
  const man = JSON.parse(fs.readFileSync(path.join(worldDir, 'public/assets/models/manifest_varco.json'), 'utf8')); expect(man['varco/bench_test']).toBeTruthy();
  const ov = JSON.parse(fs.readFileSync(path.join(worldDir, 'public/data/asset_overrides.json'), 'utf8')); expect(ov['street/bench_plaza']).toBe('varco/bench_test');
});
it('rejects an override target that is not in any manifest', async () => {
  await expect(injectAsset({ input: fixture, worldDir, as: 'varco/x', height: 1, replace: 'street/nope' })).rejects.toThrow(/not in manifest/);
});
```

- [ ] **Step 2: Run** — `node test/fixtures/make_fixture.mjs && npx vitest run test/inject.test.mjs` → FAIL (module missing)

- [ ] **Step 3: Implement `inject_asset.mjs`**

```js
import fs from 'node:fs'; import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, center, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

function bounds(doc) { let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const node of doc.getRoot().listNodes()) { const m = node.getMesh(); if (!m) continue; const wm = node.getWorldMatrix();
    for (const prim of m.listPrimitives()) { const a = prim.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) { const x = a[i], y = a[i + 1], z = a[i + 2];
      const wx = wm[0] * x + wm[4] * y + wm[8] * z + wm[12], wy = wm[1] * x + wm[5] * y + wm[9] * z + wm[13], wz = wm[2] * x + wm[6] * y + wm[10] * z + wm[14];
      min = [Math.min(min[0], wx), Math.min(min[1], wy), Math.min(min[2], wz)]; max = [Math.max(max[0], wx), Math.max(max[1], wy), Math.max(max[2], wz)]; } } }
  return { min, max }; }
const triCount = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

export async function injectAsset({ input, worldDir, as, kind = 'prop', height, scale, budget = 2000, replace }) {
  if (!/^varco\/[a-z0-9_]+$/.test(as)) throw new Error('--as must look like varco/name');
  const modelsDir = path.join(worldDir, 'public/assets/models');
  if (replace) { const all = Object.assign({}, ...fs.readdirSync(modelsDir).filter((f) => /^manifest_.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(modelsDir, f), 'utf8'))));
    if (!all[replace]) throw new Error(`replace target ${replace} not in manifest (valid: ${Object.keys(all).slice(0, 20).join(', ')}...)`); }
  const io = new NodeIO(); const doc = await io.read(input);
  if (!doc.getRoot().listMeshes().length) throw new Error('no meshes in input');
  // 1) bake node transforms into vertices so scale/origin are absolute
  for (const node of doc.getRoot().listNodes()) { const m = node.getMesh(); if (!m) continue; const wm = node.getWorldMatrix();
    for (const prim of m.listPrimitives()) { const acc = prim.getAttribute('POSITION'); const a = acc.getArray().slice();
      for (let i = 0; i < a.length; i += 3) { const x = a[i], y = a[i + 1], z = a[i + 2]; a[i] = wm[0] * x + wm[4] * y + wm[8] * z + wm[12]; a[i + 1] = wm[1] * x + wm[5] * y + wm[9] * z + wm[13]; a[i + 2] = wm[2] * x + wm[6] * y + wm[10] * z + wm[14]; }
      acc.setArray(a); } node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); }
  // 2) scale to target height (or explicit scale), 3) re-origin to bottom-centre
  let b = bounds(doc); const s = scale ?? (height ? height / (b.max[1] - b.min[1]) : 1); const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, by = b.min[1];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) { const acc = prim.getAttribute('POSITION'); const a = acc.getArray().slice();
    for (let i = 0; i < a.length; i += 3) { a[i] = (a[i] - cx) * s; a[i + 1] = (a[i + 1] - by) * s; a[i + 2] = (a[i + 2] - cz) * s; } acc.setArray(a); }
  // 4) decimate to budget (keeps materials/textures untouched)
  await doc.transform(dedup(), weld());
  const before = triCount(doc); if (before > budget) { await MeshoptSimplifier.ready; await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.02, budget / before), error: 0.01 })); }
  const tris = Math.round(triCount(doc)); if (tris > budget) console.warn(`inject: could not reach budget (${tris} > ${budget}), keeping best effort`);
  b = bounds(doc);
  const rel = as, outGlb = path.join(modelsDir, `${rel}.glb`); fs.mkdirSync(path.dirname(outGlb), { recursive: true }); await io.write(outGlb, doc);
  const entry = { file: `assets/models/${rel}.glb`, tris, bbox_threejs: b, sizeBytes: fs.statSync(outGlb).size, kind, height: +(b.max[1] - b.min[1]).toFixed(3), footprint: [+(b.max[0] - b.min[0]).toFixed(3), +(b.max[2] - b.min[2]).toFixed(3)], front: '-Z', origin: 'bottom_center', source: 'varco' };
  const manPath = path.join(modelsDir, 'manifest_varco.json'); const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {}; man[rel] = entry; fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
  let override; if (replace) { const ovPath = path.join(worldDir, 'public/data/asset_overrides.json'); const ov = fs.existsSync(ovPath) ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : {}; ov[replace] = rel; fs.writeFileSync(ovPath, JSON.stringify(ov, null, 1)); override = { [replace]: rel }; }
  return { glb: outGlb, manifestEntry: entry, override };
}

if (process.argv[1] && process.argv[1].endsWith('inject_asset.mjs')) {
  const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const input = argv.find((a) => !a.startsWith('--') && a.endsWith('.glb'));
  const worldDir = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), opt('world', 'union-square-sf'));
  const r = await injectAsset({ input, worldDir, as: opt('as'), kind: opt('kind', 'prop'), height: opt('height') ? Number(opt('height')) : undefined, scale: opt('scale') ? Number(opt('scale')) : undefined, budget: Number(opt('budget', 2000)), replace: opt('replace') });
  console.log(JSON.stringify(r, null, 1));
}
```
Add `"meshoptimizer": "^0.22.0"` to `studio/package.json` dependencies (`npm i meshoptimizer`).

`varco_fetch.mjs`:
```js
// VARCO 3D image-to-3D via the VARCO API Platform when VARCO_API_KEY is set; otherwise prints the manual path.
import fs from 'node:fs';
const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const image = opt('image'), name = opt('name', 'asset'), out = opt('out', `${name}.glb`);
const KEY = process.env.VARCO_API_KEY, BASE = process.env.VARCO_API_BASE || 'https://api.varco.ai';
if (!image) { console.error('usage: node tools/varco_fetch.mjs --image ref.png --name my_prop [--out my_prop.glb]'); process.exit(1); }
if (!KEY) {
  console.log(`VARCO_API_KEY not set. Manual path:\n 1) open https://3d.varco.ai and generate from ${image} (or a VARCO Art render)\n 2) Export -> GLB (auto remesh ~5k tris, keep PBR)\n 3) node tools/inject_asset.mjs ${out} --as varco/${name} --height <metres> [--replace <rel>]`);
  process.exit(0);
}
// Endpoint shape per VARCO API Platform (confirm against api.varco.ai docs; NC AI internal access): POST /v1/image-to-3d (multipart) -> {job_id}; GET /v1/jobs/{id} -> {status, result:{glb_url}}
const form = new FormData(); form.append('image', new Blob([fs.readFileSync(image)]), 'ref.png'); form.append('output_format', 'glb');
const start = await fetch(`${BASE}/v1/image-to-3d`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form }); if (!start.ok) { console.error('VARCO start failed', start.status, await start.text()); process.exit(1); }
const { job_id } = await start.json(); let res;
for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 5000)); res = await (await fetch(`${BASE}/v1/jobs/${job_id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json(); if (res.status === 'succeeded' || res.status === 'failed') break; process.stdout.write('.'); }
if (res?.status !== 'succeeded') { console.error('\nVARCO job did not succeed', JSON.stringify(res)); process.exit(1); }
fs.writeFileSync(out, Buffer.from(await (await fetch(res.result.glb_url)).arrayBuffer())); console.log('\nsaved', out, '-> next: node tools/inject_asset.mjs', out, '--as varco/' + name, '--height <metres>');
```

- [ ] **Step 4: Run** → 2 passed. Then real check: `node tools/inject_asset.mjs test/fixtures/fixture.glb --world union-square-sf --as varco/bench_test --height 0.9 --replace street/bench_plaza`, restart the world, open `http://localhost:5173/?qa=1&ui=0` and in devtools confirm `__twin` world shows red prisms where plaza benches were; then remove the override line from `union-square-sf/public/data/asset_overrides.json` (or delete the file) and the `varco/bench_test` manifest entry to leave the world clean.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): VARCO/GLB asset injector with normalization, decimation, manifest and override"`

---

