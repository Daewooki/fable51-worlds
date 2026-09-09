# Task 6 report — docs, deferred fixes, per-shot life, three-world e2e

Base `72b483b` → head `cc9aa8e`. Five commits, all trailers present.

| commit | subject |
| --- | --- |
| `be21353` | fix(pangyo): viewpoints, qa script, ground cover, water, pois |
| `4a541dd` | chore(pangyo): drop Nintendo kit leftovers, assets script |
| `3e68cdf` | feat(studio): per-shot life flag, inject_asset categories, tourStops guard |
| `7a5d546` | docs: three worlds |
| `cc9aa8e` | fix(pangyo): drop the dead loop in Traffic.placeRoute |

Status: **DONE_WITH_CONCERNS** (concerns are documented defects, not broken work — see §Concerns).

---

## A. Pangyo world fixes

### A1 — viewpoints lat/lon, `place()` prefers x/z, round-trip test

`src/data/recon/viewpoints.json` (+ `public/data`): every `lat`/`lon` recomputed from the authored
`camera.x/z` with `localToGeo`. Recomputed independently before editing; the values match the
reviewer's exactly:

```
nc-entrance      37.398340 127.108846
nc-aerial        37.397432 127.109408
pangyoro-hsquare 37.401952 127.109569
pangyoyeok-plaza (re-sited, see A7)
```

`src/debug/Viewpoints.ts` gains an exported `viewpointLocal(v)` that returns `camera.x/z` when both
are finite and falls back to `geoToLocal(lat, lon)`; `load()` and `place()` both go through it, and
`Viewpoint.camera` now declares optional `x`/`z`.

Test added in `test/geo.test.mjs` (`viewpoints.json local ↔ WGS84 round-trip`): every camera's
`lat/lon` round-trips to its `x/z` within 0.5 m (measured max **0.066 m**, at nc-entrance), `localToGeo`
matches to 5 decimals, and `public/data/viewpoints.json` is asserted equal to the source.

### A2 — `tools/qa/qa_report.mjs`

- The whole run is inside `try { await body() } finally { await browser.close().catch(() => {}) }` —
  the mid-run `await browser.close()` is gone, so a throw can no longer leak a headless Chromium.
- `setView(id) === false` (an id the runtime does not know) logs and sets `process.exitCode = 1`.
- Removed: `const dead = life.after.navNodes ? null : null` / `void dead`, and `${m.constants ? '' : ''}`.
- The hardcoded `'60'` is now `TrafficLights.stats()`, which was extended to report
  `cycle/green/amber/allRed`; the phase text and the "synthetic 60 s cycle" prose read from it too.
- The life table is honest: `lifeStats()` is captured immediately after `__twin.ready`, **before** the
  screenshot loop, the columns are `at boot` / `+ 30 s simulated`, and the report states the wall time
  that passed between them (measured **3.3 s**, which is what the old "at 0 s" column really was).

### A3 — ground cover and water

`src/world/BlockFill.ts`:

- `EXTENT = 620` → `FILL_BBOX = localBbox()` (x −903…805, z −870…553), used for the landuse extent
  test, the triangle clip and `blockCells`.
- `CELL` 10 → **8 m**, the terrain's own `res`.
- `blockCells(streets, bbox)` keeps each boundary line's `from`/`to` span and applies its sidewalk
  inset only to the cells that span reaches — a short side street no longer cuts a 15 m strip of
  missing ground across the whole box.
- `Coverage.covers` treats a point inside a hole as **not** covered.
- Water: `Materials.get('water')` is `0x16303d`, `transparent`, `opacity 0.75`, `depthWrite false`.

Extra fix found while verifying the water (evidence below): with a translucent class, everything
painted **under** it shows through. The 봇들 park's grass and its three rectangular `soil` pitches
were plainly visible on the river bed as dark parallelograms. `TRANSLUCENT_SURFACES` now cuts the
ground cover away under any translucent patch (and stops two overlapping water polygons blending
twice). Verified by rendering four variants of the same aerial frame: as-shipped translucent
(artefact), forced opaque (no artefact), translucent + `depthWrite: true` (artefact — so it was not
a depth problem), and water hidden (revealing the grass + three pitches underneath).

Result (`docs/qa/qa.json`): 232 landuse areas (was 189 inside the old box) + 1,607 fallback patches,
5 draw calls, 188,946 triangles (was 82,851); in-page load 4,586 ms (was 4,523 ms).

### A4 — `pois` excludes ground-cover ways

