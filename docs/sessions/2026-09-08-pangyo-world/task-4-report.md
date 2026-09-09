# Task 4 report — Stage 2: hero modules (NC R&D Center, 판교역 canopy, 알파돔 towers)

Status: **DONE_WITH_CONCERNS** — every acceptance check in the brief passes; the concerns in §9
are quality/fidelity notes, none of them blocking.

Commit: `cc1253e` — `feat(pangyo): hero modules (stage 2)` (26 files, +1534/−8).

---

## 1. Tooling: Blender, not a bpy wheel

The portable **Blender 4.2.9 LTS** at `pangyo-technovalley/tools/blender/blender-4.2.9-windows-x64/`
runs the generator headless:

```
tools/blender/blender-4.2.9-windows-x64/blender.exe --background --python tools/bpl/gen_pangyo.py
```

`union-square-sf/tools/bpl/bpl_lib.py` was copied to `pangyo-technovalley/tools/bpl/bpl_lib.py`
**verbatim except**: the header (it documents the portable-Blender invocation instead of the
`.venv` one), two extra `MATERIAL_LIBRARY` names (`window_lit`, `roof` — both already registered in
`src/materials/Library.ts`, which is what `Materials.remap()` keys on), and a `text_mesh` /
`text_width` helper pair for the rooftop sign. Nothing in the 4.2 API needed adapting: the whole
library (`bmesh.ops.create_cube`, `Principled BSDF` → `Emission Color`, `blend_method`,
`export_scene.gltf(export_format='GLB', export_apply=True, export_yup=True, export_image_format='NONE')`)
worked unchanged. `union-square-sf/` was not touched.

`tools/blender/` is git-ignored; the root `.gitignore` line the controller added is in this commit.

## 2. Generator design (`tools/bpl/gen_pangyo.py`, 3 GLBs, 1 manifest)

Nominal plan sizes are the **minimum-area oriented bounding boxes of the real OSM footprints**, so
the runtime fit stays near scale 1 and the metre-spaced mullion grid survives it.

### `pangyo/nc_rnd_center` — 6,640 tris, 454 KB

111.2 × 40.0 × 58 m (`way/694434545`'s OBB and its OSM height).

| element | build |
| --- | --- |
| ground floor | granite plinth (0.45 m) + a lobby core inset 1.6 m all round, 8.6 m tall (2 storeys) in `glass_clear`, with a 3 m mullion grid — a genuinely *recessed* ground floor |
| entrance | on the module **front** (+Y in Blender = −Z in Three.js): a 24 m glass wall proud of the recess, two `metal_black` jambs, an aluminium lintel and a 28 × 4.5 m canopy on two steel columns |
| shaft | one `glass_dark` core box, then per floor a `window_lit` vision band (0.9 → 3.9 m), a `glass_dark` spandrel and a proud `metal_black` floor rail; 12 floors × 4.4 m = 52.8 m |
| mullions | vertical `metal_black` boxes every **1.5 m** around the whole plan (75 × 2 on the long faces, 26 × 2 on the ends = 202 mullions), proud of the glass by 0.11 m |
| crown | roof deck at 52.8 m, an inset mechanical storey with its own 2.6 m mullions, then a `concrete_dark` parapet ring 52.8 → **58 m** with an aluminium cap |
| sign | extruded Blender text **"NCSOFT"**, `emissive_white`, 24.00 m × 3 m, standing on a `metal_black` base + two stays near the front roof edge, top at 61.2 m |

The sign is width-fitted by **letter spacing, not stretching**: text width is linear in
`space_character`, so two probe builds solve for the spacing that lands on 24 m
(`spacing 1.739 → width 24.00 m`, printed by the generator) and the residual scale is < 1 %.
Sign geometry is ~600 of the 6,640 tris — well inside the ≤ 6 k budget for it.

### `pangyo/pangyo_station_canopy` — 536 tris, 31 KB

18 × 8 × 6 m. A paving slab built as **four slabs around a real 7 × 4 m stair void** (not an alpha
hole), the top flight of six steps descending into it, a glass balustrade + steel handrail on three
sides, **4 steel columns**, a steel beam/rib frame, a shallow butterfly `glass_clear` roof with an
aluminium ridge, and a lit sign band on the front.

### `pangyo/alphadome_tower` — 5,180 tris, 203 KB

Exported at 60 × 60 × 100 m; placement scales it per footprint. Each of 25 floors is two lofted
rings (vision `window_lit` + `glass_dark` spandrel) plus a proud `metal_alu` floor rail, over a
rounded-rectangle plan of 32 points that **tapers to 80 %** and **bows 2.5 m along +X at
mid-height** (a `sin(πt)` sweep — the "slight curve"). A stone base storey, an entrance canopy
ring, a parapet, a mechanical box and a mast with a red beacon finish it. The mast is above the
100 m fit height on purpose.

### Manifest

`public/assets/models/manifest_pangyo.json` is written by the generator with **real** tri counts,
byte sizes and `bbox_threejs` (Blender x, z, −y), plus `kind`, `height`, `footprint`, `front: '-Z'`,
`origin: 'bottom_center'` — the same shape `inject_asset.mjs` writes.

**`inject_asset.mjs` was not used**: it hard-rejects any `--as` that is not `varco/<name>`
(`if (!/^varco\/[a-z0-9_]+$/.test(as)) throw`), and `studio/` must not be modified. Ruling 1
allowed computing the manifest in-script, which is what happens.

`height` in the manifest is the **fit** height, deliberately not the bbox height: the NC bbox is
62.2 m tall (sign) against a fit height of 58, and the tower's is 112.2 m against 100.

## 3. Placement (`src/world/PangyoHero.ts`)

Exported and unit-tested: `orientedBox(fp)`, `fitYaw(obb, streets, entry)`, `fitScale(obb, height, nominal)`.

- **Oriented bbox** — minimum-area rectangle over every footprint edge direction, normalised so `w`
  is always the longer side and `(ux, uz)` runs along it.
- **Scale** — `x = obb.w / manifest.footprint[0]`, `z = obb.d / manifest.footprint[1]`,
  `y = building.height / manifest.height`. Applied to the model; the *holder* group carries the
  rotation, so the non-uniform scale is in module-local axes (correct order).
- **Yaw** — the two candidates are the outward normals of the OBB's long faces. `entry.yaw`
  (absolute degrees) wins outright; else `entry.facing` (a preferred world direction) picks between
  them; else the face nearer a fitted street wins (`streetDistance` ignores streets whose run does
  not cover the point). `yaw = atan2(−nx, −nz)`, because a Y-rotation by θ maps the module's local
  −Z front to `(−sin θ, −cos θ)`.
- **Origin** — the OBB centre at the building's own `baseY` (for NC the OBB centre and the centroid
  are the same point to 0.05 m; for an L-shaped plan the OBB centre is the right anchor for a box).
