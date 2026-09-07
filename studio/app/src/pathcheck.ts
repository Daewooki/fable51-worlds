// Camera-path collision check and auto-fix. Pure logic over the keys; the world answers the
// per-point question through the bridge's `probePath` command (a downward ray: is the camera
// below the first surface it meets, or below the terrain?). Fixing lifts blocked *air*
// segments over what they hit by inserting a raised mid key and re-checking; walk keys and
// keys that are themselves inside something are reported, not moved.
import { sample } from '../../schemas/keys.mjs';
import { addKeyAt, sortKeys, type Key } from './timeline';

export type Probe = (points: [number, number, number][]) => Promise<ProbeHit[]>;
export type ProbeHit = { blocked: boolean; top: number; ground: number; structure: boolean };
export type Sample = { t: number; eye: [number, number, number]; look: [number, number, number]; air: boolean };
export type Run = { t0: number; t1: number; maxTop: number; segment: number; air: boolean; atKey: number | null };
export type PathReport = { duration: number; samples: number; runs: Run[]; blockedSeconds: number; clear: boolean; fixedKeys?: number; groundedKeys?: number; unfixable?: Run[] };

export const WALK_EYE = 1.68;

// Dense samples along the shot: `hz` per second plus every key time, so a key that sits inside
// a building is always probed exactly at its own time.
export function samplePath(keys: Key[], hz = 10): Sample[] {
  if (keys.length === 0) return [];
  const ks = sortKeys(keys);
  const end = ks[ks.length - 1].t;
  const times = new Set<number>();
  for (let t = 0; t <= end + 1e-9; t += 1 / hz) times.add(+t.toFixed(3));
  for (const k of ks) times.add(+k.t.toFixed(3));
  times.add(+end.toFixed(3));
  return [...times].sort((a, b) => a - b).map((t) => {
    const s = sample(ks, t, 30) as any;
    const eye: [number, number, number] = s.air ? s.eye : [s.pos[0], WALK_EYE, s.pos[1]];
    return { t, eye, look: s.look, air: !!s.air };
  });
}

// Walk samples carry a placeholder height (the renderer grounds them); the probe wants the eye
// at ground + eye height so "inside a building" reads the same for walk and air.
function probePoints(samples: Sample[], hits: ProbeHit[] | null): [number, number, number][] {
  return samples.map((s, i) => (s.air ? s.eye : [s.eye[0], (hits?.[i]?.ground ?? 0) + WALK_EYE, s.eye[2]]));
}

const segmentOf = (ks: Key[], t: number) => { let i = 0; while (i < ks.length - 2 && ks[i + 1].t <= t) i++; return i; };

export async function checkPath(keys: Key[], probe: Probe, hz = 10): Promise<PathReport> {
  const ks = sortKeys(keys);
  const samples = samplePath(ks, hz);
  if (samples.length === 0) return { duration: 0, samples: 0, runs: [], blockedSeconds: 0, clear: true };
  // Two passes for walk samples: first to learn the ground, then at the real eye height.
  let hits = await probe(probePoints(samples, null));
  if (samples.some((s) => !s.air)) hits = await probe(probePoints(samples, hits));
  const runs: Run[] = [];
  let cur: Run | null = null;
  samples.forEach((s, i) => {
    const h = hits[i];
    if (h?.blocked) {
      const seg = segmentOf(ks, s.t);
      const atKey = ks.findIndex((k) => Math.abs(k.t - s.t) < 1e-6);
      if (cur && cur.segment === seg) { cur.t1 = s.t; cur.maxTop = Math.max(cur.maxTop, h.top); if (atKey >= 0) cur.atKey = atKey; }
      else { cur = { t0: s.t, t1: s.t, maxTop: h.top, segment: seg, air: ks[seg].m === 'air' && ks[seg + 1]?.m !== 'walk', atKey: atKey >= 0 ? atKey : null }; runs.push(cur); }
    } else cur = null;
  });
  const blockedSeconds = runs.reduce((n, r) => n + Math.max(1 / hz, r.t1 - r.t0), 0);
  return { duration: ks[ks.length - 1].t, samples: samples.length, runs, blockedSeconds: +blockedSeconds.toFixed(2), clear: runs.length === 0 };
}

