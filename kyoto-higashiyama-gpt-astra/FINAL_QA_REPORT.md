# Kyoto — model QA and viewer revision

**Publication package — September 7, 2026:** submitted as Codex's one-shot result in `kyoto-higashiyama-gpt-astra/`. The current production build and all **19 viewer checks** pass, with no browser runtime errors. The scene source is unchanged by the comparison recording; production asset paths are now relative. See [comparison methodology](media/COMPARISON.md) and [capture metadata](media/capture.json). The comparison follows Fable's timing but has different camera framing and incomplete subarea correspondence; it is not a geographically camera-matched evaluation.

**Evidence selection:** the counts and reviews below describe the original build process. This public package retains all 34 final hero PNGs, current viewer captures, review reports, movement/performance JSON, and the final walking endpoint image. Intermediate capture directories and the other 38 original walking images are omitted. The 10 copyrighted research photographs are also excluded; original source URLs remain in [the reference ledger](docs/REFERENCES.md). Statements below about earlier captures being retained refer to the original local working archive, not this selected public package. The original 7.64/10 visual review and unresolved geographic/artistic limitations remain in force.

**Viewer revision — September 5, 2026:** the scene now opens directly in a minimal orbit/pan/zoom viewer at [localhost:5180](http://localhost:5180). The landing page, app panels, walking/discovery flows and audio interface have been removed from the runtime. Current controls are tested by `npm run qa`; see [viewer-verification.json](qa/viewer-verification.json) and [viewer screenshots](qa/viewer/). The original model, geographic reviews and screenshots below are retained; the earlier app and walking tests are historical evidence.

Build reviewed September 4, 2026 in America/Phoenix; final image manifest timestamp **2026-09-05T00:19:09.133Z**. The application runs at [localhost:5173](http://localhost:5173). Original screenshots can be browsed in the [viewpoint gallery](http://localhost:5173/qa/gallery.html).

**Status:** the procedural Three.js environment, connected walking route, interaction systems and QA tooling are implemented and working. Quantitative scale and representative desktop performance targets are met. **The requested artistic completion bar is not met:** the final image reviews average **7.64/10**, and only three of 34 views reach an overall 8. No 9/10 geographic or Sakura Crossing style certification is claimed. Remaining discrepancies are recorded below rather than hidden by generous scores.

## Delivered scope

| Item | Verified result |
|---|---:|
| Named districts / subareas | 19 |
| Authored primary buildings, including hero structures | 166 |
| Detailed shopfronts | 148 |
| Additional simplified context buildings | 385 |
| Major landmark groups | 5 |
| Registered interaction points | 258 |
| Interaction points passing the approach scan | 241 |
| Tracked prop assemblies | 518 |
| Individual paving stones | 4,829 |
| Vegetation placements | 824 |
| Trees within that vegetation count | 647, including 82 sakura |
| Shrubs / bamboo clumps | 169 / 8 |
| Instanced canopy clusters | 21,536 |
| Ground petals / moving petals in spring | 3,690 / 150 |
| Main route length | 688.04 world metres |
| Tested walk with alley and pagoda detours | 945.80 world metres |
| Relative elevation at the main temple stage | 44 m above the starting datum |
| Final hero images | 34, each exactly 1600 × 900 |
| Real-time walkthrough images | 39 |
| Distinct completed real-reference comparisons | 9 |
| Reference ledger entries / full-size documentation images | 23 / 10 |

Buildings and props are counted as assemblies, not individual cubes. One stocked pottery shelf counts as one prop; its bowls do not inflate the count. The prop total is a conservative set of named assemblies and omits some structural shrine furniture and small components. The vegetation code's `trees` field counts all placements; the table separates actual trees from shrubs and bamboo. Distant basin instances are excluded from the 166 primary and 385 context building counts.

The five landmark groups are Yasaka Shrine, Hōkan-ji/Yasaka Pagoda, Kiyomizu's Nio Gate, its three-storey pagoda, and the main hall/wooden stage. The three-storey pagoda has its own correctly named interaction; it is not described as Hōkan-ji.

## Source and rendering

The runtime uses JavaScript, Three.js 0.180.0, Canvas2D and browser-native APIs, built with Vite. No other game engine, physics engine, React Three Fiber, external 3D models or photographic facade assets are used.

The source-level Sakura Crossing study is documented in [REFERENCE_RENDERER.md](docs/REFERENCE_RENDERER.md) and [REFERENCE_WORLD.md](docs/REFERENCE_WORLD.md). The requested renderer, outline, palette, texture, player and world modules were inspected before implementation. The study informed colored toon ramps, real shop recesses, Canvas signage, selective inverted hulls, centralized vegetation, static material batches and screenshot hooks. Adapted MIT source retains attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The pipeline renders half-float scene color and depth, linearizes depth for a second-difference ink operation, applies a warm-paper/violet grade, then FXAA. Blossom and green foliage encode a material mask to soften internal ink while preserving depth silhouettes. Exported images remain opaque with ink and grade disabled. There is no bloom, depth of field or motion blur. Warm sun, cool fill, hemisphere light and restrained hero-material fill retain visible timber under the eaves.

`heightAt()` supplies the shared walkable surface. `terrainAt()` supplies earth below elevated decks; both visible surfaces are modeled. Exact stair risers, terrain-following roads, architectural terraces and the Kiyomizu ravine are part of that shared contract. Lightweight collider movement uses substeps and step-height limits.

## Runtime, movement and interface checks

- **Production build:** `npm run build` passes. Dependency audit reports zero known vulnerabilities at verification time.
- **Runtime suite:** all **21 checks pass**, with no browser runtime/console errors and WebGL error 0. See [runtime-verification.json](qa/runtime-verification.json).
- **Controls:** verified settings, ink, grade, autumn/spring geometry colors, time of day, photo freeze/advance, route navigation, coordinate HUD, ambient sound and a real E-key discovery response.
- **Interactions:** the collision-free, facing/range/occlusion approach scan reaches 241 of 258 points. Seventeen fail the finite candidate scan; this is not a pathfinding proof that every other point is reachable. Interactions include shrine water/bell/fortune, tea and food, craft displays, signs, benches, cats, vending and stamps. They are lightweight responses and object/audio accents, not full shop simulations.
- **Deterministic walk:** the real `Player.update(1/60)` controller passes 38 segments, including the Ishibe loop and pagoda detour, without intermediate teleportation or stalls. Evidence: [controller-full-route.json](qa/walkthrough/controller-full-route.json).
- **Rendered walk:** a separate wall-clock controller run covers **945.795 m in 151.918 seconds**, with no stalls or errors. Maximum sampled ground-height change is **0.161 m**. It finishes by turning west at the same player position and normal 1.68 m eye height. See [livewalk/result.json](qa/livewalk/result.json) and [the final westward view](qa/livewalk/39-walk.png).
- **Camera audit:** all 34 final images are exactly 1600 × 900; all cameras are above their local terrain and intersect zero building colliders. Photo cameras may be elevated; this is distinct from the physical walker. See [camera-audit.json](qa/final/camera-audit.json).
- **Interface:** desktop 1600 × 1000 and mobile 390 × 844 screenshots were inspected. The gallery loads all 34 images, and the two pagodas have distinct interaction labels. See [interface-verification.json](qa/interface-verification.json), [desktop](qa/preview.png) and [mobile](qa/preview-mobile.png).

The in-app Browser connection was unavailable during this session. Automated visual and movement tests therefore used local Chrome through Playwright, with its actual Apple GPU. Software-rendered diagnostics were not used to claim desktop FPS.

## Performance

Test environment: Apple M5 Pro, Chrome 152, ANGLE Metal, 1920 × 1080 output. Internal scene render target: 2065 × 1161 under the 2.4-million-pixel budget. Each representative view receives 45 warm-up frames followed by 180 measured animation frames. Other QA browsers were closed. Values around 60.1 reflect timer quantization around a 60 Hz refresh rate.

| View | Average FPS | 1% low | Draw calls | Submitted triangles |
|---|---:|---:|---:|---:|
| Hanamikoji | 60.13 | 59.52 | 1,501 | 3,229,163 |
| Yasaka court | 60.05 | 59.52 | 185 | 561,677 |
| Yasaka-dōri / pagoda | 60.10 | 59.52 | 562 | 1,272,391 |
| Sannenzaka | 60.10 | 59.52 | 503 | 1,621,639 |
| Kiyomizu stage | 60.17 | 59.52 | 3,138 | 5,986,931 |

Raw evidence: [performance.json](qa/performance.json). These are static camera samples with ambient movement active, not a claim about every desktop GPU or every frame along the route.

The image-recording walk averages **59.44 FPS**, with **30.61 FPS 1% low** and an 83.4 ms worst interval. Its timing includes PNG readbacks/writes, first-visit geometry uploads and moving shadow recentering. The separate **walk without screenshot export averages 59.98 FPS, with a 57.05 FPS 1% low** over 151.76 seconds. All 38 segments pass, including first-visit uploads and moving shadows. Its worst individual interval is 66.7 ms. The slightly different 947.60 m travelled reflects wall-clock steering around corners. Evidence: [movement-profile/result.json](qa/movement-profile/result.json).

Whole-scene triangle equivalents, including instances and outline shells: **6,243,640**. Mesh objects: **3,069**; instanced meshes: **102**; shadow-casting mesh objects: **1,153**. **44,673** eligible source meshes become **2,231** spatial/material batches. Draw calls across the 34 capture cameras range from **67 to 3,138**; the upper end remains substantial despite acceptable results on this GPU.

The material-texture estimate is **130.33 MiB**, plus **54.87 MiB** estimated color/depth render-target storage. This is an allocation estimate, not a driver VRAM measurement; it excludes geometry, shadow targets and implementation overhead. There are 134 unique material textures. The warmed profiler observes 102–139 allocated renderer textures as views expose more assets.

Scene CPU submission samples are 2.8–7.3 ms; post submission samples are 0.0–0.1 ms at the browser timer's resolution. **GPU pass times were not measured.** Zero reported post CPU time does not mean zero GPU work. Static shadows refresh on camera-grid movement and time changes, avoiding needless redraws while standing still.

## Reference and review evidence

The geography uses a Gion-Shijo datum near **35.0038 N, 135.77259 E**, +X east and +Z south, with approximately 0.30 horizontal distance compression. Doors, steps and props retain human scale. The route preserves Hanamikoji's north/south direction, Yasaka's west entrance and internal north/south axis, the downhill westward pagoda reveal, southward Ninenzaka/Sannenzaka climbs, eastward Kiyomizu approach and south-projecting stage.

The **nine completed reference comparisons** cover whole-route OSM topology, both official precinct plans, Hanamikoji frontage, Yasaka west gate, Buden, the Yasaka-dōri pagoda sightline, Nio Gate and the Kiyomizu hall/stage. Repeated screenshots of the same subject are not counted as extra comparisons. References and uncertainty are in [REFERENCES.md](docs/REFERENCES.md), [GEOGRAPHY.md](docs/GEOGRAPHY.md) and [GEOGRAPHIC_REVIEW.md](qa/GEOGRAPHIC_REVIEW.md).

Three parallel teammates and the integrating agent divided renderer, geography/hero architecture, reusable shops/details, world layout, interface and QA responsibilities. Hero builders received review from another teammate. The per-image reviewers disclose where shared systems are their own work; self-review is not presented as independent certification. Root additionally reviewed paired foliage/ink and timber comparisons, street/garden corrections, interface layouts and the normal-eye final overlook.

The correction chain includes narrower pagoda cores/deeper eaves, roof fascia closure, stocked recesses, side casements, varied shop aprons, removal of path-blocking props, exact shrine/street risers, garden courts, elimination of corner-slab duplication, denser temple woods, removal of trees from the deck, removal of stone paving from timber walkways, corrected hero cameras, a raised photo panorama and softer blossom ink. Original evidence is retained alongside the replacement captures.

| Final review | Images | Mean | Result against universal 8/10 bar |
|---|---:|---:|---|
| [Review A](qa/FINAL_VISUAL_REVIEW_A.md) | 01–17 | 7.42 | Below target |
| [Review B](qa/FINAL_VISUAL_REVIEW_B.md) | 18–34 | 7.85 | Three views reach 8 overall |
| Combined | 34 | 7.64 | **Not passed** |

Each image has scores for composition, Kyoto recognition, architecture, pedestrian detail, toon rendering, ink, shadow color, vegetation, lighting, material separation, scale and storytelling. The scores are subjective judgments of the rendered images, not survey measurements. Machine-readable scores: [A](qa/final-scores-a.json) and [B](qa/visual-review-b.json).

## Remaining discrepancies

1. **Survey accuracy:** no authoritative DEM, calibrated photographic camera match, Google Earth inspection or interactive Street View inspection was completed. Elevations and lot shapes are inferred; individual current businesses and shop ordering are authored.
2. **Architectural fidelity:** hero silhouettes and real timber structures are recognizable, but joinery, roof ornaments, carving, individual frontage and precinct dimensions remain simplified. The condensed Kiyomizu precinct does not reconstruct every real building.
3. **Repeated town fabric:** side casements and varied aprons help, but similar roof heights, window proportions and tenancy rhythms remain apparent across long street rows.
4. **Nene/Kodaiji richness:** the long stone/plaster walls need more specific gates, planted openings and surface variation. These are the weakest final district views.
5. **Paving:** some junction paving overlaps remain visible, and dense small joints can alias or compete with architectural ink.
6. **Vegetation:** blossom ink is softer, but broadleaf masses and cedars remain visibly geometric. Some veranda-facing ground is insufficiently covered.
7. **Panorama:** the basin is deliberately simplified and pale. The raised photo view is stronger than the normal-eye view, where trees and rails partly screen the city.
8. **Lighting and composition:** deep veranda shadows still compress material differences. Several nearby hero views use similar compositions; the set is not 34 equally refined finished backgrounds.
9. **Interaction coverage:** 17 of 258 interaction points fail the finite approach scan; complex sliding shops, hand-washing and purchases are simple stylized responses rather than elaborate simulations.
10. **Performance coverage:** the native GPU results are good on the tested M5 Pro, but lower-end hardware, mobile GPU performance, exact GPU pass cost and a guaranteed 45 FPS floor everywhere remain unverified.

The source, generators, controls, diagnostics and recorded evidence are delivered. The remaining artistic and geographic gaps mean this report does **not** claim the user's full definition of done has been achieved.
