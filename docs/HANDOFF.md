# Handoff — resuming this project on another machine

Read this first in a fresh Claude Code session (paste the "First prompt" at the bottom). It records what exists, how it was built, how to run it, and what is not finished. Written 2026-09-09 at commit `d48f16c` (54 commits ahead of `PhiloLabs/fable51-worlds` main).

## What this repository is

A fork of [PhiloLabs/fable51-worlds](https://github.com/PhiloLabs/fable51-worlds) (AI-built Three.js cities from GIS data) with two things added on top:

1. **MV Studio** (`studio/`) — a local music-video workbench: Director UI (Vite + TS) + Node server that drives a world in an iframe through a postMessage bridge and `window.__twin`; keyframe timeline; prompt→camera path (LLM or offline landmark planner); phone-as-virtual-camera over WebSocket; collision check + auto-fix of camera paths; deterministic headless previz (Playwright + ffmpeg); Seedance 2.5 finalize via the Higgsfield CLI (manual job card fallback); GLB export + Blender camera import; VARCO/any-GLB asset injector; per-machine API keys in a Settings panel; one-command launcher (`npm run up`).
2. **Pangyo Techno Valley world** (`pangyo-technovalley/`) — a third city built from OpenStreetMap + SRTM only, using a generalized copy of the union-square-sf runtime (place content is data, not code), hero modules generated with a portable headless Blender, life systems, ground cover, QA report.

Public repo: https://github.com/Daewooki/fable51-worlds (remote `origin`; PhiloLabs is `upstream`). A 69 s showreel is at `docs/media/mv-studio-showreel.mp4`; `studio/tools/showreel.mjs` rebuilds it.

## How it was built (so you can keep building the same way)

Superpowers workflow: brainstorming → written spec → task plan → subagent-driven development (a fresh implementer agent per task, an independent reviewer per task, fix rounds with rulings recorded in a ledger, a final whole-branch review). Everything is in the repo:

| Project | Spec | Plan | Ledger + task reports |
|---|---|---|---|
| MV Studio (12 tasks) | `docs/superpowers/specs/2026-09-05-mv-studio-design.md` | `docs/superpowers/plans/2026-09-05-mv-studio.md` | `docs/sessions/2026-09-05-mv-studio/` (`progress.md` is the ledger; `final-review.md`, `final-fix-report.md`) |
| Pangyo world (6 tasks, 3 stages) | `docs/superpowers/specs/2026-09-08-pangyo-world-design.md` | `docs/superpowers/plans/2026-09-08-pangyo-world.md` | `docs/sessions/2026-09-08-pangyo-world/` (`progress.md`, `final-review.md`, `showreel-report.md`) |

The ledgers list every ruling and every deferred minor. Read them before touching the areas they mention.

## Running it

```bash
# once
cd union-square-sf && npm install && cd ../kyoto-higashiyama && npm install && cd ../pangyo-technovalley && npm install
cd ../studio && npm install && npx playwright install chromium
# ffmpeg + ffprobe on PATH; a GPU (RTX-class) for previz; Node 22

# every time
cd studio && npm run up       # three worlds (:5173/:5174/:5175) + server (:5190) + Director (:5180)
npm run down                  # stop everything
```

Notes that cost time before:
- `union-square-sf`'s own `npm run dev` fails on a path containing a space (`tools/geo/sync_data.mjs` uses `.pathname`); the launcher calls `npx vite` directly, so use `npm run up`.
- Vite dev servers may listen on IPv6 `::1` only; anything probing ports must use `localhost`, not `127.0.0.1`.
- The studio server binds `127.0.0.1`; for the phone camera start with `STUDIO_BIND=0.0.0.0` and open the Director on the LAN IP.
- The Higgsfield CLI is installed but needs the creator's own `higgsfield auth login`; until then Finalize writes a job card.
- Tests: `cd studio && npx vitest run` (115 tests, needs all three worlds up), `cd pangyo-technovalley && npx vitest run` (74). E2E per world: `node studio/tools/e2e.mjs --world <name> --port 5197`.

## Tooling that is NOT in git (re-create on a new machine)

- **Portable Blender 4.2.9** for `pangyo-technovalley/tools/bpl/gen_pangyo.py`: unzip `blender-4.2.9-windows-x64.zip` from download.blender.org into `pangyo-technovalley/tools/blender/` (git-ignored). `npm run assets` in that package runs the generator. PyPI `bpy` wheels need Python 3.11 and were not usable.
- **Portable GitHub CLI**: `gh` was run from a downloaded release zip (not installed); `gh auth login --web` (device code), then `gh auth setup-git`. The user's GitHub login is `Daewooki`.
- **API keys**: entered in the Director's Settings panel → `studio/.secrets.json` (git-ignored). Env vars of the same name win.
- **Local backups**: `../backup/` next to the repo holds a full git bundle and the portable Claude context folder (`claude-context/`: memory files, ledgers, raw transcript, RESTORE.md).

## Moving to macOS (or Linux)

Everything was developed on Windows 11 with an NVIDIA GPU; the code paths that were Windows-specific are now platform-aware, but check these on first run:

- **Headless GPU flags** live in one place, `studio/server/render/browser.mjs` (`GPU_ARGS`): Windows forces ANGLE/D3D11; macOS passes no backend flag (Chromium picks Metal through ANGLE); the SwiftShader fallback is identical everywhere. If previz reports `softwareRender: true` on a Mac, run `npx playwright install chromium` again and check `chrome://gpu` in the launched profile; Apple-silicon Macs render the worlds fine in headed Chromium, so the fallback should not trigger.
- **Launcher** (`studio/tools/up.mjs`) uses `lsof`/`SIGTERM` off Windows — works on macOS as is.
- **Showreel fonts** (`studio/tools/showreel.mjs`): looks for Arial/Helvetica and Apple SD Gothic Neo on macOS (DejaVu/Nanum on Linux); it fails with a clear message if none is found.
- **Blender for the Pangyo hero generator** (`pangyo-technovalley/tools/bpl/run_blender.mjs`): on macOS install Blender 4.2 LTS to `/Applications` (found automatically) or set `BLENDER=/Applications/Blender.app/Contents/MacOS/Blender`; then `npm run assets` in `pangyo-technovalley/`.
- **GitHub CLI**: `brew install gh && gh auth login && gh auth setup-git`.
- **ffmpeg**: `brew install ffmpeg`.
- **Auto-memory slug**: it is derived from the directory Claude Code is started in, so it will NOT be the Windows name. See `RESTORE.md` in the portable context folder: start Claude Code once in the new checkout's parent directory, then copy `memory/` into the folder that appears under `~/.claude/projects/`.
- Line endings: the repo has no `.gitattributes`; files were committed with LF (git on Windows warned about CRLF conversion on checkout). On macOS nothing to do.

## Known limitations (all recorded in the QA reports)

- Pangyo streets are fitted to straight, axis-aligned lines (the runtime's street model); 판교역로 runs north–south in OSM and its strip overlaps 삼성화재/카카오 massing; signals collapse 58→6 fitted crossings; 판교역 has canopies but no station building/plaza; the road crosses the stream as a flat causeway; facades outside the three hero modules are generic. See `pangyo-technovalley/FINAL_QA_REPORT.md` (15 defects).
- Collision probe is a roof test (downward ray), not a wall test.
- Kyoto's adapter has no camera modes and no asset-override hook.
- Previz with `life: true` is non-deterministic frame to frame.

## Next steps that were discussed

1. Per-block street fitting for Pangyo (biggest quality jump), a 판교역 station box + plaza, a bridge deck over the stream.
2. Creator-supplied road-view photos into `pangyo-technovalley/photos/` for viewpoint matching.
3. One real Seedance finalize after `higgsfield auth login`.
4. VARCO batch styling once a `VARCO_API_KEY` exists (`studio/tools/varco_fetch.mjs` + `inject_asset.mjs`).
5. Threads/X launch posts (drafted in the transcript); repo social preview image = `docs/media/showreel-poster.jpg`.

## First prompt for a fresh session on the new machine

> Read `docs/HANDOFF.md`, then `docs/sessions/2026-09-08-pangyo-world/progress.md` and `docs/sessions/2026-09-05-mv-studio/progress.md`. The auto-memory for this project has been restored under `~/.claude/projects/<this project's slug>/memory/` — confirm you can see `fable51-worlds-mv-tool.md`. Then start the worlds with `cd studio && npm run up` and tell me what state everything is in before we continue with: <next task>.
