### Task 7: Seedance finalize driver (CLI + manual)

**Files:**
- Create: `studio/server/finalize/seedance.mjs`
- Test: `studio/test/seedance.test.mjs`

**Interfaces:**
- Produces: `buildArgv(job, files)` → `string[]` (pure); `runSeedance({ project, shotId, mode, prompt, duration, resolution='1080p', aspect='16:9', generateAudio=true, useArtist=true, useStyle=false, useAudio=false, driver='auto', log })` → `{ driver:'higgsfield-cli'|'manual', mp4?: string, jobCard: string }`; `detectCli()` → `{ ok:boolean, reason?:string }` (runs `higgsfield model list --json`, treats `No workspace selected`/`not logged in`/ENOENT as not ok).
- Media mapping: `mode==='video_edit'` ⇒ previz passed as `--video-references <previz.mp4>` (the CLI's edit target is the single video reference); `mode==='omni_reference'` ⇒ `--video-references previz.mp4` + artist images as `--image-references` (repeatable) + optional style images (also `--image-references`) + `--audio-references` for audio; `t2v` ⇒ no medias.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { buildArgv, jobCardMarkdown } from '../server/finalize/seedance.mjs';
const files = { previz: 'C:/p/previz.mp4', artist: ['C:/p/a1.png', 'C:/p/a2.png'], style: ['C:/p/s.png'], audio: 'C:/p/track.mp3' };
describe('seedance argv', () => {
  it('video_edit uses previz as the video reference and no images', () => {
    const a = buildArgv({ mode: 'video_edit', prompt: 'neon rain', duration: 5, resolution: '1080p', aspect: '16:9', generateAudio: false, useArtist: true }, files);
    expect(a.slice(0, 3)).toEqual(['generate', 'create', 'seedance_2_5']);
    expect(a).toContain('--mode'); expect(a[a.indexOf('--mode') + 1]).toBe('video_edit');
    expect(a).toContain('--video-references'); expect(a).not.toContain('--image-references');
    expect(a).toContain('--wait'); expect(a).toContain('--json');
  });
  it('omni_reference adds artist + style images and audio', () => {
    const a = buildArgv({ mode: 'omni_reference', prompt: 'p', duration: 8, resolution: '720p', aspect: '9:16', generateAudio: true, useArtist: true, useStyle: true, useAudio: true }, files);
    expect(a.filter((x) => x === '--image-references').length).toBe(3);
    expect(a).toContain('--audio-references'); expect(a[a.indexOf('--aspect_ratio') + 1]).toBe('9:16');
  });
  it('job card lists inputs for manual runs', () => {
    const md = jobCardMarkdown({ mode: 'omni_reference', prompt: 'p', duration: 8, resolution: '720p', aspect: '16:9' }, files);
    expect(md).toContain('seedance_2_5'); expect(md).toContain('previz.mp4'); expect(md).toContain('a1.png');
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing)

- [ ] **Step 3: Implement `studio/server/finalize/seedance.mjs`**

```js
import fs from 'node:fs'; import path from 'node:path'; import { spawn, spawnSync } from 'node:child_process';
import { projectDir } from '../store.mjs';
const BIN = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';

export function buildArgv(job, files) {
  const a = ['generate', 'create', 'seedance_2_5', '--prompt', job.prompt || '', '--mode', job.mode,
    '--resolution', job.resolution || '1080p', '--generate_audio', String(!!job.generateAudio)];
  if (job.mode !== 'video_edit' && job.mode !== 'video_extension') { a.push('--duration', String(job.duration || 5), '--aspect_ratio', job.aspect || '16:9'); }
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
export async function runSeedance({ project, shotId, driver = 'auto', log = () => {}, ...job }) {
  const dir = path.join(projectDir(project.id), 'shots', shotId); fs.mkdirSync(dir, { recursive: true });
  const files = { previz: path.join(dir, 'previz.mp4'), artist: project.refs.artist.map((f) => path.join(projectDir(project.id), 'refs', f)), style: (project.refs.style || []).map((f) => path.join(projectDir(project.id), 'refs', f)), audio: project.refs.audio ? path.join(projectDir(project.id), 'refs', project.refs.audio) : null };
  if (job.mode !== 't2v' && !fs.existsSync(files.previz)) throw new Error('render the previz first');
  const card = path.join(dir, 'seedance-job.md'); fs.writeFileSync(card, jobCardMarkdown(job, files));
  const cli = driver === 'manual' ? { ok: false, reason: 'manual requested' } : detectCli();
  if (!cli.ok) { log('manual mode:', cli.reason); return { driver: 'manual', jobCard: card, reason: cli.reason }; }
  const argv = buildArgv(job, files); log('$ higgsfield', argv.join(' '));
  const out = await new Promise((resolve, reject) => { const p = spawn(BIN, argv, { shell: process.platform === 'win32' }); let s = ''; p.stdout.on('data', (d) => { s += d; log(String(d).trimEnd()); }); p.stderr.on('data', (d) => log(String(d).trimEnd())); p.on('close', (c) => (c === 0 ? resolve(s) : reject(new Error(`higgsfield exited ${c}`)))); });
  const url = (out.match(/https?:\/\/\S+\.mp4\S*/) || [])[0]; if (!url) return { driver: 'higgsfield-cli', jobCard: card, raw: out.slice(-2000) };
  const mp4 = path.join(dir, 'final.mp4'); const buf = Buffer.from(await (await fetch(url)).arrayBuffer()); fs.writeFileSync(mp4, buf); log('saved', mp4);
  return { driver: 'higgsfield-cli', mp4, jobCard: card };
}
```

- [ ] **Step 4: Run** → 3 passed. Manual check: `node -e "import('./server/finalize/seedance.mjs').then(m=>console.log(m.detectCli()))"` prints `{ok:false, reason:...login...}` until the creator logs in.
- [ ] **Step 5: Commit** — `git add studio && git commit -m "feat(studio): Seedance 2.5 finalize driver (higgsfield cli + manual job card)"`

---

