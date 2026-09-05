// Director-side handling for the phone-as-virtual-camera: joins the `director` room on the
// `/ws` relay, turns each phone `cam` sample (device quaternion + dolly/zoom) into a camera
// pose applied to the world bridge, and — while a recording is in progress — appends one air
// key per sample, handing the finished list back to the caller on `rec: false`.
import { esc } from './dom';

// Rotate the camera's forward vector (0,0,-1) by quaternion q = [x,y,z,w]. Standard
// quaternion-vector rotation formula specialized for v=(0,0,-1); returns a plain [x,y,z].
export function quatToLook(q: number[]): [number, number, number] {
  const [x, y, z, w] = q;
  return [-(2 * (x * z + w * y)), -(2 * (y * z - w * x)), -(1 - 2 * (x * x + y * y))];
}

// Moves `state.eye` along `dir` by dolly*speed*dt metres. Pure — no mutation of the input.
export function integrate(state: { eye: number[] }, dir: number[], dolly: number, dt: number, speed = 3): { eye: number[] } {
  const d = dolly * speed * dt;
  return { eye: [state.eye[0] + dir[0] * d, state.eye[1] + dir[1] * d, state.eye[2] + dir[2] * d] };
}

const REC_MAX_SEC = 60;

export function mountPhonePanel(
  el: HTMLElement,
  opts: { projectId: string; bridge: { call(cmd: string, p?: any): Promise<any> }; onRecorded(keys: any[]): void },
): { dispose(): void } {
  const url = `${location.protocol}//${location.hostname}:5180/phone/?projectId=${opts.projectId}`;
  el.innerHTML = `
    <h3>Phone camera</h3>
    <img src="/api/qr?url=${encodeURIComponent(url)}" width="160" alt="phone camera QR" />
    <div><code>${esc(url)}</code></div>
    <div id="ph-status">waiting…</div>
  `;
  const statusEl = el.querySelector<HTMLElement>('#ph-status')!;

  let eye = [0, 1.7, 0];
  let last = 0;
  let rec: any[] | null = null;
  let t0 = 0;
  let disposed = false;
  let ws: WebSocket;

  function connect() {
    if (disposed) return;
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      statusEl.textContent = 'connected, waiting for phone…';
      ws.send(JSON.stringify({ type: 'join', room: 'director', projectId: opts.projectId }));
    };
    ws.onclose = () => {
      if (disposed) return;
      statusEl.textContent = 'reconnecting…';
      setTimeout(connect, 1000);
    };
    ws.onerror = () => { try { ws.close(); } catch { /* already closing */ } };
    ws.onmessage = (e) => {
      let m: any;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'rec') {
        if (m.on) { rec = []; t0 = performance.now(); }
        else if (rec) { opts.onRecorded(rec); rec = null; }
        return;
      }
      if (m.type !== 'cam') return;
      const dt = last ? Math.min(0.1, (m.ts - last) / 1000) : 0;
      last = m.ts;
      const dir = quatToLook(m.q);
      eye = integrate({ eye }, dir, m.dolly || 0, dt).eye;
      const look = [eye[0] + dir[0] * 10, eye[1] + dir[1] * 10, eye[2] + dir[2] * 10];
      const fov = m.zoom || 66;
      opts.bridge.call('setCameraRaw', { eye, look, fov }).catch(() => {});
      statusEl.textContent = rec ? `REC ${(rec.length / 30).toFixed(1)}s` : 'live';
      if (rec) {
        const t = +((performance.now() - t0) / 1000).toFixed(3);
        rec.push({ t, m: 'air', eye: [...eye], look, fov: Math.round(fov), cut: rec.length === 0 });
        if (t > REC_MAX_SEC) {
          statusEl.textContent = `stopped: recording exceeded ${REC_MAX_SEC}s`;
          opts.onRecorded(rec);
          rec = null;
        }
      }
    };
  }
  connect();

  return {
    dispose() {
      disposed = true;
      try { ws?.close(); } catch { /* already closed */ }
    },
  };
}
