// Unit tests for the ground-cover geometry in src/world/BlockFill.ts. Pure functions only — no
// browser, no dev server: everything here is the maths that decides WHERE ground cover is painted.
// The rendering side of BlockFill is covered by test/life.test.mjs (draw calls, patch counts).
import { describe, it, expect } from 'vitest';
import {
  blockCells, Coverage, areaCovers, veilsOver, underVeil, bboxOf, clipToRect, triangulate, FILL_BBOX,
} from '../src/world/BlockFill.ts';

/** A StreetSpec as `streets_spec.json` writes them. */
const street = (o) => ({
  name: 'x', axis: 'ns', c: 0, from: -500, to: 500, width: 20, sidewalk: 3,
  lanes: 4, oneway: null, parking: { left: false, right: false }, ...o,
});
const BBOX = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const area = (footprint, holes) => ({ osmId: 'way/t', name: null, kind: 'k', surface: 'water', priority: 5, footprint, holes, areaM2: 1, centroid: [0, 0] });
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

describe('blockCells', () => {
  // one ns street at x = 0 (half-width 10 + 3 m sidewalk = 13) that only exists for z in [-50, 50]
  const partial = street({ name: 'short', c: 0, from: -50, to: 50 });
  // two ew streets cut the box into three z bands; the short street's span only reaches the middle one
  const ew = (c) => street({ name: `ew${c}`, axis: 'ew', c, from: -500, to: 500, width: 20, sidewalk: 3 });

  it('insets a boundary only in the bands its own from/to span reaches', () => {
    const cells = blockCells([partial, ew(-100), ew(100)], BBOX);
    const westOf0 = (z) => cells.find((c) => c.x1 <= 0 + 1e-9 && c.z0 <= z && c.z1 >= z);
    const middle = westOf0(0), north = westOf0(-160), south = westOf0(160);
    expect([middle, north, south].every(Boolean), 'a cell west of x = 0 in each band').toBe(true);
    expect(middle.x1, 'the band the street runs through is inset by half width + sidewalk').toBeCloseTo(-13, 6);
    expect(north.x1, 'the street does not reach this band, so it is not a boundary here').toBeCloseTo(0, 6);
    expect(south.x1).toBeCloseTo(0, 6);
    // the same street run to the world edge insets every band
    const all = blockCells([street({ name: 'short', c: 0, from: -500, to: 500 }), ew(-100), ew(100)], BBOX);
    for (const z of [0, -160, 160]) expect(all.find((c) => c.x1 <= 0 + 1e-9 && c.z0 <= z && c.z1 >= z).x1).toBeCloseTo(-13, 6);
  });

  it('never emits ground outside the bbox it is given', () => {
    for (const c of blockCells([partial, ew(0)], BBOX)) {
      expect(c.x0).toBeGreaterThanOrEqual(BBOX.minX);
      expect(c.x1).toBeLessThanOrEqual(BBOX.maxX);
      expect(c.z0).toBeGreaterThanOrEqual(BBOX.minZ);
      expect(c.z1).toBeLessThanOrEqual(BBOX.maxZ);
    }
  });

  it('defaults to the world bbox, which is the whole extract and not a symmetric box', () => {
    expect(FILL_BBOX.minX).toBeLessThan(-800);
    expect(FILL_BBOX.maxX).toBeGreaterThan(700);
    // the extract is not centred on the origin: that asymmetry is why a ±620 m box left bare ground
    expect(Math.abs(FILL_BBOX.minX)).not.toBeCloseTo(Math.abs(FILL_BBOX.maxX), 0);
    const cells = blockCells([street({ c: 0 })]);
    expect(cells.length).toBeGreaterThan(0);
    expect(Math.min(...cells.map((c) => c.x0))).toBeCloseTo(FILL_BBOX.minX, 6);
    expect(Math.max(...cells.map((c) => c.x1))).toBeCloseTo(FILL_BBOX.maxX, 6);
  });
});

