# Final branch review — MV Studio (0f79bf1..50c677f, 24 commits, 65 files)

Reviewed in passes: schemas+render → server+finalize+export → tools → app UI → world
patches/adapter → docs/tests. Verified: `npx vitest run` **16 files / 68 tests green**
(67.9 s), `npx tsc --noEmit -p app` **clean**. Three findings below were confirmed
empirically with throwaway scripts in the scratchpad; the working tree was not modified.

## Strengths

- **Spec coverage is genuinely complete.** Every spec section has running code: three
  integration surfaces, keyframe timeline, prompt→path with anchor fallback, phone camera,
  deterministic previz, Seedance CLI + manual card, GLB/Blender export, VARCO injector.
  Deviations are all recorded in `progress.md` with a stated cost, and the cut-key
  divergence was pushed back into the spec (`b31c874`) rather than left as drift.
- **Tests test real behaviour**, not mocks: previz genuinely renders 60 frames through
  Playwright+ffmpeg, export parses a real 39.7 MB GLB, kyoto has its own headless test.
  The two integration tests the spec asked for exist and pass.
- **`/files/*` traversal is correctly closed** (`index.mjs:91`): `path.resolve` +
  `startsWith(root + path.sep)`, and `URL.pathname` leaves `%2e%2e` encoded. Read side is safe.
- **The Windows-path ruling was applied everywhere** — `fileURLToPath` throughout, no
  `.pathname` misuse survives (only `req.url` parsing, which is correct).
- **`kyoto-higashiyama/src/studio.js`** is the best file on the branch: it explains *why*
  the translation isn't a one-liner (pipeline vs renderer, shadow/sky per-frame work, parking
  the rAF loop) and keeps the whole adaptation in one file. `main.js` gains one guarded call.
- Fix rounds were real: brace-scan JSON discovery, inverse-transpose normals, shared-accessor
  visited sets, `esc()`, bridge `dispose()`, `sanitizeCam()`. Each is the right fix, not a patch.

## Issues

### Critical (Must Fix)

**1. `studio/server/finalize/seedance.mjs:10-24` — command injection via the finalize prompt.**
`winCmdQuote` applies MSVCRT backslash rules, but `shell:true` routes through cmd.exe, which
does **not** understand `\"` — it counts raw `"` to track quote state, so `\"` flips it *off*.
Verified: prompt `x" & echo INJECTED_AMP` executed `echo INJECTED_AMP` as a separate command.
Also verified: `%USERNAME%` expands inside the quoted argument, silently corrupting prompts and
leaking env values into the Higgsfield payload. With Issue 3 this is LAN-reachable RCE.
*Fix:* double embedded quotes (`s.replace(/"/g,'""')`) — verified to deliver the argument intact
with no injection — and preferably drop `shell:true`, spawning
`process.env.ComSpec /d /s /c` with `windowsVerbatimArguments`, or `node <cli entry>` directly.
`%` expansion cannot be escaped inside a `/c` line; only leaving the shell fixes it.

**2. `studio/tools/inject_asset.mjs:105-153` — mesh-less ancestor transforms are never cleared.**
The bake loop `continue`s on nodes without a mesh (`:107`), so their TRS survives while the
child's world matrix has already been baked into the vertices — the ancestor transform is
applied twice at load. Verified with a `parent(scale 10) → child(mesh)` GLB: `--height 2`
produced geometry that renders at 20 m while `manifestEntry.height` reports `2` and the bbox
is wrong. Blender/VARCO exports routinely carry an empty root, so this hits typical input,
silently, and the manifest lies about it. *Fix:* clear TRS on **every** node after the bake
(or run `flatten()` from `@gltf-transform/functions` first); add a hierarchy fixture.

### Important (Should Fix)

**3. `studio/server/index.mjs:105`, `studio/server/ws.mjs` — unauthenticated server on every
interface.** `server.listen(PORT)` binds `0.0.0.0`; there is no Host check, no Origin check on
the WS upgrade, and no token. Any LAN host can read/write projects and enqueue jobs; any
website the user visits can drive `ws://localhost:5190/ws` (WS is exempt from CORS) and, via
DNS rebinding, the HTTP API — which reaches Issue 1 and the operator's `ANTHROPIC_API_KEY`
through `/api/projects/:id/prompt`. *Fix:* bind `127.0.0.1` by default with an explicit
`STUDIO_BIND`/`--lan` opt-in for the phone, verify `Origin`/`Host` on both surfaces, add a
shared token the QR carries.

