// The phone page: streams device orientation + two sliders (dolly, zoom) to the Director
// over the `/ws` relay (room 'phone'), and toggles server-relayed recording on/off.
const projectId = new URLSearchParams(location.search).get('projectId') || 'demo';

const statusEl = document.getElementById('status') as HTMLElement;
const messageEl = document.getElementById('message') as HTMLElement;
const dolly = document.getElementById('dolly') as HTMLInputElement;
const zoom = document.getElementById('zoom') as HTMLInputElement;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const recBtn = document.getElementById('rec') as HTMLButtonElement;

let ws: WebSocket | null = null;
let sendTimer: ReturnType<typeof setInterval> | null = null;

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  // Exposed for manual/automated testing: a test page can drive `window.__ws.send(...)`
  // directly instead of simulating real device-orientation events.
  (window as any).__ws = ws;
  ws.onopen = () => {
    statusEl.textContent = 'connected';
    ws!.send(JSON.stringify({ type: 'join', room: 'phone', projectId }));
  };
  ws.onclose = () => {
    statusEl.textContent = 'reconnecting…';
    setTimeout(connect, 1000);
  };
  ws.onerror = () => { try { ws!.close(); } catch { /* already closing */ } };
}
connect();

let q = [0, 0, 0, 1];

function onOrient(e: DeviceOrientationEvent) {
  const d = Math.PI / 180;
  const a = (e.alpha || 0) * d;
  const b = (e.beta || 0) * d;
  const g = (e.gamma || 0) * d;
  // ZXY euler -> quaternion (device frame), then used as-is by the director's quatToLook.
  const c1 = Math.cos(a / 2), s1 = Math.sin(a / 2);
  const c2 = Math.cos(b / 2), s2 = Math.sin(b / 2);
  const c3 = Math.cos(g / 2), s3 = Math.sin(g / 2);
  q = [
    s2 * c1 * c3 - c2 * s1 * s3,
    c2 * s1 * c3 + s2 * c1 * s3,
    c2 * c1 * s3 + s2 * s1 * c3,
    c2 * c1 * c3 - s2 * s1 * s3,
  ];
}

startBtn.onclick = async () => {
  const D: any = (window as any).DeviceOrientationEvent;
  if (!D) {
    messageEl.textContent = 'This device/browser has no orientation sensor (DeviceOrientationEvent is unavailable).';
    return;
  }
  if (typeof D.requestPermission === 'function') {
    let perm: string;
    try {
      perm = await D.requestPermission();
    } catch (e: any) {
      messageEl.textContent = `Could not request orientation permission: ${String(e?.message || e)}`;
      return;
    }
    if (perm !== 'granted') {
      messageEl.textContent = 'Orientation permission denied. Enable it in Settings > Safari > Motion & Orientation Access and reload.';
      return;
    }
  }
  messageEl.textContent = '';
  window.addEventListener('deviceorientation', onOrient);
  startBtn.textContent = 'Streaming…';
  startBtn.disabled = true;
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cam', q, dolly: Number(dolly.value), zoom: Number(zoom.value), ts: Date.now() }));
    }
  }, 33);
};

let on = false;
recBtn.onclick = () => {
  on = !on;
  ws?.send(JSON.stringify({ type: 'rec', on }));
  recBtn.textContent = on ? 'Stop' : 'Record';
  recBtn.classList.toggle('recording', on);
};
