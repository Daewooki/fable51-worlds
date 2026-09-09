# Task 5 report — stage 3: life systems, routes, ground fill, QA

Commit: `72b483b feat(pangyo): life systems and QA report (stage 3)` (branch `main`, tree clean).
Deliverable report: `pangyo-technovalley/FINAL_QA_REPORT.md`.

## Ruling 1 — routes

`src/data/recon/routes.json` (+ synced to `public/data`), 6 routes, all using kit ids that already exist
in `public/assets/models/manifest_vehicles.json` (`vehicles/bus_muni`, `vehicles/bus_tour` — real buses,
so no `kind:'bus'` fudging with cars was needed):

| route | vehicle | street | dir | lane | startT | stops |
|---|---|---|---|---|---|---|
| 9007 판교역 방면 | bus_muni | 판교역로 | S | curb | −470 | −270 (H스퀘어), −11 (엔씨.안랩), 246 (동안교), 522 (판교역서편) |
| 9007 판교테크노밸리 방면 | bus_muni | 판교역로 | N | curb | 540 | same, reversed |
| 101 대왕판교로 남행 | bus_tour | 대왕판교로 | S | curb | −800 | −533 (삼평교), −60 (NC 블록), 340 |
| 101 대왕판교로 북행 | bus_tour | 대왕판교로 | N | curb | 500 | same, reversed |
| 3100 판교로 동행 | bus_muni | 판교로 | E | curb | −580 | −240 (대왕판교로), 120 (판교역로), 500 |
| 3100 판교로 서행 | bus_muni | 판교로 | W | curb | 780 | same, reversed |

- Stop coordinates are the OSM `public_transport=platform` nodes where this bbox has them (refs 07479/07034
  H스퀘어, 07630/07631 엔씨.안랩, 07450 동안교, 07407 판교역서편, 07498 삼평교); route numbers are those
  platforms' real `route_ref` tags. 대왕판교로 and 판교로 have no OSM platform near the NC block, so those two
  stops sit mid-block at the named junction — stated in the file's own `_README` record and in the report.
- **Runtime verification:** `Traffic.routeWarnings` is `[]` and `routeVehicles`/`routeVehiclesAlive` are both 6
  after 30 s (asserted in `test/life.test.mjs`; also printed by the QA script). Every route resolved ≥ 3 stops.
- `vmax: 11.5` m/s. The lane graph caps block links at `SPEED = 11.2` m/s (≈ 40 km/h), so 11.2 is what they
  actually run — noted in the world README rather than silently accepted.
- Two small, generic changes to `Traffic.ts` to make this work: a `curb` lane picker (the kerbside lane *for
  the direction of travel* — `curbRight`/`curbLeft` are fixed lane indices and pick the median lane on the
  other carriageway of a two-way street), and route records whose `name` starts with `_` are skipped as
  comments (JSON has no comments; the file carries its own provenance note).

## Ruling 2 — traffic lights

`TrafficLights` did **not** consume the OSM `signals` bin: it signalised every crossing that
`StreetGrid.intersections()` produced (`signal: !(a.pedestrian || b.pedestrian)` = all 19). `Props` had its own
private copy of an OSM-snap rule for the masts, so the three consumers could disagree.

Fixed by deciding once: `StreetGrid.applyOsmSignals(crossings, gis.signals)` is called from `World.build()`
right after `new Streets(...)` — each `highway=traffic_signals` node snaps to the nearest crossing within 30 m,
plus a major×major (≥ 12 m) fallback, and writes `Intersection.signal`. `TrafficLights` (its crossing list),
`LaneGraph` (`Node.signal`, which also gates right-turn connectors) and `Props` (mast placement, its duplicate
rule deleted) now all read that one field. `World.signalReport` exposes the counts.

- **14 of 19** crossings signalised: 6 from the 58 OSM nodes, 8 from the fallback.
- Second bug found and fixed: `TrafficLights.attachHeads()` bound a mast to a crossing only within a **fixed
  14 m**. On this world's arterials (판교역로 29.25 m, 대왕판교로 19.5 m) the corner masts stand 15–16 m out, so
  only **4** of 42 masts were ever driven — the lamps never changed colour on the big junctions. The radius is
  now `hypot(a.width/2 + a.sidewalk, b.width/2 + b.sidewalk) + 3`; **42/42** masts are driven.
- **Smoke (ruling 2, in both the QA script and `test/life.test.mjs`):** 60 s of simulated time in 0.1 s steps,
  sampling every route vehicle; a stop counts only when `v.v < 0.02`, the vehicle is within 15 m of its link's
  `endNode`, that node is signalised and its light for the vehicle's axis is **not** green. Result: **287 stopped
  frames across 3 of 6 routes**, first at t = 25.8 s on 판교역로 at junction (85.1, −148.4) on red. Background
  traffic was also observed stopped at red on 56 of the 60 sampled steps.

