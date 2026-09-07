import { WorldBridge } from './bridge';
import { api } from './api';
import { addKeyAt, removeKey, moveKey, keyFromCamera, mixedModeSegments, type Key } from './timeline';
import { mountJobsPanel, type Ctx } from './jobs';
import { mountPromptPanel } from './prompt';
import { mountPhonePanel } from './phone';
import { mountSettingsPanel } from './settings';
import { checkPath, fixPath, describeRun, type PathReport, type Probe } from './pathcheck';
import { esc } from './dom';
// Plain ESM (no type declarations) shared with the server — see mjs-shim.d.ts.
import { WORLDS, createShot } from '../../schemas/project.mjs';
import { sample, duration } from '../../schemas/keys.mjs';

const WORLD_PORTS: Record<string, number> = { 'union-square-sf': 5173, 'kyoto-higashiyama': 5174 };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const panelLeft = $('#panel-left-main');
const panelRight = $('#panel-keys');
const panelJobs = $('#panel-jobs');
const panelPrompt = $('#panel-prompt');
const panelPhone = $('#panel-phone');
let iframeEl = $<HTMLIFrameElement>('#world');
const viewportControlsEl = $('#viewport-controls');
const scrubEl = $<HTMLInputElement>('#scrub');
const scrubTimeEl = $('#scrub-time');
const livePosEl = $('#live-pos');
const statusEl = $('#status-line');

let projectsCache: any[] = [];

const ctx: Ctx = {
  project: null,
  shot: null,
  bridge: null,
  save: async () => {
    if (!ctx.project) return;
    const saved = await api.save(ctx.project);
    ctx.project = saved;
    ctx.shot = saved.shots.find((s: any) => s.id === ctx.shot?.id) || null;
    ctx.refresh();
  },
  refresh: () => {},
};

function fmtWorldOptions(selected?: string): string {
  return WORLDS.map((w: string) => `<option value="${esc(w)}" ${w === selected ? 'selected' : ''}>${esc(w)}</option>`).join('');
}

// Populates a <select> with one <option> per row via createElement + textContent (rather
// than an innerHTML template string) so a project/shot name can never be interpreted as
// markup, no escaping required.
function fillOptions<T>(sel: HTMLSelectElement, rows: T[], opts: { value: (r: T) => string; label: (r: T) => string; selected?: (r: T) => boolean }) {
  sel.innerHTML = '';
  for (const r of rows) {
    const o = document.createElement('option');
    o.value = opts.value(r);
    o.textContent = opts.label(r);
    if (opts.selected?.(r)) o.selected = true;
    sel.appendChild(o);
  }
}

