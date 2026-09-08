#!/usr/bin/env node
/**
 * build_gis.mjs — rebuilds src/data/recon/gis.json from
 *   src/data/recon/osm_raw.json          (Overpass API dump, `out geom`)
 *   src/data/recon/elevation.json        (OpenTopoData srtm30m samples; optional — nulls if missing)
 *   src/data/recon/heights_override.json (hand-curated building heights/styles; optional)
 *
 * Adapted from union-square-sf/tools/geo/build_gis.mjs, generalised: the origin is any OSM way id,
 * the grid bearing is fitted from every named road in the bbox (no hard-coded street names), and there
 * is no plaza/monument/tram special-casing.
 *
 * The geodesy here MUST mirror src/geo/geo.ts (same origin, same constants, same rotation) — this script
 * generates that file when it is missing and warns (and regenerates) when it has drifted.
 *
 * OSM data © OpenStreetMap contributors, ODbL.
 * Run: node tools/geo/build_gis.mjs      (from the package root, plain ESM, no deps)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BBOX, LAT0_DEG, D2R, M_PER_DEG_LAT, M_PER_DEG_LON, ORIGIN_WAY_ID, FALLBACK_ORIGIN, LEVEL_HEIGHT_M, CLIP_MARGIN_M } from './constants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW_PATH = path.join(ROOT, 'src/data/recon/osm_raw.json');
const ELEV_PATH = path.join(ROOT, 'src/data/recon/elevation.json');
const OVERRIDE_PATH = path.join(ROOT, 'src/data/recon/heights_override.json');
const OUT_PATH = path.join(ROOT, 'src/data/recon/gis.json');
const GEO_TS_PATH = path.join(ROOT, 'src/geo/geo.ts');
const OSM_COPYRIGHT_FALLBACK = 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.';

export { BBOX, M_PER_DEG_LAT, M_PER_DEG_LON };

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; importing this module must not run the pipeline)
// ---------------------------------------------------------------------------
export const r2 = (v) => Math.round(v * 100) / 100;

export const inBbox = (lat, lon, m = 0) => {
  const dlat = m / M_PER_DEG_LAT, dlon = m / M_PER_DEG_LON;
  return lat >= BBOX.south - dlat && lat <= BBOX.north + dlat && lon >= BBOX.west - dlon && lon <= BBOX.east + dlon;
};

/** Area-weighted centroid of a closed lat/lon ring, computed relative to the first vertex (avoids cancellation). */
export function ringCentroid(g) {
  const ox = g[0].lon, oy = g[0].lat;
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < g.length - 1; i++) {
    const x0 = g[i].lon - ox, y0 = g[i].lat - oy, x1 = g[i + 1].lon - ox, y1 = g[i + 1].lat - oy;
    const c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (Math.abs(A) < 1e-16) return { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.lon, 0) / g.length };
  A /= 2;
  return { lat: oy + cy / (6 * A), lon: ox + cx / (6 * A) };
}

/** Signed area of a local [[x,z],...] ring as seen from above (+y). Positive = counter-clockwise from above. */
export function signedAreaLocal(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[i + 1];
    a += x0 * (-z1) - x1 * (-z0); // use (x, north) = (x, -z) so that CCW-from-above is positive
  }
  return a / 2;
}

