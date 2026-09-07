# MV Studio

A local music-video workbench for the worlds in this repo.

You block a shot by flying the camera around a live Three.js world in an iframe, keyframe it
on a timeline, render a **previz** MP4 headlessly at full resolution, hand that previz to
**Seedance 2.5** as a motion reference to finalize, and — when you want to finish the shot in
Blender instead — **export** the world as a GLB with the camera path and an import script.

Nothing here is a service. It is a Node server, a Vite UI and a browser, all on localhost.

```
 Director UI (5180) ──postMessage──▶ world iframe (5173 / 5174)
        │                                    ▲
        │ HTTP/WS                            │ Playwright (headless, same world, same URL)
        ▼                                    │
 studio server (5190) ──── jobs ─────────────┘──▶ previz.mp4 · seedance-job.md · scene.glb
```

---

## Setup

```bash
# once per world
cd union-square-sf   && npm install
cd kyoto-higashiyama && npm install

# the studio itself
cd studio && npm install
npx playwright install chromium
```

Also needed:

- **ffmpeg / ffprobe on `PATH`** — the previz renderer encodes the PNG frames to MP4 with
  ffmpeg, and the tests count frames with ffprobe.
- **A GPU** — previz runs headless Chromium with ANGLE/D3D11. It falls back to SwiftShader
  software rendering if the GPU path is refused, which works but is roughly an order of
  magnitude slower; see troubleshooting.
- **Higgsfield CLI**, only if you want the finalize step to run itself rather than write you
  a job card:
  ```bash
  npm i -g @higgsfield/cli
  higgsfield auth login
  higgsfield workspace set <workspace-id>
  ```
- **Blender**, only for the export path's `blender_import.py`. It is not needed to produce
  the GLB.

---

## Running

**One terminal:**

```bash
cd studio
npm run up            # both worlds (:5173, :5174) + studio server (:5190) + Director UI (:5180)
npm run up:union      # only union-square-sf   (npm run up:kyoto for only kyoto)
npm run up:lan        # server bound to 0.0.0.0 for the phone camera; prints the LAN URL
npm run down          # stop whatever is listening on 5173/5174/5180/5190
```

`tools/up.mjs` spawns the three processes, prefixes their logs (`[union-square-sf]`,
`[server]`, `[ui]`), waits until each port answers, prints the Director URL, and stops
everything it started on Ctrl+C (whole process trees, on Windows too). A port that is
already serving is reused rather than restarted — so it is safe to run `up` while a world
you started by hand is still up. Flags: `--world <name|all>`, `--lan`, `--open` (opens the
browser), `--stop`.

**By hand — three or four terminals.** The world's dev server has to be up before any render
job runs — the studio drives the *live* world, it does not have its own copy of it.

```bash
# 1. the world  (pick one; the studio can drive either)
cd union-square-sf   && npx vite --port 5173 --strictPort
cd kyoto-higashiyama && npm run dev            # already pinned to 5174

# 2. the studio server                → http://localhost:5190
cd studio && npm run dev

# 3. the Director UI                  → http://localhost:5180
cd studio && npm run dev:ui
```

Open <http://localhost:5180>. `/api`, `/files` and `/ws` are proxied from 5180 to 5190, so
the UI is the only URL you need.

> **union-square-sf's own `npm run dev` fails on a path containing a space.** Use
> `npx vite --port 5173 --strictPort`. See troubleshooting.

---

## The one-shot walkthrough

1. **New project** (left panel) — name it, pick the world, Create.
2. **New shot** — fps / width / height / time of day. 30 fps, 1920×1080, sunset is the
   default. The world loads into the centre iframe and the status line says `world ready`.
3. **Block the camera.** Three ways: press **Unlock controls** under the viewport and fly
   the world by hand in the iframe (union-square-sf only — see *Unlocking the camera*
   below), drive it from a phone (below), or type a prompt into **Prompt → path** and hit
   Generate to get a 4-key move built from that world's landmark anchors.
