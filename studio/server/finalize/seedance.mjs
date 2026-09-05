import fs from 'node:fs'; import path from 'node:path'; import { spawn, spawnSync } from 'node:child_process';
import { projectDir } from '../store.mjs';
const BIN = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';

// `higgsfield.cmd` requires spawn's shell:true on win32 (Node's automatic .cmd shell
// dispatch was removed after CVE-2024-27980, so a bare spawn(BIN, argv) EINVALs).
// But with shell:true, Node just does argv.join(' ') with no quoting at all, so any
// argument containing a space (the prompt, virtually always) gets split into multiple
// shell tokens by cmd.exe. Quote each token ourselves before handing it to spawn.
export function winCmdQuote(arg) {
  const s = String(arg);
  if (s === '') return '""';
  if (!/[\s"&|<>^%]/.test(s) && !s.endsWith('\\')) return s;
  let result = '"';
  let backslashes = 0;
  for (const ch of s) {
    if (ch === '\\') { backslashes++; result += ch; }
    else if (ch === '"') { result += '\\'.repeat(backslashes) + '\\"'; backslashes = 0; }
    else { backslashes = 0; result += ch; }
  }
  result += '\\'.repeat(backslashes) + '"';
  return result;
}
const quoteForShell = (argv) => (process.platform === 'win32' ? argv.map(winCmdQuote) : argv);

export function buildArgv(job, files) {
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
export function jobCardMarkdown(job, files) {
  const cmd = quoteForShell(buildArgv(job, files)).join(' ');
  return `# Seedance job (manual)\n\nmodel: seedance_2_5\nmode: ${job.mode}\nresolution: ${job.resolution}\nduration: ${job.duration}\naspect: ${job.aspect}\n\nprompt:\n${job.prompt}\n\nmedias:\n- previz (video reference): ${files.previz || '-'}\n- artist images: ${(files.artist || []).join(', ') || '-'}\n- style images: ${(files.style || []).join(', ') || '-'}\n- audio: ${files.audio || '-'}\n\nRun in Higgsfield web or: higgsfield ${cmd}\n`;
}
export function detectCli() {
  const r = spawnSync(BIN, ['model', 'list', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.error) return { ok: false, reason: `higgsfield CLI not found (npm i -g @higgsfield/cli)` };
  const out = (r.stdout || '') + (r.stderr || '');
  if (/No workspace selected|not logged in|unauthori[sz]ed|auth login/i.test(out) || r.status !== 0) return { ok: false, reason: 'higgsfield CLI needs login: run `higgsfield auth login` then `higgsfield workspace set <id>`' };
  return { ok: true };
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
  const files = { previz: path.join(dir, 'previz.mp4'), artist: project.refs.artist.map((f) => path.join(projectDir(project.id), 'refs', f)), style: (project.refs.style || []).map((f) => path.join(projectDir(project.id), 'refs', f)), audio: project.refs.audio ? path.join(projectDir(project.id), 'refs', project.refs.audio) : null };
  if (job.mode !== 't2v' && !fs.existsSync(files.previz)) throw new Error('render the previz first');
  const card = path.join(dir, 'seedance-job.md'); fs.writeFileSync(card, jobCardMarkdown(job, files));
  const cli = driver === 'manual' ? { ok: false, reason: 'manual requested' } : detectCli();
  if (!cli.ok) { log('manual mode:', cli.reason); return { driver: 'manual', jobCard: card, reason: cli.reason }; }
  const argv = buildArgv(job, files); log('$ higgsfield', argv.join(' '));
  const out = await new Promise((resolve, reject) => { const p = spawn(BIN, quoteForShell(argv), { shell: process.platform === 'win32' }); let s = ''; p.stdout.on('data', (d) => { s += d; log(String(d).trimEnd()); }); p.stderr.on('data', (d) => log(String(d).trimEnd())); p.on('close', (c) => (c === 0 ? resolve(s) : reject(new Error(`higgsfield exited ${c}`)))); });
  const url = extractMp4Url(out);
  if (!url) { const tail = out.slice(-2000); log('no mp4 url found in higgsfield output; stdout tail:', tail); return { driver: 'higgsfield-cli', jobCard: card, raw: tail }; }
  const mp4 = path.join(dir, 'final.mp4');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(mp4, buf); log('saved', mp4);
  return { driver: 'higgsfield-cli', mp4, jobCard: card };
}
