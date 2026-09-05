import { it, expect } from 'vitest';
import { addKeyAt, removeKey, moveKey, keyFromCamera, mixedModeSegments } from '../app/src/timeline';
const K = (t: number) => ({ t, m: 'air' as const, eye: [0, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number] });
it('inserts sorted and replaces same-time keys', () => {
  let ks = addKeyAt([K(0), K(2)], 1, K(1)); expect(ks.map((k) => k.t)).toEqual([0, 1, 2]);
  ks = addKeyAt(ks, 1, { ...K(1), cap: 'x' }); expect(ks.length).toBe(3); expect(ks[1].cap).toBe('x');
});
it('moveKey re-sorts', () => { const ks = moveKey([K(0), K(1), K(2)], 0, 3); expect(ks.map((k) => k.t)).toEqual([1, 2, 3]); });
it('keyFromCamera makes walk keys from eye', () => { const k = keyFromCamera({ eye: [5, 1.7, 9], look: [0, 0, 0], fov: 66 }, { t: 1, m: 'walk' }); expect(k.pos).toEqual([5, 9]); expect(k.eye).toBeUndefined(); });

it('mixedModeSegments flags every adjacent pair with different modes', () => {
  const air = (t: number) => ({ ...K(t) });
  const walk = (t: number) => ({ t, m: 'walk' as const, pos: [0, 0] as [number, number], look: [0, 0, 0] as [number, number, number] });
  expect(mixedModeSegments([air(0), air(1), air(2)])).toEqual([]);
  expect(mixedModeSegments([air(0), walk(2), walk(3), air(5)])).toEqual(['0s→2s', '3s→5s']);
  expect(mixedModeSegments([])).toEqual([]);
  expect(mixedModeSegments([air(0)])).toEqual([]);
});