export function parseLengthM(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*(m|meters?|metres?)?$/); if (m) return +m[1];
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*(ft|feet|')$/); if (m) return +m[1] * 0.3048;
  m = s.match(/^(\d+)'\s*(\d+)"?$/); if (m) return +m[1] * 0.3048 + +m[2] * 0.0254;
  return null;
}
export const parseInt0 = (v) => { if (v == null) return null; const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : null; };

/** Area-based default height (same formula as union-square-sf's Buildings.ts). */
export const areaDefaultHeight = (areaM2) => (areaM2 < 150 ? 3.8 : Math.min(28, 12 + Math.sqrt(areaM2) * 0.25));

/**
 * Building height resolution order (fixed for this world):
 *   OSM `height` → `building:levels` × 3.6 + 1 → override.heightM → override.floors × 3.6 → area default.
 * @param {Record<string,string>} tags   OSM tags
 * @param {{heightM?:number,floors?:number}|null} override entry from heights_override.json
 * @param {number} areaM2 footprint area
 * @returns {{heightM:number, source:string, levels:number|null}}
 */
export function resolveHeight(tags = {}, override = null, areaM2 = 0) {
  const h = parseLengthM(tags.height);
  const levels = parseInt0(tags['building:levels']);
  if (h != null) return { heightM: r2(h), source: 'osm:height', levels };
  if (levels != null) return { heightM: r2(levels * LEVEL_HEIGHT_M + 1), source: `osm:building:levels*${LEVEL_HEIGHT_M}+1`, levels };
  if (override?.heightM != null) return { heightM: r2(override.heightM), source: 'override:heightM', levels };
  if (override?.floors != null) return { heightM: r2(override.floors * LEVEL_HEIGHT_M), source: `override:floors*${LEVEL_HEIGHT_M}`, levels };
  return { heightM: r2(areaDefaultHeight(areaM2)), source: 'area-default', levels };
}

/**
 * Length-weighted quadrupled-angle mean of street bearings: returns the bearing of the grid axis
 * nearest to true north (deg, in (-45, 45]). Doubling merges opposite directions, quadrupling also
 * merges the two perpendicular axes of a rectangular grid — so N–S and E–W streets both vote.
 */
export function gridAxisFit(segs) {
  let sx = 0, sy = 0, L = 0;
  for (const s of segs) { const t = 4 * s.br * D2R; sx += s.len * Math.cos(t); sy += s.len * Math.sin(t); L += s.len; }
  let ax = L > 0 ? Math.atan2(sy, sx) / D2R / 4 : 0;
  while (ax > 45) ax -= 90;
  while (ax <= -45) ax += 90;
  return { northAxisDeg: +ax.toFixed(3), gridEastBearingDeg: +(ax + 90).toFixed(3), lengthM: Math.round(L), segments: segs.length };
}

/** Length-weighted axial (doubled-angle) mean, 0..180 — used for the per-street report. */
export function axialMean(segs) {
  let sx = 0, sy = 0, L = 0;
  for (const s of segs) { const t = 2 * s.br * D2R; sx += s.len * Math.cos(t); sy += s.len * Math.sin(t); L += s.len; }
  let ax = L > 0 ? Math.atan2(sy, sx) / D2R / 2 : 0; if (ax < 0) ax += 180;
  return { axisDeg: +ax.toFixed(3), lengthM: Math.round(L), segments: segs.length };
}

/**
 * Ground-cover class of an OSM area: which runtime material paints it and in what order.
 * `surface` is one of paving | paving_dark | grass | water | soil; `priority` breaks the ties
 * where areas nest (a pitch inside a park inside a commercial block) — higher draws on top.
 * Returns null for anything that is not ground cover.
 */
export function landuseClass(t) {
  const at = (kind, surface, priority) => ({ kind, surface, priority });
  const lu = t.landuse, le = t.leisure, na = t.natural;
  if (na === 'water' || lu === 'reservoir' || lu === 'basin' || t.waterway === 'riverbank' || na === 'wetland') return at(na ? `natural=${na}` : `landuse=${lu || 'basin'}`, 'water', 5);
  if (t.amenity === 'parking') return at('amenity=parking', 'paving_dark', 4);
  if (le === 'pitch' || le === 'playground' || le === 'track') return at(`leisure=${le}`, 'soil', 3);
  if (le === 'park' || le === 'garden' || le === 'common' || le === 'village_green' || le === 'nature_reserve') return at(`leisure=${le}`, 'grass', 2);
  if (lu === 'grass' || lu === 'meadow' || lu === 'forest' || lu === 'village_green' || lu === 'recreation_ground' || lu === 'greenfield' || lu === 'cemetery' || lu === 'allotments' || lu === 'orchard') return at(`landuse=${lu}`, 'grass', 2);
  if (na === 'wood' || na === 'scrub' || na === 'grassland') return at(`natural=${na}`, 'grass', 2);
  if (na === 'sand' || na === 'bare_rock' || lu === 'brownfield' || lu === 'landfill' || lu === 'quarry') return at(na ? `natural=${na}` : `landuse=${lu}`, 'soil', 2);
  if (lu === 'commercial' || lu === 'retail' || lu === 'industrial' || lu === 'construction' || lu === 'education' || lu === 'institutional' || lu === 'religious') return at(`landuse=${lu}`, 'paving', 1);
  if (lu === 'residential' || lu === 'garages') return at(`landuse=${lu}`, 'paving_dark', 1);
  if (le === 'bleachers' || le === 'fitness_centre' || le === 'sports_centre') return at(`leisure=${le}`, 'paving', 1);
  return null;
}

export function outerRing(e) {
  if (e.type === 'way') return e.geometry || null;
  if (e.type === 'relation') {
    const outers = (e.members || []).filter((m) => (m.role === 'outer' || m.role === 'outline') && m.geometry);
    if (!outers.length) return null;
    let best = null, bestA = -1;
    for (const m of outers) {
      const g = m.geometry; const ox = g[0].lon, oy = g[0].lat; let a = 0;
      for (let i = 0; i < g.length - 1; i++) a += (g[i].lon - ox) * (g[i + 1].lat - oy) - (g[i + 1].lon - ox) * (g[i].lat - oy);
      if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = g; }
    }
    return best;
  }
  return null;
}

