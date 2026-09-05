// Pure keyframe-list logic shared by the timeline UI and its tests. No DOM, no imports.
export type Key = { t: number; m: 'air' | 'walk'; eye?: [number, number, number]; pos?: [number, number]; look: [number, number, number]; fov?: number; cut?: boolean; cap?: string; time?: 'day' | 'sunset' | 'night' };
export const sortKeys = (ks: Key[]) => [...ks].sort((a, b) => a.t - b.t);
export function addKeyAt(ks: Key[], t: number, key: Key): Key[] { const out = ks.filter((k) => Math.abs(k.t - t) > 1e-6); return sortKeys([...out, { ...key, t }]); }
export function removeKey(ks: Key[], i: number): Key[] { return ks.filter((_, j) => j !== i); }
export function moveKey(ks: Key[], i: number, t: number): Key[] { return sortKeys(ks.map((k, j) => (j === i ? { ...k, t } : k))); }
export function keyFromCamera(c: { eye: number[]; look: number[]; fov: number }, o: { t: number; m: 'air' | 'walk'; cap?: string; cut?: boolean }): Key {
  const base: Key = { t: o.t, m: o.m, look: [c.look[0], c.look[1], c.look[2]], fov: Math.round(c.fov), cap: o.cap, cut: o.cut };
  return o.m === 'air' ? { ...base, eye: [c.eye[0], c.eye[1], c.eye[2]] } : { ...base, pos: [c.eye[0], c.eye[2]] };
}