function renderLeft() {
  panelLeft.innerHTML = `
    <h2><span class="step">1</span>Project</h2>
    <select id="project-select" size="6"></select>
    <details class="new-form" open>
      <summary>New project</summary>
      <input id="np-name" type="text" placeholder="name" />
      <select id="np-world">${fmtWorldOptions()}</select>
      <button id="np-create" type="button">Create</button>
    </details>
    <h2><span class="step">2</span>Shot</h2>
    <select id="shot-select" size="6"></select>
    <details class="new-form" open>
      <summary>New shot</summary>
      <input id="ns-name" type="text" placeholder="name" />
      <label>fps <input id="ns-fps" type="number" value="30" min="1" /></label>
      <label>w <input id="ns-w" type="number" value="1920" min="1" /></label>
      <label>h <input id="ns-h" type="number" value="1080" min="1" /></label>
      <select id="ns-time">
        <option value="day">day</option>
        <option value="sunset" selected>sunset</option>
        <option value="night">night</option>
      </select>
      <button id="ns-create" type="button">Create</button>
    </details>
  `;
  const projectSel = $<HTMLSelectElement>('#project-select');
  fillOptions(projectSel, projectsCache, {
    value: (p: any) => p.id,
    label: (p: any) => `${p.name} (${p.world})`,
    selected: (p: any) => p.id === ctx.project?.id,
  });
  projectSel.addEventListener('change', () => selectProject(projectSel.value));

  $('#np-create').addEventListener('click', async () => {
    const name = $<HTMLInputElement>('#np-name').value.trim();
    const world = $<HTMLSelectElement>('#np-world').value;
    if (!name) return;
    const p = await api.create(name, world);
    projectsCache = await api.projects();
    await selectProject(p.id);
  });

  const shotSel = $<HTMLSelectElement>('#shot-select');
  fillOptions(shotSel, ctx.project?.shots || [], {
    value: (s: any) => s.id,
    label: (s: any) => s.name,
    selected: (s: any) => s.id === ctx.shot?.id,
  });
  shotSel.addEventListener('change', () => selectShot(shotSel.value));

  $('#ns-create').addEventListener('click', async () => {
    if (!ctx.project) return;
    const name = $<HTMLInputElement>('#ns-name').value.trim() || `shot ${ctx.project.shots.length + 1}`;
    const fps = Number($<HTMLInputElement>('#ns-fps').value) || 30;
    const width = Number($<HTMLInputElement>('#ns-w').value) || 1920;
    const height = Number($<HTMLInputElement>('#ns-h').value) || 1080;
    const timeOfDay = $<HTMLSelectElement>('#ns-time').value as 'day' | 'sunset' | 'night';
    const shot = createShot({ name, fps, width, height, timeOfDay });
    ctx.project.shots.push(shot);
    await ctx.save();
    await selectShot(shot.id);
  });
}

// Adjacent keys with different `m` do not interpolate: sample() holds the destination pose
// for the whole segment (schemas/keys.mjs:21-23), an MVP constraint inherited from
// tools/qa/demo_video.mjs and recorded in the spec. Surfacing it here is the difference
// between "the move jumps" and "the tool is broken".
function mixedModeWarning(keys: Key[]): string {
  const at = mixedModeSegments(keys);
  if (!at.length) return '';
  return `<div class="key-warning">air↔walk segments do not interpolate — the camera holds the destination pose for the whole segment (${esc(at.join(', '))}). Split the move with a matching-mode key if you want a smooth transition.</div>`;
}