**4. `studio/server/index.mjs:54` + `store.mjs:8` — project id is a path.** PUT ignores the URL
segment and trusts `body.id`; `validateProject` only checks truthiness. Verified: PUT with
`id: "../../escaped_here"` returned 200 and created `escaped_here/project.json` outside
`PROJECTS_DIR`. Subsequent previz/export jobs write frames there too. *Fix:* reject any id not
matching `/^[A-Za-z0-9_-]{1,64}$/` in `projectDir()`, and make PUT use `seg[2]`, 409 on mismatch.

**5. `studio/app/src/phone.ts:49` — the phone QR is unusable as documented.** The URL is built
from `location.hostname` with a hardcoded `:5180`. Following the README ("Open
http://localhost:5180") the QR encodes `http://localhost:5180/phone/…`, which resolves to the
*phone*. `/api/lan-ip` exists (`index.mjs:86`) and is never called by any UI code. The port is
also wrong for the built app served from 5190. *Fix:* fetch `/api/lan-ip` and use
`location.port || 5180`; state in the README that the Director must be opened on the LAN IP.

**6. `studio/README.md:83,188` contradicts `union-square-sf/src/main.ts:133,139`.** The README
says the camera can be "flown by hand — drag in the iframe (union-square-sf only)"; the code
disables **both** `walk` and `orbit` under `?studio=1` (twice, per the Task 3 ruling). So no
world is hand-flyable, and the spec's "add keyframes at the current camera" has no way to
*produce* a new pose except prompt→path or the phone. *Fix:* correct the docs, and add an
"unlock controls" toggle that calls the bridge's `setMode` (the handler already exists).

**7. `studio/schemas/keys.mjs:21-23` — mixed air/walk segments teleport.** When `B.m === 'air'`
the eye snaps to `B.eye` for the whole segment; when A is air and B is walk, `a0 = B.pos` so
`pos` is constant. A creator mixing modes gets an unannounced jump mid-shot. Inherited from
`demo_video.mjs`, so a deliberate divergence would need a spec note. *Fix:* interpolate through
a shared eye, or document the constraint and warn in the timeline UI.

### Minor (Nice to Have)

- `inject_asset.mjs:76` — the `scale` guard's message says `--height must be > 0`.
- `seedance.mjs:110` — `refs.artist` filenames are unvalidated and `path.join`ed, so `../..`
  escapes `projects/<id>/refs/`; `job.mode` is not checked against the enum.
- `previz.mjs:39` — `.some()` then `.find()` re-scans for the same cut key; and `duration()`
  means the final key's exact time is never rendered (`total-1` is the last frame).
- `jobs.mjs` — jobs are in-memory only (empty after a restart, unbounded growth, no cancel);
  the absolute `job.log` path is returned to the client.
- `glb.mjs:19-21` — `.replace(/^([A-Za-z]):/…)` can't match after `encodeURIComponent` turned
  `C:` into `C%3A`; the fallback URL path is untested dead-ish code.
- `varco_fetch.mjs:17` — `fetch(res.result.glb_url)` has no `.ok` check, so an error page can be
  written as a `.glb`.
- `blender_import.py:4,19` — `argv[0]/[1]` and `keys[-1]` raise on missing args / empty keys.
- `index.mjs:92` — no `.md`/`.py` MIME types, so job cards download instead of rendering;
  `previz`'s `softwareRender` flag reaches `artifacts` but is never shown in the UI.
- `kyoto/src/studio.js:67` — `?qa=1` alone parks the world loop, which changes behaviour for
  kyoto's own `tools/capture.mjs` path; gating the pause on `studio=1` would be safer.

## Recommendations

1. Fix 1 and 2 before merge — both are small, both are verified, both silently corrupt output.
2. Treat 3 + 4 as one hardening commit: bind localhost, id regex, Origin/Host checks. That
   converts "local tool with an HTTP server" from an assumption into an enforced property.
3. 5 and 6 are the difference between "the feature exists" and "a creator can use it" — the
   phone path and hand-blocking are both headline spec features.
4. Add a hierarchy fixture to `inject.test.mjs` and a cmd-quoting round-trip test that actually
   spawns through the shell; both bugs would have been caught by one test each.

## Assessment

**Ready to merge?** With fixes

**Reasoning:** The architecture is sound, spec coverage is complete, deviations are documented,
and all 68 tests plus the type check pass — but two verified correctness/security defects (cmd
injection through the prompt, silently wrong asset scale on hierarchical GLBs) and an
unauthenticated LAN-bound server with a path-traversable project id must be fixed first.
