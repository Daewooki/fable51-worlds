# Task 8 report: GLB export + Blender import script

## Status: DONE

Commit: `5ec199d` — "feat(studio): GLB scene export and Blender camera import script"

## What was implemented

- `studio/server/export/glb.mjs` — real `exportGlb({ project, shotId, log })`, replacing the Task 6 stub.
- `studio/server/export/blender_import.py` — shipped verbatim from the brief.
- `studio/test/export.test.mjs` — verbatim from the brief.

## Deviations from the brief's literal code (beyond the stated controller rulings)

While implementing per the rulings, two additional problems surfaced that the brief's literal code did not anticipate. Both are implementation details inside `glb.mjs`; the test file and `blender_import.py` are untouched/verbatim.

1. **`page.evaluate` with a real async function silently broke.** Vitest's vite-node SSR transform rewrites *syntactic* `import()` calls inside `glb.mjs`'s own source (to `__vite_ssr_dynamic_import__(...)`) before Playwright ever sees it. Passing a real JS function (containing `await import(...)`) to `page.evaluate` ships that already-rewritten source into the browser, where `__vite_ssr_dynamic_import__` doesn't exist → `ReferenceError`. Fix: build the export routine as a template-literal **string** (so the `import(...)` text is just string content, never parsed as a syntactic import by the transformer) wrapped as an IIFE `(async () => { ... })()`, and pass that string to `page.evaluate`. This also sidesteps a separate footgun: passing a *string* that merely *defines* an arrow function (`"async () => {...}"`, no trailing `()`) evaluates to the function value itself without invoking it, so the previous attempt returned `undefined`. The IIFE form fixes both.

