### Task 11: prompt → path and phone virtual camera

**Files:**
- Create: `studio/app/src/prompt.ts`, `studio/server/prompt.mjs`, `studio/app/phone/index.html`, `studio/app/phone/phone.ts`, `studio/app/src/phone.ts`
- Modify: `studio/server/index.mjs` (add `POST /api/projects/:id/prompt` and `GET /api/qr?url=`), `studio/app/src/main.ts` (mount panels)
- Test: `studio/test/prompt.test.mjs`, `studio/test/phone.test.ts`

**Interfaces:**
- `server/prompt.mjs`: `anchorsFor(world)` → `[{ id, title, pos:[x,y,z], look:[x,y,z] }]` from the world's `public/data/viewpoints.json` (fields `id,title,x,y,z,heading,pitch` → convert heading/pitch to a look point 20 m ahead) plus the tour stops copied verbatim from `main.ts` (`tourStops()` array, hardcoded here for the two worlds); `promptToKeys({ world, prompt, durationSec, provider })` → `Key[]`; provider `anthropic` (env `ANTHROPIC_API_KEY`, model `claude-sonnet-4-5`) / `openai` (`OPENAI_API_KEY`) / `none` (falls back to `anchorsToKeys(anchors, durationSec)`: evenly spaced air keys through the first 4 anchors). The LLM prompt includes the anchor list and the Key JSON schema and must return only JSON; the result is validated with `validateKey` and sorted.
- `phone.ts` (phone page): on tap **Start**, request `DeviceOrientationEvent.requestPermission()` (iOS), then stream `{type:'cam', q:[x,y,z,w], dolly, zoom, ts}` at 30 Hz over `wss://<host>/ws` after `{type:'join', room:'phone', projectId}`; two on-screen sliders: dolly (−1..1) and zoom (fov 30..90); **Record** toggles `{type:'rec', on:true|false}`.
- `src/phone.ts` (director side): joins room `director`; converts quaternion → look direction; integrates dolly along the look direction at 3 m/s; applies to the bridge each message; while `rec` is on, appends one **air** key per received sample (`t` = elapsed since rec start, `cut` on the first) and on stop, replaces the current shot's keys.
- `GET /api/qr?url=` returns a PNG (package `qrcode`) of the phone URL: `https://<lan-ip>:5180/phone/?projectId=...` — the Vite dev server needs HTTPS for DeviceOrientation on iOS: document `mkcert -install && mkcert localhost <lan-ip>` and `server.https` in `vite.config.ts` reading `studio/.certs/`.

- [ ] **Step 1: Failing tests**

