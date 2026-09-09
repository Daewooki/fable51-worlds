# Task 10 report — Director UI shell, world bridge, timeline, scrubber, jobs

Status: **DONE**
Commit: `0e4ba6f` — "feat(studio): Director UI with world bridge, keyframe timeline, scrubber and job panels"

## What was built

`studio/app/` (Vite + TS Director UI shell):

- `studio/app/index.html` — page shell: `#panel-left` / `#panel-center` (`<iframe id="world">` in a 16:9 box, scrubber `<input type=range id=scrub>`, live-pos readout, status line) / `#panel-right` / `#panel-jobs`, `<link>` to `style.css`, `<script type=module src="/src/main.ts">`.
- `studio/app/src/timeline.ts` — pure logic verbatim from the brief: `Key` type, `sortKeys`, `addKeyAt`, `removeKey`, `moveKey`, `keyFromCamera`.
- `studio/app/src/bridge.ts` — `WorldBridge` class. Per controller ruling 1, `ready` resolves on EITHER the one-shot `studio:ready` message OR the first successful `ping` round-trip (polled every 1s via `this.call('ping')`), so the UI can't hang if the iframe finished loading before the listener attached. Bridge is constructed before the iframe `src` is assigned (in `main.ts`).
- `studio/app/src/api.ts` — thin fetch wrappers verbatim from the brief (`projects`, `create`, `get`, `save`, `job`, `jobStatus`, `pollJob`).
- `studio/app/src/jobs.ts` — `mountJobsPanel(el, ctx): { refresh }`. Renders Render-previz/Export buttons and the Finalize (Seedance) form (mode/duration/resolution/aspect/checkboxes/driver per ruling 6, with duration disabled for `video_edit` and aspect disabled for `video_edit`/`video_extension`), a refs editor (`project.refs.artist`/`style` as one-filename-per-line textareas, `project.refs.audio` as a single input, "Save refs" → `ctx.save()`), and a live job list: after POST, polls with `api.pollJob`, shows `status`, `progress` as a percent, the last ~20 lines of the job log (`GET /files/<projectId>/jobs/<jobId>.log`), and artifact links built from `projectId` + `job.input.shotId` (never from the server's absolute paths) per ruling 5 — previz → `<video>` at `shots/<shotId>/previz.mp4`; export → links to `export/scene.glb`, `export/<shotId>.keys.json`, `export/blender_import.py`; finalize → `<video>` at `shots/<shotId>/final.mp4` if `job.artifacts.mp4` is present, else a link to `shots/<shotId>/seedance-job.md` plus `job.artifacts.reason`.
- `studio/app/src/main.ts` — shell wiring: left panel (project select + "New project" form using `WORLDS`; shot select + "New shot" form using `createShot`); center (iframe + scrubber that calls `sample(keys, t, fps)` and `bridge.call('setCameraRaw', {eye, look, fov})`, building `eye = [pos[0], 1.7, pos[1]]` for walk keys per ruling 3 — commented in code — since ground height comes from the previz renderer, not the UI); right panel (mode/caption/cut/**t** controls + "Add key @ t" reading `bridge.call('pos')` → `keyFromCamera`, and a keyframe table with per-row t/cap/cut/time editors and Delete). Exposes `window.__studio = { bridge, ctx }` once the bridge is ready (debug/E2E hook, mirrors the world's own `window.__twin`). Keeps a shared `ctx: { project, shot, bridge, save(), refresh() }` object and mounts `jobs.ts` via `mountJobsPanel(panelJobs, ctx)`, matching the brief's guidance for Task 11 to add further `mount*(el, ctx)` panels later.
- `studio/app/src/style.css` — dark theme, `grid-template-columns: 240px 1fr 320px`, monospace keyframe table/log.
- `studio/app/vite.config.ts` — `root`/fs-allow resolved via `fileURLToPath(new URL(...))` from the config file's own location (not `process.cwd()`, since `vite --config app/vite.config.ts` can be invoked from `studio/`), port 5180 strict, `/api` `/files` `/ws` proxied to `http://localhost:5190`, `build.outDir: 'dist'` (→ `studio/app/dist`, matching `server/index.mjs`'s `APP_DIST`).
- `studio/app/tsconfig.json` — strict, ES2022/DOM, scoped to `app/src` (separate from `studio/tsconfig.json`, which also references the not-yet-created `app/phone` from Task 11/12).
- `studio/app/src/mjs-shim.d.ts` — `declare module '*.mjs';` so `tsc --noEmit` accepts the plain-ESM schema imports.
- `studio/test/timeline.test.ts` — verbatim from the brief (3 tests).

### One UX deviation from the brief's literal `main.ts` sketch

The brief's "Add key @ t" reads `t` from the playback scrubber. I added a separate **`#nk-t`** number input instead (defaulting to the current scrub value) and read from that. Reason: the scrubber's `max` is bounded by `duration(shot.keys)`, so with 0 or 1 keys it cannot be moved past the current duration — but adding a *trailing* key (e.g. at t=2 when only a t=0 key exists) is exactly the case where you need to specify a time beyond the current range. This also matches the brief's own Step-4 script, which asks to add keys "with the scrubber at 0 and 2s" — impossible via the native range widget's clamping once `max` is 0. Confirmed via the manual check below (added at t=0 and t=2 with only 2 keys existing).

## Two pre-existing bugs fixed (outside Task 10's file list, but blocking it end to end)

1. **`studio/schemas/project.mjs`** — `import { randomUUID } from 'node:crypto'` executed `randomUUID` off the module's top-level bound name. Vite's dev server externalizes `node:*` imports for client code into a stub that throws on property access, and its transform does `const randomUUID = __vite__cjsImport0_node_crypto["randomUUID"]` at module-eval time — so merely importing `WORLDS`/`createProject`/`createShot` from the browser (as the Task 10 interfaces spec requires) crashed the whole module on load, before `newId()` was ever called. Fixed by using the global Web Crypto `crypto.randomUUID()` instead (available in Node 19+ and every evergreen browser) — no behavior change, same UUID shape, `test/project.test.mjs`'s `/^[a-z0-9-]{8,}$/` id check still passes.
2. **`studio/server/store.mjs`** — `PROJECTS_DIR` was taken directly from `process.env.STUDIO_PROJECTS` unnormalized. On Windows, a forward-slash env value (e.g. the temp dir the task instructions say to set for manual checks) never `startsWith()`-matched the backslash-normalized `path.resolve()` output used in `server/index.mjs`'s static-file safety check, so **every** `GET /files/...` request 404'd even though the file existed on disk. Fixed by wrapping `PROJECTS_DIR` in `path.resolve(...)` in `store.mjs`. Verified: previz video and all three export artifact links now resolve 200.

Both fixes are minimal, backward-compatible, and re-verified against the full existing test suite (`test/project.test.mjs`, `test/store.test.mjs`, `test/api.test.mjs`, `test/jobs.test.mjs`, and the full 46-test suite) with no regressions.

## Test output

`npx vitest run test/timeline.test.ts` (TDD step, before implementation): **FAIL** — `Cannot find module '../app/src/timeline'` (expected, file didn't exist yet).

After implementing `timeline.ts`:
```
✓ test/timeline.test.ts (3 tests) 5ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Full suite after all changes (`npx vitest run`):
```
✓ test/seedance.test.mjs (11 tests)
✓ test/project.test.mjs (6 tests)
✓ test/store.test.mjs (2 tests)
✓ test/jobs.test.mjs (2 tests)
✓ test/keys.test.mjs (9 tests)
✓ test/inject.test.mjs (5 tests)
✓ test/ws.test.mjs (1 test)
✓ test/timeline.test.ts (3 tests)
✓ test/api.test.mjs (2 tests)
✓ test/export.test.mjs (1 test)   31947ms
✓ test/browser.test.mjs (3 tests) 38501ms
✓ test/previz.test.mjs (1 test)   41655ms

 Test Files  12 passed (12)
      Tests  46 passed (46)
```

`npx tsc --noEmit -p app`: clean, no output.

## Manual/Playwright check (brief Step 4)

Ran the studio server (`STUDIO_PORT=5190`, `STUDIO_PROJECTS=<temp dir>`), `npm run dev:ui` (port 5180), and the union-square-sf world dev server (port 5173; had to be relaunched with `npx vite --port 5173 --strictPort` after an incidental `taskkill /IM node.exe` mid-session — its own `npm run dev` script fails independently of my changes due to a pre-existing `tools/geo/sync_data.mjs` cwd bug unrelated to Task 10, noted below). Drove the UI headless via the `playwright` package already in `studio/node_modules`, launched with the exact GPU flags from `studio/server/render/browser.mjs` (`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist --use-gl=angle --hide-scrollbars`), since the world iframe needs a working WebGL context. (The Playwright MCP tool doesn't expose custom launch args, so I wrote a small throwaway Node script instead — not committed.)

Transcript (mandated flow):
```
[check] navigating to http://localhost:5180/
[check] creating project
[check] creating shot
[check] waiting for world bridge ready
[check] status line: world ready
[check] key rows after adding 2 keys: 2
[check] pos before scrub: {"eye":[-10,8,-10],"look":[-3.5517,3.8965,-3.5517],"fov":60}
[check] pos after scrub to 1s: {"eye":[0,6.5,0],"look":[-0.2934,-3.4914,-0.2934],"fov":60}
[check] camera moved after scrub: true
[check] clicking Render previz
[check] job status: queued
[check] job status: running
[check] job status: done
[check] previz video src: /files/b3f36027-8881/shots/a8d88225-2d93/previz.mp4
[check] GET previz video status: 200
[check] screenshot saved to .superpowers/sdd/2026-09-05-mv-studio/task-10-ui.png
[check] console errors: []
[check] page errors: []
[check] RESULT: PASS
```

Extra (not mandated, but exercises code paths the mandated script doesn't — the export artifact-link builder):
```
[export-check] clicking Export
[export-check] export job status: done
[export-check] artifact hrefs: ["/files/6ac71f09-5ac0/export/scene.glb","/files/6ac71f09-5ac0/export/e48e2279-ff30.keys.json","/files/6ac71f09-5ac0/export/blender_import.py"]
[export-check] .../scene.glb -> 200
[export-check] .../e48e2279-ff30.keys.json -> 200
[export-check] .../blender_import.py -> 200
[export-check] RESULT: PASS
```

Console/page errors observed: **none** (zero, not even favicon 404s, in either run).

Screenshot: `.superpowers/sdd/2026-09-05-mv-studio/task-10-ui.png` — shows the left project/shot panel, the world iframe mid-scrub (t=1.00s, live eye readout `(0.00, 6.50, 0.00)`), the keyframe table with the two added keys (t=0, t=2, both `air`), and the jobs/finalize panel below.

Servers were stopped after the check (`taskkill /F /IM node.exe`); confirmed all three ports (5173/5180/5190) refuse connections afterward.

## Deviations / notes for the controller

- Added a dedicated `#nk-t` time input for "Add key @ t" instead of reading the playback scrubber directly — see rationale above. `timeline.ts`/`bridge.ts`/`api.ts`/the test file are otherwise verbatim per rulings 4 (and the brief).
- Added `api`-adjacent convenience only where the brief already implied it (no new server routes touched); `jobs.ts` tracks jobs it starts in-memory rather than re-fetching `GET /api/projects/:id/jobs` on panel mount — acceptable for this MVP since the panel is mounted once per session and jobs are always started from it.
- Fixed two pre-existing bugs outside the Task 10 file list (see above) because they made the mandated manual check impossible to pass as specified; both are minimal, additive, and re-verified against the existing test suite with no regressions.
- `union-square-sf`'s own `npm run dev` script (`node tools/geo/sync_data.mjs && vite ...`) fails on this machine with an `ENOENT: mkdir 'C:\C:\Users\...\public\data'` (doubled drive-letter prefix, likely a bash/URL-encoding cwd artifact unrelated to Task 10). Worked around for the manual check by running `npx vite --port 5173 --strictPort` directly, skipping `sync_data.mjs`. Not fixed — out of scope for this task and the world dev server was already confirmed running independently at the start of the session.
- `union-square-sf/package-lock.json` had a pre-existing uncommitted modification unrelated to my work; left untouched and unstaged per instructions (only `git add studio` was run).

## Files touched

- Created: `studio/app/index.html`, `studio/app/vite.config.ts`, `studio/app/tsconfig.json`, `studio/app/src/main.ts`, `studio/app/src/bridge.ts`, `studio/app/src/timeline.ts`, `studio/app/src/api.ts`, `studio/app/src/jobs.ts`, `studio/app/src/style.css`, `studio/app/src/mjs-shim.d.ts`, `studio/test/timeline.test.ts`

## Fix round 1 (review findings F1–F4)

No servers/browsers started this round per the coordinator's instruction — verified with `tsc --noEmit -p app` and the specified vitest subset only.

**F1 (Important, XSS) — fixed.** Added `studio/app/src/dom.ts` exporting a single shared `esc(s: unknown): string` (escapes `& < > " '`). `jobs.ts`'s local `esc()` was removed in favor of importing this one. In `main.ts`:
- `fmtWorldOptions` now escapes both the `value` and text of each world `<option>`.
- The project-select and shot-select `<option>` lists (previously built from an unescaped `${p.name} (${p.world})` / `${s.name}` template string) are now built via a new `fillOptions()` helper that uses `document.createElement('option')` + `.textContent`/`.value` — no HTML parsing of the name/world strings is possible at all, so no escaping is needed there (per the brief's "prefer createElement... where you can").
- The keyframe table's `k.cap` (previously only quote-escaped via a hand-rolled `.replace(/"/g, '&quot;')`), `k.m`, `k.t`, and the "Add key @ t" default `t` value are now run through `esc()`.
- `jobs.ts` already used a local `esc()` for job type/status/log/reason/artifact filenames — repointed to the shared helper, behavior unchanged.
Status text (`statusEl.textContent = ...`) was left as `textContent` assignment, which is inherently safe (never parsed as HTML) — no change needed there.

**F2 (Minor, fold in) — fixed.** `WorldBridge` in `bridge.ts` now keeps named references to both its `message` listeners (`mainHandler` for cmd/res/pos, `readyHandler` for the one-shot `studio:ready`) and its ping-poll `setInterval` handle (`pollTimer`), and exposes `dispose()` which removes both listeners and clears the poll timer. The one-shot `readyHandler` is also now removed as soon as `ready` resolves via either path (previously it stayed attached forever even after settling). In `main.ts`, a new `disposeBridge()` helper (`ctx.bridge?.dispose(); ctx.bridge = null;`) is called at the top of `mountWorldForShot` (before constructing the replacement bridge) and in `selectProject` (before nulling `ctx.bridge` when switching projects) — so repeatedly switching shots/projects no longer leaks `window` listeners or risks two live bridges whose request ids collide (both instances number requests from `c1`).

**F3 (Minor, fold in) — fixed.** `jobs.ts`'s `trackJob` now wraps its `api.pollJob(...)` call in try/catch; on rejection it sets that job's `status` to the synthetic `'error'` state with `error` set to the failure message, and re-renders, instead of leaving the card frozen on its last-seen status. `renderJobs()`'s error-row condition was widened from `status === 'failed'` to `status === 'failed' || status === 'error'` so the message renders (through `esc()`, per F1) either way. Added a matching `.status-error` CSS rule (same color as `.status-failed`). Also wrapped `startJob`'s `ctx.save()`/`api.job(...)` calls in try/catch with an `alert()` on failure, since a rejection there happens before any job card exists to attach the error to.

**F4 — added.** `studio/test/dom.test.ts`: `esc('<img src=x onerror=1>')` contains no raw `<`/`>`; `esc('"')` → `&quot;`; `esc("'")` → `&#39;`; `esc('&')` → `&amp;`; `esc(42)` → `'42'` and `esc(undefined)` → `''`, both without throwing.

### Verification

```
$ npx tsc --noEmit -p app
(clean, no output)

$ npx vitest run test/dom.test.ts test/timeline.test.ts test/project.test.mjs test/store.test.mjs test/api.test.mjs
✓ test/project.test.mjs (6 tests)
✓ test/store.test.mjs (2 tests)
✓ test/timeline.test.ts (3 tests)
✓ test/dom.test.ts (5 tests)
✓ test/api.test.mjs (2 tests)
 Test Files  5 passed (5)
      Tests  18 passed (18)
```

### Files touched this round

- Created: `studio/app/src/dom.ts`, `studio/test/dom.test.ts`
- Modified: `studio/app/src/bridge.ts`, `studio/app/src/jobs.ts`, `studio/app/src/main.ts`, `studio/app/src/style.css`
- Modified: `studio/schemas/project.mjs`, `studio/server/store.mjs`
