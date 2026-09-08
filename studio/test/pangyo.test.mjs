// Third world (pangyo-technovalley) integration. Needs that world's Vite dev server up on
// 5175 (`cd pangyo-technovalley && npx vite --port 5175 --strictPort`) and ffmpeg/ffprobe on
// PATH. It is a generalized copy of union-square-sf's runtime, so unlike kyoto.test.mjs this
// is not testing an adapter — it is testing that the *data-driven* world (OSM buildings, SRTM
// terrain, fitted street specs, tour.json) satisfies the same studio contract union does.
import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { launchWorld, WORLD_PORTS } from '../server/render/browser.mjs';
import { renderPreviz } from '../server/render/previz.mjs';

// export/glb.mjs writes through store.mjs, which reads STUDIO_PROJECTS at import time.
process.env.STUDIO_PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pangyo-'));
const { exportGlb } = await import('../server/export/glb.mjs');
const { createProject, createShot, WORLDS } = await import('../schemas/project.mjs');
const { writeProject } = await import('../server/store.mjs');

// tour.json stops 1 and 2, in the world's local metres (x east, z south, y up).
const STOP1 = { pos: [40, 140, 220], look: [0, 20, 0] };
const STOP2 = { pos: [0, 0.5, 44], look: [0, 24, 0] };

it('pangyo-technovalley is a registered world on port 5175', () => {
  expect(WORLDS).toContain('pangyo-technovalley');
  expect(WORLD_PORTS['pangyo-technovalley']).toBe(5175);
});

it('loads pangyo-technovalley headless and exposes a usable __twin', async () => {
  const { browser, page } = await launchWorld({ world: 'pangyo-technovalley', width: 640, height: 360, time: 'sunset' });
  try {
    // `__twin.pos()` is the QA surface's {x,y,z,heading}, as in union-square-sf; the
    // studio's own {eye,look,fov} pose comes over the postMessage bridge, not from here.
    const posShape = await page.evaluate(() => Object.keys(window.__twin.pos()).sort().join(','));
    expect(posShape).toBe('heading,x,y,z');
    // StudioBridge installs itself just after `__twin.ready` flips, so wait for the one
    // member the headless callers use directly rather than racing it.
    await page.waitForFunction(() => typeof window.__twin?.probePath === 'function', null, { timeout: 120000 });
    // The pieces previz.mjs's INSTALL script and the Director's path check reach for.
    const shape = await page.evaluate(() => ({
      updatables: Array.isArray(window.__twin.app.updatables),
      render: typeof window.__twin.app.renderer.render,
      timeUpdate: typeof window.__twin.app.time.update,
      elapsed: typeof window.__twin.app.elapsed,
      floorAt: typeof window.__twin.world.collision.floorAt(0, 0, 200, 300),
      heightAt: typeof window.__twin.world.terrain.heightAt(0, 0),
      probePath: typeof window.__twin.probePath,
      root: !!window.__twin.app.scene.getObjectByName('world'),
      props: !!window.__twin.app.scene.getObjectByName('props'),
      vegetation: !!window.__twin.app.scene.getObjectByName('vegetation'),
    }));
    expect(shape).toEqual({
      updatables: true, render: 'function', timeUpdate: 'function', elapsed: 'number',
      floorAt: 'number', heightAt: 'number', probePath: 'function',
      root: true, props: true, vegetation: true,
    });
  } finally { await browser.close(); }
}, 400000);

it('renders a 2s pangyo air shot to an mp4 with 60 frames', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'previz-pangyo-'));
  // tour stop 1 (the NC R&D Center aerial) down to stop 2 (the NC forecourt) — but held at
  // y=80 so the whole 2 s stays well above the 58 m tower and its podium: this test is about
  // the render loop, not about the path check, which has its own tests.
  const shot = { id: 'p', name: 'p', fps: 30, width: 320, height: 180, timeOfDay: 'sunset',
    keys: [ { t: 0, m: 'air', eye: STOP1.pos, look: STOP1.look },
            { t: 2, m: 'air', eye: [STOP2.pos[0], 80, STOP2.pos[2]], look: STOP2.look } ] };
  const r = await renderPreviz({ world: 'pangyo-technovalley', shot, outDir: out });
  expect(fs.existsSync(r.mp4)).toBe(true);
  expect(r.frames).toBe(60);
  const n = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', r.mp4]).toString().trim();
  expect(Number(n)).toBe(60);
}, 400000);

it('exports the pangyo scene to a parseable glb with meshes', async () => {
  const p = createProject({ name: 'pangyo export', world: 'pangyo-technovalley' });
  const s = createShot({ name: 's' });
  s.keys = [{ t: 0, m: 'air', eye: STOP1.pos, look: STOP1.look }];
  p.shots.push(s);
  await writeProject(p);
  const r = await exportGlb({ project: p, shotId: s.id, log: () => {} });
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(r.glb);
  expect(doc.getRoot().listMeshes().length).toBeGreaterThan(0);
  expect(fs.existsSync(r.blenderScript)).toBe(true);
  expect(fs.statSync(r.glb).size).toBeGreaterThan(0);
}, 400000);
