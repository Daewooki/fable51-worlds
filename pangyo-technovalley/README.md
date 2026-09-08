# Pangyo Techno Valley — digital twin (판교테크노밸리)

A third MV Studio world: the blocks around the **NCSOFT R&D Center** (엔씨소프트R&D센터) in 판교, 성남, built from
public GIS data and rendered by a generalized copy of the `union-square-sf` Three.js runtime.

| | |
| --- | --- |
| **Target cuts** (8 s · 1920×1080 · 30 fps · sunset, the same move at each stage) | [stage 1 — massing](docs/stage1-target-cut.mp4) · [stage 2 — hero modules](docs/stage2-target-cut.mp4) · [stage 3 — ground cover, routes, signals](docs/stage3-target-cut.mp4) |
| **QA** | [FINAL_QA_REPORT.md](FINAL_QA_REPORT.md) — counts, four probed viewpoints with screenshots, life and traffic-light smoke, and the defect list |

## How this world was made

Four commands, in this order, each re-runnable on its own. Nothing in `src/` names a place: the
world is whatever the JSON under `src/data/recon/` says it is.

| | Step | Command | What it produces |
| --- | --- | --- | --- |
| 1 | **Data** — OSM + SRTM into a local frame | `npm run geo` | `gis.json` (564 buildings, 118 parts, 794 ways, 378 POIs, 232 ground-cover areas, 58 signals, 65 crossings), `elevation.json`, `streets_spec.json` (23 fitted streets, 2 dropped), and a regenerated `src/geo/geo.ts` |
| 2 | **Runtime** — a generalized copy of union's Three.js app | `npm run dev` → <http://localhost:5175/> | terrain, massing, procedural façades, the analytic street model, props |
| 3 | **Hero modules** — the three authored GLBs | `npm run assets` (portable Blender) | `public/assets/models/pangyo/*.glb` + `manifest_pangyo.json`, fitted to their OSM footprints at load time |
| 4 | **Life, ground cover and QA** | `node tools/qa/qa_report.mjs` | ground fill, routes, signals and crowds are built by the runtime; the QA pass probes and shoots the four viewpoints and writes [`FINAL_QA_REPORT.md`](FINAL_QA_REPORT.md) |

Filming is a fifth step and lives in the studio: `cd studio && npm run up:pangyo`, block a shot in
the Director on :5180, **Check path**, **Render previz**.

## Run

```bash
npm install
npm run dev        # http://localhost:5175/
```

Studio/QA URL contract: `http://localhost:5175/?qa=1&ui=0&studio=1&life=<0|1>&time=sunset&q=med`
(`life=1` turns the pedestrians and traffic on — the studio sends `0` unless the shot asks for it)

