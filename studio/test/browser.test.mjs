import { it, expect } from 'vitest';
import { launchWorld, worldUrl, WORLD_PORTS } from '../server/render/browser.mjs';

it('loads union-square-sf headless and exposes __twin', async () => {
  const { browser, page, softwareRender } = await launchWorld({ world: 'union-square-sf', width: 640, height: 360, time: 'sunset', quality: 'low' });
  const ready = await page.evaluate(() => !!window.__twin?.ready);
  await browser.close();
  expect(ready).toBe(true);
  expect(typeof softwareRender).toBe('boolean');
}, 300000);

it('rejects unknown worlds', async () => {
  await expect(launchWorld({ world: 'mars' })).rejects.toThrow(/unknown world/);
});

it('rejects promptly with a world-load error when nothing listens on the given port', async () => {
  const start = Date.now();
  await expect(
    launchWorld({ world: 'union-square-sf', port: 5999, width: 320, height: 180 })
  ).rejects.toThrow(/^world load/);
  expect(Date.now() - start).toBeLessThan(60000);
}, 60000);

// The query contract, without a browser: `worldUrl` is what `launchWorld` opens.
it('composes the world URL with life off by default and life=1 when asked', () => {
  const base = worldUrl({ world: 'pangyo-technovalley', time: 'day', quality: 'med' });
  expect(base).toBe(`http://localhost:${WORLD_PORTS['pangyo-technovalley']}/?qa=1&ui=0&studio=1&life=0&time=day&q=med`);
  const live = worldUrl({ world: 'pangyo-technovalley', time: 'day', quality: 'med', life: true });
  expect(live).toContain('life=1');
  expect(live).not.toContain('life=0');
  expect(worldUrl({ world: 'union-square-sf', port: 5197, life: true })).toBe('http://localhost:5197/?qa=1&ui=0&studio=1&life=1&time=sunset&q=med');
  expect(() => worldUrl({ world: 'mars' })).toThrow(/unknown world/);
});
