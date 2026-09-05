// Second world (kyoto-higashiyama) integration. Needs `npm run dev` in kyoto-higashiyama
// (port 5174) and ffmpeg/ffprobe on PATH. That world is a plain-JS codebase with its own
// frame loop and post pipeline, so what is really under test here is src/studio.js: the
// adapter that presents it to the studio with the same __twin shape union-square-sf has.
import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { launchWorld } from '../server/render/browser.mjs';
import { renderPreviz } from '../server/render/previz.mjs';

it('loads kyoto-higashiyama headless and exposes a usable __twin', async () => {
  const { browser, page } = await launchWorld({ world: 'kyoto-higashiyama', width: 640, height: 360, time: 'sunset' });
  try {
    const eyeType = await page.evaluate(() => typeof window.__twin.pos().eye[0]);
    expect(eyeType).toBe('number');
    // The pieces previz.mjs's INSTALL script reaches for.
    const shape = await page.evaluate(() => ({
      updatables: Array.isArray(window.__twin.app.updatables),
      render: typeof window.__twin.app.renderer.render,
      timeUpdate: typeof window.__twin.app.time.update,
      elapsed: typeof window.__twin.app.elapsed,
      floorAt: typeof window.__twin.world.collision.floorAt(-382, -578, 40, 100),
      heightAt: typeof window.__twin.world.terrain.heightAt(-382, -578),
      root: !!window.__twin.app.scene.getObjectByName('world'),
    }));
    expect(shape).toEqual({ updatables: true, render: 'function', timeUpdate: 'function', elapsed: 'number', floorAt: 'number', heightAt: 'number', root: true });
  } finally { await browser.close(); }
}, 400000);

it('renders a 1s kyoto air shot to an mp4 with 30 frames', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'previz-kyoto-'));
  // Near the `gion-hanamikoji-north` hero view: Hanamikoji looking south from Shijo.
  // Note the altitudes: this world models the Higashiyama hillside, so the ground under
  // Gion already sits ~39 m up (heightAt(-382,-578) === 39.2). An air key at y=12 there is
  // 27 m *under* the street, and renders as the undersides of the roofs against the sky.
  const shot = { id: 'k', name: 'k', fps: 30, width: 320, height: 180, timeOfDay: 'sunset',
    keys: [ { t: 0, m: 'air', eye: [-382, 51, -578], look: [-410, 41, -390] },
            { t: 1, m: 'air', eye: [-390, 57, -540], look: [-410, 41, -390] } ] };
  const r = await renderPreviz({ world: 'kyoto-higashiyama', shot, outDir: out });
  expect(fs.existsSync(r.mp4)).toBe(true);
  expect(r.frames).toBe(30);
  const n = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', r.mp4]).toString().trim();
  expect(Number(n)).toBe(30);
}, 400000);
