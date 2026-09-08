// Unit tests for the footprint veto used by Props.ts to keep procedural street furniture out of buildings.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFootprintIndex, isInsideFootprint, footprintAt } from '../src/world/FootprintIndex.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// two synthetic footprints: a 20x10 box at the origin and an L-shape 100 m east
const BOX = { osmId: 'way/box', footprint: [[-10, -5], [10, -5], [10, 5], [-10, 5]] };
const L = {
  osmId: 'way/ell',
  footprint: [[100, 0], [140, 0], [140, 10], [120, 10], [120, 30], [100, 30]],
};

describe('FootprintIndex', () => {
  const idx = buildFootprintIndex([BOX, L]);

  it('indexes both footprints', () => {
    expect(idx.entries.length).toBe(2);
    expect(idx.entries[0]).toMatchObject({ id: 'way/box', minX: -10, maxX: 10, minZ: -5, maxZ: 5 });
  });

  it('detects points inside a convex footprint', () => {
    expect(isInsideFootprint(0, 0, idx, 0)).toBe(true);
    expect(isInsideFootprint(9.5, 4.5, idx, 0)).toBe(true);
    expect(isInsideFootprint(20, 0, idx, 0)).toBe(false);
    expect(isInsideFootprint(0, 20, idx, 0)).toBe(false);
  });

  it('respects the concave part of an L-shaped footprint', () => {
    expect(isInsideFootprint(110, 20, idx, 0)).toBe(true);    // inside the tall leg
    expect(isInsideFootprint(130, 5, idx, 0)).toBe(true);     // inside the wide leg
    expect(isInsideFootprint(130, 20, idx, 0)).toBe(false);   // in the notch — outside the building
  });

  it('rejects points within the clearance band outside an edge', () => {
    expect(isInsideFootprint(10.4, 0, idx, 0)).toBe(false);   // 0.4 m outside, no clearance
    expect(isInsideFootprint(10.4, 0, idx, 0.5)).toBe(true);  // 0.4 m outside, 0.5 m clearance
    expect(isInsideFootprint(10.9, 0, idx, 0.5)).toBe(false); // 0.9 m outside, 0.5 m clearance
    expect(isInsideFootprint(10.9, 0, idx, 1.0)).toBe(true);  // 0.9 m outside, lamp clearance
    expect(isInsideFootprint(130, 10.4, idx, 0.5)).toBe(true); // clearance also applies to the concave edge
  });

  it('reports which footprint contains a point', () => {
    expect(footprintAt(0, 0, idx)).toBe('way/box');
    expect(footprintAt(110, 20, idx)).toBe('way/ell');
    expect(footprintAt(60, 60, idx)).toBe(null);
  });

  it('handles points far outside every cell without throwing', () => {
    expect(isInsideFootprint(50_000, -50_000, idx, 1)).toBe(false);
  });

  it('finds the NC R&D Center footprint in the real gis.json', () => {
    const gis = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/recon/gis.json'), 'utf8'));
    const idxReal = buildFootprintIndex([...gis.buildings, ...gis.buildingParts]);
    expect(idxReal.entries.length).toBeGreaterThan(500);
    // the origin is the NC building's area centroid, so it must be inside a building — the tower way/694434545
    // or its overlapping podium way/694434544, whichever the index hits first
    expect(isInsideFootprint(0, 0, idxReal, 0)).toBe(true);
    expect(['way/694434545', 'way/694434544']).toContain(footprintAt(0, 0, idxReal));
    // a point far out in the fields to the south-west is in no building
    expect(isInsideFootprint(-880, 540, idxReal, 1)).toBe(false);
  });
});