`tools/geo/build_gis.mjs`: the `landuse` bin is computed **first** (§7) and records its osmIds; the POI
loop (§7b) skips `way`/`relation` elements already in that set. Re-ran `npm run geo` from cache (no
`--refresh`).

```
buildings   564 -> 564   (JSON byte-identical)
buildingParts 118 -> 118
streets     794 -> 794   (byte-identical); fitted streets 23 (8 ns / 15 ew, 2 dropped)
signals      58 ->  58   crossings 65 -> 65   benches 3 -> 3
landuse     232 -> 232   (byte-identical)
pois        460 -> 378   (82 removed, 0 added; all leisure=pitch / leisure=park / … areas)
NC way/694434545 height 58 m, source osm:height, local centroid (-0.04, -0.04)
```

Documented in the pangyo README data section.

### A5 — Nintendo IP leftovers

`git rm` of the 9 `public/assets/models/retail/char_*.glb` and their `manifest_retail.json` entries
(23 → 14). `grep -rn "char_" src test tools/{geo,qa,bpl} public/data` → no hits. Boot test still
clean (11/11, no page errors).

### A6 — canopy geometry, `originNote`, `npm run assets`

- `tools/bpl/gen_pangyo.py` gives the canopy spec an `originNote` explaining that `bottom_center` is
  the plaza slab and the stair well hangs 1.02 m below it. Regenerated with the new script: the three
  GLBs came back **byte-identical** (git shows only `manifest_pangyo.json` modified).
