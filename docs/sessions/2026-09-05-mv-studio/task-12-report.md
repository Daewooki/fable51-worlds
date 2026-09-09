# Task 12 report — kyoto world adapter, docs, end-to-end

Commit: `50c677f` — feat: MV Studio on two worlds, docs and e2e (branch `studio`, 8 files, +991/-1)

Status: **DONE_WITH_CONCERNS** (concerns are product-shaped, not defects — see the last section).

Scope executed per the **controller ruling**, not the brief: `kyoto-higashiyama` is a separate
plain-JS codebase (`src/main.js`, procedural kits) with no `src/assets/Assets.ts`, no
`window.__twin`, no `viewpoints.json` and no GLB manifest, so "copy the Task 3 patches" was
not applicable. Confirmed by reading the files before writing anything.

---

## 1. The kyoto adapter

New file: `kyoto-higashiyama/src/studio.js` (~250 lines, heavily commented).
One call wired at the end of `kyoto-higashiyama/src/main.js`:

```js
installStudio({ scene, camera, renderer, pipeline, world, player, hud, time, cameras, sky });
```

`hud` and `sky` are additions to the ruled signature; both are needed (see below) and both are
optional in the implementation.

### What it installs, and only when asked

`installStudio` returns `null` immediately unless `?studio=1` or `?qa=1` is in the query
string, so ordinary play is untouched. Every other parameter the studio sends (`life`, `mode`,
`seed`, …) is ignored.

| Param | Effect |
| --- | --- |
| `qa=1` | installs `window.__twin`, parks the world's frame loop |
| `studio=1` | the above, plus the postMessage bridge and `studio:ready` |
| `ui=0` (or `studio=1`) | hides `#hud` **and `#start`** |
| `time=day\|sunset\|night` | `time.set()` + `pipeline.setGrade()` |
| `q=` / `quality=` | `pipeline.forceScale` = 1 / 1.25 / 1.5, then a re-size |

### Which kyoto internals were hooked, and why

1. **`Pipeline` instead of the raw renderer.** `previz.mjs`'s INSTALL script calls
   `app.renderer.render(app.scene, cam)` once per frame. Handing it the real
   `THREE.WebGLRenderer` would draw the raw scene straight to the canvas — no ink, no grade,
   no FXAA, i.e. not this world at all. `app.renderer` is therefore a shim whose `render()`
   sets `pipeline.scene` / `pipeline.camera` and runs `Pipeline.render()`. The real renderer
   stays reachable as `app.renderer.real` and `__twin.renderer`.
2. **Per-frame work that is not in the scene graph.** `main.js`'s loop aims the shadow camera
   at a 2 m-snapped focus (`time.aim`) and parks the sky dome and cloud plane on the camera
   every frame. With the loop parked nobody does that, and a camera flown a few hundred metres
   leaves the shadow frustum and the sky behind. The shim does both in `syncFrame(cam)` before
   it renders, so it covers the previz path and `renderOnce()` alike. This is why `sky` is in
   the signature.
3. **`window.__paused`.** `main.js` already honours it for its own tour recorder (it parks the
   rAF loop and swallows the clock delta). The adapter sets it `true` after the first rendered
   frame — `main.js` calls `frame()` before this module's entry point, so a full first frame
   has always happened by then. `freeze(v)` maps straight onto it.
4. **Player control.** `player.frozen = true`, `player.locked = false`, `player.keys.clear()`,
   and `player.lock` replaced with a no-op so neither the canvas click handler nor
   `hud.onStart` can grab pointer lock inside the Director UI's iframe. `hud.onStart` is also
   nulled. (This is why `hud` is in the signature.)
5. **`#start`.** The opening plate is a *sibling* of `#hud`, not a child, and it is not in
   `previz.mjs`'s hide-list. Hiding only the HUD would have left a full-screen dark gradient
   card over every rendered frame. Found by reading `index.html`, not by rendering a black
   previz.
6. **Time vocabulary.** kyoto's `STATES` are `morning | day | sunset | dusk` — there is no
   `night`, so the studio's `night` maps to `dusk`. `time.set()` moves the lights but not the
   grade, so `pipeline.setGrade(time.grade)` is called with it; without that a dusk frame
   renders with the noon grade.
7. **`world.collision.floorAt` / `world.terrain.heightAt`** both delegate to `world.heightAt`,
   which already resolves platforms, cuts and terraces. Extra arguments (`fromY`, `maxDrop`)
   are accepted and ignored.
