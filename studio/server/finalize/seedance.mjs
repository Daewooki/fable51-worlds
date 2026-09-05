import fs from 'node:fs'; import path from 'node:path'; import { spawn, spawnSync } from 'node:child_process';
import { projectDir } from '../store.mjs';

export const MODES = ['t2v', 'omni_reference', 'video_edit', 'video_extension'];

// --------------------------------------------------------------------------------------
// Resolving the CLI without a shell.
//
// `higgsfield` on PATH is an npm shim — `higgsfield.cmd` on Windows — and Node refuses to
// spawn a .cmd without `shell: true` (the automatic dispatch was removed for CVE-2024-27980).
// `shell: true` is exactly what must not happen here: cmd.exe re-parses the argument list, so
// a `"` in the finalize prompt closes the quote and everything after `&` runs as a separate
// command, and `%VAR%` expands inside the argument (neither is escapable from outside).
// The npm package ships the real native binary next to the shim, at
// `@higgsfield/cli/vendor/hf[.exe]`; that is what we spawn, with `shell: false` and the argv
// array verbatim, so no string is ever re-parsed by anything.
// --------------------------------------------------------------------------------------
const CLI_REL = path.join('@higgsfield', 'cli', 'vendor', process.platform === 'win32' ? 'hf.exe' : 'hf');

function npmRootGlobal() {
  try {
    // Fixed argv, no user input of any kind reaches this spawn. `shell: true` is needed only
    // because `npm` itself is a .cmd shim on Windows.
    const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true });
    const out = String(r.stdout || '').trim().split(/\r?\n/)[0];
    return out || null;
  } catch { return null; }
}

const isFile = (p) => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };

let cached; // undefined = not looked up yet; string | null afterwards
/** Absolute path of the native Higgsfield binary, or null when it cannot be found. */
export function resolveCli() {
  if (cached !== undefined) return cached;
  const candidates = [];
  const root = npmRootGlobal();
  if (root) candidates.push(path.join(root, CLI_REL));
  if (process.platform === 'win32') {
    // Fallback for the (common) case where `npm root -g` cannot be run: the default global
    // prefix on Windows is %APPDATA%\npm.
    if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', CLI_REL));
  } else {
    if (process.env.npm_config_prefix) candidates.push(path.join(process.env.npm_config_prefix, 'lib', 'node_modules', CLI_REL));
    // `which higgsfield` last: on POSIX the PATH entry is a real executable (a symlink to a
    // file with a shebang), which execve handles without a shell.
    try {
      const w = spawnSync('which', ['higgsfield'], { encoding: 'utf8' });
      const p = String(w.stdout || '').trim().split(/\r?\n/)[0];
      if (p) candidates.push(p);
    } catch { /* no `which` on this system */ }
  }
  cached = candidates.find(isFile) ? path.resolve(candidates.find(isFile)) : null;
  return cached;
}

export function buildArgv(job, files) {
  if (!MODES.includes(job.mode)) throw new Error(`unknown seedance mode: ${job.mode} (valid: ${MODES.join(', ')})`);
  const a = ['generate', 'create', 'seedance_2_5', '--prompt', job.prompt || '', '--mode', job.mode,
    '--resolution', job.resolution || '1080p', '--generate_audio', String(!!job.generateAudio)];
  if (job.mode !== 'video_edit') a.push('--duration', String(job.duration || 5));
  if (job.mode !== 'video_edit' && job.mode !== 'video_extension') a.push('--aspect_ratio', job.aspect || '16:9');
  if (job.mode === 'video_extension') a.push('--extension_mode', job.extensionMode || 'forward');
  if (job.mode !== 't2v' && files.previz) a.push('--video-references', files.previz);
  if (job.mode === 'omni_reference') {
    if (job.useArtist) for (const f of files.artist || []) a.push('--image-references', f);
    if (job.useStyle) for (const f of files.style || []) a.push('--image-references', f);
    if (job.useAudio && files.audio) a.push('--audio-references', files.audio);
  }
  a.push('--wait', '--wait-timeout', '30m', '--wait-interval', '10s', '--json');
  return a;
}

// The job card is documentation: a command line a human copies into a terminal. It is never
// executed by this process (runSeedance spawns the binary directly, argv array, no shell), so
// this only has to be readable and correct for someone pasting it into a POSIX shell.
export function posixQuote(arg) {
  const s = String(arg);
  if (s !== '' && /^[A-Za-z0-9_@%+=:,.\/-]+$/.test(s)) return s;
  return "'" + s.split("'").join("'\\''") + "'";
}

export function jobCardMarkdown(job, files) {
  const cmd = buildArgv(job, files).map(posixQuote).join(' ');
  return `# Seedance job (manual)\n\nmodel: seedance_2_5\nmode: ${job.mode}\nresolution: ${job.resolution}\nduration: ${job.duration}\naspect: ${job.aspect}\n\nprompt:\n${job.prompt}\n\nmedias:\n- previz (video reference): ${files.previz || '-'}\n- artist images: ${(files.artist || []).join(', ') || '-'}\n- style images: ${(files.style || []).join(', ') || '-'}\n- audio: ${files.audio || '-'}\n\nRun in Higgsfield web or: higgsfield ${cmd}\n`;
}

