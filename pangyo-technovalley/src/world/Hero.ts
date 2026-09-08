// Hero buildings + storefront/interactable registry.
//
// A hero module is a named builder registered in HERO_MODULES; which buildings it replaces comes from
// `data/hero.json` (`[{ osmId, module, yaw?, footprintFit? }]`), not from code. With no hero.json — or with an
// entry naming a module this world does not register — nothing is built and the massing stays.
import * as THREE from 'three';
import type { World } from './World';
import type { App } from '../app/App';
import type { HeroContext, HeroModule, Interactable, StorefrontReg } from './HeroContext';

export type Storefront = StorefrontReg & { source: 'hero' | 'facade' };

/** Registry of hero modules available to this world, keyed by the `module` field of a data/hero.json entry. */
export const HERO_MODULES: Record<string, HeroModule> = {};
/** Register a hero module (called by the module's own file at import time). */
export function registerHeroModule(m: HeroModule) { HERO_MODULES[m.id] = m; }

export class Hero {
  group = new THREE.Group();
  storefronts: Storefront[] = [];
  interactables: Interactable[] = [];
  constructor(public world: World, public app: App) { this.group.name = 'hero'; }
  async build() {
    this.app.scene.add(this.group);
    for (const s of this.world.storefronts) this.storefronts.push({ ...s, source: 'facade' });
    const entries = this.world.heroEntries;
    if (!entries.length) return;
    for (const e of entries) {
      const m = HERO_MODULES[e.module];
      if (!m) { console.warn('[hero] no module registered for', e.module, '(', e.osmId, ')'); continue; }
      const g = new THREE.Group(); g.name = `hero:${e.module}:${e.osmId}`; this.group.add(g);
      const info = this.world.buildings.infos.get(e.osmId) ?? null;
      const ctx: HeroContext = {
        world: this.world, app: this.app, scene: this.app.scene, group: g,
        entry: e, building: info,
        registerStorefront: (s) => { this.storefronts = this.storefronts.filter((x) => x.id !== s.id); this.storefronts.push({ ...s, source: 'hero' }); },
        registerInteractable: (i) => { this.interactables.push(i); },
        addUpdatable: (u) => this.app.add(u),
        nightFactor: () => this.app.time.nightFactor,
      };
      try { await m.build(ctx); } catch (err) { console.error('hero module failed', e.module, e.osmId, err); }
    }
  }
  storefrontList() { return this.storefronts.map((s) => ({ id: s.id, name: s.name, category: s.category, address: s.address, x: +s.position.x.toFixed(1), z: +s.position.z.toFixed(1), enterable: s.enterable, status: s.status, confidence: s.confidence, source: s.source })); }
}