8. **`app.updatables`** is a single anonymous object running `world.update(dt, elapsed)` and
   `time.update(dt)` (the latter is a no-op in this world; kept so the contract holds). The
   constructor name is `Object`, which is not in previz's `SKIP` set, so it survives the
   filter. `app.time.update` is deliberately inert, since `syncFrame` already re-aims the
   lighting.

### Bridge

`installBridge()` in the same file is a direct port of `union-square-sf/src/debug/StudioBridge.ts`:
same wire format, same `ev.source !== window.parent` guard, same 250 ms `studio:pos` heartbeat,
same `{ok:false,error}` on an unknown command. One deliberate difference: `setCameraRaw` and
`setTime` call `renderOnce()` before acking, because with the loop parked nothing else would
repaint the iframe.

### Other files

- `kyoto-higashiyama/package.json` — `"dev": "vite --port 5174 --strictPort"`.
- `kyoto-higashiyama/tools/studio_bridge_test.mjs` — port of the union-square harness. One
  necessary change beyond the port number: `page.setContent()` defaults to `waitUntil:'load'`
  with a 30 s cap, which covers the iframe too; the Kyoto world takes ~25–30 s to build, so it
  timed out before the world was even up. Relaxed to `{waitUntil:'domcontentloaded', timeout:240000}`.
  Also added acks for `ping`/`setTime`/`setMode`/`freeze`, and re-purposed the second scenario
  (union-square's "orbit controller must not overwrite the camera") to assert the parked loop
  does not overwrite it either.

---

## 2. Test output

### `kyoto-higashiyama/tools/studio_bridge_test.mjs`

```
{"res":{"type":"studio:res","id":"k1","ok":true,"data":true},"pos":{"eye":[10,50,10],"look":[8.0754…,40.3774…,8.0754…],"fov":50}}
{"bad":{"type":"studio:res","id":"k3","ok":false,"error":"unknown cmd nope"}}
{"res2":{"type":"studio:res","id":"o1","ok":true,"data":true},"pos2":{"eye":[10,50,10],…,"fov":50}}
PASS studio bridge
```

### `studio/test/kyoto.test.mjs` (new)

```
 ✓ test/kyoto.test.mjs (2 tests) 76610ms
   ✓ loads kyoto-higashiyama headless and exposes a usable __twin  35758ms
   ✓ renders a 1s kyoto air shot to an mp4 with 30 frames          40851ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

The first test also asserts the exact shape `previz.mjs`'s INSTALL reaches for
(`app.updatables` is an array, `app.renderer.render` and `app.time.update` are functions,
`app.elapsed` is a number, both height queries return numbers, and
`app.scene.getObjectByName('world')` exists for the GLB exporter).

### Plain-load regression (no query params)

Loaded `http://localhost:5174/` in Playwright: `typeof window.__twin === 'undefined'`,
`window.__paused` unset, `player.frozen === false`, camera at the walker's spawn height
(y = 40.11), **zero** page errors and zero console errors. `PASS plain load unaffected`.

### Visual spot-check

Rendered two 640×360 frames through the adapter at the Hanamikoji hero view (sunset and
`night`→`dusk`). Both show the street with the ink pass and the correct grade, confirming the
render really goes through `Pipeline` and that the time mapping works.

**One finding from that check:** the brief's suggested key `eye [-382, 12, -578]` is 27 m
*below* the street. This world models the Higashiyama hillside — `heightAt(-382,-578)` is
**39.2**, and the pagoda district is at 53. At y=12 the render is the undersides of the roofs
against the sky, which reads exactly like an upside-down frame. Not an adapter bug; the test
keys were moved to y = 51/57 with `look` at y = 41 and now produce a proper aerial. Recorded
in the test as a comment and in `studio/README.md`.

### Full suite

```
 Test Files  16 passed (16)
      Tests  68 passed (68)
   Duration  71.11s

 ✓ test/project.test.mjs (6)   ✓ test/store.test.mjs (2)    ✓ test/jobs.test.mjs (2)
 ✓ test/ws.test.mjs (1)        ✓ test/keys.test.mjs (9)     ✓ test/inject.test.mjs (5)
 ✓ test/prompt.test.mjs (4)    ✓ test/timeline.test.ts (3)  ✓ test/seedance.test.mjs (11)
 ✓ test/api.test.mjs (5)       ✓ test/dom.test.ts (5)       ✓ test/phone.test.ts (8)
 ✓ test/export.test.mjs (1)          31260ms
 ✓ test/browser.test.mjs (3)         36686ms
 ✓ test/previz.test.mjs (1)          41473ms
 ✓ test/kyoto.test.mjs (2)           65704ms   <- new
```

### `npx tsc --noEmit -p app`

Clean, exit 0, no output.

---

## 3. End-to-end

`studio/tools/e2e.mjs` (new, committed, re-runnable). Takes `--world`, `--projects`, `--port`,
`--keep`. It spawns **its own** studio server on its own port against a throwaway projects dir
(so it can run alongside a real one and never writes into the repo), then drives the whole
pipeline through the HTTP API and asserts on the artifacts on disk.

Deviation from the brief's wording: it uses Node's `fetch` rather than shelling out to `curl`
(same requests, no external dependency, and it can assert on parsed JSON), and Playwright is
exercised *through* the server — every render and export job is a Playwright session inside
`server/render/browser.mjs`. There is no separate Playwright script in the e2e, because every
assertion the brief lists is about server artifacts, not about the Director UI's DOM (which
`test/dom.test.ts` and `test/timeline.test.ts` already cover).

