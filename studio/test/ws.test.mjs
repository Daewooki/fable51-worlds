import { it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http'; import { WebSocket } from 'ws';
import { attachWs, PHONE_TOKEN } from '../server/ws.mjs';

let server; let port;
beforeAll(async () => {
  server = http.createServer((_, res) => { res.writeHead(404); res.end(); });
  attachWs(server);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
afterAll(() => new Promise((r) => server.close(r)));

const connect = (opts = {}) => new Promise((res, rej) => {
  const s = new WebSocket(`ws://localhost:${port}/ws`, opts);
  s.on('open', () => res(s));
  s.on('error', rej);
});
const join = async (room, extra = {}) => {
  const s = await connect();
  s.send(JSON.stringify({ type: 'join', room, projectId: 'p', ...extra }));
  return s;
};

it('relays phone messages to director sockets of the same project', async () => {
  const director = await join('director');
  const phone = await join('phone', { token: PHONE_TOKEN });
  const got = new Promise((res) => director.on('message', (m) => res(JSON.parse(m.toString()))));
  await new Promise((r) => setTimeout(r, 50));
  phone.send(JSON.stringify({ type: 'cam', q: [0, 0, 0, 1] }));
  expect((await got).type).toBe('cam');
  director.close(); phone.close();
});

it('closes a phone join that carries no token with 4401', async () => {
  const s = await connect();
  const closed = new Promise((res) => s.on('close', (code) => res(code)));
  s.send(JSON.stringify({ type: 'join', room: 'phone', projectId: 'p' }));
  expect(await closed).toBe(4401);
});

it('closes a phone join carrying the wrong token with 4401', async () => {
  const s = await connect();
  const closed = new Promise((res) => s.on('close', (code) => res(code)));
  s.send(JSON.stringify({ type: 'join', room: 'phone', projectId: 'p', token: 'nope' }));
  expect(await closed).toBe(4401);
});

it('a tokenless phone socket relays nothing (it never joined a room)', async () => {
  const director = await join('director');
  const rogue = await connect();
  rogue.send(JSON.stringify({ type: 'join', room: 'phone', projectId: 'p' }));
  let seen = false;
  director.on('message', () => { seen = true; });
  await new Promise((r) => setTimeout(r, 60));
  try { rogue.send(JSON.stringify({ type: 'cam', q: [0, 0, 0, 1] })); } catch { /* already closed */ }
  await new Promise((r) => setTimeout(r, 60));
  expect(seen).toBe(false);
  director.close();
});

it('refuses the upgrade when Origin is not this machine', async () => {
  // WebSocket handshakes are exempt from CORS, so an Origin check is the only thing keeping
  // a page the operator visits from driving ws://localhost:5190/ws.
  await expect(connect({ headers: { origin: 'http://evil.example' } })).rejects.toThrow();
});

it('allows the upgrade from a localhost Origin', async () => {
  const s = await connect({ headers: { origin: `http://localhost:${port}` } });
  expect(s.readyState).toBe(1);
  s.close();
});