## Ruling 3 — ground fill

New `src/world/BlockFill.ts` + a new `landuse` bin in `gis.json`.

**Data.** `osm_raw.json` had `way["leisure"]` but no `landuse`, no `amenity=parking`, no water. Rather than a
full `--refresh` (which would rewrite the whole cached dump), `fetch_osm.mjs` gained `landuseClauses()` /
`landuseQuery()` and a **`--augment`** mode that fetches only the new tags and merges by `type/id`, so every
element that was already in the dump is byte-identical. 196 new elements, 1.29 → 1.68 MB. `build_gis.mjs`
gained `landuseClass(tags)` → `{kind, surface, priority}` and a section 7b that emits closed rings ≥ 20 m² as
`gis.landuse`. **232 polygons**: 80 paving, 20 paving_dark, 98 grass, 24 soil, 10 water.

**Runtime.** Materials used are existing library names — `pavers`, `concrete_dark`, `grass`, `soil` — plus one
addition, `water`, registered at the bottom of *this world's* `src/materials/Library.ts` only. Per-surface Y:
0.020 / 0.028 / 0.036 / 0.044 / 0.052 m above terrain, so nested areas (a pitch inside a park inside the
industrial block) never z-fight and everything stays under the 0.15 m kerb.

Fallback: `blockCells()` builds the rectangles between consecutive fitted ns/ew centrelines, inset by half the
street width + its sidewalk; a bucketed point-in-polygon index skips the cells any landuse polygon already
covers, and uncovered runs are merged along z. **189 OSM areas + 721 fallback patches**.

Two things that had to be got right (both were visibly wrong first):

