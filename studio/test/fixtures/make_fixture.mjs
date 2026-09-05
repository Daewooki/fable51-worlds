import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const doc = new Document();
const buf = doc.createBuffer();
const N = 24;
const pos = [];
const idx = []; // a ring-extruded prism, 24 segments, height 4, radius 0.5 -> ~1,100 tris after fan caps
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  pos.push(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, Math.cos(a) * 0.5, 4, Math.sin(a) * 0.5);
}
for (let i = 0; i < N; i++) {
  const j = (i + 1) % N;
  idx.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1);
}
for (let s = 0; s < 20; s++)
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    idx.push(i * 2 + 1, j * 2 + 1, (s % 2) * 2);
  } // extra tris to exceed budget
const p = doc.createAccessor().setArray(new Float32Array(pos)).setType('VEC3').setBuffer(buf);
const ix = doc.createAccessor().setArray(new Uint16Array(idx)).setBuffer(buf);
const mat = doc.createMaterial('VarcoMat').setBaseColorFactor([0.8, 0.2, 0.2, 1]);
const prim = doc.createPrimitive().setAttribute('POSITION', p).setIndices(ix).setMaterial(mat);
const mesh = doc.createMesh('fixture').addPrimitive(prim);
const node = doc.createNode('fixture').setMesh(mesh).setTranslation([3, 1, 0]);
doc.createScene().addChild(node);
await new NodeIO().write(fileURLToPath(new URL('./fixture.glb', import.meta.url)), doc);
console.log('fixture written');

// fixture_rot.glb: same prism, but with per-vertex radial NORMALs on the wall, parented under a
// node rotated 90 deg about X (quaternion [sin45, 0, 0, cos45]) so the prism's long (height) axis
// ends up along Z instead of Y after baking. Used to verify NORMAL/rotation baking (F1).
const doc2 = new Document();
const buf2 = doc2.createBuffer();
const pos2 = [], nrm2 = [], idx2 = [];
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  const cx = Math.cos(a), sz = Math.sin(a);
  pos2.push(cx * 0.5, 0, sz * 0.5, cx * 0.5, 4, sz * 0.5);
  nrm2.push(cx, 0, sz, cx, 0, sz);
}
for (let i = 0; i < N; i++) {
  const j = (i + 1) % N;
  idx2.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1);
}
const p2 = doc2.createAccessor().setArray(new Float32Array(pos2)).setType('VEC3').setBuffer(buf2);
const n2 = doc2.createAccessor().setArray(new Float32Array(nrm2)).setType('VEC3').setBuffer(buf2);
const ix2 = doc2.createAccessor().setArray(new Uint16Array(idx2)).setBuffer(buf2);
const mat2 = doc2.createMaterial('VarcoMat').setBaseColorFactor([0.8, 0.2, 0.2, 1]);
const prim2 = doc2.createPrimitive().setAttribute('POSITION', p2).setAttribute('NORMAL', n2).setIndices(ix2).setMaterial(mat2);
const mesh2 = doc2.createMesh('fixture_rot').addPrimitive(prim2);
const half = Math.SQRT1_2; // sin(45deg) == cos(45deg)
const node2 = doc2.createNode('fixture_rot').setMesh(mesh2).setTranslation([3, 1, 0]).setRotation([half, 0, 0, half]);
doc2.createScene().addChild(node2);
await new NodeIO().write(fileURLToPath(new URL('./fixture_rot.glb', import.meta.url)), doc2);
console.log('fixture_rot written');

// fixture_tree.glb: the shape a Blender/VARCO export routinely has — an EMPTY root node
// carrying the transform (scale 10) with the mesh on a child node. The bake reads
// getWorldMatrix(), so the parent's scale ends up in the child's vertices; if the parent's
// own TRS is then left in place (the C2 defect) it is applied a second time at load and the
// asset renders 10x too big while the manifest reports the correct height.
const doc3 = new Document();
const buf3 = doc3.createBuffer();
const p3 = doc3.createAccessor().setArray(new Float32Array(pos)).setType('VEC3').setBuffer(buf3);
const ix3 = doc3.createAccessor().setArray(new Uint16Array(idx)).setBuffer(buf3);
const mat3 = doc3.createMaterial('VarcoMat').setBaseColorFactor([0.8, 0.2, 0.2, 1]);
const prim3 = doc3.createPrimitive().setAttribute('POSITION', p3).setIndices(ix3).setMaterial(mat3);
const mesh3 = doc3.createMesh('fixture_tree').addPrimitive(prim3);
const child3 = doc3.createNode('mesh_child').setMesh(mesh3).setTranslation([0, 0, 0]);
const root3 = doc3.createNode('empty_root').setScale([10, 10, 10]).addChild(child3);
doc3.createScene().addChild(root3);
await new NodeIO().write(fileURLToPath(new URL('./fixture_tree.glb', import.meta.url)), doc3);
console.log('fixture_tree written');
