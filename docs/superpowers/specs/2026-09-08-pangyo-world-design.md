# Pangyo Techno Valley world — design spec (2026-09-08)

## Goal
A third MV Studio world, `pangyo-technovalley/`: the blocks around the NCSOFT R&D Center in Pangyo (Seongnam), built from public GIS data with the same runtime as `union-square-sf`, so every studio feature (timeline, prompt→path, phone camera, collision check, previz, Seedance finalize, GLB export, VARCO inject) works on it unchanged. Delivered in three stages; each stage ends with a rendered previz of the target cut.

**Target cut (stage-1 acceptance):** 8 s, 1080p — aerial over the NC R&D Center, descend past 유스페이스/H스퀘어 and dolly west along 판교역로 toward 판교역.

## Decisions (fixed)
- **Runtime = a copy of `union-square-sf`** (TypeScript Three.js app), generalized so place-specific things come from data files instead of code: street specs, tour stops, traffic routes, plaza, hero modules. `kyoto-higashiyama` (different codebase) is not the base.
- **Origin** = area centroid of OSM way `694434545` (엔씨소프트R&D센터, 12 levels, 58 m, 4,449 m²): lat 37.39936, lon 127.10885. `y = 0` at its ground elevation. Grid bearing = length-weighted axial mean of street bearings inside the bbox (the existing algorithm), so 판교역로 / 대왕판교로 come out axis-aligned.
- **Bbox (WGS84):** south 37.3950, west 127.0990, north 37.4065, east 127.1170 → ≈ 1.28 km N–S × 1.59 km E–W; includes 판교역, 알파돔, 유스페이스, H스퀘어, 넥슨/네오위즈 blocks, 판교테크노밸리 core.
- **Data sources:** buildings, roads, POIs, trees, lamps, signals, crossings from **OpenStreetMap Overpass** (verified 476 buildings, 159 with height/levels in the core; NC building tagged); elevation from **OpenTopoData `srtm30m`** (verified: NC HQ 37 m, 판교역 54 m) sampled on a 25 m grid, with **AWS Terrarium tiles** as the fallback source; building heights: OSM `height` → `building:levels × 3.6 + 1` → a per-world `heights_override.json` (hand-curated for named buildings) → the existing area-based default. No VWorld/paid APIs; no key needed to build the world.
- **Streets:** the runtime keeps its analytic, axis-aligned street model (life systems depend on it). A tool fits each named OSM way (`primary`…`residential`, ≥ 120 m inside the bbox) to the grid axis: `axis` from bearing, `c` = length-weighted mean offset, `from/to` = extent, `width` = OSM `width` or `lanes × 3.25 m`, `sidewalk` 3.0 m (4.5 on 판교역로), `oneway` from tags. Diagonal/curved ways are approximated; that is accepted for this world.
- **Facades:** procedural (existing `arch` kit + `glass` style for towers > 40 m). Stage 2 adds Pangyo hero modules: NCSOFT R&D Center (glass curtain wall, rooftop "NCSOFT" sign), 판교역 entrance canopy, 알파돔 towers massing refinement; generated with Blender-as-a-module (`bpy` 3.6 on Python 3.10 — 3.9 is too old) if the wheel installs, else as procedural Three.js geometry in `PangyoHero.ts`. VARCO 3D is an optional path once a key exists.
- **Life:** pedestrians via the generic NavGraph over the fitted streets; vehicle routes from `data/routes.json` (대왕판교로 N–S, 판교역로 E–W); traffic lights from OSM signals; no cable car / bus lines.
- **Verification:** stage 3 uses creator-supplied photos (Kakao/Naver road view captures are not redistributable — the world ships viewpoint definitions and the QA script; the photos stay local). The kyoto/union QA shape (`FINAL_QA_REPORT.md`) is reused: 4 fixed viewpoints, screenshots, a defects list.
- **Studio integration:** `WORLDS` gains `pangyo-technovalley`, dev port **5175**, launcher starts it, prompt→path anchors from `data/tour.json` (`anchorsFor` reads a world's `public/data/tour.json` when present, so no more hard-coded TOURS), README.
- **Licensing:** OSM data © OpenStreetMap contributors (ODbL) — attribution in the world README and the `gis.json` meta; SRTM is public domain. Fine for internal demo and prototype; attribution kept for any external use.

## Architecture
```
pangyo-technovalley/
  package.json           name pangyo-technovalley, dev: vite --port 5175 --strictPort (sync step uses fileURLToPath)
  src/geo/geo.ts         ORIGIN_LAT/LON/ELEVATION, GRID_BEARING, bbox — generated constants
  src/data/recon/        osm_raw.json, elevation.json, gis.json, streets_spec.json, tour.json, routes.json, heights_override.json
  public/data/           synced copies (+ asset manifests, asset_overrides.json)
  tools/geo/             fetch_osm.mjs, fetch_elevation.mjs, build_gis.mjs (generalized), build_streets.mjs, sync_data.mjs
  tools/bpl/             gen_pangyo.py (stage 2), reuse of the union kit generators
  src/world/…            same modules as union-square-sf; Plaza/Hero/Traffic routes/tour become data-driven and optional
  src/debug/StudioBridge.ts + Qa.ts   unchanged (studio contract incl. probePath)
```
Generalization rules for the copied runtime: nothing in `src/` may name a San Francisco street, building or plaza; every such reference moves to a JSON under `src/data/recon/` with a documented shape, and a missing file means "feature off" (Plaza, Traffic routes, tour, storefront census, viewpoints). `union-square-sf` itself is **not** modified (it stays the reference world); the generalized modules live in the new package. A later cleanup may fold them back.

## Data flow
`fetch_osm` (Overpass, bbox + 60 m margin) → `osm_raw.json` · `fetch_elevation` (25 m grid → `elevation.json` in the union recon shape `{ source, grid:{spacingM,rows,cols,bbox}, samples:[{lat,lon,elev_m}] }`) → `build_gis` (origin from a way id, bearing, local coords, buildings with heights, streets, props bins, pois) → `gis.json` → `build_streets` → `streets_spec.json` → `sync_data` → `public/data/` → runtime.

## Error handling
Overpass rate limits/timeouts → retry with backoff (3×) and a cached `osm_raw.json` (the fetch is skipped when the file exists unless `--refresh`). OpenTopoData 1 req/s, 100 points/req → throttled batches; failures fall back to Terrarium tiles; a sample that fails everywhere is dropped (IDW interpolates). Buildings without geometry or < 3 points are skipped and counted in `gis.meta.skipped`. A street that fits neither axis (bearing within ±25° of neither) is dropped and listed in `streets_spec.json.meta.dropped`.

## Testing
- Unit (vitest, in the world package): bearing fold and axis fit on synthetic ways; height resolution order; elevation grid shape; local-coordinate round trip (NC centroid → (0,0)).
- Integration: `npm run geo` builds all data from cached inputs in < 60 s; the world boots headless (`launchWorld({world:'pangyo-technovalley'})`), `__twin.ready`, ≥ 300 buildings in `gis.json`, NC building present at the origin with height 58 m; studio previz of the target cut renders 240 frames (8 s @ 30 fps) and the collision check on it is clear; export GLB parses.
- Stage 2: hero modules appear at their footprints (screenshot at the NC viewpoint shows the sign); stage 3: QA report with 4 viewpoints and the traffic/pedestrian smoke test (no NaN positions, ≥ 20 agents alive after 30 s).

## Out of scope
Interior spaces; exact building materials beyond glass/concrete/stone; real transit schedules; photo redistribution; VWorld data; changes to `union-square-sf`.