- `test/hero.test.mjs` gains two cases: the manifest (`bbox.min.y ≈ −1.02`, `originNote` mentions it,
  bbox height > fit height, and the other two modules really are at `min.y == 0` with no note), and
  the scene (each placed canopy's lowest vertex is 1.02 ± 0.1 m below its object origin and its top
  6.42 m above, measured from the real vertex data through each mesh's world matrix).
- `npm run assets` → `tools/bpl/run_blender.mjs`: finds `tools/blender/**/blender.exe` (path resolved
  from `import.meta.url` via `fileURLToPath`), runs
  `--background --python-exit-code 1 --python tools/bpl/gen_pangyo.py`, and prints download/unpack
  instructions plus exit 1 when no Blender is present. Exercised for real (see the regeneration above).
  README command updated.

### A7 — FINAL_QA_REPORT defects, screenshots regenerated

Four new DEFECTS entries plus one "fixed" entry, all in the generated report:

| # | entry |
| --- | --- |
| 9 | **Ground cover now spans the whole extract (fixed)** — says what it was (±620 m) and what it is |
| 13 | **Water is a coloured surface, not a modelled channel** — the new material, the cut-out under it, and what is still missing (no bed, no flow, no banks) |
| 14 | **Block-fill patch seams and mottling** — 8 m raster, planar uv, per-class offsets |
| 15 | **판교역 forecourt is generic block fill** — records the viewpoint move and why the frame is still weak |
| 16 | **`pois` excludes ground-cover areas** — 460 → 378 and what still reads them |

The 판교역 viewpoint **was** moved. Probed 14 candidate stands with `probePath` (clearance 0.9 m);
most are inside the surrounding massing. The chosen one is `x 152, z 549, heading 39°, pitch 6°`
(lat 37.394577 / lon 127.111021, ground 11.33 m) — 23 m south-west of the canopy, framing it centred
with the 알파돔 tower behind, instead of the old stand's small off-centre canopy against a blank
curtain wall.

`node tools/qa/qa_report.mjs` re-run after every fix: 4/4 shots ok, all cameras probe-clear, 0 page
errors, exit 0. `FINAL_QA_REPORT.md`, `docs/qa/*.png` and `docs/qa/qa.json` regenerated.

## B. Studio

### B8 — per-shot `life`

- `schemas/project.mjs`: `createShot({ …, life = false })` stores `life: !!life`; `validateShot`
  rejects a non-boolean `life` and still accepts a shot saved before the field existed.
- `app/src/main.ts`: a `life (pedestrians & traffic)` checkbox on the **New shot** form (with a tooltip
  about non-determinism), read into `createShot`, and the preview iframe URL is
  `…&life=${shot.life ? 1 : 0}&…`.
- `server/render/browser.mjs`: new exported `worldUrl({ world, port, time, quality, life, extraQuery })`
  is the single place the query is composed; `launchWorld` gains `life = false` and delegates to it.
  Default behaviour unchanged (`life=0`).
- `server/render/previz.mjs` and `server/export/glb.mjs` pass `life: !!shot.life`.
- `pangyo/tools/qa/qa_report.mjs` now passes `life: true` instead of appending a second `life=1`.
- `studio/README.md` world contract documents `life=<0|1>`, the checkbox, and that **two renders of the
  same shot with life on are not frame-for-frame identical**.
- Tests: `project.test.mjs` (default false, `life: true` honoured, boolean validation, absent field
  still valid) and `browser.test.mjs` (`worldUrl` composes `life=0` by default, `life=1` when asked,
  never both, and still throws on an unknown world) — mock-free, no browser needed.

### B9 — `tourStops` guard

`server/prompt.mjs` imports `WORLDS` and returns `null` for a world not in it, before the path is
built. Smoke-checked: `anchorsFor('../../etc')` → `[]`, `anchorsFor('pangyo-technovalley')` → 6 anchors.

### B10 — `inject_asset --as <category>/<name>`

Exported `AS_RE = /^([a-z0-9_]+)\/([a-z0-9_]+)$/`; the manifest written is `manifest_<category>.json`.
`varco/` stays the default and the entry still records `source: "varco"` (the tool, not the category).
`studio/README.md` VARCO section updated. `inject.test.mjs` gains a `pangyo/x` case (file lands in
`models/pangyo/x.glb`, joins `manifest_pangyo.json`, does **not** appear in `manifest_varco.json`) and
a rejection case for `torii`, `Varco/Torii`, `varco/a/b`, `varco/`, `''`.

## C. Docs + verification

### C11 — READMEs

- Root: world table now has source data / port / status for all three, with the pangyo row promoted
  from "in progress" to "complete (stages 1–3)" and the caveat named; the three e2e totals are quoted
  under it; the pangyo card links all three cuts and the QA report.
- `studio/README.md`: measured-on table re-measured (below); a new **Pangyo's target cuts** table with
  the stage-1/2/3 previz render times (124.2 / 118.1 / 114.6 s for 240 frames at 1080p) and iframe load
  times from the task reports; e2e example ports aligned to the ones actually run.
- `pangyo-technovalley/README.md`: header table linking the three cuts and the QA report; a **How this
  world was made** section (data → runtime → hero → life, with the command for each and what it
  produces); the `pois` change; the rewritten ground-fill section; `npm run assets`; the canopy origin
  note; the viewpoint x/z ↔ lat/lon rule.

### C12 — verification

| check | result |
| --- | --- |
| `pangyo-technovalley` `npx tsc --noEmit` | clean |
| `pangyo-technovalley` `npx vitest run` | **63/63** (5 files) in 16.4 s |
| `studio` `npx tsc --noEmit -p app` | clean |
| `studio` `npx vitest run` (all worlds up) | **115/115** (20 files) in 73.0 s |
| `node tools/e2e.mjs --world union-square-sf --port 5197` | **PASS**, 196.4 s |
| `node tools/e2e.mjs --world kyoto-higashiyama --port 5198` | **PASS**, 159.3 s |
| `node tools/e2e.mjs --world pangyo-technovalley --port 5199` | **PASS**, 149.2 s |

e2e detail (all `softwareRender: false`):

```
union-square-sf     previz 60f@640x360 25.7s | 300f@1080p 147.9s (0.49 s/f) | GLB 20.3s 39.7 MB 1229 meshes | 196.4s
kyoto-higashiyama   previz 60f@640x360 31.2s | 300f@1080p  85.8s (0.29 s/f) | GLB 40.1s 397.1 MB 1052 meshes | 159.3s
pangyo-technovalley previz 60f@640x360 14.7s | 300f@1080p 121.2s (0.40 s/f) | GLB 10.2s 30.8 MB 585 meshes | 149.2s
```

The studio launcher was restarted once (`node tools/up.mjs --stop && node tools/up.mjs`) after the
server-side changes; all five ports (5173/5174/5175/5180/5190) came back up and the e2e runs and the
full studio suite ran against them.

## Deviations

1. **The water fix grew.** The brief asked for a darker, translucent material. Making it translucent
   revealed that the ground cover painted under the water shows through (park grass + three pitches on
   the river bed). Rather than ship that, `BlockFill` now cuts the ground cover away under a
   translucent class. Verified against four rendered variants before and after; +1 small code path.
2. **Kyoto/pangyo e2e were run twice.** The first pass PASSed but its GLB size lines had scrolled off;
   both were re-run with the output captured so the README table is measured, not remembered. The
   README quotes the second run (union 196.4 s is from its single run).
3. `blockCells`'s second parameter changed from `extent: number` to `bbox` — it is exported "for the
   tests" but had no callers outside `BlockFill`, so nothing else moved.
4. The e2e port hints in `studio/README.md`'s Tests section were changed from 5192/5194 to the
   5197/5198/5199 actually used, so the documented command is the one with evidence behind it.

## Concerns

- **The 판교역 frame is still weak**, and no camera fixes it: there is no station box, no plaza module,
  no furniture and no signage there. The move helps (canopy centred, tower behind) and defect 15 says
  the rest plainly.
- **Block-fill seams/mottling** (defect 14) are unfixed — one flat material per class over a whole
  block, planar uv, 8 m raster. That is a look problem, not a correctness one, and extending the fill
  to the full bbox made more of it visible.
- **Ground fill cost rose** 82.9 k → 188.9 k triangles (still 5 draw calls; total scene 4.28 M tris,
  782 draw calls at the aerial viewpoint). In-page load moved 4,523 → 4,586 ms. Not a regression worth
  acting on, but it is the price of the larger box.
- `docs/boot.png` and `docs/stage2-nc.png` are regenerated by the test suite on every run and differ by
  a few bytes each time; the copy in `4a541dd`/`be21353` is the one from the run that was reviewed.
- `manifest_pangyo.json`'s `originNote` is authored in `gen_pangyo.py`, so it survives regeneration —
  confirmed by regenerating and diffing (only that file changed; the GLBs were byte-identical).

## Left undone

Nothing from the work items. Everything in the Task 6 pre-dispatch checklist and the Task 5 review
Importants/Minors is addressed. The `Traffic.ts` no-op (`for (let i = 0; i < v.stopIdx; i++) void 0;`)
was outside this task's item list but is a one-line dead loop, so it went too (`cc9aa8e`; tsc clean,
life tests 10/10). The one Task 5 minor deliberately left alone is the `curb` lane picker's
`kind === 'car'` limitation, which was not in this task's scope and is a behaviour change, not a
cleanup.

