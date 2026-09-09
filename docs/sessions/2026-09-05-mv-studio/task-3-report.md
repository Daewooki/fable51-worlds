# Task 3 report — world patches: studio bridge + asset override hook (union-square-sf)

## Fix report — round 1 (controller re-enable defect + minor hardening)

Coordinator review confirmed the self-review concern from the initial pass as a real defect: the single disable point after `setMode(mode)` was insufficient because later code in `main()` (`applyView()`'s `setMode('walk')`, and `if (mode === 'orbit') setMode('orbit');`) can re-enable the active controller, e.g. under `?studio=1&mode=orbit`.

**What changed:**

1. `union-square-sf/src/main.ts`:
   - Hoisted `const studioMode = new URLSearchParams(location.search).get('studio') === '1';` near the top of `main()`, replacing the three separate inline `new URLSearchParams(location.search).get('studio') === '1'` checks with references to `studioMode`.
   - Kept the existing disable right after the initial `setMode(mode);`.
   - Added a second re-assert of `if (studioMode) { walk.enabled = false; orbit.setEnabled(false); }` after all placement/mode logic has settled — specifically after `if (Config.ref) ref.setEnabled(true);` and before the render-loop/streaming setup. `setMode()` itself was left untouched, per the ruling.
2. `union-square-sf/src/debug/StudioBridge.ts`: added `if (ev.source !== window.parent) return;` at the top of the `message` handler, before the `type` check, so events from any other frame/window are ignored outright.
3. `union-square-sf/tools/qa/studio_bridge_test.mjs`: refactored into reusable `waitReady()`/`postCmd()` helpers and added:
   - An unknown-command assertion: `{cmd:'nope'}` must yield `studio:res` with `ok === false` and a non-empty `error` (the existing handler's `throw new Error(...unknown cmd...)` path).
   - A second scenario loading the iframe with `&mode=orbit`, sending `setCameraRaw` (`eye:[10,50,10]`), waiting 400ms (several rendered frames), then calling `pos` and asserting `eye[1]` is still `50` — this specifically exercises the re-assert fix, since without it `OrbitMode`'s per-frame update would overwrite the camera back off `y=50`.
   - `PASS studio bridge` is now printed only after scenario 1 (default walk mode: `setCameraRaw` + `pos` round-trip), the unknown-cmd check, and scenario 2 (orbit-mode persistence) all pass.

**Covering tests + commands run:**

`cd union-square-sf && npm run typecheck`:
```
> union-square-digital-twin@0.1.0 typecheck
> tsc --noEmit
```
Clean, no errors.

`node tools/qa/studio_bridge_test.mjs` (dev server on :5173):
```
{"res":{"type":"studio:res","id":"k1","ok":true,"data":true},"pos":{"eye":[10,50,10],"look":[8.075499102701247,40.37749551350624,8.075499102701249],"fov":50}}
{"bad":{"type":"studio:res","id":"k3","ok":false,"error":"unknown cmd nope"}}
{"res2":{"type":"studio:res","id":"o1","ok":true,"data":true},"pos2":{"eye":[10,50,10],"look":[8.075499102701247,40.37749551350624,8.075499102701249],"fov":50}}
PASS studio bridge
```
All four assertions hold, including `pos2.eye[1] === 50` under `mode=orbit` after a 400ms settle — confirming the re-assert fix actually prevents `OrbitMode` from clobbering the studio-set camera.

**Commit:** `9c83c9a` — `fix(union-square-sf): re-assert studio controller disable, guard bridge origin` (files: `union-square-sf/src/main.ts`, `union-square-sf/src/debug/StudioBridge.ts`, `union-square-sf/tools/qa/studio_bridge_test.mjs`). `union-square-sf/package-lock.json` remains intentionally unstaged (pre-existing, unrelated modification).

---

## Summary

Implemented exactly per the brief:

1. **Created `union-square-sf/src/debug/StudioBridge.ts`** — `installStudioBridge(app, twin)` wires a `message` listener that handles `ping`, `setCameraRaw`, `setTime`, `freeze`, `setMode`, `pos` commands and replies with `{type:'studio:res', id, ok, data|error}`; sends `{type:'studio:ready'}` once on install and `{type:'studio:pos', pos}` every 250ms to `window.parent`. Copied verbatim from the brief's Step 2 code block.

2. **Patched `union-square-sf/src/main.ts`**:
   - `loadManifests([...])` (line 27) now includes `'varco'`.
   - Added `await Assets.loadOverrides();` immediately after `loadManifests`.
   - Added, immediately after `setMode(mode);` (~line 130): `if (new URLSearchParams(location.search).get('studio') === '1') { walk.enabled = false; orbit.setEnabled(false); }` — this runs before `Config.view`/`Config.pos` placement logic, and since the test URL has neither `view=` nor `pos=` (and default `mode` is not `'orbit'`), nothing re-enables the controllers afterward.
   - Added, immediately after the existing `installQa({...});` call (last statement before `main()`'s closing brace): `if (new URLSearchParams(location.search).get('studio') === '1') { const { installStudioBridge } = await import('./debug/StudioBridge'); installStudioBridge(app, (window as any).__twin); }` — passes `app` explicitly per the brief's ambiguity resolution #1 (did not widen `TwinApi`).

3. **Patched `union-square-sf/src/assets/Assets.ts`**:
   - Added `overrides: {} as Record<string, string>,` to the `Assets` object.
   - Added `async loadOverrides() { try { const r = await fetch(\`${BASE}data/asset_overrides.json\`); if (r.ok) this.overrides = await r.json(); } catch { /* none */ } },` — tolerates a 404/network error silently, leaving `overrides` as `{}`.
   - Changed `load(rel)`'s GLB fetch path from `` `${BASE}assets/models/${rel}.glb` `` to `` `${BASE}assets/models/${this.overrides[rel] ?? rel}.glb` `` — only the file path is affected; the manifest key (`rel`) used for caching (`protos.get/set(rel)`) and `g.name = rel` is unchanged, so `Assets.has(rel)` / manifest lookups remain keyed by the logical asset name.

4. **Wrote `union-square-sf/tools/qa/studio_bridge_test.mjs`** — Playwright test, copied verbatim from the brief's Step 5 code block, using the Windows/NVIDIA-safe launch args (`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist --use-gl=angle --enable-unsafe-swiftshader --hide-scrollbars`) instead of the macOS-only `--use-angle=metal`.

## Verification

### `npm run typecheck` (in `union-square-sf`)
```
> union-square-digital-twin@0.1.0 typecheck
> tsc --noEmit
```
Clean, no errors.

### `node tools/qa/studio_bridge_test.mjs` (against dev server on :5173, already running)
```
{"res":{"type":"studio:res","id":"k1","ok":true,"data":true},"pos":{"eye":[10,50,10],"look":[8.075499102701247,40.37749551350624,8.075499102701249],"fov":50}}
PASS studio bridge
```
`pos.eye[1] === 50` and `pos.fov === 50` as required (camera writes from `setCameraRaw` were not overwritten by the walk controller, confirming the `?studio=1` disable-controllers patch works).

### Sanity check — untouched path (no `?studio=1`)
Ran an ad-hoc Playwright check (temporary file, not committed) against `http://localhost:5173/?qa=1&ui=0&life=0`, waiting for `window.__twin.ready === true` and capturing `pageerror`/console-error events:
```
{"ready":true,"errors":[]}
PASS sanity (no studio param)
```
Confirms the world still loads and becomes ready with zero page errors when `studio=1` is absent — the QA/legacy path is unaffected. The temp script was deleted after the run and is not part of the commit.

## Files changed (committed in `cc2d649`)
- `union-square-sf/src/debug/StudioBridge.ts` (new)
- `union-square-sf/src/main.ts` (modified — loadManifests + loadOverrides call, controller-disable line, bridge install line)
- `union-square-sf/src/assets/Assets.ts` (modified — overrides map, loadOverrides(), load() path)
- `union-square-sf/tools/qa/studio_bridge_test.mjs` (new)

Not committed: `union-square-sf/package-lock.json`, which had a pre-existing modification from before this task started (unrelated to this work) and was intentionally left unstaged. No `public/data`/generated artifacts or `qa/` output were added; `public/data/asset_overrides.json` does not exist and was not created — `loadOverrides()` handles that via its try/catch around a non-ok fetch response.

## Self-review

- Diffed `main.ts` and `Assets.ts` against the brief's exact snippets before committing — byte-for-byte match on the added lines.
- Confirmed `TwinApi` (in `Qa.ts`) has no `app`/`world` members, so per ambiguity resolution #1 `app` is passed explicitly to `installStudioBridge(app, (window as any).__twin)` rather than widening the interface.
- Confirmed `public/data` is tracked in git (not gitignored) but `asset_overrides.json` itself doesn't exist yet in this checkout; `loadOverrides()`'s `fetch(...).ok` check plus try/catch means a 404 leaves `overrides = {}`, preserving current behavior exactly.
- Verified via `git diff` that only the intended 4 files are staged/committed; the pre-existing `package-lock.json` diff was excluded.
- Confirmed the controller-disable line runs before `Config.view`/`Config.pos` handling and that neither is set in the test URL, so `walk.enabled`/`orbit`'s enabled state is not flipped back on afterward for the bridge test's camera assertions to hold.

## Concerns

- None blocking. One minor note for future tasks: if a later task's studio flow also uses `Config.view=` or an orbit-default `Config.mode` alongside `?studio=1`, `setMode()`'s side effects (`applyView` calls `setMode('walk')`, and the orbit-mode branch calls `setMode('orbit')`) will re-enable the corresponding controller after our disable line runs, since the brief places the disable call only once, right after the initial `setMode(mode)`. This is consistent with the brief's literal instructions and not needed for this task's test, but is worth knowing if `studio=1` is ever combined with a `view`/`pos`/default-orbit URL in later work.