- **Collision** — see §5.

Measured fits:

| building | OBB (m) | height | scale (x, y, z) | yaw source |
| --- | --- | --- | --- | --- |
| `way/694434545` NC | 111.2 × 40.0 (100 % fill) | 58 | 1.000, 1.000, 1.000 | `facing: [0, 1]` (grid south) |
| `way/1087134311` 알파돔타워 | 72.4 × 66.7 (83 %) | 68 | 1.207, 0.680, 1.112 | `facing` toward the station |
| `way/454615763` 알파리움타워1 | 67.9 × 55.0 (72 %) | 60 | 1.132, 0.600, 0.917 | `facing` toward the station |

### Which 알파돔 footprints, and why

`gis.json` has **three** name-matched towers within 300 m of the 판교역 station node
(`node/5927786493`, local (168.44, 533.53)) — none is ≥ 90 m, so the height rule in the brief
selects nothing and the name rule decides:

| osmId | name | height | levels | distance to station |
| --- | --- | --- | --- | --- |
| `way/1087134311` | **알파돔타워** | 68 m | 15 | 98 m |
| `way/454615763` | **알파리움타워1** | 60 m | 13 | 200 m |
| `way/455409533` | 알파타워 | 55 m | 14 | 241 m |

The two tallest name-matched footprints were taken. For the record, the two *tallest* footprints
within 300 m regardless of name are `way/426367792` and `way/426367795` ("101"/"102", 71 m, 983 m²
each, 224–251 m away) — unnamed residential slabs of the 봇들마을 estate, not 알파돔시티, so they
were not chosen. `크래프톤타워` (`way/1087134310`, 67 m, 107 m away) and `판교 테크원타워`
(`way/659687065`, 67 m) are part of the same cluster but are not 알파돔-named.

### The NC entrance faces grid south, by data not by rule

`hero.json` gives the NC entry `facing: [0, 1]`. The automatic nearest-street rule would put the
front on the **north** face: the only fitted street on that block, `대왕판교로644번길`, is
`axis: 'ew', c: −28.34`, i.e. 3 m off the footprint's north edge (`z` spans −25 … +25), and
`판교역로226번길` is further north again at `c = −148`. Every authored camera — tour stop 2
("NC 정문 · south forecourt", `[0, 0.5, 44]`) and the target cut's descent — approaches from the
south, so the automatic answer would show the back of the building. The override is one field in
data with the reason recorded in the entry's `note`.