One fix was needed while building it: polling a long-running job over keep-alive got a bare
`ECONNRESET` part-way through the 1080p render (Node's http server drops idle keep-alive
sockets after 5 s and undici handed a poll to one that was closing). The client now sends
`connection: close` and retries network failures with backoff.

### Transcript — union-square-sf (the required run)

```
[0.0s] world union-square-sf · projects <tmp>/e2e-projects · server port 5191
[0.4s] step 1: studio server up                                    done in 1.6s
[2.0s] step 2: create project                                      ok — project 66440645-6739 created
[2.0s] step 3: prompt -> keys (2 s, provider none)                 ok — shot A keys: 4, ends at t=2
[2.0s] step 4: prompt -> keys (10 s, provider none)                ok — shot B keys: 4, ends at t=10
[2.0s] step 5: save shots
[2.0s] step 6: previz shot A (2 s, 640x360, 60 frames)
[37.7s]   ok — shotA previz.mp4 written (1.50 MB)
[37.7s]   ok — shotA rendered 60 frames
[38.3s]   ok — shotA ffprobe counts 60 frames in the mp4           done in 36.3s
[38.3s] step 7: previz shot B (10 s, 1920x1080, 300 frames)
[228.3s]  ok — shotB previz.mp4 written (30.77 MB)
[228.3s]  ok — shotB rendered 300 frames
[232.4s]  ok — shotB ffprobe counts 300 frames in the mp4          done in 194.1s
[232.4s]  ok — shot B used the GPU path (softwareRender:false)
[232.4s] step 8: finalize shot A (driver: manual)
          ok — finalize fell back to the manual driver
          ok — seedance-job.md written at .../shots/shotA/seedance-job.md
          ok — job card is named seedance-job.md
          ok — job card names the seedance_2_5 model               done in 0.0s
[232.4s] step 9: export GLB + keys + blender script
[253.7s]  ok — scene.glb written (39.7 MB)
[253.8s]  ok — glb parses with ALL_EXTENSIONS and has 1229 meshes
[253.8s]  ok — blender_import.py written
[253.8s]  ok — shot keys json written                              done in 21.4s

PASS e2e union-square-sf   TOTAL 253.8s
```

### Transcript — kyoto-higashiyama (extra, to prove the second world is drivable end to end)

```
step 6: previz shot A  (60 frames)   ok, 0.54 MB   done in 29.1s
step 7: previz shot B  (300 frames)  ok, 10.54 MB  done in 72.1s   softwareRender:false
step 8: finalize (manual)            ok, seedance-job.md contains seedance_2_5
step 9: export                       ok, scene.glb 397.2 MB, 1052 meshes, parses  done in 39.9s
PASS e2e kyoto-higashiyama   TOTAL 142.1s
```

All timings are in `studio/README.md` under **Measured on** (RTX 3070, Windows 11, Node 22,
Chromium/ANGLE-D3D11, Vite 6.4.3 dev servers).

**Blender step skipped** — Blender is not on `PATH` on this machine. `blender_import.py` is
written and its existence asserted, but it has not been executed. Stated as such in the README.

**Higgsfield** — the CLI is installed but not logged in, so finalize ran with
`driver: 'manual'` as instructed and produced the job card. The `higgsfield-cli` driver path
is untested here (it is covered by `test/seedance.test.mjs`'s unit tests of `buildArgv` /
`extractMp4Url`).