`studio/test/prompt.test.mjs`:
```js
import { it, expect } from 'vitest';
import { anchorsFor, anchorsToKeys, promptToKeys } from '../server/prompt.mjs';
it('anchors include viewpoints and tour stops for union-square-sf', () => { const a = anchorsFor('union-square-sf'); expect(a.length).toBeGreaterThan(5); expect(a[0]).toHaveProperty('pos'); expect(a[0]).toHaveProperty('look'); });
it('anchorsToKeys spreads air keys over the duration', () => { const ks = anchorsToKeys(anchorsFor('union-square-sf'), 8); expect(ks[0].t).toBe(0); expect(ks[ks.length - 1].t).toBe(8); expect(ks.every((k) => k.m === 'air')).toBe(true); });
it('promptToKeys with provider none returns valid sorted keys', async () => { const ks = await promptToKeys({ world: 'union-square-sf', prompt: 'x', durationSec: 6, provider: 'none' }); expect(ks.length).toBeGreaterThan(1); for (let i = 1; i < ks.length; i++) expect(ks[i].t).toBeGreaterThanOrEqual(ks[i - 1].t); });
```
`studio/test/phone.test.ts`:
```ts
import { it, expect } from 'vitest';
import { quatToLook, integrate } from '../app/src/phone';
it('identity quaternion looks down -Z', () => { const d = quatToLook([0, 0, 0, 1]); expect(d[2]).toBeCloseTo(-1); });
it('integrate moves the eye along the look direction by dolly*speed*dt', () => { const s = integrate({ eye: [0, 1.7, 0] }, [0, 0, -1], 1, 0.5, 3); expect(s.eye[2]).toBeCloseTo(-1.5); });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

`server/prompt.mjs`:
```js
import fs from 'node:fs'; import path from 'node:path';
import { validateKey } from '../schemas/project.mjs';
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const TOURS = {
  'union-square-sf': [ { title: 'Union Square aerial', pos: [40, 140, 260], look: [0, 10, 0] }, { title: 'Dewey Monument', pos: [-22, 6, 24], look: [0, 16, 0] }, { title: 'Powell Street', pos: [-68, 1.7, 110], look: [-73, 12, -60] }, { title: 'Nintendo SAN FRANCISCO', pos: [-62, -0.5, 58], look: [-84, 3, 44] }, { title: 'Westin St. Francis', pos: [-30, 4, 0], look: [-90, 28, 0] }, { title: 'Apple Union Square', pos: [44, 0.5, -36], look: [44, 6, -66] }, { title: 'The plaza', pos: [-30, 3, 30], look: [20, 2, -10] }, { title: 'Sunset skyline', pos: [120, 90, 180], look: [-20, 30, -40] } ],
  'kyoto-higashiyama': [],
};
export function anchorsFor(world) {
  const out = TOURS[world].map((t, i) => ({ id: `tour${i}`, title: t.title, pos: t.pos, look: t.look }));
  try { const vps = JSON.parse(fs.readFileSync(path.join(ROOT, world, 'public/data/viewpoints.json'), 'utf8')); const list = Array.isArray(vps) ? vps : vps.viewpoints || [];
    for (const v of list) { if (!Number.isFinite(v.x)) continue; const yaw = ((v.heading ?? 0) * Math.PI) / 180, pitch = ((v.pitch ?? 0) * Math.PI) / 180; const y = v.y ?? 1.7;
      out.push({ id: v.id, title: v.title || v.id, pos: [v.x, y, v.z], look: [v.x + Math.sin(yaw) * 20 * Math.cos(pitch), y + Math.sin(pitch) * 20, v.z - Math.cos(yaw) * 20 * Math.cos(pitch)] }); } } catch { /* no viewpoints */ }
  return out;
}
export function anchorsToKeys(anchors, durationSec) { const a = anchors.slice(0, 4); return a.map((x, i) => ({ t: +(i * (durationSec / Math.max(1, a.length - 1))).toFixed(2), m: 'air', eye: x.pos.map((v, j) => (j === 1 ? Math.max(v, 3) : v)), look: x.look, cap: x.title })); }
function schemaText() { return `Key = {"t": seconds>=0, "m": "air"|"walk", "eye": [x,y,z] (air only), "pos": [x,z] (walk only, eye height is automatic), "look": [x,y,z], "fov"?: 30-90, "cut"?: true for a hard cut, "cap"?: caption, "time"?: "day"|"sunset"|"night"}`; }
export async function promptToKeys({ world, prompt, durationSec = 10, provider = process.env.STUDIO_LLM || 'none' }) {
  const anchors = anchorsFor(world);
  if (provider === 'none') return anchorsToKeys(anchors, durationSec);
  const sys = `You plan camera moves for a 3D city world. Coordinates are metres, y up. Landmarks (use these positions as anchors):\n${anchors.map((a) => `- ${a.title}: pos ${JSON.stringify(a.pos)} look ${JSON.stringify(a.look)}`).join('\n')}\nReturn ONLY a JSON array of keys covering 0..${durationSec} seconds. ${schemaText()} Use 4-10 keys; air keys for sweeps, walk keys for street level; add "cut": true when jumping.`;
  let text;
  if (provider === 'anthropic') { const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 2000, system: sys, messages: [{ role: 'user', content: prompt }] }) }); const j = await r.json(); text = j.content?.[0]?.text; }
  else if (provider === 'openai') { const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }] }) }); const j = await r.json(); text = j.choices?.[0]?.message?.content; }
  else throw new Error(`unknown provider ${provider}`);
  const m = String(text || '').match(/\[[\s\S]*\]/); if (!m) throw new Error('LLM returned no JSON array');
  const keys = JSON.parse(m[0]).sort((a, b) => a.t - b.t); const errs = keys.flatMap((k, i) => validateKey(k).map((e) => `key[${i}]: ${e}`)); if (errs.length) throw new Error(`LLM keys invalid: ${errs.join('; ')}`);
  return keys;
}
```
Server route: `POST /api/projects/:id/prompt {world, prompt, durationSec, provider}` → `promptToKeys(...)`; `GET /api/qr?url=` → `import QRCode from 'qrcode'; res.end(await QRCode.toBuffer(url))` with `content-type: image/png`.

`app/src/phone.ts` (director side helpers + panel):
```ts
export function quatToLook(q: number[]): [number, number, number] { const [x, y, z, w] = q; // rotate (0,0,-1) by q
  return [-(2 * (x * z + w * y)), -(2 * (y * z - w * x)), -(1 - 2 * (x * x + y * y))]; }
