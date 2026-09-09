# Task 5 report: previz renderer (shot → frames → MP4)

## What was built

- `studio/server/render/previz.mjs` — `renderPreviz({ world, shot, outDir, onProgress? })` implemented verbatim per the brief (Step 3 code), plus the CLI entrypoint (`--project=`/`--shot=`/`--out=` argv form) at the bottom of the same file. No deviations from the brief's code.
- `studio/test/previz.test.mjs` — the integration test verbatim from the brief's Step 1 (400000 ms timeout), renders a 2 s / 30 fps / 640x360 aerial shot on `union-square-sf` and asserts `r.frames === 60` and an ffprobe-counted frame count of 60 on the resulting MP4.

Process followed TDD exactly as prescribed:
1. Wrote the test first; ran it — failed with `Cannot find module '../server/render/previz.mjs'` (module missing), confirming the test exercises the right import before any implementation existed.
2. Implemented `previz.mjs` per the brief.
3. Re-ran the test — passed.
4. Ran the full `studio` suite — all green.
5. Manually ran `renderPreviz` a second time outside vitest (temp script, deleted after) to inspect `softwareRender` and eyeball a mid-shot frame image before committing; temp script and its output directory were removed prior to commit.
6. Committed with `git add studio` only.

## Test output tail (new test alone)

```
✓ test/previz.test.mjs (1 test) 30659ms
  ✓ renders a 2s shot to an mp4 with 60 frames 30658ms

Test Files  1 passed (1)
     Tests  1 passed (1)
```

ffprobe on the produced MP4 (manual verification run, separate from vitest's own temp dir):
```
width=640
height=360
duration=2.000000
nb_read_frames=60
```

## Full studio suite (after adding previz.test.mjs)

```
✓ test/keys.test.mjs (9 tests) 9ms
✓ test/project.test.mjs (6 tests) 11ms
✓ test/browser.test.mjs (3 tests) 37610ms
  ✓ loads union-square-sf headless and exposes __twin 25117ms
  ✓ rejects promptly with a world-load error when nothing listens on the given port 12489ms
✓ test/previz.test.mjs (1 test) 42734ms
  ✓ renders a 2s shot to an mp4 with 60 frames 42732ms

Test Files  4 passed (4)
     Tests  19 passed (19)
Duration  49.35s
```

18/18 pre-existing tests remain green; the suite is now 19/19.

## softwareRender observed

`false` — the manual standalone run returned `{"frames":60,"softwareRender":false}`, i.e. the GPU path (`--use-angle=d3d11`, real ANGLE/D3D11) succeeded on this machine; software/SwiftShader fallback was not exercised by this task's render.

## Wall time

- Vitest run of `previz.test.mjs` alone: ~30.7 s (world load + 60 frames + ffmpeg encode).
- Full suite (`browser.test.mjs` + `previz.test.mjs` launch their own headless browsers): ~49.4 s total wall time, well under the 400000 ms per-test timeout.
- Manual standalone `renderPreviz` run (for the softwareRender/eyeball check): comparable, well under a minute.

## Eyeball check

Rendered frame 30/60 of the 2 s aerial shot (`union-square-sf`, sunset) shows a correct oblique aerial view of the downtown block — buildings, streets, sunset sky gradient, no black frame / no missing textures. The `previz.mp4` produced by this manual run was at:
`C:\Users\daewook\Desktop\Personal Project\nc_work_automation\fable51-worlds\studio\_tmp_previz_out\previz.mp4`
(1,252,608 bytes, 640x360, 2.000000 s duration, 60 frames per ffprobe) — this scratch directory was deleted after inspection since it was only a manual sanity check, not a committed artifact. The vitest test's own MP4 lives in an `os.tmpdir()`-based `previz-XXXXXX/previz.mp4` directory created and left behind by the test run (not cleaned up by the test, matching the brief's test code as given — vitest does not delete it).

## Self-review

- **Frame count == round(duration × fps)?** Yes. `duration(shot.keys)` = last key's `t` = 2; `FPS` = 30; `total = Math.round(2 * 30) = 60`, used both as the loop bound and the returned `frames` value. Test asserts `r.frames === 60` and ffprobe independently confirms 60 encoded frames — matches.
- **Does render close the browser on failure?** Yes. `{ browser, page, softwareRender } = await launchWorld(...)` happens once; the entire per-frame loop is wrapped in `try { ... } finally { await browser.close(); }`, so any screenshot/evaluate throw during the loop still closes the browser before propagating. If `launchWorld` itself throws (e.g., world-load timeout), it already closes its own browser internally (per Task 4's `browser.mjs`, unmodified) before rethrowing, so no browser handle leaks either way.
- **Lint-level issues?** None found — every import (`fs`, `path`, `spawnSync`, `sample`, `duration`, `launchWorld`) is used; no unused variables introduced. Code matches the brief's Step 3 verbatim, including the CLI block.

## Deviations from the brief

None. Both the test and the implementation are copied verbatim from the brief's Step 1 / Step 3 code blocks, including the exact INSTALL script, the ±0.3 s symmetric cut-fade computation, the `frames/` subdirectory convention (kept after encoding, not deleted), and the `--key=value` CLI arg parsing.

## Concerns

- The 400000 ms test timeout is far larger than the observed ~31–43 s actual run time on this machine; this is expected headroom per the brief and not a problem, just noting the large margin in case CI machines are much slower.
- `softwareRender` was `false` in this run (GPU/ANGLE path used) — the software-render fallback path itself was not exercised by this task's own test (that's `browser.test.mjs`'s concern from Task 4, already covered there), so no new coverage gap introduced, just noting it wasn't independently re-verified here.
- The vitest test leaves its `previz-XXXXXX` temp directory (frames + previz.mp4) under `os.tmpdir()` after the run, per the brief's test code as given — this is host OS temp, not the repo, so it doesn't pollute git status, but repeated CI runs will accumulate temp dirs there over time (pre-existing test design, not something introduced by the implementation).

## Files touched

- `C:\Users\daewook\Desktop\Personal Project\nc_work_automation\fable51-worlds\studio\server\render\previz.mjs` (new)
- `C:\Users\daewook\Desktop\Personal Project\nc_work_automation\fable51-worlds\studio\test\previz.test.mjs` (new)

## Commit

`1a766e4` — `feat(studio): deterministic previz renderer (shot -> mp4)` (staged via `git add studio` only; `union-square-sf/package-lock.json`'s unrelated unstaged change was left untouched).