## 4. Blender vs fallback, per module

| module | shipped as | fallback exists |
| --- | --- | --- |
| `pangyo/nc_rnd_center` | **Blender GLB** | yes — `proceduralNc()`: curtain-walled footprint extrusion + a glass entrance box + a canvas-textured "NCSOFT" plane |
| `pangyo/alphadome_tower` | **Blender GLB** | yes — `proceduralTower()` |
| `pangyo/pangyo_station_canopy` | **Blender GLB** | yes — a glass roof slab on four steel columns, inside `buildHeroProps`'s catch |
| `pangyo/nc_podium` | **procedural by design** (see §7.1) | n/a |

No module fell back in this run; `Assets.instance()` resolved all three GLBs and the boot logged
zero page errors.

## 5. Collision

`Buildings`'s last constructor argument is its `noCollision` set, and `World` was passing
`heroIds` into it — so before this task a hero building would have had **no walls at all**.
`World.build()` now passes only the ids whose entry sets `selfCollision: true` (none do), with a
comment saying why. Verified in the test: every hero building still has its `bld:<osmId>` walls,
NC's spanning 58 m.

`Hero.build()` was also changed to add its group to **`world.group`** instead of `app.scene`.
`StudioBridge.probePath` ray-casts only the `world`, `props` and `vegetation` groups; with the
massing geometry gone, a hero on the bare scene would have been invisible to the studio's path
check — the tower would have read as open sky.

## 6. Data

- `src/data/recon/hero.json` — 4 entries (NC, podium, two 알파돔 towers), each with a `note`
  recording why it is shaped the way it is.
- `src/data/recon/hero_props.json` — 3 `pangyo/pangyo_station_canopy` placements: the 판교역
  station node (168.44, 533.53) and subway entrances ref 1 (`node/3408315040`) and ref 2
  (`node/3408315041`). Entrance **ref 4** (`node/3408315039`, local (96.48, 513.89)) was skipped:
  it lands 11.4 m from the centre line of the fitted `판교역로` (`c = 85.09`, width 29.25), i.e.
  inside the carriageway — a straight-fit artefact, not a data error.
- `heights_override.json` gained `hide: true` for `way/478539437` (40 m), `way/478539439` (32 m)
  and `way/694434546` (48 m) — see §7.2.
- `tools/geo/sync_data.mjs` copies `hero_props.json` too; `public/data/` re-synced.
- `src/main.ts` loads the `pangyo` manifest category and imports `PangyoHero` (the import is what
  registers the modules) and calls `buildHeroProps`.
- `HeroEntry` gained `facing?: [number, number]` and `selfCollision?: boolean`, both documented.

A `src/data/facades/pangyo.json` was **not** written: the brief listed it as an alternative route to
the NC façade, and the module supersedes it — the NC building is in `heroIds`, so the façade engine
never looks at it.

## 7. Deviations

1. **The NC podium is built in TypeScript on its own polygon, not from a bbox-fitted GLB.**
   Ruling 1 put "the podium as a separate low glass block" inside `nc_rnd_center.glb` and ruling 2
   allowed a separate `pangyo/nc_podium`. Neither works as a *fitted box*: `way/694434544` is an L,
   5,669 m² of plan inside a 143.3 × 57.5 m minimum-area bbox (69 % fill), and that box contains the
   centroids of `way/478539437`, `way/478539439` and `way/694434546`. A 143 × 57 m solid there would
   have overrun the block. The module extrudes the real footprint with the same curtain-wall
   treatment (188 tris) in a lighter palette than the tower, which is also what reads correctly:
   a second black volume at street level swallows the forecourt.
2. **Three OSM ways are now hidden** (`heights_override.json`, `hide: true`). `way/478539437`,
   `way/478539439` and `way/694434546` are older outlines of the NC complex lying wholly inside the
   tower/podium footprints. Stage 1 hid them behind the massing walls; the hero curtain wall let
   their pale procedural façades poke straight through the glass (visible in the first render). Not
   in the brief's file list, but the alternative is a broken hero.
3. **`inject_asset.mjs` was not used** — its `--as` regex only accepts `varco/<name>` and `studio/`
   is off-limits. The generator writes the manifest, as ruling 1 permits.
