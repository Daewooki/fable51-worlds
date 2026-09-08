// Runtime configuration from URL parameters.
const p = new URLSearchParams(location.search);
/** Last occurrence of a repeated query key. The studio launcher always writes `life=0` into the world URL and then
 *  appends its own extra query, so `…&life=0&…&life=1` must mean "life on": last one wins. */
const last = (k: string): string | null => { const a = p.getAll(k); return a.length ? a[a.length - 1] : null; };
export type TimePreset = 'day' | 'sunset' | 'night';
export type Mode = 'walk' | 'orbit' | 'tour';

export const Config = {
  view: p.get('view') || '',                 // reference viewpoint id
  mode: (p.get('mode') as Mode) || 'walk',
  time: (p.get('time') as TimePreset) || 'day',
  debug: p.get('debug') === '1',
  ref: p.get('ref') === '1',                 // reference overlay mode
  freeze: p.get('freeze') === '1',           // freeze NPCs/traffic (for deterministic screenshots)
  seed: Number(p.get('seed') || 1337),
  shadows: p.get('shadows') !== '0',
  quality: (p.get('q') || 'high') as 'low' | 'med' | 'high' | 'ultra',
  noLife: last('life') === '0',
  fov: Number(p.get('fov') || 0),
  pos: p.get('pos'),                          // "x,y,z"
  look: p.get('look'),                        // "heading,pitch" degrees
  qa: p.get('qa') === '1',
  ui: p.get('ui') !== '0',
  exposure: p.get('exposure') ? Number(p.get('exposure')) : 0,
  env: p.get('env') ? Number(p.get('env')) : 0,
  sun: p.get('sun') ? Number(p.get('sun')) : 0,                    // QA harness mode: deterministic, exposes window.__twin
};
