// The bottom "jobs" panel: render previz / export / finalize (Seedance) buttons, the
// finalize form, refs editor, and a live-updating list of jobs with log tail + artifact
// links. Kept as its own module (mountJobsPanel(el, ctx)) so Task 11 can mount further
// panels into the same shell without touching this one.
import { api } from './api';
import type { WorldBridge } from './bridge';

export type Ctx = {
  project: any;
  shot: any;
  bridge: WorldBridge | null;
  save: () => Promise<void>;
  refresh: () => void;
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fileUrl = (projectId: string, rel: string) => `/files/${projectId}/${rel}`;

async function logTail(projectId: string, jobId: string, n = 20): Promise<string> {
  try {
    const res = await fetch(fileUrl(projectId, `jobs/${jobId}.log`));
    if (!res.ok) return '';
    const text = await res.text();
    return text.split('\n').filter((l) => l.length).slice(-n).join('\n');
  } catch { return ''; }
}

function artifactsHtml(job: any, projectId: string): string {
  const shotId = job.input?.shotId;
  if (job.status !== 'done') return '';
  if (job.type === 'previz') {
    const src = fileUrl(projectId, `shots/${shotId}/previz.mp4`);
    return `<video controls src="${src}" data-role="previz-video"></video>`;
  }
  if (job.type === 'export') {
    const sid = shotId;
    const glb = fileUrl(projectId, `export/scene.glb`);
    const keys = fileUrl(projectId, `export/${sid}.keys.json`);
    const blend = fileUrl(projectId, `export/blender_import.py`);
    return `<div class="artifact-links">
      <a href="${glb}" target="_blank" rel="noopener">scene.glb</a>
      <a href="${keys}" target="_blank" rel="noopener">${esc(sid)}.keys.json</a>
      <a href="${blend}" target="_blank" rel="noopener">blender_import.py</a>
    </div>`;
  }
  if (job.type === 'finalize') {
    const a = job.artifacts || {};
    if (a.mp4) {
      const src = fileUrl(projectId, `shots/${shotId}/final.mp4`);
      return `<video controls src="${src}" data-role="final-video"></video>`;
    }
    const cardUrl = fileUrl(projectId, `shots/${shotId}/seedance-job.md`);
    const reason = a.reason ? `<div class="job-reason">${esc(a.reason)}</div>` : '';
    return `<div class="artifact-links"><a href="${cardUrl}" target="_blank" rel="noopener">seedance-job.md</a></div>${reason}`;
  }
  return '';
}

export function mountJobsPanel(el: HTMLElement, ctx: Ctx): { refresh: () => void } {
  el.innerHTML = `
    <div class="jobs-actions">
      <button id="job-previz" type="button">Render previz</button>
      <button id="job-export" type="button">Export</button>
    </div>
    <details class="finalize-form" open>
      <summary>Finalize (Seedance)</summary>
      <div class="finalize-grid">
        <label>Mode
          <select id="fz-mode">
            <option value="t2v">t2v</option>
            <option value="omni_reference">omni_reference</option>
            <option value="video_edit" selected>video_edit</option>
            <option value="video_extension">video_extension</option>
          </select>
        </label>
        <label>Duration
          <input id="fz-duration" type="number" min="4" max="30" value="5" disabled>
        </label>
        <label>Resolution
          <select id="fz-resolution">
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p" selected>1080p</option>
          </select>
        </label>
        <label>Aspect
          <select id="fz-aspect" disabled>
            <option value="16:9" selected>16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="auto">auto</option>
          </select>
        </label>
        <label>Driver
          <select id="fz-driver">
            <option value="auto" selected>auto</option>
            <option value="manual">manual</option>
          </select>
        </label>
        <label class="full">Prompt
          <textarea id="fz-prompt" rows="2"></textarea>
        </label>
        <label class="check"><input type="checkbox" id="fz-artist" checked> use artist refs</label>
        <label class="check"><input type="checkbox" id="fz-style"> use style refs</label>
        <label class="check"><input type="checkbox" id="fz-audio"> use audio ref</label>
        <label class="check"><input type="checkbox" id="fz-genaudio" checked> generate audio</label>
        <label class="full">Artist refs (one filename per line, in projects/&lt;id&gt;/refs/)
          <textarea id="fz-refs-artist" rows="2"></textarea>
        </label>
        <label class="full">Style refs (one filename per line)
          <textarea id="fz-refs-style" rows="2"></textarea>
        </label>
        <label class="full">Audio ref (single filename)
          <input id="fz-refs-audio" type="text">
        </label>
        <div class="full finalize-buttons">
          <button id="fz-save-refs" type="button">Save refs</button>
          <button id="job-finalize" type="button">Finalize</button>
        </div>
      </div>
    </details>
    <div id="jobs-list" class="jobs-list"></div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const modeSel = $<HTMLSelectElement>('#fz-mode');
  const durationInput = $<HTMLInputElement>('#fz-duration');
  const aspectSel = $<HTMLSelectElement>('#fz-aspect');
  const refsArtist = $<HTMLTextAreaElement>('#fz-refs-artist');
  const refsStyle = $<HTMLTextAreaElement>('#fz-refs-style');
  const refsAudio = $<HTMLInputElement>('#fz-refs-audio');
  const jobsListEl = $<HTMLDivElement>('#jobs-list');

  const applyModeRules = () => {
    const m = modeSel.value;
    durationInput.disabled = m === 'video_edit';
    aspectSel.disabled = m === 'video_edit' || m === 'video_extension';
  };
  modeSel.addEventListener('change', applyModeRules);
  applyModeRules();

  const renderRefs = () => {
    const refs = ctx.project?.refs || {};
    refsArtist.value = (refs.artist || []).join('\n');
    refsStyle.value = (refs.style || []).join('\n');
    refsAudio.value = refs.audio || '';
  };
  renderRefs();

  $('#fz-save-refs').addEventListener('click', async () => {
    ctx.project.refs = ctx.project.refs || {};
    ctx.project.refs.artist = refsArtist.value.split('\n').map((s) => s.trim()).filter(Boolean);
    ctx.project.refs.style = refsStyle.value.split('\n').map((s) => s.trim()).filter(Boolean);
    ctx.project.refs.audio = refsAudio.value.trim() || undefined;
    await ctx.save();
  });

  // job.id -> live job record (as last seen from the server)
  const jobs = new Map<string, any>();

  function renderJobs() {
    const projectId = ctx.project?.id;
    const rows = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    jobsListEl.innerHTML = rows.map((job) => {
      const pct = typeof job.progress === 'number' ? `${Math.round(job.progress * 100)}%` : '';
      const err = job.status === 'failed' ? `<div class="job-error">${esc(job.error)}</div>` : '';
      return `<div class="job-card" data-job="${job.id}">
        <div class="job-head"><b>${esc(job.type)}</b> <span class="job-status status-${esc(job.status)}">${esc(job.status)}</span> <span class="job-pct">${pct}</span></div>
        <pre class="job-log">${esc(job._log || '')}</pre>
        ${err}
        <div class="job-artifacts">${projectId ? artifactsHtml(job, projectId) : ''}</div>
      </div>`;
    }).join('') || '<div class="jobs-empty">No jobs yet.</div>';
  }

  async function trackJob(job: any) {
    jobs.set(job.id, job);
    renderJobs();
    const projectId = ctx.project.id;
    await api.pollJob(job.id, async (updated: any) => {
      jobs.set(updated.id, updated);
      updated._log = await logTail(projectId, updated.id);
      renderJobs();
    });
  }

  async function startJob(input: any) {
    if (!ctx.shot) { alert('select a shot first'); return; }
    await ctx.save();
    const job = await api.job(ctx.project.id, input);
    trackJob(job);
  }

  $('#job-previz').addEventListener('click', () => startJob({ type: 'previz', shotId: ctx.shot?.id }));
  $('#job-export').addEventListener('click', () => startJob({ type: 'export', shotId: ctx.shot?.id }));
  $('#job-finalize').addEventListener('click', () => {
    startJob({
      type: 'finalize',
      shotId: ctx.shot?.id,
      mode: modeSel.value,
      prompt: $<HTMLTextAreaElement>('#fz-prompt').value,
      duration: Number(durationInput.value) || 5,
      resolution: $<HTMLSelectElement>('#fz-resolution').value,
      aspect: aspectSel.value,
      useArtist: $<HTMLInputElement>('#fz-artist').checked,
      useStyle: $<HTMLInputElement>('#fz-style').checked,
      useAudio: $<HTMLInputElement>('#fz-audio').checked,
      generateAudio: $<HTMLInputElement>('#fz-genaudio').checked,
      driver: $<HTMLSelectElement>('#fz-driver').value,
    });
  });

  renderJobs();
  return { refresh: () => { renderRefs(); renderJobs(); } };
}