4. **`Hero.ts` re-parents the hero group** from `app.scene` to `world.group` (§5).
5. **The NC yaw comes from data, not from the street rule** (§3).
6. **The stage-2 screenshot is on tour stop 2's axis but 51 m further back** (`[0, 2, 95]`, look
   `[0, 40, 0]`, fov 50, day). From the stop itself (`z = 44`) the 9 m podium is 11 m away and the
   58 m tower 24 m away: the frame is nothing but curtain wall and the sign is out of shot. The test
   asserts the pulled-back eye is `probePath`-clear and that it is still on `x = 0`.
7. **`studio/tools/stage1_targetcut.mjs` was re-run unmodified** (studio is off-limits), so the
   stage-2 cut uses the identical 5 keys and is a like-for-like comparison against stage 1. Its
   output was copied and re-encoded into `pangyo-technovalley/docs/`.
8. **`docs/` means `pangyo-technovalley/docs/`**, where the stage-1 artifacts already live.
9. `docs/boot.png` is regenerated (the existing boot test rewrites it) and now shows the heroes.
10. Three canopies instead of one; yaws are authored as 0 (long axis grid east–west), not surveyed.

## 8. Verification

### Typecheck

```
$ cd pangyo-technovalley && npx tsc --noEmit
tsc rc=0            (no output)
```

### Package suite (dev server on :5175)

```
$ cd pangyo-technovalley && npx vitest run
 ✓ test/footprint.test.mjs  (7 tests)   30ms
 ✓ test/geo.test.mjs       (21 tests)   13ms
 ✓ test/hero.test.mjs      (10 tests)  10334ms
 ✓ test/boot.test.mjs      (11 tests)  11480ms
[boot] in-page load 5734 ms, launchWorld wall clock 9286 ms, 2.96 M tris, 356 draw calls,
       47 textures; props {"lamps":427,...,"hydrants":20,"bollards":0}
 Test Files  4 passed (4)
      Tests  49 passed (49)
   Duration  15.34s
```

`test/hero.test.mjs` (new, 10 tests):

1. three GLBs, each ≤ 20 k tris, `front: '-Z'`, `origin: 'bottom_center'`, positive `height`, a
   2-element `footprint`, and the file actually on disk;
2. every `hero.json` module is one this world registers and every `hero_props.json` module is in the
   manifest;
3–5. `orientedBox` / `fitScale` / `fitYaw` as pure unit tests (long side on the module x axis;
   scale onto footprint + height; front turns toward the nearest street, and `facing` / `yaw`
   override it);
6. headless boot: `hero:<module>:<osmId>` present for all four entries, three canopies, no page
   errors;
7. **no massing survives**: `heroIds` = the four entries, none of them also in `detailedIds`, and —
   the geometric half — a downward probe at the NC centroid reports `structure: true` with the hero
   group attached and `structure: false, blocked: false` with it detached, so nothing else is
   drawing that volume;
8. `probePath` at NC `topY + 2` → `blocked: false, structure: true`; at `(0, 20, 0)` (6th floor
   inside) → `blocked: true`;
9. every hero building still has `bld:<osmId>` collision walls, NC's spanning > 55 m;
10. renders `docs/stage2-nc.png`.

### Studio bridge test

```
$ cd studio && npx vitest run test/pangyo.test.mjs
 ✓ test/pangyo.test.mjs (4 tests) 29235ms
   ✓ loads pangyo-technovalley headless and exposes a usable __twin   8148ms
   ✓ renders a 2s pangyo air shot to an mp4 with 60 frames           12676ms
   ✓ exports the pangyo scene to a parseable glb with meshes          8407ms
 Test Files  1 passed (1)   Tests  4 passed (4)
```

### Target cut, re-rendered through the Director UI

```
$ cd studio && node tools/stage1_targetcut.mjs --port 5195
[13.1s] world ready in the Director iframe (13.1s)
[16.2s] check path: path clear — no collisions
[134.3s] previz done in 118.1s {"frames":240,"softwareRender":false}
```

Same 5 keys as stage 1, private server on :5195 (:5190 untouched), path clear on the first check so
*Fix path* was not needed. `previz.mp4` 16.2 MB → re-encoded `-crf 28` to
`pangyo-technovalley/docs/stage2-target-cut.mp4`, **3.6 MB**, ffprobe: `1920,1080,30/1,240`.
Stills at 1280 px: `docs/stage2-f000.png` (aerial, sign lit at sunset), `docs/stage2-f120.png`
(판교역로 southbound), `docs/stage2-f239.png` (both 알파돔 towers in the closing frame).

### Timing