export function detectCli() {
  const bin = resolveCli();
  if (!bin) return { ok: false, reason: 'higgsfield CLI not found (npm i -g @higgsfield/cli)' };
  const r = spawnSync(bin, ['model', 'list', '--json'], { encoding: 'utf8', shell: false });
  if (r.error) return { ok: false, reason: `higgsfield CLI not found (npm i -g @higgsfield/cli): ${r.error.message}` };
  const out = (r.stdout || '') + (r.stderr || '');
  if (/No workspace selected|not logged in|unauthori[sz]ed|auth login/i.test(out) || r.status !== 0) return { ok: false, reason: 'higgsfield CLI needs login: run `higgsfield auth login` then `higgsfield workspace set <id>`' };
  return { ok: true, bin };
}
// Extract every top-level {...} object from possibly-noisy CLI stdout: `--wait` streams a
// progress object roughly every `--wait-interval`, then a final result object; both plain and
// pretty-printed (multi-line) JSON must be handled, and stray/unbalanced braces in surrounding
// log text must not throw or corrupt the scan. A brace-depth walk that respects quoted strings
// (and escapes within them) finds each balanced top-level object regardless of line breaks.
function findJsonObjects(text) {
  const objs = [];
  let depth = 0; let start = -1; let inStr = false; let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          const raw = text.slice(start, i + 1);
          try { objs.push(JSON.parse(raw)); } catch { /* not valid JSON; skip */ }
          start = -1;
        }
      }
    }
  }
  return objs;
}
export function findUrlField(node) {
  if (!node || typeof node !== 'object') return null;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && /url$/i.test(k) && /\.mp4(\?|$)/i.test(v)) return v;
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') { const found = findUrlField(v); if (found) return found; }
  }
  return null;
}
export function extractMp4Url(out) {
  // Prefer a URL parsed out of --json output. Multiple objects can appear (progress, then
  // result); walk them in stream order and keep the LAST one that carries a *url->.mp4 field,
  // since the final result object comes last and progress objects normally carry none.
  let found;
  for (const obj of findJsonObjects(out)) {
    const url = findUrlField(obj);
    if (url) found = url;
  }
  if (found) return found;
  // Fall back to a loose scan of plain-text output. Stop at the first quote/space/bracket so
  // trailing JSON punctuation (e.g. a stray `"}`) doesn't get glued onto the URL.
  const m = out.match(/https?:\/\/[^\s"'<>}\]]+\.mp4[^\s"'<>}\]]*/);
  return m ? m[0] : undefined;
}
export async function runSeedance({ project, shotId, driver = 'auto', log = () => {}, ...job }) {
  const dir = path.join(projectDir(project.id), 'shots', shotId); fs.mkdirSync(dir, { recursive: true });
  // `path.basename` on every ref filename: these come from the Director's free-text refs
  // fields, and a bare `path.join` would let `../../` walk out of `projects/<id>/refs/` and
  // hand an arbitrary file on the operator's disk to Higgsfield.
  const refsDir = path.join(projectDir(project.id), 'refs');
  const ref = (f) => path.join(refsDir, path.basename(String(f)));
  const files = { previz: path.join(dir, 'previz.mp4'), artist: project.refs.artist.map(ref), style: (project.refs.style || []).map(ref), audio: project.refs.audio ? ref(project.refs.audio) : null };
  if (job.mode !== 't2v' && !fs.existsSync(files.previz)) throw new Error('render the previz first');
  const card = path.join(dir, 'seedance-job.md'); fs.writeFileSync(card, jobCardMarkdown(job, files));
  const cli = driver === 'manual' ? { ok: false, reason: 'manual requested' } : detectCli();
  if (!cli.ok) { log('manual mode:', cli.reason); return { driver: 'manual', jobCard: card, reason: cli.reason }; }
  const argv = buildArgv(job, files); log('$', cli.bin, argv.join(' '));
  // shell:false + the argv array verbatim: nothing in `argv` is ever re-parsed, so the prompt
  // (and every filename) reaches the CLI byte for byte, whatever it contains.
  const out = await new Promise((resolve, reject) => { const p = spawn(cli.bin, argv, { shell: false }); let s = ''; p.stdout.on('data', (d) => { s += d; log(String(d).trimEnd()); }); p.stderr.on('data', (d) => log(String(d).trimEnd())); p.on('close', (c) => (c === 0 ? resolve(s) : reject(new Error(`higgsfield exited ${c}`)))); });
  const url = extractMp4Url(out);
  if (!url) { const tail = out.slice(-2000); log('no mp4 url found in higgsfield output; stdout tail:', tail); return { driver: 'higgsfield-cli', jobCard: card, raw: tail }; }
  const mp4 = path.join(dir, 'final.mp4');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(mp4, buf); log('saved', mp4);
  return { driver: 'higgsfield-cli', mp4, jobCard: card };
}
