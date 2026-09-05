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
