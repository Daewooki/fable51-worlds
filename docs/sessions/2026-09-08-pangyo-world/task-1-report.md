# Task 1 report — Pangyo Techno Valley GIS data pipeline

Date: 2026-09-08 · Package: `pangyo-technovalley/` · Status: **DONE_WITH_CONCERNS** (two factual
corrections to the design spec, listed under "Deviations & concerns"; nothing is blocked).

## What was built

| File | Purpose |
| --- | --- |
| `pangyo-technovalley/package.json` | name `pangyo-technovalley`, deps copied from union (`three`, `@types/three`, `pixelmatch`, `playwright`, `pngjs`, `typescript`, `vite`) + `vitest`; `dev` = `vite --port 5175 --strictPort`; `geo` = fetch_osm → fetch_elevation → build_gis → build_streets → sync_data; `test` = `vitest run` |
| `vitest.config.ts` | `test.include ['test/**/*.test.mjs']` (union has no vitest setup to copy) |
| `tools/geo/constants.mjs` | single source of truth for BBOX, `LAT0_DEG` 37.40, `M_PER_DEG_*`, `ORIGIN_WAY_ID` 694434545, fallback origin, `LEVEL_HEIGHT_M` 3.6, `CLIP_MARGIN_M` 60, `GRID_SPACING_M` 25 |
| `tools/geo/fetch_osm.mjs` | Overpass POST `data=`, bbox + 60 m margin, 3 retries with 5/10 s backoff, skips when `osm_raw.json` exists unless `--refresh` |
| `tools/geo/fetch_elevation.mjs` | 25 m grid, OpenTopoData `srtm30m` in batches of 100 at ≤ 1 req/s with 3 retries; per-batch fallback to AWS Terrarium tiles (z14) decoded by a built-in PNG reader (`node:zlib` inflate + IHDR/IDAT chunk walk + filters 0–4, 8-bit RGB/RGBA, no npm deps); union recon output shape |
| `tools/geo/build_gis.mjs` | union's `build_gis.mjs`, generalised (origin from a way id, bearing fitted from every named road, no plaza/monument/tram); exports pure helpers (`resolveHeight`, `ringCentroid`, `gridAxisFit`, …) and only runs the pipeline when executed directly; generates `src/geo/geo.ts` when missing and warns + regenerates on drift |
| `tools/geo/build_streets.mjs` | fits `gis.json.streets` to the analytic `StreetSpec` model; exports `foldToAxis`, `axisDeviation`, `onewayLetter`, `defaultLanes`, `axialMeanBearing`, `recordSegments`, `fitStreets` |
| `tools/geo/sync_data.mjs` | union's, with `fileURLToPath`; trims `gis.json` tags/precision and copies `elevation.json, streets_spec.json, heights_override.json, tour.json, routes.json, viewpoints.json, storefronts.json, plaza.json, hero.json` when present |
| `src/geo/geo.ts` | **generated**; exports `ORIGIN_LAT/LON/ELEVATION_M`, `GRID_BEARING_DEG`, `GRID_NORTH_BEARING_DEG`, `LAT0_DEG`, `M_PER_DEG_LAT/LON`, `BBOX_WGS84`, `geoToLocal`, `localToGeo`, `elevToLocalY` (+ `elevToY` alias, `yToElev`), `bearingToLocalRad`, `localBbox`, `LocalXYZ`, `GeoLatLon` |
| `src/data/recon/{osm_raw,elevation,gis,streets_spec,heights_override}.json` | committed data (osm_raw + elevation are the cached inputs) |
| `public/data/{gis,elevation,streets_spec,heights_override}.json` | sync output, committed like union's |
| `test/geo.test.mjs` | 21 vitest cases (frame round-trip, `foldToAxis`, `onewayLetter`, `defaultLanes`, `resolveHeight` order, generated-data assertions) |

## Process

TDD as instructed: `test/geo.test.mjs` was written first and failed (`Cannot find module '../src/geo/geo.ts'`),
then Steps 2–6 were implemented, `npm run geo` was run once for real (network), then again from cache
(4.1 s, both fetch steps printed "skipping fetch"), then the tests.

## Data produced

