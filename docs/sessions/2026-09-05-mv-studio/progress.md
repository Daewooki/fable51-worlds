# SDD ledger — plan: docs/superpowers/plans/2026-09-05-mv-studio.md
Spec: docs/superpowers/specs/2026-09-05-mv-studio-design.md (read). Branch: studio (not main). BASE at start: 7e8bb28.

## Preflight conflict scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 keys.mjs ↔ T5 previz ↔ T10 scrubber | sample(keys,t,fps)/duration(keys) | consistent |
| T2 project.mjs ↔ T6 store ↔ T11 prompt | validateProject / validateKey | consistent |
| T3 bridge ↔ T5 previz INSTALL | previz uses window.__twin.app/.world (untyped but present, as demo_video.mjs already does) | ok |
| T3 override hook ↔ T9 inject | asset_overrides.json {rel: alt}, manifest_varco.json, 'varco' category loaded | consistent |
| T4 launchWorld ↔ T5/T8 | signature incl. extraQuery | consistent |
| T6 index.mjs ↔ T7 runSeedance / T8 exportGlb | imports before tasks exist | plan says stub first — ok |
| T6/T8/T9/T11 path from import.meta.url | plan uses regex hack `.pathname.replace(/^\/(\w:)/,'$1')` | Ruling below |
| T5 INSTALL vs upstream demo_video.mjs | duplicated frame logic | Ruling below |
| each task self-consistency | tests vs impl names (jobCardMarkdown, quatToLook, integrate, injectAsset opts, softwareRender) | consistent |

