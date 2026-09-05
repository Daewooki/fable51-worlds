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

/** Normal matrix (row-major 3x3) = cofactor(M)/det(M) == transpose(inverse(M)), for the linear
 * (rotation+scale) part of a column-major 4x4 world matrix `wm` as returned by gltf-transform. */
function normalMatrix3(wm) {
  const a = wm[0], d = wm[1], g = wm[2];
  const b = wm[4], e = wm[5], h = wm[6];
  const c = wm[8], f = wm[9], i = wm[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const id = det !== 0 ? 1 / det : 0;
  return [
    (e * i - f * h) * id, (f * g - d * i) * id, (d * h - e * g) * id,
    (c * h - b * i) * id, (a * i - c * g) * id, (b * g - a * h) * id,
    (b * f - c * e) * id, (c * d - a * f) * id, (a * e - b * d) * id,
  ];
}

/** Triangle count across all primitives, mode-aware: TRIANGLES -> n/3, TRIANGLE_STRIP /
 * TRIANGLE_FAN -> max(0, n-2), other modes (points/lines) -> 0. n = index count or vertex count. */
export function triCount(doc) {
  return doc.getRoot().listMeshes().reduce((sum, m) => sum + m.listPrimitives().reduce((k, p) => {
    const idx = p.getIndices();
    const pos = p.getAttribute('POSITION');
    const n = idx ? idx.getCount() : (pos ? pos.getCount() : 0);
    const mode = p.getMode();
    if (mode === 4) return k + n / 3; // TRIANGLES
    if (mode === 5 || mode === 6) return k + Math.max(0, n - 2); // TRIANGLE_STRIP / TRIANGLE_FAN
    return k; // POINTS / LINES / LINE_STRIP / LINE_LOOP
  }, 0), 0);
}

/** Deep-clones a Mesh: new Mesh, new Primitives, and new (independent) attribute/index Accessors,
 * so a per-instance bake (F2) never mutates geometry shared with other nodes. */
function cloneMeshDeep(doc, mesh) {
  const newMesh = doc.createMesh(mesh.getName());
  for (const prim of mesh.listPrimitives()) {
    const newPrim = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode());
    for (const semantic of prim.listSemantics()) {
      const acc = prim.getAttribute(semantic);
      if (acc) newPrim.setAttribute(semantic, acc.clone());
    }
    const ix = prim.getIndices();
    if (ix) newPrim.setIndices(ix.clone());
    newMesh.addPrimitive(newPrim);
  }
  return newMesh;
}

export async function injectAsset({ input, worldDir, as, kind = 'prop', height, scale, budget = 2000, replace }) {
  if (!/^varco\/[a-z0-9_]+$/.test(as)) throw new Error('--as must look like varco/name');
  if (height !== undefined && !(height > 0)) throw new Error('--height must be > 0');
  if (scale !== undefined && !(scale > 0)) throw new Error('--height must be > 0');
  const modelsDir = path.join(worldDir, 'public/assets/models');
  if (replace) {
    const all = Object.assign({}, ...fs.readdirSync(modelsDir).filter((f) => /^manifest_.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(modelsDir, f), 'utf8'))));
    if (!all[replace]) throw new Error(`replace target ${replace} not in manifest (valid: ${Object.keys(all).slice(0, 20).join(', ')}...)`);
  }
  const io = new NodeIO();
  const doc = await io.read(input);
  if (!doc.getRoot().listMeshes().length) throw new Error('no meshes in input');

  // 0) meshes referenced by more than one node must get independent geometry before baking,
  // so each instance's own world matrix is applied to its own vertex data (F2).
  const meshNodeCounts = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getMesh();
    if (m) meshNodeCounts.set(m, (meshNodeCounts.get(m) || 0) + 1);
  }
  const seenMeshes = new Set();
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getMesh();
    if (!m || meshNodeCounts.get(m) <= 1) continue;
    if (seenMeshes.has(m)) node.setMesh(cloneMeshDeep(doc, m));
    else seenMeshes.add(m);
  }

  // 1) bake node transforms into vertices so scale/origin are absolute; POSITION by the world
  // matrix, NORMAL by its inverse-transpose (re-normalized), TANGENT.xyz by the 3x3 (re-normalized,
  // keeping the w handedness). Each accessor is baked at most once (F1, F2).
  const bakedPosition = new Set(), bakedNormal = new Set(), bakedTangent = new Set();
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getMesh();
    if (!m) continue;
    const wm = node.getWorldMatrix();
    const nm = normalMatrix3(wm);
    for (const prim of m.listPrimitives()) {
      const posAcc = prim.getAttribute('POSITION');
      if (posAcc && !bakedPosition.has(posAcc)) {
        bakedPosition.add(posAcc);
        const a = posAcc.getArray().slice();
        for (let i = 0; i < a.length; i += 3) {
          const x = a[i], y = a[i + 1], z = a[i + 2];
          a[i] = wm[0] * x + wm[4] * y + wm[8] * z + wm[12];
          a[i + 1] = wm[1] * x + wm[5] * y + wm[9] * z + wm[13];
          a[i + 2] = wm[2] * x + wm[6] * y + wm[10] * z + wm[14];
        }
        posAcc.setArray(a);
      }
      const normAcc = prim.getAttribute('NORMAL');
      if (normAcc && !bakedNormal.has(normAcc)) {
        bakedNormal.add(normAcc);
        const a = normAcc.getArray().slice();
        for (let i = 0; i < a.length; i += 3) {
          const x = a[i], y = a[i + 1], z = a[i + 2];
          let nx = nm[0] * x + nm[1] * y + nm[2] * z;
          let ny = nm[3] * x + nm[4] * y + nm[5] * z;
          let nz = nm[6] * x + nm[7] * y + nm[8] * z;
          const len = Math.hypot(nx, ny, nz) || 1;
          a[i] = nx / len; a[i + 1] = ny / len; a[i + 2] = nz / len;
        }
        normAcc.setArray(a);
      }
      const tanAcc = prim.getAttribute('TANGENT');
      if (tanAcc && !bakedTangent.has(tanAcc)) {
        bakedTangent.add(tanAcc);
        const a = tanAcc.getArray().slice(); // VEC4: xyz direction, w handedness
        for (let i = 0; i < a.length; i += 4) {
          const x = a[i], y = a[i + 1], z = a[i + 2], w = a[i + 3];
          let tx = wm[0] * x + wm[4] * y + wm[8] * z;
          let ty = wm[1] * x + wm[5] * y + wm[9] * z;
          let tz = wm[2] * x + wm[6] * y + wm[10] * z;
          const len = Math.hypot(tx, ty, tz) || 1;
          a[i] = tx / len; a[i + 1] = ty / len; a[i + 2] = tz / len; a[i + 3] = w;
        }
        tanAcc.setArray(a);
      }
    }
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  // 2) scale to target height (or explicit scale), 3) re-origin to bottom-centre
  let b = bounds(doc);
  const s = scale ?? (height ? height / (b.max[1] - b.min[1]) : 1);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, by = b.min[1];
  const scaledPosition = new Set();
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute('POSITION');
      if (!acc || scaledPosition.has(acc)) continue;
      scaledPosition.add(acc);
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
