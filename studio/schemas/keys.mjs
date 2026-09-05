// Camera keyframe sampling shared by the renderer and the Director UI. Pure functions, no deps.
export const ease = (a, b, k) => a + (b - a) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const duration = (keys) => keys.length ? keys[keys.length - 1].t : 0;

export function sample(keys, t, fps = 30) {
  if (!keys.length) throw new Error('sample: no keys');
  if (keys.length === 1) return pose(keys[0], keys[0], 0, t, fps);
  let i = 0; while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const A = keys[i], B = keys[i + 1];
  if (B.cut && t < B.t) return pose(A, A, 0, t, fps);
  const k = Math.max(0, Math.min(1, (t - A.t) / Math.max(1e-6, B.t - A.t)));
  return pose(A, B, k, t, fps);
}

function pose(A, B, k, t, fps) {
  const look = A.look.map((v, j) => ease(v, B.look[j], k));
  const cap = k < 0.5 ? (A.cap || '') : (B.cap || '');
  const cut = !!A.cut && (t - A.t) < 1.6 / fps;
  const fov = ease(A.fov ?? (A.m === 'air' ? 60 : 66), B.fov ?? (B.m === 'air' ? 60 : 66), k);
  if (A.m === 'air' && B.m === 'air') return { air: true, eye: A.eye.map((v, j) => ease(v, B.eye[j], k)), look, cap, cut, fov, moving: false };
  if (B.m === 'air') return { air: true, eye: B.eye, look, cap, cut, fov, moving: false };
  const a0 = A.pos || B.pos;
  const pos = [ease(a0[0], B.pos[0], k), ease(a0[1], B.pos[1], k)];
  const moving = Math.hypot(B.pos[0] - a0[0], B.pos[1] - a0[1]) > 0.5;
  return { air: false, pos, look, cap, cut, fov, moving };
}
