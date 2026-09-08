#!/usr/bin/env node
// One-terminal launcher for MV Studio: world dev server(s) + studio server + Director UI.
//
//   node tools/up.mjs                       every world + server + UI
//   node tools/up.mjs --world kyoto         kyoto-higashiyama only (union / pangyo likewise)
//   node tools/up.mjs --world all           all three worlds
//   node tools/up.mjs --lan                 bind the server to 0.0.0.0 (phone camera) and print the LAN URL
//   node tools/up.mjs --open                open the Director in the default browser once everything is up
//   node tools/up.mjs --stop                kill whatever is listening on 5173/5174/5175/5180/5190 and exit
//
// Ctrl+C stops every process it started (process trees included, on Windows too).
// A port that is already serving is reused, not restarted, and is left running on exit.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO = fileURLToPath(new URL('..', import.meta.url));
const ROOT = path.resolve(STUDIO, '..');
const WIN = process.platform === 'win32';

const WORLDS = {
  'union-square-sf': { port: 5173 },
  'kyoto-higashiyama': { port: 5174 },
  'pangyo-technovalley': { port: 5175 },
};
const ALIASES = { union: 'union-square-sf', 'union-square': 'union-square-sf', kyoto: 'kyoto-higashiyama', pangyo: 'pangyo-technovalley' };
const PORTS = { ui: 5180, server: 5190 };

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
// Default to every world: the Director can open a project of any of them, and a world whose
// dev server is down just shows "not running" — cheaper to start them all than to explain.
const worldArg = String(opt('world', 'all'));
const lan = !!opt('lan', false);
const open = !!opt('open', false);
const stopOnly = !!opt('stop', false);

const COLORS = { world: '\x1b[36m', world2: '\x1b[35m', server: '\x1b[33m', ui: '\x1b[32m', up: '\x1b[1m', reset: '\x1b[0m', dim: '\x1b[2m' };
const say = (msg) => console.log(`${COLORS.up}[up]${COLORS.reset} ${msg}`);

const worlds = worldArg === 'all' ? Object.keys(WORLDS) : [ALIASES[worldArg] || worldArg];
for (const w of worlds) if (!WORLDS[w]) { console.error(`unknown world "${w}" — use ${Object.keys(WORLDS).join(', ')} or all`); process.exit(2); }

// ---------------------------------------------------------------- port helpers
async function isUp(port) {
  // `localhost` (not 127.0.0.1): a Vite server may listen on ::1 only, and Node's fetch tries both families.
  try { const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) }); return r.status > 0; }
  catch { return false; }
}
function listeningPids(port) {
  if (WIN) {
    // no `-p tcp`: that hides IPv6 listeners ([::1]:5173), which is what Vite binds on this machine
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    const pids = new Set();
    for (const line of (r.stdout || '').split(/\r?\n/)) {
      const m = line.trim().split(/\s+/);
      if (m.length >= 5 && /^TCP/i.test(m[0]) && /LISTENING/i.test(m[3]) && m[1].endsWith(`:${port}`)) pids.add(Number(m[4]));
    }
    return [...pids].filter((p) => p > 0);
  }
  const r = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  return (r.stdout || '').split(/\s+/).filter(Boolean).map(Number);
}
function killPid(pid) {
  if (WIN) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
}

// ---------------------------------------------------------------- --stop
if (stopOnly) {
  const all = [...Object.values(WORLDS).map((w) => w.port), PORTS.ui, PORTS.server];
  let n = 0;
  for (const port of all) for (const pid of listeningPids(port)) { say(`stopping pid ${pid} on :${port}`); killPid(pid); n++; }
  say(n ? `stopped ${n} process(es)` : `nothing was listening on ${all.join('/')}`);
  process.exit(0);
}

// ---------------------------------------------------------------- spawn helpers
const children = [];
function run(label, color, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  children.push({ label, child });
  const prefix = `${color}[${label}]${COLORS.reset} `;
  const pipe = (stream) => { let buf = ''; stream.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { process.stdout.write(prefix + buf.slice(0, i + 1)); buf = buf.slice(i + 1); } }); stream.on('end', () => { if (buf) process.stdout.write(prefix + buf + '\n'); }); };
  pipe(child.stdout); pipe(child.stderr);
  child.on('exit', (code, sig) => { if (!shuttingDown) { say(`${label} exited (${sig || code}) — shutting everything down`); shutdown(1); } });
  return child;
}
async function waitFor(label, port, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if (await isUp(port)) return true; await new Promise((r) => setTimeout(r, 500)); }
  say(`${label} did not answer on :${port} within ${timeoutMs / 1000}s`);
  return false;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return; shuttingDown = true;
  say('stopping…');
  for (const { label, child } of children.reverse()) {
    if (child.exitCode !== null) continue;
    if (WIN) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
    say(`${label} stopped`);
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
if (WIN) { // Ctrl+C on Windows arrives as SIGINT only when stdin is a TTY; also catch console close
  process.on('SIGBREAK', () => shutdown(0));
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return null;
}

// ---------------------------------------------------------------- go
const node = process.execPath;
let idx = 0;
for (const w of worlds) {
  const { port } = WORLDS[w];
  const color = idx++ === 0 ? COLORS.world : COLORS.world2;
  if (await isUp(port)) { say(`${w} already serving on :${port} — reusing`); continue; }
  const vite = path.join(ROOT, w, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(vite)) { console.error(`${w}: vite not installed — run "npm install" in ${w}/`); process.exit(2); }
  // union-square-sf's own `npm run dev` runs tools/geo/sync_data.mjs first, which breaks on paths with spaces; call vite directly.
  run(w, color, node, [vite, '--port', String(port), '--strictPort'], path.join(ROOT, w));
}

if (await isUp(PORTS.server)) say(`studio server already on :${PORTS.server} — reusing`);
else run('server', COLORS.server, node, [path.join(STUDIO, 'server', 'index.mjs')], STUDIO, lan ? { STUDIO_BIND: '0.0.0.0' } : {});

if (await isUp(PORTS.ui)) say(`Director UI already on :${PORTS.ui} — reusing`);
else run('ui', COLORS.ui, node, [path.join(STUDIO, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', path.join(STUDIO, 'app', 'vite.config.ts'), '--port', String(PORTS.ui), '--strictPort'], STUDIO);

const ok = (await Promise.all([
  ...worlds.map((w) => waitFor(w, WORLDS[w].port, 60000)),
  waitFor('server', PORTS.server, 30000),
  waitFor('ui', PORTS.ui, 30000),
])).every(Boolean);
if (!ok) shutdown(1);

const ip = lan ? lanIp() : null;
const url = ip ? `http://${ip}:${PORTS.ui}` : `http://localhost:${PORTS.ui}`;
console.log('');
say(`${COLORS.up}Director → ${url}${COLORS.reset}   ${COLORS.dim}(worlds: ${worlds.map((w) => `${w} :${WORLDS[w].port}`).join(', ')} · server :${PORTS.server}${lan ? ' bound to 0.0.0.0' : ''})${COLORS.reset}`);
if (lan && !ip) say('no LAN IPv4 found — phone camera will not be reachable');
say('Ctrl+C stops everything this launcher started.');
console.log('');
if (open) {
  if (WIN) spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', windowsHide: true, detached: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}
