import { WorldBridge } from './bridge';
import { api } from './api';
import { addKeyAt, removeKey, moveKey, keyFromCamera, type Key } from './timeline';
import { mountJobsPanel, type Ctx } from './jobs';
import { mountPromptPanel } from './prompt';
import { mountPhonePanel } from './phone';
import { esc } from './dom';
// Plain ESM (no type declarations) shared with the server — see mjs-shim.d.ts.
import { WORLDS, createShot } from '../../schemas/project.mjs';
import { sample, duration } from '../../schemas/keys.mjs';

const WORLD_PORTS: Record<string, number> = { 'union-square-sf': 5173, 'kyoto-higashiyama': 5174 };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const panelLeft = $('#panel-left');
const panelRight = $('#panel-right');
const panelJobs = $('#panel-jobs');
const panelPrompt = $('#panel-prompt');
const panelPhone = $('#panel-phone');
let iframeEl = $<HTMLIFrameElement>('#world');
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
    <h2>Projects</h2>
    <select id="project-select" size="6"></select>
    <details class="new-form" open>
      <summary>New project</summary>
      <input id="np-name" type="text" placeholder="name" />
      <select id="np-world">${fmtWorldOptions()}</select>
      <button id="np-create" type="button">Create</button>
    </details>
    <h2>Shots</h2>
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

function renderRight() {
  const keys: Key[] = ctx.shot?.keys || [];
  panelRight.innerHTML = `
    <h2>Keyframes</h2>
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

function updateScrubber() {
  const keys: Key[] = ctx.shot?.keys || [];
  const d = duration(keys);
  scrubEl.max = String(Math.max(d, 0));
  scrubEl.step = String(1 / (ctx.shot?.fps || 30));
  scrubEl.disabled = !ctx.shot || keys.length === 0;
  if (Number(scrubEl.value) > d) scrubEl.value = String(d);
  scrubTimeEl.textContent = `${Number(scrubEl.value).toFixed(2)}s`;
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
  statusEl.textContent = 'loading world…';
  iframeEl.src = `http://localhost:${port}/?qa=1&ui=0&studio=1&life=0&time=${shot.timeOfDay}`;
  bridge.ready.then(() => {
    if (ctx.bridge !== bridge) return; // superseded by a later shot switch
    statusEl.textContent = 'world ready';
    renderRight();
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
}

async function selectShot(id: string) {
  ctx.shot = ctx.project.shots.find((s: any) => s.id === id) || null;
  if (ctx.shot) mountWorldForShot(ctx.shot);
  renderAll();
}

const jobsPanel = mountJobsPanel(panelJobs, ctx);
const promptPanel = mountPromptPanel(panelPrompt, ctx);

function renderAll() {
  renderLeft();
  renderRight();
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
