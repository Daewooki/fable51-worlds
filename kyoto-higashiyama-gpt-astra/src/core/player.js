import * as THREE from 'three';
import { clamp } from './util.js';

// Planar Kyoto movement: all feet positions resolve against world.heightAt.
// The acceleration/collision conventions follow the Sakura Crossing study;
// the implementation deliberately has no spherical wrapping or physics engine.
const EYE = 1.68;
const RADIUS = 0.28;
const MAX_STEP = 0.42;
const boundsOf = (c) => c.minX !== undefined && c.minY !== undefined && c.maxY !== undefined ? c : ({
  minX: c.minX ?? c.x0, maxX: c.maxX ?? c.x1,
  minZ: c.minZ ?? c.z0, maxZ: c.maxZ ?? c.z1,
  minY: c.minY ?? c.bottom ?? -Infinity,
  maxY: c.maxY ?? c.top ?? Infinity,
});

export class Player {
  constructor(camera, domElement, world, opts = {}) {
    this.camera = camera;
    this.dom = domElement;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.yaw = opts.yaw ?? -Math.PI / 2;
    this.pitch = opts.pitch ?? 0;
    this.spawn = { pos: opts.pos || [0, 0, 0], yaw: this.yaw, pitch: this.pitch };
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.enabled = true;
    this.locked = false;
    this.dragging = false;
    this.walkSpeed = 3.2;
    this.runSpeed = 6.4;
    this.sensitivity = 0.0022;
    this.bob = 0;
    this.hovered = null;
    this.onInteract = null;
    this.onLockChange = null;
    this._wish = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._ray = new THREE.Ray();
    this._box = new THREE.Box3();
    this._hit = new THREE.Vector3();
    this._listeners = [];
    this.setPose(this.spawn);
    this._bind();
  }

