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
