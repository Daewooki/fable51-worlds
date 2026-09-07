import { it, expect } from 'vitest';
import { samplePath, checkPath, fixPath, WALK_EYE, type Probe } from '../app/src/pathcheck';
import type { Key } from '../app/src/timeline';

// A toy world: flat ground at y=0 and one 40 m tall block covering x ∈ [40, 60] (all z).
const fakeProbe: Probe = async (points) => points.map(([x, y]) => {
  const inBlock = x >= 40 && x <= 60;
  const top = inBlock ? 40 : 0;
  const structure = inBlock;
  return { blocked: y < 0.3 || (structure && y < top + 1.0), top, ground: 0, structure };
});

const air = (t: number, x: number, y: number): Key => ({ t, m: 'air', eye: [x, y, 0], look: [50, 0, 0] });

it('samplePath includes every key time and the end', () => {
  const s = samplePath([air(0, 0, 10), air(2.35, 100, 10)], 10);
  expect(s[0].t).toBe(0);
  expect(s[s.length - 1].t).toBe(2.35);
  expect(s.some((p) => p.t === 2.35)).toBe(true);
  expect(s.length).toBeGreaterThan(20);
});

it('walk samples carry the placeholder eye height', () => {
  const s = samplePath([{ t: 0, m: 'walk', pos: [0, 0], look: [1, 0, 0] }, { t: 1, m: 'walk', pos: [10, 0], look: [1, 0, 0] }], 10);
  expect(s.every((p) => !p.air && p.eye[1] === WALK_EYE)).toBe(true);
});

it('checkPath finds the stretch that crosses the block', async () => {
  const r = await checkPath([air(0, 0, 10), air(10, 100, 10)], fakeProbe);
  expect(r.clear).toBe(false);
  expect(r.runs.length).toBe(1);
  // ease-in-out: x reaches 40 at k≈0.447 and 60 at k≈0.553 of the 10 s segment
  expect(r.runs[0].t0).toBeGreaterThanOrEqual(4.3); expect(r.runs[0].t0).toBeLessThanOrEqual(4.6);
  expect(r.runs[0].t1).toBeGreaterThanOrEqual(5.4); expect(r.runs[0].t1).toBeLessThanOrEqual(5.7);
  expect(r.runs[0].maxTop).toBe(40);
  expect(r.runs[0].air).toBe(true);
  expect(r.runs[0].atKey).toBeNull();
});

it('a clear path reports clear', async () => {
  const r = await checkPath([air(0, 0, 80), air(10, 100, 80)], fakeProbe);
  expect(r.clear).toBe(true);
  expect(r.runs).toEqual([]);
});

it('fixPath lifts the crossing over the block and leaves the endpoints alone', async () => {
  const { keys, report } = await fixPath([air(0, 0, 10), air(10, 100, 10)], fakeProbe, { margin: 12 });
  expect(report.clear).toBe(true);
  expect(report.fixedKeys).toBeGreaterThanOrEqual(1);
  expect(keys[0]).toEqual(air(0, 0, 10));
  expect(keys[keys.length - 1]).toEqual(air(10, 100, 10));
  const lifted = keys.slice(1, -1);
  expect(lifted.length).toBeGreaterThanOrEqual(1);
  expect(Math.max(...lifted.map((k) => k.eye![1]))).toBeGreaterThanOrEqual(52);
  expect(keys.map((k) => k.t)).toEqual([...keys.map((k) => k.t)].sort((a, b) => a - b));
});

it('fixPath reports, but does not move, a key that sits inside the block', async () => {
  const { keys, report } = await fixPath([air(0, 0, 10), air(5, 50, 10), air(10, 100, 10)], fakeProbe);
  expect(keys.length).toBeGreaterThanOrEqual(3);
  expect(keys.find((k) => k.t === 5)).toEqual(air(5, 50, 10));
  expect(report.clear).toBe(false);
  expect(report.unfixable?.some((r) => r.atKey !== null)).toBe(true);
});

it('fixPath leaves walk segments to the creator', async () => {
  const walk = (t: number, x: number): Key => ({ t, m: 'walk', pos: [x, 0], look: [50, 0, 0] });
  const { keys, report } = await fixPath([walk(0, 0), walk(10, 100)], fakeProbe);
  expect(keys.length).toBe(2);
  expect(report.clear).toBe(false);
  expect(report.unfixable?.length).toBe(1);
});
