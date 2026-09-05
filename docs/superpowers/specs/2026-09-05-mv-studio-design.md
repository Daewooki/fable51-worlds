# MV Studio — design spec (2026-09-05)

## Goal
A local tool for music-video / video creators: pick a real place (a fable51 world), restyle it with VARCO assets, direct camera moves (web timeline + prompt + phone-as-camera), render a previz MP4 from the Three.js world, then finalize the shot with Seedance 2.5 (previz as the control signal, the real artist from reference images). Export MP4 + GLB (+ a Blender import script). Runs on the creator's PC. Digital-twin use shares the same core later.

Decisions (fixed): first product = creator tool · set = real place + VARCO styling · output = MP4 + 3D scene export · camera = web keyframe timeline + prompt→path AND mobile virtual camera · performer = Seedance `omni_reference` image/video refs, no 3D characters · deploy = local prototype · final pixels = Seedance 2.5.

## Architecture (approach A: repo = engine, thin app on top)
Worlds stay as they are (pure Three.js apps, one per place). MV Studio is a new package `studio/` that **drives** a world instead of re-implementing it.

```
fable51-worlds/
  studio/
    app/        Vite + TypeScript Director UI  (+ /phone page)
    server/     Node: HTTP + WebSocket, project store, job runner, drivers
    tools/      inject_asset.mjs (VARCO/any GLB -> world asset), varco_fetch.mjs
    schemas/    project + shot JSON schemas
    projects/   creator projects (gitignored)
  union-square-sf/   + studio bridge (postMessage) + asset override hook  (small patches)
  kyoto-higashiyama/ same patches (second world)
```

Three integration surfaces into a world, all already present or one-line patches:
1. `window.__twin` (QA harness): `setCamera / setTime / setMode / freeze / renderOnce / pos` — used by the headless render.
2. **Studio bridge** (new, ~60 lines per world, `src/debug/StudioBridge.ts`, enabled by `?studio=1`): exposes the same calls over `postMessage` so the Director UI can embed the world in an iframe and move its camera live.
3. **Asset override hook** (new, 3 lines in `Assets.load`): if `public/data/asset_overrides.json` maps `rel -> alt`, load `alt.glb` instead. This is how VARCO assets replace hero props without touching placement code.

## Components

### Project & shot model (`studio/schemas`)
```
Project { id, name, world: 'union-square-sf' | ..., createdAt,
          refs: { artist: [img...], style: [img...], audio?: file },
          shots: Shot[], finalize: SeedanceJob[] }
Shot    { id, name, fps: 30, width: 1920, height: 1080, timeOfDay: 'day'|'sunset'|'night',
          keys: Key[] }                       // same shape tools/qa/demo_video.mjs already uses
Key     { t, m: 'air'|'walk', eye?: [x,y,z], pos?: [x,z], look: [x,y,z], fov?, cut?, cap?, time? }
SeedanceJob { id, shotId, mode: 't2v'|'omni_reference'|'video_edit'|'video_extension',
          prompt, duration, resolution: '480p'|'720p'|'1080p', aspect, generateAudio,
          medias: { previz: 'video_references'|'edit_target', artist: 'image_references',
                    style?: 'image_references', audio?: 'audio_references' },
          driver: 'higgsfield-cli'|'manual', status, outputPath }
```
Keys interpolate with the ease/`sample(t)` logic lifted from `tools/qa/demo_video.mjs` into a shared `studio/schemas/keys.mjs` (also used by the UI scrubber), with one deliberate divergence: **`cut: true` marks the landing key.** The segment leading into a cut key holds the previous key's pose (no interpolation), the camera jumps at exactly the cut key's time, `sample()` reports `cut = true` during that key's first frame (so the walk foot height re-grounds), and the previz fades symmetrically ±0.3 s around the cut time. (demo_video.mjs instead fires the cut at the start of a dedicated lead-in segment; that convention is not expressible from a keyframe UI and never fires for a first key, which the phone recorder needs.) **A segment between two keys of different `m` (air→walk or walk→air) does not interpolate: it holds the destination key's pose for the whole segment and the camera jumps at the segment's start** — an MVP constraint inherited from `demo_video.mjs`'s sampler, which the Director UI flags with a warning under the keyframe list rather than silently smoothing over.

### Director UI (`studio/app`)
- **Viewport**: iframe of the world (`http://localhost:<world-port>/?qa=1&ui=0&studio=1&life=0`). Camera driven through the bridge; a scrubber samples `keys` and posts `setCameraRaw(eye, look, fov)`.
- **Timeline**: add / move / delete keyframes at the current camera; per-key mode air/walk, cut, caption, time-of-day; shot duration; fps / resolution.
- **Prompt -> path**: text like "aerial sweep over the plaza, then drop to street level and dolly toward Apple at sunset" -> keys. The LLM gets the world's landmarks (`public/data/viewpoints.json` + tour stops) as anchors and returns `Key[]` JSON validated against the schema. Model is pluggable (`STUDIO_LLM=anthropic|openai|varco`, env key); when no key is configured the panel offers the tour stops as manual anchors.
- **Phone camera**: QR opens `/phone` on the creator's phone (same LAN, HTTPS via mkcert). Phone streams `{q: quaternion, dolly, zoom}` at ~30 Hz over WebSocket -> server -> UI -> bridge. "Record" stores dense keys (one per frame) into the shot; previz replays them deterministically.
- **Render**: runs the previz job; shows frame progress; plays the MP4.
- **Finalize**: builds a SeedanceJob from the shot + refs; runs the driver; shows the result; keeps a job card (prompt, medias) so it can be re-run manually in Higgsfield web if the CLI path is unavailable.
- **Export**: GLB of the current world scene + `blender_import.py` + the shot's camera keys (Blender camera animation).