After that commit the pangyo suite was **not** re-run in full — only `test/life.test.mjs` (10/10) and
`tsc`, which are the checks that cover `Traffic.ts`. The 63/63 and 115/115 figures above are from the
verification pass immediately before it.

---

# Fix round — final whole-plan review (commit `b123eef`)

`fix(pangyo): tree-aware viewpoint check, blockfill unit tests, canopy sign`. Head is now `b123eef`.

## F1 — `pangyoro-hsquare` was standing in a street tree

**Diagnosis.** The A1 fix made `place()` honour the authored `camera.x/z`, and the *authored* stand was
the bad one: `(101.9, −278)` sits **0.6 m** off the procedural street-tree row (`x = 101.31`, trees every
12 m), with the next trunk **8.8 m dead ahead** on the sight line. The old, wrong `lat/lon`
(37.401941 / 127.109697) projects to `(113.07, −275.73)` — 11.2 m east of the tree line — which is why
the pre-fix frame looked right. So A1 did not break the camera; it exposed an authoring error.

**The veto.** `tools/qa/qa_report.mjs` and `test/life.test.mjs` now check every camera against
`world.treeSpots` (441 placed trees), which `probePath` cannot see at all — vegetation is instanced and
has no collider:

- **plan clearance** — the camera must be ≥ `TREE_CLEAR_M` (2.0 m) from every tree, and
- **sight corridor** — no tree within 2.5 m of the camera's forward axis for the first 18 m.

A failing camera reads **`BLOCKED-BY-TREE`** in the report table (column renamed *Probe + trees*), is
listed as a measured high-severity defect, and sets `process.exitCode = 1`.

Worth stating plainly: the 2.0 m proximity rule alone would **not** have caught this frame — the offending
trunk was 8.8 m away. The sight corridor is what catches it. Both are kept: proximity catches a camera
inside a crown, the corridor catches one looking down a row. Verified against the old stand's geometry
(`along 8.8 m, lat 0.15 m` → corridor hit) and against the candidate search, where `h3`/`h4` reported
corridor hits and the chosen stand reports none.

**The move.** 14 candidate stands probed (`probePath`, 0.9 m) plus tree metrics. New stand:

```
x 113, z -276, y 21.15   heading 177.4°  pitch -0.15°  fov 60
lat 37.401943  lon 127.109696   (round-trips to x/z within 0.046 m)
probe clear · nearest tree 13.51 m · no tree in the sight corridor
```