// Ground pass: air keys authored (or generated) with a street-level height that is below the
// terrain — anchors carry a placeholder height, and worlds like Kyoto sit 40 m up a hill —
// are moved up so the eye is at the same height above the ground they were written for
// (`y` is read as "metres above street level" when it is below ground + `streetBand`), and
// the look point rises by the same amount. Keys well above ground are left alone.
export async function groundKeys(keys: Key[], probe: Probe, opts: { eyeMin?: number; streetBand?: number } = {}): Promise<{ keys: Key[]; moved: number }> {
  const eyeMin = opts.eyeMin ?? 1.6, streetBand = opts.streetBand ?? 6;
  const airIdx = keys.map((k, i) => (k.m === 'air' && k.eye ? i : -1)).filter((i) => i >= 0);
  if (airIdx.length === 0) return { keys, moved: 0 };
  const hits = await probe(airIdx.map((i) => keys[i].eye as [number, number, number]));
  let moved = 0;
  const out = keys.map((k) => ({ ...k }));
  airIdx.forEach((i, n) => {
    const k = out[i], h = hits[n];
    if (!h || !k.eye) return;
    const y = k.eye[1];
    if (y >= h.ground + 0.3) return; // above ground already
    const above = Math.max(eyeMin, Math.min(streetBand, y)); // placeholder "height above street"
    const ny = +(h.ground + above).toFixed(2);
    const dy = ny - y;
    k.eye = [k.eye[0], ny, k.eye[2]];
    k.look = [k.look[0], +(k.look[1] + dy).toFixed(2), k.look[2]];
    moved++;
  });
  return { keys: out, moved };
}

// Lift blocked air segments: insert a key at the middle of each blocked run with the eye
// raised above the highest surface the run crosses (plus `margin`), keeping the interpolated
// look. Re-check and repeat (new straight segments can still clip near their ends) up to
// `rounds` times. Runs that sit on a key, or on a walk segment, are left for the creator.
export async function fixPath(keys: Key[], probe: Probe, opts: { margin?: number; rounds?: number; hz?: number } = {}): Promise<{ keys: Key[]; report: PathReport }> {
  const margin = opts.margin ?? 12, rounds = opts.rounds ?? 4, hz = opts.hz ?? 10;
  const grounded = await groundKeys(sortKeys(keys), probe);
  let ks = grounded.keys;
  let added = 0;
  let report = await checkPath(ks, probe, hz);
  for (let round = 0; round < rounds && !report.clear; round++) {
    const fixable = report.runs.filter((r) => r.air && r.atKey === null);
    if (fixable.length === 0) break;
    for (const r of fixable) {
      const tm = +((r.t0 + r.t1) / 2).toFixed(3);
      const s = sample(ks, tm, 30) as any;
      if (!s.air) continue;
      const a = ks[segmentOf(ks, tm)], b = ks[segmentOf(ks, tm) + 1];
      const y = Math.max(r.maxTop + margin, a.eye?.[1] ?? 0, b.eye?.[1] ?? 0);
      ks = addKeyAt(ks, tm, { t: tm, m: 'air', eye: [+s.eye[0].toFixed(2), +y.toFixed(2), +s.eye[2].toFixed(2)], look: s.look.map((v: number) => +v.toFixed(2)) as [number, number, number], fov: Math.round(s.fov) });
      added++;
    }
    report = await checkPath(ks, probe, hz);
  }
  return { keys: ks, report: { ...report, fixedKeys: added, groundedKeys: grounded.moved, unfixable: report.runs.filter((r) => !r.air || r.atKey !== null) } };
}

export function describeRun(r: Run, _keys: Key[]): string {
  const where = r.atKey !== null ? `key ${r.atKey + 1} is inside a structure` : r.air ? `air segment ${r.segment + 1}→${r.segment + 2} passes through a structure` : `walk segment ${r.segment + 1}→${r.segment + 2} crosses a structure`;
  return `${r.t0.toFixed(1)}–${r.t1.toFixed(1)}s: ${where} (surface at ${r.maxTop.toFixed(0)} m)`;
}
