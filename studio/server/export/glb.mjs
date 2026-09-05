import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectDir } from '../store.mjs';
import { launchWorld } from '../render/browser.mjs';

const CHUNK_BYTES = 8 * 1024 * 1024;

// Vite serves `three/addons/...` bare specifiers only inside app-authored modules that
// go through its module graph; a specifier typed directly into `page.evaluate` has no
// import map, so we hit the dev server's static path for the exporter instead. Vite
// still rewrites that file's own `from 'three'` import to the app's optimized dep, so
// the exporter operates on the same THREE classes as the running app.
const PRIMARY_IMPORT = '/node_modules/three/examples/jsm/exporters/GLTFExporter.js';

function fsFallbackUrl(world) {
  // repo layout: <root>/studio/server/export/glb.mjs and <root>/<world>/node_modules/...
  const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
  const abs = path.join(root, world, 'node_modules', 'three', 'examples', 'jsm', 'exporters', 'GLTFExporter.js');
  const encoded = abs.split(path.sep).map(encodeURIComponent).join('/');
  // Windows abs paths start with a drive letter, e.g. C:\...; keep the leading slash form Vite expects.
  return `/@fs/${encoded.replace(/^([A-Za-z]):/, '$1:')}`;
}

// Built as a string (not an ordinary function) on purpose: this module runs under Vitest's
// vite-node SSR transform, which rewrites *syntactic* `import()` calls in this file's own
// source into `__vite_ssr_dynamic_import__(...)` before we ever reach the browser. If the
// export routine were a real function, Playwright would stringify the already-rewritten
// source and ship a reference to a helper that doesn't exist in the page. Keeping the
// `import(...)` text inside a template-literal string sidesteps that rewrite, and wrapping
// it as an IIFE means `page.evaluate(string)` evaluates the call expression itself (and
// awaits the promise it returns) rather than merely evaluating to an inert function value.
const exportInPageSrc = (primaryUrl, fallbackUrl, chunkBytes) => `(async () => {
  let mod;
  try { mod = await import(${JSON.stringify(primaryUrl)}); }
  catch (e) { mod = await import(${JSON.stringify(fallbackUrl)}); }
  const { GLTFExporter } = mod;
  const app = window.__twin.app;
  const names = ['world', 'props', 'vegetation'];
  let objs = names.map((n) => app.scene.getObjectByName(n)).filter(Boolean);

  // Union Square's props (traffic-signal bodies/lamps) are THREE.InstancedMesh. Three's
  // GLTFExporter emits those via EXT_mesh_gpu_instancing and marks it extensionsRequired;
  // @gltf-transform/core's NodeIO only accepts required extensions it has registered, and
  // this app doesn't depend on @gltf-transform/extensions. Rather than require every reader
  // of scene.glb to register that extension, expand each InstancedMesh into ordinary Mesh
  // siblings (one per instance, sharing geometry/material) before exporting, and hide the
  // original so onlyVisible skips it.
  let instancingSeen = false;
  for (const root of objs) {
    const instanced = [];
    root.traverse((o) => { if (o.isInstancedMesh) instanced.push(o); });
    for (const im of instanced) {
      instancingSeen = true;
      const Matrix4 = im.matrix.constructor;
      const Mesh = Object.getPrototypeOf(Object.getPrototypeOf(im)).constructor;
      const m = new Matrix4();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        const clone = new Mesh(im.geometry, im.material);
        clone.matrix.copy(m);
        clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
        clone.matrixAutoUpdate = true;
        clone.castShadow = im.castShadow; clone.receiveShadow = im.receiveShadow;
        clone.name = im.name + '_i' + i;
        im.parent.add(clone);
      }
      im.visible = false;
    }
  }

  const exp = new GLTFExporter();
  const doExport = (list) => new Promise((res, rej) => exp.parse(list, res, rej, { binary: true, onlyVisible: true, maxTextureSize: 2048 }));
  let buf;
  let parseError = null;
  try {
    buf = await doExport(objs);
  } catch (err) {
    parseError = String((err && err.stack) || err);
    const filtered = [];
    for (const g of objs) g.traverse((o) => { if (o.isMesh || o.isInstancedMesh) filtered.push(o); });
    objs = filtered;
    buf = await doExport(objs);
  }
  let meshes = 0;
  for (const g of names.map((n) => app.scene.getObjectByName(n)).filter(Boolean)) {
    g.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) meshes++; });
  }
  const bytes = buf instanceof ArrayBuffer ? buf : buf.buffer;
  const total = bytes.byteLength;
  for (let offset = 0; offset < total; offset += ${chunkBytes}) {
    const slice = bytes.slice(offset, Math.min(offset + ${chunkBytes}, total));
    const blob = new Blob([slice]);
    const b64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result).split(',')[1]);
      reader.onerror = () => rej(reader.error);
      reader.readAsDataURL(blob);
    });
    await window.__glbChunk(b64);
  }
  return { bytes: total, meshes, parseError, instancingSeen };
})()`;

export async function exportGlb({ project, shotId, log }) {
  const out = path.join(projectDir(project.id), 'export'); fs.mkdirSync(out, { recursive: true });
  const shot = project.shots.find((s) => s.id === shotId); if (!shot) throw new Error('shot not found');
  const glb = path.join(out, 'scene.glb');
  fs.writeFileSync(glb, Buffer.alloc(0));

  const { browser, page } = await launchWorld({ world: project.world, width: 640, height: 360, time: shot.timeOfDay, quality: 'low' });
  try {
    await page.exposeFunction('__glbChunk', (b64) => { fs.appendFileSync(glb, Buffer.from(b64, 'base64')); });
    page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') log('page console:', msg.text()); });

    log('freezing world');
    await page.evaluate(() => window.__twin.freeze(true));

    log('exporting scene');
    const primaryUrl = PRIMARY_IMPORT;
    const fallbackUrl = fsFallbackUrl(project.world);
    const result = await page.evaluate(exportInPageSrc(primaryUrl, fallbackUrl, CHUNK_BYTES));
    if (result.parseError) log('gltf parse failed on first attempt, retried with filtered meshes:', result.parseError);
    if (result.instancingSeen) log('expanded InstancedMesh props to individual meshes to avoid EXT_mesh_gpu_instancing');
    log('glb bytes', result.bytes, 'meshes', result.meshes);

    const keys = path.join(out, `${shot.id}.keys.json`);
    fs.writeFileSync(keys, JSON.stringify({ fps: shot.fps, keys: shot.keys }, null, 2));

    const blenderScript = path.join(out, 'blender_import.py');
    fs.copyFileSync(fileURLToPath(new URL('./blender_import.py', import.meta.url)), blenderScript);

    return { glb, keys, blenderScript };
  } finally {
    await browser.close();
  }
}
