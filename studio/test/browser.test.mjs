import { it, expect } from 'vitest';
import { launchWorld } from '../server/render/browser.mjs';

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
