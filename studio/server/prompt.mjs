// Prompt -> camera-path generation. Two layers:
//   - anchorsFor(world): named landmark positions/look-points for a world, drawn from that
//     world's own public/data/tour.json when it ships one, else from the hand-picked TOURS
//     table below, plus (where available) that world's public/data/viewpoints.json.
//   - promptToKeys(...): either hands 4 of those anchors straight to anchorsToKeys() (provider
//     'none' — no network, no API key, always available) or asks an LLM to plan a fuller move
//     using the anchor list as grounding, then validates whatever comes back with validateKey.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateKey } from '../schemas/project.mjs';
import { getKey, defaultProvider } from './secrets.mjs';

// studio/server/prompt.mjs -> repo root is two levels up.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// --- geo: ported from union-square-sf/src/geo/geo.ts (kept minimal — just enough to place
// viewpoints.json entries in the world's local x/z frame). Worlds without an entry here
// simply skip the viewpoints.json half of anchorsFor().
const GEO = {
  'union-square-sf': {
    originLat: 37.787935,
    originLon: -122.40752,
    gridBearingDeg: 80.686,
    mPerDegLat: 110992.476,
    mPerDegLon: 88084.677,
  },
};

function geoToLocal(g, lat, lon) {
  const d2r = Math.PI / 180;
  const sinB = Math.sin(g.gridBearingDeg * d2r);
  const cosB = Math.cos(g.gridBearingDeg * d2r);
  const dE = (lon - g.originLon) * g.mPerDegLon; // metres true-east of origin
  const dN = (lat - g.originLat) * g.mPerDegLat; // metres true-north of origin
  const x = dE * sinB + dN * cosB;
  const gridNorth = -dE * cosB + dN * sinB;
  return { x, z: -gridNorth };
}

// Ported from union-square-sf/src/debug/Viewpoints.ts: compass heading (deg cw from true
// north) -> local yaw, where yaw=0 looks toward -z (grid north) and positive yaw turns left.
function compassToYaw(g, headingDeg) {
  const gridNorthBearing = g.gridBearingDeg - 90;
  const local = headingDeg - gridNorthBearing; // cw from grid north
  return -(local * Math.PI) / 180;
}

// Both union-square-sf's WalkControls and kyoto-higashiyama's Player build the camera
// quaternion from THREE.Euler(pitch, yaw, 0, 'YXZ'); at pitch=0 that looks along
// (-sin(yaw), 0, -cos(yaw)). This is the same convention with pitch folded in.
function dirFromYawPitch(yaw, pitch) {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}
function lookAhead(pos, yaw, pitch, dist = 20) {
  const d = dirFromYawPitch(yaw, pitch);
  return [pos[0] + d[0] * dist, pos[1] + d[1] * dist, pos[2] + d[2] * dist];
}

// Ported from kyoto-higashiyama/src/systems/cameras.js (`look`): yaw that looks from (x,z)
// toward (tx,tz), same convention as dirFromYawPitch above.
const kyotoLook = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
function kyotoAnchor(title, x, z, yaw, pitch) {
  const pos = [x, 1.7, z];
  return { title, pos, look: lookAhead(pos, yaw, pitch, 20) };
}

const TOURS = {
  'union-square-sf': [
    { title: 'Union Square aerial', pos: [40, 140, 260], look: [0, 10, 0] },
    { title: 'Dewey Monument', pos: [-22, 6, 24], look: [0, 16, 0] },
    { title: 'Powell Street', pos: [-68, 1.7, 110], look: [-73, 12, -60] },
    { title: 'Nintendo SAN FRANCISCO', pos: [-62, -0.5, 58], look: [-84, 3, 44] },
    { title: 'Westin St. Francis', pos: [-30, 4, 0], look: [-90, 28, 0] },
    { title: 'Apple Union Square', pos: [44, 0.5, -36], look: [44, 6, -66] },
    { title: 'The plaza', pos: [-30, 3, 30], look: [20, 2, -10] },
    { title: 'Sunset skyline', pos: [120, 90, 180], look: [-20, 30, -40] },
  ],
  // ~6 stops copied from kyoto-higashiyama/src/systems/cameras.js HERO_VIEWS (id, x, z, yaw
  // expression, pitch), spread from Gion up through Kiyomizu-dera, converted to pos/look here
  // with the same yaw/pitch -> direction convention the world's own Player uses.
  'kyoto-higashiyama': [
    kyotoAnchor('Hanamikoji, looking south from Shijo', -382, -578, kyotoLook(-382, -578, -410, -390), 0.02),
    kyotoAnchor('the Main Hall — Gion-zukuri', -62, -520, kyotoLook(-62, -520, -60, -565), 0.12),
    kyotoAnchor('the weeping cherry, Maruyama Park', 128, -570, kyotoLook(128, -570, 96, -561), 0.14),
    kyotoAnchor('Yasaka-dori — THE view', -88.7, -4.6, kyotoLook(-88.7, -4.6, 0, 0), 0.24),
    kyotoAnchor('Sannenzaka, the 46 steps', 154, 224, kyotoLook(154, 224, 143, 258), 0.10),
    kyotoAnchor('on the stage', 522, 425.8, kyotoLook(522, 425.8, 540, 470), -0.06),
  ],
};

