#!/usr/bin/env node
/**
 * build_streets.mjs — fits the OSM road centrelines in src/data/recon/gis.json to the analytic,
 * axis-aligned street model the runtime uses (union-square-sf/src/world/StreetGrid.ts `StreetSpec`),
 * and writes src/data/recon/streets_spec.json:
 *
 *   { meta: { generated, method, gridBearingDeg, counts, dropped: [{name, bearingDeg, deviationDeg, lengthM}] },
 *     streets: StreetSpec[] }
 *
 * Method: group the clipped segments of gis.json.streets by `name`; keep the road kinds the runtime
 * renders and names with ≥ MIN_LENGTH_M of centreline inside the bbox; take the length-weighted axial
 * (doubled-angle) mean bearing of each street and fold it onto the grid axes (±AXIS_TOLERANCE_DEG);
 * `c` is the length-weighted mean perpendicular offset, `from`/`to` the extent along the axis (snapped
 * to the bbox edge when within EDGE_SNAP_M of it). Streets that fit neither axis are dropped and listed
 * in meta.dropped. Curved and diagonal ways are approximated — accepted for this world.
 *
 * Run: node tools/geo/build_streets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { D2R } from './constants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GIS_PATH = path.join(ROOT, 'src/data/recon/gis.json');
const OUT_PATH = path.join(ROOT, 'src/data/recon/streets_spec.json');

/** Road kinds that become analytic streets. */
export const STREET_KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian'];
/** A named street needs this much centreline inside the bbox to be worth modelling. */
export const MIN_LENGTH_M = 120;
/** A street whose folded bearing is further than this from both grid axes is dropped. */
export const AXIS_TOLERANCE_DEG = 25;
/** Extend a street to the bbox edge when its end is this close to it. */
export const EDGE_SNAP_M = 40;
/** Lane width used when OSM has no `width`. */
export const LANE_WIDTH_M = 3.25;
export const DEFAULT_SIDEWALK_M = 3.0;
/** Streets that get a wider sidewalk (station approach / boulevard). */
export const WIDE_SIDEWALK = { '판교역로': 4.5 };

/** Default lane count per OSM highway kind (both directions). */
export function defaultLanes(kind) {
  switch (kind) {
    case 'motorway': case 'trunk': case 'primary': return 6;
    case 'secondary': return 4;
    case 'tertiary': case 'residential': return 2;
    case 'living_street': case 'pedestrian': return 1;
    default: return 2;
  }
}

/**
 * Fold a true bearing onto the grid axes.
 * `gridBearingDeg` is the true bearing of local +x (grid-east), so a bearing parallel to it is an
 * east–west street ('ew') and one perpendicular to it is a north–south street ('ns').
 * @returns {'ns'|'ew'|null} null when the bearing is more than AXIS_TOLERANCE_DEG from both axes.
 */
export function foldToAxis(bearingDeg, gridBearingDeg = 0, tolerance = AXIS_TOLERANCE_DEG) {
  const d = axisDeviation(bearingDeg, gridBearingDeg);
  if (d <= tolerance) return 'ew';
  if (d >= 90 - tolerance) return 'ns';
  return null;
}

/** Angle (0..90) between a bearing and the grid-east axis, ignoring direction. */
export function axisDeviation(bearingDeg, gridBearingDeg = 0) {
  let a = (((bearingDeg - gridBearingDeg) % 180) + 180) % 180;
  return Math.min(a, 180 - a);
}

/** Direction letter for a oneway street, in the GRID frame (grid-north = -z, grid-east = +x). */
export function onewayLetter(axis, { dx, dz }) {
  if (axis === 'ns') return dz < 0 ? 'N' : 'S';
  return dx < 0 ? 'W' : 'E';
}

/** Length-weighted axial (doubled-angle) mean bearing of segments, 0..180. */
export function axialMeanBearing(segs) {
  let sx = 0, sy = 0, L = 0;
  for (const s of segs) { const t = 2 * s.bearing * D2R; sx += s.len * Math.cos(t); sy += s.len * Math.sin(t); L += s.len; }
  let ax = L > 0 ? Math.atan2(sy, sx) / D2R / 2 : 0;
  if (ax < 0) ax += 180;
  return { bearingDeg: +ax.toFixed(3), lengthM: +L.toFixed(1) };
}