  _listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this._listeners.push(() => target.removeEventListener(type, callback, options));
  }

  _bind() {
    this._listen(document, 'pointerlockchange', () => {
      if (document.pointerLockElement === this.dom) {
        this.locked = true;
        this.onLockChange?.(true);
      } else if (!this.dragging) {
        this.locked = false;
        this.keys.clear();
        this.onLockChange?.(false);
      }
    });
    this._listen(this.dom, 'pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.dragging = true;
      this._dragX = e.clientX;
      this._dragY = e.clientY;
    });
    this._listen(window, 'pointerup', () => { this.dragging = false; });
    this._listen(window, 'mousemove', (e) => {
      if (!this.enabled) return;
      const pointerLocked = document.pointerLockElement === this.dom;
      if (!pointerLocked && !this.dragging) return;
      const dx = pointerLocked ? e.movementX : e.clientX - this._dragX;
      const dy = pointerLocked ? e.movementY : e.clientY - this._dragY;
      this._dragX = e.clientX;
      this._dragY = e.clientY;
      this.yaw -= dx * this.sensitivity;
      this.pitch = clamp(this.pitch - dy * this.sensitivity, -1.25, 1.18);
      this.applyCamera(0);
    });
    this._listen(window, 'keydown', (e) => {
      if (e.target?.matches?.('input, textarea, select')) return;
      if (e.code === 'Escape') {
        this.locked = false;
        this.dragging = false;
        this.keys.clear();
        this.onLockChange?.(false);
        return;
      }
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyE') {
        const target = this.pick();
        if (target) {
          if (this.onInteract) this.onInteract(target);
          else target.action?.();
        }
      }
    });
    this._listen(window, 'keyup', (e) => this.keys.delete(e.code));
    this._listen(window, 'blur', () => { this.keys.clear(); this.dragging = false; });
  }

  async lock() {
    this.locked = true;
    this.onLockChange?.(true);
    try {
      await this.dom.requestPointerLock?.();
    } catch {
      // Pointer lock can be unavailable in an embedded browser. Keyboard
      // movement and mouse drag remain usable without hiding an error dialog.
      this.locked = true;
    }
  }

  setPose({ pos, yaw, pitch } = {}) {
    if (pos?.isVector3) this.pos.copy(pos);
    else if (Array.isArray(pos)) this.pos.fromArray(pos);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.bob = 0;
    this.applyCamera(0);
  }

  reset() { this.setPose(this.spawn); }

  _resolve() {
    const feetY = this.world.heightAt(this.pos.x, this.pos.z);
    const colliders = this.world.collidersNear?.(this.pos.x, this.pos.z) ?? this.world.colliders ?? [];
    for (const raw of colliders) {
      if (raw.disabled) continue;
      const c = boundsOf(raw);
      if (c.maxY <= feetY + MAX_STEP || c.minY >= feetY + EYE + .12) continue;
      const x0 = c.minX - RADIUS, x1 = c.maxX + RADIUS;
      const z0 = c.minZ - RADIUS, z1 = c.maxZ + RADIUS;
      if (this.pos.x <= x0 || this.pos.x >= x1 || this.pos.z <= z0 || this.pos.z >= z1) continue;
      const values = [this.pos.x - x0, x1 - this.pos.x, this.pos.z - z0, z1 - this.pos.z];
      const index = values.indexOf(Math.min(...values));
      if (index === 0) this.pos.x = x0;
      else if (index === 1) this.pos.x = x1;
      else if (index === 2) this.pos.z = z0;
      else this.pos.z = z1;
    }
  }

  _moveAxis(axis, delta) {
    const previous = this.pos[axis];
    const oldHeight = this.world.heightAt(this.pos.x, this.pos.z);
    this.pos[axis] += delta;
    const nextHeight = this.world.heightAt(this.pos.x, this.pos.z);
    if (!Number.isFinite(nextHeight) || nextHeight - oldHeight > MAX_STEP) {
      this.pos[axis] = previous;
      this.vel[axis] = 0;
      return;
    }
    this._resolve();
  }

  update(dt) {
    if (!this.enabled) { this.vel.set(0, 0, 0); return; }
    dt = Math.min(dt, .05);
    const key = this.keys;
    const speed = key.has('ShiftLeft') || key.has('ShiftRight') ? this.runSpeed : this.walkSpeed;
    const fwd = Number(key.has('KeyW') || key.has('ArrowUp')) - Number(key.has('KeyS') || key.has('ArrowDown'));
    const side = Number(key.has('KeyD')) - Number(key.has('KeyA'));
    this.yaw += (Number(key.has('ArrowLeft')) - Number(key.has('ArrowRight'))) * dt * 1.5;
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this._wish.copy(this._forward).multiplyScalar(fwd).addScaledVector(this._right, side);
    if (this._wish.lengthSq()) this._wish.normalize().multiplyScalar(speed);
    const approach = 1 - Math.exp(-(this._wish.lengthSq() ? 13 : 16) * dt);
    this.vel.lerp(this._wish, approach);
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .12));
    for (let i = 0; i < steps; i++) {
      this._moveAxis('x', dx / steps);
      this._moveAxis('z', dz / steps);
    }
    const b = this.world.bounds;
    if (b) {
      this.pos.x = clamp(this.pos.x, b.minX ?? b.x0 ?? -Infinity, b.maxX ?? b.x1 ?? Infinity);
      this.pos.z = clamp(this.pos.z, b.minZ ?? b.z0 ?? -Infinity, b.maxZ ?? b.z1 ?? Infinity);
    }
    const targetY = this.world.heightAt(this.pos.x, this.pos.z);
    this.pos.y = targetY;
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * moving * 6;
    this.applyCamera(moving);
    this.pick();
  }

  applyCamera(moving = 0) {
    const amp = Math.min(moving / this.walkSpeed, 1) * .009;
    this.camera.position.set(this.pos.x, this.pos.y + EYE + Math.sin(this.bob) * amp, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  pick(interactables = this.world.interactables ?? []) {
    this.camera.getWorldDirection(this._forward);
    let best = null, bestScore = Infinity;
    for (const target of interactables) {
      if (target.disabled) continue;
      const p = target.position ?? target.hitbox?.position;
      if (!p) continue;
      if (Array.isArray(p)) this._target.fromArray(p);
      else this._target.copy(p);
      const distance = this._target.distanceTo(this.camera.position);
      if (distance > (target.radius ?? 3.5)) continue;
      this._target.sub(this.camera.position).normalize();
      const alignment = this._target.dot(this._forward);
      if (alignment < .4) continue;
      const score = distance * (1.25 - alignment);
      if (score >= bestScore) continue;
      this._ray.set(this.camera.position, this._target);
      let occluded = false;
      const colliders = this.world.collidersNear?.(this.pos.x, this.pos.z) ?? this.world.colliders ?? [];
      for (const raw of colliders) {
        if (raw.disabled || raw === target.collider) continue;
        const c = boundsOf(raw);
        this._box.min.set(c.minX, c.minY, c.minZ);
        this._box.max.set(c.maxX, c.maxY, c.maxZ);
        const hit = this._ray.intersectBox(this._box, this._hit);
        if (hit && hit.distanceTo(this.camera.position) < distance - .7) { occluded = true; break; }
      }
      if (!occluded) { best = target; bestScore = score; }
    }
    this.hovered = best;
    return best;
  }

  dispose() {
    this._listeners.forEach((remove) => remove());
    this._listeners.length = 0;
    this.keys.clear();
  }
}