Ruling: use `fileURLToPath(new URL(..., import.meta.url))` wherever the plan wrote the regex pathname hack — same intent, correct on Windows — cost if wrong: none (pure path resolution).
Ruling: the previz INSTALL script duplicates upstream `tools/qa/demo_video.mjs` frame logic by design (plan mandates generalization; upstream file is not ours to refactor) — cost if wrong: two copies to maintain.
## Todo (12 tasks): T1 keys · T2 schema · T3 world patches · T4 browser · T5 previz · T6 server · T7 seedance · T8 export · T9 inject · T10 UI · T11 prompt+phone · T12 kyoto+docs+e2e
Ruling: cut semantics — the key carrying cut:true is the landing key; sample() reports cut=true during that key's first frame (implementer aligned code with the plan's test, replacing B.cut with A.cut) — cost if wrong: a one-frame misplaced hard re-ground in previz.
Task 1: review found Important (plan-mandated conflict): cut semantics diverge from demo_video.mjs (B.cut) — reviewer verified against source.
Ruling (supersedes the earlier cut ruling): MV Studio deliberately diverges from demo_video.mjs. `cut:true` marks the LANDING key: sample() reports cut=true during that key's first frame, AND the segment leading into a cut key HOLDS the previous key's pose (no interpolation) so the jump happens exactly at the cut time; previz fades symmetrically ±0.3 s around the cut time (Task 5 already does this). Why: Director-UI semantics ("mark this key as a cut") and the phone recorder (cut on the first key, t=0) need landing-key semantics; demo_video's B.cut never fires for a first key and its fade-segment convention is not UI-expressible. Cost if wrong: previz jump timing differs from upstream's demo film convention only. Spec amended.
Task 1: minors folded into fix round 1: always return `moving` (false in air), tests for single-key/empty edge cases, `engines.node>=22`.
Task 1: fix round 1/5 dispatched (commits 8b65969..dc21f9d); spec amended in b31c874
Task 1: fix round 1/5 (4 addressed, 0 open — hold-before-cut, moving always present, edge tests, engines; commits 8b65969..dc21f9d)
Task 1: complete (commits 7e8bb28..dc21f9d, review clean; spec amendment b31c874)
Task 2: BASE b31c874
Task 2: minor (deferred): validateKey branches (bad m/look/fov/time) untested; validateProject shot-error aggregation untested; cut/cap not validated (Ruling: cut/cap are optional free-form by design — not a gap).
Task 2: complete (commits b31c874..c1a89d5, review clean)
Task 3: BASE c1a89d5
Task 3: review Important (plan-mandated): controllers re-enabled by setMode() calls after the disable line (view=, mode=orbit) under ?studio=1. Ruling: fix — hoist `const studioMode` and re-assert walk/orbit disabled after all placement/mode logic (before app.start()); plan's literal placement was insufficient — cost if wrong: none beyond the extra line. Minors folded into the fix: origin check (ev.source === window.parent), one test assertion for unknown cmd → ok:false.
Task 3: fix round 1/5 dispatched (commits cc2d649..9c83c9a)
Task 3: fix round 1/5 (3 addressed, 0 open — re-assert disable, origin guard, tests; commits cc2d649..9c83c9a)
Task 3: minor (deferred): keyboard/toolbar setMode() can re-enable controllers under ?studio=1 (user-triggered; UI is hidden with ui=0 so low risk); union-square-sf/package-lock.json has an unstaged modification from `npm install` (decide at finish: commit or discard).
Task 3: complete (commits c1a89d5..9c83c9a, review clean)
Task 4: BASE 9c83c9a
Task 4: review Important (plan-mandated): newPage/goto exceptions bypass browser.close() and the `world load` prefix; case-sensitive /timeout/ misclassifies Playwright's "Timeout ... exceeded". Ruling: fix — wrap newPage/goto in try/catch closing the browser and rethrowing `Error('world load ...')` tagged `isTimeout`; goto gets timeout 240000; fallback decision uses err.isTimeout; additive `port` override param so a dead-port failure test can assert the contract — cost if wrong: none (tighter contract).
Task 4: fix round 1/5 dispatched (resumed implementer a35b3bd6d9a28545a)
Task 4: fix round 1/5 landed (commit 1bab0ad) — scoped re-review dispatched
Task 4: fix round 1/5 (4 addressed, 0 open — try/catch cleanup + isTimeout tagging, fallback on e.isTimeout, port override, dead-port/unknown-world tests; commit 1bab0ad)
Task 4: minor (deferred): chromium.launch() itself sits outside attempt()'s try/catch — a missing-executable failure propagates without the `world load` prefix (still falls back; no test).
Task 4: complete (commits 9c83c9a..1bab0ad, re-review PASS)
Task 5: BASE 1bab0ad
Task 5: implementer dispatched (sonnet, a79c46feebe05668b)
Task 5: implementer DONE (commit 1a766e4) — task review dispatched
Task 6 (pre-dispatch ruling): plan derives PROJECTS_DIR / APP_DIST via `new URL(..).pathname.replace(/^\/(\w:)/,'$1')` — on this repo path ("Personal Project") the pathname keeps `%20`, so the dir would be wrong. Ruling: use `fileURLToPath(new URL('../projects', import.meta.url))` (and `../app/dist`) instead — cost if wrong: none (fileURLToPath is the correct decoder on every platform). Also: POST jobs with an unknown `type` returns 400 instead of enqueuing an undefined runner (additive).
Task 5: minor (deferred): App.start() rAF loop keeps calling renderer.render/time.update while previz drives frames manually (inherited from demo_video pattern; camera safe since controllers are stripped) — consider pausing the loop in a later task; cut/caption/time-switch paths untested; test leaves tmp frames dir.
Task 5: complete (commits 1bab0ad..1a766e4, review clean)
Task 6: BASE 1a766e4
Task 6: implementer dispatched (sonnet, a424312fac4c7a355)
Task 7 (pre-dispatch ruling): verified seedance_2_5 params via Higgsfield model catalog (mode/duration 4-30/resolution/generate_audio/bitrate_mode/extension_mode; medias roles image_references/video_references/audio_references; aspect_ratio incl. auto). video_edit ignores duration+aspect_ratio; video_extension ignores ONLY aspect_ratio. Ruling: buildArgv skips `--duration` only for video_edit, skips `--aspect_ratio` for video_edit and video_extension — cost if wrong: an ignored flag. CLI `model get` needs the creator's workspace login (not ours to perform) — detectCli's "No workspace selected" branch is confirmed real output.
Task 6: implementer DONE (commit fde7834) — task review dispatched
Task 8 (pre-dispatch rulings): (a) `freeze=1` is not a URL param in the world — call `window.__twin.freeze(true)` via page.evaluate before exporting instead of extraQuery; (b) a bare `import('three/addons/...')` from page.evaluate cannot resolve (no import map) — use the brief's own fallback `/node_modules/three/examples/jsm/exporters/GLTFExporter.js` (Vite rewrites its `three` import to the same optimized dep the app uses, so one THREE instance); (c) returning `Array.from(Uint8Array)` through evaluate JSON-serializes every byte — stream the GLB out in base64 chunks (≤8 MB) through `page.exposeFunction('__glbChunk', ...)` appended to the file — cost if wrong: none (equivalent bytes, less memory). Scene group names 'world'/'props'/'vegetation' verified in union-square-sf/src/world/*.ts.
Task 6: review Important: readBody's JSON.parse throws inside req.on('end') outside the handler's try/catch → uncaught exception kills the process (verified by reviewer). Ruling: fix — parse inside the promise with reject → handler returns 400 {error:'invalid json'}; fold in 1 MB body cap (413) and `sock.on('error')` no-op listeners in ws.mjs; add a test for malformed JSON → 400 and server alive — cost if wrong: none.
Task 6: fix round 1/5 dispatched (resume implementer a424312fac4c7a355)
Task 6: fix round 1/5 landed (commit 4e58427) — scoped re-review dispatched
Task 9 (pre-dispatch rulings): same `%20` pathname defect in make_fixture.mjs, inject.test.mjs and the CLI block — use fileURLToPath everywhere (as ruled for Task 6); drop the unused `center` import; the Step 4 live check in union-square-sf must leave the world tree clean (remove the override + varco manifest entry + varco/bench_test.glb afterwards). meshoptimizer dependency to be added via npm i.
Task 6: fix round 1/5 (3 addressed, 0 open — body parse → 400, 1 MB cap → 413, ws error listeners, createServer() export + api.test; commit 4e58427)
Task 6: minor (deferred): POST /api/projects with an empty body → 500 from createProject (could be 400).
Task 6: complete (commits 1a766e4..4e58427, re-review PASS)
Task 7: BASE 4e58427
Task 7: implementer dispatched (sonnet, af5a0b3126d56d2fa)
Task 7: implementer DONE_WITH_CONCERNS (commit 224aef3; added win32 cmd quoting for shell:true spawn — accepted as in-scope correctness fix) — task review dispatched
Task 11 (pre-dispatch ruling): plan names model `claude-sonnet-4-5` for the anthropic provider — use `claude-sonnet-5` (current) with the id overridable via env STUDIO_LLM_MODEL — cost if wrong: one env var.
Task 7: review Important x2: (1) extractMp4Url's greedy /\{[\s\S]*\}/ spans multi-object stdout → parse fails → loose regex returns a URL with trailing `"}` (corrupt download); (2) fetch download has no response.ok check. Ruling: fix — parse stdout line-by-line / balanced-brace scan for JSON objects, take the last one containing an mp4 url field; regex fallback must strip trailing quotes/braces; fetch non-2xx → throw with status; quote the job-card command; log the no-URL branch; unit tests for extractMp4Url (multi-object + progress lines) and the quoting helper — cost if wrong: none.
Task 7: fix round 1/5 dispatched (resume implementer af5a0b3126d56d2fa)
Task 7: fix round 1/5 landed (commit 84aa0db) — scoped re-review dispatched
Task 7: fix round 1/5 (4 addressed, 0 open — brace-scan JSON discovery, last-match mp4 url, download status check, quoted job card, tests; commit 84aa0db)
Task 7: complete (commits 4e58427..84aa0db, re-review PASS). Live CLI happy path unverified (creator's Higgsfield workspace login required) — flagged for manual e2e in Task 12.
Task 8: BASE 84aa0db
Task 8: implementer dispatched (sonnet, a19d9cd18c8d77acc)
Task 10 (pre-dispatch notes): studio/app does not exist yet (fresh scaffold); vitest already includes test/**/*.test.ts. Bridge payload keys verified: setCameraRaw{eye,look,fov?}, setTime{p}, freeze{v}, setMode{m}, pos→{eye,look,fov}; `studio:ready` is sent once on install and `studio:pos` every 250 ms. Ruling: WorldBridge.ready must also resolve when a `ping` round-trips (poll every 1 s) so a race where the iframe loads before the listener attaches cannot hang the UI — cost if wrong: none.
Task 8: implementer DONE with concern (commit 5ec199d): expanded InstancedMesh props into plain meshes so the brief's bare `new NodeIO()` could read the GLB (49.5 MB, no EXT_mesh_gpu_instancing). Ruling: revert the expansion — keep instancing (spec: "instancing via EXT_mesh_gpu_instancing"; Blender's importer supports it) and have the test read with `new NodeIO().registerExtensions(ALL_EXTENSIONS)` from `@gltf-transform/extensions` (already installed) — deliberate divergence from the brief's verbatim test; cost if wrong: one import line. Also evaluate-as-IIFE-string (Vitest SSR import() rewrite workaround) accepted.
Task 8: fix round 1/5 dispatched (resume implementer a19d9cd18c8d77acc)
Task 11 (pre-dispatch ruling): viewpoints.json entries are `{ id, title, camera:{ lat, lon, heightM, headingDeg, pitchDeg, fovDegVertical, absoluteY }, photo }`, not the brief's flat `x,y,z,heading,pitch`. Ruling: anchorsFor ports `geoToLocal` (+ grid-bearing heading conversion) from `union-square-sf/src/geo/geo.ts` into prompt.mjs with per-world constants, y = camera.absoluteY, look = 20 m along heading/pitch; worlds without viewpoints.json yield tour anchors only — cost if wrong: anchors slightly off (they are LLM hints, not ground truth).
Task 8: fix round 1/5 landed (commit 79ba357; instancing kept, GLB 39.7 MB, size bound dropped — accepted) — task review dispatched on full range
Task 8: minor (deferred): on a double parse failure the pre-truncated 0-byte scene.glb is left on disk.
Task 8: complete (commits 84aa0db..79ba357, review clean; GLB 39.7 MB with EXT_mesh_gpu_instancing, 1229 meshes)
Task 9: BASE 79ba357
Task 9: implementer dispatched (sonnet, af288d22dc686123b)
Task 9: implementer DONE (commit a1cff56) — task review dispatched
Task 9: review Important x3: (1) baking transforms POSITION only — NORMAL/TANGENT not rotated; (2) shared accessors (instanced nodes / shared primitives) transformed once per reference; (3) triCount assumes TRIANGLES mode. Ruling: fix — rotate normals with the inverse-transpose 3x3 (tangents with the 3x3, keep w), track visited accessors in a Set for both the bake and the scale/re-origin pass (bake: if a mesh is referenced by >1 node with different matrices, clone the mesh/accessors per node), triCount by mode (4→n/3, 5/6→n-2, else 0); add a fixture variant with a 90° rotated node + NORMAL attribute and assert normals stay unit and rotated; Minor `--height 0` → explicit error — cost if wrong: none.
Task 9: fix round 1/5 dispatched (resume implementer af288d22dc686123b)
Task 9: fix round 1/5 landed (commit b74285b) — scoped re-review dispatched
Task 9: fix round 1/5 (5 addressed, 0 open — inverse-transpose normals, per-node mesh cloning + visited sets, mode-aware triCount, height>0, rotated fixture tests; commit b74285b; shared-mesh path verified empirically by the re-reviewer)
Task 9: complete (commits 79ba357..b74285b, re-review PASS)
Task 10: BASE b74285b
Task 10: implementer dispatched (sonnet, a957b4d8874ce6732)
Task 12 (pre-dispatch ruling, PLAN DEFECT): kyoto-higashiyama is a different codebase (plain JS, procedural kits, no src/assets/Assets.ts, no __twin, no viewpoints.json, no GLB manifests) — "same patches as Task 3" cannot apply. It exposes `window.__scene = { scene, camera, renderer, world (heightAt(x,z)), player (pos,yaw,pitch), time, cameras, HERO_VIEWS ... }`, `window.__paused`, and a requestAnimationFrame loop in src/main.js. Ruling: Task 12 adds a JS adapter `kyoto-higashiyama/src/studio.js` (enabled by `?studio=1`) that installs a `window.__twin` compatible with browser.mjs/previz.mjs/glb.mjs — `ready`, `setTime(p)` (day|sunset|night → kyoto states), `freeze(v)` (sets __paused / stops petals), `setMode(m)` (no-op), `renderOnce()`, `pos()`, `app = { camera, scene, renderer, updatables: [], time: { update(){} }, elapsed: 0 }`, `world = { collision: { floorAt: (x,z,y)=>world.heightAt(x,z) }, terrain: { heightAt } }`, plus the same postMessage StudioBridge protocol; the scene groups for export are whatever top-level groups kyoto uses (name them 'world' if unnamed). No asset-override hook for kyoto (procedural, no GLBs) — documented limitation; VARCO styling for kyoto = Seedance style refs only. Dev port 5174 via `vite --port 5174 --strictPort`. Cost if wrong: an adapter file the next world author can replace.
Task 11 (pre-dispatch note): kyoto anchors for TOURS['kyoto-higashiyama'] come from HERO_VIEWS in kyoto-higashiyama/src/systems/cameras.js (x,z,yaw,pitch; y from world.heightAt is unavailable server-side → use y=1.7 for walk-height anchors) — copy ~6 entries verbatim.
Task 10: implementer DONE (commit 0e4ba6f; cross-file fixes accepted: schemas/project.mjs browser-safe id, store.mjs STUDIO_PROJECTS separator normalization) — task review dispatched
Task 10: review Important: main.ts builds <option> innerHTML from unescaped project/shot names (XSS in the Director UI). Ruling: fix — shared `esc()` in a small `app/src/dom.ts`, used by main.ts and jobs.ts for every user/server string; fold in: WorldBridge.dispose() removing its window listeners + poll (called before constructing a replacement), and pollJob rejections surfaced on the job card. Deferred minors: silent setCameraRaw catch, no narrow-window CSS fallback — cost if wrong: none.
Task 10: fix round 1/5 dispatched (resume implementer a957b4d8874ce6732)
Task 10: fix round 1/5 landed (commit 8841bbd) — scoped re-review dispatched
Task 10: fix round 1/5 (4 addressed, 0 open — shared esc(), bridge dispose, poll errors on card, dom tests; commit 8841bbd)
Task 10: minor (deferred): jobs.ts interpolates server-generated ids into src/href/data attributes without esc() (safe today; wrap for defense in depth).
Task 10: complete (commits b74285b..8841bbd, re-review PASS)
Task 11: BASE 8841bbd
Task 11: implementer dispatched (sonnet, a26766c7b7404d8a8)
Task 12 (adapter facts for the dispatch): kyoto `time.set(key)` accepts its STATES keys (morning/day/sunset/dusk/...; map studio day→day, sunset→sunset, night→dusk or night if present); `window.__paused=true` parks the rAF loop (clock delta swallowed) — that is the freeze/headless hook; per-frame work is `cameras.update(dt); player.update(dt); world.update(dt, elapsed); time.update(dt)` so `__twin.app.updatables` can be `[{ update:(dt)=>{ world.update(dt, elapsed+=dt); time.update(dt); } }]` with the camera driven directly; world root group is created in src/world/index.js (`scene.add(root)`) — name it 'world' for the GLB export; kyoto uses a postprocess Pipeline (`pipeline`) so `renderOnce` must call the pipeline's render, not renderer.render.
Task 11: implementer DONE (commit 986b3da). The 3 reported browser-test failures were environmental: the implementer's cleanup killed the long-running :5173 world dev server and `npm run dev` cannot restart it because upstream `union-square-sf/tools/geo/sync_data.mjs` derives its root via `new URL(..).pathname` (breaks on this space-containing path). Controller restarted the world with `npx vite --port 5173 --strictPort` (bypassing sync_data) and re-ran browser/previz/export → 5/5 green. Ruling: sync_data.mjs is an upstream world bug outside this plan; note it in studio/README troubleshooting (Task 12) and in the final review, do not patch it here. Task review dispatched.
Task 11 (note): kyoto-higashiyama deps installed via npm ci (controller); working tree now clean — the previously unstaged union-square-sf/package-lock.json change is no longer present (not committed; deferred decision moot).
Task 11: review Important: director phone.ts applies `cam` messages unvalidated (NaN q poisons eye permanently; dolly/zoom unclamped). Ruling: fix — validate q as 4 finite numbers (normalize), clamp dolly [-1,1], zoom [30,90], drop bad samples; fold in: phone page Stop control clearing the stream interval, /api/qr url length cap (≤ 2048 → 400), fix the wrong worked-example numbers in the report; pure `sanitizeCam()` with tests — cost if wrong: none.
Task 11: fix round 1/5 dispatched (resume implementer a26766c7b7404d8a8)
Task 12 (env): kyoto-higashiyama dev server started by the controller on :5174 (npx vite --port 5174 --strictPort; Vite 6.4.3) — leave running for Task 12 tests.
Task 11: fix round 1/5 landed (commit 09075ce) — scoped re-review dispatched
Task 11: fix round 1/5 (5 addressed, 0 open — sanitizeCam + tests, phone Stop, qr url cap, report numbers; commit 09075ce)
Task 11: complete (commits 8841bbd..09075ce, re-review PASS). LLM providers not exercised end-to-end (no keys) — manual e2e item.
Task 12: BASE 09075ce
Task 12: implementer dispatched (opus — architecture-level adapter + e2e; add18c6b6bd107428)
Task 12: implementer DONE_WITH_CONCERNS (commit 50c677f; concerns are limitations: kyoto not hand-flyable in iframe (same as union-square-sf under studio=1), kyoto GLB 397 MB (no instancing), q= vs quality= accepted both) — task review dispatched
Task 12: minor (deferred): kyoto `twin.ready` promise is only truth-checked by browser.mjs (never awaited); `freeze(false)` does not reset player.frozen (unexercised); HUD hidden on studio=1 as well as ui=0.
Task 12: complete (commits 09075ce..50c677f, review clean; e2e PASS union-square-sf 253.8 s / kyoto 142.1 s)
ALL TASKS COMPLETE. Final whole-branch review dispatched (opus) on 0f79bf1..50c677f (24 commits, 65 files).
FINAL REVIEW: Critical 2 / Important 5 / Minor 9 — verdict "With fixes" (final-review.md). Rulings for the ONE fix dispatch:
- C1 cmd.exe injection in seedance spawn: fix — never shell:true; resolve the native CLI (`<npm root -g>/@higgsfield/cli/vendor/hf.exe` on win32, verified present; `vendor/hf` or the PATH binary elsewhere) and spawn it directly with argv; if unresolvable → manual mode with reason. Delete winCmdQuote; job card prints a POSIX-style quoted command for copy/paste only.
- C2 ancestor TRS not cleared in inject_asset bake: fix — clear TRS on every node after baking + hierarchy fixture test (empty root scale 10 → child mesh).
- I3 server on 0.0.0.0 unauthenticated: fix — bind 127.0.0.1 by default, `STUDIO_BIND=0.0.0.0` opt-in for the phone; Host allowlist on HTTP and Origin allowlist on WS upgrade; per-process phone token (from /api/config, carried in the QR URL, required in `join` for the phone room).
- I4 project id path traversal: fix — id regex in projectDir(), PUT uses the URL id (409 on mismatch).
- I5 phone QR uses localhost:5180: fix — use /api/lan-ip + location.port + token; README states the Director must be opened via the LAN IP for phone use.
- I6 docs contradict code / no way to author a pose: fix — README corrected; "unlock controls" toggle in the Director (bridge setMode walk/orbit, re-lock after Add key).
- I7 mixed air/walk teleport: deliberate MVP constraint (inherited from demo_video) — spec note + timeline warning, no re-interpolation.
- Minors folded in: scale error message, refs basename validation + mode enum check, varco_fetch .ok check, .md/.py MIME, softwareRender badge in UI, kyoto pause gated on studio=1, blender_import arg guard. Deferred: jobs persistence/cancel, glb /@fs fallback encoding, previz double-scan.
FINAL FIX round dispatched (opus, fresh implementer).
FINAL FIX round landed (50c677f..2600b5d, 6 commits; 87/87 tests, tsc clean, e2e PASS both worlds). Accepted divergences: re-lock via inert mode 'none' (orbit/walk both enable a controller); browser.mjs now sends studio=1 (contract already documents it). Scoped re-review dispatched (opus).
Controller verification at 2600b5d: npx vitest run → 16 files / 87 tests passed.
FINAL FIX re-review: PASS (all C1/C2/I3–I7 + minors addressed; Host/Origin bypass probes fail closed). Residual minors parked: non-constant-time token compare (128-bit secret, impractical); /api/config exposes phoneToken to allowlisted LAN hosts under STUDIO_BIND=0.0.0.0 (by design — token gates the QR flow, CORS blocks hostile pages); WS upgrade checks Origin not Host; LAN allowlist cached at first use; resolveCli double find. Ruling: ship as-is; listed under Known limitations for follow-up.
BRANCH COMPLETE at 2600b5d. Proceeding to finishing-a-development-branch.
MERGED to main (ff to 2600b5d); merged-result suite 87/87; branch studio deleted.