function renderRight() {
  const keys: Key[] = ctx.shot?.keys || [];
  panelRight.innerHTML = `
    <h2><span class="step">3</span>Camera keys</h2>
    <div class="new-key-row">
      <select id="nk-mode">
        <option value="air">air</option>
        <option value="walk">walk</option>
      </select>
      <input id="nk-cap" type="text" placeholder="caption" />
      <label><input id="nk-cut" type="checkbox" /> cut</label>
      <label>t <input id="nk-t" type="number" step="0.1" min="0" value="${esc(Number(scrubEl.value) || 0)}" /></label>
      <button id="nk-add" type="button" ${ctx.shot && ctx.bridge ? '' : 'disabled'}>Add key @ t</button>
    </div>
    <table class="key-table">
      <thead><tr><th>t</th><th>m</th><th>cap</th><th>cut</th><th>time</th><th></th></tr></thead>
      <tbody>
        ${keys.map((k, i) => `
          <tr data-i="${i}">
            <td><input class="k-t" type="number" step="0.1" value="${esc(k.t)}" /></td>
            <td>${esc(k.m)}</td>
            <td><input class="k-cap" type="text" value="${esc(k.cap || '')}" /></td>
            <td><input class="k-cut" type="checkbox" ${k.cut ? 'checked' : ''} /></td>
            <td>
              <select class="k-time">
                <option value="" ${!k.time ? 'selected' : ''}>-</option>
                <option value="day" ${k.time === 'day' ? 'selected' : ''}>day</option>
                <option value="sunset" ${k.time === 'sunset' ? 'selected' : ''}>sunset</option>
                <option value="night" ${k.time === 'night' ? 'selected' : ''}>night</option>
              </select>
            </td>
            <td><button class="k-del" type="button">Delete</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${mixedModeWarning(keys)}
  `;

  $('#nk-add').addEventListener('click', async () => {
    if (!ctx.bridge || !ctx.shot) return;
    // Read from the dedicated "t" field, not the playback scrubber: the scrubber's `max`
    // is bounded by the shot's current duration, so it cannot reach a time beyond the
    // last existing key — exactly the time a new trailing key needs to be added at.
    const t = Number($<HTMLInputElement>('#nk-t').value) || 0;
    const mode = $<HTMLSelectElement>('#nk-mode').value as 'air' | 'walk';
    const cap = $<HTMLInputElement>('#nk-cap').value.trim() || undefined;
    const cut = $<HTMLInputElement>('#nk-cut').checked || undefined;
    const pos = await ctx.bridge.call('pos');
    const key = keyFromCamera(pos, { t, m: mode, cap, cut });
    ctx.shot.keys = addKeyAt(ctx.shot.keys, t, key);
    await ctx.save();
  });

  panelRight.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector<HTMLInputElement>('.k-t')!.addEventListener('change', async (e) => {
      ctx.shot.keys = moveKey(ctx.shot.keys, i, Number((e.target as HTMLInputElement).value));
      await ctx.save();
    });
    row.querySelector<HTMLInputElement>('.k-cap')!.addEventListener('change', async (e) => {
      ctx.shot.keys[i] = { ...ctx.shot.keys[i], cap: (e.target as HTMLInputElement).value };
      await ctx.save();
    });
    row.querySelector<HTMLInputElement>('.k-cut')!.addEventListener('change', async (e) => {
      ctx.shot.keys[i] = { ...ctx.shot.keys[i], cut: (e.target as HTMLInputElement).checked };
      await ctx.save();
    });
    row.querySelector<HTMLSelectElement>('.k-time')!.addEventListener('change', async (e) => {
      const v = (e.target as HTMLSelectElement).value;
      ctx.shot.keys[i] = { ...ctx.shot.keys[i], time: v || undefined };
      await ctx.save();
    });
    row.querySelector<HTMLButtonElement>('.k-del')!.addEventListener('click', async () => {
      ctx.shot.keys = removeKey(ctx.shot.keys, i);
      await ctx.save();
    });
  });
}

// --- Unlock controls -------------------------------------------------------------------
// Under `?studio=1` a world switches its own camera controllers off, so the bridged camera
// is never fought — which also means there is no way to *author* a pose by hand. This
// toggle hands the camera back: `setMode` in union-square-sf/src/main.ts:68-77 enables
// exactly one controller ('walk' -> WalkControls, 'orbit' -> OrbitMode) and disables the
// other, and any other mode string disables BOTH — which is what re-locking needs, since
// there is no dedicated "off" mode and `?studio=1`'s own lock is applied once at startup.
// (Divergence from the review ruling's literal "setMode back to 'orbit'": that would leave
// OrbitMode enabled and still fighting the scrubber.)
// kyoto-higashiyama's adapter has no camera modes at all — `setMode()` there is a documented
// no-op — so the button reads "n/a" for that world.
const MODE_LOCKED = 'none';
let unlocked = false;
let unlockMode: 'walk' | 'orbit' = 'walk';

const worldSupportsModes = () => ctx.project?.world === 'union-square-sf';

function renderViewportControls() {
  const supported = worldSupportsModes();
  const enabled = !!ctx.bridge && supported;
  viewportControlsEl.innerHTML = `
    <button id="vc-unlock" type="button" ${enabled ? '' : 'disabled'}>${unlocked ? 'Lock controls' : 'Unlock controls'}</button>
    <select id="vc-mode" ${enabled ? '' : 'disabled'}>
      <option value="walk" ${unlockMode === 'walk' ? 'selected' : ''}>walk</option>
      <option value="orbit" ${unlockMode === 'orbit' ? 'selected' : ''}>orbit</option>
    </select>
    <span class="vc-note">${supported
      ? (unlocked
        ? 'flying by hand — drag in the viewport; “Add key @ t” captures the live pose'
        : 'camera locked to the timeline')
      : 'n/a — this world has no camera modes'}</span>
    <span class="vc-spacer"></span>
    <button id="vc-check" type="button" ${ctx.bridge && (ctx.shot?.keys?.length || 0) > 0 && !pathBusy ? '' : 'disabled'}>Check path</button>
    <button id="vc-fix" type="button" ${ctx.bridge && (ctx.shot?.keys?.length || 0) > 1 && !pathBusy && pathReport && !pathReport.clear ? '' : 'disabled'}>Fix path</button>
  `;
  $('#vc-unlock').addEventListener('click', () => setUnlocked(!unlocked));
  $('#vc-check').addEventListener('click', () => runPathCheck());
  $('#vc-fix').addEventListener('click', () => runPathFix());
  $<HTMLSelectElement>('#vc-mode').addEventListener('change', (e) => {
    unlockMode = (e.target as HTMLSelectElement).value as 'walk' | 'orbit';
    if (unlocked) setUnlocked(true); // re-apply straight away
  });
}

// ---------------------------------------------------------------- path collision check
// The world answers `probePath` (downward ray per camera point); we sample the shot at 10 Hz,
// paint blocked stretches as red bands under the scrubber, and "Fix path" lifts blocked air
// segments over what they hit. Runs automatically (debounced) whenever the keys change.
let pathReport: PathReport | null = null;
let pathBusy = false;
let pathTimer: number | null = null;
let pathSeq = 0;
const pathBandsEl = document.getElementById('scrub-bands') as HTMLElement;
const pathStatusEl = document.getElementById('path-status') as HTMLElement;

const probeViaBridge: Probe = async (points) => {
  if (!ctx.bridge) throw new Error('no bridge');
  return ctx.bridge.call('probePath', { points, clearance: 1.0 });
};

function renderPathStatus() {
  const keys: Key[] = ctx.shot?.keys || [];
  const d = duration(keys) || 0;
  pathBandsEl.innerHTML = '';
  if (!pathReport || d <= 0) { pathStatusEl.textContent = pathBusy ? 'checking path…' : ''; pathStatusEl.className = ''; return; }
  for (const r of pathReport.runs) {
    const band = document.createElement('div');
    band.className = 'scrub-band';
    band.style.left = `${(r.t0 / d) * 100}%`;
    band.style.width = `${Math.max(0.6, ((r.t1 - r.t0) / d) * 100)}%`;
    band.title = describeRun(r, keys);
    pathBandsEl.appendChild(band);
  }
  if (pathReport.clear) { pathStatusEl.textContent = pathBusy ? 'checking path…' : 'path clear — no collisions'; pathStatusEl.className = 'path-ok'; return; }
  const lines = pathReport.runs.map((r) => describeRun(r, keys));
  pathStatusEl.innerHTML = `<b>${esc(pathReport.runs.length)} collision${pathReport.runs.length > 1 ? 's' : ''}</b> (${esc(pathReport.blockedSeconds)} s): ${esc(lines.join(' · '))}`
    + (pathReport.unfixable?.length ? ` — ${esc(pathReport.unfixable.length)} need a manual move (walk segment or a key inside a structure)` : '');
  pathStatusEl.className = 'path-bad';
}

async function runPathCheck() {
  const keys: Key[] = ctx.shot?.keys || [];
  if (!ctx.bridge || keys.length < 1) { pathReport = null; renderPathStatus(); return; }
  const seq = ++pathSeq;
  pathBusy = true; renderPathStatus();
  try {
    const report = await checkPath(keys, probeViaBridge);
    if (seq !== pathSeq) return; // superseded by a newer edit
    pathReport = report;
  } catch (e: any) {
    if (seq !== pathSeq) return;
    pathReport = null;
    pathStatusEl.textContent = `path check failed: ${String(e?.message || e)}`;
  } finally {
    if (seq === pathSeq) { pathBusy = false; renderPathStatus(); renderViewportControls(); }
  }
}

function schedulePathCheck(delayMs = 600) {
  if (pathTimer !== null) window.clearTimeout(pathTimer);
  pathTimer = window.setTimeout(() => { pathTimer = null; runPathCheck(); }, delayMs);
}

async function runPathFix() {
  const keys: Key[] = ctx.shot?.keys || [];
  if (!ctx.bridge || !ctx.shot || keys.length < 2) return;
  pathBusy = true; renderPathStatus(); renderViewportControls();
  try {
    const { keys: fixed, report } = await fixPath(keys, probeViaBridge, { margin: 12, rounds: 4 });
    ctx.shot.keys = fixed;
    pathReport = report;
    await ctx.save();
    renderRight(); updateScrubber();
    const n = report.fixedKeys || 0, g = report.groundedKeys || 0;
    const parts = [];
    if (g) parts.push(`${g} key${g > 1 ? 's' : ''} raised to street level`);
    if (n) parts.push(`${n} key${n > 1 ? 's' : ''} inserted to fly over structures`);
    statusEl.textContent = parts.length ? `path fixed — ${parts.join(', ')}` : report.clear ? 'path already clear' : 'could not fix automatically — see the collision list';
  } catch (e: any) {
    statusEl.textContent = `path fix failed: ${String(e?.message || e)}`;
  } finally {
    pathBusy = false; renderPathStatus(); renderViewportControls();
  }
}
ctx.checkPath = runPathCheck;
ctx.fixPath = runPathFix;

async function setUnlocked(on: boolean) {
  if (!ctx.bridge) return;
  unlocked = on;
  const m = on ? unlockMode : MODE_LOCKED;
  try { await ctx.bridge.call('setMode', { m }); } catch { /* world may not implement modes */ }
  renderViewportControls();
}

function updateScrubber() {
  const keys: Key[] = ctx.shot?.keys || [];
  const d = duration(keys);
  scrubEl.max = String(Math.max(d, 0));
  scrubEl.step = String(1 / (ctx.shot?.fps || 30));
  scrubEl.disabled = !ctx.shot || keys.length === 0;
  if (Number(scrubEl.value) > d) scrubEl.value = String(d);
  scrubTimeEl.textContent = `${Number(scrubEl.value).toFixed(2)}s`;
  // Keys changed (this runs from every refresh): re-check the path against the world.
  schedulePathCheck();
}

scrubEl.addEventListener('input', () => {
  scrubTimeEl.textContent = `${Number(scrubEl.value).toFixed(2)}s`;
  const keys: Key[] = ctx.shot?.keys || [];
  if (!ctx.bridge || keys.length === 0) return;
  const t = Number(scrubEl.value);
  const s = sample(keys, t, ctx.shot.fps);
  // Walk keys only carry ground-plane pos [x,z]; the ground height (foot placement) comes
  // from the previz renderer's terrain/collision query, not from this UI, so we just lift
  // the eye to a fixed eye-height above y=0 here (per controller ruling — no terrain guess).
  const eye = s.air ? s.eye : [s.pos[0], 1.7, s.pos[1]];
  ctx.bridge.call('setCameraRaw', { eye, look: s.look, fov: s.fov }).catch(() => {});
});

// Disposes the current bridge (removing its window listeners and ping-poll timer) before
// discarding it, so switching shots/projects repeatedly doesn't leak listeners or leave a
// stale bridge whose request ids (both instances number from `c1`) could collide with a
// freshly constructed one.
function disposeBridge() {
  ctx.bridge?.dispose();
  ctx.bridge = null;
}

function mountWorldForShot(shot: any) {
  disposeBridge();
  unlocked = false; // a fresh iframe means a fresh world, which starts with both controllers off
  const world = ctx.project.world;
  const port = WORLD_PORTS[world];
  const fresh = document.createElement('iframe');
  fresh.id = 'world';
  fresh.title = 'world preview';
  iframeEl.replaceWith(fresh);
  iframeEl = fresh;
  if (!port) {
    statusEl.textContent = `world "${world}" has no dev server mapped yet`;
    return;
  }
  // Bridge is constructed BEFORE the iframe src is assigned so its message listeners are
  // attached before the world could possibly post `studio:ready`.
  const bridge = new WorldBridge(iframeEl);
  ctx.bridge = bridge;
  bridge.onPos((p) => { livePosEl.textContent = `eye (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`; });
  statusEl.textContent = `loading ${world}…`;
  iframeEl.src = `http://localhost:${port}/?qa=1&ui=0&studio=1&life=0&time=${shot.timeOfDay}`;
  // Liveness probe: an opaque no-cors fetch resolves if anything answers on the port and
  // rejects on connection refused, so a world whose dev server is not running gets a clear
  // message instead of a silent "loading…" forever.
  fetch(`http://localhost:${port}/`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {
    if (ctx.bridge !== bridge) return;
    statusEl.textContent = `${world} dev server is not running on :${port} — start it with "npm run up:all" (or npx vite --port ${port} --strictPort in ${world}/)`;
  });
  bridge.ready.then(() => {
    if (ctx.bridge !== bridge) return; // superseded by a later shot switch
    statusEl.textContent = 'world ready';
    renderRight();
    renderViewportControls();
    schedulePathCheck(100);
    (window as any).__studio = { bridge, ctx };
  });
}

// Phone panel is (re)mounted per project, since its WS `join` message and QR URL are keyed
// to the project id; the bridge it drives is looked up on ctx at call time (via this proxy)
// so switching shots — which discards and rebuilds ctx.bridge — needs no remount.
const bridgeProxy = { call: (cmd: string, p?: any) => (ctx.bridge ? ctx.bridge.call(cmd, p) : Promise.reject(new Error('no bridge'))) };
let phoneApi: { dispose(): void } | null = null;
function mountPhoneForProject(projectId: string) {
  phoneApi?.dispose();
  phoneApi = mountPhonePanel(panelPhone, {
    projectId,
    bridge: bridgeProxy,
    onRecorded: async (keys) => {
      if (!ctx.shot) return;
      ctx.shot.keys = keys;
      await ctx.save();
      ctx.refresh();
    },
  });
}

async function selectProject(id: string) {
  const p = await api.get(id);
  ctx.project = p;
  ctx.shot = null;
  disposeBridge();
  statusEl.textContent = '';
  renderAll();
  mountPhoneForProject(p.id);
  if (p.shots.length) await selectShot(p.shots[0].id);
  else {
    // No shot yet: blank the viewport so the previous project's world does not linger and
    // look like this project's.
    iframeEl.src = 'about:blank';
    pathReport = null; renderPathStatus();
    statusEl.textContent = `${p.world} — create a shot to load the world`;
  }
}

async function selectShot(id: string) {
  ctx.shot = ctx.project.shots.find((s: any) => s.id === id) || null;
  if (ctx.shot) mountWorldForShot(ctx.shot);
  renderAll();
}

const jobsPanel = mountJobsPanel(panelJobs, ctx);
const promptPanel = mountPromptPanel(panelPrompt, ctx);
mountSettingsPanel(document.getElementById('panel-settings') as HTMLElement);

function renderAll() {
  renderLeft();
  renderRight();
  renderViewportControls();
  updateScrubber();
  jobsPanel.refresh();
  promptPanel.refresh();
}
ctx.refresh = renderAll;

async function init() {
  projectsCache = await api.projects();
  renderAll();
  if (projectsCache.length) await selectProject(projectsCache[0].id);
}
init();
