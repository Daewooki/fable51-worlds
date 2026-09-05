import { WebSocketServer } from 'ws';
export function attachWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' }); const meta = new Map();
  wss.on('connection', (sock) => {
    sock.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.type === 'join') { meta.set(sock, { room: m.room, projectId: m.projectId }); return; }
      const me = meta.get(sock); if (!me) return;
      const target = me.room === 'phone' ? 'director' : 'phone';
      for (const [s, info] of meta) if (s !== sock && info.projectId === me.projectId && info.room === target && s.readyState === 1) s.send(raw.toString());
    });
    sock.on('close', () => meta.delete(sock));
  });
  return wss;
}
