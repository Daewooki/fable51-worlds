import fs from 'node:fs'; import path from 'node:path'; import { spawn, spawnSync } from 'node:child_process';
import { projectDir } from '../store.mjs';
const BIN = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';

// `higgsfield.cmd` requires spawn's shell:true on win32 (Node's automatic .cmd shell
// dispatch was removed after CVE-2024-27980, so a bare spawn(BIN, argv) EINVALs).
// But with shell:true, Node just does argv.join(' ') with no quoting at all, so any
// argument containing a space (the prompt, virtually always) gets split into multiple
// shell tokens by cmd.exe. Quote each token ourselves before handing it to spawn.
function winCmdQuote(arg) {
  const s = String(arg);
  if (s === '') return '""';
  if (!/[\s"&|<>^%]/.test(s)) return s;
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
  return `# Seedance job (manual)\n\nmodel: seedance_2_5\nmode: ${job.mode}\nresolution: ${job.resolution}\nduration: ${job.duration}\naspect: ${job.aspect}\n\nprompt:\n${job.prompt}\n\nmedias:\n- previz (video reference): ${files.previz || '-'}\n- artist images: ${(files.artist || []).join(', ') || '-'}\n- style images: ${(files.style || []).join(', ') || '-'}\n- audio: ${files.audio || '-'}\n\nRun in Higgsfield web or: higgsfield ${buildArgv(job, files).join(' ')}\n`;
}
export function detectCli() {
  const r = spawnSync(BIN, ['model', 'list', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.error) return { ok: false, reason: `higgsfield CLI not found (npm i -g @higgsfield/cli)` };
  const out = (r.stdout || '') + (r.stderr || '');
  if (/No workspace selected|not logged in|unauthori[sz]ed|auth login/i.test(out) || r.status !== 0) return { ok: false, reason: 'higgsfield CLI needs login: run `higgsfield auth login` then `higgsfield workspace set <id>`' };
  return { ok: true };
}
function extractMp4Url(out) {
  // Prefer a URL from parsed --json output: any field ending in "url" pointing at .mp4.
  const objs = [...out.matchAll(/\{[\s\S]*\}/g)].map((m) => m[0]);
  for (const raw of objs.reverse()) {
    try {
      const parsed = JSON.parse(raw);
      const found = findUrlField(parsed);
      if (found) return found;
    } catch { /* not valid JSON as a whole; fall through */ }
  }
  return (out.match(/https?:\/\/\S+\.mp4\S*/) || [])[0];
}
function findUrlField(node) {
  if (!node || typeof node !== 'object') return null;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && /url$/i.test(k) && /\.mp4(\?|$)/i.test(v)) return v;
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') { const found = findUrlField(v); if (found) return found; }
  }
  return null;
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
  if (!url) return { driver: 'higgsfield-cli', jobCard: card, raw: out.slice(-2000) };
  const mp4 = path.join(dir, 'final.mp4'); const buf = Buffer.from(await (await fetch(url)).arrayBuffer()); fs.writeFileSync(mp4, buf); log('saved', mp4);
  return { driver: 'higgsfield-cli', mp4, jobCard: card };
}
