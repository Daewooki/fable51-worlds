# Task 6 report: project store + job runner + server + WS relay

## What was built

Implemented the server layer exactly per the brief, with the 5 controller-ruled deviations applied.

Files created:
- `studio/server/store.mjs` — `PROJECTS_DIR`, `projectDir(id)`, `listProjects()`, `readProject(id)`, `writeProject(p)` (validates via `validateProject`, atomic write via `.tmp` + rename).
- `studio/server/jobs.mjs` — `createJob({projectId,type,input})`, `enqueue(job,runner)`, `getJob(id)`, `listJobs(projectId)`. Single `chain` promise enforces sequential execution; log lines appended to `projects/<id>/jobs/<jobId>.log`; failures caught, recorded on the job (`status:'failed'`, `error`), and re-thrown to the caller without breaking the chain (chain's own `.catch(() => {})` absorbs the rejection so the next `.then` still runs).
- `studio/server/ws.mjs` — `attachWs(httpServer)` using `WebSocketServer` at path `/ws`. Tracks `{room, projectId}` per socket in a `Map`; non-JSON messages are swallowed (`try/catch` returns early); messages from sockets that haven't sent `join` yet are ignored (`if (!me) return`); relay only targets the opposite room (`phone`→`director`, `director`→`phone`) within the same `projectId`, and only to sockets with `readyState === 1` (OPEN).
- `studio/server/index.mjs` — HTTP JSON API per the brief's routing table, WS attached, RUNNERS map wiring `previz`/`finalize`/`export` to `renderPreviz`/`runSeedance`/`exportGlb`.
- `studio/server/finalize/seedance.mjs` — stub: `export async function runSeedance() { throw new Error('not implemented'); }` (ruling 4; Task 7 replaces).
- `studio/server/export/glb.mjs` — stub: `export async function exportGlb() { throw new Error('not implemented'); }` (ruling 4; Task 8 replaces).

Tests created verbatim from the brief:
- `studio/test/store.test.mjs`
- `studio/test/jobs.test.mjs`
- `studio/test/ws.test.mjs`

No new `.gitignore` was needed: `studio/.gitignore` already contains `node_modules` and `projects/*` (with `!projects/.gitkeep`); confirmed via `git check-ignore -v studio/projects/x` and `studio/node_modules/foo` — both already ignored.

## Controller rulings applied (deviations from brief's literal code)

1. **Path derivation** — used `fileURLToPath` instead of the brief's `new URL(...).pathname.replace(...)`, which breaks on this machine because the repo path contains a space (`Personal Project`) and the pathname would retain `%20`.
   - `store.mjs`: `export const PROJECTS_DIR = process.env.STUDIO_PROJECTS || fileURLToPath(new URL('../projects', import.meta.url));`
   - `index.mjs`: `const APP_DIST = fileURLToPath(new URL('../app/dist', import.meta.url));`
2. **Unknown job type → 400** — in `index.mjs`'s `POST /api/projects/:id/jobs` handler, before calling `createJob`/`enqueue`, checks `if (!RUNNERS[b.type]) return json(res, 400, { error: 'unknown job type' });`. Only enqueues when a runner exists.
3. **Static file guard** — replaced the brief's `path.join(...)` + plain `startsWith(root)` with:
   ```js
   const file = path.resolve(root, rel);
   if (!(file === root || file.startsWith(root + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { ... 404 ... }
   ```
   This closes the sibling-directory bypass (e.g. `projects-evil`) that a plain `startsWith(root)` would allow.
4. **Stubs** — `finalize/seedance.mjs` and `export/glb.mjs` created as throwing stubs so `index.mjs` boots before Tasks 7/8 land.
5. **No top-level side effects** — `index.mjs` has no CLI arg parsing; the only top-level side effects are `attachWs(server)` (registration, no I/O) and `server.listen(...)`, matching the `npm run dev` entry point contract.

## TDD process

1. Wrote the three test files verbatim from the brief.
2. Confirmed all three failed with "Cannot find module" errors (modules not yet created) — see below.
3. Implemented `store.mjs`, `jobs.mjs`, `ws.mjs`, the two stub files, and `index.mjs` (with rulings applied).
4. Re-ran the three test files — all green.
5. Booted the real server on `STUDIO_PORT=5191` with a throwaway `STUDIO_PROJECTS` temp dir, smoke-tested with curl, then killed it.
6. Ran the full studio suite (`npx vitest run`, no file filter) with the Vite dev server already up on :5173 — all 24 tests passed (19 pre-existing + 5 new).

## Test output tail

Step 2 (pre-implementation, expected failures):
```
FAIL  test/jobs.test.mjs  Cannot find module '../server/jobs.mjs' ...
FAIL  test/store.test.mjs  Cannot find module '../server/store.mjs' ...
FAIL  test/ws.test.mjs  Cannot find module '../server/ws.mjs' ...
Test Files  3 failed (3)
```

Step 4 (post-implementation, targeted):
```
✓ test/store.test.mjs (2 tests) 12ms
✓ test/jobs.test.mjs (2 tests) 60ms
✓ test/ws.test.mjs (1 test) 93ms

Test Files  3 passed (3)
     Tests  5 passed (5)
```

Full suite (final):
```
✓ test/project.test.mjs (6 tests) 13ms
✓ test/keys.test.mjs (9 tests) 9ms
✓ test/store.test.mjs (2 tests) 28ms
✓ test/jobs.test.mjs (2 tests) 61ms
✓ test/ws.test.mjs (1 test) 102ms
✓ test/browser.test.mjs (3 tests) 29233ms
✓ test/previz.test.mjs (1 test) 35040ms

Test Files  7 passed (7)
     Tests  24 passed (24)
```

## Curl smoke output

Server booted: `STUDIO_PORT=5191 STUDIO_PROJECTS=<mktemp -d> node server/index.mjs` → `MV Studio server http://localhost:5191`.

```
$ curl -s -i -X POST http://localhost:5191/api/projects -H 'content-type: application/json' -d '{"name":"MV","world":"union-square-sf"}'
HTTP/1.1 201 Created
content-type: application/json
{"id":"16c34fc8-715c","name":"MV","world":"union-square-sf","createdAt":"2026-09-05T07:17:54.853Z","refs":{"artist":[],"style":[]},"shots":[],"finalize":[]}

$ curl -s -i http://localhost:5191/api/projects/16c34fc8-715c
HTTP/1.1 200 OK
content-type: application/json
{"id":"16c34fc8-715c","name":"MV","world":"union-square-sf", ... }

$ curl -s -i -X POST http://localhost:5191/api/projects/16c34fc8-715c/jobs -H 'content-type: application/json' -d '{"type":"bogus"}'
HTTP/1.1 400 Bad Request
content-type: application/json
{"error":"unknown job type"}

$ curl -s -i "http://localhost:5191/files/../server/index.mjs"
HTTP/1.1 404 Not Found
not found
```

Server killed after smoke (Windows: found PID via `netstat -ano | grep :5191`, `taskkill //PID <pid> //F`); confirmed unreachable afterward; temp `STUDIO_PROJECTS` dir removed. `studio/projects/` on disk was untouched (still only `.gitkeep`) since the smoke used an isolated temp dir.

## Self-review checklist

- **Sequential queue holds under a failing job**: `enqueue`'s `chain = p.catch(() => {})` means a rejected job's promise never propagates into the shared `chain`, so the next `.then(run, run)` still fires. Verified by the jobs test (`marks failures` runs after the sequential test in the same file without breaking subsequent execution) and by the queue design itself (chain always resolves regardless of individual job outcome; only the per-call promise returned to the caller can reject).
- **Log files land under `projects/<id>/jobs/`**: `createJob` does `path.join(projectDir(projectId), 'jobs')` then `${id}.log` — confirmed by the jobs test reading `getJob(j1.id).log` content.
- **WS relay ignores non-JSON and unjoined sockets**: `try { m = JSON.parse(...) } catch { return; }` guards non-JSON; `const me = meta.get(sock); if (!me) return;` guards unjoined sockets (no `join` message sent yet).
- **No unused imports**: reviewed `index.mjs` — every import (`http`, `fs`, `path`, `fileURLToPath`, `listProjects`, `readProject`, `writeProject`, `projectDir`, `PROJECTS_DIR`, `createProject`, `createJob`, `enqueue`, `getJob`, `listJobs`, `attachWs`, `renderPreviz`, `runSeedance`, `exportGlb`) is used. Same check on `store.mjs`, `jobs.mjs`, `ws.mjs` — clean.

## Deviations applied

All 5 controller rulings listed above were applied exactly as specified; no other deviations from the brief.

## Concerns

None. Full suite green (24/24), smoke-tested API behavior (201/200/400/404) matches spec, git-ignore already covered `projects/` and `node_modules/` so no new `.gitignore` was added, and only `studio/` was staged for the commit — `union-square-sf/package-lock.json` remains untouched/unstaged as instructed.

## Commit

`fde7834` — "feat(studio): project store, job runner, http api and phone/director ws relay"

## Fix round 1 (reviewer findings F1-F3)

### F1 (Important) — malformed/oversized body could crash the process

**Problem confirmed**: `readBody`'s `JSON.parse(s)` ran inside the `req.on('end', ...)` callback, outside the request handler's `try/catch`. A synchronous throw inside a Node event-emitter callback with no listener-local try/catch becomes an uncaught exception and kills the process — a single `{not valid` POST body would take the whole server down.

**Fix** (`studio/server/index.mjs`):
- Added a small `HttpError extends Error` class carrying a `status` code.
- Rewrote `readBody` to build and settle a `Promise` explicitly instead of relying on `JSON.parse` throwing synchronously into an event callback:
  - Tracks accumulated `size`; if it exceeds `BODY_LIMIT = 1024 * 1024` (1 MB), rejects with `HttpError(413, 'body too large')` and stops appending further chunks (guarded by a `settled` flag so late events are no-ops).
  - On `'end'`, `JSON.parse` failures are caught locally and turned into `HttpError(400, 'invalid json')` rejections (no throw escapes the callback).
  - Added a `req.on('error', ...)` listener that also rejects (as a 500) instead of leaving stream errors unhandled.
- The route handler's outer `catch (e)` now special-cases `HttpError`: `if (e instanceof HttpError) return json(res, e.status, { error: e.message })`, keeping 400 for invalid JSON and 413 for oversized bodies distinct from the generic 500 path (which still stringifies `e.message` for anything else, e.g. `ENOENT` from `readProject`).
- For the 413 case specifically, `req.destroy()` is called *after* the response has been written (`json(res, 413, ...)` then `req.destroy()`), not from inside `readBody`'s data handler. Initial attempt destroyed the request stream at the moment the limit was crossed, which — since `req`/`res` share the same underlying socket — silently dropped the connection before the 413 response could be flushed (verified via a 2 MB curl upload: client saw `100 Continue` and then nothing). Moving the destroy call to after `json()` writes the full 413 response fixed this; confirmed via curl (see below) that the client now receives `413 {"error":"body too large"}` and the connection is cleanly closed afterward, with the server still alive for the next request.

### F2 (Minor) — no error listeners on WS sockets

**Fix** (`studio/server/ws.mjs`): added `wss.on('error', () => {})` on the `WebSocketServer` itself and `sock.on('error', () => {})` inside the `'connection'` handler for each socket, so a socket-level error (e.g. an abrupt client disconnect mid-write) cannot surface as an unhandled `'error'` event and crash the process.

### F3 — `createServer()` refactor + `studio/test/api.test.mjs`

Refactored `index.mjs` minimally per the instruction:
- All server-building logic (`http.createServer(...)` + `attachWs(server)`) now lives inside an exported `export function createServer()` that returns the built server without calling `.listen`.
- `PORT` computation and the `server.listen(...)` call moved into a run-directly guard: `if (process.argv[1] && process.argv[1].endsWith('index.mjs')) { ... }` — mirrors the existing pattern already used in `server/render/previz.mjs`. This preserves ruling R5 (no top-level side effects besides `server.listen`) and keeps `npm run dev` (`node server/index.mjs`) working unchanged.

Added `studio/test/api.test.mjs`:
- Sets `process.env.STUDIO_PROJECTS` to a fresh `mkdtemp` dir before the dynamic `import('../server/index.mjs')` (same pattern as `store.test.mjs`/`jobs.test.mjs`), then calls `createServer()` and listens on an ephemeral port (`server.listen(0, ...)`) in `beforeAll`, closing it in `afterAll`.
- Test 1: `POST /api/projects` with body `'{not valid json'` → expects `400`.
- Test 2 (proves the process survived test 1): `POST /api/projects` with a valid body → expects `201`, then `POST /api/projects/<id>/jobs` with `{"type":"nope"}` → expects `400`.

### Verification

Targeted run (`cd studio && npx vitest run test/api.test.mjs test/store.test.mjs test/jobs.test.mjs test/ws.test.mjs test/keys.test.mjs test/project.test.mjs`):
```
✓ test/keys.test.mjs (9 tests)
✓ test/project.test.mjs (6 tests)
✓ test/store.test.mjs (2 tests)
✓ test/jobs.test.mjs (2 tests)
✓ test/ws.test.mjs (1 test)
✓ test/api.test.mjs (2 tests)

Test Files  6 passed (6)
     Tests  22 passed (22)
```

Manual curl smoke against a real `node server/index.mjs` boot (temp `STUDIO_PROJECTS`, `STUDIO_PORT=5193`):
```
$ curl -s -i -X POST http://localhost:5193/api/projects -H 'content-type: application/json' -d '{not valid'
HTTP/1.1 400 Bad Request
{"error":"invalid json"}

$ curl -s -i -X POST http://localhost:5193/api/projects -H 'content-type: application/json' --data-binary @bigbody.txt   # 2 MB payload
HTTP/1.1 100 Continue
HTTP/1.1 413 Payload Too Large
{"error":"body too large"}

$ curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5193/api/projects
200   # server still alive
```
Server killed afterward via `netstat -ano | grep :5193` → `taskkill //PID <pid> //F`; confirmed unreachable.

### Concerns after fix round 1

None. All three findings addressed and verified both by automated tests and manual curl smoke against a live process; `git status` confirms only `studio/server/index.mjs`, `studio/server/ws.mjs` (modified) and `studio/test/api.test.mjs` (new) changed — `union-square-sf/package-lock.json` remains untouched/unstaged.
