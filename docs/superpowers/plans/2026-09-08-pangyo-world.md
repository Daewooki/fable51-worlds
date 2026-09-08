# Pangyo Techno Valley World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pangyo-technovalley/`, a third MV Studio world around the NCSOFT R&D Center, from OSM + SRTM data using a generalized copy of the union-square-sf runtime, in three stages, each ending with a rendered previz.

**Architecture:** Data tools fetch OSM/elevation and build `gis.json` + `streets_spec.json`; a copy of the union-square-sf Three.js runtime is generalized so place-specific content is data (streets, tour, routes, hero modules, plaza optional); the studio registers the world on port 5175. Stage 2 adds hero modules; stage 3 adds life, tour and a QA report.

**Tech Stack:** Node 22 ESM tools (no deps), Overpass API, OpenTopoData/Terrarium, Vite + TypeScript + three 0.185 runtime, vitest, Playwright (via studio), optional Blender-as-a-module (`bpy` 3.6 on Python 3.10).

**Spec:** docs/superpowers/specs/2026-09-08-pangyo-world-design.md

**Nature of this plan:** most tasks generalize existing code rather than write new code from scratch, so the plan states exact requirements, interfaces, file paths and verification commands, and points at the files whose code is to be copied/adapted. Implementers must read those files; nothing here is to be invented where the reference exists.

