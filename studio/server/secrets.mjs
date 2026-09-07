// Per-machine API keys for the studio. Resolution order for every key:
//   1. the environment variable (operator-level, always wins)
//   2. the secrets file this module owns (`studio/.secrets.json`, git-ignored, written by the
//      Director's Settings panel — one file per PC, so one set of keys per person)
//   3. nothing → the feature falls back (prompt→path uses the anchor planner, VARCO fetch
//      prints the manual path, Seedance writes a job card)
// Keys are never sent back to a browser in full; `keyStatus()` masks them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEY_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'VARCO_API_KEY'];
export const SECRETS_PATH = process.env.STUDIO_SECRETS || path.join(fileURLToPath(new URL('..', import.meta.url)), '.secrets.json');

export function readSecrets() {
  try {
    const v = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// Merge `partial` into the file; an empty string deletes that key. Only known key names are
// accepted, values must be printable single-line strings ≤ 512 chars.
export function writeSecrets(partial) {
  const cur = readSecrets();
  for (const [k, v] of Object.entries(partial || {})) {
    if (!KEY_NAMES.includes(k)) throw new Error(`unknown key ${k}`);
    if (typeof v !== 'string') throw new Error(`${k} must be a string`);
    const s = v.trim();
    if (s.length > 512 || /[^\x21-\x7e]/.test(s)) throw new Error(`${k} must be a single-line printable string of at most 512 characters`);
    if (s) cur[k] = s; else delete cur[k];
  }
  const tmp = `${SECRETS_PATH}.tmp`;
  fs.mkdirSync(path.dirname(SECRETS_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(cur, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, SECRETS_PATH);
  try { fs.chmodSync(SECRETS_PATH, 0o600); } catch { /* windows */ }
  return cur;
}

export function keySource(name) {
  if (process.env[name]) return 'env';
  if (readSecrets()[name]) return 'file';
  return 'none';
}

export function getKey(name) {
  return process.env[name] || readSecrets()[name] || '';
}

export const mask = (v) => (v ? `••••${String(v).slice(-4)}` : '');

export function keyStatus() {
  const out = {};
  for (const k of KEY_NAMES) { const v = getKey(k); out[k] = { set: !!v, source: keySource(k), masked: mask(v) }; }
  return out;
}

// Which LLM provider prompt→path should use when the request does not say: STUDIO_LLM if the
// operator pinned one, else the first provider that actually has a key, else the anchor planner.
export function defaultProvider() {
  const pinned = process.env.STUDIO_LLM;
  if (pinned) return pinned;
  if (getKey('ANTHROPIC_API_KEY')) return 'anthropic';
  if (getKey('OPENAI_API_KEY')) return 'openai';
  return 'none';
}
