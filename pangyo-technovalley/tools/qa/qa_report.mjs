#!/usr/bin/env node
/**
 * qa_report.mjs — stage-3 QA pass for pangyo-technovalley.
 *
 * Boots the world headless through the studio's Playwright launcher (`studio/server/render/browser.mjs`,
 * port 5175, `life=1`), then:
 *   1. probes the four `data/viewpoints.json` cameras with `__twin.probePath` (must be clear),
 *   2. screenshots each of them at 1280×720 into `docs/qa/<id>.png`,
 *   3. life smoke — agent counts and NaN counts at 0 s and after 30 s of simulated time,
 *   4. traffic-light smoke — 60 s of simulated time sampling every route vehicle's speed, asserting that
 *      at least one of them comes to a full stop at a stop bar whose signal is showing red/amber,
 *   5. writes `FINAL_QA_REPORT.md` (and the raw numbers to `docs/qa/qa.json`).
 *
 * The dev server must be up: `npm run dev` in this package (vite --port 5175 --strictPort).
 * Run: node tools/qa/qa_report.mjs        (from the package root; plain ESM, playwright only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..', '..');
const REPO = path.resolve(PKG, '..');
const OUT_DIR = path.join(PKG, 'docs', 'qa');
const REPORT = path.join(PKG, 'FINAL_QA_REPORT.md');
const SIM_LIFE_S = 30, SIM_LIGHT_S = 60, SIM_DT = 0.1;
/** A viewpoint camera must stand at least this far (m, in plan) from any placed street tree. */
const TREE_CLEAR_M = 2.0;

// the repo path contains a space, so the import specifier must be a file:// URL
const { launchWorld } = await import(pathToFileURL(path.join(REPO, 'studio/server/render/browser.mjs')).href);

const gis = JSON.parse(fs.readFileSync(path.join(PKG, 'public/data/gis.json'), 'utf8'));
const streetsSpec = JSON.parse(fs.readFileSync(path.join(PKG, 'public/data/streets_spec.json'), 'utf8'));
const routes = JSON.parse(fs.readFileSync(path.join(PKG, 'public/data/routes.json'), 'utf8')).filter((r) => !String(r.name).startsWith('_'));
const viewpoints = JSON.parse(fs.readFileSync(path.join(PKG, 'public/data/viewpoints.json'), 'utf8'));
const tour = JSON.parse(fs.readFileSync(path.join(PKG, 'public/data/tour.json'), 'utf8'));

/**
 * Authored defects: what a reviewer should know is wrong or approximated before trusting a frame.
 * Measured defects are appended by `run()`.
 */
