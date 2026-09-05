// Wraps the Task 3 postMessage protocol (studio:cmd / studio:res / studio:ready / studio:pos)
// with request ids and a timeout. Construct BEFORE assigning the iframe `src` so the
// `message` listeners are attached before the world can possibly post anything.
export class WorldBridge {
  private seq = 0;
  private pending = new Map<string, { res: (v: any) => void; rej: (e: any) => void }>();
  private posCbs: ((p: any) => void)[] = [];
  private mainHandler: (e: MessageEvent) => void;
  private readyHandler: ((e: MessageEvent) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  ready: Promise<void>;
  constructor(private iframe: HTMLIFrameElement) {
    // Ruling: resolve `ready` on EITHER the one-shot `studio:ready` message OR the first
    // successful `ping` round-trip (polled every 1s). This covers the case where the iframe
    // finishes loading (and sends studio:ready) before this listener is attached.
    this.ready = new Promise((res) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        if (this.pollTimer !== null) { clearInterval(this.pollTimer); this.pollTimer = null; }
        // The one-shot studio:ready listener has done its job; drop it (the ping-based path
        // stays live for the life of the bridge via `call`, disposed separately in dispose()).
        if (this.readyHandler) { window.removeEventListener('message', this.readyHandler); this.readyHandler = null; }
        res();
      };
      this.readyHandler = (e: MessageEvent) => { if (e.data?.type === 'studio:ready') done(); };
      window.addEventListener('message', this.readyHandler);
      this.pollTimer = setInterval(() => {
        if (settled) return;
        this.call('ping').then(done).catch(() => {});
      }, 1000);
    });
    this.mainHandler = (e: MessageEvent) => {
      const m = e.data; if (!m) return;
      if (m.type === 'studio:res') {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); m.ok ? p.res(m.data) : p.rej(new Error(m.error)); }
      }
      if (m.type === 'studio:pos') this.posCbs.forEach((cb) => cb(m.pos));
    };
    window.addEventListener('message', this.mainHandler);
  }
  call(cmd: string, payload: Record<string, unknown> = {}): Promise<any> {
    const id = `c${++this.seq}`;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.iframe.contentWindow!.postMessage({ type: 'studio:cmd', id, cmd, ...payload }, '*');
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`bridge timeout: ${cmd}`)); }, 5000);
    });
  }
  onPos(cb: (p: any) => void) { this.posCbs.push(cb); }
  // Removes both window `message` listeners and clears the ready-poll timer. Call before
  // discarding a bridge (e.g. when the Director UI tears down the iframe to switch shots)
  // so a stale instance doesn't keep listening forever and doesn't collide with a fresh
  // bridge's request ids (both instances number requests from `c1`).
  dispose() {
    window.removeEventListener('message', this.mainHandler);
    if (this.readyHandler) { window.removeEventListener('message', this.readyHandler); this.readyHandler = null; }
    if (this.pollTimer !== null) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }
}
