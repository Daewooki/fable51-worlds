// Ground cover between the streets. Without it the blocks are bare terrain (a white plane in daylight):
// the analytic street model only paints the carriageways and their sidewalks, and the massing only covers
// the building footprints, so everything in between — forecourts, car parks, parks, the 봇들 retention pond —
// had no surface at all.
//
// Two sources, in this order:
//   1. `gis.json.landuse` — OSM landuse / leisure / amenity=parking / natural polygons, each carrying the
//      `surface` class and `priority` that tools/geo/build_gis.mjs resolved (see `landuseClass` there).
//   2. a fallback grid: the block cells between consecutive fitted street centrelines, inset by half the
//      street width plus its sidewalk, emitted only where no landuse polygon covers the ground.
//
// Every patch is rasterised onto a fixed METRE grid and each cell is clipped to the patch outline
// (Sutherland–Hodgman), so the edges stay exact while the interior still follows the terrain: a single
// flat polygon would sink into the hills this world actually has. Patches are merged into ONE mesh per
// surface class (5 draw calls at most) and each class sits at its own millimetre offset above the terrain,
// so nested areas (a pitch inside a park inside the industrial block) never z-fight.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Materials } from '../materials/Library';
import type { Terrain } from './Terrain';
import type { StreetSpec } from './StreetGrid';
import { P2, pointInPolygon } from '../util/Geometry2D';

/** One ground-cover polygon out of `gis.json.landuse`. */
export interface LanduseArea {
  osmId: string; name: string | null; kind: string;
  surface: string; priority: number;
  footprint: P2[]; holes?: P2[][]; areaM2: number; centroid: P2;
}

/** Runtime material per surface class, and the height above terrain it is painted at. */
const SURFACE: Record<string, { material: string; y: number }> = {
  paving_dark: { material: 'concrete_dark', y: 0.020 },
  paving: { material: 'pavers', y: 0.028 },
  grass: { material: 'grass', y: 0.036 },
  soil: { material: 'soil', y: 0.044 },
  water: { material: 'water', y: 0.052 },
};
const FALLBACK_SURFACE = 'paving_dark';
const CELL = 10;          // rasterisation grid (m): interior cells are two triangles
const EXTENT = 620;       // same box as Props — beyond it the terrain is background
const MIN_BLOCK = 6;      // ignore block cells thinner than this after the sidewalk inset
const MIN_CELL_AREA = 0.8; // drop slivers left by the clip

interface Patch { poly: P2[]; holes?: P2[][]; surface: string }
/** A street's road+sidewalk corridor: `across` is x for an ns street, z for an ew street. */
interface Corridor { axis: 'ns' | 'ew'; lo: number; hi: number; from: number; to: number }

/** Sutherland–Hodgman clip of a polygon to an axis-aligned rectangle. Returns [] when fully outside. */
export function clipToRect(poly: P2[], x0: number, x1: number, z0: number, z1: number): P2[] {
  let out = poly;
  const planes: [(p: P2) => number, (a: P2, b: P2, da: number, db: number) => P2][] = [
    [(p) => p[0] - x0, (a, b, da, db) => [x0, a[1] + ((b[1] - a[1]) * da) / (da - db)]],
    [(p) => x1 - p[0], (a, b, da, db) => [x1, a[1] + ((b[1] - a[1]) * da) / (da - db)]],
    [(p) => p[1] - z0, (a, b, da, db) => [a[0] + ((b[0] - a[0]) * da) / (da - db), z0]],
    [(p) => z1 - p[1], (a, b, da, db) => [a[0] + ((b[0] - a[0]) * da) / (da - db), z1]],
  ];
  for (const [dist, cut] of planes) {
    if (!out.length) return [];
    const next: P2[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      const da = dist(a), db = dist(b);
      if (da >= 0) next.push(a);
      if ((da >= 0) !== (db >= 0)) next.push(cut(a, b, da, db));
    }
    out = next;
  }
  return out;
}

/** Signed shoelace in the (x, z) plane. Negative ⇒ the ring faces +y in a y-up frame. */
function shoelace(p: P2[]): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}
function area2(p: P2[]): number { return Math.abs(shoelace(p)); }

