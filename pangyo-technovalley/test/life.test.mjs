// Integration: boot the world with the life systems on and check stage 3 — transit routes resolve, pedestrians
// and vehicles survive 30 s of simulated time without a NaN, vehicles stop at red, the block-fill ground layer
// stays inside its draw-call budget and the four viewpoints are usable.
//
// Time is advanced with `__twin.stepLife(seconds, dt)` (fixed 1/30 s steps of the life systems only), so the
// assertions are deterministic and do not depend on the headless frame rate.
//
// Requires the dev server on port 5175 (`npm run dev` in this package, or `npx vite --port 5175 --strictPort`).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWorld } from '../../studio/server/render/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(pkgRoot, 'public/data', f), 'utf8'));
const ROUTES = read('routes.json').filter((r) => !String(r.name).startsWith('_'));
const VIEWPOINTS = read('viewpoints.json');
const STREETS = read('streets_spec.json').streets;
const TIMEOUT = 400_000;
const SIM_S = 30;

describe('pangyo-technovalley life systems (stage 3)', () => {
  let browser, page, pageErrors, before, after;

  beforeAll(async () => {
    const r = await launchWorld({ world: 'pangyo-technovalley', port: 5175, width: 1280, height: 720, time: 'day', quality: 'med', extraQuery: '&life=1' });
    browser = r.browser; page = r.page; pageErrors = r.errors;
    await page.waitForFunction(() => typeof window.__twin?.stepLife === 'function', null, { timeout: 120_000 });
    before = await page.evaluate(() => window.__twin.lifeStats());
    after = await page.evaluate((s) => { window.__twin.stepLife(s, 1 / 30); return window.__twin.lifeStats(); }, SIM_S);
  }, TIMEOUT);

  afterAll(async () => { await browser?.close(); });

  it('boots with life on and no page errors', () => {
    expect(pageErrors).toEqual([]);
    expect(before.pedestrians).toBeGreaterThan(0);
  });

  it(`keeps >= 20 pedestrians and >= 5 vehicles alive after ${SIM_S} s of simulated time`, () => {
    expect(after.pedestrians, `pedestrians: ${before.pedestrians} -> ${after.pedestrians}`).toBeGreaterThanOrEqual(20);
    expect(after.vehicles, `vehicles: ${before.vehicles} -> ${after.vehicles}`).toBeGreaterThanOrEqual(5);
  }, TIMEOUT);

  it('has no NaN agent positions', () => {
    expect(before.pedNaN).toBe(0);
    expect(before.vehicleNaN).toBe(0);
    expect(after.pedNaN).toBe(0);
    expect(after.vehicleNaN).toBe(0);
  }, TIMEOUT);

  it('spawns pedestrians only on sidewalks / plaza patches', () => {
    // Pedestrians walk the NavGraph, which is built purely from the fitted streets' sidewalks (plus a plaza
    // lattice when data/plaza.json exists — this world has none). Crossing agents are momentarily on the
    // carriageway, so this is a majority check, not an every-agent check.
    expect(before.pedOnSidewalk / before.pedestrians).toBeGreaterThan(0.8);
    expect(after.pedOnSidewalk / after.pedestrians).toBeGreaterThan(0.8);
  }, TIMEOUT);

  it('resolves every route in routes.json against a real street and lane', async () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
    for (const r of ROUTES) expect(STREETS.some((s) => s.name === r.street), `${r.name} names ${r.street}`).toBe(true);
    expect(after.routeWarnings, `unresolved routes: ${after.routeWarnings.join('; ')}`).toEqual([]);
    expect(after.routeVehicles).toBe(ROUTES.length);
    expect(after.routeVehiclesAlive).toBe(ROUTES.length);
    const placed = await page.evaluate(() => window.__twin.life.traffic.vehicles.filter((v) => v.route)
      .map((v) => ({ name: v.route.name, street: v.link?.name, dir: v.route.dir, stops: v.stops?.length ?? 0 })));
    for (const p of placed) expect(p.stops, `${p.name} resolved no stops`).toBeGreaterThan(0);
  }, TIMEOUT);

  it('stops route vehicles at red lights', async () => {
    const smoke = await page.evaluate(({ seconds, dt }) => {
      const l = window.__twin.life, tr = l.traffic;
      const vs = tr.vehicles.filter((v) => v.route);
      let redStops = 0; const where = [];
      for (let k = 0, n = Math.round(seconds / dt); k < n; k++) {
        l.update(dt, 0);
        for (const v of vs) {
          if (!v.alive || v.v > 0.02) continue;
          const node = v.link.endNode;
          if (!node || !node.signal || !node.light || v.link.len - v.s > 15) continue;
          const col = v.link.axis === 'ns' ? node.light.ns : node.light.ew;
          if (col === 'green') continue;
          redStops++;
          if (where.length < 3) where.push(`${v.route.name} @ (${node.x.toFixed(0)}, ${node.z.toFixed(0)}) ${col}`);
        }
      }
      return { redStops, where, signals: l.lights.stats() };
    }, { seconds: 60, dt: 0.1 });
    expect(smoke.signals.signals, 'no signalised crossings').toBeGreaterThan(0);
    expect(smoke.signals.heads, 'no signal lamp heads bound to a crossing').toBeGreaterThan(0);
    expect(smoke.redStops, `route vehicles never stopped at a red light (${JSON.stringify(smoke.where)})`).toBeGreaterThan(0);
  }, TIMEOUT);

  it('drives the traffic signals from the OSM signal bin', async () => {
    const r = await page.evaluate(() => window.__twin.world.signalReport);
    expect(r).toBeTruthy();
    expect(r.osmUsed, 'no OSM highway=traffic_signals node snapped to a fitted junction').toBeGreaterThan(0);
    expect(r.signalled).toBeGreaterThan(0);
    const total = await page.evaluate(() => window.__twin.world.streets.crossings.length);
    expect(r.signalled, 'every crossing is signalised — the OSM wiring is not being applied').toBeLessThan(total);
  }, TIMEOUT);

  it('has a block-fill ground layer within the draw-call budget', async () => {
    const g = await page.evaluate(() => {
      const grp = window.__twin.app.scene.getObjectByName('world')?.getObjectByName('blockfill');
      return grp && { meshes: grp.children.length, names: grp.children.map((c) => c.name), stats: window.__twin.world.blockFill.stats() };
    });
    expect(g, 'no blockfill group in the world group').toBeTruthy();
    expect(g.meshes).toBeGreaterThan(0);
    expect(g.meshes, `block fill uses ${g.meshes} draw calls: ${g.names.join(', ')}`).toBeLessThanOrEqual(40);
    expect(g.stats.landuseAreas, 'no OSM landuse polygon reached the runtime').toBeGreaterThan(50);
    expect(g.stats.blockPatches, 'no fallback block cells were emitted').toBeGreaterThan(0);
  }, TIMEOUT);

  it('has four usable viewpoints', async () => {
    expect(VIEWPOINTS.length).toBe(4);
    for (const v of VIEWPOINTS) {
      const c = v.camera;
      expect(typeof v.id).toBe('string');
      expect(typeof v.title).toBe('string');
      for (const k of ['x', 'y', 'z', 'lat', 'lon', 'headingDeg', 'pitchDeg', 'fovDegVertical']) {
        expect(Number.isFinite(c[k]), `${v.id}.camera.${k}`).toBe(true);
      }
    }
    const ids = await page.evaluate(() => window.__twin.viewpoints());
    expect(ids).toEqual(VIEWPOINTS.map((v) => v.id));
    const probes = await page.evaluate((vps) => {
      const t = window.__twin, w = t.world;
      const pts = vps.map((v) => {
        const c = v.camera;
        const y = c.absoluteY !== undefined ? c.absoluteY : w.collision.floorAt(c.x, c.z, w.terrain.heightAt(c.x, c.z) + 0.5, 100) + (c.heightM ?? 1.7);
        return [c.x, y, c.z];
      });
      return t.probePath({ points: pts, clearance: 0.9 });
    }, VIEWPOINTS);
    probes.forEach((p, i) => expect(p, `${VIEWPOINTS[i].id} camera is inside geometry`).toMatchObject({ blocked: false }));
    for (const v of VIEWPOINTS) expect(await page.evaluate((id) => window.__twin.setView(id), v.id), `setView(${v.id})`).toBe(true);
  }, TIMEOUT);

  it('reports the stage-3 numbers', () => {
    console.log(`[life] peds ${before.pedestrians} (${before.pedOnSidewalk} on sidewalk) -> ${after.pedestrians}; ` +
      `vehicles ${before.vehicles} -> ${after.vehicles} (${after.routeVehiclesAlive}/${after.routeVehicles} route); ` +
      `NaN ${after.pedNaN}+${after.vehicleNaN}; nav ${after.navNodes} nodes / ${after.navEdges} edges; ` +
      `ped update ${after.pedUpdateMs} ms`);
  });
});