- **OSM** (`osm_raw.json`, 1.29 MB): 455 nodes / 1517 ways / 64 relations; 578 elements tagged `building`.
- **Elevation** (`elevation.json`, 158 KB): 52 × 65 = **3380 samples**, spacing 25 m over 1594 × 1276 m.
  **Source used: OpenTopoData `srtm30m` for 100 % of samples — 0 nulls, 0 Terrarium fallbacks.**
  min 28 m, max 109 m, mean 49.77 m. Origin elevation **37 m** (matches the controller's verified value);
  crosscheck 판교역 = 54 m (also matches). `intersections` / `buildingCentroids` are empty arrays.
- **`gis.json`** (1.12 MB): **564 buildings** (435 inside the bbox), 118 building parts, 794 street records,
  431 POIs, 58 signals, 65 crossings, 3 benches; **0 trees, 0 lamps, 0 hydrants, 0 bollards** (Pangyo OSM
  simply has no street furniture or street trees mapped — see concerns). Skipped: 11 no-geometry, 1 < 3 points.
  Height sources: `osm:height` 247, `osm:building:levels*3.6+1` 30, `area-default` 287.
- **Origin**: way 694434545 area centroid = **37.399371, 127.108722**, elev 37 m.
  NC building: `heightM 58` (`osm:height`), centroid **(-0.04, -0.04)** — 0.06 m from the origin, area 4451 m²
  (brief said ~4449 m²), `style "glass"`, name "NCSOFT R&D Center" (from the override). Podium `way/694434544`
  resolves to 8 m from its own OSM `height=8` (the seeded override 9 m is a fallback and does not apply).
  Tallest massing: 101/102 (71 m), 알파돔타워 68 m, 판교 테크원타워 67 m, 크래프톤타워 67 m.
- **Grid bearing**: **`GRID_BEARING_DEG = 84.541`** (grid-north = −5.459°, i.e. the Pangyo grid is rotated
  5.46° counter-clockwise from true north), fitted from 567 segments / 19 356 m of named roadway by a
  length-weighted **quadrupled-angle** mean (generalises union's "fold N–S by −90°, then axial mean" so no
  street names are hard-coded). Per-street axial fits confirm two tight clusters: 판교로 83.0°,
  대왕판교로606번길 90.2°, 대왕판교로644번길 90.1° (grid-east) vs 분당내곡로 174.3°, 대왕판교로 165.4°,
  판교역로 0.2°, 동판교로 174.0° (grid-north).
- **`streets_spec.json`**: **23 streets** (8 ns / 15 ew), **2 dropped**. Every kept street is ≤ 14.3° off its
  fitted axis (median ≈ 5°), so the analytic grid is a good approximation here.
  - Dropped: **판교로227번길** (bearing 24.39°, 29.85° from the nearest axis, 392 m) and
    **판교로255번길** (bearing 115.26°, 30.72°, 870 m).
  - 판교역로: `axis ns, c 85.09, from -499.22, to 552.64, width 29.25, sidewalk 4.5, lanes 9`.
  - 대왕판교로: `axis ns, c -275.10, width 19.5, lanes 6, kind primary`.
  - 판교로: `axis ew, c -442.33, width 29.25, lanes 9, kind secondary`.
  - No street resolved to a `oneway` letter: every one-way name here is a mapped dual-carriageway pair
    (opposing letters), which the fitter correctly collapses to a two-way analytic street.

## Test output (tail)

```
 ✓ test/geo.test.mjs (21 tests) 18ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Duration  3.73s
```

`grep -rn "\.pathname" pangyo-technovalley/tools` → empty (also empty for `src` and `test`).

## Deviations & concerns

1. **판교역로 is a north–south street, not east–west** (concern for Task 2/3). The design spec says
   "판교역로 / 대왕판교로 come out axis-aligned" with 판교역로 as the E–W one, and the target cut is
   "dolly **west** along 판교역로 toward 판교역". OSM disagrees: all seven ways named 판교역로 inside the
   bbox run N–S at a constant longitude 127.1097 (lat 37.3937 → 37.4040), 85 m **east** of the NC R&D
   Center — whose postal address is 판교역로 227, i.e. the road that fronts the building. The fit follows
   the data (`axis: 'ns'`), and the test asserts that with a comment. **The E–W arterials here are 판교로
   (c −442, 9 lanes) and 대왕판교로606번길 (c +327, 6 lanes); 대왕판교로 is N–S as the spec expected.**
   Task 3's tour/target cut needs re-aiming: an aerial descent past the NC block and a **southbound**
   dolly along 판교역로 (c = 85, from +553 toward −499) reaches 판교역 from the north; a westbound dolly
   would run along 판교로 or 대왕판교로606번길 instead. The 4.5 m sidewalk rule was still applied to 판교역로.
2. **Origin is 11 m from the constant quoted in the spec.** The spec/brief call the origin "the area
   centroid of way 694434545" but quote 37.39936 / 127.10885 — that pair is the way's *vertex mean*.
   The true area-weighted centroid (union's `ringCentroid`, which the brief told me to keep) is
   37.399371 / 127.108722, ~11.3 m west along the building's 111 m long axis. I kept the area centroid,
   because it is the stated method and because it puts the NC building's own centroid at (−0.04, −0.04).
   The self-review criterion "`geoToLocal(37.39936, 127.10885)` ≈ (0,0)" therefore reads 11.4 m, and the
   test asserts < 15 m for that constant while asserting < 1 m for the building centroid. The quoted pair
   remains the `FALLBACK_ORIGIN` (used only if the way is missing from the dump, and for the elevation
   probe, where 11 m is far inside one SRTM post).
3. **No route relations in the Overpass query.** `relation["route"]` with `out geom` would have pulled
   entire Seongnam bus/subway route geometries into `osm_raw.json` (tens of MB). The spec says "no cable
   car / bus lines", so union's `routes` field on street records is simply absent. Re-add a second
   `out body;` statement if a later task wants route membership.
4. **`build_gis.mjs` / `build_streets.mjs` guard their pipeline** behind
   `import.meta.url === pathToFileURL(process.argv[1]).href` so the unit tests can import `resolveHeight` /
   `foldToAxis` without running a build. Union's script has no such guard (it is never imported).
5. **`geo.ts` is regenerated on drift**, not just warned about. Union only warns; the brief said "keep that
   mechanism, generating the file when missing". Generating-when-missing plus regenerate-on-drift keeps the
   file honest; the drift warning is still printed first.
6. **`.gitignore`** (repo root) has a repo-wide `src/data/recon/osm_raw.json` rule, which contradicts the
   plan's "cached inputs are committed". Added one negation line —
   `!pangyo-technovalley/src/data/recon/osm_raw.json` — with a comment. `union-square-sf` is unaffected.
7. **`public/data/` is committed** (like union's), so the world will boot in Task 2 without a sync step —
   the controller's `dev` script (`vite --port 5175 --strictPort`) does not run `sync_data` the way union's does.
   `sync_data.mjs` also copies `heights_override.json`, which the brief's file list did not mention but the
   runtime's `BuildingOverride` map will want.
8. **Sparse street furniture.** OSM has no trees, street lamps, hydrants or bollards mapped in this bbox
   (0 of each) and only 3 benches. Props/vegetation in the runtime will have to be procedural (scatter along
   the fitted sidewalks) rather than data-driven, unlike union. Signals (58) and crossings (65) are fine.
9. **Motorway and flyover kept as analytic streets.** 경부고속도로 (motorway, c −749, 8 lanes) and
   낙생고가차도 (an elevated ramp, 17.9° off axis) pass the kind/length filter. They are real and inside the
   bbox; drop them in a later pass if they look wrong at the west edge. Tunnels (`tunnel=yes` or `layer<0`,
   e.g. 화랑지하차도 and 분당내곡로's underpass sections) are excluded from the fit.
10. **No world README yet** — the plan assigns it to the studio-integration task. OSM attribution is in
    `gis.json.meta.osmCopyright` (Overpass's ODbL line) and `gis.json.meta.osmAttribution`.

## Verification checklist (self-review)

- `geoToLocal(ORIGIN_LAT, ORIGIN_LON)` = (0, 0) exactly; 500 m round-trips < 0.5 m. ✔
- NC building local centroid (−0.04, −0.04), 0.06 m from the origin, `heightM === 58`. ✔
- `gridBearingDeg` 84.541 — plausible: the two street clusters sit within ~10° of the fitted axes. ✔
- ≥ 300 buildings (564). ✔ · ≥ 8 streets (23). ✔ · 판교역로 and 대왕판교로 both present. ✔ (axis: see concern 1)
- 2 dropped streets, both listed in `meta.dropped` with name + bearing + deviation. ✔
- `npm run geo` from cache does not fetch (4.1 s). ✔ · No `.pathname` in the new tools. ✔