/** Earcut a (possibly concave, possibly holed) ring into triangles, via three's bundled ShapeUtils. */
export function triangulate(contour: P2[], holes?: P2[][]): [P2, P2, P2][] {
  const ring = contour.length > 1 && contour[0][0] === contour[contour.length - 1][0] && contour[0][1] === contour[contour.length - 1][1] ? contour.slice(0, -1) : contour;
  if (ring.length < 3) return [];
  const asV = (p: P2[]) => p.map(([x, z]) => new THREE.Vector2(x, z));
  const hs = (holes || []).map((h) => (h.length > 1 && h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1] ? h.slice(0, -1) : h)).filter((h) => h.length >= 3);
  const verts: P2[] = [...ring, ...hs.flat()];
  let faces: number[][];
  try { faces = THREE.ShapeUtils.triangulateShape(asV(ring), hs.map(asV)); } catch { return []; }
  const out: [P2, P2, P2][] = [];
  for (const f of faces) {
    const a = verts[f[0]], b = verts[f[1]], c = verts[f[2]];
    if (!a || !b || !c) continue;
    out.push([a, b, c]);
  }
  return out;
}

/**
 * Block cells of the fitted street grid: the rectangles between consecutive ns and ew centrelines,
 * inset on each side by half that street's width plus its sidewalk. Exported for the tests.
 */
export function blockCells(streets: StreetSpec[], extent = EXTENT): { x0: number; x1: number; z0: number; z1: number }[] {
  const axisLines = (axis: 'ns' | 'ew') => {
    const byC: { c: number; half: number }[] = [];
    for (const s of streets) {
      if (s.axis !== axis) continue;
      const half = s.width / 2 + s.sidewalk;
      const near = byC.find((b) => Math.abs(b.c - s.c) < 6);
      if (near) { near.half = Math.max(near.half, half); continue; }
      byC.push({ c: s.c, half });
    }
    byC.sort((a, b) => a.c - b.c);
    // the world edge acts as the outermost boundary on both sides
    return [{ c: -extent, half: 0 }, ...byC.filter((b) => Math.abs(b.c) < extent), { c: extent, half: 0 }];
  };
  const xs = axisLines('ns'), zs = axisLines('ew');
  const out: { x0: number; x1: number; z0: number; z1: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const x0 = xs[i].c + xs[i].half, x1 = xs[i + 1].c - xs[i + 1].half;
    const z0 = zs[j].c + zs[j].half, z1 = zs[j + 1].c - zs[j + 1].half;
    if (x1 - x0 < MIN_BLOCK || z1 - z0 < MIN_BLOCK) continue;
    out.push({ x0, x1, z0, z1 });
  }
  return out;
}

export class BlockFill {
  group = new THREE.Group();
  /** Per-surface triangle counts, for the QA report. */
  counts: Record<string, { patches: number; tris: number }> = {};
  areas = 0; blocks = 0;

  private corridors: Corridor[] = [];