const address = (t) => {
  if (!t) return null;
  const parts = [t['addr:street'], t['addr:housenumber']].filter(Boolean);
  return parts.length ? parts.join(' ') : (t['addr:full'] || null);
};

// ---------------------------------------------------------------------------
// geo.ts generation
// ---------------------------------------------------------------------------
export function geoTsSource({ origin, originElevation, gridBearingDeg, fit }) {
  const gn = +(gridBearingDeg - 90).toFixed(3);
  return `/**
 * geo.ts — local coordinate frame for the Pangyo Techno Valley (판교테크노밸리, Seongnam) digital twin.
 *
 * GENERATED by tools/geo/build_gis.mjs — edit that script, not this file.
 * No dependencies. Mirrors the math in tools/geo/build_gis.mjs (which generates src/data/recon/gis.json).
 *
 * FRAME (right-handed, Three.js convention, metres):
 *   x = "grid-east"  : along the E–W arterials (판교로, 대왕판교로606번길), true bearing GRID_BEARING_DEG
 *   y = up           : metres above the origin ground elevation (ORIGIN_ELEVATION_M), so y = 0 at the origin
 *   z = "grid-south" : along the N–S arterials (판교역로, 대왕판교로, 분당내곡로), true bearing GRID_BEARING_DEG + 90
 *   Grid-north is therefore -z (true bearing ${gn}).
 *
 * ORIGIN: area centroid of the NCSOFT R&D Center footprint, OSM way ${ORIGIN_WAY_ID}
 *   (엔씨소프트R&D센터, building:levels 12, height 58 m).
 *
 * GRID BEARING: length-weighted quadrupled-angle mean of every named ${'`highway`'} segment inside the bbox
 *   (quadrupling folds both grid axes onto one estimate). Fitted from ${fit.segments} segments /
 *   ${fit.lengthM} m of roadway; the grid is rotated ${Math.abs(gn).toFixed(3)} deg ${gn < 0 ? 'counter-clockwise' : 'clockwise'} from true north.
 *
 * PROJECTION: equirectangular about LAT0 = ${LAT0_DEG} deg. Metres per degree from the standard WGS84 series
 *   (Snyder / NGS): M_PER_DEG_LAT = 111132.954 - 559.822 cos(2 phi) + 1.175 cos(4 phi) = ${M_PER_DEG_LAT.toFixed(3)}
 *                   M_PER_DEG_LON = 111412.84 cos(phi) - 93.5 cos(3 phi) + 0.118 cos(5 phi) = ${M_PER_DEG_LON.toFixed(3)}
 *
 * ELEVATION: ORIGIN_ELEVATION_M is the OpenTopoData srtm30m value at the origin (metres above the EGM96 geoid).
 *
 * OSM data © OpenStreetMap contributors (ODbL). SRTM elevation is public domain.
 */

export const ORIGIN_LAT = ${origin.lat};
export const ORIGIN_LON = ${origin.lon};
/** Ground elevation at ORIGIN, metres (OpenTopoData srtm30m). y = 0 here. */
export const ORIGIN_ELEVATION_M = ${originElevation};
/** True bearing (deg clockwise from north) of the local +x axis (grid-east). */
export const GRID_BEARING_DEG = ${gridBearingDeg};
/** True bearing of grid-north (local -z). */
export const GRID_NORTH_BEARING_DEG = GRID_BEARING_DEG - 90;

export const LAT0_DEG = ${LAT0_DEG};
export const M_PER_DEG_LAT = ${+M_PER_DEG_LAT.toFixed(3)};
export const M_PER_DEG_LON = ${+M_PER_DEG_LON.toFixed(3)};

/** WGS84 bounding box of the reconnaissance dataset. */
export const BBOX_WGS84 = { south: ${BBOX.south}, west: ${BBOX.west}, north: ${BBOX.north}, east: ${BBOX.east} } as const;

const D2R = Math.PI / 180;
const SIN_B = Math.sin(GRID_BEARING_DEG * D2R);
const COS_B = Math.cos(GRID_BEARING_DEG * D2R);

export interface LocalXYZ { x: number; y: number; z: number }
export interface GeoLatLon { lat: number; lon: number }

/**
 * WGS84 (lat, lon[, elevation m]) -> local frame.
 * If \`elev\` is omitted, y = 0.
 */
export function geoToLocal(lat: number, lon: number, elev?: number): LocalXYZ {
  const dE = (lon - ORIGIN_LON) * M_PER_DEG_LON; // metres true-east of origin
  const dN = (lat - ORIGIN_LAT) * M_PER_DEG_LAT; // metres true-north of origin
  // grid-east unit vector in (E, N) is (sin B, cos B); grid-north unit vector is (-cos B, sin B)
  const x = dE * SIN_B + dN * COS_B;
  const gridNorth = -dE * COS_B + dN * SIN_B;
  const y = elev === undefined ? 0 : elev - ORIGIN_ELEVATION_M;
  return { x, y, z: -gridNorth };
}

/** Local (x, z) -> WGS84 (lat, lon). Inverse of geoToLocal (ignores y). */
export function localToGeo(x: number, z: number): GeoLatLon {
  const gridNorth = -z;
  const dE = x * SIN_B - gridNorth * COS_B;
  const dN = x * COS_B + gridNorth * SIN_B;
  return { lat: ORIGIN_LAT + dN / M_PER_DEG_LAT, lon: ORIGIN_LON + dE / M_PER_DEG_LON };
}

/** Absolute elevation (m) -> local y. */
export const elevToLocalY = (elevM: number): number => elevM - ORIGIN_ELEVATION_M;
/** Alias kept for parity with union-square-sf's geo.ts. */
export const elevToY = elevToLocalY;
/** Local y -> absolute elevation (m). */
export const yToElev = (y: number): number => y + ORIGIN_ELEVATION_M;

/**
 * Rotate a true-north bearing (deg CW from north) into a local heading:
 * returns the angle in radians measured from +x toward +z (i.e. clockwise when viewed from above).
 */
export function bearingToLocalRad(bearingDeg: number): number {
  return (bearingDeg - GRID_BEARING_DEG) * D2R;
}

/** Local bounding box of BBOX_WGS84 (axis-aligned in the local frame, so slightly larger than the rotated bbox). */
export function localBbox(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const c = [
    geoToLocal(BBOX_WGS84.south, BBOX_WGS84.west), geoToLocal(BBOX_WGS84.south, BBOX_WGS84.east),
    geoToLocal(BBOX_WGS84.north, BBOX_WGS84.west), geoToLocal(BBOX_WGS84.north, BBOX_WGS84.east),
  ];
  return {
    minX: Math.min(...c.map((p) => p.x)), maxX: Math.max(...c.map((p) => p.x)),
    minZ: Math.min(...c.map((p) => p.z)), maxZ: Math.max(...c.map((p) => p.z)),
  };
}
`;
}

