// Optional public-square module, built entirely from `data/plaza.json`. When the file is absent the world has no
// plaza and every consumer (Props, Vegetation, NavGraph, Pedestrians) simply skips its plaza branch.
//
// data/plaza.json shape (all lengths in local metres, y up; every field but `bounds` optional):
// {
//   "name": "…",
//   "bounds":   { "xMin": -60, "xMax": 60, "zMin": -39, "zMax": 39 },   // outer extent, used for "am I on the plaza"
//   "terraces": [ { "id": "deck", "rect": [xMin, xMax, zMin, zMax], "y": 0, "material": "pavers" }, … ],
//   "stairs":   [ { "rect": [xMin, xMax, zMin, zMax], "from": 0, "to": 0.9, "risers": 6, "axis": "ns" }, … ],
//   "walls":    [ [ax, az, bx, bz, y0, y1], … ],                        // retaining walls (collision + geometry)
//   "lamps":    [ [x, y, z], … ],                                       // globe lamp posts (Props places them)
//   "benches":  [ [x, y, z, yawRad], … ],                               // Props places them
//   "trees":    [ [x, y, z, "veg/tree_plane"], … ],                     // Vegetation places them
//   "uplights": [ [x, y, z], … ]                                        // night spot lights
// }
import * as THREE from 'three';
import { Materials } from '../materials/Library';
import { Assets } from '../assets/Assets';
import { slab, rect } from '../util/MeshUtil';
import { P2 } from '../util/Geometry2D';
import type { CollisionWorld } from '../player/Collision';
import type { Terrain } from './Terrain';

export interface PlazaBounds { xMin: number; xMax: number; zMin: number; zMax: number }
export interface PlazaTerrace { id?: string; rect: [number, number, number, number]; y: number; material?: string }
export interface PlazaStair { rect: [number, number, number, number]; from: number; to: number; risers?: number; axis?: 'ns' | 'ew'; material?: string }
export interface PlazaSpec {
  name?: string;
  bounds: PlazaBounds;
  terraces?: PlazaTerrace[];
  stairs?: PlazaStair[];
  walls?: [number, number, number, number, number, number][];
  lamps?: [number, number, number][];
  benches?: [number, number, number, number][];
  trees?: [number, number, number, string?][];
  uplights?: [number, number, number][];
  cafeTables?: { rect: [number, number, number, number]; y: number; spacing?: number }[];
}

export class Plaza {
  group = new THREE.Group();
  uplights: THREE.SpotLight[] = [];
  /** Level of each named terrace (id -> y); `default` is the first terrace. */
  levels: Record<string, number> = {};
  constructor(public spec: PlazaSpec, public terrain: Terrain, public collision: CollisionWorld) {
    this.group.name = 'plaza';
    const mat = (n?: string) => Materials.get(n || 'pavers');
    for (const t of spec.terraces || []) {
      const [x0, x1, z0, z1] = t.rect;
      const poly = rect(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1));
      this.group.add(slab(poly, t.y, 0.4, mat(t.material)));
      this.collision.addFlatPatch(poly, t.y, 'plaza', 2);
      if (t.id) this.levels[t.id] = t.y;
    }
    if (spec.terraces?.length) this.levels.default = spec.terraces[0].y;
    for (const s of spec.stairs || []) this.buildStairs(s);
    for (const [ax, az, bx, bz, y0, y1] of spec.walls || []) {
      this.collision.addWall({ ax, az, bx, bz, y0, y1, tag: 'plaza' });
      const len = Math.hypot(bx - ax, bz - az);
      const g = new THREE.BoxGeometry(len, y1 - y0, 0.4);
      const m = new THREE.Mesh(g, Materials.get('granite_grey'));
      m.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
      m.rotation.y = -Math.atan2(bz - az, bx - ax);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    for (const [x, y, z] of spec.uplights || []) {
      const l = new THREE.SpotLight(0xffd9a0, 0, 26, 0.9, 0.6, 1.4);
      l.position.set(x, y, z); l.target.position.set(x, y + 8, z);
      this.group.add(l, l.target); this.uplights.push(l);
    }
  }

  /** 0 day .. 1 night — drives the plaza uplights. */
  setNight(t: number) { for (const l of this.uplights) l.intensity = 1400 * t; }

  bounds(): PlazaBounds { return this.spec.bounds; }
  contains(x: number, z: number): boolean {
    const b = this.spec.bounds;
    return x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax;
  }

  private buildStairs(s: PlazaStair) {
    const [rx0, rx1, rz0, rz1] = s.rect;
    const x0 = Math.min(rx0, rx1), x1 = Math.max(rx0, rx1), z0 = Math.min(rz0, rz1), z1 = Math.max(rz0, rz1);
    const axis = s.axis || (z1 - z0 > x1 - x0 ? 'ns' : 'ew');
    const risers = Math.max(1, s.risers ?? Math.max(1, Math.round(Math.abs(s.to - s.from) / 0.16)));
    const len = axis === 'ns' ? z1 - z0 : x1 - x0;
    const run = len / risers, rise = (s.to - s.from) / risers;
    const m = Materials.get(s.material || 'granite_grey');
    for (let i = 0; i < risers; i++) {
      const yTop = s.from + rise * (i + 1), yBot = Math.min(s.from, s.to) - 0.3;
      const g = new THREE.BoxGeometry(axis === 'ns' ? x1 - x0 : run, yTop - yBot, axis === 'ns' ? run : z1 - z0);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(axis === 'ns' ? (x0 + x1) / 2 : x0 + run * (i + 0.5), (yTop + yBot) / 2, axis === 'ns' ? z0 + run * (i + 0.5) : (z0 + z1) / 2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    const poly = rect(x0, x1, z0, z1);
    const a: P2 = axis === 'ns' ? [x0, z0] : [x0, z0];
    const b: P2 = axis === 'ns' ? [x0, z1] : [x1, z0];
    this.collision.addRampPatch(poly, a, s.from, b, s.to, 'plaza');
  }

  /** Café tables/chairs on the plaza decks (optional, from `cafeTables`). */
  async furniture() {
    const specs = this.spec.cafeTables || [];
    if (!specs.length) return;
    const table = Assets.has('retail/gen_cafe_table') ? await Assets.instanced('retail/gen_cafe_table', 120) : null;
    const chair = Assets.has('retail/gen_cafe_chair') ? await Assets.instanced('retail/gen_cafe_chair', 400) : null;
    for (const s of specs) {
      const [x0, x1, z0, z1] = s.rect, step = s.spacing || 8.5;
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += step) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z += step) {
        table?.add([x, s.y, z], 0);
        for (let k = 0; k < 3; k++) { const a = k * 2.1 + x * 0.1; chair?.add([x + Math.cos(a) * 0.75, s.y, z + Math.sin(a) * 0.75], -a + Math.PI / 2); }
        this.collision.addBox(x, z, 0.8, 0.8, s.y, s.y + 1);
      }
    }
    for (const im of [table, chair]) if (im) { im.finalize(); this.group.add(im.group); }
  }
}
