import { it, expect } from 'vitest';
import { launchWorld } from '../server/render/browser.mjs';

it('loads union-square-sf headless and exposes __twin', async () => {
  const { browser, page, softwareRender } = await launchWorld({ world: 'union-square-sf', width: 640, height: 360, time: 'sunset', quality: 'low' });
  const ready = await page.evaluate(() => !!window.__twin?.ready);
  await browser.close();
  expect(ready).toBe(true);
  expect(typeof softwareRender).toBe('boolean');
}, 300000);
