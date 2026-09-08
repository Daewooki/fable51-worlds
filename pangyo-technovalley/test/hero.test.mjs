// Integration: the stage-2 hero modules. Boots the world through the studio's Playwright launcher
// and checks that the hero GLBs are in the scene, that no massing geometry is left where they stand,
// and that the studio's probe still meets the building (roof clear / 6th floor blocked).
// Requires the dev server on port 5175 (`npm run dev` in this package).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWorld } from '../../studio/server/render/browser.mjs';
import { orientedBox, fitYaw, fitScale } from '../src/world/PangyoHero.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(pkgRoot, p), 'utf8'));
const HERO = read('public/data/hero.json');
const PROPS = read('public/data/hero_props.json');
const MANIFEST = read('public/assets/models/manifest_pangyo.json');
const TOUR = read('public/data/tour.json');
const NC_ID = 'way/694434545';
const TIMEOUT = 400_000;

describe('pangyo hero module assets', () => {
  it('ships three GLBs inside the triangle budget', () => {
    const names = Object.keys(MANIFEST).sort();
    expect(names).toEqual(['pangyo/alphadome_tower', 'pangyo/nc_rnd_center', 'pangyo/pangyo_station_canopy']);
    for (const [k, e] of Object.entries(MANIFEST)) {
      expect(e.tris, `${k} tris`).toBeLessThanOrEqual(20_000);
      expect(e.front, `${k} front`).toBe('-Z');
      expect(e.origin, `${k} origin`).toBe('bottom_center');
      expect(e.height, `${k} height`).toBeGreaterThan(0);
      expect(Array.isArray(e.footprint) && e.footprint.length === 2, `${k} footprint`).toBe(true);
      expect(fs.existsSync(path.join(pkgRoot, 'public', e.file)), `${k} file`).toBe(true);
    }
  });

  // `origin: bottom_center` is a claim about geometry, and for two of the three modules it is literally
  // true (bbox min.y = 0). The canopy is the exception on purpose: its origin is the PLAZA slab, and the
  // stair well cut into that slab drops 1.02 m below it. The manifest has to SAY so (`originNote`) — a
  // placement that trusted the bbox minimum would float every canopy a metre above the pavement.
  it('measures the canopy stair offset and documents it in the manifest', () => {
    const canopy = MANIFEST['pangyo/pangyo_station_canopy'];
    expect(canopy.bbox_threejs.min[1], 'canopy bbox min.y (stair well below the slab)').toBeCloseTo(-1.02, 2);
    expect(canopy.originNote, 'canopy originNote').toMatch(/-1\.02/);
    expect(canopy.bbox_threejs.max[1] - canopy.bbox_threejs.min[1]).toBeGreaterThan(canopy.height);
    for (const id of ['pangyo/nc_rnd_center', 'pangyo/alphadome_tower']) {
      expect(MANIFEST[id].bbox_threejs.min[1], `${id} sits on its origin`).toBeCloseTo(0, 6);
      expect(MANIFEST[id].originNote).toBeUndefined();
    }
  });

  it('names a module for every hero entry and prop', () => {
    const modules = new Set(['pangyo/nc_rnd_center', 'pangyo/nc_podium', 'pangyo/alphadome_tower']);
    for (const e of HERO) expect(modules.has(e.module), `${e.osmId} -> ${e.module}`).toBe(true);
    for (const p of PROPS) expect(MANIFEST[p.module], `prop ${p.module}`).toBeTruthy();
  });
});