/**
 * Segments of a gis.json street record, in the local frame, with true bearings.
 * Local -z is grid-north (true bearing gridBearingDeg - 90), so a local direction (dx, dz)
 * has grid-frame bearing atan2(dx, -dz) and true bearing that plus (gridBearingDeg - 90).
 */
export function recordSegments(points, gridBearingDeg) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const [x0, z0] = points[i - 1], [x1, z1] = points[i];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const bearing = (Math.atan2(dx, -dz) / D2R) + gridBearingDeg - 90;
    out.push({ dx, dz, len, bearing, mx: (x0 + x1) / 2, mz: (z0 + z1) / 2 });
  }
  return out;
}

const round = (v, n = 2) => +v.toFixed(n);

export function fitStreets(gis) {
  const grid = gis.gridBearingDeg;
  const bb = gis.bbox_local;
  const groups = new Map();
  for (const rec of gis.streets) {
    if (!rec.name || !STREET_KINDS.includes(rec.kind) || rec.area) continue;
    if (rec.tunnel === 'yes' || (rec.layer ?? 0) < 0) continue;
    if (!groups.has(rec.name)) groups.set(rec.name, []);
    groups.get(rec.name).push(rec);
  }

  const streets = [], dropped = [];
  for (const [name, recs] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const segs = [];
    for (const rec of recs) segs.push(...recordSegments(rec.points, grid).map((s) => ({ ...s, rec })));
    const totalLen = segs.reduce((a, s) => a + s.len, 0);
    if (totalLen < MIN_LENGTH_M) continue;

    const { bearingDeg } = axialMeanBearing(segs);
    const axis = foldToAxis(bearingDeg, grid);
    if (!axis) {
      const dev = axisDeviation(bearingDeg, grid);
      dropped.push({ name, bearingDeg, deviationDeg: round(Math.min(dev, 90 - dev), 2), lengthM: round(totalLen, 1), reason: `> ${AXIS_TOLERANCE_DEG}° from both grid axes` });
      continue;
    }

    // c = length-weighted mean perpendicular offset; from/to = extent along the axis
    let wc = 0, wl = 0, lo = Infinity, hi = -Infinity;
    for (const s of segs) {
      const perp = axis === 'ns' ? s.mx : s.mz;
      wc += perp * s.len; wl += s.len;
      const a0 = axis === 'ns' ? s.mz - Math.abs(s.dz) / 2 : s.mx - Math.abs(s.dx) / 2;
      const a1 = axis === 'ns' ? s.mz + Math.abs(s.dz) / 2 : s.mx + Math.abs(s.dx) / 2;
      lo = Math.min(lo, a0); hi = Math.max(hi, a1);
    }
    const c = wc / wl;
    const edgeLo = axis === 'ns' ? bb.minZ : bb.minX;
    const edgeHi = axis === 'ns' ? bb.maxZ : bb.maxX;
    if (lo - edgeLo < EDGE_SNAP_M) lo = edgeLo;
    if (edgeHi - hi < EDGE_SNAP_M) hi = edgeHi;

    // oneway / dual carriageway: most of the length one-way in opposing directions = a mapped carriageway pair
    const onewayRecs = recs.filter((r) => r.oneway === 'yes');
    const byLetter = new Map();
    for (const r of onewayRecs) {
      const p0 = r.points[0], p1 = r.points[r.points.length - 1];
      const letter = onewayLetter(axis, { dx: p1[0] - p0[0], dz: p1[1] - p0[1] });
      byLetter.set(letter, (byLetter.get(letter) || 0) + r.lengthM);
    }
    const opposed = (byLetter.has('N') && byLetter.has('S')) || (byLetter.has('E') && byLetter.has('W'));
    const onewayLen = [...byLetter.values()].reduce((a, b) => a + b, 0);
    const mostlyOneway = onewayLen >= 0.6 * totalLen;
    const isDual = opposed && mostlyOneway;
    const oneway = !opposed && mostlyOneway && byLetter.size ? [...byLetter.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;

    // widths and lanes: prefer OSM, else per-kind defaults. On a dual carriageway an OSM `lanes`
    // tag counts one carriageway only, so the two-way total is twice the per-carriageway maximum.
    const kinds = recs.map((r) => r.kind);
    const kind = STREET_KINDS.find((k) => kinds.includes(k)) || kinds[0];
    const osmLanes = recs.map((r) => r.lanes).filter((v) => Number.isFinite(v));
    const dualLanes = onewayRecs.map((r) => r.lanes).filter((v) => Number.isFinite(v));
    let lanes = isDual && dualLanes.length ? 2 * Math.max(...dualLanes)
      : osmLanes.length ? Math.max(...osmLanes) : defaultLanes(kind);
    lanes = Math.max(1, Math.min(12, Math.round(lanes)));
    const osmWidths = recs.map((r) => r.width).filter((v) => Number.isFinite(v));
    const width = osmWidths.length ? round(Math.max(...osmWidths) * (isDual ? 2 : 1)) : round(lanes * LANE_WIDTH_M);

    const pedestrian = kind === 'pedestrian' || kind === 'living_street';
    const surfaces = recs.map((r) => r.surface).filter(Boolean);
    const surface = surfaces.some((s) => ['paving_stones', 'sett', 'cobblestone', 'bricks', 'brick'].includes(s)) ? 'brick' : undefined;
    const spec = {
      name, axis, c: round(c), from: round(lo), to: round(hi),
      width, sidewalk: WIDE_SIDEWALK[name] ?? DEFAULT_SIDEWALK_M,
      lanes, oneway, parking: { left: false, right: false },
      centerLine: oneway || pedestrian ? 'none' : lanes >= 4 ? 'double_yellow' : 'single_yellow',
      kind, lengthM: round(totalLen, 1), bearingDeg,
      deviationDeg: round(axis === 'ew' ? axisDeviation(bearingDeg, grid) : 90 - axisDeviation(bearingDeg, grid), 2),
      segments: segs.length,
    };
    if (surface) spec.surface = surface;
    if (pedestrian) spec.pedestrian = true;
    streets.push(spec);
  }
  streets.sort((a, b) => (a.axis === b.axis ? a.c - b.c : a.axis < b.axis ? -1 : 1));
  return { streets, dropped, gridBearingDeg: grid };
}

function main() {
  const gis = JSON.parse(fs.readFileSync(GIS_PATH, 'utf8'));
  const { streets, dropped, gridBearingDeg } = fitStreets(gis);
  const out = {
    meta: {
      generated: new Date().toISOString(),
      generator: 'tools/geo/build_streets.mjs',
      method: `named OSM ways of kinds [${STREET_KINDS.join('|')}] with ≥ ${MIN_LENGTH_M} m inside the bbox, fitted to the grid axes (±${AXIS_TOLERANCE_DEG}°); c = length-weighted mean perpendicular offset; from/to = extent, snapped to the bbox edge within ${EDGE_SNAP_M} m; width = OSM width or lanes × ${LANE_WIDTH_M} m`,
      gridBearingDeg,
      counts: { streets: streets.length, ns: streets.filter((s) => s.axis === 'ns').length, ew: streets.filter((s) => s.axis === 'ew').length, dropped: dropped.length },
      dropped,
    },
    streets,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));
  console.log(`wrote ${OUT_PATH}: ${streets.length} streets (${out.meta.counts.ns} ns / ${out.meta.counts.ew} ew), ${dropped.length} dropped`);
  for (const s of streets) console.log(`  ${s.axis} ${s.name.padEnd(16)} c=${String(s.c).padStart(8)} from=${String(s.from).padStart(8)} to=${String(s.to).padStart(8)} w=${s.width} lanes=${s.lanes} oneway=${s.oneway ?? '-'} dev=${s.deviationDeg}°`);
  for (const d of dropped) console.log(`  DROPPED ${d.name} bearing=${d.bearingDeg}° dev=${d.deviationDeg}° len=${d.lengthM}m`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
