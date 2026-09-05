import { it, expect } from 'vitest';
import http from 'node:http'; import { WebSocket } from 'ws';
import { attachWs } from '../server/ws.mjs';
it('relays phone messages to director sockets of the same project', async () => {
  const server = http.createServer(); attachWs(server); await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  const open = (room) => new Promise((res) => { const s = new WebSocket(`ws://localhost:${port}/ws`); s.on('open', () => { s.send(JSON.stringify({ type: 'join', room, projectId: 'p' })); res(s); }); });
  const director = await open('director'), phone = await open('phone');
  const got = new Promise((res) => director.on('message', (m) => res(JSON.parse(m.toString()))));
  await new Promise((r) => setTimeout(r, 50)); phone.send(JSON.stringify({ type: 'cam', q: [0, 0, 0, 1] }));
  expect((await got).type).toBe('cam'); director.close(); phone.close(); server.close();
});