const DEFECTS = [
  ['판교역로 straight fit overlaps real massing', 'high', '판교역로 is fitted as a single straight ns line at x = 85.09 with a 29.25 m carriageway. The real road bends; the fit therefore runs through the 삼성화재 / 카카오판교아지트 massing on the east side around z = −120 … +40, and the OSM H스퀘어 bus platforms (07479 / 07034) land inside the carriageway rather than on the kerb.'],
  ['East side of 판교역로 is bare', 'high', 'OSM has almost no building heights on the east flank of 판교역로 north of 판교역, so those blocks fall back to the area-based default height and read as low grey boxes next to the 12-storey west side.'],
  ['Dark glass', 'medium', 'The procedural curtain-wall style uses `glass_dark` for towers > 40 m. In daylight the NC building and the 알파돔 towers read almost black rather than the real blue-green; no reflection probe is baked, so `envMapIntensity` is doing all the work.'],
  ['Canopy yaws unsurveyed', 'medium', 'The three 판교역 canopies are placed on the OSM `railway=subway_entrance` nodes with `yaw: 0` (grid-aligned). Their real orientation was never surveyed — treat the canopy angles as decoration, not as geometry.'],
  ['알파돔 towers scaled to OSM height', 'medium', 'The 알파돔시티 towers are massing scaled to whatever `height` / `building:levels` OSM carries. Where OSM has neither, they take the area default, so the tower group\'s silhouette is indicative only.'],
  ['Thin façade sliver near 판교역', 'low', 'Some footprints near the station are long and 3–5 m deep (OSM canopy/podium outlines). The façade builder still details them, producing thin slivers of curtain wall with no depth.'],
  ['No interiors', 'low', 'Nothing in this world is enterable. `probePath` reports the massing as solid; there are no floors, lobbies or storefront interiors (union-square-sf has two, this world has none).'],
  ['Straight-fit street grid', 'high', 'Every street is axis-aligned by construction (`tools/geo/build_streets.mjs`): bearing folded to the grid, `c` = length-weighted mean offset. 경부고속도로 (9.5° off-axis), 대왕판교로 (9.6°) and 분당내곡로 (9.4°) are visibly straighter than reality, and two named ways (판교로227번길, 판교로255번길) were dropped for being > 25° off both axes.'],
  ['Ground cover now spans the whole extract (fixed)', 'low', 'The fallback block fill used to stop at a symmetric \u00b1620 m box, so the outer third of the reconstruction was bare white terrain with streets running off into nothing. It now covers the full local bbox (x \u2212903\u2026805, z \u2212870\u2026553 \u2014 `BlockFill.FILL_BBOX` = `geo.localBbox()`) at the terrain\'s own 8 m resolution, so the fill ends exactly where the OSM extract does and not before. What remains is the extract boundary itself: beyond it there is no data of any kind.'],
  ['Terrain is SRTM 30 m', 'medium', 'Elevation is SRTM 1-arcsec sampled on a 25 m grid and IDW-gridded at 8 m. Cut-and-fill, podium platforms, underpasses (화랑지하차도, 낙생고가차도) and the 판교역 box are not modelled — streets and block fill are simply draped on the smoothed heightfield.'],
  ['Generic façades', 'medium', 'Façades are procedural (`AutoSpec`), not surveyed: bay widths, floor heights and materials are inferred from the footprint and height. Only the NC R&D Center has an authored spec.'],
  ['No storefront census', 'low', 'This world ships no `storefronts.json`, so no ground-floor tenant is identified; every retail bay is a blank fascia even where OSM has a shop POI at that address.'],
  ['Water is a coloured surface, not a modelled channel', 'medium', 'Stage 3 shipped the water class flat and opaque and the 운중천 / 금토천 read as a pale flood plain. It is now a darker blue-grey at alpha 0.75 (`src/materials/Library.ts`), and the ground cover underneath it is cut away (`BlockFill.TRANSLUCENT_SURFACES`) so what shows through is the terrain rather than the park grass and its three rectangular pitches, which used to be plainly visible on the river bed. It is still one patch draped on the SRTM heightfield: no normal map, no flow, no ripple, no bank geometry and no cut-in bed — the terrain does not dip under the water, so the surface sits at ground level + 5 cm wherever OSM drew the polygon. Treat any watercourse in a frame as a coloured surface.'],
  ['Block-fill patch seams and mottling', 'medium', 'The ground cover is rasterised on an 8 m grid and merged per surface class, and each patch carries planar `uv = (x, z)`. Neighbouring patches meet on hard cell lines, the procedural paving/concrete textures tile visibly at that pitch, and the per-class millimetre y-offsets show as faint edges where two classes abut. In the QA frames this reads as blotching across the 판교역 forecourt and the NC block. Nothing is missing \u2014 it is one flat material stretched over a whole block.'],
  ['판교역 forecourt is generic block fill', 'medium', 'The `pangyoyeok-plaza` viewpoint was re-sited in stage 3.1 (from x 186 / z 507 heading 205\u00b0 to x 152 / z 549 heading 39\u00b0) so that the 신분당선 entrance canopy is centred with the 알파돔 tower behind it instead of small against a blank curtain wall. It is the best probe-clear stand available: every position nearer the canopy is inside the surrounding massing. The frame is still weak for a reason no camera can fix \u2014 there is no station box, no plaza module, no furniture and no signage here, only three canopies dropped on the OSM `subway_entrance` nodes and a flat paved patch.'],
  ['`pois` excludes ground-cover areas', 'low', 'Every OSM way/relation that lands in the `landuse` ground-cover bin is now kept OUT of `gis.json.pois` (`tools/geo/build_gis.mjs` \u00a77): `fetch_osm --augment` had filed all 232 areas as points of interest as well, so parks, car parks and ponds came back as POIs and were double-counted by anything reading that bin. The count fell 460 \u2192 378, with no change to buildings (564), fitted streets (23) or the NC height (58 m). A POI census that wants those areas should read `landuse` alongside `pois`.'],
];

