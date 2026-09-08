// Contract between the world and hero-building modules (per-landmark builders listed in data/hero.json).
import * as THREE from 'three';
import type { World, HeroEntry } from './World';
import type { BuildingInfo } from './Buildings';
import type { App } from '../app/App';

export interface Interactable {
  id: string; label: string; hint?: string;           // hint e.g. "Press E to inspect"
  position: THREE.Vector3; radius: number;            // activation radius (m)
  onActivate: () => void;                             // called when the player presses E while looking at it within radius
  object?: THREE.Object3D;                            // optional object to highlight
}
export interface StorefrontReg {
  id: string; name: string; category: string; address: string;
  position: THREE.Vector3;      // point on the sidewalk in front of the entrance
  facing: THREE.Vector3;        // outward normal of the storefront (toward the street)
  width: number;                // storefront width (m)
  enterable: boolean;           // true if the player can walk inside
  status: string;               // open | closed | vacant | unknown
  confidence: string;           // high | medium | low
  interiorTag?: string;         // collision tag used inside (for lighting/streaming)
}
export interface HeroContext {
  world: World; app: App; scene: THREE.Scene;
  group: THREE.Group;                                  // add all hero meshes here
  entry: HeroEntry;                                    // the data/hero.json record that selected this module
  building: BuildingInfo | null;                       // the OSM building it replaces (footprint, height, base y)
  registerStorefront(s: StorefrontReg): void;
  registerInteractable(i: Interactable): void;
  addUpdatable(u: { update(dt: number, t: number): void }): void;
  nightFactor(): number;                               // 0 day .. 1 night (for interior lighting)
}
/** A hero module: a named builder invoked once per matching `data/hero.json` entry (its massing is already hidden). */
export interface HeroModule { id: string; build(ctx: HeroContext): Promise<void> }
