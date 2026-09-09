### Task 2: project & shot schema helpers (TDD)

**Files:**
- Create: `studio/schemas/project.mjs`
- Test: `studio/test/project.test.mjs`

**Interfaces:**
- Produces: `createProject({name, world})`, `createShot({name, fps?, width?, height?, timeOfDay?})`, `validateKey(k)` → `string[]` errors, `validateShot(s)` → `string[]`, `validateProject(p)` → `string[]`, `WORLDS = ['union-square-sf','kyoto-higashiyama']`, `newId()`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { createProject, createShot, validateKey, validateShot, validateProject, WORLDS } from '../schemas/project.mjs';

describe('project schema', () => {
  it('creates a project with defaults', () => {
    const p = createProject({ name: 'MV1', world: 'union-square-sf' });
    expect(p.id).toMatch(/^[a-z0-9-]{8,}$/); expect(p.shots).toEqual([]); expect(p.refs).toEqual({ artist: [], style: [] });
  });
  it('rejects unknown worlds', () => expect(() => createProject({ name: 'x', world: 'mars' })).toThrow(/world/));
  it('shot defaults: 30fps 1920x1080 sunset', () => {
    const s = createShot({ name: 'opening' });
    expect([s.fps, s.width, s.height, s.timeOfDay]).toEqual([30, 1920, 1080, 'sunset']); expect(s.keys).toEqual([]);
  });
  it('validateKey flags bad keys', () => {
    expect(validateKey({ t: 0, m: 'air', eye: [0, 1, 2], look: [0, 0, 0] })).toEqual([]);
    expect(validateKey({ t: 0, m: 'walk', look: [0, 0, 0] })).toContain('walk key needs pos [x,z]');
    expect(validateKey({ t: -1, m: 'air', eye: [0, 0, 0], look: [0, 0, 0] })).toContain('t must be >= 0');
  });
  it('validateShot requires monotonic key times', () => {
    const s = createShot({ name: 'a' });
    s.keys = [{ t: 1, m: 'air', eye: [0, 0, 0], look: [0, 0, 0] }, { t: 0.5, m: 'air', eye: [0, 0, 0], look: [0, 0, 0] }];
    expect(validateShot(s)).toContain('keys must be sorted by t');
  });
  it('validateProject aggregates', () => {
    const p = createProject({ name: 'MV1', world: WORLDS[0] }); p.shots.push(createShot({ name: 's' }));
    expect(validateProject(p)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run test/project.test.mjs` → FAIL (module missing)

- [ ] **Step 3: Implement `studio/schemas/project.mjs`**

```js
import { randomUUID } from 'node:crypto';
export const WORLDS = ['union-square-sf', 'kyoto-higashiyama'];
export const newId = () => randomUUID().slice(0, 13);

export function createProject({ name, world }) {
  if (!WORLDS.includes(world)) throw new Error(`unknown world: ${world} (valid: ${WORLDS.join(', ')})`);
  return { id: newId(), name, world, createdAt: new Date().toISOString(), refs: { artist: [], style: [] }, shots: [], finalize: [] };
}
export function createShot({ name, fps = 30, width = 1920, height = 1080, timeOfDay = 'sunset' }) {
  return { id: newId(), name, fps, width, height, timeOfDay, keys: [] };
}
const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
export function validateKey(k) {
  const e = [];
  if (!(k.t >= 0)) e.push('t must be >= 0');
  if (k.m !== 'air' && k.m !== 'walk') e.push("m must be 'air' or 'walk'");
  if (k.m === 'air' && !isVec(k.eye, 3)) e.push('air key needs eye [x,y,z]');
  if (k.m === 'walk' && !isVec(k.pos, 2)) e.push('walk key needs pos [x,z]');
  if (!isVec(k.look, 3)) e.push('look must be [x,y,z]');
  if (k.fov !== undefined && !(k.fov > 10 && k.fov < 150)) e.push('fov must be in (10,150)');
  if (k.time !== undefined && !['day', 'sunset', 'night'].includes(k.time)) e.push('time must be day|sunset|night');
  return e;
}
export function validateShot(s) {
  const e = [];
  if (!s.name) e.push('shot needs a name');
  if (!(s.fps > 0 && s.width > 0 && s.height > 0)) e.push('fps/width/height must be positive');
  if (!['day', 'sunset', 'night'].includes(s.timeOfDay)) e.push('timeOfDay must be day|sunset|night');
  s.keys.forEach((k, i) => validateKey(k).forEach((m) => e.push(`key[${i}]: ${m}`)));
  for (let i = 1; i < s.keys.length; i++) if (s.keys[i].t < s.keys[i - 1].t) { e.push('keys must be sorted by t'); break; }
  return e;
}
export function validateProject(p) {
  const e = [];
  if (!p.id || !p.name) e.push('project needs id and name');
  if (!WORLDS.includes(p.world)) e.push(`unknown world: ${p.world}`);
  p.shots.forEach((s, i) => validateShot(s).forEach((m) => e.push(`shot[${i}]: ${m}`)));
  return e;
}
```

- [ ] **Step 4: Run tests** — Expected: 6 passed.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): project/shot schema helpers"`

---

