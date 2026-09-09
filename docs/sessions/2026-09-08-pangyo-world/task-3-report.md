# Task 3 report — studio integration + stage-1 previz (target cut)

Status: **DONE_WITH_CONCERNS** (every acceptance check passes; the concerns are listed in §8
and one of them needs an action from the controller — the long-running studio server on
:5190 still holds a stale `WORLDS`).

Commit: `dc7ba61` — `feat(studio): pangyo-technovalley world (stage 1)` (16 files, +500/−57).

---

## 1. Registry edits

Every studio registry from the controller's verified list now carries `pangyo-technovalley`.

| file | change |
| --- | --- |
| `studio/schemas/project.mjs` | `WORLDS` → `['union-square-sf', 'kyoto-higashiyama', 'pangyo-technovalley']` |
| `studio/app/src/main.ts:14` | `WORLD_PORTS` += `'pangyo-technovalley': 5175` |
| `studio/app/src/main.ts:232` | `worldSupportsModes` was `ctx.project?.world === 'union-square-sf'`; now `MODE_WORLDS = new Set(['union-square-sf', 'pangyo-technovalley'])` + `MODE_WORLDS.has(ctx.project?.world ?? '')`, with a comment saying why (pangyo runs a generalized copy of union's runtime, same `setMode`) |
| `studio/tools/up.mjs` | `WORLDS` += `'pangyo-technovalley': { port: 5175 }`; `ALIASES` += `pangyo`; the `--stop` message is now derived from the port list instead of the hard-coded `'5173/5174/5180/5190'`; header comments updated |
| `studio/package.json` | new `up:pangyo` script (mirrors `up:union` / `up:kyoto`) |
| `studio/tools/e2e.mjs` | header: `--world pangyo-technovalley` example, "5173 / 5174 / 5175", and a note that `--port` (default 5191) is the throwaway server's port and must stay off :5190 |
| `studio/README.md` | setup (three `npm install`s), running (`up` = three worlds, `up:pangyo`, `down` port list), by-hand commands, the architecture diagram's iframe ports, prompt→path anchors, the "register a world" contract step, tests (three bridge tests, three e2e invocations), the ports troubleshooting line, "both worlds" → all three, and a `pangyo-technovalley` column in the **Measured on** table |
| `README.md` (root) | a `판교테크노밸리, Seongnam` section with the target-cut video + still, and a three-row world table (world · geometry source · dev port · status), incl. `Pangyo Techno Valley — OpenStreetMap + SRTM — 5175` |

`studio/server/render/browser.mjs` already had `'pangyo-technovalley': 5175` (Task 2).

Per the ruling, the `GEO` table in `prompt.mjs` was **not** touched: pangyo ships no
`viewpoints.json`, so there is nothing to convert from lat/lon, and `tour.json` is enough.

## 2. `anchorsFor(world)`

`studio/server/prompt.mjs` gained a `tourStops(world)` helper and one line in `anchorsFor`:

```js
const tour = tourStops(world) || TOURS[world] || [];
const out = tour.map((t, i) => ({ id: `tour${i}`, title: t.title || `stop ${i + 1}`, pos: t.pos, look: t.look }));
```

`tourStops` reads `<repo>/<world>/public/data/tour.json` (path built from `import.meta.url`
via `fileURLToPath`, as the module already did), requires an array, and keeps only entries
with 3-element `pos` and `look`; anything else (missing file, bad JSON, empty result) returns
`null` and the hard-coded `TOURS` table is used exactly as before. Verified: neither
`union-square-sf` nor `kyoto-higashiyama` has a `public/data/tour.json`
(`kyoto-higashiyama/public/data/` does not exist at all), so their anchor lists are
byte-identical to before — `prompt.test.mjs`'s two existing cases still pass unchanged.

The `viewpoints.json` half of `anchorsFor` is untouched and still gated on the `GEO` table,
so union keeps its extra anchors.

## 3. The target cut

**Ruling 2, as delivered:** 8 s · 1920×1080 · 30 fps · sunset · 240 frames — aerial over the
NC R&D Center, descend past the tower/podium, then dolly **south** down 판교역로 toward
판교역.

Blocked and rendered by driving the **real Director UI** on :5180 with Playwright
(`studio/tools/stage1_targetcut.mjs`, committed): create project (world select →
`pangyo-technovalley`) → create shot (30 / 1920 / 1080 / sunset) → wait for the world iframe's
bridge (`window.__studio`) → `ctx.shot.keys = …; await ctx.save(); ctx.refresh()` → click
**Check path** → (**Fix path** if not clear) → click **Render previz** → poll the job.

*Deviation from the ruling's suggested plumbing:* the driver starts **its own** studio server
on :5193 (pointed at the repo's real `studio/projects`) and rewrites the Director's `/api`
and `/files` requests to it with `page.route(...).fulfill()`. It had to: the studio server
running on :5190 was started before this task's edit and its in-memory `WORLDS` rejects
`pangyo-technovalley`, and killing it was refused by the sandbox (see §8.1). The UI, the
bridge, the path check and the job runner are all the real ones.

**Keys as saved in the shot** (metres, `x` grid-east, `z` grid-south, `y` up):

```json
[
  { "t": 0.0, "m": "air", "eye": [40, 140, 220], "look": [0, 20, 0],     "cap": "NCSOFT R&D Center · 판교테크노밸리" },
  { "t": 2.2, "m": "air", "eye": [26, 66, 110],  "look": [0, 28, 10] },
  { "t": 4.0, "m": "air", "eye": [86, 30, 10],   "look": [90, 8, 250] },
  { "t": 6.0, "m": "air", "eye": [80, 55, 110],  "look": [92, 10, 370] },
  { "t": 8.0, "m": "air", "eye": [45, 85, 300],  "look": [105, 12, 530], "cap": "판교역 · 알파돔시티" }
]
```

Key 1 is `tour.json` stop 1 verbatim. Keys 2–5 follow stops 2–5 in order (NC forecourt →
판교역로 corner → southbound leg → 판교역) with **authored altitudes**, and keys 2 and 5 pulled
back from the stops' own ground positions. Why, with evidence:

- The tour's eye heights are street level (stop 2 `y = 0.5`, stop 3 `y = 2.2`). An 8 s move
  through them dives 140 m and climbs back out twice.
- 판교역로 is fitted to a straight, axis-aligned `StreetSpec` (`axis ns`, `c = 85.09`, width
  29.25 m). A downward-probe scan along the corridor (x ∈ {70, 78, 85, 92, 99}, z from −60 to
  580 in 10 m steps) shows massing **on** the carriageway: 58–59 m at `x ≥ 92, z 210–260`
  (삼성화재 판교사옥), 50–55 m at `x ≥ 85, z 280–330`, 60 m at `x ≥ 70, z 390–490`
  (카카오 판교아지트, h 66), 76 m at `z ≥ 560`. So the southbound leg climbs over them.
- Stop 5 (`[168, 22, 500]` → `[200, 14, 545]`) probes clear (roof test) but is 20 m from the
  façade of an unnamed 28 m block at `[174, 547]`, and the first take's frame 239 was that
  wall filling the frame. There is no station building or plaza modelled at 판교역 — only OSM
  `public_transport`/`subway_entrance` nodes — so the cut ends above and north of the station
  looking down on the 알파돔시티 cluster.

Framing was chosen empirically: ~30 candidate poses were rendered as single 960×540 frames
through `launchWorld` + `probePath` before committing to a 2-minute render (scratchpad only,
nothing committed).

### Collision check / fix outcome

- **Shipped cut:** *path clear — no collisions* on the **first** check (`probePath` at 10 Hz
  plus every key time, clearance 1.0). **Fix path** was therefore not needed and did not run.
  This is the brief's intended outcome ("collision check clear (fix path if not)").
- **Fix path was still exercised on this world**, on the first take of the cut, which used
  the tour's own altitudes: the check reported *3 collisions (0.5 s)* —
  `3.3–3.3s: air segment 2→3 passes through a structure (surface at 57 m)`,
  `6.4–6.7s … (58 m)`, `7.2–7.3s … (60 m)` — and **Fix path** returned
  *path fixed — 7 keys inserted to fly over structures* with the status line then reading
  *path clear — no collisions*. The fixed path is correct but yo-yos between y = 20 and
  y = 70 m, which is why the shipped cut is authored to be clear rather than fixed.

### Render

| | |
| --- | --- |
| previz wall time (240 frames @ 1920×1080) | **124.2 s** (0.52 s/frame) |
| world load in the Director iframe | 11.6 s |
| whole driver run (server up → mp4 on disk) | 139.0 s |
| `softwareRender` | **false** (GPU, ANGLE d3d11, RTX 3070) |
| studio artefact | `studio/projects/e08e7a26-fccd/shots/4d42d543-e1aa/previz.mp4`, 16.4 MB (`-crf 18`) |

Copied to the world (all committed):

- `pangyo-technovalley/docs/stage1-target-cut.mp4` — re-encoded `-crf 28`, **3.5 MB** (limit 15 MB)
- `pangyo-technovalley/docs/stage1-f000.png` / `-f120.png` / `-f239.png` — 1280 px wide

f000 is the establishing aerial with the NC tower centre frame; f120 is 판교역로 running
south from 30 m with lane markings, kerbs, street trees and lamps; f239 is the 판교역 /
알파돔시티 cluster with the caption.

Recorded in `pangyo-technovalley/README.md` under **Stage 1 — target cut** (keys JSON, wall
time, `softwareRender`, collision-check outcome, and the three reasons the altitudes are
authored), plus a new **MV Studio** section (ports, registries, the tour.json anchor rule,
the three commands).

## 4. Tests

**`studio/test/pangyo.test.mjs`** (new, 4 tests):

1. `WORLDS` contains `pangyo-technovalley` and `WORLD_PORTS['pangyo-technovalley'] === 5175`.
2. `launchWorld({ world:'pangyo-technovalley', width:640, height:360, time:'sunset' })` →
   `__twin.ready`; asserts the exact shape previz and the path check reach for
   (`app.updatables` array, `renderer.render`, `time.update`, `elapsed`, `world.collision.floorAt`,
   `world.terrain.heightAt`, `probePath`, and the `world`/`props`/`vegetation` groups).
   It waits for `typeof __twin.probePath === 'function'` first — StudioBridge installs it a
   beat after `ready` flips (the same wait the world's own `test/boot.test.mjs` does).
   Note `__twin.pos()` on this world is union's QA `{x,y,z,heading}`, not kyoto's
   `{eye,look,fov}`; the test asserts that, with a comment.
3. `renderPreviz` of a 2 s two-key air shot (tour stop 1 → stop 2 raised to `y = 80`) at
   320×180 → `frames === 60` and ffprobe counts 60.
4. `exportGlb` for a pangyo project → parses with `NodeIO().registerExtensions(ALL_EXTENSIONS)`
   with `listMeshes().length > 0`, `blender_import.py` written.

**`studio/test/prompt.test.mjs`** (extended, +2 cases): `anchorsFor('pangyo-technovalley')`
has ≥ 6 anchors, every one with finite 3-vectors `pos`/`look` and a string `title`, and
`a[0].pos` is `[40, 140, 220]` (the stop itself, not a studio copy); plus `anchorsFor` on an
unknown world is `[]`. The two pre-existing union/kyoto cases are untouched and pass.

## 5. e2e

```
$ cd studio && node tools/e2e.mjs --world pangyo-technovalley --port 5194
…
[152.1s]   ok — shotB previz.mp4 written (25.34 MB)
[152.1s]   ok — shotB rendered 300 frames
[155.6s]   ok — shotB ffprobe counts 300 frames in the mp4
[155.6s]   ok — shot B used the GPU path (softwareRender:false)
[155.6s]   ok — finalize fell back to the manual driver
[164.7s]   ok — scene.glb written (18.2 MB)
[164.7s]   ok — glb parses with ALL_EXTENSIONS and has 565 meshes
--- timings (pangyo-technovalley) ---
   14.7s  previz shot A (2 s, 640x360, 60 frames)
  138.5s  previz shot B (10 s, 1920x1080, 300 frames)
    9.2s  export GLB + keys + Blender script
  164.7s  TOTAL

PASS e2e pangyo-technovalley
```

`--port 5194` keeps it off :5190 (the live server) and :5193 (the target-cut driver).
Those numbers are the new `pangyo-technovalley` column in `studio/README.md`'s
**Measured on** table.

## 6. Full suite and typecheck

```
$ cd studio && npx tsc --noEmit -p app        # rc 0, no output

$ cd studio && npx vitest run                 # all three world dev servers up
 ✓ test/pangyo.test.mjs (4 tests) 48450ms
 ✓ test/prompt.test.mjs (6 tests) 14ms
 ✓ test/kyoto.test.mjs (2 tests) 74617ms
 ✓ test/previz.test.mjs (1 test) 46015ms
 ✓ test/browser.test.mjs (3 tests) 42614ms
 ✓ test/export.test.mjs (1 test) 37045ms
 … 20 files total
 Test Files  20 passed (20)
      Tests  111 passed (111)
   Duration  79.47s
```

## 7. Deviations

1. **The target cut was driven through the Director UI (the ruling's primary suggestion) but
   against a private studio server on :5193**, with `/api` and `/files` proxied into it by
   Playwright request interception, because :5190's `WORLDS` is stale and killing that
   process was refused by the sandbox. See §8.1.
2. **The keys are not the tour stops verbatim** beyond stop 1 — altitudes are authored and
   keys 2/5 are pulled back. Justified in §3 with probe evidence; documented in the world
   README so nobody mistakes them for surveyed values.
3. **The cut ends north of and above 판교역 rather than at tour stop 5.** The stop is
   probe-clear but frames a façade, and there is no station geometry to arrive at yet.
4. **`Fix path` did not run on the shipped take** because the check was clear first time.
   Its behaviour on this world is evidenced from the first take (§3) rather than from the
   shipped one.
5. **`studio/tools/stage1_targetcut.mjs` is committed** although the brief did not list it as
   a file to create. It is what makes the deliverable reproducible, and the world README
   points at it.
6. **`studio/package.json` gained `up:pangyo`** (not in the brief's file list, but the
   obvious companion to `up:union` / `up:kyoto` and to the `up.mjs` change).
7. The root README has no literal "world table"; I added one (three rows) under the new
   Pangyo section rather than inventing a place for a single row.

## 8. Concerns

1. **The studio server on :5190 is stale — it will reject `pangyo-technovalley` projects
   until it is restarted.** Its `WORLDS` was loaded before this commit. I could not restart
   it: `taskkill` on its pid was blocked by the sandbox classifier, and `node tools/up.mjs
   --stop` would have killed the three world dev servers and the Director UI, which the brief
   forbade. **Action for the controller:** restart just that process (`cd studio && node
   server/index.mjs`, or `npm run down && npm run up`). The Director UI on :5180 is Vite dev
   and picks the change up on a page reload; the world dev servers are unaffected.
2. **`판교역로`'s straight axis-aligned fit runs through buildings** (58–59 m at z 210–260,
   60 m at z 390–490, 76 m at z ≥ 560). This is Task 2's concern 2, now quantified with a
   probe scan, and it is the single biggest constraint on camera work in this world. A
   per-block split of long streets in `build_streets.mjs`, or curved street support, would
   pay for itself in stage 2/3.
3. **There is nothing at 판교역 to arrive at.** OSM gives platform/entrance nodes and the
   surrounding towers, but no station building, canopy or plaza, so the money shot of the
   brief's cut has no subject. A stage-2 hero module (판교역 entrance canopy is already in
   the spec) would fix it.
4. **`probePath` is a roof test, not a wall test** (documented in `studio/README.md`). Three
   of the first take's frames were "clear" and full of façade. Anyone blocking shots in a
   dense world should expect to look at frames, not just at the status line. A cheap wall
   probe (horizontal ray from the eye toward the look point) would be a real improvement to
   `pathcheck.ts`, but it is out of scope here.
5. **The GLB export at 18.2 MB / 565 meshes** is much smaller than union's (39.7 MB / 1229)
   — expected (procedural façades, no interiors, no hero modules) but worth re-measuring
   after stage 2 adds heroes.
6. **`.gitignore` has an uncommitted modification** (`pangyo-technovalley/tools/blender/`)
   left over from an earlier task. I left it alone and did not include it in this commit.
7. Task 2's concerns 1 and 3–7 (untested `Plaza.ts`, `lanes` clamped to 6 on a 9-lane road,
   24 % of nav nodes pruned, leftover Nintendo-IP character GLBs, union's dead code in
   `Streets.ts`, the `manifest missing varco` warning) are unchanged by this task.

## 9. Files touched

```
studio/schemas/project.mjs            WORLDS
studio/app/src/main.ts                WORLD_PORTS, MODE_WORLDS/worldSupportsModes
studio/server/prompt.mjs              tourStops() + anchorsFor()
studio/tools/up.mjs                   WORLDS, ALIASES, --stop text, header
studio/tools/e2e.mjs                  header text
studio/tools/stage1_targetcut.mjs     new — Playwright driver for the target cut
studio/package.json                   up:pangyo
studio/test/pangyo.test.mjs           new — 4 tests
studio/test/prompt.test.mjs           +2 tests
studio/README.md                      ports, worlds, up, anchors, contract, tests, timings
README.md                             Pangyo section + world table
pangyo-technovalley/README.md         MV Studio + Stage 1 — target cut
pangyo-technovalley/docs/stage1-target-cut.mp4   3.5 MB
pangyo-technovalley/docs/stage1-f000.png, -f120.png, -f239.png   1280 px
```

`union-square-sf/` and `kyoto-higashiyama/` were not touched. No dev server was killed.
