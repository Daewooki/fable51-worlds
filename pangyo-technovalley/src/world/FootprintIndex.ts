// Coarse spatial index over building footprints, used to keep procedurally placed street furniture out of buildings.
//
// The analytic street model is fitted to the grid axes, so a kerb line computed from a StreetSpec can fall inside a
// building whose real frontage is not axis-aligned. Every procedural `.add()` in Props.ts is filtered through this
// index: a lamp/tree/bench inside a footprint (or hugging its wall) reads as a modelling bug in every shot.
//
// Pure module: no three.js, no DOM — so both the runtime and the vitest suite use the same code.
import { P2, pointInPolygon } from '../util/Geometry2D';

export interface FootprintEntry { id?: string; poly: P2[]; minX: number; maxX: number; minZ: number; maxZ: number }
export interface FootprintIndex { cell: number; buckets: Map<number, FootprintEntry[]>; entries: FootprintEntry[] }

const KEY = (cx: number, cz: number) => (cx + 8192) * 65536 + (cz + 8192);

/** Build the index from anything shaped like a GIS building (`footprint` is a closed or open ring of [x, z]). */
export function buildFootprintIndex(buildings: { osmId?: string; footprint?: P2[] | null }[], cell = 32): FootprintIndex {
  const idx: FootprintIndex = { cell, buckets: new Map(), entries: [] };
  for (const b of buildings) {
    const poly = b.footprint;
    if (!poly || poly.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    const e: FootprintEntry = { id: b.osmId, poly, minX, maxX, minZ, maxZ };
    idx.entries.push(e);
    for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx++) {
      for (let cz = Math.floor(minZ / cell); cz <= Math.floor(maxZ / cell); cz++) {
        const k = KEY(cx, cz); let arr = idx.buckets.get(k); if (!arr) idx.buckets.set(k, (arr = [])); arr.push(e);
      }
    }
  }
  return idx;
}

/** Squared distance from (x, z) to the closed polygon's boundary. */
function edgeDist2(x: number, z: number, poly: P2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d2 = px * px + pz * pz;
    if (d2 < best) best = d2;
  }
  return best;
}

/**
 * True when (x, z) is inside any indexed footprint, or within `clearance` metres of one of its edges.
 * `clearance` therefore expands every footprint outward by that much (0.5 m for trees/benches/signals,
 * 1.0 m for lamps, whose masts lean over the kerb).
 */
export function isInsideFootprint(x: number, z: number, idx: FootprintIndex, clearance = 0.5): boolean {
  const c = idx.cell;
  const r = Math.max(0, clearance);
  for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
    for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++) {
      const arr = idx.buckets.get(KEY(cx, cz));
      if (!arr) continue;
      for (const e of arr) {
        if (x < e.minX - r || x > e.maxX + r || z < e.minZ - r || z > e.maxZ + r) continue;
        if (pointInPolygon(x, z, e.poly)) return true;
        if (r > 0 && edgeDist2(x, z, e.poly) <= r * r) return true;
      }
    }
  }
  return false;
}

/** The id of the footprint containing (x, z), or null. Debug/test helper — no clearance band. */
export function footprintAt(x: number, z: number, idx: FootprintIndex): string | null {
  const c = idx.cell;
  const arr = idx.buckets.get(KEY(Math.floor(x / c), Math.floor(z / c)));
  if (!arr) return null;
  for (const e of arr) {
    if (x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) continue;
    if (pointInPolygon(x, z, e.poly)) return e.id ?? '';
  }
  return null;
}
