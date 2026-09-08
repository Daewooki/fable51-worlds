// Analytic street grid derived from OSM centrelines: each street is axis-aligned in the local frame.
import { P2 } from '../util/Geometry2D';

export interface StreetSpec {
  name: string; axis: 'ns' | 'ew'; c: number; // constant coordinate: x for ns, z for ew
  from: number; to: number;                    // extent along the other axis
  width: number;                               // curb-to-curb (m)
  sidewalk: number;                            // sidewalk width each side (m)
  lanes: number; oneway: null | 'N' | 'S' | 'E' | 'W';
  parking: { left: boolean; right: boolean };  // left = west/north side
  transitRail?: boolean; pedestrian?: boolean; transitLane?: 'min' | 'max' | 'center'; surface?: 'asphalt' | 'brick'; centerLine?: 'double_yellow' | 'none' | 'single_yellow';
}
export interface Intersection { a: StreetSpec; b: StreetSpec; x: number; z: number; signal: boolean }

export function streetLine(s: StreetSpec): [P2, P2] { return s.axis === 'ns' ? [[s.c, s.from], [s.c, s.to]] : [[s.from, s.c], [s.to, s.c]]; }

/**
 * Decide which grid crossings are signalised, from the OSM `signals` bin (`gis.json.signals`, nodes tagged
 * `highway=traffic_signals`). Each OSM node is snapped to the nearest crossing within `snapM`; a crossing of
 * two major streets is signalised as well, because the straight-fit grid collapses several real junctions
 * onto one point and OSM's signal coverage in Pangyo is partial. Every other crossing becomes unsignalised
 * (priority), which is what `TrafficLights`, `LaneGraph` (right turns) and `Props` (masts) all read.
 *
 * Mutates `crossings` in place and returns the count that stayed signalised.
 */
export function applyOsmSignals(
  crossings: Intersection[],
  osmSignals: { x: number; z: number }[],
  opts: { snapM?: number; majorWidth?: number } = {},
): { signalled: number; fromOsm: number; fromMajor: number; osmUsed: number } {
  const snap = opts.snapM ?? 30, major = opts.majorWidth ?? 12;
  const keep = new Set<Intersection>();
  let osmUsed = 0;
  for (const s of osmSignals) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    let best: Intersection | null = null, bd = snap * snap;
    for (const c of crossings) { const d = (c.x - s.x) ** 2 + (c.z - s.z) ** 2; if (d < bd) { bd = d; best = c; } }
    if (best) { if (!keep.has(best)) keep.add(best); osmUsed++; }
  }
  const fromOsm = keep.size;
  for (const c of crossings) if (c.a.width >= major && c.b.width >= major) keep.add(c);
  for (const c of crossings) c.signal = keep.has(c) && !(c.a.pedestrian || c.b.pedestrian);
  const signalled = crossings.filter((c) => c.signal).length;
  return { signalled, fromOsm, fromMajor: keep.size - fromOsm, osmUsed };
}

/** Compute all crossings between ns and ew streets whose extents overlap. */
export function intersections(streets: StreetSpec[]): Intersection[] {
  const out: Intersection[] = [];
  for (const a of streets) if (a.axis === 'ns') for (const b of streets) if (b.axis === 'ew') {
    if (b.c >= Math.min(a.from, a.to) - 1 && b.c <= Math.max(a.from, a.to) + 1 && a.c >= Math.min(b.from, b.to) - 1 && a.c <= Math.max(b.from, b.to) + 1) {
      // collinear specs of one street (several character segments of the same name) meet at the same point: keep the widest pair
      const dup = out.find((o) => Math.abs(o.x - a.c) < 0.5 && Math.abs(o.z - b.c) < 0.5);
      if (dup) { if (a.width > dup.a.width) dup.a = a; if (b.width > dup.b.width) dup.b = b; continue; }
      out.push({ a, b, x: a.c, z: b.c, signal: !(a.pedestrian || b.pedestrian) });
    }
  }
  return out;
}
