// Unit + data tests for the Pangyo Techno Valley GIS pipeline.
// Run: npm test   (vitest; the data tests need `npm run geo` to have produced src/data/recon/*.json)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORIGIN_LAT, ORIGIN_LON, ORIGIN_ELEVATION_M, GRID_BEARING_DEG, GRID_NORTH_BEARING_DEG,
  M_PER_DEG_LAT, M_PER_DEG_LON, BBOX_WGS84, geoToLocal, localToGeo, elevToLocalY,
} from '../src/geo/geo.ts';
import { resolveHeight } from '../tools/geo/build_gis.mjs';
import { foldToAxis, onewayLetter, defaultLanes } from '../tools/geo/build_streets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

describe('geo.ts local frame', () => {
  it('maps the origin to (0, 0)', () => {
    const o = geoToLocal(ORIGIN_LAT, ORIGIN_LON);
    expect(Math.abs(o.x)).toBeLessThan(1e-6);
    expect(Math.abs(o.z)).toBeLessThan(1e-6);
    expect(o.y).toBe(0);
  });

  // The design spec quotes 37.39936 / 127.10885 for the NC R&D Center; that is the *vertex mean* of
  // OSM way 694434545. The origin is the *area-weighted* centroid of the same ring (union's ringCentroid),
  // which lies ~11 m west of it along the building's long axis. The building's own local centroid is
  // checked to be at (0, 0) below — that is the invariant the runtime cares about.
  it('maps the NC R&D Center reference coordinate close to the origin', () => {
    const o = geoToLocal(37.39936, 127.10885);
    expect(Math.hypot(o.x, o.z)).toBeLessThan(15);
  });

  it('round-trips a point 500 m away within 0.5 m', () => {
    for (const [x, z] of [[500, 0], [0, 500], [-353.55, 353.55], [300, -400]]) {
      const g = localToGeo(x, z);
      const back = geoToLocal(g.lat, g.lon);
      expect(Math.hypot(back.x - x, back.z - z)).toBeLessThan(0.5);
    }
  });

  it('exports the constants the runtime needs', () => {
    expect(GRID_NORTH_BEARING_DEG).toBeCloseTo(GRID_BEARING_DEG - 90, 6);
    expect(M_PER_DEG_LAT).toBeGreaterThan(110000);
    expect(M_PER_DEG_LON).toBeGreaterThan(80000);
    expect(BBOX_WGS84.south).toBe(37.395);
    expect(BBOX_WGS84.north).toBe(37.4065);
    expect(BBOX_WGS84.west).toBe(127.099);
    expect(BBOX_WGS84.east).toBe(127.117);
    expect(elevToLocalY(ORIGIN_ELEVATION_M)).toBeCloseTo(0, 6);
    expect(elevToLocalY(ORIGIN_ELEVATION_M + 10)).toBeCloseTo(10, 6);
  });
});

describe('build_streets.foldToAxis', () => {
  it('folds bearings onto the grid axes relative to a grid bearing of 0', () => {
    expect(foldToAxis(3)).toBe('ew');
    expect(foldToAxis(92)).toBe('ns');
    expect(foldToAxis(181)).toBe('ew');
    expect(foldToAxis(268)).toBe('ns');
  });
  it('drops a bearing that fits neither axis', () => {
    expect(foldToAxis(45)).toBe(null);
    expect(foldToAxis(135)).toBe(null);
  });
  it('honours a non-zero grid bearing', () => {
    expect(foldToAxis(83, 80)).toBe('ew');
    expect(foldToAxis(170, 80)).toBe('ns');
    expect(foldToAxis(35, 80)).toBe(null);
  });
  it('maps oneway direction letters in the grid frame (grid-north = -z)', () => {
    expect(onewayLetter('ns', { dx: 0, dz: -100 })).toBe('N');
    expect(onewayLetter('ns', { dx: 0, dz: 100 })).toBe('S');
    expect(onewayLetter('ew', { dx: 100, dz: 0 })).toBe('E');
    expect(onewayLetter('ew', { dx: -100, dz: 0 })).toBe('W');
  });
  it('has per-kind default lane counts', () => {
    expect(defaultLanes('primary')).toBe(6);
    expect(defaultLanes('secondary')).toBe(4);
    expect(defaultLanes('tertiary')).toBe(2);
    expect(defaultLanes('residential')).toBe(2);
  });
});