const NEXT = [
  'Fit 판교역로 and 대왕판교로 as polylines rather than single straight lines (the runtime lane graph would need a curved-link mode), which would also put the OSM bus platforms back on the kerb.',
  'Author `heights_override.json` entries for the east side of 판교역로 (삼성화재, 카카오, 유스페이스2) so those blocks stop using the area default.',
  'Bake a small environment probe per time preset so `glass_dark` reads as glass rather than as black in daylight.',
  'Add a `plaza.json` for the 판교역 forecourt so the station area gets a proper paved slab, plaza furniture and a pedestrian lattice instead of the generic block fill.',
  'Survey the three canopy yaws from road view and replace `yaw: 0` in `hero_props.json`.',
  'Drop creator captures into `photos/` and wire them into `viewpoints.json` so the reference overlay (`?ref=1`) can be used for a real side-by-side.',
];

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n));

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();
  const { browser, page, errors, softwareRender } = await launchWorld({
    world: 'pangyo-technovalley', port: 5175, width: 1280, height: 720, time: 'day', quality: 'med', life: true,
  });
  // Everything from here on runs inside try/finally: any throw (a missing __twin member, a
  // screenshot failure, a bad viewpoint) used to leave the headless Chromium running forever.
  async function body() {
  const bootMs = Date.now() - t0;
  await page.waitForFunction(() => typeof window.__twin?.probePath === 'function', null, { timeout: 120_000 });

  // ---- world / scene numbers ------------------------------------------------
  const world = await page.evaluate(() => {
    const t = window.__twin, w = t.world;
    const cross = w.streets.crossings;
    return {
      loadMs: t.loadMs,
      buildings: w.gis.buildings.length, buildingParts: w.gis.buildingParts.length,
      detailed: w.detailedIds.size, heroes: w.heroIds.size,
      streets: w.streetSpecs.length, crossings: cross.length, signalled: cross.filter((c) => c.signal).length,
      signalReport: w.signalReport,
      ground: w.blockFill?.stats() ?? null,
      props: t.props.placement,
      landuse: (w.gis.landuse || []).length,
    };
  });

  // ---- life at boot --------------------------------------------------------
  // Captured HERE, before the screenshot loop: the world keeps animating in real time while
  // Playwright drives it, so a `lifeStats()` taken after four 600 ms screenshot waits is not
  // "at 0 s" - it is boot + ~3 s. Taken here the column really is the boot state, and
  // `wallMsBetween` records the real time that passed before the simulated steps.
  const atBoot = await page.evaluate(() => window.__twin.lifeStats());
  const atBootMs = Date.now();

  // ---- viewpoints: probe, then screenshot ----------------------------------
  // `probePath` only knows about collision walls and structure. Street trees are instanced
  // vegetation with no collider at all, so a camera can be standing inside a 6 m crown and still
  // probe "clear" - which is exactly what happened to pangyoro-hsquare (~60 % of the frame was
  // one trunk and its canopy). Every camera is therefore also held TREE_CLEAR_M away from every
  // placed tree, in plan.
  const vpProbe = await page.evaluate(({ ids, treeClear }) => {
    const t = window.__twin, w = t.world;
    const trees = w.treeSpots || [];
    const pts = ids.map((v) => {
      const c = v.camera;
      const y = c.absoluteY !== undefined ? c.absoluteY : w.collision.floorAt(c.x, c.z, w.terrain.heightAt(c.x, c.z) + 0.5, 100) + (c.heightM ?? 1.7);
      return [c.x, y, c.z];
    });
    const probes = t.probePath({ points: pts, clearance: 0.9 });
    const treeDist = [], treeInView = [];
    ids.forEach((v, i) => {
      const [x, , z] = pts[i];
      // compassToYaw: yaw 0 looks toward -z (grid north, true bearing -5.459)
      const yaw = -((v.camera.headingDeg - (-5.459)) * Math.PI) / 180;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let near = Infinity, view = null;
      for (const [tx, , tz] of trees) {
        const dx = tx - x, dz = tz - z;
        const d = Math.hypot(dx, dz); if (d < near) near = d;
        const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (along > 0 && along < 18 && lat < 2.5 && (!view || along < view.along)) view = { along: +along.toFixed(1), lat: +lat.toFixed(2) };
      }
      treeDist.push(Number.isFinite(near) ? +near.toFixed(2) : null);
      treeInView.push(view);
    });
    return {
      pts, probes, trees: trees.length, treeClear, treeDist, treeInView,
      inTree: treeDist.map((d, i) => (d !== null && d < treeClear) || !!treeInView[i]),
    };
  }, { ids: viewpoints, treeClear: TREE_CLEAR_M });

  const shots = [];
  for (const v of viewpoints) {
    const placed = await page.evaluate((id) => {
      const ok = window.__twin.setView(id);
      window.__twin.renderOnce();
      return { ok, pos: window.__twin.pos() };
    }, v.id);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__twin.renderOnce());
    const file = path.join(OUT_DIR, `${v.id}.png`);
    await page.screenshot({ path: file, type: 'png' });
    shots.push({ id: v.id, title: v.title, ok: placed.ok, pos: placed.pos, file: path.relative(PKG, file).replace(/\\/g, '/'), bytes: fs.statSync(file).size });
    console.log(`shot ${v.id} ${placed.ok ? 'ok' : 'FAILED'} -> ${file}`);
    // setView() returns false for an id the runtime does not know: the frame just shot is then
    // whatever the camera happened to be pointing at, so the report must not pass.
    if (!placed.ok) { console.error(`viewpoint ${v.id} is unknown to the runtime (setView returned false)`); process.exitCode = 1; }
  }

  // ---- life smoke: counts at boot and after 30 s of simulated time ----------
  const wallMsBetween = Date.now() - atBootMs;
  const life = await page.evaluate(async (seconds) => {
    const t = window.__twin;
    t.stepLife(seconds, 1 / 30);
    return { after: t.lifeStats() };
  }, SIM_LIFE_S);
  life.before = atBoot;
  life.wallMsBetween = wallMsBetween;

  // ---- traffic-light smoke -------------------------------------------------
  const lights = await page.evaluate(({ seconds, dt }) => {
    const t = window.__twin, l = t.life, tr = l.traffic;
    const routeVs = tr.vehicles.filter((v) => v.route);
    const rec = routeVs.map((v) => ({ name: v.route.name, minSpeed: Infinity, maxSpeed: 0, redStops: 0, dwellStops: 0, served: 0, firstRedStop: null }));
    let bgRedStops = 0;
    const steps = Math.round(seconds / dt);
    for (let k = 0; k < steps; k++) {
      l.update(dt, 0);
      for (let i = 0; i < routeVs.length; i++) {
        const v = routeVs[i], r = rec[i];
        if (!v.alive) continue;
        if (v.v < r.minSpeed) r.minSpeed = v.v;
        if (v.v > r.maxSpeed) r.maxSpeed = v.v;
        if (v.v > 0.02) continue;
        const atStop = v.stops && v.stopIdx < v.stops.length && v.stops[v.stopIdx].link === v.link && Math.abs(v.stops[v.stopIdx].s - v.s) < 3;
        const n = v.link.endNode;
        if (n && n.signal && n.light && (v.link.len - v.s) < 15) {
          const col = v.link.axis === 'ns' ? n.light.ns : n.light.ew;
          if (col !== 'green') {
            r.redStops++;
            if (!r.firstRedStop) r.firstRedStop = { t: +(k * dt).toFixed(1), x: +n.x.toFixed(1), z: +n.z.toFixed(1), colour: col, street: v.link.name };
            continue;
          }
        }
        if (atStop) r.dwellStops++;
      }
      if (k % 10 === 0) {
        for (const v of tr.vehicles) {
          if (v.route || !v.alive || v.v > 0.02) continue;
          const n = v.link.endNode;
          if (n && n.signal && n.light && (v.link.len - v.s) < 15 && (v.link.axis === 'ns' ? n.light.ns : n.light.ew) !== 'green') { bgRedStops++; break; }
        }
      }
    }
    for (let i = 0; i < routeVs.length; i++) rec[i].served = routeVs[i].served;
    return { routes: rec.map((r) => ({ ...r, minSpeed: Number.isFinite(r.minSpeed) ? +r.minSpeed.toFixed(3) : null, maxSpeed: +r.maxSpeed.toFixed(2) })), bgRedStopFrames: bgRedStops, after: t.lifeStats(), lightStats: l.lights.stats() };
  }, { seconds: SIM_LIGHT_S, dt: SIM_DT });

  // ---- render cost ---------------------------------------------------------
  const render = await page.evaluate(() => {
    const t = window.__twin;
    t.setView('nc-aerial'); t.renderOnce();
    const r = t.app.renderer.info;
    return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
  });

  const measured = [];
  const blockedVp = vpProbe.probes.map((p, i) => (p.blocked ? viewpoints[i].id : null)).filter(Boolean);
  if (blockedVp.length) measured.push(['Viewpoint camera blocked', 'high', `probePath reports ${blockedVp.join(', ')} inside geometry — the camera would start inside a wall.`]);
  const inTreeVp = vpProbe.inTree.map((t, i) => (t ? `${viewpoints[i].id} (nearest ${vpProbe.treeDist[i]} m${vpProbe.treeInView[i] ? `, one ${vpProbe.treeInView[i].along} m dead ahead` : ''})` : null)).filter(Boolean);
  if (inTreeVp.length) measured.push(['Viewpoint camera blocked by a street tree', 'high', `${inTreeVp.join('; ')} — within ${TREE_CLEAR_M} m of a placed tree, or with one inside the 2.5 m sight corridor for the first 18 m. Trees have no collider, so \`probePath\` calls such a camera clear while the frame is mostly foliage.`]);
  if (life.after.pedNaN > 0 || life.after.vehicleNaN > 0) measured.push(['NaN agent positions', 'high', `${life.after.pedNaN} pedestrians / ${life.after.vehicleNaN} vehicles at a non-finite position after ${SIM_LIFE_S} s.`]);
  if (world.signalReport && world.signalReport.osmUsed < (gis.signals || []).length) {
    measured.push(['Most OSM signal nodes collapse onto few junctions', 'medium',
      `${gis.signals.length} OSM \`highway=traffic_signals\` nodes snap onto only ${world.signalReport.fromOsm} fitted junctions (${world.signalReport.osmUsed} matched within 30 m); the straight-fit grid has ${world.crossings} crossings where the real network has far more, so signal placement is coarse. ${world.signalReport.fromMajor} further junctions were signalised by the major×major fallback.`]);
  }
  const laggards = lights.routes.filter((r) => r.redStops === 0);
  if (laggards.length === lights.routes.length) measured.push(['No route vehicle stopped at a red light', 'high', `Over ${SIM_LIGHT_S} s of simulated time none of the ${lights.routes.length} route vehicles came to rest at a signalised stop bar.`]);

  const defects = [...DEFECTS, ...measured];
  const redStopTotal = lights.routes.reduce((a, r) => a + r.redStops, 0);
  const anyRedStop = lights.routes.some((r) => r.redStops > 0);

  const md = report({ world, bootMs, softwareRender, errors, shots, vpProbe, life, lights, render, defects, redStopTotal, anyRedStop });
  fs.writeFileSync(REPORT, md);
  fs.writeFileSync(path.join(OUT_DIR, 'qa.json'), JSON.stringify({ generatedAt: new Date().toISOString(), world, bootMs, softwareRender, errors, shots, vpProbe, life, lights, render }, null, 1));
  console.log(`\nwrote ${REPORT}`);
  console.log(`life  ${life.before.pedestrians} peds / ${life.before.vehicles} vehicles -> after ${SIM_LIFE_S}s ${life.after.pedestrians} / ${life.after.vehicles}; NaN ${life.after.pedNaN}+${life.after.vehicleNaN}`);
  console.log(`lights route red stops ${redStopTotal} (${lights.routes.filter((r) => r.redStops).length}/${lights.routes.length} routes)`);
  console.log(`render ${render.calls} draw calls, ${fmt(render.triangles)} triangles`);
  if (!anyRedStop) process.exitCode = 1;
  if (blockedVp.length || inTreeVp.length) process.exitCode = 1;
  if (errors.length) process.exitCode = 1;
  }

  try {
    await body();
  } finally {
    await browser.close().catch(() => {});
  }
}