4. **Keyframes** (right panel) — set `t`, choose `air` (free camera) or `walk` (eye height
   follows the ground, with a footstep bob), and press **Add key @ t** to capture wherever
   the camera is now (locked or unlocked — it reads the live pose either way). `cut` makes a
   hard cut with a short fade; `cap` puts a caption on screen; `time` re-lights the world
   mid-shot. Two adjacent keys with **different modes do not interpolate**: the segment
   holds the destination pose and the camera jumps at its start, so the timeline shows a
   warning under the list. Split the move with a matching-mode key to keep it smooth.
5. **Scrub** the timeline under the viewport to see the interpolated move live.
6. **Render previz** (jobs panel). The job list shows a live log tail and, when it is done,
   plays the MP4 inline. Frames are also left on disk under
   `projects/<id>/shots/<shotId>/frames/`.
7. **Finalize (Seedance)** — pick a mode (`video_edit` uses the previz as a motion
   reference; `omni_reference` also takes artist/style images), a resolution and a prompt,
   then Finalize. With `driver: auto` and a logged-in CLI it runs `higgsfield generate
   create seedance_2_5 …`, waits, and downloads `final.mp4`. Without a working CLI it
   writes `seedance-job.md` — a job card with the exact command and the media list, to run
   by hand or paste into the Higgsfield web app.
8. **Export** — writes `export/scene.glb` (the `world`, `props` and `vegetation` groups),
   `export/<shotId>.keys.json` and `export/blender_import.py`. In Blender:
   `blender --python export/blender_import.py`, or run it from Blender's text editor; it
   imports the GLB and builds an animated camera from the keys.

Everything lands under `projects/<projectId>/` (or `$STUDIO_PROJECTS/<projectId>/`):

```
project.json
jobs/<jobId>.log
shots/<shotId>/frames/*.png · previz.mp4 · seedance-job.md · final.mp4
export/scene.glb · <shotId>.keys.json · blender_import.py
refs/…                       # artist / style / audio references you drop in yourself
```

---

## Path collision check and auto-fix

Keys interpolate in straight lines and know nothing about the buildings, so a generated or
hand-placed move can cut through a façade. The Director checks every shot against the live
world and shows the result under the scrubber:

- **Red bands** on the scrubber mark the stretches where the camera is inside or under a
  structure (or below the terrain); hover a band for the times and what it hits. The line
  under the scrubber says `path clear — no collisions` or lists the collisions.
- The check runs by itself (debounced) whenever the keys change and when the world loads;
  **Check path** re-runs it on demand.
- **Fix path** lifts blocked *air* segments: it inserts a key at the middle of each blocked
  stretch, raised 12 m above the highest surface the stretch crosses, and re-checks (up to
  four rounds, since a new straight segment can still clip near its ends). Endpoints are
  never moved. **Generate** (prompt → path) runs the fix automatically, so the four anchor
  keys come out already flying over whatever sat between them.
- Two cases are reported but not fixed, because the right answer is the creator's: a **key
  that is itself inside a structure** (move it — or, if you mean to go indoors, come in
  through an opening), and a **walk segment** that crosses a building (walk keys follow the
  ground and cannot be lifted; route around, or cut).
- The previz renderer runs the same probe before it starts and writes a `WARN` line to the
  job log (and `job.warnings`) if the path still crosses structures; it does not refuse to
  render.

How the world answers: the bridge's `probePath` command casts a ray straight down at each
sampled camera position (10 Hz plus every key time) through the `world`, `props` and
`vegetation` groups; a first hit more than 1.5 m above the terrain is a structure, and a
camera below that surface (minus 1 m clearance) is blocked. It is a roof test, not a wall
test: a camera 30 cm outside a façade is "clear", and a camera under a canopy or an arcade
reads as blocked. Both worlds implement it (kyoto in its adapter).

---

## Unlocking the camera

Under `?studio=1` both worlds switch their own camera controllers **off**, so nothing fights
the pose the Director sets when you scrub. That also means dragging in the iframe does
nothing by default. The **Unlock controls** toggle under the viewport hands the camera back
to the world (`walk` or `orbit`, picked in the select next to it); toggle it off and the
Director owns the camera again.

- **union-square-sf** — both modes work. Note that unlocking hands over to the world's own
  controller, which resumes from *its* last pose, so the view jumps once when you unlock;
  block from there, then **Add key @ t**.
