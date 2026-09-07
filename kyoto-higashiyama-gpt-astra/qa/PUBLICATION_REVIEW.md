# Codex Kyoto publication review — September 7, 2026

## Scene and package

- Complete source copied into `kyoto-higashiyama-gpt-astra/`; the existing Fable Kyoto and both Union Square scenes are preserved.
- Fresh `npm ci` and production build pass. Dependency installation reports zero known vulnerabilities at verification time.
- All 19 current viewer checks pass against the built scene served under a nested URL, including orbit, pan, zoom, six viewpoints, reset, fullscreen, screenshot export and mobile sizing.
- All 34 original final hero PNGs are present. Reference photographs and intermediate image iterations are excluded; source URLs and the original model QA findings are retained.
- README, comparison notes, reference documents and the QA report have no missing local Markdown link targets.
- The packaged source hash matches the actual recorded source: `de70a946169184714107d97aa79e7d2d44c424a25f3458bbd5c1c01c35d656ea`.

## Recording

- 1,977 native 1920×1080 frames, 30 fps, 65.9 seconds.
- Every frame checks terrain clearance and building-collider intersections: **zero obstructed frames**, minimum clearance **1.68 m**, and zero browser runtime errors.
- An independent reviewer inspected 27 start/mid/end camera samples. The pagoda camera's 6.2 m push overexposed the near eave; reducing its travel to 2 m fixed that capture issue without changing the scene. The revised production image received a separate review.
- The entire-model overview intentionally exposes the model's boundaries. It is a technical extension after the synchronized comparison, not an immersive street camera.
- Native canvas frames use the original lighting, geometry and post pipeline. The fixed animation timestep is independent of capture wall time.

## Media and comparison

- The 53.9-second comparison preserves both complete 1920×1080 source frames, side by side, plus an 80 px model-label strip. Codex is left; Fable is right.
- Exact timing, nonmatching subareas, opposite pagoda viewpoints, differing scale/FOV and fixed-versus-changing lighting are disclosed in [COMPARISON.md](../media/COMPARISON.md). No exact geographic camera match is claimed.
- Both MP4s and both GIFs decode completely without errors; dimensions, duration and frame counts are recorded in [media-verification.json](media-verification.json). Native Chrome playback and GIF animation are tested.
- The comparison preview is four seconds at 960×290. The full walkover GIF is 640×360 and 65.88 seconds after GIF time quantization. The 1080p MP4 is the full-quality standalone recording.

The publication and capture checks do not supersede the original artistic assessment. The scene retains its **7.64/10** combined final visual review and documented geographic uncertainties.
