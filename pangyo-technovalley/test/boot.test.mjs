// Integration: boot the world headless through the studio's Playwright launcher and check the studio contract.
// Requires the dev server on port 5175 (`npm run dev` in this package, or `npx vite --port 5175 --strictPort`).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWorld, WORLD_PORTS } from '../../studio/server/render/browser.mjs';
import { buildFootprintIndex, isInsideFootprint, footprintAt } from '../src/world/FootprintIndex.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const TOUR = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'public/data/tour.json'), 'utf8'));
const GIS = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'public/data/gis.json'), 'utf8'));
const TIMEOUT = 400_000;

describe('pangyo-technovalley boots', () => {
  let browser, page, pageErrors, wallClockMs;

  beforeAll(async () => {
    const t0 = Date.now();
    const r = await launchWorld({ world: 'pangyo-technovalley', port: 5175, width: 1280, height: 720, time: 'sunset', quality: 'med' });
    browser = r.browser; page = r.page; pageErrors = r.errors;
    wallClockMs = Date.now() - t0;
    // installStudioBridge is imported after __twin.ready is published
    await page.waitForFunction(() => typeof window.__twin?.probePath === 'function', null, { timeout: 120_000 });
  }, TIMEOUT);

  afterAll(async () => { await browser?.close(); });

  it('registers port 5175 in the studio launcher', () => {
    expect(WORLD_PORTS['pangyo-technovalley']).toBe(5175);
  });

  it('publishes window.__twin.ready with no page errors', async () => {
    const ready = await page.evaluate(() => !!window.__twin?.ready);
    expect(ready).toBe(true);
    expect(pageErrors).toEqual([]);
  }, TIMEOUT);

  it('has the world / props / vegetation scene groups', async () => {
    const groups = await page.evaluate(() => ['world', 'props', 'vegetation'].map((n) => !!window.__twin.app.scene.getObjectByName(n)));
    expect(groups).toEqual([true, true, true]);
  }, TIMEOUT);

  it('loaded at least 300 buildings and the fitted streets', async () => {
    const n = await page.evaluate(() => ({ buildings: window.__twin.world.gis.buildings.length, streets: window.__twin.world.streetSpecs.length }));
    expect(n.buildings).toBeGreaterThanOrEqual(300);
    expect(n.streets).toBeGreaterThan(0);
  }, TIMEOUT);

  it('has the NC R&D Center at the origin, 58 m tall', async () => {
    const b = await page.evaluate(() => {
      const x = window.__twin.world.gis.buildings.find((q) => q.osmId === 'way/694434545');
      return x && { h: x.heightM, cx: x.centroid[0], cz: x.centroid[1] };
    });
    expect(b).toBeTruthy();
    expect(b.h).toBe(58);
    expect(Math.hypot(b.cx, b.cz)).toBeLessThan(1);
  }, TIMEOUT);

  it('probePath reports every tour stop clear', async () => {
    expect(TOUR.length).toBe(6);
    const probes = await page.evaluate((pts) => window.__twin.probePath({ points: pts, clearance: 1.0 }), TOUR.map((s) => s.pos));
    probes.forEach((p, i) => {
      expect(p, `${TOUR[i].title} ${JSON.stringify(TOUR[i].pos)} -> ${JSON.stringify(p)}`).toMatchObject({ blocked: false });
    });
  }, TIMEOUT);

  it('places no street lamp inside a building footprint', async () => {
    const { lamps, placement } = await page.evaluate(() => ({
      lamps: window.__twin.props.lampPositions.map(([x, , z]) => [x, z]),
      placement: window.__twin.props.placement,
    }));
    expect(lamps.length).toBeGreaterThan(100);
    // same helper the runtime used, re-run here on the shipped gis.json
    const idx = buildFootprintIndex([...GIS.buildings, ...GIS.buildingParts]);
    const bad = lamps.filter(([x, z]) => isInsideFootprint(x, z, idx, 1.0))
      .map(([x, z]) => `(${x.toFixed(1)}, ${z.toFixed(1)}) in ${footprintAt(x, z, idx) || 'clearance band'}`);
    expect(bad, `lamps inside buildings: ${bad.slice(0, 10).join('; ')}`).toEqual([]);
    expect(placement.lamps).toBe(lamps.length);
  }, TIMEOUT);

  it('places no street tree inside a building footprint', async () => {
    const trees = await page.evaluate(() => window.__twin.world.treeSpots.map(([x, , z]) => [x, z]));
    const idx = buildFootprintIndex([...GIS.buildings, ...GIS.buildingParts]);
    const bad = trees.filter(([x, z]) => isInsideFootprint(x, z, idx, 0.5))
      .map(([x, z]) => `(${x.toFixed(1)}, ${z.toFixed(1)}) in ${footprintAt(x, z, idx) || 'clearance band'}`);
    expect(bad, `trees inside buildings: ${bad.slice(0, 10).join('; ')}`).toEqual([]);
  }, TIMEOUT);

  it('places no bench, bollard or hydrant inside a building footprint', async () => {
    const props = await page.evaluate(() => ({
      benches: window.__twin.props.benchPositions,
      bollards: window.__twin.props.bollardPositions,
      hydrants: window.__twin.props.hydrantPositions,
      placement: window.__twin.props.placement,
    }));
    const idx = buildFootprintIndex([...GIS.buildings, ...GIS.buildingParts]);
    const check = (name, pts) => {
      const bad = pts.filter(([x, z]) => isInsideFootprint(x, z, idx, 0.5))
        .map(([x, z]) => `(${x.toFixed(1)}, ${z.toFixed(1)}) in ${footprintAt(x, z, idx) || 'clearance band'}`);
      expect(bad, `${name} inside buildings: ${bad.slice(0, 10).join('; ')}`).toEqual([]);
    };
    check('benches', props.benches);
    check('bollards', props.bollards);
    check('hydrants', props.hydrants);
    // every placed item is accounted for in the counters, and at least the procedural benches exist
    expect(props.benches.length).toBe(props.placement.benches);
    expect(props.bollards.length).toBe(props.placement.bollards);
    expect(props.hydrants.length).toBe(props.placement.hydrants);
    expect(props.benches.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it('reports load time and render cost', async () => {
    const s = await page.evaluate(() => ({ loadMs: window.__twin.loadMs, stats: window.__twin.app.stats(), placement: window.__twin.props.placement }));
    console.log(`[boot] in-page load ${s.loadMs} ms, launchWorld wall clock ${wallClockMs} ms, ` +
      `${(s.stats.triangles / 1e6).toFixed(2)} M tris, ${s.stats.calls} draw calls, ${s.stats.textures} textures; ` +
      `props ${JSON.stringify(s.placement)}`);
    expect(s.loadMs).toBeGreaterThan(0);
    expect(s.stats.triangles).toBeGreaterThan(1e6);
  }, TIMEOUT);

  it('renders tour stop 1 to docs/boot.png', async () => {
    await page.evaluate((s) => {
      const app = window.__twin.app;
      window.__twin.setTime(s.time || 'sunset');
      app.camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
      app.camera.lookAt(s.look[0], s.look[1], s.look[2]);
      app.camera.fov = 50; app.camera.updateProjectionMatrix();
      window.__twin.renderOnce();
    }, TOUR[0]);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__twin.renderOnce());
    const out = path.join(pkgRoot, 'docs/boot.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    expect(fs.statSync(out).size).toBeGreaterThan(50_000);
  }, TIMEOUT);
});
