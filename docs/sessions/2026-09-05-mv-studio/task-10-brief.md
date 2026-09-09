### Task 10: Director UI — shell, world bridge, timeline, scrubber, jobs

**Files:**
- Create: `studio/app/index.html`, `studio/app/vite.config.ts`, `studio/app/src/main.ts`, `studio/app/src/bridge.ts`, `studio/app/src/timeline.ts`, `studio/app/src/api.ts`, `studio/app/src/jobs.ts`, `studio/app/src/style.css`
- Test: `studio/test/timeline.test.ts` (pure timeline logic), manual UI check

**Interfaces:**
- `bridge.ts`: `class WorldBridge { constructor(iframe: HTMLIFrameElement); ready: Promise<void>; call(cmd, payload): Promise<any>; onPos(cb) }` — wraps the Task 3 protocol with ids and a 5 s timeout.
- `timeline.ts` (pure): `addKeyAt(keys, t, key)` (inserts sorted, replaces same t), `removeKey(keys, i)`, `moveKey(keys, i, t)`, `keyFromCamera({eye,look,fov}, {t, m, cap})` → Key (walk keys store `pos=[eye.x, eye.z]`).
- `api.ts`: thin fetch wrappers for the Task 6 routes; `pollJob(id, onUpdate)`.
- `vite.config.ts`: `{ root: 'app', server: { port: 5180, proxy: { '/api': 'http://localhost:5190', '/files': 'http://localhost:5190', '/ws': { target: 'ws://localhost:5190', ws: true } } }, build: { outDir: 'dist' } }`.

- [ ] **Step 1: Failing test for timeline logic** (`studio/test/timeline.test.ts`)

```ts
import { it, expect } from 'vitest';
import { addKeyAt, removeKey, moveKey, keyFromCamera } from '../app/src/timeline';
const K = (t: number) => ({ t, m: 'air' as const, eye: [0, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number] });
it('inserts sorted and replaces same-time keys', () => {
  let ks = addKeyAt([K(0), K(2)], 1, K(1)); expect(ks.map((k) => k.t)).toEqual([0, 1, 2]);
  ks = addKeyAt(ks, 1, { ...K(1), cap: 'x' }); expect(ks.length).toBe(3); expect(ks[1].cap).toBe('x');
});
it('moveKey re-sorts', () => { const ks = moveKey([K(0), K(1), K(2)], 0, 3); expect(ks.map((k) => k.t)).toEqual([1, 2, 3]); });
it('keyFromCamera makes walk keys from eye', () => { const k = keyFromCamera({ eye: [5, 1.7, 9], look: [0, 0, 0], fov: 66 }, { t: 1, m: 'walk' }); expect(k.pos).toEqual([5, 9]); expect(k.eye).toBeUndefined(); });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `timeline.ts`:

```ts
export type Key = { t: number; m: 'air' | 'walk'; eye?: [number, number, number]; pos?: [number, number]; look: [number, number, number]; fov?: number; cut?: boolean; cap?: string; time?: 'day' | 'sunset' | 'night' };
export const sortKeys = (ks: Key[]) => [...ks].sort((a, b) => a.t - b.t);
export function addKeyAt(ks: Key[], t: number, key: Key): Key[] { const out = ks.filter((k) => Math.abs(k.t - t) > 1e-6); return sortKeys([...out, { ...key, t }]); }
export function removeKey(ks: Key[], i: number): Key[] { return ks.filter((_, j) => j !== i); }
export function moveKey(ks: Key[], i: number, t: number): Key[] { return sortKeys(ks.map((k, j) => (j === i ? { ...k, t } : k))); }
export function keyFromCamera(c: { eye: number[]; look: number[]; fov: number }, o: { t: number; m: 'air' | 'walk'; cap?: string; cut?: boolean }): Key {
  const base: Key = { t: o.t, m: o.m, look: [c.look[0], c.look[1], c.look[2]], fov: Math.round(c.fov), cap: o.cap, cut: o.cut };
  return o.m === 'air' ? { ...base, eye: [c.eye[0], c.eye[1], c.eye[2]] } : { ...base, pos: [c.eye[0], c.eye[2]] };
}
```
`bridge.ts`:
```ts
export class WorldBridge {
  private seq = 0; private pending = new Map<string, { res: (v: any) => void; rej: (e: any) => void }>(); private posCbs: ((p: any) => void)[] = [];
  ready: Promise<void>;
  constructor(private iframe: HTMLIFrameElement) {
    this.ready = new Promise((res) => { const h = (e: MessageEvent) => { if (e.data?.type === 'studio:ready') { res(); } }; window.addEventListener('message', h); });
    window.addEventListener('message', (e) => { const m = e.data; if (!m) return;
      if (m.type === 'studio:res') { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.ok ? p.res(m.data) : p.rej(new Error(m.error)); } }
      if (m.type === 'studio:pos') this.posCbs.forEach((cb) => cb(m.pos)); });
  }
  call(cmd: string, payload: Record<string, unknown> = {}): Promise<any> {
    const id = `c${++this.seq}`; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.iframe.contentWindow!.postMessage({ type: 'studio:cmd', id, cmd, ...payload }, '*'); setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`bridge timeout: ${cmd}`)); }, 5000); });
  }
  onPos(cb: (p: any) => void) { this.posCbs.push(cb); }
}
```
`api.ts`:
```ts
const j = (r: Response) => r.json();
export const api = {
  projects: () => fetch('/api/projects').then(j),
  create: (name: string, world: string) => fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, world }) }).then(j),
  get: (id: string) => fetch(`/api/projects/${id}`).then(j),
  save: (p: any) => fetch(`/api/projects/${p.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }).then(j),
  job: (projectId: string, input: any) => fetch(`/api/projects/${projectId}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(j),
  jobStatus: (id: string) => fetch(`/api/jobs/${id}`).then(j),
  async pollJob(id: string, onUpdate: (job: any) => void) { for (;;) { const job = await this.jobStatus(id); onUpdate(job); if (job.status === 'done' || job.status === 'failed') return job; await new Promise((r) => setTimeout(r, 1500)); } },
};
```
`main.ts` (shell): left = project/shot list + world select (`WORLDS`); centre = `<iframe id="world">` sized 16:9 + scrubber `<input type=range>` (0..duration, step 1/fps) that calls `sample(keys, t)` and `bridge.call('setCameraRaw', {eye, look, fov})` (walk keys use `eye=[pos.x, 1.7 + terrainGuess, pos.z]`; the bridge returns `pos` so the UI can also read the live camera); right = keyframe list (t, m, cap, cut, time) with buttons **Add key @ t** (reads `bridge.call('pos')` → `keyFromCamera`), **Delete**, **Set cut**, **Caption**; bottom = jobs panel (`jobs.ts`): Render previz (POST job type previz), Export (type export), and the Finalize form (mode select, prompt, duration, resolution, aspect, checkboxes artist/style/audio; refs are files the creator copies into `projects/<id>/refs/` and lists in `project.refs` via a small textarea — MVP has no upload UI). Show job log tail + artifact links (`/files/<id>/shots/<shot>/previz.mp4` in a `<video>`).
Style: `style.css` — dark UI, grid `240px 1fr 320px`, monospace timeline.

- [ ] **Step 4: Run** — `npx vitest run test/timeline.test.ts` → PASS; `npm run dev` (server) + `npm run dev:ui` + world dev server; open `http://localhost:5180`, create a project, add 2 keys from the live camera, scrub (camera moves in the iframe), click Render → previz plays. Fix anything that breaks; no console errors.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): Director UI with world bridge, keyframe timeline, scrubber and job panels"`

---

