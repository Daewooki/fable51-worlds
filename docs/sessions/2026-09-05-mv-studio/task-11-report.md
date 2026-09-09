# Task 11 report: prompt → path and phone virtual camera

## What was built

**Server**
- `studio/server/prompt.mjs` (new): `anchorsFor(world)`, `anchorsToKeys(anchors, durationSec)`, `promptToKeys({world, prompt, durationSec, provider})`.
  - `TOURS['union-square-sf']` kept verbatim from the brief.
  - `TOURS['kyoto-higashiyama']` filled with 6 stops copied from `kyoto-higashiyama/src/systems/cameras.js` `HERO_VIEWS` (Hanamikoji → Yasaka Honden → Maruyama cherry → the pagoda view → Sannenzaka steps → the Kiyomizu stage), converted to `{pos, look}` with a ported `dirFromYawPitch(yaw, pitch)` that mirrors the `THREE.Euler(pitch, yaw, 0, 'YXZ')` convention both `kyoto-higashiyama/src/core/player.js` (`applyCamera`) and `union-square-sf/src/player/WalkControls.ts` (`applyLook`) use.
  - `union-square-sf/public/data/viewpoints.json` entries are placed via a ported `geoToLocal` (union-square-sf's `ORIGIN_LAT/LON`, `GRID_BEARING_DEG`, `M_PER_DEG_LAT/LON` constants) and a ported `compassToYaw` (from `union-square-sf/src/debug/Viewpoints.ts`), then given a look point 20 m ahead via the same `dirFromYawPitch`. `absoluteY`, when present, is used directly as local `y` (verified against `Viewpoints.place()`, which does exactly that — it is already local-frame height, not a raw NAVD88 elevation, so no `ORIGIN_ELEVATION_M` subtraction is applied). kyoto-higashiyama has no `viewpoints.json`, so it only gets the 6 hand-picked tour stops (`anchorsFor('kyoto-higashiyama').length` is 6, still `> 3` as tested).
  - `promptToKeys`: provider `'none'` (default, no network) falls back to `anchorsToKeys`; `'anthropic'` posts to `api.anthropic.com/v1/messages` with `model: process.env.STUDIO_LLM_MODEL || 'claude-sonnet-5'`; `'openai'` posts to `api.openai.com/v1/chat/completions` with `model: process.env.STUDIO_LLM_MODEL || 'gpt-4o-mini'`. Non-2xx responses throw `Error(\`${provider} ${status}: ${first 300 chars of body}\`)`. API keys are read from env and never logged or echoed back.
  - Paths resolved via `fileURLToPath(new URL('../..', import.meta.url))`, not `.pathname.replace`.
- `studio/server/index.mjs`: added routes inside `createServer()`:
  - `POST /api/projects/:id/prompt` `{prompt, durationSec, provider}` → reads the project (404 if missing), calls `promptToKeys` with the project's `world`, returns `{keys}` (200) or `{error}` (400) on provider/validation failure.
  - `GET /api/qr?url=` → `QRCode.toBuffer(url)`, `image/png`; rejects non-`http(s)` URLs with 400.
  - `GET /api/config` → `{provider, hasKey}` from `STUDIO_LLM` and whether the matching API key env var is set (never the key itself).
  - `GET /api/lan-ip` → `{ip}` from the first non-internal IPv4 in `os.networkInterfaces()`.
- `studio/test/prompt.test.mjs` (new, brief's 3 cases + 1 more for kyoto anchors) and an extension to `studio/test/api.test.mjs` (prompt with `provider:'none'` → 200 with ≥2 keys; `GET /api/qr` → 200 `image/png`).

**Phone page** (`studio/app/phone/index.html` + `phone.ts`, new): big-touch-target Start/Record buttons, dolly (−1..1) and zoom (30..90 fov) range inputs. On Start: checks `DeviceOrientationEvent` exists (else shows an inline message), requests iOS permission if `requestPermission` exists (shows a specific message on denial or on a rejected permission promise), then streams `{type:'cam', q, dolly, zoom, ts}` at 30 Hz (33 ms) over `/ws` after joining room `phone`. Record toggles `{type:'rec', on}`. `ws.onclose` shows "reconnecting…" and retries after 1 s. The live socket is exposed on `window.__ws` for testing. Added to `app/vite.config.ts`'s `build.rollupOptions.input` as a second entry (`phone`).

**Director side** (`studio/app/src/phone.ts`, new): pure `quatToLook(q)` and `integrate(state, dir, dolly, dt, speed)` (TDD'd against the brief's tests verbatim), plus `mountPhonePanel(el, {projectId, bridge, onRecorded})`. It renders the QR (`/api/qr?url=...`), the URL text, and a status line; opens its own `/ws` connection, joins room `director`, and on each `cam` message integrates the eye, applies `bridge.call('setCameraRaw', {eye, look, fov})`, and — while a `rec` is in progress — appends one air key per sample (`cut:true` only on the very first sample of a recording). If a recording runs past 60 s it auto-stops, calls `onRecorded`, and shows a warning in the status line. Beyond the brief's literal signature, `mountPhonePanel` returns `{dispose()}` (closes the socket, since the panel needs to be re-created whenever the active project — and thus the room's `projectId` — changes) and reconnects on `onclose` with a 1 s backoff, matching the phone page's own reconnect behavior.

`studio/app/src/prompt.ts` (new): the Director-side "Prompt → path" panel — textarea, duration (defaults to the current shot's `duration(keys)` or 10, refreshed whenever the shot changes unless the field has focus), a provider `<select>` (`none`/`anthropic`/`openai`) whose default comes from `GET /api/config`, and a Generate button that POSTs, replaces `ctx.shot.keys`, calls `ctx.save()` + `ctx.refresh()`, and shows any error inline via `esc()`.

**Wiring** (`studio/app/src/main.ts`, `index.html`, `style.css`): added `#panel-prompt` and `#panel-phone` as a third grid row below the jobs panel (`grid-template-rows: 1fr auto auto`). `mountPromptPanel`/`mountPhonePanel` are wired analogously to the existing `mountJobsPanel` pattern; `renderAll()` now also calls `promptPanel.refresh()`. The phone panel is (re)mounted per project (`mountPhoneForProject`, disposing the previous mount) since its QR URL and `join` message are keyed to the project id; it's driven by a `bridgeProxy` that looks up `ctx.bridge` at call time so a shot switch (which disposes/rebuilds the world bridge) doesn't require remounting the phone panel.

**HTTPS** (`studio/app/vite.config.ts`): `server.https` is now conditional on `studio/.certs/localhost-key.pem` + `localhost.pem` existing (else `undefined`, i.e. plain http); a comment documents the `mkcert` command. `.certs/` was already gitignored in `studio/.gitignore` — no change needed there.

## Anchor conversion — worked example

`union-square-sf/public/data/viewpoints.json` `vp01`: `lat=37.787329, lon=-122.407648, heightM=30, headingDeg=355, pitchDeg=-20, absoluteY=35.8`.

1. `geoToLocal`: `dE = (lon - ORIGIN_LON) * M_PER_DEG_LON`, `dN = (lat - ORIGIN_LAT) * M_PER_DEG_LAT`, then rotated by `GRID_BEARING_DEG` → `x ≈ -22.01, z ≈ 64.55` (grid-east/grid-south frame).
2. `y = absoluteY = 35.8` (used directly, per `Viewpoints.place()`).
3. `yaw = compassToYaw(355) = -(355 - (80.686 - 90)) * π/180 = -(355 + 9.314) * π/180 ≈ -6.359 rad`; `pitch = -20 * π/180 ≈ -0.349 rad`.
4. `dir = [-sin(yaw)·cos(pitch), sin(pitch), -cos(yaw)·cos(pitch)]` — plugged into `anchorsFor('union-square-sf')` (verified by actually running it, not just hand arithmetic) this comes out to `look = pos + 20·dir ≈ [-20.60, 28.96, 45.81]`.

Anchor (actual output of `anchorsFor('union-square-sf')`, confirmed by running the code, not derived by hand): `{id:'vp01', title:"Elevated view from Macy's roof terrace...", pos:[-22.012117942680888, 35.8, 64.54990335048207], look:[-20.59839958048968, 28.959597133486625, 45.80929799696696]}`.

*(Correction, fix round 1: this section previously stated `pos ≈ [-71.4, 122.9]`/`look ≈ [-73.1, 28.9, 104.2]` from a hand calculation that had an error; the numbers above are the actual code output.)*

## Tests

TDD order: wrote `studio/test/prompt.test.mjs` and `studio/test/phone.test.ts` first (confirmed both failed with "Cannot find module" since neither `server/prompt.mjs` nor `app/src/phone.ts` existed yet), then implemented, then re-ran green.

Final targeted run:
```
✓ test/prompt.test.mjs (4 tests)
✓ test/phone.test.ts (2 tests)
✓ test/api.test.mjs (4 tests)
```

Full suite (`npx vitest run`), 15 files / 59 tests: **56 passed, 3 failed** — all 3 failures are in `test/browser.test.mjs`, `test/export.test.mjs`, `test/previz.test.mjs`, all with `net::ERR_CONNECTION_REFUSED at http://localhost:5173`. This is **pre-existing and environmental, unrelated to Task 11**: `union-square-sf`'s own `npm run dev` (needed to serve its world at :5173 for those Playwright-in-browser.mjs tests) fails before Vite even starts, because `union-square-sf/tools/geo/sync_data.mjs` builds its root path via `new URL('.', import.meta.url).pathname` (unencoded, with the leading `/`) instead of `fileURLToPath` — exactly the bug pattern the controller ruling for *this* task told me to avoid. Since this repo's own path contains a space (`Personal Project`) and a drive letter, `.pathname` on `file:///C:/Users/.../Personal%20Project/...` resolves to a broken, doubled `C:\C:\...\Personal%20Project\...\public\data`, and `fs.mkdirSync` throws before Vite can listen on 5173. This file is in `union-square-sf/`, out of scope for this task (and for `git add studio`), and predates my changes — verified none of my edits touch `union-square-sf/` or `kyoto-higashiyama/`. All studio-side tests (including every one touched by this task) pass.

`tsc --noEmit -p app`: clean, no errors (tsconfig `include` extended to add the new `phone/` dir alongside `src`).

## Manual/Playwright check

Real-phone testing (mkcert HTTPS + an actual iPhone/Android) is **out of scope** per the brief and was not attempted. Instead, ran an end-to-end headless Playwright check (chromium, GPU args from `server/render/browser.mjs` with a software fallback) against a temp `STUDIO_PROJECTS` dir and `npm run dev:ui`:

1. Backend on :5190 (`STUDIO_PROJECTS=<tmp>`), Vite dev server on :5180 — both waited-for via polling before driving the browser.
2. Director page: created project "Manual QA project" (world `union-square-sf`), created shot "Shot A".
3. Prompt panel: provider `none` (default from `GET /api/config`, since `STUDIO_LLM` unset), prompt text + duration 8, clicked Generate → keyframe table showed **4 rows** matching the first 4 `union-square-sf` tour anchors (Union Square aerial / Dewey Monument / Powell Street / Nintendo SAN FRANCISCO) at `t = 0, 2.67, 5.33, 8`, confirmed both via the DOM and via `GET /api/projects/:id`.
4. Screenshot of the full Director page (with the Prompt→path panel, the filled keyframe table, and the Phone camera panel showing its QR code) saved to `.superpowers/sdd/2026-09-05-mv-studio/task-11-ui.png`.
5. Second page in the same browser context, opened `http://localhost:5180/phone/?projectId=<id>` (plain http — no mkcert certs configured in this run, which is fine off-iOS). Waited for `window.__ws.readyState === 1` (auto-join happens on `ws.onopen`), then evaluated `window.__ws.send(...)` directly (bypassing real device sensors, per the brief's suggested test approach): `{type:'rec', on:true}`, three `{type:'cam', q:[0,0,0,1], dolly:1, zoom:66, ts:...}` samples ~120 ms apart, then `{type:'rec', on:false}`.
6. Verified (both via the Director's live keyframe-table DOM and via `GET /api/projects/:id`) that the shot now has exactly 3 air keys, all `m:'air'`, with `cut:true` on the first key only and `cut:false`/absent-equivalent on the rest, `t` increasing (0.001, 0.137, 0.273), `eye`/`look` drifting along -z (dolly=1, identity quaternion → straight -z direction) as expected from `integrate`. **RECORDING CHECK: PASS. GENERATE CHECK: PASS.**
7. Both servers were killed at the end of the script (checked `netstat` afterward — ports 5173/5180/5190 have no listeners, only closing `TIME_WAIT` sockets).

The manual-check script itself was written to the OS scratchpad, temporarily copied into `studio/` to resolve its `playwright` import, and deleted again before this report/commit — it is not part of the diff being committed.

## Deviations from the brief (all per controller rulings, or otherwise noted)

1. Paths via `fileURLToPath`, not `.pathname.replace` (ruling 1).
2. `kyoto-higashiyama` TOURS filled with 6 `HERO_VIEWS`-derived stops instead of `[]`; `union-square-sf` TOURS kept verbatim (ruling 2).
3. `viewpoints.json` handling ported with the given `GEO` constants and `compassToYaw`; `absoluteY` used directly as local `y` (verified against `Viewpoints.place()`'s own behavior, not treated as a raw NAVD88 elevation) — no ground/building-clearance correction is applied server-side (there's no terrain query available in Node), which is an approximation the ruling anticipated ("y = ... use whatever main.ts does").
4. Anthropic model `claude-sonnet-5` (not `claude-sonnet-4-5`), both models overridable via `STUDIO_LLM_MODEL`; non-2xx → `Error` with status + first 300 chars of body (ruling 3).
5. Routes added exactly as specified, plus `GET /api/config` and `GET /api/lan-ip` (ruling 8, ruling 5) which the prompt panel and phone panel respectively depend on.
6. `mountPhonePanel` returns `{dispose()}` (not in the brief's literal signature) so the Director can tear down and recreate the phone connection when the active project changes — without this, switching projects would leak a stale `/ws` connection still joined to the old `projectId`'s room. Also added the required 1 s-backoff auto-reconnect on both phone and director sides, and a 60 s recording cap with a status-line warning (ruling 6).
7. `vite.config.ts` `server.https` is conditional on cert-file existence per ruling 7; `.certs/` was already in `.gitignore`.
8. Prompt/phone panels were placed in a new third grid row (`#panel-bottom2`, split into `#panel-prompt`/`#panel-phone`) rather than folded into the existing `#panel-right`/`#panel-jobs`, since those are already fully re-rendered by their own owners on every `ctx.refresh()` — mounting into them would either get wiped or require entangling their render functions. This mirrors how `#panel-jobs` itself is already a separate, once-mounted panel.

## Concerns

- The 3 pre-existing test failures (world-dev-server-dependent tests) are environmental (path-with-space bug in `union-square-sf`, out of scope) and were already failing before this task's changes — worth flagging to the controller in case CI runs from a space-free path and doesn't hit this, in which case those tests should be green there.
- Server-side anchor placement for `viewpoints.json` doesn't do the terrain/building-clearance correction that `Viewpoints.place()` does in-browser (no terrain data available server-side); anchors from elevated viewpoints could occasionally sit inside a building's footprint. This only affects the LLM-grounding anchor list and the `anchorsToKeys` fallback's *first 4* anchors (which are always the hand-authored TOURS stops, not viewpoints.json ones, since TOURS entries are placed first in `anchorsFor`'s output) — so it has no effect on the `provider:'none'` path or the manual/automated test results, only on what an LLM-backed generation would see as grounding for anchors beyond the first 8 (union-square-sf) or 6 (kyoto-higashiyama).
- `anthropic`/`openai` providers were not exercised end-to-end (no API keys available in this environment) — only the request-construction, model defaults, non-2xx error path, and `provider:'none'` fallback are covered by tests.

## Fix round 1 (review findings)

Per the controller's review, no servers/browsers were started this round; the running world dev server on :5173 was left untouched.

- **F1 (Important)** `studio/app/src/phone.ts`: added an exported pure `sanitizeCam(m: unknown)` that returns `null` unless `q` is an array of exactly 4 finite numbers with non-zero length (normalizes it if so), clamps `dolly` to `[-1, 1]` (default `0` if missing/non-finite) and `zoom` to `[30, 90]` (default `66`), and requires a finite `ts` (missing/non-finite → `null`). The `cam` branch of `mountPhonePanel`'s `ws.onmessage` now calls `sanitizeCam(m)` first and returns early (leaving `eye`/`last` untouched) when it's `null`, so a malformed/NaN sample can no longer poison the eye permanently. After `integrate`, the new `eye` is only accepted if every component is finite (`Number.isFinite`); otherwise the previous `eye` is kept. Recorded keys use the sanitized `cam.dolly`/`cam.zoom`/`cam.ts`, not the raw message fields.
- **F2 (Minor)** `studio/app/phone/phone.ts`: Start now toggles to Stop (`streaming` flag + `stopStreaming()`), which clears the 33 ms send interval and removes the `deviceorientation` listener; no HTML change was needed since the existing `#start` button already serves as the toggle. Record (`#rec`) is untouched and stays independent — recording can still be toggled while streaming is stopped (the phone just won't be sending fresh `cam` samples for the Director to record in that case, which is the expected, if degenerate, behavior).
- **F3 (Minor)** `studio/server/index.mjs`: `GET /api/qr` now rejects `url.length > 2048` with `400 {error:'url too long'}`, checked before the `http(s)://` scheme check and before calling `QRCode.toBuffer`.
- **F4 (Docs)** Corrected the worked example: the report previously stated `pos ≈ [-71.4, ?, 122.9]` / `look ≈ [-73.1, 28.9, 104.2]` for `vp01` from a hand calculation that had an arithmetic error. Re-ran `anchorsFor('union-square-sf')` directly (`node -e "import('./server/prompt.mjs').then(...)"`) and confirmed the actual, correct values: `pos ≈ [-22.01, 35.8, 64.55]`, `look ≈ [-20.60, 28.96, 45.81]` — matching the coordinator's numbers exactly. The "Anchor conversion" section above is updated with these verified values and a note that they come from running the code, not from hand arithmetic.
- **F5 (Tests)** Extended `studio/test/phone.test.ts` with 6 new cases for `sanitizeCam`: a valid sample passes through with `q` normalized (`[0,0,0,2]` → `[0,0,0,1]`); a `q` containing `NaN` → `null`; a `q` of length 3 → `null`; `dolly: 5` → clamped to `1`; `zoom: 200` → clamped to `90`; a message with no `ts` → `null`. Extended `studio/test/api.test.mjs` with a case that GETs `/api/qr` with a ~3012-char `https://` URL and expects `400 {error:'url too long'}`.

Verification: `cd studio && npx tsc --noEmit -p app` → clean, no errors. `npx vitest run test/phone.test.ts test/api.test.mjs test/prompt.test.mjs` → **3 files, 17 tests, all passed** (`phone.test.ts` 8 tests including the 6 new `sanitizeCam` cases, `api.test.mjs` 5 tests including the new url-too-long case, `prompt.test.mjs` unchanged at 4 tests). No servers or browsers were started for this fix round.