// A world that ships its own `public/data/tour.json` (the runtime's tour-mode stops:
// `[{ title, subtitle?, pos:[x,y,z], look:[x,y,z], duration, hold, time? }]`) is the
// authority on its own landmarks — the studio should not carry a second, drifting copy of
// them. The TOURS table above stays as the fallback for the two worlds that hard-code their
// tour in code (union-square-sf, kyoto-higashiyama) and ship no such file.
function tourStops(world) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, world, 'public/data/tour.json'), 'utf8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const stops = list.filter((t) => Array.isArray(t?.pos) && t.pos.length === 3 && Array.isArray(t?.look) && t.look.length === 3);
    return stops.length ? stops : null;
  } catch { return null; } // no tour.json for this world, or it is not readable JSON
}

export function anchorsFor(world) {
  const tour = tourStops(world) || TOURS[world] || [];
  const out = tour.map((t, i) => ({ id: `tour${i}`, title: t.title || `stop ${i + 1}`, pos: t.pos, look: t.look }));
  const g = GEO[world];
  if (g) {
    try {
      const raw = fs.readFileSync(path.join(ROOT, world, 'public/data/viewpoints.json'), 'utf8');
      const vps = JSON.parse(raw);
      const list = Array.isArray(vps) ? vps : vps.viewpoints || [];
      for (const v of list) {
        const cam = v.camera;
        if (!cam || !Number.isFinite(cam.lat) || !Number.isFinite(cam.lon)) continue;
        const { x, z } = geoToLocal(g, cam.lat, cam.lon);
        // Viewpoints.place() in the world's own debug UI uses absoluteY directly as local y
        // when present (it is already local-frame height, not a raw NAVD88 elevation); fall
        // back to heightM (approximating "ground" as y=0, since we have no terrain query here).
        const y = cam.absoluteY !== undefined ? cam.absoluteY : (cam.heightM ?? 1.7);
        const yaw = compassToYaw(g, cam.headingDeg ?? 0);
        const pitch = ((cam.pitchDeg ?? 0) * Math.PI) / 180;
        const pos = [x, y, z];
        out.push({ id: v.id, title: v.title || v.id, pos, look: lookAhead(pos, yaw, pitch, 20) });
      }
    } catch { /* no viewpoints.json for this world */ }
  }
  return out;
}

export function anchorsToKeys(anchors, durationSec) {
  const a = anchors.slice(0, 4);
  return a.map((x, i) => ({
    t: +(i * (durationSec / Math.max(1, a.length - 1))).toFixed(2),
    m: 'air',
    eye: x.pos.map((v, j) => (j === 1 ? Math.max(v, 3) : v)),
    look: x.look,
    cap: x.title,
  }));
}

function schemaText() {
  return `Key = {"t": seconds>=0, "m": "air"|"walk", "eye": [x,y,z] (air only), "pos": [x,z] (walk only, eye height is automatic), "look": [x,y,z], "fov"?: 30-90, "cut"?: true for a hard cut, "cap"?: caption, "time"?: "day"|"sunset"|"night"}`;
}

export async function promptToKeys({ world, prompt, durationSec = 10, provider }) {
  provider = provider || defaultProvider();
  const anchors = anchorsFor(world);
  if (provider === 'none') return anchorsToKeys(anchors, durationSec);
  // Keys come from the environment first, then the per-machine secrets file the Settings panel
  // writes; a missing key is reported as such rather than as an opaque 401 from the vendor.
  const needKey = (name) => { const k = getKey(name); if (!k) throw new Error(`${provider}: no API key — set ${name} in the Director's Settings panel or as an environment variable, or choose provider "none"`); return k; };

  const sys = `You plan camera moves for a 3D city world. Coordinates are metres, y up. Landmarks (use these positions as anchors):\n${anchors
    .map((a) => `- ${a.title}: pos ${JSON.stringify(a.pos)} look ${JSON.stringify(a.look)}`)
    .join('\n')}\nReturn ONLY a JSON array of keys covering 0..${durationSec} seconds. ${schemaText()} Use 4-10 keys; air keys for sweeps, walk keys for street level; add "cut": true when jumping.`;

  const model = process.env.STUDIO_LLM_MODEL;
  let text;
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': needKey('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || 'claude-sonnet-5', max_tokens: 2000, system: sys, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    text = j.content?.[0]?.text;
  } else if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${needKey('OPENAI_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    text = j.choices?.[0]?.message?.content;
  } else {
    throw new Error(`unknown provider ${provider}`);
  }

  const m = String(text || '').match(/\[[\s\S]*\]/);
  if (!m) throw new Error('LLM returned no JSON array');
  const keys = JSON.parse(m[0]).sort((a, b) => a.t - b.t);
  const errs = keys.flatMap((k, i) => validateKey(k).map((e) => `key[${i}]: ${e}`));
  if (errs.length) throw new Error(`LLM keys invalid: ${errs.join('; ')}`);
  return keys;
}
