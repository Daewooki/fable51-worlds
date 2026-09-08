// postMessage bridge so MV Studio can drive this world inside an iframe (?studio=1).
import * as THREE from 'three';
import type { TwinApi } from './Qa';
import type { App } from '../app/App';

export function installStudioBridge(app: App, twin: TwinApi) {
  const send = (msg: any) => window.parent !== window && window.parent.postMessage(msg, '*');
  // Path collision probe for the Director's timeline: for each camera point, cast a ray straight
  // down from above the world and compare the camera height with the first surface hit. A hit
  // more than 1.5 m above the terrain is a structure (building massing, hero module, prop,
  // canopy); a camera below that surface is inside or under it. Below the terrain is blocked too.
  const ray = new THREE.Raycaster(); const rayOrigin = new THREE.Vector3(); const DOWN = new THREE.Vector3(0, -1, 0);
  const probePath = (m: { points: [number, number, number][]; clearance?: number }) => {
    const groups = ['world', 'props', 'vegetation'].map((n) => app.scene.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
    const clearance = m.clearance ?? 1.0;
    return (m.points || []).map(([x, y, z]) => {
      const ground = (twin as any).world.terrain.heightAt(x, z) as number; // `world` is on the runtime __twin, not the typed QA surface
      rayOrigin.set(x, 2000, z); ray.set(rayOrigin, DOWN); ray.far = 4000;
      const hit = ray.intersectObjects(groups, true)[0];
      const top = hit ? hit.point.y : ground;
      const structure = top - ground > 1.5;
      const blocked = y < ground + 0.3 || (structure && y < top + clearance);
      return { blocked, top: +top.toFixed(2), ground: +ground.toFixed(2), structure };
    });
  };
  (twin as any).probePath = probePath; // headless callers (previz) use it without the message hop
  const handlers: Record<string, (m: any) => any> = {
    ping: () => 'pong',
    probePath,
    setCameraRaw: (m) => { app.camera.position.set(m.eye[0], m.eye[1], m.eye[2]); app.camera.lookAt(m.look[0], m.look[1], m.look[2]); if (m.fov) { app.camera.fov = m.fov; app.camera.updateProjectionMatrix(); } return true; },
    setTime: (m) => { twin.setTime(m.p); return true; },
    freeze: (m) => { twin.freeze(!!m.v); return true; },
    setMode: (m) => { twin.setMode(m.m); return true; },
    pos: () => { const c = app.camera; const d = c.getWorldDirection(new THREE.Vector3()); return { eye: [c.position.x, c.position.y, c.position.z], look: [c.position.x + d.x * 10, c.position.y + d.y * 10, c.position.z + d.z * 10], fov: c.fov }; },
  };
  window.addEventListener('message', (ev) => {
    if (ev.source !== window.parent) return;
    const m = ev.data; if (!m || m.type !== 'studio:cmd') return;
    try { const h = handlers[m.cmd]; if (!h) throw new Error(`unknown cmd ${m.cmd}`); send({ type: 'studio:res', id: m.id, ok: true, data: h(m) }); }
    catch (e: any) { send({ type: 'studio:res', id: m.id, ok: false, error: String(e?.message || e) }); }
  });
  setInterval(() => { const c = app.camera.position; send({ type: 'studio:pos', pos: { x: c.x, y: c.y, z: c.z } }); }, 250);
  send({ type: 'studio:ready' });
}
