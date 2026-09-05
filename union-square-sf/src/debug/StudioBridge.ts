// postMessage bridge so MV Studio can drive this world inside an iframe (?studio=1).
import * as THREE from 'three';
import type { TwinApi } from './Qa';
import type { App } from '../app/App';

export function installStudioBridge(app: App, twin: TwinApi) {
  const send = (msg: any) => window.parent !== window && window.parent.postMessage(msg, '*');
  const handlers: Record<string, (m: any) => any> = {
    ping: () => 'pong',
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