It is the H스퀘어 **forecourt** rather than the kerb — the note in `viewpoints.json` says so, and says why.
The frame is the corridor down 판교역로 with the tree row on the right, i.e. the framing the reviewer
approved before A1.

New `qa.json` verdicts: `treeDist [69.87, 29, 13.51, 63.48]`, `treeInView [null × 4]`, `inTree [false × 4]`.

**The black plane under the canopy.** Cause found: it is `can_signband` (`metal_black`, 0x141416,
metalness 0.8) — the station sign band — seen **from behind**. The band carried an `emissive_white` face
on one side only, so whichever approach a canopy faces away from saw an unlit black slab; the canopy
yaws are `0` and unsurveyed, so that is a coin flip. Fixed in the module rather than by turning the
camera or the canopy: `gen_pangyo.py` now faces the band on both sides (`can_signface_b`), 536 → 548
tris, still far inside the 20 k budget. Regenerated with `npm run assets`; the other two GLBs came back
byte-identical. The QA frame now shows a legible white sign panel in a black frame.

## F2 — `test/blockfill.test.mjs` (new, 11 cases, no browser)

To make the ground-cover maths testable, four closures became module-level exports with **no behaviour
change**: `areaCovers`, `veilsOver`, `underVeil`, `bboxOf`, plus `class Coverage`. `BlockFill`'s
constructor and `rasterise` now call them.

| group | what it pins |
| --- | --- |
| `blockCells` | a street whose `from`/`to` does not reach a band is **not** a boundary there (`x1 = 0`), while the band it does reach is inset by half width + sidewalk (`x1 = −13`); the same street run to the world edge insets all three bands; no cell leaves the bbox; the default bbox is the whole extract and is **not** symmetric |
| `Coverage` / `areaCovers` | inside the ring → covered; inside the hole → **not** covered, so the fallback cell is still emitted in the courtyard; far outside → not covered |
| the veil cut | selection by bounds; a veil never veils itself or any later veil (the double-blend guard); a fragment under the water is dropped and one beside it is kept; a hole in the veil is not a veil |
| primitives | `clipToRect` keeps only the cell and returns `[]` for a polygon fully outside; `triangulate` earcuts a holed ring to exactly `100² − 20²` m² and returns `[]` for a degenerate ring |

Writing the first case exposed the real granularity of the span-aware inset, which is now documented in
`blockCells`'s docstring: the decision is **per cell**, not per metre, so a street that stops half way
along a cell still insets that whole cell. Cells are bounded by the cross-axis streets, so the worst case
is one block of over-inset — never a strip across the world, which was the bug.

## Minors

- `studio/server/prompt.mjs` `anchorsFor()` prefers a viewpoint's `camera.x/z` when both are finite and
  falls back to `lat/lon`. **No world in its `GEO` table ships `x/z` today** (union's 34 viewpoints are
  lat/lon only, and pangyo has no `GEO` entry, so its viewpoints are not anchors at all) — the change is
  correct and forward-looking but moves nothing right now. I did not add pangyo to `GEO`: that would add
  four anchors and change what the planner aims at, which is a behaviour change outside this round.
- `src/materials/Library.ts` water comment rewritten: `TRANSLUCENT_SURFACES` gets the credit for both the
  show-through and the double-blend fixes, and `depthWrite: false` is described for what it is (the
  ordinary transparent-material setting) rather than as the fix.
- `tools/geo/build_gis.mjs` `POI_KEYS =[` → `POI_KEYS = [`.
- `qa_report.mjs` `body()` is declared above the `try/finally` that calls it.

## Verification (this round)

| check | result |
| --- | --- |
| `pangyo` `npx tsc --noEmit` | clean |
| `pangyo` `npx vitest run` | **74/74** (6 files, was 63/74 across 5) in 16.6 s |
| `pangyo` `node tools/qa/qa_report.mjs` | exit 0, 4/4 shots, all cameras clear of walls **and** trees, 0 page errors |
| `studio` `npx vitest run test/prompt.test.mjs` | **6/6** |
| `studio` `npx tsc --noEmit -p app` | clean |

Not re-run this round: the full studio suite and the three e2e runs (nothing in this round touches the
render path, the world contract or the studio server beyond `anchorsFor`, which its own test covers).
`docs/boot.png` and `docs/stage2-nc.png` are regenerated by the suite each run; the committed copies are
from the run above.

## Left undone

Nothing from F1, F2 or the minors. The one judgement call recorded above: pangyo is still absent from
`prompt.mjs`'s `GEO` table, so its four viewpoints are not offered to the prompt planner as anchors.
