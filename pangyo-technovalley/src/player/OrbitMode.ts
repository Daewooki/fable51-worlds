import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Updatable } from '../app/App';

export class OrbitMode implements Updatable {
  controls: OrbitControls;
  enabled = false;
  constructor(public camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 5; this.controls.maxDistance = 900;
    this.controls.target.set(0, 5, 0);
    this.controls.enabled = false;
  }
  setEnabled(v: boolean) { this.enabled = v; this.controls.enabled = v; if (v) { this.controls.update(); } }
  frame(target: THREE.Vector3, distance: number, azimuthDeg: number, elevationDeg: number) {
    this.controls.target.copy(target);
    const a = THREE.MathUtils.degToRad(azimuthDeg), e = THREE.MathUtils.degToRad(elevationDeg);
    this.camera.position.set(target.x + Math.sin(a) * Math.cos(e) * distance, target.y + Math.sin(e) * distance, target.z + Math.cos(a) * Math.cos(e) * distance);
    this.controls.update();
  }
  update() { if (this.enabled) this.controls.update(); }
}