export function integrate(state: { eye: number[] }, dir: number[], dolly: number, dt: number, speed = 3) { const d = dolly * speed * dt; return { eye: [state.eye[0] + dir[0] * d, state.eye[1] + dir[1] * d, state.eye[2] + dir[2] * d] }; }
export function mountPhonePanel(el: HTMLElement, opts: { projectId: string; bridge: { call(cmd: string, p?: any): Promise<any> }; onRecorded(keys: any[]): void }) {
  const url = `${location.protocol}//${location.host}/phone/?projectId=${opts.projectId}`;
  el.innerHTML = `<h3>Phone camera</h3><img src="/api/qr?url=${encodeURIComponent(url)}" width="160"><div><code>${url}</code></div><div id="ph-status">waiting…</div>`;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); let eye = [0, 1.7, 0], last = 0, rec: any[] | null = null, t0 = 0;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: 'director', projectId: opts.projectId }));
  ws.onmessage = async (e) => { const m = JSON.parse(e.data);
    if (m.type === 'rec') { if (m.on) { rec = []; t0 = performance.now(); } else if (rec) { opts.onRecorded(rec); rec = null; } return; }
    if (m.type !== 'cam') return; const dt = last ? Math.min(0.1, (m.ts - last) / 1000) : 0; last = m.ts;
    const dir = quatToLook(m.q); eye = integrate({ eye }, dir, m.dolly || 0, dt).eye; const look = [eye[0] + dir[0] * 10, eye[1] + dir[1] * 10, eye[2] + dir[2] * 10]; const fov = m.zoom || 66;
    opts.bridge.call('setCameraRaw', { eye, look, fov }).catch(() => {}); (el.querySelector('#ph-status') as HTMLElement).textContent = rec ? `REC ${(rec.length / 30).toFixed(1)}s` : 'live';
    if (rec) rec.push({ t: +((performance.now() - t0) / 1000).toFixed(3), m: 'air', eye: [...eye], look, fov: Math.round(fov), cut: rec.length === 0 }); };
}
```
`app/phone/phone.ts`:
```ts
const projectId = new URLSearchParams(location.search).get('projectId') || 'demo';
const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: 'phone', projectId }));
let q = [0, 0, 0, 1]; const dolly = document.getElementById('dolly') as HTMLInputElement, zoom = document.getElementById('zoom') as HTMLInputElement;
function onOrient(e: DeviceOrientationEvent) { const d = Math.PI / 180, a = (e.alpha || 0) * d, b = (e.beta || 0) * d, g = (e.gamma || 0) * d; // ZXY euler -> quaternion (device frame), then map to camera frame
  const c1 = Math.cos(a / 2), s1 = Math.sin(a / 2), c2 = Math.cos(b / 2), s2 = Math.sin(b / 2), c3 = Math.cos(g / 2), s3 = Math.sin(g / 2);
  q = [s2 * c1 * c3 - c2 * s1 * s3, c2 * s1 * c3 + s2 * c1 * s3, c2 * c1 * s3 + s2 * s1 * c3, c2 * c1 * c3 - s2 * s1 * s3]; }
document.getElementById('start')!.onclick = async () => { const D: any = DeviceOrientationEvent; if (D.requestPermission) { if ((await D.requestPermission()) !== 'granted') return alert('orientation permission denied'); } window.addEventListener('deviceorientation', onOrient); setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'cam', q, dolly: Number(dolly.value), zoom: Number(zoom.value), ts: Date.now() })), 33); };
let on = false; document.getElementById('rec')!.onclick = () => { on = !on; ws.send(JSON.stringify({ type: 'rec', on })); (document.getElementById('rec') as HTMLElement).textContent = on ? 'Stop' : 'Record'; };
```
`app/phone/index.html`: buttons `#start`, `#rec`; range inputs `#dolly` (min −1 max 1 step 0.05 value 0) and `#zoom` (min 30 max 90 value 66); big touch targets; loads `./phone.ts` as a module. Add `phone/index.html` to `vite.config.ts` `build.rollupOptions.input`. Mount the prompt panel (textarea + duration + provider select + **Generate** → `POST /api/projects/:id/prompt` → replaces shot keys) and the phone panel in `main.ts`.

- [ ] **Step 4: Run** — unit tests PASS; manual: on a phone on the same Wi-Fi open the QR URL (HTTPS via mkcert, or on Android over plain http), tap Start, move the phone → the world camera follows in the Director; Record 3 s → keys appear; Render → previz follows the recorded move. Prompt panel with `STUDIO_LLM=none` fills 4 anchor keys.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): prompt-to-path (pluggable LLM, anchor fallback) and phone virtual camera"`

---