> `npm run dev` is plain `vite` (unlike union-square-sf's, it does not sync data first), so it
> works on a repo path containing a space. `npm run sync` re-copies `src/data/recon/*` to
> `public/data/` when you have edited the recon files by hand.

```bash
npm run typecheck  # tsc --noEmit
npx vitest run     # geo unit tests + the headless boot test (needs the dev server on 5175)
node tools/qa/studio_bridge_test.mjs
```

## Frame

- Origin: OSM way `694434545` centroid — 37.399371 N, 127.108722 E, ground 37 m; `y = 0` at that ground level.
- `x` = grid east, `z` = grid south, `y` = up (metres). Grid bearing 84.541°.
- Bbox: S 37.3950, W 127.0990, N 37.4065, E 127.1170.

## Data

`npm run geo` rebuilds everything from the cached OSM/elevation inputs:
`fetch_osm` → `fetch_elevation` → `build_gis` → `build_streets` → `sync_data` (copies `src/data/recon/*` to `public/data/`).

**`pois` counts 378, not 460.** `build_gis.mjs` bins the ground-cover areas (`landuse` / `leisure` /
`amenity=parking` / `natural` polygons) **first**, and every way that lands in that bin is kept out of
the POI bin. Those tags also match `POI_KEYS`, so before this every park, car park and pond was filed
twice — once as ground cover and once as a "point of interest" — and `fetch_osm --augment` added 29
more of them in stage 3. Excluding them drops `pois` 460 → 378 and changes nothing else: buildings
564, building parts 118, ways 794, fitted streets 23, ground cover 232, signals 58, crossings 65,
NC height 58 m are all byte-identical. A census that wants those areas should read `landuse` too.

Runtime data files under `src/data/recon/` (synced to `public/data/`):

| file | required | what it drives |
| --- | --- | --- |
| `gis.json` | yes | buildings, building parts, streets, POIs, prop bins |
| `elevation.json` | yes | terrain heightfield |
| `streets_spec.json` | yes | `World.makeStreetSpecs()` — the analytic street model (lanes clamped to 1–6) |
| `heights_override.json` | no | per-OSM-id height / floors / style / name overrides (see below) |
| `tour.json` | no | tour mode camera stops (`[{ title, subtitle?, pos, look, duration, hold, time? }]`) |
| `routes.json` | no | scheduled route vehicles for `Traffic` (see the header of `src/life/Traffic.ts`) |
| `plaza.json` | no | the optional public-square module (see the header of `src/world/Plaza.ts`) |
| `hero.json` | no | `[{ osmId, module, yaw?, footprintFit? }]` — hero buildings (Task 4 fills it) |
| `viewpoints.json` | no | reference viewpoints for the QA harness |
| `storefronts.json` | no | storefront census used to name façade bays |

Nothing in `src/` names a place: a missing optional file logs one `console.info` and turns that feature off.

### Building heights — two layers, two precedences

`heights_override.json` is read twice, on purpose:

| layer | who | order |
| --- | --- | --- |
| **build time** (bakes `gis.json`) | `tools/geo/build_gis.mjs` → `resolveHeight()` | OSM `height` → OSM `building:levels × 3.6 + 1` → `override.heightM` → `override.floors × 3.6` → area default |
| **runtime** (what is extruded) | `src/world/Buildings.ts` | `override.heightM` → `gis.json heightM` → `levels × floorH + 1` → `override.floors × floorH` → area default |

`gis.json` is a record of the survey, so real OSM tags win there and each building keeps an honest `heightSource`;
the override only fills gaps. At render time the curated value wins, because that is the point of curating it.
`style` / `floorH` / `bayW` / `hide` / `name` always apply at runtime.

## MV Studio

The world is registered with [MV Studio](../studio/README.md) on **dev port 5175**:
`WORLDS` in `studio/schemas/project.mjs`, `WORLD_PORTS` in `studio/server/render/browser.mjs`
and `studio/app/src/main.ts`, `WORLDS`/`ALIASES` (`pangyo`) in `studio/tools/up.mjs`. It runs
a generalized copy of union-square-sf's runtime, so the Director's **Unlock controls**
(walk/orbit) works on it as it does on union.

Prompt → path anchors come from **this world's own `public/data/tour.json`** — the studio's
`anchorsFor()` prefers a world's `tour.json` over its hard-coded `TOURS` table, so the six
tour stops below are the landmark list the planner (and provider `none`) aims at.

```bash
cd studio
npm run up:pangyo                                        # world + server + Director UI
npx vitest run test/pangyo.test.mjs                       # launch + 2 s previz + GLB export
node tools/e2e.mjs --world pangyo-technovalley --port 5199 # whole pipeline, throwaway dir
```

## Stage 1 — target cut

`docs/stage1-target-cut.mp4` — **8 s · 1920×1080 · 30 fps · sunset · 240 frames.** An aerial
over the NCSOFT R&D Center descends past the tower and its podium onto 판교역로, then runs
south down the boulevard toward 판교역 and lifts to reveal the 알파돔시티 / 판교역 cluster.
Stills: `docs/stage1-f000.png`, `docs/stage1-f120.png`, `docs/stage1-f239.png` (1280 px wide).

Blocked and rendered through the Director UI on :5180 (create project → create shot → keys →
**Check path** → **Render previz**); `studio/tools/stage1_targetcut.mjs` is the Playwright
driver that did it and re-runs the whole thing.

| | |
| --- | --- |
| collision check (`probePath`, 10 Hz + every key) | **path clear — no collisions**, first pass, no *Fix path* needed |
| previz render (240 frames @ 1920×1080) | **124.2 s** (0.52 s/frame) |
| world load in the Director iframe | 11.6 s |
| `softwareRender` | **false** (GPU / ANGLE d3d11, RTX 3070) |
| encoded deliverable | 3.5 MB (`-crf 28`; the studio's own `previz.mp4` is 16.4 MB at `-crf 18`) |

Keys as saved in the shot (metres, `x` grid-east, `z` grid-south, `y` up):

```json
[
  { "t": 0.0, "m": "air", "eye": [40, 140, 220], "look": [0, 20, 0],   "cap": "NCSOFT R&D Center · 판교테크노밸리" },
  { "t": 2.2, "m": "air", "eye": [26, 66, 110],  "look": [0, 28, 10] },
  { "t": 4.0, "m": "air", "eye": [86, 30, 10],   "look": [90, 8, 250] },
  { "t": 6.0, "m": "air", "eye": [80, 55, 110],  "look": [92, 10, 370] },
  { "t": 8.0, "m": "air", "eye": [45, 85, 300],  "look": [105, 12, 530], "cap": "판교역 · 알파돔시티" }
]
```

Key 1 is `tour.json` stop 1 verbatim. Keys 2–5 follow stops 2–5 in order — the NC forecourt,
the 판교역로 corner, the southbound leg, 판교역 — but carry authored altitudes, and keys 2
and 5 sit further back than the stops themselves. Three reasons, all of them stage-2 work:

- The tour's eye heights are street level. An 8 s move through them dives 140 m and climbs
  back out twice.
- 판교역로 is a curve fitted to a straight, axis-aligned `StreetSpec` (`c = 85.09`, width
  29.25 m), so its carriageway overlaps **삼성화재 판교사옥** (59 m) around `z ≈ 210–260` and
  the **카카오 판교아지트** block (66 m) south of `z ≈ 380`. The southbound leg therefore
  climbs over them instead of flying the centre line at street level.
- Stop 5 (`[168, 22, 500]` looking at `[200, 14, 545]`) is probe-clear but 20 m from an
  unnamed 28 m block's façade, and there is no station building or plaza modelled at 판교역
  yet — only OSM `public_transport` nodes. The cut therefore ends above and north of the
  station looking down on the cluster.

Fed the tour's own altitudes, the check does find those blocks and the Director's **Fix
path** clears them — an earlier take of this cut reported *3 collisions (0.5 s)* at 3.3 s and
6.4–7.3 s (surfaces at 57/58/60 m) and came back `path clear` after 7 inserted keys — but the
result yo-yos between 20 m and 70 m, which is why the shipped cut is authored to be clear.

## Stage 2 — hero modules

Three generic massings around 판교역로 are replaced by authored modules, generated offline with
Blender and fitted to their OSM footprints at load time.

| module | GLB | tris | replaces |
| --- | --- | --- | --- |
| `pangyo/nc_rnd_center` | `public/assets/models/pangyo/nc_rnd_center.glb` | 6,640 | `way/694434545` 엔씨소프트 R&D 센터 (12 levels / 58 m) |
| `pangyo/alphadome_tower` | `.../alphadome_tower.glb` | 5,180 | `way/1087134311` 알파돔타워 (68 m) and `way/454615763` 알파리움타워1 (60 m) |
| `pangyo/pangyo_station_canopy` | `.../pangyo_station_canopy.glb` | 536 | nothing — 판교역 has no building footprint in OSM, so the canopy is a *prop* |
| `pangyo/nc_podium` | — (built in TypeScript on the real polygon) | 188 | `way/694434544`, the NC podium (2 levels / 9 m) |

### Generating the GLBs

```bash
npm run assets
# = tools/blender/<portable build>/blender.exe --background --python-exit-code 1 \
#     --python tools/bpl/gen_pangyo.py
```

`--python-exit-code 1` is not optional: without it Blender exits **0** even when the script raised, so
`gen_pangyo.py`'s per-module triangle-budget check (`raise SystemExit`) printed an error and the build
carried on with a stale GLB. `tools/bpl/run_blender.mjs` resolves the Blender path relative to this
package (so a repo path containing a space is fine) and prints how to get a build if there is none.

Blender 4.2.9 LTS is unpacked under `tools/blender/` and **not committed** (it is in the root
`.gitignore`); download the portable Windows build from blender.org and unpack it there to
re-run the generator. The PyPI `bpy` wheel is not an option on this machine — it needs Python
3.11. `tools/bpl/bpl_lib.py` is `union-square-sf`'s asset-kit library, copied verbatim except
for its header, a `text_mesh` helper and two extra material names; the conventions it enforces
(metres, Z-up in Blender, origin at the asset's bottom-centre, front = +Y in Blender = **−Z**
in Three.js, materials named from `MATERIAL_LIBRARY` and remapped by `src/materials/Library.ts`)
are the same ones the union kit uses.

The generator writes `public/assets/models/manifest_pangyo.json` itself (real tri counts, real
bboxes, and the `originNote` below). The studio's `tools/inject_asset.mjs` was not used — it is the
VARCO import path — but it now accepts `--as <category>/<name>`, so it *could* write into this
world's `manifest_pangyo.json`.

**The canopy's origin is not its bbox minimum.** All three modules declare `origin: bottom_center`,
and for the NC slab and the tower that is literally true (`bbox.min.y == 0`). The station canopy's
origin is the **plaza slab**, and the stair well cut into that slab drops the top flight of steps and
the balustrade footing **1.02 m below it** (`bbox.min.y = −1.02`). Placement therefore puts `y = 0` on
the pavement, not on the bbox minimum, or every canopy would float a metre in the air. The manifest
says so in `originNote`, and `test/hero.test.mjs` asserts it twice: on the manifest, and on the real
geometry in the scene.

### Data

`src/data/recon/hero.json` — `[{ osmId, module, footprintFit?, yaw?, facing?, selfCollision? }]`;
`src/data/recon/hero_props.json` — `[{ module, pos:[x, z], yaw? }]` for modules with no footprint.
Both are synced to `public/data/` by `npm run sync` and are optional (missing ⇒ no heroes).

### Fitting

`src/world/PangyoHero.ts` registers the named builders and does the placement:

- **scale** — the module's manifest `footprint` `[w, d]` is scaled onto the minimum-area oriented
  bounding box of the OSM footprint, and its manifest `height` onto the building height. Modules
  are authored at their real plan size (NC 111.2 × 40.0 m, the towers 60 × 60 m) so the fit stays
  near 1 and the 1.5 m mullion spacing survives. `height` is the *fit* height, not the bbox
  height: the NCSOFT sign stands 3 m above the 58 m parapet and the tower's mast above 100 m,
  on purpose.
- **yaw** — the long axis of the oriented bbox gives two candidate front normals; the one nearer
  a fitted street wins, unless the entry names `facing` (a preferred direction) or `yaw`
  (absolute degrees). The NC entry sets `facing: [0, 1]`: the only fitted street on that block,
  대왕판교로644번길, runs 3 m off the **north** edge (`c = −28.34`), so the automatic rule would
  turn the 정문 away from the forecourt every authored camera approaches from.
- **collision** — a hero replaces *geometry*, not walls. `World` now keeps the massing collision
  polygon for hero buildings (only an entry with `selfCollision: true` opts out), so the walk
  controller and the studio's `probePath` still meet the building.
- **fallback** — if a GLB is missing or fails to parse, the module builds itself from Three.js
  geometry instead (curtain-walled footprint extrusion, canvas-textured "NCSOFT" sign) and logs
  it. The world boots either way. All three GLBs exported cleanly here, so the fallback is a
  safety net, not the shipped path.

The NC podium is the exception: it is built straight on its own polygon rather than from a
bbox-fitted GLB, because its footprint is an L — a 5,669 m² plan whose minimum-area bbox is
143.3 × 57.5 m (69 % fill) and swallows `way/478539437`, `way/478539439` and `way/694434546`.
Those three ways are older OSM outlines of the NC complex lying wholly inside the tower and
podium footprints; stage 1 hid them behind the massing walls, the hero curtain wall let them
poke through, so they are now `hide: true` in `heights_override.json`.

### Stage-2 target cut

`docs/stage2-target-cut.mp4` — the stage-1 cut re-rendered on the hero geometry, same keys,
same driver (`studio/tools/stage1_targetcut.mjs --port 5195`, so :5190 is untouched).
Stills `docs/stage2-f000.png` / `-f120.png` / `-f239.png`; `docs/stage2-nc.png` is the NC
entrance view with the rooftop sign.

| | |
| --- | --- |
| collision check | **path clear — no collisions**, first pass |
| previz render (240 frames @ 1920×1080) | **118.1 s** (0.49 s/frame) |
| world load in the Director iframe | 13.1 s |
| `softwareRender` | **false** (GPU / ANGLE d3d11) |
| encoded deliverable | 3.6 MB (`-crf 28`; the studio's own `previz.mp4` is 16.2 MB) |
| world cost after stage 2 (boot test, 1280×720 `med`) | 2.96 M tris, 356 draw calls; the four hero buildings are 17,188 tris and the three canopies 1,608 |

`test/hero.test.mjs` covers it: the fit maths as unit tests, then a headless boot asserting the
modules are in the scene, that detaching the `hero` group leaves *terrain* under the NC centroid
(so no massing survived), that `probePath` is clear at the roof + 2 m and blocked at y = 20 m
inside, and that every hero building still has its collision walls.

## Stage 3 — life, routes, ground fill & QA

### Ground fill (`src/world/BlockFill.ts`)

Stages 1–2 painted only the carriageways and the building footprints: everything between the blocks
was bare terrain — a white plane in daylight. Stage 3 adds a ground-cover layer built from a new
`landuse` bin in `gis.json`:

```
node tools/geo/fetch_osm.mjs --augment     # adds ONLY the ground-cover polygons to the cached dump
node tools/geo/build_gis.mjs               # bins them via landuseClass() -> gis.json.landuse
```

`--augment` fetches `way/relation["landuse"]`, `way["amenity"="parking"]`, `way["natural"~water|wood|…]`
and `way["waterway"="riverbank"]` for the same bbox and merges them into `osm_raw.json` by `type/id`,
so every element that was already there stays byte-identical (196 new elements, 1.29 → 1.68 MB).
`landuseClass()` maps each area to a **surface** and a **priority**: `water` (natural=water, wetland,
basin), `paving_dark` (parking, residential), `soil` (pitch, playground, brownfield), `grass` (park,
garden, grass, forest, village_green), `paving` (commercial, retail, industrial, education).

`BlockFill` then paints them, plus a fallback: the block cells between consecutive fitted street
centrelines (inset by half the street width + its sidewalk) wherever no OSM polygon covers the ground.
Each patch is earcut-triangulated, the triangles are clipped to an **8 m** grid — the terrain's own
resolution, so a cell never spans more than one heightfield quad — and the street corridors (road +
both sidewalks) are cut out exactly, or the 운중천 polygon would be painted straight across 판교역로.
Patches merge into **one mesh per surface**, each at its own millimetre offset above the terrain so
nested areas never z-fight.

Three things the stage-3 review asked for and this now does:

- **The fill covers the whole extract.** It used to stop at a symmetric ±620 m box, which left the
  outer third of the world as bare white terrain with streets running off into nothing. The box is now
  `BlockFill.FILL_BBOX` = `geo.localBbox()` — x −903…805, z −870…553 — so the fill ends exactly where
  the OSM data does.
- **A street only bounds the ground where it runs.** `blockCells()` applies a boundary's sidewalk
  inset only to the cells its own `from`/`to` span reaches, instead of cutting a strip across the
  whole world at every side street's offset. `Coverage.covers()` also treats a polygon's holes as
  uncovered ground, so a ring-shaped park gets its courtyard filled.
- **Water reads as water.** The `water` material is a darker blue-grey at alpha 0.75, and nothing is
  painted *under* a translucent class (`TRANSLUCENT_SURFACES`) — the 봇들 park's grass and its three
  rectangular pitches used to be plainly visible through the river.

| | |
| --- | --- |
| OSM ground-cover polygons in `gis.json` | 232, all of them inside the fill box |
| fallback block patches | 1,607 |
| draw calls / triangles added | **5** / ~189 k |
| new material | `water` (registered in this world's `src/materials/Library.ts` only) |

### Transit routes (`src/data/recon/routes.json`)

Six route vehicles, using kit ids that already exist in `manifest_vehicles.json`:

| route | street | dir | lane | stops |
| --- | --- | --- | --- | --- |
| 9007 판교역 방면 | 판교역로 | S | curb | H스퀘어 · 엔씨.안랩 · 동안교 · 판교역서편 |
| 9007 판교테크노밸리 방면 | 판교역로 | N | curb | (same, reversed) |
| 101 대왕판교로 남행 / 북행 | 대왕판교로 | S / N | curb | 삼평교 · NC 블록 · 테크노밸리 남측 |
| 3100 판교로 동행 / 서행 | 판교로 | E / W | curb | 대왕판교로 · 판교역로 · 분당내곡로 교차 |

Stop positions are the OSM `public_transport=platform` nodes where this bbox has them (엔씨.안랩 07630/07631,
H스퀘어 07479/07034, 동안교 07450, 판교역서편 07407, 삼평교 07498) and the route numbers are those platforms'
real `route_ref` tags; no timetable is modelled. `lane: "curb"` is a new picker in `Traffic.ts` — the kerbside
lane *for the direction of travel* (`curbRight`/`curbLeft` are fixed lane indices and only work one way on a
two-way street). `vmax` is 11.5 m/s; the lane graph caps block links at 11.2 m/s (≈ 40 km/h), below the posted 50.

### Traffic signals

`Streets` used to signalise **every** grid crossing. `StreetGrid.applyOsmSignals()` now decides once, from
the OSM `signals` bin: each `highway=traffic_signals` node snaps to the nearest crossing within 30 m, and a
crossing of two ≥ 12 m streets is signalised as a fallback. `TrafficLights`, the vehicle lane graph
(`Node.signal`, which also gates right turns) and the signal masts in `Props` all read the same
`Intersection.signal`, so they cannot disagree. Result: **14 of 19** crossings signalised (6 from the 58 OSM
nodes, 8 from the fallback). `TrafficLights.attachHeads()` also had a fixed 14 m bind radius, which never
matched on a 29 m arterial where the corner mast stands 16 m out; the radius is now derived from the
junction's own widths, so **42** masts are driven instead of 4.

### Pedestrians

`NavGraph.BOUNDS` was 420 m, which cut the 판교역 forecourt (z ≈ 530) out of the graph entirely — no
pedestrian ever reached the station. It is now 620 m, matching `Props.EXTENT` (the ground fill is the one layer that spans the whole bbox): 2,254 nav nodes, 240 of
them pruned as unreachable (down from 322), and 26 live nodes within 120 m of the station. No plaza
lattice was needed; the station forecourt is reached over the fitted sidewalks of 판교역로 and
대왕판교로606번길.

### QA

```bash
node tools/qa/qa_report.mjs     # needs the dev server on :5175; writes FINAL_QA_REPORT.md + docs/qa/*
npx vitest run test/life.test.mjs
```

`tools/qa/qa_report.mjs` boots the world through the studio's Playwright launcher with `life=1`, probes and
screenshots the four `viewpoints.json` cameras into `docs/qa/`, measures the life systems at boot and after
30 s of simulated time, runs a 60 s traffic-light smoke (a route vehicle must come to rest at a stop bar
whose signal is not green) and writes [`FINAL_QA_REPORT.md`](FINAL_QA_REPORT.md) with the defect list.
Time is advanced with `__twin.stepLife(seconds, dt)`, which steps only the life systems in fixed 1/30 s
steps, so the numbers do not depend on the headless frame rate. The run exits non-zero on a page error, a
blocked camera, an unknown viewpoint id, or a light smoke with no red-light stop, and it closes the
browser in a `finally`.

**Viewpoint coordinates.** Each camera in `viewpoints.json` carries both the authored local `x`/`z` (the
source of truth — that is what was aimed) and the same point as `lat`/`lon`, recomputed with
`localToGeo`. `Viewpoints.place()` prefers `x`/`z` when both are finite and falls back to `lat`/`lon`, and
`test/geo.test.mjs` asserts every camera round-trips within 0.5 m — the two had drifted ~11 m apart, so the
QA harness and the in-world overlay were standing in different places.

Reference photos are **not** committed (Kakao/Naver road view is not redistributable): `photos/` is
git-ignored except for its README, which says what to capture for each viewpoint.

### Stage-3 target cut

`docs/stage3-target-cut.mp4` — the same 8 s / 1920×1080 / sunset cut, same keys, same driver
(`studio/tools/stage1_targetcut.mjs --port 5196`, so :5190 is untouched), re-rendered on the ground fill.
Still: `docs/stage3-f120.png`.

| | |
| --- | --- |
| collision check | **path clear — no collisions**, first pass |
| previz render (240 frames @ 1920×1080) | **114.6 s** (0.48 s/frame) |
| world load in the Director iframe | 13.5 s |
| `softwareRender` | **false** (GPU / ANGLE d3d11) |
| encoded deliverable | 4.0 MB (`-crf 28`; the studio's own `previz.mp4` is 17.1 MB) |

The studio opens a world with `life=0` by default (the world contract in `studio/README.md`, composed in
`studio/server/render/browser.mjs`), so this cut shows the ground cover but **no moving agents**. A shot
can now opt in: tick **life (pedestrians & traffic)** on the Director's *New shot* form and the preview,
the previz render and the GLB export all open the world with `life=1`. The default stays off because a
render with the crowd running is not reproducible frame to frame. The traffic and crowd in this world are
covered by `docs/qa/*.png` (shot with `life=1`), [`FINAL_QA_REPORT.md`](FINAL_QA_REPORT.md) and
`test/life.test.mjs`.

## Licensing / attribution

- Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL):
  <https://www.openstreetmap.org/copyright>. The attribution is also carried in `gis.json.meta`.
- Elevation: SRTM 1-arcsec via OpenTopoData (`srtm30m`), public domain; AWS Terrarium tiles as the per-point fallback.
- 3D asset kit under `public/assets/models/`: generated with the repo's Blender tooling (MIT), copied from `union-square-sf`.