- **kyoto-higashiyama** — the button reads `n/a`. That world is a first-person walker with
  no camera modes at all (its adapter's `setMode()` is a documented no-op), so block its
  shots with **Prompt → path**, the phone camera, or by editing key values, and scrub to see
  them.

---

## Prompt → path

`POST /api/projects/:id/prompt` turns a sentence into keys.

- **provider `none`** (the default, no key, no network) hands you four of that world's
  named landmark anchors spread over the duration you asked for. It always works, and it is
  what the tests and `tools/e2e.mjs` use.
- **provider `anthropic` / `openai`** gives the model the same anchor list as grounding and
  asks it to plan a fuller move. Whatever comes back is validated key-by-key against the
  schema before it is accepted, so a malformed plan is an error, not a broken shot.

Set `STUDIO_LLM` to pick the default the UI opens with.

---

## Phone as a virtual camera

The phone panel shows a QR code — and the URL under it as text — for
`http://<lan-ip>:<director-port>/phone/?projectId=…&token=…`. The address comes from
`GET /api/lan-ip`, the port is whatever port the Director itself is on, and the token is the
studio server's per-process phone token. Open it on a phone on the same Wi-Fi, and the
phone's orientation drives the world camera live over the `/ws` relay; a swipe dollies, a
pinch zooms, and the record button captures the move straight into the current shot's keys.

**Two things have to be true for this to work**, because the server is loopback-only and
Origin/Host-checked by default:

1. **Start the studio server with `STUDIO_BIND=0.0.0.0`** so the phone can reach it at all:
   ```bash
   cd studio && STUDIO_BIND=0.0.0.0 npm run dev        # PowerShell: $env:STUDIO_BIND='0.0.0.0'; npm run dev
   ```
2. **Open the Director on the LAN IP yourself** — `http://<lan-ip>:5180`, not
   `http://localhost:5180`. The phone page talks to the same origin it was loaded from, and
   `localhost` on the phone is the phone.

The token is minted per server process, so restarting the server invalidates an open phone
page (re-scan the QR). Set `STUDIO_TOKEN` to pin it across restarts. A `join` for the phone
room without the right token is closed with WebSocket code `4401`.

**iPhones need HTTPS.** iOS Safari only exposes `DeviceOrientationEvent.requestPermission()`
on a secure context, so on plain http the phone page loads and then never receives a single
orientation event. Generate a local cert once and the UI dev server picks it up
automatically:

```bash
mkcert -install
mkcert -key-file studio/.certs/localhost-key.pem \
       -cert-file studio/.certs/localhost.pem localhost <lan-ip>
```

`<lan-ip>` is the address `GET /api/lan-ip` reports. Android and desktop are fine over http.

---

## VARCO 3D assets

VARCO-generated meshes can be dropped into a world's GLB kit so the studio renders them:

```bash
cd studio

# 1. get a GLB. With VARCO_API_KEY set this calls the API and polls the job;
#    without one it prints the manual steps for 3d.varco.ai.
node tools/varco_fetch.mjs --image ref.png --name torii --out torii.glb

# 2. inject it into the world's asset kit — welds, simplifies, dedups, re-scales to a
#    real-world height, and (optionally) takes the place of an existing asset.
node tools/inject_asset.mjs torii.glb --as varco/torii --height 6.4 [--replace <rel-path>]

# 3. restart the world's Vite dev server so the new asset is picked up.
```

**Kyoto is the exception.** `kyoto-higashiyama` is fully procedural — every building, roof,
lantern and tree is generated by code, and there is no GLB kit and no asset manifest, so
there is nothing for `inject_asset` to override. VARCO styling for that world means
Seedance **style references** at the finalize step (put the images in `projects/<id>/refs/`,
list them under *Style refs*, tick *use style refs*, mode `omni_reference`), not geometry
replacement.

### Other Kyoto limitations

- **No in-iframe camera control, and no Unlock.** That world's first-person walker re-seats
  the camera on the player's head every frame, so under `?studio=1` its adapter parks the
  frame loop and neutralises pointer lock; otherwise the walker would silently undo every
  camera the Director UI sets. It has no camera modes to hand back either — `setMode()` in
  its adapter is a no-op — so the **Unlock controls** button reads `n/a` for Kyoto. Block its
  shots with **Prompt → path**, the phone camera, or by editing key values, and scrub to see
  them. (Under `?qa=1` alone — that world's own capture tooling — the loop is *not* parked.)
- **The preview is a still.** With the loop parked, the Kyoto iframe re-renders only when
  the bridge sets something. Animation — petals, water, lantern flicker — is present in the
  rendered previz (the renderer drives those updates itself) but not in the live preview.
- **Times of day.** Kyoto has `morning · day · sunset · dusk`, not `night`; the studio's
  `night` maps to `dusk`.
- **Altitudes are not sea level.** It models the Higashiyama hillside, so the ground under
  Gion already sits ~39 m up and under Kiyomizu-dera ~53 m. An `air` key at `y: 12` there is
  under the street, and renders as the undersides of the roofs against the sky. Query
  `window.__twin.world.terrain.heightAt(x, z)` if in doubt.

---

## API keys (Settings panel)

Nothing in the core loop needs a key: previz, export and the anchor-based prompt planner are
local. Three optional features do, and each person enters their own key **in the Director's
Settings panel** (bottom row) rather than editing files:

| Key | Unlocks | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | prompt → path with Claude | provider `none` (landmark anchors) |
| `OPENAI_API_KEY` | prompt → path with GPT | provider `none` |
| `VARCO_API_KEY` | `tools/varco_fetch.mjs` image-to-3D | manual VARCO 3D web export |

Resolution order for every key: **environment variable → `studio/.secrets.json` → none**.
The file is written by the panel (`PUT /api/settings`), lives on the PC running the studio
server, is git-ignored and mode 0600, and is never sent back to a browser — `GET /api/config`
reports only `set`, `source` (`env` / `file` / `none`) and a masked tail. A key set through the
environment is shown as read-only. Saving and clearing are accepted only from loopback, so with
`STUDIO_BIND=0.0.0.0` a LAN peer cannot change anyone's keys. The prompt panel's provider list
follows the keys the server can see; its default is `STUDIO_LLM` if pinned, else the first
provider with a key, else `none`.

Higgsfield (Seedance) is not a key but a CLI login; the panel shows whether
`higgsfield` is installed and logged in, and the commands to fix it if not.

---

## Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `STUDIO_PORT` | `5190` | Port the studio server listens on. |
| `STUDIO_BIND` | `127.0.0.1` | Interface to bind. Set to `0.0.0.0` to let the phone reach it. |
| `STUDIO_TOKEN` | random per process | The phone token carried in the QR URL. Set it to keep one token across restarts. |
| `STUDIO_PROJECTS` | `studio/projects` | Where projects, jobs and artifacts are written. |
| `STUDIO_LLM` | `none` | Default prompt→path provider: `none` \| `anthropic` \| `openai`. |
| `STUDIO_LLM_MODEL` | per provider | Override the model id. |
| `ANTHROPIC_API_KEY` | — | Required when `STUDIO_LLM=anthropic`. |
| `OPENAI_API_KEY` | — | Required when `STUDIO_LLM=openai`. |
| `VARCO_API_KEY` | — | Enables `tools/varco_fetch.mjs`; without it the tool prints the manual path. |
| `VARCO_API_BASE` | `https://api.varco.ai` | VARCO API base URL. |

---

## What a world has to provide

Both worlds in this repo are plain Three.js apps that were written to be walked, not to be
filmed. The studio drives them through a small contract; a third world becomes drivable the
moment it implements this. `union-square-sf/src/debug/{Qa,StudioBridge}.ts` and
`kyoto-higashiyama/src/studio.js` are the two existing implementations, and they are worth
reading in that order — the Kyoto one is the honest measure of how much is actually
required, because that world shares no code at all with the first.

**1. Query parameters.** The world is always opened as

```
http://localhost:<port>/?qa=1&ui=0&studio=1&life=0&time=<day|sunset|night>&q=<low|med|high>
```

`qa=1` asks for the automation surface, `studio=1` additionally asks for the postMessage
bridge, `ui=0` hides all chrome (including any click-to-start plate — the renderer will
screenshot straight through it otherwise), `time` sets the lighting and `q` the render
quality. **Any parameter the world does not understand must be ignored**, not rejected:
the studio sends the same query string to every world.

**2. `window.__twin`.**

| Member | Contract |
| --- | --- |
| `ready` | Resolves/true once the world is built and has rendered one frame. |
| `setTime(p)` | `'day' \| 'sunset' \| 'night'` → the world's own lighting states. |
| `freeze(v)` | Stop/start the world's simulation. |
| `setMode(m)` | May be a no-op if the world has no camera modes. |
| `renderOnce()` | Render exactly one frame, through whatever post stack the world uses. |
| `pos()` | `{ eye: [x,y,z], look: [x,y,z], fov }`. |
| `app` | `{ camera, scene, renderer, updatables: [{ update(dt, elapsed) }], time: { update(pos, _, y) {} }, elapsed }`. |
| `world` | `{ collision: { floorAt(x, z, fromY, maxDrop?) }, terrain: { heightAt(x, z) } }`, both returning a ground Y. |

`app.renderer.render(scene, cam)` is what the previz loop calls once per frame. It does not
have to be a `THREE.WebGLRenderer` — if the world renders through a post-processing stack,
make it a shim that runs the stack, or the previz will look nothing like the world. Anything
the world's frame loop does that is *not* in `updatables` (shadow-camera aiming, a sky dome
parked on the camera) has to happen in there too, because the studio drives the frames and
the world's own loop is not running.

`app.updatables` is emptied and re-driven by the studio, so everything that must tick per
frame has to be reachable from that one list.

**3. The postMessage bridge** (`studio=1` only):

```
parent → world   { type: 'studio:cmd', id, cmd, ...payload }   cmd ∈ ping · setCameraRaw{eye,look,fov?}
                                                                     · setTime{p} · freeze{v} · setMode{m} · pos
world  → parent  { type: 'studio:res', id, ok, data | error }
world  → parent  { type: 'studio:ready' }                      once
world  → parent  { type: 'studio:pos', pos: {x,y,z} }          every 250 ms
```

Only accept messages whose `ev.source === window.parent`. An unknown command must come back
as `{ ok: false, error }`, not throw. And under `studio=1` the world's own camera
controllers must not fight the bridged camera — Kyoto's walker re-seats the camera on the
player's head every frame, so its adapter parks the world's `requestAnimationFrame` loop and
renders on demand instead.

**4. GLB export** reads the scene children named `world`, `props` and `vegetation`. At least
one of them has to exist.

**5. Register the world** in `studio/schemas/project.mjs` (`WORLDS`),
`studio/server/render/browser.mjs` (`WORLD_PORTS`) and `studio/app/src/main.ts`
(`WORLD_PORTS`), and add landmark anchors to `TOURS` in `studio/server/prompt.mjs` so
prompt→path has something to aim at.

---

## Tests

```bash
cd studio && npx vitest run          # unit + integration; the browser tests need
                                     # BOTH world dev servers up (5173 and 5174)
npx tsc --noEmit -p app              # Director UI types

# the postMessage bridge, per world
node union-square-sf/tools/qa/studio_bridge_test.mjs
node kyoto-higashiyama/tools/studio_bridge_test.mjs

# the whole pipeline, end to end, against a throwaway projects dir
cd studio && node tools/e2e.mjs --world union-square-sf
             node tools/e2e.mjs --world kyoto-higashiyama --port 5192
```

`tools/e2e.mjs` starts its own studio server on its own port, so it is safe to run while a
real one is up. `--projects <dir> --keep` leaves the artifacts behind to look at.

---

## Measured on

RTX 3070, Windows 11, Node 22, Chromium via Playwright with `--use-angle=d3d11`, both
worlds served by Vite 6.4.3 dev servers. All figures from `node tools/e2e.mjs`, which
includes the world's load-and-build time in the first render of each run.

| Step | union-square-sf | kyoto-higashiyama |
| --- | --- | --- |
| create project + prompt → keys (provider `none`) | < 0.1 s | < 0.1 s |
| previz, 2 s @ 640×360 — 60 frames | **26.1 s** | **28.2 s** |
| previz, 10 s @ 1920×1080 — 300 frames | **143.0 s** (0.48 s/frame) | **72.8 s** (0.24 s/frame) |
| finalize, `driver: manual` (writes the job card) | < 0.1 s | < 0.1 s |
| export GLB + keys + Blender script | **20.4 s** (39.7 MB, 1229 meshes) | **38.8 s** (397.2 MB, 1052 meshes) |
| **total** | **190.4 s** | **140.7 s** |

Neither run fell back to software rendering (`softwareRender: false`). The Blender import
step is not included: Blender is not installed on this machine, so `blender_import.py` is
written and checked for existence but has not been executed here.

Union Square's 1080p previz got ~25 % faster once the renderer started sending `studio=1`
(that world then switches its own walk/orbit controllers off instead of running them beside
the driven camera).

Two things worth knowing from those numbers. Kyoto renders roughly 2× faster per 1080p
frame than Union Square, but its **GLB is ten times bigger** — 397 MB against 40 MB. Union
Square ships repeated props as `EXT_mesh_gpu_instancing`, whereas Kyoto bakes its districts
into large merged vertex-coloured meshes, and baked geometry does not deduplicate. It loads
in Blender, but expect the import to take a while and the .blend to be large; if that
matters, decimate on import.

---

## Troubleshooting

**`world load timeout` when a job starts.**
The studio waits up to 240 s for `window.__twin` to appear. It means the world's dev server
is down, is on a different port, or the world threw while building. Check the world's own
terminal, then open the same URL the renderer uses in a normal browser and look at the
console:
`http://localhost:5173/?qa=1&ui=0&studio=1&life=0&time=sunset&q=med`.
A cold Kyoto build is genuinely slow (~20–30 s) — that is not a timeout, just the first load.

**`softwareRender: true` in a job's artifacts.**
Chromium refused the GPU path and fell back to SwiftShader. The render is correct but much
slower, and it will show up as a previz that takes minutes where it should take seconds. On
a headless/RDP session or a machine with no usable D3D11 device this is expected; otherwise
check that the GPU driver is current and that nothing else is holding the device. The launch
flags are in `studio/server/render/browser.mjs`.

**Finalize wrote `seedance-job.md` instead of a video.**
The Higgsfield CLI is missing or not logged in. `resolveCli()` looks for the **native binary**
the npm package ships — `<npm root -g>/@higgsfield/cli/vendor/hf.exe` on Windows, `vendor/hf`
(or the PATH entry) elsewhere — because the studio spawns it directly with no shell: the
`higgsfield` shim on PATH would need `shell: true`, and cmd.exe would then re-parse your
prompt (a `"` in it would end the argument and `%VAR%` would expand). If the binary cannot be
found, or `detectCli()` sees `No workspace selected` / `not logged in` / a non-zero exit, the
job falls back to the manual driver and records the reason in its artifacts. Fix with
`higgsfield auth login` and `higgsfield workspace set <id>`, or just run the command printed
in the job card by hand. Choosing `driver: manual` takes this path deliberately.

**`npm run dev` in union-square-sf dies with `ENOENT ... mkdir 'C:\C:\Users\...Personal%20Project\...'`.**
Its pre-step `tools/geo/sync_data.mjs` builds paths from `new URL(import.meta.url).pathname`,
which keeps the URL's leading slash and its percent-encoding, so any repo path containing a
space breaks it. The data it syncs is already committed, so skip it:
`npx vite --port 5173 --strictPort`. (The general rule for this repo: derive paths from
`import.meta.url` with `fileURLToPath`, never `.pathname`.)

**The phone page loads but the camera never moves (iPhone).**
No HTTPS. iOS gates `DeviceOrientationEvent.requestPermission()` on a secure context. Set up
mkcert as above and reload over `https://<lan-ip>:5180/phone/…`.

**The previz is a black frame, or a title card.**
The world's chrome was not hidden. `ui=0` must hide *every* overlay, including any
full-screen click-to-start plate that is a sibling of the HUD rather than a child of it.

**Ports.** 5173 union-square-sf · 5174 kyoto-higashiyama · 5180 Director UI · 5190 studio
server. All are `strictPort`, so a clash fails loudly rather than silently moving.