| | |
| --- | --- |
| Blender generator (3 GLBs + manifest) | < 10 s |
| package suite (49 tests) | 15.3 s |
| studio bridge test | 32.9 s |
| target-cut driver (server up → mp4) | 134.3 s (previz 118.1 s, 0.49 s/frame, GPU) |

## 9. Concerns

1. **`판교역로`'s straight axis-aligned fit still runs through buildings** (Task 3 concern 2). It
   also put subway entrance ref 4 in the carriageway, so that canopy was dropped. A per-block split
   of long streets in `build_streets.mjs` would pay for itself.
2. **판교역 still has no hall or plaza** — only three 18 × 8 m canopies at OSM node positions. In
   the closing frame of the cut they are small; the 알파돔 towers now carry that shot instead.
   Their yaws are authored `0`, not surveyed: OSM gives no orientation for those nodes.
3. **Both towers are dark in daylight.** `glass_dark` + `window_lit` reads correctly at sunset and
   at night (the vision bands light up), but at noon the NC slab and the 알파돔 towers are the
   darkest objects in the frame. A lighter spandrel would soften it; it is a material choice, not a
   bug.
4. **One `alphadome_tower.glb` serves two towers of different aspect.** 알파리움타워1 is fitted
   1.13 × 0.92 in plan against 알파돔타워's 1.21 × 1.11, so the two differ mostly in squash, and
   both are squashed vertically (0.68 / 0.60 of the authored 100 m) — 25 floor bands compressed into
   68 m / 60 m read as a denser stack than 4 m storeys. A per-tower `floors` parameter in the
   manifest would fix it properly.
5. **`probePath` is still a roof test, not a wall test** (Task 3 concern 4). The hero test's
   "no massing survives" check works around it by detaching the group; camera blocking on this world
   still needs eyes on frames.
6. **A thin, tall façade sliver stands near 판교역** in the plaza (visible in a scratch render at
   `(120, 40, 420)`), a stage-1 OSM/façade artefact unrelated to this task.
7. **The world's GLB export grew** — worth re-measuring `studio/tools/e2e.mjs --world
   pangyo-technovalley` (18.2 MB / 565 meshes at stage 1) now that four hero buildings and three
   canopies are in the scene. Not re-run here; the bridge test's `exportGlb` case does pass.
8. The studio server on **:5190 may still hold a stale `WORLDS`** (Task 3 concern 1). This task did
   not need it — the driver runs its own server — but it is still unresolved.

## 10. Files

```
 M .gitignore                                        pangyo-technovalley/tools/blender/ (controller's line)
 A pangyo-technovalley/tools/bpl/bpl_lib.py          copy of union's, + window_lit/roof + text_mesh
 A pangyo-technovalley/tools/bpl/gen_pangyo.py       the three hero GLBs + manifest_pangyo.json
 A pangyo-technovalley/public/assets/models/pangyo/nc_rnd_center.glb        6,640 tris
 A pangyo-technovalley/public/assets/models/pangyo/alphadome_tower.glb      5,180 tris
 A pangyo-technovalley/public/assets/models/pangyo/pangyo_station_canopy.glb  536 tris
 A pangyo-technovalley/public/assets/models/manifest_pangyo.json
 A pangyo-technovalley/src/world/PangyoHero.ts       fit maths, 4 modules, fallbacks, hero props
 A pangyo-technovalley/src/data/recon/hero.json      + public/data copy
 A pangyo-technovalley/src/data/recon/hero_props.json + public/data copy
 A pangyo-technovalley/test/hero.test.mjs            10 tests
 M pangyo-technovalley/src/world/World.ts            HeroEntry facing/selfCollision; keep massing collision
 M pangyo-technovalley/src/world/Hero.ts             hero group under `world` (probePath)
 M pangyo-technovalley/src/main.ts                   'pangyo' manifest; buildHeroProps
 M pangyo-technovalley/src/data/recon/heights_override.json  hide 3 duplicate outlines (+ public copy)
 M pangyo-technovalley/tools/geo/sync_data.mjs       sync hero_props.json
 M pangyo-technovalley/README.md                     "Stage 2 — hero modules"
 A pangyo-technovalley/docs/stage2-target-cut.mp4    3.6 MB, 240 frames
 A pangyo-technovalley/docs/stage2-nc.png, -f000.png, -f120.png, -f239.png
 M pangyo-technovalley/docs/boot.png                 regenerated by the existing boot test
```

`union-square-sf/`, `kyoto-higashiyama/` and `studio/` were not modified. No dev server was killed.
