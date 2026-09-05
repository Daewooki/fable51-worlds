import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

function bounds(doc) {
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getMesh();
    if (!m) continue;
    const wm = node.getWorldMatrix();
    for (const prim of m.listPrimitives()) {
      const a = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        const wx = wm[0] * x + wm[4] * y + wm[8] * z + wm[12], wy = wm[1] * x + wm[5] * y + wm[9] * z + wm[13], wz = wm[2] * x + wm[6] * y + wm[10] * z + wm[14];
        min = [Math.min(min[0], wx), Math.min(min[1], wy), Math.min(min[2], wz)];
        max = [Math.max(max[0], wx), Math.max(max[1], wy), Math.max(max[2], wz)];
      }
    }
  }
  return { min, max };
}
const triCount = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

export async function injectAsset({ input, worldDir, as, kind = 'prop', height, scale, budget = 2000, replace }) {
  if (!/^varco\/[a-z0-9_]+$/.test(as)) throw new Error('--as must look like varco/name');
  const modelsDir = path.join(worldDir, 'public/assets/models');
  if (replace) {
    const all = Object.assign({}, ...fs.readdirSync(modelsDir).filter((f) => /^manifest_.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(modelsDir, f), 'utf8'))));
    if (!all[replace]) throw new Error(`replace target ${replace} not in manifest (valid: ${Object.keys(all).slice(0, 20).join(', ')}...)`);
  }
  const io = new NodeIO();
  const doc = await io.read(input);
  if (!doc.getRoot().listMeshes().length) throw new Error('no meshes in input');
  // 1) bake node transforms into vertices so scale/origin are absolute
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getMesh();
    if (!m) continue;
    const wm = node.getWorldMatrix();
    for (const prim of m.listPrimitives()) {
      const acc = prim.getAttribute('POSITION');
      const a = acc.getArray().slice();
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        a[i] = wm[0] * x + wm[4] * y + wm[8] * z + wm[12];
        a[i + 1] = wm[1] * x + wm[5] * y + wm[9] * z + wm[13];
        a[i + 2] = wm[2] * x + wm[6] * y + wm[10] * z + wm[14];
      }
      acc.setArray(a);
    }
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  // 2) scale to target height (or explicit scale), 3) re-origin to bottom-centre
  let b = bounds(doc);
  const s = scale ?? (height ? height / (b.max[1] - b.min[1]) : 1);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, by = b.min[1];
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute('POSITION');
      const a = acc.getArray().slice();
      for (let i = 0; i < a.length; i += 3) {
        a[i] = (a[i] - cx) * s;
        a[i + 1] = (a[i + 1] - by) * s;
        a[i + 2] = (a[i + 2] - cz) * s;
      }
      acc.setArray(a);
    }
  // 4) decimate to budget (keeps materials/textures untouched)
  await doc.transform(dedup(), weld());
  const before = triCount(doc);
  if (before > budget) {
    if (MeshoptSimplifier.ready) await MeshoptSimplifier.ready;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.02, budget / before), error: 0.01 }));
  }
  const tris = Math.round(triCount(doc));
  if (tris > budget) console.warn(`inject: could not reach budget (${tris} > ${budget}), keeping best effort`);
  b = bounds(doc);
  const rel = as, outGlb = path.join(modelsDir, `${rel}.glb`);
  fs.mkdirSync(path.dirname(outGlb), { recursive: true });
  await io.write(outGlb, doc);
  const entry = { file: `assets/models/${rel}.glb`, tris, bbox_threejs: b, sizeBytes: fs.statSync(outGlb).size, kind, height: +(b.max[1] - b.min[1]).toFixed(3), footprint: [+(b.max[0] - b.min[0]).toFixed(3), +(b.max[2] - b.min[2]).toFixed(3)], front: '-Z', origin: 'bottom_center', source: 'varco' };
  const manPath = path.join(modelsDir, 'manifest_varco.json');
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {};
  man[rel] = entry;
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
  let override;
  if (replace) {
    const ovPath = path.join(worldDir, 'public/data/asset_overrides.json');
    const ov = fs.existsSync(ovPath) ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : {};
    ov[replace] = rel;
    fs.writeFileSync(ovPath, JSON.stringify(ov, null, 1));
    override = { [replace]: rel };
  }
  return { glb: outGlb, manifestEntry: entry, override };
}

if (process.argv[1] && process.argv[1].endsWith('inject_asset.mjs')) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const input = argv.find((a) => !a.startsWith('--') && a.endsWith('.glb'));
  const worldDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)), opt('world', 'union-square-sf'));
  const r = await injectAsset({ input, worldDir, as: opt('as'), kind: opt('kind', 'prop'), height: opt('height') ? Number(opt('height')) : undefined, scale: opt('scale') ? Number(opt('scale')) : undefined, budget: Number(opt('budget', 2000)), replace: opt('replace') });
  console.log(JSON.stringify(r, null, 1));
}