function report(d) {
  const m = gis.meta, c = m.counts, L = d.lights.lightStats;
  const bs = d.world.ground?.bySurface || {};
  const surfRows = Object.entries(bs).map(([k, v]) => `| \`${k}\` | ${fmt(v.patches)} | ${fmt(v.tris)} |`).join('\n');
  const vpRows = d.shots.map((s, i) => {
    const p = d.vpProbe.probes[i], dist = d.vpProbe.treeDist[i];
    const iv = d.vpProbe.treeInView[i];
    const verdict = p.blocked ? '**BLOCKED**' : d.vpProbe.inTree[i] ? `**BLOCKED-BY-TREE** (${iv ? `${iv.along} m ahead` : `${dist} m`})` : `clear (nearest tree ${dist ?? '—'} m)`;
    return `| \`${s.id}\` | ${s.title} | ${d.vpProbe.pts[i].map((n) => n.toFixed(1)).join(', ')} | ${verdict} | ![${s.id}](${s.file}) |`;
  }).join('\n');
  const routeRows = routes.map((r, i) => {
    const l = d.lights.routes[i] || {};
    return `| ${r.name} | ${r.street} | ${r.dir} | ${r.lane || 'any'} | ${(r.stops || []).length} | ${l.minSpeed ?? '—'} | ${l.maxSpeed ?? '—'} | ${l.redStops ?? 0} | ${l.served ?? 0} |`;
  }).join('\n');
  const defectRows = d.defects.map(([t, sev, text], i) => `${i + 1}. **${t}** _(${sev})_ — ${text}`).join('\n');

  return `# FINAL QA REPORT — Pangyo Techno Valley (pangyo-technovalley)

Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')}Z by \`tools/qa/qa_report.mjs\` (stage 3).
${d.softwareRender ? '\n> Rendered with the SwiftShader software rasteriser (no GPU was available to the headless browser).\n' : ''}
## Reconstruction boundary

WGS84 bbox ${m.bboxWgs84.south}–${m.bboxWgs84.north} N, ${m.bboxWgs84.west}–${m.bboxWgs84.east} E (≈ 1.28 km N–S × 1.59 km E–W): 판교테크노밸리 and 판교역/알파돔, centred on the NCSOFT R&D Center. Local frame origin = the area centroid of OSM way 694434545 (엔씨소프트 R&D 센터), lat ${gis.origin.lat}, lon ${gis.origin.lon}, ground elevation ${gis.origin.elev_m} m; grid bearing ${gis.gridBearingDeg}° (local +x = grid east, +z = grid south, y = 0 at the NC building's ground level).

## Data provenance and attribution

| Layer | Source | Notes |
|---|---|---|
| Buildings, building parts, roads, POIs, signals, crossings, benches | **OpenStreetMap** via the Overpass API (\`tools/geo/fetch_osm.mjs\`), snapshot \`${m.osmTimestamp}\` | ${c.buildings} footprints (${c.buildingsInsideBbox} inside the bbox) + ${c.buildingParts} parts, ${c.streets} highway ways, ${c.pois} POIs, ${c.signals} traffic-signal nodes, ${c.crossings} crossing nodes |
| Ground cover (landuse / leisure / parking / water) | **OpenStreetMap**, fetched by \`fetch_osm.mjs --augment\` and binned by \`build_gis.mjs\` | ${c.landuse ?? d.world.landuse} polygons — added in stage 3 for the block fill |
| Elevation | **OpenTopoData \`srtm30m\`** (SRTM 1-arcsec, EGM96), 25 m grid; per-point fallback AWS Terrarium tiles zoom 14 | ${m.elevationSource ? 'as recorded in `gis.json.meta.elevationSource`' : ''} |
| Building heights | OSM \`height\` → \`building:levels × 3.6 + 1\` → \`heights_override.json\` → area default | resolution order recorded per building in \`heightSource\` |
| Bus routes / stop positions | OSM \`public_transport=platform\` nodes and their \`route_ref\` tags | 6 routes authored in \`src/data/recon/routes.json\`; **no timetable is modelled** |
| Models / textures | Generated in-repo (BPL kit + procedural Three.js materials), MIT | no third-party assets |

> **${m.osmAttribution}**
> SRTM elevation data is public domain (NASA/USGS).
> Reference photography is **not** redistributable (Kakao/Naver road view) and is therefore not committed — see \`photos/README.md\`.

## What is real, and what is approximated

**Real (measured from public data):** building footprints and their positions; ${gis.buildings.filter((b) => b.heightSource !== 'area-default').length} of ${c.buildings} building heights; the street network's names, widths (OSM \`width\` or \`lanes × 3.25 m\`), lane counts and one-way flags; traffic-signal and crossing node positions; bus-stop platform positions and route numbers; ground-cover polygons; terrain shape at 30 m horizontal resolution.

**Approximated (authored or inferred):** every street is a straight, axis-aligned line (see defect 8); façades are procedural; the three hero modules (NC R&D Center, 판교역 canopies, 알파돔 tower massing) are procedural Three.js geometry, not surveyed models; there are no interiors; the terrain is a smoothed SRTM heightfield with no cut-and-fill; block fill is a flat patch draped on that heightfield; signal timing is a synthetic ${L.cycle} s coordinated cycle, not the real plan; the pedestrian and vehicle populations are synthetic.

## Counts

| Metric | Value |
|---|---|
| OSM building footprints | ${fmt(d.world.buildings)} (+ ${fmt(d.world.buildingParts)} building parts) |
| Buildings with procedural façades | ${fmt(d.world.detailed)} |
| Hero modules | ${fmt(d.world.heroes)} building(s) + 3 station canopies |
| Fitted streets | ${fmt(d.world.streets)} (${streetsSpec.meta.counts.ns} ns / ${streetsSpec.meta.counts.ew} ew, ${streetsSpec.meta.counts.dropped} dropped) |
| Grid crossings | ${fmt(d.world.crossings)}, of which **${fmt(d.world.signalled)} signalised** (${d.world.signalReport.fromOsm} from OSM signal nodes, ${d.world.signalReport.fromMajor} from the major×major fallback) |
| Signal masts placed / lamp heads driven | ${fmt(d.world.props.signalMasts)} / ${fmt(d.lights.lightStats.heads)} |
| Street lamps / trees / benches placed | ${fmt(d.world.props.lamps)} / ${fmt(d.world.props.trees)} / ${fmt(d.world.props.benches)} |
| Ground-cover polygons used | ${fmt(d.world.ground.landuseAreas)} OSM areas + ${fmt(d.world.ground.blockPatches)} fallback block patches |
| Block-fill draw calls / triangles | **${fmt(d.world.ground.meshes)}** / ${fmt(d.world.ground.tris)} |
| Reference viewpoints | ${viewpoints.length} (0 with photos — captures are local only) |
| Tour stops | ${tour.length} |

### Block fill by surface

| Surface | Patches | Triangles |
|---|---|---|
${surfRows}

## Viewpoints

All four cameras are defined in \`src/data/recon/viewpoints.json\` in local coordinates **and** WGS84, and are checked twice before
the screenshot: \`__twin.probePath\` at 0.9 m clearance (walls and structure) **and** against the ${fmt(d.vpProbe.trees)} placed street trees,
which have no collider at all and so pass \`probePath\` while filling the frame: a camera must stand ${TREE_CLEAR_M} m clear of every
tree in plan **and** have none inside a 2.5 m-wide sight corridor for the first 18 m ahead of it.

| id | Title | Camera (x, y, z) | Probe + trees | Screenshot |
|---|---|---|---|---|
${vpRows}

## Life systems

Simulated with \`__twin.stepLife\` (fixed 1/30 s steps), so the numbers are deterministic and independent of frame rate.
The **at boot** column is read once, immediately after \`__twin.ready\`, before the viewpoint screenshots; the world then ran
${(d.life.wallMsBetween / 1000).toFixed(1)} s of real time (four screenshots) before the ${SIM_LIFE_S} s of simulated time in the second column.

| Metric | at boot | + ${SIM_LIFE_S} s simulated |
|---|---|---|
| Pedestrians alive | ${fmt(d.life.before.pedestrians)} | ${fmt(d.life.after.pedestrians)} |
| …on a sidewalk / plaza | ${fmt(d.life.before.pedOnSidewalk)} | ${fmt(d.life.after.pedOnSidewalk)} |
| …at a NaN position | ${d.life.before.pedNaN} | ${d.life.after.pedNaN} |
| Vehicles alive | ${fmt(d.life.before.vehicles)} | ${fmt(d.life.after.vehicles)} |
| …moving / stopped | ${d.life.before.moving} / ${d.life.before.stopped} | ${d.life.after.moving} / ${d.life.after.stopped} |
| …at a NaN position | ${d.life.before.vehicleNaN} | ${d.life.after.vehicleNaN} |
| Route vehicles (of ${routes.length} routes) | ${d.life.before.routeVehiclesAlive}/${d.life.before.routeVehicles} | ${d.life.after.routeVehiclesAlive}/${d.life.after.routeVehicles} |
| Unresolved routes (warnings) | ${d.life.before.routeWarnings.length} | ${d.life.after.routeWarnings.length} |
| Nav graph | ${fmt(d.life.before.navNodes)} nodes / ${fmt(d.life.before.navEdges)} edges | — |
| Pedestrian update cost | ${d.life.before.pedUpdateMs} ms (max ${d.life.before.pedUpdateMaxMs} ms) | ${d.life.after.pedUpdateMs} ms |

### Transit routes

| Route | Street | Dir | Lane | Stops | min m/s | max m/s | red-light stops (${SIM_LIGHT_S} s) | stops served |
|---|---|---|---|---|---|---|---|---|
${routeRows}

### Traffic-light smoke

Over ${SIM_LIGHT_S} s of simulated time the route vehicles came to a full stop at a signalised stop bar showing red/amber **${fmt(d.redStopTotal)} times** (${d.lights.routes.filter((r) => r.redStops > 0).length} of ${d.lights.routes.length} routes) — ${d.anyRedStop ? '**PASS**' : '**FAIL**'}. Background traffic was also observed stopped at red on ${fmt(d.lights.bgRedStopFrames)} of the ${Math.round(SIM_LIGHT_S / SIM_DT / 10)} sampled steps. ${d.lights.routes.filter((r) => r.firstRedStop).slice(0, 1).map((r) => `First observed stop: ${r.name} at t = ${r.firstRedStop.t} s, ${r.firstRedStop.street} junction (${r.firstRedStop.x}, ${r.firstRedStop.z}), signal ${r.firstRedStop.colour}.`).join('')}

Signals: ${d.lights.lightStats.signals} controlled crossings driving ${d.lights.lightStats.heads} lamp heads on a ${L.cycle} s coordinated cycle (NS green ${L.green} → amber ${L.amber} → all-red ${L.allRed} → EW green ${L.green} → amber ${L.amber} → all-red ${L.allRed}, read back from \`TrafficLights.stats()\`) with a per-junction offset. Pedestrian crossings read the same clock.

## Cost

| Metric | Value |
|---|---|
| Cold boot (launch → \`__twin.ready\`, headless${d.softwareRender ? ', software raster' : ''}) | ${fmt(d.bootMs)} ms |
| In-page load (\`[pangyo] load\`) | ${fmt(d.world.loadMs)} ms |
| Draw calls (aerial viewpoint, 1280×720) | ${fmt(d.render.calls)} |
| Triangles submitted | ${fmt(d.render.triangles)} |
| Geometries / textures resident | ${fmt(d.render.geometries)} / ${fmt(d.render.textures)} |
| Page errors during the run | ${d.errors.length ? d.errors.join('; ') : 'none'} |

## Defects

${defectRows}

## Next steps

${NEXT.map((n) => `- ${n}`).join('\n')}
`;
}

await run();
