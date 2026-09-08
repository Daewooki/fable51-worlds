// Uses the global Web Crypto `crypto.randomUUID()` (available in Node 19+ and every
// evergreen browser) instead of `node:crypto`'s `randomUUID` so this module — imported
// both by the server and, for WORLDS/createProject/createShot, by the browser Director UI
// (studio/app/src/main.ts) — stays load-safe in a browser bundle. Importing `node:crypto`
// directly makes Vite substitute a throw-on-access stub for client code, which crashed the
// whole module at import time even for callers that never invoke newId().
export const WORLDS = ['union-square-sf', 'kyoto-higashiyama', 'pangyo-technovalley'];
export const newId = () => crypto.randomUUID().slice(0, 13);

export function createProject({ name, world }) {
  if (!WORLDS.includes(world)) throw new Error(`unknown world: ${world} (valid: ${WORLDS.join(', ')})`);
  return { id: newId(), name, world, createdAt: new Date().toISOString(), refs: { artist: [], style: [] }, shots: [], finalize: [] };
}
/**
 * `life` opts a shot into the world's pedestrians and traffic (query `life=1`). It is OFF by default,
 * which is the studio's contract with every world: with life off a render is deterministic frame to
 * frame, so a previz can be re-rendered and compared. Turn it on when the shot wants the crowd.
 */
export function createShot({ name, fps = 30, width = 1920, height = 1080, timeOfDay = 'sunset', life = false }) {
  return { id: newId(), name, fps, width, height, timeOfDay, life: !!life, keys: [] };
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
  if (s.life !== undefined && typeof s.life !== 'boolean') e.push('life must be a boolean');
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
