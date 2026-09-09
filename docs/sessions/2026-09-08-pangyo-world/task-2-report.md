# Task 2 report — generalized runtime for `pangyo-technovalley`

Status: **DONE_WITH_CONCERNS** (all acceptance checks pass; concerns are listed at the end and all are Task 3/4 territory).

Commit: `feat(pangyo): generalized runtime boots on OSM/SRTM data` (see hash in the reply).

---

## 1. What was copied

From `union-square-sf` (never modified; `kyoto-higashiyama` untouched):

| copied | note |
| --- | --- |
| `index.html` | title + loading text changed to Pangyo |
| `vite.config.ts`, `tsconfig.json` | verbatim |
| `src/app/**`, `src/player/**`, `src/systems/**`, `src/util/**`, `src/materials/**`, `src/debug/**`, `src/world/**`, `src/life/**`, `src/assets/**`, `src/main.ts` | then edited (§2) |
| `public/assets/models/**` | 206 GLBs + 7 manifests, 5.7 MB, byte-identical |
| `tools/qa/studio_bridge_test.mjs` | ported to port 5175 |

**Not copied:** `src/data/recon/*` and `public/data/*` (Task 1 owns them), `src/interiors/**` (feature deleted), `src/data/facades/*.json` (SF façade specs — replaced by an empty `index.json`), the rest of `tools/qa/*`, `tools/bpl/*`, `refs/`, `qa/`, `media/`, `README.md`, `PROMPT.md`, `FINAL_QA_REPORT.md`, `docs/`.

**Byte-identical to union (verified with `cmp`):** `src/debug/StudioBridge.ts`, `src/debug/Qa.ts`, `src/assets/Assets.ts` (keeps the `asset_overrides.json` hook and the `varco` manifest category — the `manifest missing varco` console warning is expected and matches union).

`src/geo/geo.ts`, `tools/geo/*`, `test/geo.test.mjs`, `vitest.config.ts`, `package.json` are Task 1's and were left alone.

## 2. Per-file changes

### Removed outright
- **`src/interiors/`** (Apple.ts 453 L, Nintendo.ts 451 L, nintendo/canvases.ts) — the interiors feature and all references to it (`Hero.HERO_MODULES`, `heroExcludeIds()`, `main.ts` import).

### Rewritten
- **`src/world/Plaza.ts`** — was 265 lines of Union Square geometry (terraces, Dewey Monument, garage portal, stage canopy). Now a generic, fully data-driven module: `new Plaza(spec, terrain, collision)` builds terraces, stairs, retaining walls and uplights from `data/plaza.json`, exposes `bounds()`, `contains(x,z)`, `levels`, `setNight()` and `furniture()` (café tables from `cafeTables`). The file header documents the JSON shape. Pangyo ships no `plaza.json`, so `World.plaza === null`.
- **`src/world/Props.ts`** — was hand-placed SF furniture (heart sculptures, plaza benches/globes/flagpoles/kiosks, SFMTA shelters, cable-car stop signs, transit-agency stop poles, trolley wires, Maiden Lane planters, Union Square banners). Now purely rule-driven from the fitted street specs + OSM prop bins:
  - streetlights every **30 m** on both kerbs, **0.8 m** back from the kerb line (tall mast on streets ≥ 10 m wide, 4 m pedestrian lantern below that), skipped within 9 m of a crossing;
  - street trees every **12 m** on sidewalks **≥ 3.0 m**, skipped within **6 m** of a crossing, 15 % random thinning, plus a further 60 % thinning beyond a 250 m radius (triangle budget);
  - benches (`street/bench_wood`) every 45 m **only within 140 m of the origin**, with collision boxes;
  - parking meters only where a spec declares a parking lane (none in Pangyo);
  - bins / bike racks / utility cabinets every 48 m;
  - crossings: OSM `gis.crossings` when present (18 in the core) else the street-grid intersections; curb ramps on each;
  - signals: OSM `gis.signals` (58 nodes) snapped to the nearest junction within 30 m, **plus** every major×major junction (both streets ≥ 12 m wide) — 19 signalled nodes result;
  - OSM `trees/lamps/hydrants/benches/bollards` are honoured when present (this extract has 3 benches and nothing else);
  - plaza lamps/benches come from `plaza.json` when a plaza exists;
  - rooftop mechanical boxes kept unchanged.
  Prop extent is a ±620 m box around the origin.