describe('Coverage and holes', () => {
  // a 100 m ring-shaped park with a 20 m courtyard cut out of the middle
  const ring = area(rect(-50, 50, -50, 50), [rect(-10, 10, -10, 10)]);

  it('areaCovers is true inside the ring and false inside the hole', () => {
    expect(areaCovers(ring, 30, 30)).toBe(true);
    expect(areaCovers(ring, 0, 0), 'the courtyard is bare ground, not park').toBe(false);
    expect(areaCovers(ring, 80, 0)).toBe(false);
  });

  it('Coverage.covers agrees, so a fallback block cell is still emitted in the courtyard', () => {
    const cover = new Coverage([ring]);
    expect(cover.covers(30, 30)).toBe(true);
    expect(cover.covers(0, 0)).toBe(false);
    expect(cover.covers(400, 400)).toBe(false);
  });
});

describe('the translucent veil cut', () => {
  const water = area(rect(-40, 40, -40, 40));
  const pond = area(rect(-20, 20, -20, 20));                 // a second water polygon inside the first
  const boxes = [water, pond].map((a) => bboxOf(a.footprint));

  it('selects the veils whose bounds reach a patch, and nothing else', () => {
    expect(veilsOver(rect(-5, 5, -5, 5), [water, pond], boxes)).toHaveLength(2);
    expect(veilsOver(rect(300, 310, 300, 310), [water, pond], boxes)).toBeUndefined();
    expect(veilsOver([], [], [])).toBeUndefined();
  });

  it('does not let a veil veil itself, or any veil after it', () => {
    // water is index 0: nothing is above it
    expect(veilsOver(water.footprint, [water, pond], boxes, 0)).toBeUndefined();
    // pond is index 1: only water (drawn first) may cut it, which is what stops the double blend
    expect(veilsOver(pond.footprint, [water, pond], boxes, 1)).toEqual([water]);
  });

  it('cuts a ground-cover fragment that lies under the water and keeps the one outside it', () => {
    const under = veilsOver(rect(-30, -20, -30, -20), [water], [boxes[0]]);
    const beside = veilsOver(rect(100, 110, 100, 110), [water], [boxes[0]]);
    expect(underVeil(rect(-30, -20, -30, -20), under), 'a cell under the river must not be painted').toBe(true);
    expect(underVeil(rect(100, 110, 100, 110), beside), 'a cell outside it must be').toBe(false);
    expect(underVeil(rect(-30, -20, -30, -20), undefined), 'no veils at all').toBe(false);
  });

  it('a hole in the veil is not veiled — the ground under a hole is still painted', () => {
    const holed = area(rect(-40, 40, -40, 40), [rect(-10, 10, -10, 10)]);
    const b = [bboxOf(holed.footprint)];
    expect(underVeil(rect(-5, 5, -5, 5), veilsOver(rect(-5, 5, -5, 5), [holed], b))).toBe(false);
    expect(underVeil(rect(-30, -20, -30, -20), veilsOver(rect(-30, -20, -30, -20), [holed], b))).toBe(true);
  });
});

describe('rasterisation primitives', () => {
  it('clipToRect keeps the inside of a cell and drops a polygon fully outside it', () => {
    const clipped = clipToRect(rect(-10, 10, -10, 10), 0, 8, 0, 8);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    for (const [x, z] of clipped) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(8 + 1e-9); expect(z).toBeGreaterThanOrEqual(-1e-9); expect(z).toBeLessThanOrEqual(8 + 1e-9); }
    expect(clipToRect(rect(100, 110, 100, 110), 0, 8, 0, 8)).toEqual([]);
  });

  it('triangulate earcuts a holed ring and leaves the hole empty', () => {
    const tris = triangulate(rect(-50, 50, -50, 50), [rect(-10, 10, -10, 10)]);
    expect(tris.length).toBeGreaterThan(3);
    const areaOf = (t) => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;
    const total = tris.reduce((a, t) => a + areaOf(t), 0);
    expect(total, 'ring area = 100^2 - 20^2').toBeCloseTo(100 * 100 - 20 * 20, 3);
    expect(triangulate([[0, 0], [1, 1]])).toEqual([]);
  });
});
