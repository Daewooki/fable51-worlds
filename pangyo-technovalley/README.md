# Pangyo Techno Valley — digital twin (판교테크노밸리)

A third MV Studio world: the blocks around the **NCSOFT R&D Center** (엔씨소프트R&D센터) in 판교, 성남, built from
public GIS data and rendered by a generalized copy of the `union-square-sf` Three.js runtime.

> Stub README — Task 3 completes it (studio integration, previz, QA).

## Run

```bash
npm install
npm run dev        # http://localhost:5175/
```

Studio/QA URL contract: `http://localhost:5175/?qa=1&ui=0&studio=1&life=0&time=sunset&q=med`

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

## Licensing / attribution

- Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL):
  <https://www.openstreetmap.org/copyright>. The attribution is also carried in `gis.json.meta`.
- Elevation: SRTM 1-arcsec via OpenTopoData (`srtm30m`), public domain; AWS Terrarium tiles as the per-point fallback.
- 3D asset kit under `public/assets/models/`: generated with the repo's Blender tooling (MIT), copied from `union-square-sf`.