## Global Constraints
- `union-square-sf/` is not modified by any task (reference world). `kyoto-higashiyama/` is not touched.
- Repo path contains a space: derive paths from `import.meta.url` with `fileURLToPath`, never `.pathname`.
- World contract for the studio (must hold, verified by `studio/test/*`): `?qa=1&ui=0&studio=1&life=0&time=&q=` query, `window.__twin` (`ready`, `setTime`, `freeze`, `setMode`, `renderOnce`, `pos`, `app`, `world.collision.floorAt`, `world.terrain.heightAt`, `probePath`), the postMessage StudioBridge, scene groups named `world`, `props`, `vegetation`.
- Origin: OSM way 694434545 centroid (37.39936, 127.10885); bbox S 37.3950 W 127.0990 N 37.4065 E 127.1170; dev port 5175.
- No SF names anywhere in `pangyo-technovalley/src` (grep for `Powell|Geary|Stockton|Dewey|Macy|Westin|Apple|Nintendo|Union Square` must be empty). Place-specific content lives in `src/data/recon/*.json`; a missing optional file turns the feature off.
- Cached inputs (`osm_raw.json`, `elevation.json`) are committed so the world builds offline; fetch tools skip existing files unless `--refresh`.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01YVFHxVXL3RK8YH1YgLwKZq`. Never `git add .`; list paths.
- OSM attribution (© OpenStreetMap contributors, ODbL) in the world README and `gis.json.meta`.

---

### Task 1: GIS data pipeline (fetch OSM + elevation, build gis.json, fit streets)

**Files:**
- Create: `pangyo-technovalley/package.json` (name `pangyo-technovalley`, scripts `geo`, `dev`, `test`; deps copied from `union-square-sf/package.json`), `pangyo-technovalley/tools/geo/fetch_osm.mjs`, `fetch_elevation.mjs`, `build_gis.mjs`, `build_streets.mjs`, `sync_data.mjs`, `pangyo-technovalley/src/geo/geo.ts`, `pangyo-technovalley/src/data/recon/{osm_raw.json, elevation.json, gis.json, streets_spec.json, heights_override.json}`, `pangyo-technovalley/test/geo.test.mjs`, `pangyo-technovalley/vitest.config.ts`.
- Reference (read, copy, adapt): `union-square-sf/tools/geo/build_gis.mjs`, `sync_data.mjs`, `src/geo/geo.ts`, `src/data/recon/elevation.json` (shape), `src/world/World.ts` `makeStreetSpecs()` and `src/world/Streets.ts` `StreetSpec` (target shape for `streets_spec.json`).

**Interfaces:**
- Produces: `src/geo/geo.ts` exporting the same constants/functions as union's (`ORIGIN_LAT/LON/ELEVATION_M`, `GRID_BEARING_DEG`, `GRID_NORTH_BEARING_DEG`, `M_PER_DEG_LAT/LON`, `BBOX_WGS84`, `geoToLocal`, `localToGeo`, `elevToLocalY`, `compassToYaw` if union has it); `gis.json` with the union shape (`meta, origin, gridBearingDeg, bbox_local, intersections, buildings, buildingParts, streets, pois, trees, lamps, signals, crossings, hydrants, benches, bollards`; no `plaza`/`tramTracks` required); `streets_spec.json` = `{ meta:{ generated, method, dropped:[…] }, streets: StreetSpec[] }` where `StreetSpec` matches `union-square-sf/src/world/Streets.ts` (`name, axis:'ns'|'ew', c, from, to, width, sidewalk, lanes, oneway:'N'|'S'|'E'|'W'|null, parking:{left,right}, centerLine?, surface?, pedestrian?`).
- `npm run geo` = fetch (cached) → build_gis → build_streets → sync_data.

- [ ] **Step 1: Failing tests** (`test/geo.test.mjs`): (a) `geoToLocal(ORIGIN_LAT, ORIGIN_LON)` ≈ (0, 0) and `localToGeo` round-trips a point 500 m away within 0.5 m; (b) `foldToAxis(bearingDeg)` from `build_streets.mjs` maps 3°, 92°, 181°, 268° → `'ew','ns','ew','ns'` relative to a grid bearing of 0 and drops 45°; (c) `resolveHeight()` from `build_gis.mjs` prefers `height` → `levels×3.6+1` → override → area default; (d) after `npm run geo` on cached inputs, `gis.json` has ≥ 300 buildings, a building with `osmId === 'way/694434545'` whose `centroid` is within 1 m of (0,0) and `heightM === 58`, and `streets_spec.json` contains `판교역로` (axis `ew`) and `대왕판교로` (axis `ns`).
- [ ] **Step 2: `fetch_osm.mjs`** — Overpass query for the bbox + 60 m margin: `way["building"]`, `relation["building"]`, `way["highway"]`, `node["highway"~"street_lamp|traffic_signals|crossing"]`, `node["natural"="tree"]`, `node["amenity"~"bench|fire_hydrant|..."]`, `node["barrier"="bollard"]`, `node/way["shop"|"amenity"|"office"|"railway"="station"]` with `out geom`; 3 retries with backoff; writes `osm_raw.json`; skips if present unless `--refresh`.
- [ ] **Step 3: `fetch_elevation.mjs`** — 25 m grid over the bbox (rows/cols computed from `M_PER_DEG_*`), batches of 100 to `https://api.opentopodata.org/v1/srtm30m?locations=…` at ≤ 1 req/s; on failure for a batch, Terrarium tiles (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/{x}/{y}.png`, decode PNG with a minimal inflate — use `node:zlib` + a small PNG reader — height = (R×256+G+B/256) − 32768); output the union recon shape; also `intersections`/`buildingCentroids` may be empty arrays.
- [ ] **Step 4: `build_gis.mjs`** — copy union's, parameterize: `ORIGIN_WAY_ID = 694434545` (fallback constant 37.39936/127.10885), no plaza/Dewey specifics, `LAT0_DEG = 37.40`, `resolveHeight(b, override)`; write `geo.ts` constants (union already regenerates/checks `GEO_TS_PATH` — keep that mechanism, generating the file if missing).
- [ ] **Step 5: `build_streets.mjs`** — from `gis.json.streets`: group segments by `name`, keep kinds `motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian`, total in-bbox length ≥ 120 m; bearing per segment folded against `GRID_BEARING_DEG`; axis vote; `c` = length-weighted mean of the perpendicular offset; `from/to` = min/max along the axis (extended to the bbox edge when within 40 m of it); `width` = OSM width or `lanes × 3.25` (default lanes: primary 6, secondary 4, tertiary 2, residential 2); `sidewalk` 3.0 (4.5 for 판교역로); `oneway` mapped to a compass letter using the axis; dropped streets listed in meta. Unit-tested helpers exported.
- [ ] **Step 6: `sync_data.mjs`** — union's, with `fileURLToPath`, copying `elevation.json, streets_spec.json, tour.json, routes.json, viewpoints.json, storefronts.json` when present.
- [ ] **Step 7: Run** `npm run geo` (real fetch once, then cached), tests green, commit data + tools: `feat(pangyo): GIS pipeline — OSM/SRTM fetch, gis.json, fitted street specs`.

