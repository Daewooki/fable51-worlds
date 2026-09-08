# Pangyo Techno Valley — digital twin (판교테크노밸리)

A third MV Studio world: the blocks around the **NCSOFT R&D Center** (엔씨소프트R&D센터) in 판교, 성남, built from
public GIS data and rendered by a generalized copy of the `union-square-sf` Three.js runtime.

## Run

```bash
npm install
npm run dev        # http://localhost:5175/
```

Studio/QA URL contract: `http://localhost:5175/?qa=1&ui=0&studio=1&life=0&time=sunset&q=med`

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
node tools/e2e.mjs --world pangyo-technovalley --port 5194 # whole pipeline, throwaway dir
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

```
tools/blender/blender-4.2.9-windows-x64/blender.exe --background --python tools/bpl/gen_pangyo.py
```

Blender 4.2.9 LTS is unpacked under `tools/blender/` and **not committed** (it is in the root
`.gitignore`); download the portable Windows build from blender.org and unpack it there to
re-run the generator. The PyPI `bpy` wheel is not an option on this machine — it needs Python
3.11. `tools/bpl/bpl_lib.py` is `union-square-sf`'s asset-kit library, copied verbatim except
for its header, a `text_mesh` helper and two extra material names; the conventions it enforces
(metres, Z-up in Blender, origin at the asset's bottom-centre, front = +Y in Blender = **−Z**
in Three.js, materials named from `MATERIAL_LIBRARY` and remapped by `src/materials/Library.ts`)
are the same ones the union kit uses.

The generator writes `public/assets/models/manifest_pangyo.json` itself (real tri counts, real
bboxes). The studio's `tools/inject_asset.mjs` was not used: it only accepts `--as varco/<name>`.

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

## Licensing / attribution

- Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL):
  <https://www.openstreetmap.org/copyright>. The attribution is also carried in `gis.json.meta`.
- Elevation: SRTM 1-arcsec via OpenTopoData (`srtm30m`), public domain; AWS Terrarium tiles as the per-point fallback.
- 3D asset kit under `public/assets/models/`: generated with the repo's Blender tooling (MIT), copied from `union-square-sf`.
