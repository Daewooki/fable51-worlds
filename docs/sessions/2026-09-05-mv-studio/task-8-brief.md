### Task 8: GLB export + Blender import script

**Files:**
- Create: `studio/server/export/glb.mjs`, `studio/server/export/blender_import.py`
- Test: `studio/test/export.test.mjs` (integration)

**Interfaces:**
- Produces: `exportGlb({ project, shotId, log })` → `{ glb, keys, blenderScript }` files under `projects/<id>/export/`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implement `glb.mjs`**

```js
import fs from 'node:fs'; import path from 'node:path';
import { projectDir } from '../store.mjs';
import { launchWorld } from '../render/browser.mjs';
const EXPORT_JS = `async () => {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const app = window.__twin.app; const groups = ['world','props','vegetation'].map((n) => app.scene.getObjectByName(n)).filter(Boolean);
  const exp = new GLTFExporter();
  const buf = await new Promise((res, rej) => exp.parse(groups, res, rej, { binary: true, onlyVisible: true, maxTextureSize: 2048 }));
  return Array.from(new Uint8Array(buf));
}`;
export async function exportGlb({ project, shotId, log }) {
  const out = path.join(projectDir(project.id), 'export'); fs.mkdirSync(out, { recursive: true });
  const shot = project.shots.find((s) => s.id === shotId); if (!shot) throw new Error('shot not found');
  const { browser, page } = await launchWorld({ world: project.world, width: 640, height: 360, time: shot.timeOfDay, quality: 'low', extraQuery: '&freeze=1' });
  try { log('exporting scene'); const bytes = await page.evaluate(EXPORT_JS); const glb = path.join(out, 'scene.glb'); fs.writeFileSync(glb, Buffer.from(bytes)); log('glb bytes', bytes.length);
    const keys = path.join(out, `${shot.id}.keys.json`); fs.writeFileSync(keys, JSON.stringify({ fps: shot.fps, keys: shot.keys }, null, 2));
    const blenderScript = path.join(out, 'blender_import.py'); fs.copyFileSync(new URL('./blender_import.py', import.meta.url), blenderScript);
    return { glb, keys, blenderScript };
  } finally { await browser.close(); }
}
```
Note: the world's vite dev server must resolve `three/addons/...` for the in-page dynamic import — it does, because `three` is a dependency of the world and Vite serves bare imports from a module script context. If `page.evaluate` cannot use bare specifiers, replace the import with `await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js')`.

`blender_import.py`:
```python
# Usage (inside Blender): blender --python blender_import.py -- scene.glb <shot>.keys.json
import bpy, json, sys
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
glb, keys_path = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
data = json.load(open(keys_path))
fps = data['fps']; scene = bpy.context.scene; scene.render.fps = fps
cam_data = bpy.data.cameras.new('MVCamera'); cam = bpy.data.objects.new('MVCamera', cam_data); scene.collection.objects.link(cam); scene.camera = cam
def keyframe(t, eye, look, fov):
    f = int(round(t * fps)); cam.location = (eye[0], -eye[2], eye[1])
    import mathutils
    direction = mathutils.Vector((look[0] - eye[0], -(look[2] - eye[2]), look[1] - eye[1]))
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); cam_data.angle = fov * 3.14159 / 180
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f); cam_data.keyframe_insert('lens', frame=f)
for k in data['keys']:
    eye = k['eye'] if k['m'] == 'air' else [k['pos'][0], 1.7, k['pos'][1]]
    keyframe(k['t'], eye, k['look'], k.get('fov', 60 if k['m'] == 'air' else 66))
scene.frame_end = int(round(data['keys'][-1]['t'] * fps))
bpy.ops.wm.save_as_mainfile(filepath=glb.replace('.glb', '.blend'))
print('saved', glb.replace('.glb', '.blend'))
```

- [ ] **Step 4: Run** → PASS. If Blender is available: `blender --background --python export/blender_import.py -- scene.glb x.keys.json` produces `scene.blend`.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): GLB scene export and Blender camera import script"`

---