---

## 4. Docs

- **`studio/README.md`** (new, ~330 lines): setup, running (four terminals), the one-shot
  walkthrough, prompt→path, phone camera + mkcert, VARCO flow, env-var table, **the world
  contract** (query params, `window.__twin` table, the bridge wire format, GLB group names,
  and the three registration points a third world must touch), Kyoto's limitations, the
  measured-timings table, how to run every test, and troubleshooting.
- Troubleshooting covers all six required entries: `world load timeout`, `softwareRender:true`,
  Higgsfield-not-logged-in → manual job card, union-square-sf `npm run dev` failing on paths
  with spaces, iOS needing HTTPS/mkcert, plus a black/title-card previz and the port map.
  The `npm run dev` failure was reproduced rather than assumed — `tools/geo/sync_data.mjs`
  builds paths from `new URL(import.meta.url).pathname`, so it dies with
  `ENOENT ... mkdir 'C:\C:\Users\...\Personal%20Project\...'`. The error text is in the README.
- **Root `README.md`**: one "🎬 MV Studio" section between the worlds list and "Any input → a
  world", linking to `studio/README.md`. Nothing else touched.

---

## 5. Deviations from the brief / ruling

1. **Brief's kyoto premise replaced** by the controller ruling (no `Assets.ts`, no
   `viewpoints.json`, no `window.__twin` to patch). Implemented as ruled.
2. **`installStudio` signature** gained two optional members beyond the ruled list: `hud`
   (to null `onStart`) and `sky` (to park the dome/clouds on the camera each frame — without
   it the sky is left behind on any long move). Both are guarded with `if (...)`.
3. **The loop is parked under `qa=1` too**, not only `studio=1`. `browser.mjs` launches previz
   and export with `?qa=1&ui=0&life=0&…` and **no `studio=1`**, so parking only under
   `studio=1` would have left the walker re-seating the camera between the renderer setting a
   frame and screenshotting it. Same lever, wider trigger.
4. **e2e uses `fetch`, not `curl`** (see §3).
5. **Test keys moved above ground** (y 51/57 instead of the suggested 12) — the suggested
   altitude is under the terrain in this world (see §2).
6. **Kyoto e2e was run as well** as the required union-square-sf one, and its timings are in
   the README table.
7. `union-square-sf` was **not** modified. `git status` was clean before the work and only the
   listed files are staged.

---

## 6. Concerns

1. **Kyoto cannot be flown by hand in the Director UI.** This follows directly from the ruling
   (park the loop, disable the player's pointer/keyboard control) and from the world's design:
   `Player.applyCamera()` re-seats the camera on the walker's head every frame, so any live
   loop fights the bridge. The consequence is that dragging inside the Kyoto iframe does
   nothing — its shots have to be blocked with prompt→path, the phone camera, or by editing key
   values. union-square-sf keeps its own controls and is unaffected. Documented under "Other
   Kyoto limitations". If this matters for the product, the fix is a *studio-only* orbit/fly
   controller in `studio.js` that drives the same camera the bridge does, not un-parking the
   loop — but that is a new feature and was outside this task's ruling, so I did not add it.
2. **The Kyoto live preview is a still.** With the loop parked the iframe repaints only when
   the bridge sets something. The *rendered* previz animates correctly (the renderer drives
   `app.updatables` itself); only the live preview is frozen.
3. **Kyoto's GLB is 397 MB** (against 40 MB for union-square-sf) — its districts are baked into
   large merged vertex-coloured meshes, which do not deduplicate, whereas union-square-sf uses
   `EXT_mesh_gpu_instancing`. It parses and has 1052 meshes, but the Blender import will be
   slow and the .blend large. Noted in the README; a real fix would be instancing at bake time
   in the world, not in the studio.
4. **`?q=` vs `?quality=`.** `browser.mjs` sends `q=`, while the contract as written to me says
   `quality=`. The adapter accepts both; the README documents `q=`. Worth aligning one day.
5. **No VARCO asset-override for kyoto** — procedural world, no GLBs, nothing to override.
   Ruled and documented; VARCO styling there is Seedance style references only.
6. **`blender_import.py` has never been executed** on this machine (no Blender).

## 7. Left undone

Nothing from the task list. Steps 1–5 are complete: adapter + tests + bridge harness, both
READMEs, the e2e script and its run, the full suite and `tsc`, and the commit.
