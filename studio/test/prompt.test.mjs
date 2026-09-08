import { it, expect } from 'vitest';
import { anchorsFor, anchorsToKeys, promptToKeys } from '../server/prompt.mjs';

it('anchors include viewpoints and tour stops for union-square-sf', () => {
  const a = anchorsFor('union-square-sf');
  expect(a.length).toBeGreaterThan(5);
  expect(a[0]).toHaveProperty('pos');
  expect(a[0]).toHaveProperty('look');
});

it('anchors include tour stops for kyoto-higashiyama', () => {
  const a = anchorsFor('kyoto-higashiyama');
  expect(a.length).toBeGreaterThan(3);
  expect(a[0]).toHaveProperty('pos');
  expect(a[0]).toHaveProperty('look');
});

// pangyo-technovalley has no entry in TOURS and no viewpoints.json: every anchor it has
// comes from its own public/data/tour.json, which is what anchorsFor() now prefers.
it("anchors come from a world's own tour.json when it ships one", () => {
  const a = anchorsFor('pangyo-technovalley');
  expect(a.length).toBeGreaterThanOrEqual(6);
  for (const x of a) {
    expect(Array.isArray(x.pos) && x.pos.length === 3 && x.pos.every(Number.isFinite)).toBe(true);
    expect(Array.isArray(x.look) && x.look.length === 3 && x.look.every(Number.isFinite)).toBe(true);
    expect(typeof x.title).toBe('string');
  }
  // The stops themselves, not a copy in the studio: first stop is the NC R&D Center aerial.
  expect(a[0].pos).toEqual([40, 140, 220]);
});

it('anchorsFor is empty for a world that has neither a TOURS entry nor a tour.json', () => {
  expect(anchorsFor('no-such-world')).toEqual([]);
});

it('anchorsToKeys spreads air keys over the duration', () => {
  const ks = anchorsToKeys(anchorsFor('union-square-sf'), 8);
  expect(ks[0].t).toBe(0);
  expect(ks[ks.length - 1].t).toBe(8);
  expect(ks.every((k) => k.m === 'air')).toBe(true);
});

it('promptToKeys with provider none returns valid sorted keys', async () => {
  const ks = await promptToKeys({ world: 'union-square-sf', prompt: 'x', durationSec: 6, provider: 'none' });
  expect(ks.length).toBeGreaterThan(1);
  for (let i = 1; i < ks.length; i++) expect(ks[i].t).toBeGreaterThanOrEqual(ks[i - 1].t);
});
