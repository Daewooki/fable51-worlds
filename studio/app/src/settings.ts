// Settings panel: per-machine API keys (Anthropic / OpenAI / VARCO) and the Higgsfield CLI
// login status. Keys are stored by the studio server on this PC (`studio/.secrets.json`);
// an environment variable of the same name always wins and is shown as read-only. The
// server never returns a key in full — only `set`, `source` and a masked tail.
import { esc } from './dom';

type KeyInfo = { set: boolean; source: 'env' | 'file' | 'none'; masked: string };
export type StudioConfig = {
  provider: string;
  hasKey: boolean;
  providers: Record<string, boolean>;
  keys: Record<string, KeyInfo>;
  higgsfield: { ok: boolean; reason?: string };
  canEditKeys: boolean;
  phoneToken: string;
};

const KEYS: { name: string; label: string; hint: string }[] = [
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic', hint: 'prompt → path (claude-sonnet-5)' },
  { name: 'OPENAI_API_KEY', label: 'OpenAI', hint: 'prompt → path (gpt-4o-mini)' },
  { name: 'VARCO_API_KEY', label: 'VARCO 3D', hint: 'tools/varco_fetch.mjs image-to-3D' },
];

// Other panels (prompt → path) listen for this to refresh their provider list.
export const CONFIG_EVENT = 'studio:config';
export async function fetchConfig(): Promise<StudioConfig | null> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return null;
    const cfg = (await res.json()) as StudioConfig;
    window.dispatchEvent(new CustomEvent(CONFIG_EVENT, { detail: cfg }));
    return cfg;
  } catch {
    return null;
  }
}

export function mountSettingsPanel(el: HTMLElement): { refresh: () => Promise<void> } {
  let open = false;
  let cfg: StudioConfig | null = null;

  function render() {
    const rows = KEYS.map((k) => {
      const info = cfg?.keys?.[k.name] ?? { set: false, source: 'none', masked: '' };
      const badge = info.source === 'env' ? '<span class="badge badge-env">env</span>'
        : info.source === 'file' ? '<span class="badge badge-file">saved</span>'
        : '<span class="badge badge-none">not set</span>';
      const editable = !!cfg?.canEditKeys && info.source !== 'env';
      return `
        <div class="settings-row" data-key="${esc(k.name)}">
          <div class="settings-label"><b>${esc(k.label)}</b> ${badge}<div class="settings-hint">${esc(k.hint)}${info.set ? ` · ${esc(info.masked)}` : ''}</div></div>
          <input type="password" autocomplete="off" spellcheck="false" placeholder="${info.source === 'env' ? 'set by environment variable' : `paste ${esc(k.name)}`}" ${editable ? '' : 'disabled'} />
          <button type="button" data-act="save" ${editable ? '' : 'disabled'}>Save</button>
          <button type="button" data-act="clear" ${editable && info.source === 'file' ? '' : 'disabled'}>Clear</button>
        </div>`;
    }).join('');
    const hf = cfg?.higgsfield;
    const hfLine = hf?.ok
      ? '<span class="badge badge-file">logged in</span> Finalize runs Seedance through the CLI.'
      : `<span class="badge badge-none">not ready</span> ${esc(hf?.reason || 'checking…')}<div class="settings-hint">Finalize writes a job card until then. In a terminal: <code>npm i -g @higgsfield/cli</code> · <code>higgsfield auth login</code> · <code>higgsfield workspace set &lt;id&gt;</code></div>`;
    const lanNote = cfg && !cfg.canEditKeys ? '<div class="settings-hint">Keys can only be edited from the PC running the studio server (open the Director on localhost).</div>' : '';
    el.innerHTML = `
      <h2 class="settings-toggle" role="button" tabindex="0">Settings <span class="settings-caret">${open ? '▾' : '▸'}</span>
        <span class="settings-summary">${esc(summary())}</span></h2>
      <div class="settings-body" ${open ? '' : 'hidden'}>
        ${rows}
        <div class="settings-row settings-hf"><div class="settings-label"><b>Higgsfield / Seedance</b></div><div class="settings-hf-status">${hfLine}</div></div>
        ${lanNote}
        <div class="settings-hint">Stored in <code>studio/.secrets.json</code> on this PC only (never committed, never sent to the browser). An environment variable of the same name takes precedence.</div>
        <div id="settings-error" class="job-error"></div>
      </div>`;

    el.querySelector('.settings-toggle')!.addEventListener('click', () => { open = !open; render(); });
    el.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest<HTMLElement>('.settings-row')!;
        const name = row.dataset.key!;
        const input = row.querySelector<HTMLInputElement>('input')!;
        const errEl = el.querySelector<HTMLElement>('#settings-error')!;
        errEl.textContent = '';
        try {
          const res = btn.dataset.act === 'clear'
            ? await fetch(`/api/settings/${encodeURIComponent(name)}`, { method: 'DELETE' })
            : await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [name]: input.value }) });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
          input.value = '';
          await refresh();
        } catch (e: any) {
          errEl.innerHTML = esc(String(e?.message || e));
        }
      });
    });
  }

  function summary(): string {
    if (!cfg) return '';
    const set = KEYS.filter((k) => cfg!.keys?.[k.name]?.set).map((k) => k.label);
    const hf = cfg.higgsfield?.ok ? 'Higgsfield ✓' : 'Higgsfield ✗';
    return `${set.length ? set.join(', ') : 'no API keys'} · ${hf} · prompt provider: ${cfg.provider}`;
  }

  async function refresh() {
    cfg = await fetchConfig();
    render();
  }

  render();
  refresh();
  return { refresh };
}
