import { WebSocketServer } from 'ws';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

// --------------------------------------------------------------------------------------
// Who is allowed to talk to this server.
//
// The studio is a local tool, but it is a real HTTP+WS server on the operator's machine.
// A WebSocket handshake is exempt from CORS, so without an Origin check any page the
// operator happens to visit could open ws://localhost:5190/ws and drive the studio; and
// without a Host check, DNS rebinding gets the same page to the HTTP API — which reaches
// the finalize driver and the operator's ANTHROPIC_API_KEY through /api/projects/:id/prompt.
//
// The allowlist is: localhost, the loopback literals, and this machine's own LAN IPv4
// addresses (the phone needs one of those), with any port.
// --------------------------------------------------------------------------------------
let cachedHosts = null;
export function allowedHostnames() {
  if (cachedHosts) return cachedHosts;
  const set = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) if (info && info.family === 'IPv4') set.add(info.address);
  }
  cachedHosts = set;
  return set;
}

/** hostname out of a `Host:` header value or an `Origin:` URL; null when unparseable. */
function hostnameOf(value, { asUrl = false } = {}) {
  if (!value || typeof value !== 'string') return null;
  try { return new URL(asUrl ? value : `http://${value}`).hostname || null; } catch { return null; }
}

/** True when a `Host:` header names this machine (any port). */
export function isAllowedHost(hostHeader) {
  const h = hostnameOf(hostHeader);
  return !!h && allowedHostnames().has(h);
}

/** True when an `Origin:` header names this machine (any scheme, any port). */
export function isAllowedOrigin(origin) {
  const h = hostnameOf(origin, { asUrl: true });
  return !!h && allowedHostnames().has(h);
}

// Per-process shared secret. The Director UI is same-origin with the server, so its socket
// is covered by the Origin check above; the phone opens its page from a QR code over the
// LAN, so the QR carries this token and the phone must present it to join the phone room.
// `STUDIO_TOKEN` overrides it, e.g. to keep one token across a server restart.
export const PHONE_TOKEN = process.env.STUDIO_TOKEN || randomBytes(16).toString('hex');

export function attachWs(server) {
  // noServer + our own `upgrade` handler, so a bad Origin destroys the socket rather than
  // reaching the WebSocket layer at all.
  const wss = new WebSocketServer({ noServer: true }); const meta = new Map();
  wss.on('error', () => {});
  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { socket.destroy(); return; }
    if (pathname !== '/ws') { socket.destroy(); return; }
    // A missing Origin (native ws clients, the tests, curl) is allowed through: those cannot
    // be a hostile page in the operator's browser, and a phone join still needs the token.
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (sock) => {
    sock.on('error', () => {});
    sock.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.type === 'join') {
        if (m.room === 'phone' && m.token !== PHONE_TOKEN) { sock.close(4401, 'bad token'); return; }
        meta.set(sock, { room: m.room, projectId: m.projectId });
        return;
      }
      const me = meta.get(sock); if (!me) return;
      const target = me.room === 'phone' ? 'director' : 'phone';
      for (const [s, info] of meta) if (s !== sock && info.projectId === me.projectId && info.room === target && s.readyState === 1) s.send(raw.toString());
    });
    sock.on('close', () => meta.delete(sock));
  });
  return wss;
}