### Task 2: Generalized runtime (copy of union-square-sf, data-driven place content)

**Files:**
- Create: `pangyo-technovalley/{index.html, vite.config.ts, tsconfig.json, src/**}` copied from `union-square-sf` (excluding `src/data/recon/*` SF data, `public/data/*` SF data, `node_modules`), then edited; `pangyo-technovalley/public/assets/models/**` copied from union (the 206-GLB kit + manifests) — assets are MIT-licensed generated files; `src/data/recon/tour.json`, `routes.json` (stage 3 fills routes; stage 2 may leave `routes.json` absent).
- Modify (in the copy only): `src/world/World.ts` (street specs from `data/streets_spec.json`; Plaza only if `data/plaza.json` exists; hero ids from `data/hero.json` if present), `src/world/Props.ts` (no PLAZA constants; heart spots removed), `src/main.ts` (tour stops from `data/tour.json`; viewpoints optional; no storefront overlays unless `storefronts.json`), `src/life/Traffic.ts` (routes from `data/routes.json`; if absent, no vehicles but no crash), `src/life/NavGraph.ts` (must not reference street names), `src/world/Hero.ts`/`HeroContext.ts` (data-driven or removed), `package.json` dev script port 5175.

**Interfaces:**
- Consumes: Task 1 data. Produces: a world that boots at `http://localhost:5175/?qa=1&ui=0&studio=1&life=0&time=sunset` with `window.__twin.ready` resolving, the StudioBridge (`probePath` included) and the `world/props/vegetation` groups; `data/tour.json` shape `[{ title, subtitle?, pos:[x,y,z], look:[x,y,z], duration, hold, time? }]` (union's `TourStop`).

- [ ] **Step 1:** Copy, rename, `npm install`, `npx tsc --noEmit` clean (expect errors from removed SF data; fix by generalizing, not by re-adding SF data).
- [ ] **Step 2:** Grep gate: `grep -rniE "powell|geary|stockton|dewey|macy|westin|apple|nintendo|union square|maiden" src` → empty.
- [ ] **Step 3:** Author `tour.json` with 6 stops: NC R&D Center aerial (pos ≈ [40, 140, 220] look [0, 20, 0]), NC entrance street level, 유스페이스 corner, 판교역로 westbound dolly, 판교역 plaza, night skyline. Positions must be probe-clear (use the studio's collision check after Task 3, or `probePath` via Playwright here).
- [ ] **Step 4:** Boot check with Playwright (`studio/server/render/browser.mjs` `launchWorld` with `port: 5175` — add `'pangyo-technovalley': 5175` to `WORLD_PORTS` in that file as part of this task, additive): `__twin.ready`, `probePath` returns for 3 points, screenshot `pangyo-technovalley/docs/boot.png` shows terrain + massing + streets. Add `test/boot.test.mjs` (integration, 400 s) doing exactly this.
- [ ] **Step 5:** Commit `feat(pangyo): generalized runtime boots on OSM/SRTM data`.

### Task 3: Studio integration + stage-1 previz (target cut)

**Files:**
- Modify: `studio/schemas/project.mjs` (`WORLDS` += `'pangyo-technovalley'`), `studio/app/src/main.ts` (`WORLD_PORTS` 5175), `studio/tools/up.mjs` (`WORLDS` map), `studio/server/prompt.mjs` (`anchorsFor`: if `<world>/public/data/tour.json` exists, use it as anchors — for all worlds — falling back to the hard-coded TOURS), `studio/README.md` (world list, ports), `README.md` root world table.
- Create: `studio/test/pangyo.test.mjs` (launch + 2 s previz 60 frames + export GLB parses), `pangyo-technovalley/README.md` (data sources + attribution, how to rebuild data, ports).

- [ ] **Step 1:** Tests first (`pangyo.test.mjs`, `prompt.test.mjs` case: `anchorsFor('pangyo-technovalley').length ≥ 6`).
- [ ] **Step 2:** Implement; `npm run up` starts three worlds; e2e `node tools/e2e.mjs --world pangyo-technovalley` PASS.
- [ ] **Step 3: Target cut** — via the studio API: project on pangyo, shot 8 s 1920×1080 sunset, keys from `tour.json` stops 1→3→4 (aerial → descend → dolly west), collision check clear (fix path if not), render previz → `studio/projects/…/previz.mp4` copied to `pangyo-technovalley/docs/stage1-target-cut.mp4` (≤ 15 MB) plus 3 frame PNGs. Record wall time in the README.
- [ ] **Step 4:** Commit `feat(studio): pangyo-technovalley world (stage 1)`.

### Task 4: Stage 2 — hero modules (NC R&D Center, 판교역 canopy, 알파돔 massing)

**Files:**
- Create: `pangyo-technovalley/tools/bpl/gen_pangyo.py` (bpy; runs only if `tools/bpl/.venv` with bpy exists), `pangyo-technovalley/src/world/PangyoHero.ts` (procedural fallback + placement), `src/data/recon/hero.json` (`[{ osmId, module, yaw, footprintFit:true }]`), `public/assets/models/pangyo/*.glb` + `manifest_pangyo.json` (via the studio's `inject_asset.mjs` normalization), facade spec `src/data/facades/pangyo.json` for the NC building (glass curtain wall, 12 floors × 4.4 m, dark mullions, rooftop sign "NCSOFT" as a text plane 24 m wide).
- Reference: `union-square-sf/tools/bpl/bpl_lib.py`, `gen_arch.py`; `src/world/Hero.ts`, `src/world/facade/AutoSpec.ts`, `src/data/facades/*.json`.

- [ ] **Step 1:** Try `py -3.10 -m venv tools/bpl/.venv && .venv/Scripts/pip install bpy==3.6.0` (≈ 300 MB). If it installs: generate `nc_rnd_center.glb` (curtain-wall slab on the OSM footprint with the podium), `pangyo_station_canopy.glb`, `alphadome_tower.glb` (two tapered towers); tris ≤ 20k each. If it does not: build the same three as Three.js procedural geometry in `PangyoHero.ts` and say so in the report.
- [ ] **Step 2:** Placement by footprint: hero modules replace the massing for their `osmId` (`heroIds`), scaled to the footprint's oriented bbox, yaw from the footprint's longest edge.
- [ ] **Step 3:** Verification: Playwright screenshot from tour stop 2 (NC entrance) shows the sign; `probePath` at the NC roof + 2 m is clear and at floor 6 inside is blocked; previz of the target cut re-rendered → `docs/stage2-target-cut.mp4`.
- [ ] **Step 4:** Commit `feat(pangyo): hero modules (stage 2)`.

### Task 5: Stage 3 — life, routes, QA report

**Files:**
- Create: `src/data/recon/routes.json` (대왕판교로 N↔S, 판교역로 E↔W, 판교로; lane counts from streets_spec), `src/data/recon/viewpoints.json` (4 viewpoints as camera definitions; photo paths optional and git-ignored under `photos/`), `pangyo-technovalley/tools/qa/qa_report.mjs` (screenshots at the 4 viewpoints + traffic/pedestrian smoke: after 30 s of simulated time ≥ 20 agents, no NaN), `pangyo-technovalley/FINAL_QA_REPORT.md`.
- Modify: `src/life/*` only where names/routes were hard-coded (should be none after Task 2).

- [ ] **Step 1:** Routes + signals from OSM `signals` bin; pedestrians spawn on sidewalks of fitted streets; `life=1` boot shows moving agents (screenshot pair 0 s / 10 s differs).
- [ ] **Step 2:** QA script + report with the defects list (what is approximated: diagonal streets, generic facades, no interiors).
- [ ] **Step 3:** Commit `feat(pangyo): life systems and QA report (stage 3)`.

### Task 6: Docs + final e2e on three worlds

- [ ] Root README world table (three worlds), `studio/README.md` measured-on table gains pangyo timings, `docs/superpowers/specs/…` unchanged; run `studio` full suite + `e2e.mjs` on all three worlds; commit `docs: three worlds`.