- **`src/world/Vegetation.ts`** — was hard-coded Union Square palm/olive/hedge/flowerbed positions. Now: street trees from `World.treeSpots` (filled by Props) + optional `plaza.json.trees` (`[x, y, z, kitId]`), instance caps derived from the actual spot count.
- **`src/world/Hero.ts`** — `HERO_MODULES` is now a registry keyed by module id (`registerHeroModule`) and hero buildings come from `data/hero.json` (`[{ osmId, module, yaw?, footprintFit? }]`), read in `World.loadData()` into `World.heroEntries`/`World.heroIds`. Empty registry + absent file ⇒ nothing built, massing stays. Task 4 fills both.

### Generalized in place
- **`src/world/World.ts`**
  - `HEIGHT_OVERRIDES` constant deleted; overrides now load from `data/heights_override.json` (Task 1's shape, `_`-prefixed keys such as `_README` skipped) into `World.heightOverrides`.
  - `makeStreetSpecs()` no longer contains a street list or the `centre()` OSM-median helper; it maps `data/streets_spec.json.streets` straight to `StreetSpec`, clamping `lanes` to **1…6** (`World.MAX_LANES`) — 판교로 and 판교역로 carry `lanes: 9` from OSM.
  - `Plaza` built only when `plaza.json` exists; `plazaPoly` for `Buildings` derives from `gis.plaza?.footprint` or the plaza bounds, else `null`.
  - Added `optionalData<T>(file, what)` — the shared "missing ⇒ feature off + one `console.info`" helper (also used by `Traffic`).
  - `Terrain` now receives `localBbox()` (the world is 1.7 km × 1.4 km, far beyond union's ±420 m default).
- **`src/world/Terrain.ts`** — optional `bounds` argument; grid snapped outward to the 8 m resolution with 40 m padding. Default unchanged.
- **`src/world/StreetGrid.ts` / `Streets.ts` / `RoadMarkings.ts` / `LaneGraph.ts`** — the `cableCar` StreetSpec field was **renamed `transitRail`** (controller-permitted alternative to keeping the banned word); `Lane['kind'] 'cable'` → `'rail'`, `CLS.CABLE` → `CLS.RAIL`. `LaneGraph` lost the "Powell south of Geary" special case. `RoadMarkings.MARK_EXTENT` widened 300 → **600 m** (4096 px ⇒ 29 cm/px) so the markings reach 판교역 at z ≈ +534.
- **`src/life/Traffic.ts`** — the four hard-coded Muni routes and four cable cars are gone. `buildRoutes()` reads `data/routes.json` (`RouteSpec[]`, shape documented in the file header and §3) and builds one clone per record; unknown vehicle id or unknown street ⇒ a warning and skip. `stats().cableCars` → `railVehicles`. Absent file ⇒ one `console.info` and no route vehicles; the 104-strong background fleet on the lane graph is unaffected.
- **`src/life/NavGraph.ts`** — `buildPlaza()` rewritten as a generic 7 m lattice over the plaza bounds (keeping points that stand on a plaza floor patch and clear of colliders, linked ≤ 10.2 m with a ≤ 1.2 m step, perimeter nodes hooked to the sidewalks); it returns immediately when `world.plaza` is null. `inPlaza()` now delegates to `Plaza.contains()`. `BOUNDS` 240 → **420 m**. No street name appears anywhere.
- **`src/life/Pedestrians.ts`** — dropped the `PLAZA` import; bench seats come from `plaza.json.benches`; photo spots are any plaza node 8–40 m from the origin. **Bug found and fixed:** `randomFrom()` called `rng.pick([])` on an empty pool (e.g. `plazaNodes` in a world with no plaza) and crashed the whole pedestrian system — it now returns `-1` for an empty pool.
- **`src/debug/Viewpoints.ts`** — a missing `viewpoints.json` now logs one `console.info` instead of a JSON parse warning.
- **`src/materials/Logos.ts`** — every third-party brand mark deleted (Apple/Nintendo/Starbucks/Rolex/BofA/Chase/… vector helpers, the `LOGOS` table and the whole `ALIASES` map). The text/canvas primitives, `LogoDef`/`LogoCtx` contract and `findLogoKey`/`normalizeBrand`/`LOGO_KEYS` remain; `LOGOS` now holds one neutral `generic` text wordmark. The `Apple Chancery` entry in the cursive font stack was replaced.
- **`src/main.ts`** — tour stops load from `data/tour.json` (union's `TourStop` shape) instead of the hard-coded list; `setMode('tour')` falls back to walk with a `console.info` when there are none; `world.plaza?.` guards on `furniture()`/`setNight()`; `heroExcludeIds()` removed; the default spawn is now tour stop 2 (or (0, 60) facing the origin building) instead of Geary & Powell.
- **`src/debug/Hud.ts`** (title), **`src/world/facade/AutoSpec.ts`** (hotel-name regex de-branded), **`src/world/facade/FacadeSpec.ts`**, **`src/life/Life.ts`**, **`index.html`** — comment/label only.

### Untouched from union
`App.ts`, `Config.ts`, `Assets.ts`, `Qa.ts`, `StudioBridge.ts`, `ReferenceMode.ts`, `SignTest.ts`, `Collision.ts`, `OrbitMode.ts`, `Tour.ts`, `WalkControls.ts`, `Interaction.ts`, `NightLights.ts`, `TimeOfDay.ts`, `Geometry2D.ts`, `MeshUtil.ts`, `Rng.ts`, `Buildings.ts` (already accepted a null plaza polygon), `facade/FacadeBuilder.ts`, `materials/{Library,Signage,Textures,FacadeTextures}.ts`, `life/{PedestrianRig,TrafficLights}.ts`.

## 3. Data-file shapes (all optional except the first three)

`gis.json`, `elevation.json`, `streets_spec.json` are **required**. Every file below is optional; missing ⇒ one `console.info` and the feature is off.

- **`heights_override.json`** — `{ "<osmId>": { heightM?, floors?, style?, name?, hide?, floorH?, bayW? } }` (Task 1's shape; `_README` and any `_`-prefixed key ignored).
- **`tour.json`** — `[{ title, subtitle?, pos:[x,y,z], look:[x,y,z], duration, hold, time? }]` (union's `TourStop`).
- **`routes.json`** — `[{ name, vehicle:"vehicles/<kit id>", kind?:"bus"|"rail"|"car", street:"<StreetSpec.name>", dir:"N"|"S"|"E"|"W", lane?:"transit"|"rail"|"curbRight"|"curbLeft"|"any", startT, sign?, number?, board?, vmax?, stops?:[{ t, dwell? }] }]`. `vehicle` is mandatory (there is no default, which also keeps every SF vehicle id out of `src/`). Not shipped in this task — Task 3 authors it.
- **`plaza.json`** — `{ name?, bounds:{xMin,xMax,zMin,zMax}, terraces?:[{id?,rect:[x0,x1,z0,z1],y,material?}], stairs?:[{rect,from,to,risers?,axis?,material?}], walls?:[[ax,az,bx,bz,y0,y1]], lamps?:[[x,y,z]], benches?:[[x,y,z,yaw]], trees?:[[x,y,z,kitId?]], uplights?:[[x,y,z]], cafeTables?:[{rect,y,spacing?}] }`. Not shipped (Pangyo has no plaza in this bbox).
- **`hero.json`** — `[{ osmId, module, yaw?, footprintFit? }]`. Not shipped (Task 4).
- **`viewpoints.json`**, **`storefronts.json`** — unchanged from union, verified optional.
- **`facades/index.json`** — `{ "files": [] }` shipped so the façade loader has a valid (empty) index.

`tools/geo/sync_data.mjs` (Task 1's) already copies `tour/routes/viewpoints/storefronts/plaza/hero.json` and the `facades/` directory when present — no change needed.

## 4. `tour.json` — values and probe results

Six stops, local metres, `x` east / `z` south / `y` up. Terrain: origin ground `y = 0.12`, 판교역로 corner `+0.51`, 판교역 area `+11.3 … +12.6`, the west ridge at (−260, 260) `+10.65`.

| # | title | pos | look | dur/hold | time | probe (`clearance 1.0`) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | NCSOFT R&D Center | `[40, 140, 220]` | `[0, 20, 0]` | 7/3 | day | `blocked:false, ground 1.05, structure:false` |
| 2 | NC 정문 | `[0, 0.5, 44]` | `[0, 24, 0]` | 7/3 | – | `blocked:false, ground −1.22` (1.7 m above the south forecourt) |
| 3 | 판교역로 코너 | `[90, 2.2, 0]` | `[95, 2, 220]` | 7/3 | – | `blocked:false, ground 0.51` |
| 4 | 판교역로 남행 | `[85, 7.7, 200]` | `[110, 8, 460]` | 8/3 | – | `blocked:false, ground 1.69` (6 m over the carriageway) |
| 5 | 판교역 | `[168, 22, 500]` | `[200, 14, 545]` | 7/4 | – | `blocked:false, ground 11.26` |
| 6 | 판교 야경 | `[-260, 90, 260]` | `[0, 30, 0]` | 9/5 | night | `blocked:false, ground 10.65` |

Adjustments made after probing the brief's starting values: stop 2 moved from `z 55` to `z 44` and dropped to eye height (`z 30` is blocked by the NC podium, top +7.45); stop 3's y raised to 2.2 (ground +1.7); stop 4's y set to ground + 6 as briefed; stop 5's `look` raised from y 5 to y 14 because the ground there is at +12 (the original aimed under the terrain).

Straight-line legs between consecutive stops were probed at 21 samples each: legs 1→2 and 3→4 are clear; legs 2→3, 4→5 and 5→6 clip building massing (a straight line from the NC forecourt to the 판교역로 kerb goes through the block, and the 판교역로 corridor has 삼성화재 판교사옥 (h 59 m) overlapping the fitted carriageway near z ≈ 223). Stops themselves are the Task 2 requirement; Task 3 runs the studio's collision check on the actual spline and fixes the path.

## 5. Verification

```
$ npx tsc --noEmit          # rc=0, no output

$ npx vitest run
 ✓ test/geo.test.mjs (21 tests) 14ms
 ✓ test/boot.test.mjs (7 tests) 9739ms
   ✓ pangyo-technovalley boots > renders tour stop 1 to docs/boot.png 1796ms
 Test Files  2 passed (2)
      Tests  28 passed (28)
   Duration  13.75s

$ node tools/qa/studio_bridge_test.mjs
{"res":{...,"ok":true,"data":true},"pos":{"eye":[10,50,10],...,"fov":50}}
{"bad":{...,"ok":false,"error":"unknown cmd nope"}}
{"res2":{...,"ok":true},"pos2":{"eye":[10,50,10],...}}
PASS studio bridge
```

`test/boot.test.mjs` (vitest, 400 s per-test timeout) uses `launchWorld({ world:'pangyo-technovalley', port:5175 })` from `studio/server/render/browser.mjs` and asserts: `WORLD_PORTS['pangyo-technovalley'] === 5175`; `window.__twin.ready` with **zero page errors**; the `world`/`props`/`vegetation` scene groups exist; `gis.buildings.length ≥ 300` (actual **564**) and `streetSpecs.length > 0` (actual **23**); the NC building `way/694434545` is at the origin (< 1 m) with `heightM === 58`; `probePath` returns `blocked:false` for all six tour positions; and it writes a 1280×720 `docs/boot.png` (> 50 kB).

**Grep gate** — `grep -rniE "powell|geary|stockton|dewey|macy|westin|apple|nintendo|union square|maiden|sutter|kearny|o'farrell|cable ?car|muni" pangyo-technovalley/src --include=*.ts` yields exactly two hits, both substring false positives:
- `src/debug/SignTest.ts:52` — three.js's `setFrom**mUni**tVectors`;
- `src/world/World.ts:161` — the word `phar**macy**` in the storefront-category regex.

No `cableCar` field survives (renamed `transitRail`). Run over the whole of `src/` (including data) adds only `macy` ×12 in `gis.json`/`osm_raw.json`, again from `pharmacy` in OSM tags.

**Live smoke (`?life=1`, GPU, 4 s):** 220 pedestrians (198 walking / 19 waiting at signals / 3 looking), 97 vehicles moving, 19 signalled nodes with 4 heads, 1330 nav nodes (322 pruned as unreachable), 474 lane links, 0 page errors, `msUpdate` 0.2 ms. Tour mode drives the camera (59 m of travel in 2.5 s from stop 1, HUD title updates).

**`docs/boot.png`** (1280×720, 1.2 MB, tour stop 1, `time: day`, fov 50): looking north-west from 140 m over 판교역로 — SRTM terrain with the hills on the skyline, the glass-façaded NCSOFT R&D Center and its podium centre-frame at the origin, 판교역로 running bottom-right with painted lane lines, centre line, crosswalks and stop bars, sidewalks and kerbs, street trees and lamp masts along both kerbs, and the surrounding blocks (유스페이스/H스퀘어/안랩 and the residential towers north) as façaded and massed buildings. 3.66 M triangles, 367 draw calls.

## 6. Other changes

- `studio/server/render/browser.mjs`: one additive line — `'pangyo-technovalley': 5175` in `WORLD_PORTS`. Nothing else in `studio/` was touched.
- `pangyo-technovalley/README.md`: short stub (run/ports, frame, the data-file table above, OSM/SRTM attribution). Task 3 completes it.
- The dev server (`npx vite --port 5175 --strictPort`) is left running for the controller.

## 7. Deviations from the brief

1. **`cableCar` renamed `transitRail`** rather than kept — the controller offered this alternative; every consumer (`StreetGrid`, `Streets`, `RoadMarkings`, `LaneGraph`) was updated consistently, and `Lane['kind']`/`CLS` follow (`'rail'` / `CLS.RAIL`, `stats().railVehicles`).
2. **`Plaza.ts` was rewritten, not merely guarded.** Keeping union's 265 lines of Union Square geometry behind an `if` would have left Dewey Monument and the SF terrace levels in `src/`, which the grep gate and the spec's generalization rule forbid. The replacement is a documented, data-driven module; it has no data to exercise it in this world (see concerns).
3. **`RoadMarkings.MARK_EXTENT` widened to 600 m** (not in the brief) — otherwise no road markings exist south of z = 300, i.e. none at 판교역, which tour stops 4–5 look at. Resolution drops to 29 cm/px.
4. **`NavGraph.BOUNDS` 240 → 420 m** and prop extent ±620 m — union's numbers are sized for a 4-block world.
5. `routes.json` is **not** shipped (the brief allows it); the absent-file path is exercised and verified instead.
6. `docs/boot.png` is written by the test at `time: day` (tour stop 1's own `time`), not the launcher's `sunset`.

## 8. Concerns

1. **`Plaza.ts` and the NavGraph plaza lattice are untested at runtime** — no world in the repo ships a `plaza.json`. They typecheck and the null path is exercised everywhere, but the construction path has never run. If a plaza is ever authored, expect to iterate on it.
2. **Fitted-street vs. building overlap.** 판교역로 is a curved road approximated as a straight axis-aligned strip 29.25 m wide; near z ≈ 223 삼성화재 판교사옥's massing overlaps the carriageway, and the straight tour legs 2→3, 4→5, 5→6 pass through massing. Task 3's collision check + path fix is where this gets resolved; a later data pass could also split long streets into per-block specs.
3. **`lanes` clamped 1→6** means 판교로/판교역로 (OSM `lanes: 9`) render six lanes across a 29.25 m carriageway (4.9 m lanes) — visually wide. Worth revisiting in `build_streets.mjs` (Task 1's file) rather than in the runtime.
4. **322 of 1330 nav nodes are pruned as unreachable** (24 %). Pedestrians still work, but some fitted streets are isolated islands because their `from/to` extents do not reach a crossing. Worth a look in stage 3's life pass.
5. **`public/assets/models/retail/apple_*.glb` and `nintendo_*.glb` remain** in the copied kit (48 files) and in `manifest_retail.json`. They are unreferenced dead weight now that `src/interiors/` is gone; they are data, not `src/`, so the gate passes, but Task 3/4 may want to prune them and re-emit the manifest.
6. **`Streets.ts` still contains union's unreachable code** after the `continue;`/`return;` in `buildStreet`/`buildIntersection` (markings moved to `RoadMarkings.ts` upstream). Carried over verbatim; not worth diverging from the reference world for.
7. **`manifest missing varco` warning on every boot** — expected (no VARCO manifest exists yet) and identical to union, because `Assets.ts` is kept byte-identical per the ruling.

---

# Fix round 1 (review findings F1–F5)

Status: **DONE**. `tsc --noEmit` clean; `vitest run` 38/38 (geo 21 + footprint 7 + boot 10); `studio_bridge_test.mjs` PASS.

## F1 (Important) — procedural props inside building footprints

**Root cause.** The street model is axis-aligned to the fitted grid bearing, so a kerb line derived from a `StreetSpec`
runs through any building whose real frontage is not parallel to that grid — and nothing checked.

**Fix.** New pure module `src/world/FootprintIndex.ts`:

- `buildFootprintIndex(buildings, cell = 32)` — bucketed grid + per-entry bbox over every `gis.buildings` **and**
  `gis.buildingParts` footprint (682 entries here);
- `isInsideFootprint(x, z, idx, clearance)` — `pointInPolygon` plus a point-to-edge distance test, so the footprint is
  effectively expanded outward by `clearance`;
- `footprintAt(x, z, idx)` — debug/test helper returning the containing osmId.

No three.js, no DOM, so the runtime and the tests share the code.

`Props.ts` builds the index once and vetoes **every** procedural placement through it, before the `.add()`:

| prop | clearance | rejected |
| --- | --- | --- |
| streetlights (masts lean over the kerb) | **1.0 m** | 77 |
| street trees | 0.5 m | 84 |
| benches | 0.5 m | 4 |
| traffic-signal masts (and their hydrant/sign-pole companions) | 0.5 m | 6 |
| parking meters, bins/bike racks/utility cabinets, curb ramps | 0.5 m | (not counted) |

OSM-supplied lamps/trees go through the same veto (this extract has none), so the invariant holds for every placed lamp
regardless of source. Counts are tracked in `props.placement` and logged at boot:

```
[props] placed {"lamps":427,"lampsRejected":77,"trees":441,"treesRejected":84,
                "benches":12,"benchesRejected":4,"signalMasts":42,"signalMastsRejected":6}
```

(The tree numbers differ from the reviewer's 182/1267 because the rng thinning runs before the veto — 525 candidates
reach it, not 1267. The lamp count 77 > the reviewer's 69 because the 1.0 m clearance band also rejects lamps standing
hard against a wall, not only those strictly inside.)

**Reviewer's three examples** are now detected and not placed — verified directly against the shipped `gis.json`:

```
(19, -155.7)   inside=true  building=way/470964733   (투썬월드빌딩)
(49, -155.7)   inside=true  building=way/470964733
(-65.9, -35.6) inside=true  building=way/694434544   (NC podium)
```

**Tests.**
- `test/footprint.test.mjs` (7 tests) — two synthetic footprints (a 20x10 box and a concave L), covering inside/outside,
  the L's notch (outside despite being inside the bbox), the clearance band at 0.0/0.5/1.0 m, `footprintAt`, a far-away
  point, and a real-data case against `gis.json` (682 entries, the origin is inside the NC tower/podium, an empty field
  to the south-west is in nothing).
- `test/boot.test.mjs` gained two assertions that run the **same helper** on the JSON side against the positions read
  out of the page (`__twin.props.lampPositions`, `__twin.world.treeSpots`): *no placed lamp* is inside a footprint at
  1.0 m clearance (427 lamps checked), *no placed tree* at 0.5 m (441 trees). Failures print the offending coordinates
  and the containing osmId.

## F2 (Minor) — height-resolution order documentation

Code unchanged (`Buildings.ts:68` `ov.heightM ?? b.heightM ?? …` — the curated override wins at render time, as
intended); `resolveHeight()` in `build_gis.mjs` also unchanged. Only the docs were wrong. Now corrected in three places:

- `src/data/recon/heights_override.json._README` — replaced the single (wrong) `heightResolutionOrder` array with an
  explicit `twoLayers` / `buildTimeDefault` / `runtimeOverride` block naming the consumer, the order and the *why* for
  each layer; also documents `hide`, `floorH`, `bayW`. Re-synced to `public/data/`.
- `test/geo.test.mjs` — the describe block is renamed `build_gis.resolveHeight (build-time default order)` with a
  comment stating that the runtime order is deliberately reversed and pointing at the `_README`.
- `README.md` — a new "Building heights — two layers, two precedences" table.

## F3 (Minor) — `facades/index.json` and `storefronts.json` via `optionalData`

Both now go through the shared helper, so a missing file logs one `console.info` like everything else. Verified at
boot (`storefronts.json` is absent here):

```
info: [world] no data/plaza.json — plaza disabled
info: [world] no data/hero.json — hero modules disabled
info: [world] no data/storefronts.json — storefront census disabled
info: [world] no data/routes.json — transit routes disabled
info: [viewpoints] no data/viewpoints.json - reference viewpoints disabled
```

(`facades/index.json` does exist — the empty `{ "files": [] }` — so it logs nothing, which is the point.)

## F4 (Minor) — unreferenced retail GLBs removed

`git rm`'d 26 files: `public/assets/models/retail/apple_*.glb` (16) and `nintendo_*.glb` (10), and deleted their
26 entries from `manifest_retail.json` (49 → 23; the reviewer's "52" appears to have counted files + entries).
`grep -rniE "apple_|nintendo_" src --include=*.ts` is empty. Asset store 5.7 MB → 5.3 MB.

Verified with a fresh page that listens on `pageerror`, `requestfailed` and every 4xx/5xx response for `*.glb|*.json`:
**0 page errors, 0 failed requests**, manifest integrity re-checked in Node (23 entries, 0 missing files, 0 orphan
GLBs on disk). The only remaining manifest warning is `manifest missing varco`, which is expected and matches union.

> **Flagged, not actioned (outside the stated scope):** `retail/char_mario`, `char_luigi`, `char_link`, `char_isabelle`,
> `char_pikmin_{red,blue,yellow}`, `char_kirby`, `char_toad` (9 GLBs) are also unreferenced Nintendo-IP character
> models left over from the deleted interiors. The instruction named `apple_*`/`nintendo_*` only, so I left them; they
> are the same licensing smell and I would recommend removing them in the next pass — it is a one-liner on request.

## F5 (Minor) — load time and render cost

Added `const t0 = performance.now()` at the top of `main()` and, once everything is built,
`console.info('[pangyo] load', loadMs, 'ms')`; `loadMs` is also exposed on `__twin` (inside the untyped extras object,
so `Qa.ts` stays byte-identical). The boot test logs the whole picture:

```
[boot] in-page load 4878 ms, launchWorld wall clock 8182 ms, 3.31 M tris, 369 draw calls, 47 textures
```

| measurement | `?life=0` (studio contract) | `?life=1` |
| --- | --- | --- |
| in-page load (`main()` start → ready) | **4.9 s** (4878 / 5294 ms over two runs) | 4.2 s |
| `launchWorld` wall clock (browser launch → `__twin.ready`) | **8.2 s** (8182 / 8858 ms) | — |
| triangles | 3.31 M | 5.19 M |
| draw calls | 369 | 718 |
| textures | 47 | 46 |

The ~3.3 s gap between the two timings is Chromium launch + navigation + module transform, not world building.

## Files touched in this round

```
pangyo-technovalley/src/world/FootprintIndex.ts           (new)
pangyo-technovalley/src/world/Props.ts                    (footprint veto + placement counters + boot log)
pangyo-technovalley/src/world/World.ts                    (F3)
pangyo-technovalley/src/main.ts                           (F5)
pangyo-technovalley/src/data/recon/heights_override.json  + public/data copy   (F2)
pangyo-technovalley/README.md                             (F2)
pangyo-technovalley/test/footprint.test.mjs               (new, F1)
pangyo-technovalley/test/boot.test.mjs                    (F1 + F5 assertions)
pangyo-technovalley/test/geo.test.mjs                     (F2 comment/description)
pangyo-technovalley/public/assets/models/retail/{apple_*,nintendo_*}.glb   (deleted, F4)
pangyo-technovalley/public/assets/models/manifest_retail.json              (F4)
pangyo-technovalley/docs/boot.png                         (regenerated)
```

`union-square-sf/` and `kyoto-higashiyama/` untouched; nothing in `studio/` changed this round; the :5175 dev server
was left running throughout.

## Concerns after this round

Concerns 1–4, 6 and 7 from the original report stand (untested plaza path; fitted-street vs. building overlap on
판교역로; `lanes` clamped 9→6; 322/1330 nav nodes pruned; union's dead code in `Streets.ts`; the `varco` manifest
warning). Original concern 5 is resolved for `apple_*`/`nintendo_*` and reduced to the `char_*` note above.

One new observation: 77 of 504 lamp candidates and 84 of 525 tree candidates being rejected is itself a measure of how
far the axis-aligned street fit diverges from the real frontages — the veto makes the result correct, but a per-block
street split in `build_streets.mjs` would put those props back on the real kerb instead of dropping them. Worth
considering in the stage-3 data pass.

---

# Fix round 2 (re-review: F1 residual)

Status: **DONE**. `tsc --noEmit` clean; `vitest run` 39/39 (geo 21 + footprint 7 + boot 11); `studio_bridge_test.mjs` PASS.

## The residual

Fix round 1 routed the *procedural* placements and the OSM `trees`/`lamps` bins through `inBuilding()`, but the three
remaining OSM bins — `gis.hydrants`, `gis.benches`, `gis.bollards` (`Props.ts` ~:141-143) — were still added on the
`inBounds()` test alone. They were also invisible to QA: none of their positions was exposed on `props`, so the boot
test could not have caught a bad one.

## Fix

- All three now go through the same `inBuilding(x, z)` veto at the default **0.5 m** clearance, in the same
  `if (!inBounds) continue; if (inBuilding) { rejected++; continue; }` shape as every other prop.
- `props.placement` gained `hydrants` / `hydrantsRejected` and `bollards` / `bollardsRejected`; the OSM benches now
  feed the existing `benches` / `benchesRejected` counters, so every category reports placed *and* rejected.
- New exposed arrays on `Props` — `benchPositions`, `hydrantPositions`, `bollardPositions` (ground-plane `[x, z]`) —
  filled by **both** sources: the procedural origin-block bench loop and the OSM bins, plus the signal-corner hydrant
  fallback (which is emitted only when `gis.hydrants` is empty, and which round 1 already vetoed but did not count).

Boot log after the change:

```
[props] placed {"lamps":427,"lampsRejected":77,"trees":441,"treesRejected":84,
                "benches":15,"benchesRejected":4,"signalMasts":42,"signalMastsRejected":6,
                "hydrants":20,"hydrantsRejected":0,"bollards":0,"bollardsRejected":0}
```

`benches` 12 → **15** = 12 procedural + the 3 OSM benches this extract carries
(`node/5091358637` (577.0, 518.0), `node/5091728122` (462.1, 240.5), `node/5091732922` (457.3, 251.3)) — all three are
in the open and pass the veto. `hydrants` 20 are all signal-corner fallbacks (`gis.hydrants` is empty, as is
`gis.bollards`), so those two `*Rejected` counters are legitimately 0 on this data; the code path is the one that
matters and it is now identical to the others.

## Test

`test/boot.test.mjs` gained an 11th case — *"places no bench, bollard or hydrant inside a building footprint"* — which
reads `props.benchPositions` / `bollardPositions` / `hydrantPositions` out of the page and re-runs the same
`buildFootprintIndex` / `isInsideFootprint` / `footprintAt` helpers JSON-side against the shipped `gis.json`
(682 footprints) at 0.5 m clearance. Failures print the offending coordinate and the containing osmId. It also asserts
each exposed array length equals its `props.placement` counter (so a future placement that forgets to record its
position fails the test rather than escaping it) and that benches are actually being placed.

The world's exposed prop surface is now `lampPositions`, `plazaLampPositions`, `benchPositions`, `hydrantPositions`,
`bollardPositions`, `world.treeSpots` — and every one of them is asserted footprint-clear by the boot test.

## Files touched

```
pangyo-technovalley/src/world/Props.ts        (veto + counters + exposed positions)
pangyo-technovalley/test/boot.test.mjs        (new assertion)
```

Nothing else changed; `union-square-sf/`, `kyoto-higashiyama/` and `studio/` untouched; :5175 left running.
