# Kyoto: Codex / GPT-6 Astra and Claude Fable 5.1

This is the **Codex one-shot submission** requested for the fable51-worlds evaluation. It packages the existing procedural Kyoto scene with the user's subsequent minimal-viewer revision. “One-shot” identifies one submitted build; the autonomous build itself included research, parallel agents and its own QA iterations. The original QA report retains the defects and below-target visual scores.

The model, materials and renderer were already built before the Fable Kyoto film was inspected for this comparison. This publication pass adds recording tools and documentation; it does not rebuild the scene to match Fable.

## Comparison method

The first **53.9 seconds** of the Codex recording follow the published Fable film's seven-beat order and timing, using corresponding pre-existing Codex viewpoints. This is **not an exact camera-matched geographic comparison**. Horizontal scale, camera positions, FOV, some subareas and lighting differ. Both native 1920×1080 recordings are displayed at equal size, without cropping or additional image grading. A label strip is added above the two complete frames. Codex is on the left; Fable is on the right, as in the Union Square evaluation.

| Time | Codex recording | Existing Fable film |
|---|---|---|
| 0–5.6 s | Aerial descent toward Yasaka Pagoda | Aerial descent toward Yasaka Pagoda |
| 6.1–13.3 s | Hanamikoji | Gion Shirakawa; the Codex scene has no canal |
| 13.3–20.5 s | Yasaka lantern court | Yasaka Maiden |
| 20.5–27.1 s | Maruyama blossom | Maruyama weeping cherry; no equivalent weeping tree in Codex |
| 27.1–35.1 s | Pagoda from the east, looking west | Pagoda from the west, looking east |
| 35.1–42.1 s | Sannenzaka steps | Sannenzaka steps |
| 42.7–50.9 s | Kiyomizu Nio-mon | Kiyomizu Saimon; no separate Saimon in Codex |
| 50.9–53.9 s | Hold on the final scene | Existing fade and title |

During Fable's two brief dips, Codex holds the preceding scene. Fable's existing captions, fades and closing sunset remain intact. Codex keeps its viewer's normal fixed lighting. No new fades, captions, grading or enhancement are applied to its canvas.

The **65.9-second standalone Codex walkover** adds the Kiyomizu timber stage and a whole-scene overview after the synchronized comparison ends. This is a camera tour with cuts, not a new continuous collision walkthrough. Historical movement tests are documented separately in the QA report.

## Reproduce

From this scene directory, start `npm run dev`, then:

```sh
node tools/record-comparison.mjs
node tools/encode-comparison.mjs
```

The recorder uses Playwright, locally installed Chrome, and FFmpeg. Set `KYOTO_CHROME` or pass `--chrome=/path/to/chrome`. Other options include `--url=http://localhost:5180`, `--out=media`, and `--samples=1`. The encoder expects the Fable MP4 in the sibling `kyoto-higashiyama/media/` folder; override with `--fable=/path/to/film.mp4`. Its label strip is generated with Canvas2D using the local Arial/sans-serif font.

The native animation loop is parked through a browser-injected requestAnimationFrame gate. Each recorded frame advances the world by 1/30 second, uses the normal viewer pipeline, and reads the actual canvas. The recorder does not change source geometry, lights, materials or post-processing. Aerials use the viewer's existing distance-dependent fog. Terrain-following shots query the same `heightAt()` as the scene.

`capture.json` records the source SHA-256, GPU/browser, shot parameters, camera clearance and runtime errors. Every recorded frame is checked against terrain height and building colliders. The MP4 is H.264/yuv420p with faststart. GIFs reduce resolution, frame rate and palette for GitHub playback: the four-second comparison preview is 960 px wide at 10 fps; the entire standalone walkover is 640 px wide at 8 fps. Both use a 128-color palette.

## Source material

- [Fable Kyoto camera timeline](../../kyoto-higashiyama/tools/tour_video.mjs)
- [Fable Kyoto source and existing film](../../kyoto-higashiyama/)
- [Union Square comparison convention](../../union-square-sf-gpt-astra/)
- [Codex model QA and geographic uncertainties](../FINAL_QA_REPORT.md)

All footage is rendered from the corresponding source world. Reference photographs are not used as rendered footage or redistributed as runtime assets.