  constructor(public terrain: Terrain, landuse: LanduseArea[], streets: StreetSpec[]) {
    this.group.name = 'blockfill';
    // Streets own their own surface (asphalt at +2 cm, sidewalk at the +15 cm kerb); ground cover is cut out
    // of those corridors exactly, or an OSM river polygon would be painted straight across the carriageway.
    for (const s of streets) {
      const h = s.width / 2 + s.sidewalk;   // road + both sidewalks; corner squares fall in the crossing street's own corridor
      this.corridors.push({ axis: s.axis, lo: s.c - h, hi: s.c + h, from: Math.min(s.from, s.to), to: Math.max(s.from, s.to) });
    }
    const patches: Patch[] = [];
    // --- 1. OSM ground cover -------------------------------------------------
    const inExtent = (p: P2[]) => p.some(([x, z]) => Math.abs(x) < EXTENT + CELL && Math.abs(z) < EXTENT + CELL);
    const ordered = [...(landuse || [])].sort((a, b) => a.priority - b.priority || b.areaM2 - a.areaM2);
    for (const a of ordered) {
      if (!SURFACE[a.surface] || !Array.isArray(a.footprint) || a.footprint.length < 4) continue;
      if (!inExtent(a.footprint)) continue;
      patches.push({ poly: a.footprint, holes: (a.holes || []).filter((h) => h.length >= 4), surface: a.surface });
      this.areas++;
    }
    // --- 2. fallback block cells where OSM has nothing ------------------------
    const cover = new Coverage(ordered.filter((a) => SURFACE[a.surface]));
    for (const b of blockCells(streets)) {
      const cells = this.subdivide(b, cover);
      for (const c of cells) { patches.push({ poly: c, surface: FALLBACK_SURFACE }); this.blocks++; }
    }
    // --- 3. rasterise + merge per surface ------------------------------------
    const geos = new Map<string, THREE.BufferGeometry[]>();
    for (const p of patches) {
      const s = SURFACE[p.surface]; if (!s) continue;
      const g = this.rasterise(p.poly, p.holes, s.y);
      if (!g) continue;
      let arr = geos.get(p.surface); if (!arr) geos.set(p.surface, (arr = []));
      arr.push(g);
      const c = this.counts[p.surface] || (this.counts[p.surface] = { patches: 0, tris: 0 });
      c.patches++; c.tris += g.getIndex()!.count / 3;
    }
    for (const [surface, arr] of geos) {
      if (!arr.length) continue;
      const merged = mergeGeometries(arr, false);
      const m = new THREE.Mesh(merged, Materials.get(SURFACE[surface].material));
      m.name = `blockfill_${surface}`;
      m.receiveShadow = true; m.castShadow = false;
      this.group.add(m);
    }
  }

  /** Split a block rectangle into the sub-rectangles that no landuse polygon covers. */
  private subdivide(b: { x0: number; x1: number; z0: number; z1: number }, cover: Coverage): P2[][] {
    const out: P2[][] = [];
    const nx = Math.max(1, Math.round((b.x1 - b.x0) / CELL)), nz = Math.max(1, Math.round((b.z1 - b.z0) / CELL));
    const dx = (b.x1 - b.x0) / nx, dz = (b.z1 - b.z0) / nz;
    for (let i = 0; i < nx; i++) {
      // merge runs of uncovered cells along z into one rectangle so the fallback stays cheap
      let run = -1;
      const x0 = b.x0 + i * dx, x1 = x0 + dx;
      for (let j = 0; j <= nz; j++) {
        const covered = j === nz || cover.covers(x0 + dx / 2, b.z0 + (j + 0.5) * dz);
        if (!covered && run < 0) run = j;
        else if (covered && run >= 0) {
          const z0 = b.z0 + run * dz, z1 = b.z0 + j * dz;
          out.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
          run = -1;
        }
      }
    }
    return out;
  }