/** Generate geo.ts when missing; warn and regenerate when its constants have drifted. */
export function syncGeoTs(tsPath, params) {
  const src = geoTsSource(params);
  if (!fs.existsSync(tsPath)) {
    fs.mkdirSync(path.dirname(tsPath), { recursive: true });
    fs.writeFileSync(tsPath, src);
    console.log(`generated ${tsPath}`);
    return 'generated';
  }
  const ts = fs.readFileSync(tsPath, 'utf8');
  const num = (name) => { const m = ts.match(new RegExp(`export const ${name}\\s*=\\s*(-?[\\d.]+)`)); return m ? +m[1] : null; };
  const checks = [['ORIGIN_LAT', params.origin.lat], ['ORIGIN_LON', params.origin.lon], ['GRID_BEARING_DEG', params.gridBearingDeg], ['ORIGIN_ELEVATION_M', params.originElevation]];
  let drift = false;
  for (const [n, v] of checks) {
    const tv = num(n);
    if (tv == null || v == null || Math.abs(tv - v) > 1e-6) { console.warn(`WARN geo.ts ${n}=${tv} differs from computed ${v}`); drift = true; }
  }
  if (drift) { fs.writeFileSync(tsPath, src); console.log(`regenerated ${tsPath}`); return 'regenerated'; }
  return 'ok';
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
const ROAD_KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];
const BEARING_FIT_KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street'];