2. **`EXT_mesh_gpu_instancing` broke plain `NodeIO().read()`.** Union Square's traffic-signal bodies/lamps (`studio/../union-square-sf/src/world/Props.ts`, `signal_body`/`signal_*` groups) are `THREE.InstancedMesh`. Three's `GLTFExporter` always marks `EXT_mesh_gpu_instancing` as `extensionsRequired` (not just `extensionsUsed`) when it encounters any `InstancedMesh`. `@gltf-transform/core`'s `NodeIO.read()` unconditionally throws `Missing required extension` for any required extension it hasn't had registered via `registerExtensions()` — and this project depends only on `@gltf-transform/core`/`functions`, not `@gltf-transform/extensions`. Since the test (verbatim, per the brief) calls `new NodeIO().read(r.glb)` with no extensions registered, the export would always fail to parse back unless the GLB avoids requiring that extension. Fix: before exporting, each `InstancedMesh` under `world`/`props`/`vegetation` is expanded into individual `Mesh` siblings (one per instance, sharing the same geometry/material reference — so `GLTFExporter`'s own caching still emits one glTF mesh definition per shared geometry+material pair, not one per instance), and the original `InstancedMesh` is hidden (`visible = false`) so `onlyVisible: true` drops it. This is a preprocessing step done unconditionally on the initial attempt (not the "retry on failure" path from controller ruling 4, which is unrelated and still gated on `parse()` throwing).

Everything else follows the brief and the six controller rulings as given:
- `freeze=1` query param dropped; `page.evaluate(() => window.__twin.freeze(true))` called after `launchWorld` and before export.
- GLTFExporter loaded via `/node_modules/three/examples/jsm/exporters/GLTFExporter.js` (confirmed 200 from the running dev server; Vite rewrites its internal `from 'three'` import to the app's optimized dep — verified by curling the file and seeing `} from "/node_modules/.vite/deps/three.js?v=...";`). The `/@fs/<abs path, URL-encoded>` fallback is implemented but was not exercised (primary path resolved).
- GLB streamed to disk via `page.exposeFunction('__glbChunk', ...)` in ≤8MB base64 chunks (`FileReader.readAsDataURL` on a `Blob` slice, stripping the `data:` prefix); only `{ bytes, meshes, parseError, instancingSeen }` returned from `evaluate`.
- `onlyVisible: true, binary: true, maxTextureSize: 2048` kept; exports `world`/`props`/`vegetation`. The "retry with filtered Mesh/InstancedMesh list" path is implemented and only triggers if `parse()` throws (it did not, in this run).
- `blender_import.py`'s source path uses `fileURLToPath(new URL('./blender_import.py', import.meta.url))`, not `.pathname.replace`.
- `blender_import.py` copied verbatim; validated as syntactically-correct Python via `python -c "import ast; ast.parse(open(...).read())"` → passed. Blender itself is not on PATH in this environment, so it was not executed.

## Test run

`cd studio && npx vitest run test/export.test.mjs` (400s timeout as specified):

```
✓ test/export.test.mjs (1 test) 31022ms
  ✓ exports the world scene to a parseable glb with meshes 31021ms
```

stderr showed only non-fatal "Missing **optional** extension" notices (`KHR_texture_transform`, `KHR_lights_punctual`, `KHR_materials_emissive_strength`, `KHR_materials_unlit`) — these are warnings gltf-transform logs for optional extensions it can't fully interpret but does not throw for; only *required* extensions throw, and none were required in the output GLB.

Full suite: `cd studio && npx vitest run` → **10 files / 38 tests passed** (45.85s total; export test included).

## Diagnostics (separate probe script, not committed — same exportGlb call as the test)

- GLB size: **49,528,020 bytes** (~47.2 MB)
- Wall time for the full `exportGlb` call: **~30.0s** (dominated by `launchWorld`'s ~15-25s world load, consistent with `browser.mjs`'s own test timings)
- Mesh count via `NodeIO().read(...).getRoot().listMeshes().length`: **1229** (unique glTF mesh definitions — GLTFExporter dedupes by geometry+material object identity, so the ~62,427 individual visible mesh *nodes* counted scene-side collapse to 1229 mesh defs referenced by many nodes)
- `doc.getRoot().listExtensionsUsed()`: **empty array** — `EXT_mesh_gpu_instancing` does **not** appear, by design (see deviation #2 above; instances were expanded to ordinary meshes specifically so the GLB stays readable by a NodeIO instance with no extensions registered)

## Files

- `C:\Users\daewook\Desktop\Personal Project\nc_work_automation\fable51-worlds\studio\server\export\glb.mjs`
- `C:\Users\daewook\Desktop\Personal Project\nc_work_automation\fable51-worlds\studio\server\export\blender_import.py`
- `C:\Users\daewook\Desktop\Personal Project\nc_work_automation\fable51-worlds\studio\test\export.test.mjs`

## Concerns for the controller

- The two deviations above (IIFE-string evaluate, InstancedMesh flattening) are not literally in the brief or the rulings; they were necessary to make the verbatim test pass and are documented above for review. If the controller would prefer registering `@gltf-transform/extensions` and updating the test instead (making `EXT_mesh_gpu_instancing` appear, as the task description's phrasing "record ... whether it appears" might imply is the actually-expected outcome), that's a one-line dependency add plus a test-file change — flag if that's the preferred direction instead.
- `union-square-sf/package-lock.json` shows as modified in `git status` (not staged, not committed) — pre-existing from the dev server environment, unrelated to this task.

---

## Fix round 1 — controller ruling: keep instancing, make the reader extension-aware

Ruling: do not expand `InstancedMesh`; instead register `@gltf-transform/extensions`' `ALL_EXTENSIONS` on the `NodeIO` used by the test/reader, and assert on the resulting extension set/size instead of forcing the exporter to avoid the extension.

### Changes

1. `studio/server/export/glb.mjs`: removed the InstancedMesh → per-instance-Mesh expansion block entirely (the `instancingSeen` tracking, the `Matrix4`/`Mesh` prototype-lookup clone loop, and its `visible = false` hide). The three groups (`world`, `props`, `vegetation`) are now passed to `GLTFExporter.parse` as-is on the first attempt. The existing retry-on-`parse()`-throw path (filtering to `Mesh`/`InstancedMesh` children) is unchanged and still only runs if `parse()` throws — it did not throw in this run. The mesh-counting loop reverted to counting all `isMesh || isInstancedMesh` nodes (no longer needs the `.visible` filter that was compensating for hidden instanced originals). The IIFE-string `page.evaluate` workaround (deviation #1 above) and the chunked `__glbChunk` transfer are unchanged.
2. `studio/test/export.test.mjs`: added `import { ALL_EXTENSIONS } from '@gltf-transform/extensions'`; read now via `new NodeIO().registerExtensions(ALL_EXTENSIONS).read(r.glb)`. Added an assertion that `doc.getRoot().listExtensionsUsed().map(e => e.extensionName)` contains `'EXT_mesh_gpu_instancing'`.
3. **Dropped the `< 30 MB` size assertion instead of asserting something false.** Actual instanced GLB size is **39,713,108–39,713,192 bytes (~37.9 MB)** across repeated runs (world lighting/geometry is otherwise deterministic; tiny byte-count differences are just JSON key-ordering/whitespace noise from run to run, not meaningful). This *is* smaller than the fully-flattened version from before this fix round (49,528,020 bytes, ~47.2 MB) — instancing does help — but it does not clear the 30 MB bar the ruling proposed. Per the ruling's own instruction ("if the file is not smaller... report the actual size and drop that one assertion, do not fake it"), that specific assertion was removed; the test instead asserts `fs.statSync(r.glb).size > 0` as a basic sanity check, and the real number is recorded here rather than asserted.
4. `studio/package.json`: added `@gltf-transform/extensions` as an explicit `devDependency` (`^4.5.0`, matching the version already resolved in `node_modules`/`package-lock.json` as a transitive dependency of `@gltf-transform/functions`). It was usable without this before ruling only because npm happened to hoist it; declaring it directly avoids a silent break if that transitive relationship changes. Ran `npm install --package-lock-only` to sync `studio/package-lock.json` (4-line addition, no other dependency changes).

### Test run

`cd studio && npx vitest run test/export.test.mjs` (400s timeout):

```
✓ test/export.test.mjs (1 test) 21617ms
  ✓ exports the world scene to a parseable glb with meshes 21616ms
```

Full suite: `cd studio && npx vitest run` → **10 files / 38 tests passed** (40.95s total; export test 26.87s of that).

### Diagnostics (instanced export, via a separate probe script, not committed — same `exportGlb` call as the test)

- GLB size: **39,713,192 bytes** (~37.9 MB) — down from 49,528,020 bytes (~47.2 MB) in the flattened version, but not under the proposed 30 MB target (see point 3 above; not asserted in the test)
- Wall time for the full `exportGlb` call: **~21.6s** (dominated by `launchWorld`'s world-load time; faster than the flattened run's ~30s, plausibly because skipping the per-instance clone/traverse work shaves a bit off, though page-load variance also plays a role)
- Mesh count via `NodeIO().registerExtensions(ALL_EXTENSIONS).read(...).getRoot().listMeshes().length`: **1229** (same unique-mesh-definition count as the flattened version — GLTFExporter already deduped by geometry+material identity either way; the scene-side node traversal count is now **1709** visible mesh/instanced-mesh *nodes*, vs. 62,427 in the flattened version, since instances no longer get expanded into one node each)
- `doc.getRoot().listExtensionsUsed()`: `['EXT_mesh_gpu_instancing', 'KHR_lights_punctual', 'KHR_materials_emissive_strength', 'KHR_materials_unlit', 'KHR_texture_transform']` — `EXT_mesh_gpu_instancing` **is present**, as intended
- `doc.getRoot().listExtensionsRequired()`: `['EXT_mesh_gpu_instancing']` — exactly as the ruling anticipated ("EXT_mesh_gpu_instancing is expected to be listed as required by three's exporter; that's fine"). No other extension is required; the four `KHR_*` extensions above are used-but-optional (gltf-transform logs "Missing optional extension" warnings for these when `ALL_EXTENSIONS` isn't registered, as seen in the original run, but they never throw).

### Commit

`studio` staged only (not `union-square-sf/package-lock.json`); commit message and trailers per the standing convention for this task.

### Status contract

Status: DONE
Test summary: `vitest run` full suite — 10 files / 38 tests passed (export.test.mjs 1/1, ~21.6s for the export call); GLB 39,713,192 bytes with `EXT_mesh_gpu_instancing` present in both `listExtensionsUsed()` and `listExtensionsRequired()`, 1229 unique meshes via `NodeIO` (extensions-aware).
Concerns: the proposed `< 30 MB` bound doesn't hold (actual ~37.9 MB, still an improvement over the 47.2 MB flattened version) — that assertion was dropped rather than faked, per the ruling's own instruction; flagging in case the controller wants a different bound or no size assertion at all.
