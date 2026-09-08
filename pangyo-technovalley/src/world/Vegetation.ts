// Trees and hedges: instanced GLBs from the vegetation kit, placed on the street-tree spots collected by Props,
// plus anything the optional `data/plaza.json` lists. No hard-coded positions — a world without plaza data just
// gets its street trees.
import * as THREE from 'three';
import { Assets } from '../assets/Assets';
import type { World } from './World';
import type { App } from '../app/App';
import { Rng } from '../util/Rng';
import type { Updatable } from '../app/App';

export class Vegetation implements Updatable {
  group = new THREE.Group();
  rng = new Rng(31);
  constructor(public world: World, public app: App) { this.group.name = 'vegetation'; }
  async build() {
    const inst = async (n: string, cap: number) => (Assets.has(n) ? Assets.instanced(n, cap, { castShadow: true, receiveShadow: false }) : null);
    const spots = this.world.treeSpots;
    const cap = Math.max(64, spots.length + 64);
    const plane = await inst('veg/tree_plane', cap), small = await inst('veg/tree_street_small', cap), olive = await inst('veg/tree_olive', 200);
    const hedge = await inst('veg/hedge_1m', 600), hedgeLow = await inst('veg/hedge_1m_low', 400), shrub = await inst('veg/shrub_box', 200), flowers = await inst('veg/flowerbed_1m', 200);
    const t = this.world.terrain;
    const byKey: Record<string, typeof plane> = { 'veg/tree_plane': plane, 'veg/tree_street_small': small, 'veg/tree_olive': olive, 'veg/shrub_box': shrub, 'veg/hedge_1m': hedge, 'veg/hedge_1m_low': hedgeLow, 'veg/flowerbed_1m': flowers };

    // --- street trees (grate positions collected by Props) ---
    for (const [x, y, z] of spots) { const big = this.rng.chance(0.4); (big ? plane : small)?.add([x, y, z], this.rng.range(0, 6.28), this.rng.range(0.8, 1.15)); }

    // --- optional plaza planting ---
    const plaza = this.world.plaza;
    if (plaza) {
      for (const [x, y, z, kind] of plaza.spec.trees || []) {
        const im = byKey[kind || 'veg/tree_olive'] ?? olive;
        const yy = Number.isFinite(y) ? y : this.world.collision.floorAt(x, z, t.heightAt(x, z) + 0.5, 100);
        im?.add([x, yy, z], this.rng.range(0, 6.28), this.rng.range(0.9, 1.2));
        this.world.collision.addBox(x, z, 0.6, 0.6, yy - 6, yy + 3);
      }
    }

    for (const im of [plane, small, olive, hedge, hedgeLow, shrub, flowers]) if (im) { im.finalize(); this.group.add(im.group); }
    this.app.scene.add(this.group);
  }
  update() {}
}
