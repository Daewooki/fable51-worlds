import * as THREE from 'three';
import type { Updatable } from '../app/App';
import type { CollisionWorld } from './Collision';

export class WalkControls implements Updatable {
  enabled = false;
  yaw = 0; pitch = 0;
  eyeHeight = 1.7;
  radius = 0.35;
  walkSpeed = 2.4; runSpeed = 7.0;
  velY = 0;
  footY = 0;
  keys = new Set<string>();
  locked = false;
  private tmp = new THREE.Vector3();
  private onMove = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch -= e.movementY * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  };
  constructor(public camera: THREE.PerspectiveCamera, public world: CollisionWorld, public dom: HTMLElement) {
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; document.dispatchEvent(new CustomEvent('twin:lock', { detail: this.locked })); });
    window.addEventListener('keydown', (e) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return; this.keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  requestLock() { if (this.enabled) this.dom.requestPointerLock?.(); }
  /** Teleport: position is the FOOT position; heading/pitch in radians (heading = yaw, 0 = looking toward -z). */
  fly = false;
  teleport(x: number, z: number, yaw?: number, pitch?: number, footY?: number) {
    const floor = this.world.floorAt(x, z, footY ?? this.world.terrain(x, z) + 0.5, 100);
    this.fly = footY !== undefined && footY - floor > 3;
    this.footY = this.fly ? footY! : floor;
    this.camera.position.set(x, this.footY + this.eyeHeight, z);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.velY = 0;
    this.applyLook();
  }
  applyLook() {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);
  }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  update(dt: number) {
    if (!this.enabled) return;
    const k = this.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = run ? this.runSpeed : this.walkSpeed;
    const move = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp')) move.add(this.forward);
    if (k.has('KeyS') || k.has('ArrowDown')) move.sub(this.forward);
    if (k.has('KeyD') || k.has('ArrowRight')) move.add(this.right);
    if (k.has('KeyA') || k.has('ArrowLeft')) move.sub(this.right);
    if (k.has('KeyQ')) this.yaw += 1.6 * dt;
    if (k.has('KeyE')) this.yaw -= 1.6 * dt;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
    const pos = this.tmp.set(this.camera.position.x, this.footY, this.camera.position.z);
    pos.x += move.x; pos.z += move.z;
    this.world.resolve(pos, this.radius, 1.7);
    if (this.fly) { this.camera.position.set(pos.x, this.footY + this.eyeHeight, pos.z); this.applyLook(); return; }
    // floor follow with gravity-ish smoothing
    const floor = this.world.floorAt(pos.x, pos.z, this.footY);
    if (floor > this.footY) { this.footY = floor; this.velY = 0; }
    else { this.velY -= 9.8 * dt; this.footY = Math.max(floor, this.footY + this.velY * dt); if (this.footY === floor) this.velY = 0; }
    this.camera.position.set(pos.x, this.footY + this.eyeHeight, pos.z);
    this.applyLook();
  }
}