function main() {
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
  const els = raw.elements;
  const byId = new Map(els.map((e) => [`${e.type}/${e.id}`, e]));
  let elev = null;
  if (fs.existsSync(ELEV_PATH)) elev = JSON.parse(fs.readFileSync(ELEV_PATH, 'utf8'));
  else console.warn('WARN: elevation.json missing — elevations will be null');
  let overrides = {};
  if (fs.existsSync(OVERRIDE_PATH)) overrides = JSON.parse(fs.readFileSync(OVERRIDE_PATH, 'utf8'));

  // 1. ORIGIN = area centroid of the NCSOFT R&D Center footprint
  const originWay = byId.get(`way/${ORIGIN_WAY_ID}`);
  let ORIGIN, originSource;
  if (originWay && originWay.geometry && originWay.geometry.length >= 4) {
    const c = ringCentroid(originWay.geometry);
    ORIGIN = { lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6) };
    originSource = `centroid of OSM way ${ORIGIN_WAY_ID} (${originWay.tags?.name || 'NCSOFT R&D Center'})`;
  } else {
    ORIGIN = { ...FALLBACK_ORIGIN };
    originSource = `fallback constant (OSM way ${ORIGIN_WAY_ID} not found in the dump)`;
  }

  // 2. GRID BEARING — length-weighted quadrupled-angle mean of every named roadway segment in the bbox.
  const perName = new Map();
  const allSegs = [];
  for (const w of els) {
    if (w.type !== 'way' || !w.tags?.highway || !BEARING_FIT_KINDS.includes(w.tags.highway)) continue;
    const name = w.tags.name;
    if (!name) continue;
    const g = w.geometry || [];
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1], b = g[i];
      if (!(inBbox(a.lat, a.lon) && inBbox(b.lat, b.lon))) continue;
      const dx = (b.lon - a.lon) * M_PER_DEG_LON, dy = (b.lat - a.lat) * M_PER_DEG_LAT;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const seg = { len, br: Math.atan2(dx, dy) / D2R };
      allSegs.push(seg);
      if (!perName.has(name)) perName.set(name, []);
      perName.get(name).push(seg);
    }
  }
  const gridFit = gridAxisFit(allSegs);
  const GRID_BEARING_DEG = gridFit.gridEastBearingDeg;
  const perStreetFits = [...perName.entries()]
    .map(([name, segs]) => ({ name, ...axialMean(segs) }))
    .sort((a, b) => b.lengthM - a.lengthM)
    .slice(0, 12);
  const bearingReport = {
    method: 'length-weighted quadrupled-angle mean of every named OSM roadway segment inside the bbox (both grid axes vote)',
    combinedFit: gridFit, perStreet: perStreetFits,
    gridEastBearingDeg: GRID_BEARING_DEG, gridNorthBearingDeg: +(GRID_BEARING_DEG - 90).toFixed(3),
  };

  // 3. Elevation lookup
  let ORIGIN_ELEVATION_M = null, gridInterp = null;
  const centroidElev = new Map(), intersectionElev = new Map();
  if (elev) {
    ORIGIN_ELEVATION_M = elev.origin?.elev_m ?? null;
    const samples = elev.samples.filter((s) => s.elev_m != null);
    const lats = [...new Set(samples.map((s) => s.lat))].sort((a, b) => a - b);
    const lons = [...new Set(samples.map((s) => s.lon))].sort((a, b) => a - b);
    const cell = new Map(samples.map((s) => [`${s.lat},${s.lon}`, s.elev_m]));
    const get = (i, j) => cell.get(`${lats[i]},${lons[j]}`);
    const bracket = (arr, v) => { let i = 0; while (i < arr.length - 2 && arr[i + 1] <= v) i++; return i; };
    gridInterp = (lat, lon) => {
      const i = bracket(lats, lat), j = bracket(lons, lon);
      const t = Math.min(1, Math.max(0, (lat - lats[i]) / (lats[i + 1] - lats[i])));
      const u = Math.min(1, Math.max(0, (lon - lons[j]) / (lons[j + 1] - lons[j])));
      const q = [get(i, j), get(i, j + 1), get(i + 1, j), get(i + 1, j + 1)];
      if (q.some((v) => v == null)) { const ok = q.filter((v) => v != null); return ok.length ? ok.reduce((a, b) => a + b) / ok.length : null; }
      return (1 - t) * ((1 - u) * q[0] + u * q[1]) + t * ((1 - u) * q[2] + u * q[3]);
    };
    for (const c of elev.buildingCentroids || []) if (c.elev_m != null) centroidElev.set(c.osmId, c.elev_m);
    for (const it of elev.intersections || []) if (it.elev_m != null) intersectionElev.set(it.name, it.elev_m);
  }
  const elevAt = (lat, lon) => (gridInterp ? gridInterp(lat, lon) : null);
  const relY = (absElev) => (absElev == null || ORIGIN_ELEVATION_M == null ? null : r2(absElev - ORIGIN_ELEVATION_M));

  // 4. Coordinate transform (mirror of geo.ts)
  const SIN_B = Math.sin(GRID_BEARING_DEG * D2R), COS_B = Math.cos(GRID_BEARING_DEG * D2R);
  const geoToLocal = (lat, lon, elevM) => {
    const dE = (lon - ORIGIN.lon) * M_PER_DEG_LON, dN = (lat - ORIGIN.lat) * M_PER_DEG_LAT;
    const x = dE * SIN_B + dN * COS_B;
    const gridNorth = -dE * COS_B + dN * SIN_B;
    return { x, y: relY(elevM) ?? 0, z: -gridNorth };
  };
  const toXZ = (p) => { const l = geoToLocal(p.lat, p.lon); return [r2(l.x), r2(l.z)]; };
  const ringToLocal = (g) => {
    const ring = g.map(toXZ);
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    if (signedAreaLocal(ring) < 0) ring.reverse();
    return ring;
  };
  function clipRuns(g) {
    const runs = []; let cur = [];
    for (const p of g) {
      if (inBbox(p.lat, p.lon, CLIP_MARGIN_M)) cur.push(p);
      else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    return runs.filter((r) => r.length >= 2);
  }
  const polylineLength = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return r2(L); };

  function repPoint(e) {
    if (e.type === 'node') return { lat: e.lat, lon: e.lon };
    const ring = outerRing(e);
    if (ring && ring.length >= 4 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lon === ring[ring.length - 1].lon) return ringCentroid(ring);
    const g = e.geometry || ring;
    if (!g || !g.length) return null;
    return { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.lon, 0) / g.length };
  }

  // 5. Buildings and building:parts
  const skipped = { noGeometry: 0, tooFewPoints: 0 };
  function buildingRecord(e, partMode = false) {
    const t = e.tags || {};
    const ring = outerRing(e);
    if (!ring) { skipped.noGeometry++; return null; }
    if (ring.length < 4) { skipped.tooFewPoints++; return null; }
    const footprint = ringToLocal(ring);
    const c = ringCentroid(ring);
    const centroidLocal = toXZ(c);
    const areaM2 = r2(Math.abs(signedAreaLocal(footprint)));
    const osmId = `${e.type}/${e.id}`;
    const ov = overrides[osmId] || null;
    const { heightM, source: heightSource, levels } = resolveHeight(t, ov, areaM2);
    const minH = parseLengthM(t.min_height);
    const minLevels = parseInt0(t['building:min_level']);
    const absElev = centroidElev.get(osmId) ?? elevAt(c.lat, c.lon);
    const holes = e.type === 'relation' ? (e.members || []).filter((m) => m.role === 'inner' && m.geometry).map((m) => ringToLocal(m.geometry)) : [];
    return {
      osmId, name: ov?.name || t.name || null, address: address(t), footprint, holes: holes.length ? holes : undefined,
      heightM, heightSource, levels, minHeightM: minH != null ? r2(minH) : null, minLevels,
      style: ov?.style ?? null,
      centroid: centroidLocal, centroidGeo: { lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6) },
      groundElevM: relY(absElev), groundElevAbsM: absElev == null ? null : r2(absElev),
      groundElevSource: centroidElev.has(osmId) ? 'srtm30m@centroid' : (absElev == null ? null : 'bilinear_from_25m_grid'),
      areaM2, insideBbox: inBbox(c.lat, c.lon),
      kind: partMode ? 'building:part' : 'building', tags: t,
    };
  }
  const buildings = [], buildingParts = [];
  const buildingWayIds = new Set(els.filter((e) => e.type === 'way' && e.tags?.building).map((e) => e.id));
  for (const e of els) {
    if (e.type !== 'way' && e.type !== 'relation') continue;
    if (e.type === 'relation' && e.tags?.type === 'building' && (e.members || []).some((m) => m.role === 'outline' && buildingWayIds.has(m.ref))) continue;
    if (e.tags?.building) { const b = buildingRecord(e); if (b) buildings.push(b); }
    else if (e.tags?.['building:part']) { const b = buildingRecord(e, true); if (b) buildingParts.push(b); }
  }
  buildings.sort((a, b) => b.areaM2 - a.areaM2);

  // 6. Streets (all highway ways)
  function linearRecords(e, extra) {
    const t = e.tags || {};
    const runs = clipRuns(e.geometry || []);
    return runs.map((run, i) => {
      const points = run.map(toXZ);
      const elevProfile = run.map((p) => relY(elevAt(p.lat, p.lon)));
      return { osmId: `${e.type}/${e.id}${runs.length > 1 ? `#${i}` : ''}`, name: t.name || null, ...extra(t), points, elevProfile, lengthM: polylineLength(points), tags: t };
    });
  }
  const streets = [];
  for (const e of els) {
    if (e.type !== 'way' || !e.tags?.highway) continue;
    streets.push(...linearRecords(e, (t) => ({
      kind: t.highway, lanes: parseInt0(t.lanes), oneway: t.oneway ?? null, width: parseLengthM(t.width),
      sidewalk: t.sidewalk ?? null, surface: t.surface ?? null, footwayRole: t.footway ?? null,
      layer: parseInt0(t.layer), tunnel: t.tunnel ?? null, bridge: t.bridge ?? null, area: t.area === 'yes',
      isRoad: ROAD_KINDS.includes(t.highway),
    })));
  }

  // 7. Ground-cover polygons (the `landuse` bin): what the runtime's BlockFill paints between the streets.
  //    Only closed areas; buildings are excluded (they have their own massing). `surface` is the runtime's
  //    material class and `priority` its stacking order (a pitch draws over the park it sits in).
  //    Computed BEFORE the POI bin so those ways can be kept out of it: `--augment` brought in
  //    `leisure=park`, `natural=water` and `amenity=parking` areas, and their tags also match POI_KEYS,
  //    so without this every ground-cover area would ALSO have been filed as a point of interest.
  const landuse = [];
  const landuseOsmIds = new Set();
  for (const e of els) {
    if (e.type !== 'way' && e.type !== 'relation') continue;
    const t = e.tags || {};
    if (t.building || t['building:part'] || t.highway) continue;
    const cls = landuseClass(t);
    if (!cls) continue;
    const ring = outerRing(e);
    if (!ring || ring.length < 4) continue;
    const p = repPoint(e); if (!p || !inBbox(p.lat, p.lon, CLIP_MARGIN_M)) continue;
    const footprint = ringToLocal(ring);
    const areaM2 = r2(Math.abs(signedAreaLocal(footprint)));
    if (areaM2 < 20) continue;
    const holes = e.type === 'relation' ? (e.members || []).filter((m) => m.role === 'inner' && m.geometry && m.geometry.length >= 4).map((m) => ringToLocal(m.geometry)) : [];
    const osmId = `${e.type}/${e.id}`;
    landuseOsmIds.add(osmId);
    landuse.push({
      osmId, name: t.name || null, kind: cls.kind, surface: cls.surface, priority: cls.priority,
      footprint, holes: holes.length ? holes : undefined, areaM2, centroid: toXZ(p),
    });
  }
  landuse.sort((a, b) => a.priority - b.priority || b.areaM2 - a.areaM2);

  // 7b. Point features and POIs
  const POI_KEYS = ['shop', 'amenity', 'tourism', 'office', 'leisure', 'historic', 'craft', 'healthcare', 'public_transport', 'railway', 'man_made', 'emergency', 'barrier', 'advertising', 'entrance', 'place', 'natural'];
  const DEDICATED = (t) =>
    t.natural === 'tree' ? 'trees' : t.highway === 'street_lamp' ? 'lamps' : t.highway === 'traffic_signals' ? 'signals' : t.highway === 'crossing' ? 'crossings'
    : t.emergency === 'fire_hydrant' ? 'hydrants' : t.amenity === 'bench' ? 'benches' : t.barrier === 'bollard' ? 'bollards' : null;
  const trees = [], lamps = [], signals = [], crossings = [], hydrants = [], benches = [], bollards = [], pois = [];
  const bins = { trees, lamps, signals, crossings, hydrants, benches, bollards };
  for (const e of els) {
    const t = e.tags; if (!t) continue;
    if (e.type === 'node' && !inBbox(e.lat, e.lon, CLIP_MARGIN_M)) continue;
    const bin = DEDICATED(t);
    if (bin) {
      if (e.type !== 'node') continue;
      const [x, z] = toXZ(e);
      const rec = { osmId: `node/${e.id}`, x, z };
      if (bin === 'crossings') Object.assign(rec, { crossing: t.crossing ?? null, markings: t['crossing:markings'] ?? null, signals: t['crossing:signals'] ?? null, tactile: t.tactile_paving ?? null, rail: t.railway ?? null });
      if (bin === 'trees') Object.assign(rec, { species: t.species ?? t.genus ?? null, leafType: t.leaf_type ?? null });
      if (bin === 'signals') Object.assign(rec, { sound: t['traffic_signals:sound'] ?? null });
      bins[bin].push(rec);
      continue;
    }
    const key = POI_KEYS.find((k) => t[k] != null);
    if (!key) continue;
    if (e.type === 'way' && (t.highway || (t.railway && t.railway !== 'platform'))) continue; // linear features handled above
    if (e.type === 'relation' && t.type === 'route') continue;
    if (e.type !== 'node' && landuseOsmIds.has(`${e.type}/${e.id}`)) continue; // already a ground-cover area (§7)
    const p = repPoint(e); if (!p || !inBbox(p.lat, p.lon, CLIP_MARGIN_M)) continue;
    const [x, z] = toXZ(p);
    pois.push({
      osmId: `${e.type}/${e.id}`, name: t.name || null, kind: `${key}=${t[key]}`, primaryKey: key,
      address: address(t), level: t.level ?? null, brand: t.brand ?? null, opening_hours: t.opening_hours ?? null, website: t.website ?? null,
      geometry: e.type === 'node' ? 'point' : 'area-centroid', isBuilding: !!t.building, x, z,
      lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), tags: t,
    });
  }

  // 8. Intersections in local coords (from elevation.json when present)
  const intersections = (elev?.intersections || []).map((it) => { const [x, z] = toXZ(it); return { name: it.name, x, z, lat: it.lat, lon: it.lon, elevAbsM: it.elev_m, y: relY(it.elev_m) }; });

  // 9. Assemble + write
  const corners = [[BBOX.south, BBOX.west], [BBOX.south, BBOX.east], [BBOX.north, BBOX.west], [BBOX.north, BBOX.east]].map(([la, lo]) => geoToLocal(la, lo));
  const bbox_local = { minX: r2(Math.min(...corners.map((c) => c.x))), maxX: r2(Math.max(...corners.map((c) => c.x))), minZ: r2(Math.min(...corners.map((c) => c.z))), maxZ: r2(Math.max(...corners.map((c) => c.z))) };
  const gis = {
    meta: {
      generatedAt: new Date().toISOString(), generator: 'tools/geo/build_gis.mjs', osmTimestamp: raw.osm3s?.timestamp_osm_base,
      osmCopyright: raw.osm3s?.copyright || OSM_COPYRIGHT_FALLBACK,
      osmAttribution: 'Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL): https://www.openstreetmap.org/copyright',
      elevationSource: elev?.source ?? null, bboxWgs84: BBOX, units: 'metres; x=grid-east, y=up (relative to origin elevation), z=grid-south',
      footprintWinding: 'closed ring, counter-clockwise when viewed from above (+y), i.e. shoelace on (x,-z) > 0',
      constants: { LAT0_DEG, M_PER_DEG_LAT: +M_PER_DEG_LAT.toFixed(3), M_PER_DEG_LON: +M_PER_DEG_LON.toFixed(3), LEVEL_HEIGHT_M, CLIP_MARGIN_M },
      heightOrder: ['osm:height', `osm:building:levels*${LEVEL_HEIGHT_M}+1`, 'override:heightM', `override:floors*${LEVEL_HEIGHT_M}`, 'area-default'],
      bearingFit: bearingReport, originSource, skipped,
      counts: { buildings: buildings.length, buildingsInsideBbox: buildings.filter((b) => b.insideBbox).length, buildingParts: buildingParts.length, streets: streets.length, pois: pois.length, trees: trees.length, lamps: lamps.length, signals: signals.length, crossings: crossings.length, hydrants: hydrants.length, benches: benches.length, bollards: bollards.length, landuse: landuse.length },
    },
    origin: { lat: ORIGIN.lat, lon: ORIGIN.lon, elev_m: ORIGIN_ELEVATION_M },
    gridBearingDeg: GRID_BEARING_DEG,
    bbox_local,
    intersections,
    buildings, buildingParts, streets, pois, trees, lamps, signals, crossings, hydrants, benches, bollards, landuse,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(gis));

  syncGeoTs(GEO_TS_PATH, { origin: ORIGIN, originElevation: ORIGIN_ELEVATION_M, gridBearingDeg: GRID_BEARING_DEG, fit: gridFit });

  console.log(JSON.stringify({ origin: gis.origin, originSource, GRID_BEARING_DEG, M_PER_DEG_LAT: +M_PER_DEG_LAT.toFixed(3), M_PER_DEG_LON: +M_PER_DEG_LON.toFixed(3), bbox_local, counts: gis.meta.counts, skipped, bearingFit: bearingReport }, null, 1));
  console.log(`wrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1e6).toFixed(2)} MB)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