describe('footprint fit maths', () => {
  const square = [[-10, -20], [10, -20], [10, 20], [-10, 20]];

  it('puts the long side of the oriented bbox on the module x axis', () => {
    const o = orientedBox(square);
    expect(o.w).toBeCloseTo(40, 6);
    expect(o.d).toBeCloseTo(20, 6);
    expect(Math.abs(o.ux)).toBeCloseTo(0, 6);
    expect(Math.abs(o.uz)).toBeCloseTo(1, 6);
    expect(o.cx).toBeCloseTo(0, 6);
    expect(o.cz).toBeCloseTo(0, 6);
  });

  it('scales the module footprint and height onto the building', () => {
    const s = fitScale(orientedBox(square), 50, { w: 20, d: 10, h: 100 });
    expect([s.x, s.y, s.z]).toEqual([2, 0.5, 2]);
  });

  it('turns the -Z front toward the nearest fitted street, and obeys facing/yaw', () => {
    const o = orientedBox(square);            // long axis runs north-south, faces look east/west
    const dir = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
    const east = { name: 'east', axis: 'ns', c: 60, from: -200, to: 200, width: 10, sidewalk: 3, lanes: 2, oneway: null, parking: { left: false, right: false } };
    const west = { ...east, name: 'west', c: -60 };
    expect(dir(fitYaw(o, [east]))[0]).toBeGreaterThan(0.99);
    expect(dir(fitYaw(o, [west]))[0]).toBeLessThan(-0.99);
    expect(dir(fitYaw(o, [east], { facing: [-1, 0] }))[0]).toBeLessThan(-0.99);
    expect(fitYaw(o, [east], { yaw: 90 })).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('pangyo hero modules in the world', () => {
  let browser, page, pageErrors, nc;

  beforeAll(async () => {
    const r = await launchWorld({ world: 'pangyo-technovalley', port: 5175, width: 1280, height: 720, time: 'day', quality: 'high' });
    browser = r.browser; page = r.page; pageErrors = r.errors;
    await page.waitForFunction(() => typeof window.__twin?.probePath === 'function', null, { timeout: 120_000 });
    nc = await page.evaluate((id) => {
      const b = window.__twin.world.buildings.infos.get(id);
      return b && { baseY: b.baseY, topY: b.topY, height: b.height };
    }, NC_ID);
  }, TIMEOUT);

  afterAll(async () => { await browser?.close(); });

  it('boots with the hero modules and no page errors', async () => {
    const names = await page.evaluate(() => {
      const out = [];
      window.__twin.app.scene.traverse((o) => { if (o.name && o.name.includes('pangyo/')) out.push(o.name); });
      return out;
    });
    expect(pageErrors).toEqual([]);
    for (const e of HERO) expect(names, e.osmId).toContain(`hero:${e.module}:${e.osmId}`);
    expect(names.filter((n) => n === 'pangyo/pangyo_station_canopy').length).toBe(PROPS.length);
    expect(names).toContain('pangyo/nc_rnd_center');
    expect(names).toContain('pangyo/alphadome_tower');
  }, TIMEOUT);

  // The geometric half of the manifest claim above: in the scene, the canopy's lowest vertex really is
  // 1.02 m (times its placement scale) below the object origin the placer put on the pavement.
  it('places the canopy origin on the pavement with its stair well below it', async () => {
    const m = await page.evaluate(() => {
      const out = [];
      window.__twin.app.scene.traverse((o) => {
        if (o.name !== 'pangyo/pangyo_station_canopy') return;
        o.updateWorldMatrix(true, true);
        const originY = o.matrixWorld.elements[13], sy = o.scale.y;
        let minY = Infinity, maxY = -Infinity;
        o.traverse((c) => {
          const g = c.geometry; if (!g?.attributes?.position) return;
          c.updateWorldMatrix(true, false);
          const p = g.attributes.position, e = c.matrixWorld.elements;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
            if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          }
        });
        out.push({ originY, sy, below: (originY - minY) / sy, above: (maxY - originY) / sy });
      });
      return out;
    });
    expect(m.length).toBe(PROPS.length);
    for (const c of m) {
      expect(c.below, `canopy stair well below its origin (${JSON.stringify(c)})`).toBeCloseTo(1.02, 1);
      expect(c.above, `canopy height above its origin (${JSON.stringify(c)})`).toBeCloseTo(6.42, 1);
    }
  }, TIMEOUT);

  it('leaves no massing or façade geometry for the hero buildings', async () => {
    const r = await page.evaluate(() => {
      const w = window.__twin.world;
      return { heroIds: [...w.heroIds], alsoDetailed: [...w.heroIds].filter((id) => w.detailedIds.has(id)) };
    });
    expect(r.heroIds.sort()).toEqual(HERO.map((e) => e.osmId).sort());
    expect(r.alsoDetailed).toEqual([]);
    // the geometric half of the claim: with the hero group detached, a ray down the NC centroid
    // finds terrain, not a building — so nothing else is drawing that volume
    const withHero = await page.evaluate((y) => window.__twin.probePath({ points: [[0, y, 0]] })[0], nc.topY - 10);
    const withoutHero = await page.evaluate((y) => {
      const g = window.__twin.app.scene.getObjectByName('hero');
      const parent = g.parent;
      g.removeFromParent();
      const p = window.__twin.probePath({ points: [[0, y, 0]] })[0];
      parent.add(g);
      return p;
    }, nc.topY - 10);
    expect(withHero.structure, JSON.stringify(withHero)).toBe(true);
    expect(withoutHero.structure, JSON.stringify(withoutHero)).toBe(false);
    expect(withoutHero.blocked).toBe(false);
  }, TIMEOUT);

  it('probes clear above the NC roof and blocked inside the 6th floor', async () => {
    const probes = await page.evaluate((y) => window.__twin.probePath({ points: [[0, y, 0], [0, 20, 0]], clearance: 1.0 }), nc.topY + 2);
    expect(probes[0], `roof + 2 m: ${JSON.stringify(probes[0])}`).toMatchObject({ blocked: false, structure: true });
    expect(probes[1], `floor 6 inside: ${JSON.stringify(probes[1])}`).toMatchObject({ blocked: true, structure: true });
  }, TIMEOUT);

  it('keeps the massing collision walls for every hero building', async () => {
    const walls = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
      const ws = window.__twin.world.collision.walls.filter((w) => w.tag === `bld:${id}`);
      return [id, { n: ws.length, span: ws.length ? Math.max(...ws.map((w) => w.y1 - w.y0)) : 0 }];
    })), HERO.map((e) => e.osmId));
    // a hero replaces geometry, not walls: the walk controller and probe still meet the building
    for (const e of HERO) {
      expect(walls[e.osmId].n, `${e.osmId} collision walls`).toBeGreaterThanOrEqual(3);
      expect(walls[e.osmId].span, `${e.osmId} wall height`).toBeGreaterThan(5);
    }
    expect(walls[NC_ID].span).toBeGreaterThan(55);
  }, TIMEOUT);

  it('renders the NC entrance view with the rooftop sign to docs/stage2-nc.png', async () => {
    // On tour stop 2's axis (NC 정문, south forecourt, x = 0, looking due north at the entrance)
    // but pulled back from z = 44 to z = 95: the podium's south edge is ~11 m from the stop and the
    // 58 m tower 24 m from it, so at the stop itself the frame is nothing but curtain wall.
    expect(TOUR[1].pos[0]).toBe(0);                       // still the stop's own axis
    const eye = [0, 2, 95];
    const clear = await page.evaluate((p) => window.__twin.probePath({ points: [p], clearance: 1.0 })[0], eye);
    expect(clear, `camera ${JSON.stringify(eye)} -> ${JSON.stringify(clear)}`).toMatchObject({ blocked: false });
    await page.evaluate((e) => {
      const app = window.__twin.app;
      window.__twin.setTime('day');
      app.camera.position.set(e[0], e[1], e[2]);
      app.camera.lookAt(0, 40, 0);
      app.camera.fov = 50; app.camera.updateProjectionMatrix();
      window.__twin.renderOnce();
    }, eye);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__twin.renderOnce());
    const out = path.join(pkgRoot, 'docs/stage2-nc.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    expect(fs.statSync(out).size).toBeGreaterThan(50_000);
  }, TIMEOUT);
});