### Server (`studio/server`, Node 22, plain `http` + `ws`)
- `projects/*.json` store; static hosting of the app; WebSocket hub (rooms: `phone`, `director`).
- **Job runner**: sequential queue; job = `{ type: previz|finalize|export|inject, status, log, artifacts }`.
- **Previz render** (`render/previz.mjs`): generalization of `demo_video.mjs` — loads a shot JSON, launches Playwright chromium with Windows/NVIDIA flags (`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist --use-gl=angle`, swiftshader fallback), fixed-dt stepping via an injected `window.__demo.frame` (this exact code path is proven: 5.9M tris renders on this PC after a ~15 s load), PNG frames -> `ffmpeg -framerate fps -i %05d.png -c:v libx264 -pix_fmt yuv420p` -> `projects/<id>/shots/<shot>/previz.mp4`.
- **Seedance driver** (`finalize/seedance.mjs`): the `higgsfield-cli` driver spawns `higgsfield generate create seedance_2_5 ...` with mode / prompt / medias / duration / resolution and `--wait`, then downloads the MP4. The `manual` driver writes `job.md` with the exact inputs. Auth is the creator's own `higgsfield auth login` (never stored by us).
- **Export** (`export/glb.mjs`): Playwright + in-page `GLTFExporter` (three 0.185, instancing via `EXT_mesh_gpu_instancing`) on the `world / props / vegetation` groups -> `scene.glb`; `export/blender_import.py` imports it and keys the camera from the shot.

### VARCO asset adapter (`studio/tools`)
- `inject_asset.mjs <in.glb> --world union-square-sf --as varco/<name> --kind prop --height 2.1 [--replace street/bench_plaza] [--budget 2000]`:
  1. read the GLB with `@gltf-transform/core`;
  2. scale so bbox height = `--height` metres (or `--scale`);
  3. re-origin to bottom-centre, front -> -Z;
  4. `weld + simplify` to `--budget` tris (`@gltf-transform/functions`);
  5. keep the asset's own PBR textures — the world's `Materials.remap` only touches known material names, so VARCO materials pass through untouched;
  6. write `public/assets/models/varco/<name>.glb` + a `manifest_varco.json` entry `{ file, tris, bbox_threejs, sizeBytes, kind, height, footprint }`;
  7. if `--replace`, add the mapping to `public/data/asset_overrides.json`.
  The world loads the `varco` manifest category (one-token change in `main.ts`).
- `varco_fetch.mjs --image ref.png --name ...`: calls the VARCO API Platform image-to-3D when `VARCO_API_KEY` is set (endpoint shape to be confirmed against api.varco.ai docs — NC AI is an NCSOFT subsidiary, internal access is the expected path); otherwise prints the manual steps (VARCO 3D web -> export GLB -> inject). Text-first styling: VARCO Art image -> image-to-3D.
- Early styling without 3D swaps: VARCO Art images as `style` refs in the Seedance job.

## Data flow (one shot, end to end)
1. Creator picks a world + shot -> sets keys (timeline / prompt / phone recording) -> sees it live in the viewport.
2. `Render` -> `previz.mp4` (deterministic, same keys).
3. `Finalize` -> SeedanceJob { mode `video_edit` on the previz (keeps camera and blocking) or `omni_reference` with the previz as `video_references` + artist `image_references` (+ style, audio) } -> `final.mp4`.
4. `Export` -> `scene.glb` + `blender_import.py` + `keys.json`.

## Error handling
- Render: world load timeout (240 s) -> fail with the vite log tail; GPU init failure -> retry with swiftshader and mark `softwareRender: true`; ffmpeg missing -> actionable message.
- Finalize: CLI not installed / not logged in -> switch the job to `manual` and emit `job.md`; model rejects medias -> surface the CLI error verbatim; every job keeps stdout/stderr.
- Phone: WS drop -> UI shows "reconnecting" and recording pauses; DeviceOrientation permission denied -> instructions (HTTPS + iOS prompt).
- Inject: non-GLB / no meshes -> reject; budget unreachable -> warn and keep best effort; override target not in the manifest -> error listing valid rels.

## Testing
- Unit (vitest): `keys.mjs` sampler (air / walk / cut / ease), schema validation, `inject_asset` normalization (scale / origin / tri count) on a fixture GLB, SeedanceJob -> CLI argv builder.
- Integration: a 2-second shot previz produces an MP4 with 60 frames (ffprobe `nb_frames`); inject a fixture asset with `--replace street/bench_plaza` and assert via Playwright that `Assets.manifest['varco/bench_test']` exists and the override is honoured; WS relay echo; export produces a GLB that `@gltf-transform` parses with more than zero meshes.
- Manual e2e: one real Seedance job through the CLI (needs the creator's login); phone capture on a real device.

## Out of scope (MVP)
3D characters / VARCO Human; authoring new places (that stays the repo's agent process — add a world = run the recon / asset / QA pipeline, then it works in Studio unchanged); cloud deploy and accounts; Blender rendering (export only); Seedance via any provider other than the Higgsfield CLI / manual path.

## Environment (verified 2026-09-05)
Node 22.14 / npm 10.9, Python 3.9, ffmpeg 7.1, Playwright chromium installed, NVIDIA RTX 3070 (the world renders with d3d11 flags), `@higgsfield/cli` installed globally, Blender not on PATH, no `gh` CLI (fork remote to be added manually).
