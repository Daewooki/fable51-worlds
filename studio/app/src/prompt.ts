// The "prompt -> path" panel: a textarea + duration + provider select + Generate button that
// POSTs to /api/projects/:id/prompt and replaces the current shot's keys with the result.
import { esc } from './dom';
import { duration as keysDuration } from '../../schemas/keys.mjs';
import type { Ctx } from './jobs';
import { CONFIG_EVENT, fetchConfig, type StudioConfig } from './settings';

export function mountPromptPanel(el: HTMLElement, ctx: Ctx): { refresh: () => void } {
  el.innerHTML = `
    <h2>Prompt → path</h2>
    <textarea id="pp-prompt" rows="3" placeholder="describe the camera move…"></textarea>
    <div class="new-key-row">
      <label>duration <input id="pp-duration" type="number" min="1" step="0.5" value="10" /></label>
      <label>provider
        <select id="pp-provider">
          <option value="none">none (anchors only)</option>
          <option value="anthropic">anthropic</option>
          <option value="openai">openai</option>
        </select>
      </label>
      <button id="pp-generate" type="button">Generate</button>
    </div>
    <div id="pp-error" class="job-error"></div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const promptEl = $<HTMLTextAreaElement>('#pp-prompt');
  const durationEl = $<HTMLInputElement>('#pp-duration');
  const providerEl = $<HTMLSelectElement>('#pp-provider');
  const errorEl = $<HTMLDivElement>('#pp-error');
  const generateBtn = $<HTMLButtonElement>('#pp-generate');

  function currentDuration(): number {
    const keys = ctx.shot?.keys || [];
    return keys.length ? keysDuration(keys) || 10 : 10;
  }

  // Provider list follows the keys the server can see (env or the Settings panel's file):
  // providers without a key are shown but disabled, and the default is the server's pick
  // (STUDIO_LLM if pinned, else the first provider with a key, else `none`).
  function applyConfig(cfg: StudioConfig | null) {
    if (!cfg) return;
    const prev = providerEl.value;
    for (const opt of Array.from(providerEl.options)) {
      const ok = opt.value === 'none' || !!cfg.providers?.[opt.value];
      opt.disabled = !ok;
      opt.textContent = opt.value === 'none' ? 'none (anchors only)' : `${opt.value}${ok ? '' : ' (no key — see Settings)'}`;
    }
    const want = prev !== 'none' && cfg.providers?.[prev] ? prev : cfg.provider;
    providerEl.value = ['none', 'anthropic', 'openai'].includes(want) && (want === 'none' || cfg.providers?.[want]) ? want : 'none';
  }
  window.addEventListener(CONFIG_EVENT, (e) => applyConfig((e as CustomEvent<StudioConfig>).detail));
  fetchConfig().then(applyConfig);

  generateBtn.addEventListener('click', async () => {
    if (!ctx.project || !ctx.shot) { errorEl.textContent = 'select a project and shot first'; return; }
    errorEl.textContent = '';
    generateBtn.disabled = true;
    try {
      const res = await fetch(`/api/projects/${ctx.project.id}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: promptEl.value,
          durationSec: Number(durationEl.value) || 10,
          provider: providerEl.value,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
      ctx.shot.keys = body.keys;
      await ctx.save();
      ctx.refresh();
    } catch (e: any) {
      errorEl.innerHTML = esc(String(e?.message || e));
    } finally {
      generateBtn.disabled = false;
    }
  });

  return {
    refresh: () => {
      if (!durationEl.matches(':focus')) durationEl.value = String(currentDuration());
    },
  };
}
