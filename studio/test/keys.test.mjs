import { describe, it, expect } from 'vitest';
import { ease, sample, duration } from '../schemas/keys.mjs';

const KEYS = [
  { t: 0, m: 'air', eye: [0, 100, 0], look: [0, 0, 0] },
  { t: 2, m: 'air', eye: [100, 100, 0], look: [0, 0, 0] },
  { t: 2.5, m: 'walk', pos: [10, 10], look: [0, 1.7, 0], cut: true, cap: 'A' },
  { t: 4.5, m: 'walk', pos: [20, 10], look: [0, 1.7, 0], cap: 'B' },
];

describe('keys', () => {
  it('ease is 0 at 0, 1 at 1, 0.5 at 0.5', () => {
    expect(ease(0, 1, 0)).toBe(0); expect(ease(0, 1, 1)).toBe(1); expect(ease(0, 1, 0.5)).toBeCloseTo(0.5);
  });
  it('duration is the last key time', () => expect(duration(KEYS)).toBe(4.5));
  it('interpolates air eye positions', () => {
    const s = sample(KEYS, 1);
    expect(s.air).toBe(true); expect(s.eye[0]).toBeCloseTo(50); expect(s.eye[1]).toBe(100);
  });
  it('walk keys give pos and moving flag', () => {
    const s = sample(KEYS, 3.5);
    expect(s.air).toBe(false); expect(s.pos[0]).toBeCloseTo(15); expect(s.moving).toBe(true);
  });
  it('cut is true only within the first frame after a cut key', () => {
    expect(sample(KEYS, 2.5, 30).cut).toBe(true);
    expect(sample(KEYS, 2.8, 30).cut).toBe(false);
  });
  it('caption switches at the midpoint of a segment', () => {
    expect(sample(KEYS, 3.0).cap).toBe('A'); expect(sample(KEYS, 4.0).cap).toBe('B');
  });
});
