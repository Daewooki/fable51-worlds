# Final review — Task 6 + whole plan (fbac37b..cc9aa8e)

Reviewer: senior code reviewer. Verified at HEAD `cc9aa8e`. Working tree clean apart from two
test-regenerated PNGs (`docs/boot.png`, `docs/stage2-nc.png` — expected, noted in the report).

Re-run here: `studio` `tsc -p app` clean, `project/prompt/inject/api` **32/32**;
`pangyo` `tsc` clean, `geo/footprint` **30/30**. e2e/renders/qa not re-run (per instruction).

## Task 6

| # | Item | Verdict |
| --- | --- | --- |
| A1 | viewpoints lat/lon recomputed; `place()` prefers x/z | addressed — `Viewpoints.ts:12` `viewpointLocal()`, `load()`+`place()` both use it; `geo.test.mjs:200` round-trips all 4 within 0.5 m and asserts `public/data` sync. **Side effect below.** |
| A2 | qa_report try/finally, exitCode, leftovers, honest "before" | addressed — `qa_report.mjs:76` try/finally, `:137` exitCode on unknown viewpoint, `dead`/`${m.constants?'':''}` gone, `atBoot` captured pre-screenshots with `wallMsBetween` (3.3 s) printed |
| A3 | fill to full bbox, CELL=8, blockCells from/to, holes, translucent water + cut under | addressed — `BlockFill.ts:44,58,121-155,178-196,286-292,357`; `Library.ts:185`. **Untested (below).** |
| A4 | `pois` excludes ground-cover areas | addressed — `build_gis.mjs:472-500` landuse binned first, `:527` skips those ids; 460→378, everything else byte-identical |
| A5 | Nintendo `char_*` GLBs removed | addressed — `retail/` holds only `gen_*`; `grep -oiE nintendo` over `src` + `public` empty |
| A6 | canopy geometry test, `originNote`, `npm run assets --python-exit-code 1` | addressed — `hero.test.mjs:36` (manifest) + `:116` (real vertex data through world matrices); `run_blender.mjs` resolves Blender via `fileURLToPath`, exits 1 with instructions |
| A7 | defects updated, screenshots regenerated | **partially** — 5 new entries (9, 13–16) are accurate and specific; the 판교역 move is documented. But the new `pangyoro-hsquare` frame is not (below). |
| B8 | per-shot `life` end to end | addressed — `project.mjs:19,39` (default false + boolean validation + back-compat), `main.ts:86,122,411`, `browser.mjs:8-27` (`worldUrl` single composer, default `life=0`), `previz.mjs:32`, `glb.mjs:80`, README, `project.test.mjs`+`browser.test.mjs` |
| B9 | `tourStops` WORLDS guard | addressed — `prompt.mjs:98` |
| B10 | `inject_asset --as <category>/<name>` | addressed — anchored `AS_RE` `^[a-z0-9_]+\/[a-z0-9_]+$` (no traversal), `manifest_<category>.json`, `source:'varco'` kept; accept + 5 reject cases |
| C11 | README tables, timings | addressed — root 3-world table, `studio/README.md` re-measured + "Pangyo's target cuts", pangyo "How this world was made" |
| C12 | 63/63 · 115/115 · e2e 3/3 | addressed as reported; the two suites re-runnable here pass |

**Important**
1. `pangyo-technovalley/docs/qa/pangyoro-hsquare.png` — A1 moved this camera ~11 m (lat/lon→x/z) and it
   now stands **inside a street tree**: ~60 % of the frame is leaf canopy. `git show 72b483b:` of the same
   file is a clean 판교역로 perspective. `FINAL_QA_REPORT.md:66` still lists the probe as `clear` (trees do
   not collide) and no DEFECT records it, while `task-6-report.md` says "4/4 shots ok". The A1 fix is right;
   the regenerated evidence regressed and the report does not say so.
2. `pangyo-technovalley/src/world/BlockFill.ts:121` — `blockCells` is documented "Exported for the tests"
   and there is no BlockFill test file. The span-aware insets (`:143-150`), the `veilsOver` under-cut
   (`:186-196`, `:289`) and `Coverage.covers` hole handling (`:357`) are all new non-trivial geometry with
   only rendered counts as evidence.

**Minor**
- `studio/server/prompt.mjs:118` — `anchorsFor` still projects viewpoints from `cam.lat/lon` with its own
  `GEO` table, not the authored `x/z`; harmless today (round-trip ≤ 0.07 m) but a second projection to drift.
- `pangyo-technovalley/src/materials/Library.ts:186` — the comment credits `depthWrite:false` with stopping
  the double-blend; `TRANSLUCENT_SURFACES` is what does that. `depthWrite:false` also means water writes no
  depth for later transparent draws.
- `pangyo-technovalley/tools/geo/build_gis.mjs:503` — `const POI_KEYS =[` lost a space.
- `pangyo-technovalley/tools/qa/qa_report.mjs:76` — `try { await body() } finally` precedes the hoisted
  `async function body()`; correct, but reads as a forward reference.
- `docs/qa/pangyoyeok-plaza.png` — an untextured black plane hangs under the canopy; not called out.

Spec compliance: PASS
Task quality: Approved

## Whole plan

**Strengths.** Every spec section is met: target cut delivered three times (with the ledger's ruling that
"west along 판교역로" becomes "south"), origin/bbox/port exactly as specified, data flow implemented end to
end from cached OSM/SRTM, error handling present (retry/backoff, Terrarium fallback, `meta.skipped`,
`streets_spec.meta.dropped`). Generalization holds: `grep -niE "powell|geary|…|nintendo"` over
`pangyo-technovalley/src/**/*.ts` yields one false positive ("pharmacy"); every place-specific input is an
optional JSON with a documented "missing ⇒ feature off" path (`optionalData` in `World.ts:85-86,145`,
`Traffic.ts:136`, `main.ts:87`). `git diff --stat fbac37b..cc9aa8e -- union-square-sf kyoto-higashiyama` is
**empty**. Studio changes are additive with defaults preserved: `worldUrl` still emits `life=0`,
`launchWorld`'s signature is back-compatible, `anchorsFor` prefers `tour.json` but neither union nor kyoto
ships one so both keep the `TOURS` fallback (tested). Attribution is in `gis.json.meta`, both READMEs and the
QA report. `FINAL_QA_REPORT.md`'s 17 defects match the frames I viewed — the straight-fit grid, the bare east
flank, black daylight glass, seams and the weak 판교역 forecourt are all visibly true and plainly stated.

**Issues.** Critical: none. Important: the two above (regressed QA frame not disclosed; BlockFill logic
untested). Minor: as listed, plus `docs/boot.png`/`stage2-nc.png` churn on every test run, and the studio's
measured tables cannot be reproduced without all five dev servers up (documented).

**Recommendations.** (1) Nudge `pangyoro-hsquare` off the tree trunk (or veto viewpoints inside a tree
footprint the way props are vetoed) and re-run `qa_report`; if kept, add it as a defect. (2) Add
`test/blockfill.test.mjs` for `blockCells` span insets, `Coverage.covers` holes and the veil cut. (3) Point
`anchorsFor` at `camera.x/z` when present.

Ready to merge? **With fixes** — the code is sound, cross-world safe and honestly documented, but one of the
four QA screenshots regressed into a tree and the report claims it is fine, which is the one thing this
plan's own honesty standard does not allow to ship unstated.