1. **Earcut, not fans.** `Geometry2D.ts` has no triangulator. The first version grid-clipped each ring with
   Sutherland–Hodgman and fan-triangulated the fragments — correct only for convex subjects, so the 운중천
   ring (264 points) filled a lake. Now each patch is triangulated once with `THREE.ShapeUtils.triangulateShape`
   (three's bundled earcut, holes included) and the **triangles** are grid-clipped; SH on a convex triangle is
   exact and its fan is correct. Verified numerically: rendered water 52,203 m² vs 71,745 m² of source polygon
   (the difference is outside the ±620 m box or under a street).
2. **Street corridors are cut out exactly.** Otherwise the river polygons paint straight across 판교역로.
   Each 10 m cell is split along the corridor edges crossing it and the pieces inside a corridor are dropped,
   so the kerb line is exact rather than stair-stepped.

Budget: **5 draw calls** (one merged mesh per surface, ≤ 40 required), ~83 k triangles, 10 m grid so the fill
follows the SRTM terrain instead of sinking into it.

## Ruling 4 — pedestrians

- 220 agents, **219–220 of them on a fitted sidewalk** at any sample (the rest are mid-crosswalk), **0 NaN**
  at 0 s and after 30 s. Asserted in `test/life.test.mjs` (> 80 % on sidewalk, 0 NaN, ≥ 20 alive).
- Pedestrians spawn only on NavGraph nodes, which this world builds purely from the fitted streets' sidewalks
  (there is no `plaza.json`), so the "sidewalks only" requirement holds by construction.
- **Station connectivity: the problem was not pruning.** `NavGraph.BOUNDS` was 420 m and 판교역 sits at
  z ≈ 530, so the station end of 판교역로 was never in the graph at all — zero nodes, not disconnected ones.
  Raised to **620 m** (matching `Props.EXTENT`). Result: 2,254 nodes / 2,278 edges, **240** pruned as
  unreachable (down from 322 — the extra sidewalks joined some previously isolated fragments), and **26 live
  nodes within 120 m of the station**. No plaza patch or synthetic edge was needed; the forecourt is reached
  over the real fitted sidewalks of 판교역로 and 대왕판교로606번길. The 240 remaining dead nodes are all in
  outlying corners (동판교로266번길 at z ≈ −676, the 봇들마을 apartment loops) whose streets do not touch the
  main grid inside the box.

## Ruling 5 — viewpoints

`src/data/recon/viewpoints.json` (+ synced). This world's `src/debug/Viewpoints.ts` reads **lat/lon +
heightM**, so each entry carries **both**: `camera: { x, y, z, lat, lon, heightM, headingDeg, pitchDeg,
fovDegVertical }` (`nc-aerial` also `absoluteY`). lat/lon were produced with the same `localToGeo` maths as
`src/geo/geo.ts`.

| id | camera (x, y, z) | heading / pitch | subject |
|---|---|---|---|
| `nc-entrance` | 0, 3.71, 115 | 354.5° / +14° | NC R&D Center south face + rooftop sign, whole building in frame |
| `nc-aerial` | 40, 140, 220 | 344.2° / −28.2° | tour stop 1, the target-cut opening frame |
| `pangyoro-hsquare` | 101.9, 20.75, −278 | 177.4° / −0.15° | 판교역로 southbound from the H스퀘어 platform |
| `pangyoyeok-plaza` | 186, 14.26, 507 | 205° / +4° | 판교역 forecourt, 신분당선 canopy with the 알파돔 tower behind |

All four are `probePath`-clear at 0.9 m and 1.2 m clearance and `setView(id)` returns true (asserted in the
test). Three of the four had to be re-sited after looking at the first screenshots: the first `nc-entrance`
(z = 44) was 19 m from the podium and filled the frame with it; the first `pangyoyeok-plaza` (148, 480) was
1 m from a façade — "probe clear" is not "has a view", so I scanned candidates for probe-clear **and**
line-of-sight to the subject (`NavGraph.wallHit`) **and** a clear 3 m radius, then eyeballed renders.

Photos are not committed: `.gitignore` gains `pangyo-technovalley/photos/*` with `!.../photos/README.md`, and
that README lists what to capture for each viewpoint and why Kakao/Naver frames must stay local.

## Ruling 6 — QA script and report

`pangyo-technovalley/tools/qa/qa_report.mjs` — reuses `studio/server/render/browser.mjs` `launchWorld`
(`port: 5175`, `extraQuery: '&life=1'`), and:

- probes the four viewpoint cameras, then screenshots each at 1280×720 into `docs/qa/<id>.png`;
- life smoke at 0 s and after 30 s of simulated time (pedestrians, on-sidewalk, vehicles, route vehicles,
  NaN counts, route warnings, nav graph, update cost);
- the 60 s traffic-light smoke above;
- render cost, boot time, page errors;
- writes `FINAL_QA_REPORT.md` and the raw numbers to `docs/qa/qa.json`; exits non-zero if a viewpoint is
  blocked, no route vehicle stopped at red, or the page threw.

`__twin` additions (all additive; `TwinApi` itself unchanged, so the studio contract is untouched):
`stepLife(seconds, dt)` (steps only the life systems in fixed 1/30 s steps — deterministic, frame-rate
independent), `stats().ground` (`BlockFill.stats()`), `stats().signals` (`World.signalReport`), and
`pedNaN` / `pedOnSidewalk` / `routeVehicles` / `routeVehiclesAlive` / `vehicleNaN` / `routeWarnings` in the
existing `lifeStats()`.

One runtime fix was needed to make `extraQuery: '&life=1'` work at all: `launchWorld` always writes
`life=0` into the URL before appending the extra query, and `URLSearchParams.get` returns the **first** value.
`Config` now reads the **last** occurrence of `life`.

Measured numbers in the shipped report: 220 peds (219 on sidewalk) / 100 vehicles / 6 route vehicles alive,
0 NaN; 14 signalised crossings, 42 lamp heads; block fill 5 draw calls / ~83 k tris; whole scene 764 draw
calls / 4.17 M triangles; cold boot 7.6 s, in-page load 4.5 s; 0 page errors. Twelve defects are listed (the
eleven authored ones the controller asked for, incl. the 판교역로 straight fit overlapping 삼성화재/카카오,
the bare east side, dark glass, unsurveyed canopy yaws, OSM-scaled 알파돔 towers, thin façade slivers, plus
straight-fit grid / SRTM terrain / generic façades / no interiors / no storefront census) and one measured
defect (58 OSM signal nodes collapsing onto 6 fitted junctions). Six next steps.

## Ruling 7 — tests

`pangyo-technovalley/test/life.test.mjs`, vitest, 400 s per case: boots with `life=1`, steps 30 s via
`stepLife`, asserts ≥ 20 pedestrians and ≥ 5 vehicles alive, > 80 % of pedestrians on a sidewalk, 0 NaN,
routes resolved == routes.json length with no warnings and every route with ≥ 1 stop, red-light stops > 0,
`signalReport.osmUsed > 0` and `signalled < crossings` (i.e. the OSM wiring is actually applied), the
`blockfill` group present with ≤ 40 meshes / > 50 landuse areas / > 0 block patches, and 4 viewpoints with
finite fields, matching `__twin.viewpoints()`, probe-clear and `setView`-able.

- `npx tsc --noEmit` — clean.
- `npx vitest run` (pangyo package) — **5 files, 59 tests passed** (geo 21, footprint 7, boot 11, hero 10,
  life 10). Tail: `[life] peds 220 (219 on sidewalk) -> 220; vehicles 104 -> 100 (6/6 route); NaN 0+0;
  nav 2254 nodes / 2278 edges; ped update 0.87 ms` and `[boot] in-page load 6116 ms, 3.04 M tris, 361 draw
  calls; props {"lamps":427,...,"signalMasts":42,...}`.
- `studio && npx vitest run test/pangyo.test.mjs` — **4 tests passed** (launch, 2 s previz 60 frames, GLB
  export), so the studio contract still holds.
- `npm run geo` re-run end to end on the augmented dump: reproducible (the only diff in `streets_spec.json`
  was its `generated` timestamp, which I reverted).

## Ruling 8 — target cut

`cd studio && node tools/stage1_targetcut.mjs --port 5196` (studio/ untouched, :5190 untouched). Path check
**clear on the first pass**, no *Fix path*; previz 240 frames @ 1920×1080 in **114.6 s** (0.48 s/frame),
`softwareRender: false`, world load in the iframe 13.5 s. Encoded to
`docs/stage3-target-cut.mp4` (**4.0 MB**, `-crf 28`; the studio's own previz.mp4 is 17.1 MB) plus
`docs/stage3-f120.png` (1280 px). The ground fill is plainly visible where stages 1–2 showed bare white
terrain.

## Deviations / judgement calls

1. **`--augment` instead of `--refresh`.** The brief allowed a `--refresh` fetch for the new tags. A full
   refresh would have rewritten every building and road in `osm_raw.json` for no benefit; `--augment` fetches
   only the ground-cover clauses and merges by `type/id`, so the diff is 196 added elements and nothing else
   moved. The new clauses are also in `overpassQuery()`, so a future `--refresh` gets them too.
2. **`landuse=industrial` renders as `pavers`, not `concrete_dark`.** The single 842,127 m² 판교테크노밸리
   polygon covers the whole valley; in dark concrete the entire frame reads as an asphalt sea, in light pavers
   it reads as the granite public realm Pangyo actually has. The ruling's `paving_dark` is used for the
   fallback block cells, parking and residential, as specified.
3. **`NavGraph.BOUNDS` 420 → 620 m** rather than stitching the station in with synthetic plaza edges. It is
   one constant, it matches `Props.EXTENT`, and it fixes the cause (the station was outside the graph) rather
   than the symptom. Cost: the "far" pedestrian pool now spreads over a bigger area, so the outskirts are
   thinner; the < 80 m "near" pool around the NC block is unchanged.
4. **`Config.noLife` now reads the last `life` value.** Without this, `launchWorld(..., extraQuery:'&life=1')`
   silently produced a world with no life at all, because the launcher's own `life=0` comes first.
5. **QA screenshots keep the on-screen viewpoint label** (the HUD toast from `setView`). It identifies the
   frame in the report; `ui=0` already hides the toolbar and crosshair.
6. **The stage-3 previz has no moving agents.** The studio always opens a world with `life=0` (world contract,
   `studio/server/render/browser.mjs`), and studio/ is off limits for this task. The cut therefore shows the
   ground cover but not the traffic; the traffic is evidenced by `docs/qa/*.png`, `FINAL_QA_REPORT.md` and
   `test/life.test.mjs`. Flagged in the world README.
7. **`Props` lost its private signal rule** (and the now-unused `MAJOR_WIDTH`) in favour of the shared
   `Intersection.signal`. Behaviour is identical where the two agreed; they can no longer diverge.

## Concerns

- **Only 3 of 6 routes were seen stopping at a red light in the 60 s window**, and one of them (3100 판교로
  동행, 247 of the 287 stopped frames) is essentially parked at a red for a large part of the window. That is
  the signal cycle (60 s, 25 s green per axis) meeting a route whose startT puts it at a stop bar early; it is
  not a stall (its `maxSpeed` is 11.18 m/s and it does serve stops on longer runs). Worth a look if the routes
  are ever used for a shot.
- **Signal placement is coarse by construction.** 58 OSM signal nodes collapse onto 6 of the 19 fitted
  crossings because the straight-fit grid has far fewer junctions than the real network. Listed as a measured
  defect; the real fix is polyline street fitting.
- **The water surface is flat opaque colour.** OSM's 운중천/금토천 ribbons and the 봇들저류지 are large and
  read as a canal rather than a stream at aerial distance. Honest to the data, but it is the most
  conspicuous thing in the aerial frame after the NC building.
- **`docs/boot.png` and `docs/stage2-nc.png` were regenerated** by the boot/hero tests (they now include the
  ground fill) and are committed with this change. That is intended, but it means the stage-2 screenshots in
  the repo are no longer byte-identical to what stage 2 produced.