  /**
   * Split one grid cell into the axis-aligned pieces that lie outside every street corridor.
   * Corridor edges crossing the cell become cut lines; a piece whose centre sits in a corridor is dropped.
   * Usually returns the cell unchanged (one piece) — only cells near a kerb line are actually cut.
   */
  private cellPieces(x0: number, x1: number, z0: number, z1: number): [number, number, number, number][] {
    const hit = this.corridors.filter((c) => (c.axis === 'ns'
      ? c.hi > x0 && c.lo < x1 && c.to > z0 && c.from < z1
      : c.hi > z0 && c.lo < z1 && c.to > x0 && c.from < x1));
    if (!hit.length) return [[x0, x1, z0, z1]];
    const xs = [x0, x1], zs = [z0, z1];
    for (const c of hit) {
      const t = c.axis === 'ns' ? xs : zs, a = c.axis === 'ns' ? x0 : z0, b = c.axis === 'ns' ? x1 : z1;
      for (const e of [c.lo, c.hi]) if (e > a + 1e-3 && e < b - 1e-3) t.push(e);
      const u = c.axis === 'ns' ? zs : xs, ua = c.axis === 'ns' ? z0 : x0, ub = c.axis === 'ns' ? z1 : x1;
      for (const e of [c.from, c.to]) if (e > ua + 1e-3 && e < ub - 1e-3) u.push(e);
    }
    xs.sort((a, b) => a - b); zs.sort((a, b) => a - b);
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const ax = xs[i], bx = xs[i + 1], az = zs[j], bz = zs[j + 1];
      if (bx - ax < 1e-3 || bz - az < 1e-3) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      let inside = false;
      for (const c of hit) {
        const across = c.axis === 'ns' ? mx : mz, along = c.axis === 'ns' ? mz : mx;
        if (across >= c.lo && across <= c.hi && along >= c.from && along <= c.to) { inside = true; break; }
      }
      if (!inside) out.push([ax, bx, az, bz]);
    }
    return out;
  }

  /** Grid-clip a polygon and drape every vertex on the terrain at `yOff` above it. */
  private rasterise(poly: P2[], holes: P2[][] | undefined, yOff: number): THREE.BufferGeometry | null {
    // Triangulate FIRST (earcut, via three's ShapeUtils) and grid-clip the triangles, not the ring:
    // Sutherland–Hodgman is only exact for a convex subject, and these rings (rivers, parks) are anything but.
    const tris = triangulate(poly, holes);
    if (!tris.length) return null;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const emit = (frag: P2[]) => {
      if (frag.length < 3 || area2(frag) < MIN_CELL_AREA) return;
      const base = pos.length / 3;
      for (const [x, z] of frag) { pos.push(x, this.terrain.heightAt(x, z) + yOff, z); uv.push(x, z); }
      // wind every fan so the face normal points +y regardless of the source winding: a triangle whose
      // (x, z) shoelace is negative has an upward normal in a y-up frame.
      const up = shoelace(frag) < 0;
      for (let k = 1; k < frag.length - 1; k++) {
        if (up) idx.push(base, base + k, base + k + 1);
        else idx.push(base, base + k + 1, base + k);
      }
    };
    for (const tri of tris) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of tri) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
      minX = Math.max(minX, -EXTENT); maxX = Math.min(maxX, EXTENT);
      minZ = Math.max(minZ, -EXTENT); maxZ = Math.min(maxZ, EXTENT);
      if (!(maxX > minX && maxZ > minZ)) continue;
      const i0 = Math.floor(minX / CELL), i1 = Math.floor((maxX - 1e-6) / CELL);
      const j0 = Math.floor(minZ / CELL), j1 = Math.floor((maxZ - 1e-6) / CELL);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 20000) continue;   // pathological: skip rather than stall the load
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const cx0 = Math.max(i * CELL, minX), cx1 = Math.min((i + 1) * CELL, maxX);
        const cz0 = Math.max(j * CELL, minZ), cz1 = Math.min((j + 1) * CELL, maxZ);
        if (cx1 - cx0 < 1e-3 || cz1 - cz0 < 1e-3) continue;
        // cut the cell along every street-corridor edge crossing it, then drop the pieces inside a corridor
        for (const [x0, x1, z0, z1] of this.cellPieces(cx0, cx1, cz0, cz1)) emit(clipToRect(tri, x0, x1, z0, z1));
      }
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  stats() {
    let tris = 0; for (const c of Object.values(this.counts)) tris += c.tris;
    return { meshes: this.group.children.length, surfaces: Object.keys(this.counts).length, landuseAreas: this.areas, blockPatches: this.blocks, tris, bySurface: this.counts };
  }
}

/** Bucketed point-in-any-polygon test over the landuse areas (used to skip fallback block cells). */
class Coverage {
  private cell = 64;
  private grid = new Map<number, LanduseArea[]>();
  constructor(areas: LanduseArea[]) {
    for (const a of areas) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of a.footprint) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
      const i0 = Math.floor(minX / this.cell), i1 = Math.floor(maxX / this.cell);
      const j0 = Math.floor(minZ / this.cell), j1 = Math.floor(maxZ / this.cell);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 20000) continue;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = (i + 2048) * 8192 + (j + 2048);
        let arr = this.grid.get(k); if (!arr) this.grid.set(k, (arr = []));
        arr.push(a);
      }
    }
  }
  covers(x: number, z: number): boolean {
    const arr = this.grid.get((Math.floor(x / this.cell) + 2048) * 8192 + (Math.floor(z / this.cell) + 2048));
    if (!arr) return false;
    for (const a of arr) if (pointInPolygon(x, z, a.footprint)) return true;
    return false;
  }
}