describe('build_gis.resolveHeight', () => {
  const AREA = 900; // area default = min(28, 12 + sqrt(900) * 0.25) = 19.5

  it('prefers OSM height over everything else', () => {
    const r = resolveHeight({ height: '58', 'building:levels': '3' }, { heightM: 12, floors: 2 }, AREA);
    expect(r.heightM).toBe(58);
    expect(r.source).toBe('osm:height');
  });
  it('falls back to building:levels * 3.6 + 1', () => {
    const r = resolveHeight({ 'building:levels': '12' }, { heightM: 12 }, AREA);
    expect(r.heightM).toBeCloseTo(12 * 3.6 + 1, 6);
    expect(r.source).toBe('osm:building:levels*3.6+1');
  });
  it('then uses the override height', () => {
    const r = resolveHeight({}, { heightM: 58, floors: 2 }, AREA);
    expect(r.heightM).toBe(58);
    expect(r.source).toBe('override:heightM');
  });
  it('then the override floor count', () => {
    const r = resolveHeight({}, { floors: 5 }, AREA);
    expect(r.heightM).toBeCloseTo(5 * 3.6, 6);
    expect(r.source).toBe('override:floors*3.6');
  });
  it('finally the area-based default', () => {
    expect(resolveHeight({}, null, AREA).heightM).toBeCloseTo(19.5, 6);
    expect(resolveHeight({}, null, 100).heightM).toBeCloseTo(3.8, 6);
    expect(resolveHeight({}, null, 1e6).heightM).toBeCloseTo(28, 6);
    expect(resolveHeight({}, null, AREA).source).toBe('area-default');
  });
});

describe('generated data (needs npm run geo)', () => {
  const gis = readJson('src/data/recon/gis.json');
  const spec = readJson('src/data/recon/streets_spec.json');
  const elev = readJson('src/data/recon/elevation.json');

  it('has at least 300 buildings', () => {
    expect(gis.buildings.length).toBeGreaterThanOrEqual(300);
  });

  it('places the NCSOFT R&D Center at the origin with height 58 m', () => {
    const nc = gis.buildings.find((b) => b.osmId === 'way/694434545');
    expect(nc).toBeTruthy();
    expect(Math.hypot(nc.centroid[0], nc.centroid[1])).toBeLessThan(1);
    expect(nc.heightM).toBe(58);
  });

  it('carries the OSM attribution and the origin/bearing metadata', () => {
    expect(gis.meta.osmCopyright).toMatch(/openstreetmap/i);
    expect(gis.origin.lat).toBeCloseTo(37.39936, 4);
    expect(gis.origin.lon).toBeCloseTo(127.10885, 3); // area centroid, ~11 m west of the spec's vertex mean
    expect(gis.meta.originSource).toMatch(/way 694434545/);
    expect(gis.gridBearingDeg).toBeGreaterThan(45);
    expect(gis.gridBearingDeg).toBeLessThanOrEqual(135);
  });

  it('has an elevation grid in the union recon shape', () => {
    for (const k of ['source', 'fetchedAt', 'grid', 'stats', 'origin', 'crosscheck', 'samples', 'intersections', 'buildingCentroids']) {
      expect(elev, `missing key ${k}`).toHaveProperty(k);
    }
    expect(elev.grid.spacingM).toBe(25);
    expect(elev.samples.length).toBe(elev.grid.rows * elev.grid.cols);
    expect(elev.stats.minM).toBeLessThan(elev.stats.maxM);
  });

  // NOTE: the design spec assumed 판교역로 runs east–west. In OSM it does not: all seven ways named
  // 판교역로 inside the bbox run north–south at a constant longitude (127.1097), 85 m east of the NC
  // R&D Center — whose postal address is 판교역로 227. The east–west arterials here are 판교로 and
  // 대왕판교로606번길. The fit follows the data.
  it('fits at least 8 streets, including 판교역로 (ns), 대왕판교로 (ns) and 판교로 (ew)', () => {
    expect(spec.streets.length).toBeGreaterThanOrEqual(8);
    const by = (n) => spec.streets.find((s) => s.name === n);
    const pg = by('판교역로'), dw = by('대왕판교로'), pr = by('판교로');
    expect(pg, '판교역로 missing').toBeTruthy();
    expect(pg.axis).toBe('ns');
    expect(pg.sidewalk).toBe(4.5);
    expect(dw, '대왕판교로 missing').toBeTruthy();
    expect(dw.axis).toBe('ns');
    expect(pr, '판교로 missing').toBeTruthy();
    expect(pr.axis).toBe('ew');
    expect(spec.streets.some((s) => s.axis === 'ns')).toBe(true);
    expect(spec.streets.some((s) => s.axis === 'ew')).toBe(true);
  });

  it('keeps every fitted street within the axis tolerance and lists the rest as dropped', () => {
    for (const s of spec.streets) expect(s.deviationDeg, `${s.name} deviation`).toBeLessThanOrEqual(25);
    for (const d of spec.meta.dropped) {
      expect(typeof d.name).toBe('string');
      expect(d.deviationDeg).toBeGreaterThan(25);
    }
  });

  it('emits street specs in the runtime StreetSpec shape', () => {
    for (const s of spec.streets) {
      expect(typeof s.name).toBe('string');
      expect(['ns', 'ew']).toContain(s.axis);
      for (const k of ['c', 'from', 'to', 'width', 'sidewalk', 'lanes']) expect(Number.isFinite(s[k]), `${s.name}.${k}`).toBe(true);
      expect(s.from).toBeLessThan(s.to);
      expect(s.width).toBeGreaterThan(0);
      expect([null, 'N', 'S', 'E', 'W']).toContain(s.oneway);
      expect(typeof s.parking.left).toBe('boolean');
      expect(typeof s.parking.right).toBe('boolean');
    }
    expect(Array.isArray(spec.meta.dropped)).toBe(true);
  });
});
