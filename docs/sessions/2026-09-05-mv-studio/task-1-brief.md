### Task 1: studio package + shared key sampler (TDD)

**Files:**
- Create: `studio/package.json`, `studio/tsconfig.json`, `studio/vitest.config.ts`, `studio/.gitignore`, `studio/projects/.gitkeep`
- Create: `studio/schemas/keys.mjs`
- Test: `studio/test/keys.test.mjs`

**Interfaces:**
- Produces: `ease(a,b,k)`, `sample(keys, t, fps=30)` → `{ air, eye?, pos?, look, cap, cut, moving, fov }`, `duration(keys)`.

- [ ] **Step 1: Scaffold the package**

`studio/package.json`:
```json
{
  "name": "mv-studio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server/index.mjs",
    "dev:ui": "vite --config app/vite.config.ts --port 5180 --strictPort",
    "test": "vitest run",
    "render": "node server/render/previz.mjs",
    "inject": "node tools/inject_asset.mjs"
  },
  "dependencies": {
    "ws": "^8.18.0",
    "@gltf-transform/core": "^4.1.0",
    "@gltf-transform/functions": "^4.1.0",
    "playwright": "^1.62.1",
    "qrcode": "^1.5.4"
  },
  "devDependencies": {
    "vite": "^8.2.2",
    "typescript": "^7.0.2",
    "three": "^0.185.1",
    "@types/three": "^0.185.4",
    "@types/ws": "^8.5.12",
    "vitest": "^3.2.0"
  }
}
```
`studio/vitest.config.ts`: `export default { test: { include: ['test/**/*.test.mjs', 'test/**/*.test.ts'] } }`
`studio/.gitignore`: `node_modules\nprojects/*\n!projects/.gitkeep\n.certs/`
`studio/tsconfig.json`: `{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"bundler","strict":true,"lib":["ES2022","DOM"],"skipLibCheck":true,"noEmit":true},"include":["app/src","app/phone"]}`

Run: `cd studio && npm install --no-audit --no-fund`

- [ ] **Step 2: Write the failing test**

`studio/test/keys.test.mjs`:
```js
import { describe, it, expect } from 'vitest';
import { ease, sample, duration } from '../schemas/keys.mjs';

const KEYS = [
  { t: 0, m: 'air', eye: [0, 100, 0], look: [0, 0, 0] },
  { t: 2, m: 'air', eye: [100, 100, 0], look: [0, 0, 0] },
  { t: 2.5, m: 'walk', pos: [10, 10], look: [0, 1.7, 0], cut: true, cap: 'A' },
  { t: 4.5, m: 'walk', pos: [20, 10], look: [0, 1.7, 0], cap: 'B' },
];

describe('keys', () => {
  it('ease is 0 at 0, 1 at 1, 0.5 at 0.5', () => {
    expect(ease(0, 1, 0)).toBe(0); expect(ease(0, 1, 1)).toBe(1); expect(ease(0, 1, 0.5)).toBeCloseTo(0.5);
  });
  it('duration is the last key time', () => expect(duration(KEYS)).toBe(4.5));
  it('interpolates air eye positions', () => {
    const s = sample(KEYS, 1);
    expect(s.air).toBe(true); expect(s.eye[0]).toBeCloseTo(50); expect(s.eye[1]).toBe(100);
  });
  it('walk keys give pos and moving flag', () => {
    const s = sample(KEYS, 3.5);
    expect(s.air).toBe(false); expect(s.pos[0]).toBeCloseTo(15); expect(s.moving).toBe(true);
  });
  it('cut is true only within the first frame after a cut key', () => {
    expect(sample(KEYS, 2.5, 30).cut).toBe(true);
    expect(sample(KEYS, 2.8, 30).cut).toBe(false);
  });
  it('caption switches at the midpoint of a segment', () => {
    expect(sample(KEYS, 3.0).cap).toBe('A'); expect(sample(KEYS, 4.0).cap).toBe('B');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd studio && npx vitest run test/keys.test.mjs`
Expected: FAIL — cannot find module `../schemas/keys.mjs`

- [ ] **Step 4: Implement `studio/schemas/keys.mjs`** (logic lifted from demo_video.mjs, made pure)

```js
// Camera keyframe sampling shared by the renderer and the Director UI. Pure functions, no deps.
export const ease = (a, b, k) => a + (b - a) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const duration = (keys) => keys.length ? keys[keys.length - 1].t : 0;

export function sample(keys, t, fps = 30) {
  if (!keys.length) throw new Error('sample: no keys');
  if (keys.length === 1) { const k = keys[0]; return finish(k, k, 0, t, fps); }
  let i = 0; while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const A = keys[i], B = keys[i + 1];
  const k = Math.max(0, Math.min(1, (t - A.t) / Math.max(1e-6, B.t - A.t)));
  return finish(A, B, k, t, fps);
}

function finish(A, B, k, t, fps) {
  const look = A.look.map((v, j) => ease(v, B.look[j], k));
  const cap = k < 0.5 ? (A.cap || '') : (B.cap || '');
  const cut = !!B.cut && (t - A.t) < 1.6 / fps;
  const fov = ease(A.fov ?? (A.m === 'air' ? 60 : 66), B.fov ?? (B.m === 'air' ? 60 : 66), k);
  if (A.m === 'air' && B.m === 'air') return { air: true, eye: A.eye.map((v, j) => ease(v, B.eye[j], k)), look, cap, cut, fov };
  if (B.m === 'air') return { air: true, eye: B.eye, look, cap, cut, fov };
  const a0 = A.pos || B.pos;
  const pos = [ease(a0[0], B.pos[0], k), ease(a0[1], B.pos[1], k)];
  const moving = Math.hypot(B.pos[0] - a0[0], B.pos[1] - a0[1]) > 0.5;
  return { air: false, pos, look, cap, cut, fov, moving };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd studio && npx vitest run test/keys.test.mjs` — Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add studio && git commit -m "feat(studio): package scaffold and shared key sampler"
```

---

