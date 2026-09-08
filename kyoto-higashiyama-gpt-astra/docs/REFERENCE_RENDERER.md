# Sakura Crossing: renderer, interaction and QA study

Inspected actual source at commit `de01898e89c7f6ab3fad93fa802f0f5ac66fbd81` on 2026-09-04. Private research clone: `/tmp/kyoto-sakura-render-ref`. Primary source: [Kenton-GMI/sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing). This is a reconstruction study, not a claim that the Kyoto scene has passed visual review.

## Material architecture

[`src/core/toon.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/core/toon.js) uses `MeshToonMaterial`, not a photographic-texture shader. It creates cached one-dimensional RGBA `DataTexture` ramps with nearest filtering and no mipmaps. Exact ramp values: 2 bands `[96,255]`, 3 `[92,178,255]`, 4 `[80,142,202,255]`, 5 `[74,124,172,214,255]`, high-key soft `[180,255]`, soft3 `[172,214,255]`.

`onBeforeCompile` replaces the direct-light irradiance line in `lights_toon_pars_fragment`. The replacement multiplies the toon band by `mix(shadowTint, white, celBand)` before multiplying by light color. Default shadow tint is `#6c5f8c`. This colors dark bands violet rather than simply reducing luminance. It affects each direct light, and it is separate from cast-shadow maps. The replacement is checked against the installed shader chunk, so a Three.js upgrade can silently disable it if the expected source line changes. The reference targets Three.js r180. Kyoto should verify this patch explicitly against its pinned version.

Materials are cached by all relevant scalar parameters. Mapped materials bypass the simple material cache. The custom shader cache key includes the shadow tint. `flat()` similarly caches unlit `MeshBasicMaterial` for distant masses, glass and emissive-like signage. The flat default is tone mapped, but the application uses `NoToneMapping`.

[`palette.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/core/palette.js) is a central authoring vocabulary: pale warm walls, purple-gray roads, blue-gray roofs, teal greens, pastel pink blossoms and limited saturated accents. Core ink is `#39324f`, soft ink `#4a4468`, sun `#fff1d8`, fill `#a9bdf5`, hemisphere sky `#dcecff`, hemisphere ground `#b6a6c6`. Material identity and selective accents do more work than surface noise.

## Rendering pipeline

[`src/core/post.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/core/post.js) implements its own three fullscreen quads instead of a large effects stack:

1. Scene into half-float linear color plus unsigned-int nearest-filtered depth texture.
2. Depth-derived ink into another half-float target.
3. Split-tone grade and explicit linear-to-sRGB conversion into an unsigned-byte target.
4. FXAA to the screen.

The renderer has hardware antialiasing off, stencil off, high-performance power preference, pixel ratio 1, `SRGBColorSpace`, `NoToneMapping`, PCF shadow maps. No bloom, depth of field or blur. Camera is 46 degrees, near 0.25, far 600. Fog spans 44–205 scene meters.

Ink linearizes depth using Three.js `perspectiveDepthToViewZ`. For center `dc` and neighboring samples, it computes `(dl+dr-2*dc)/dc` and `(du+dd-2*dc)/dc`. Positive components form convex/silhouette lines; negative components form lighter concave lines. This avoids the grazing-road smear of a first derivative. Convex sensitivity is `.0042` with smoothstep from `.32*sensitivity`; concave threshold `.026`, upper threshold `3.4*threshold`, strength `.42`. Ink fades between 40 and 98 meters; sky cutoff is 420. Resulting line color retains 22% of an underlying-color contribution at 42% intensity. Distances must be adapted for Kyoto's long sightlines rather than blindly multiplied by world size.

The grade uses violet `#ada8d0` shadows and paper `#fff7e8` highlights, luminance transition `.02–.55`, saturation 1.12, shadow lift .032, vignette .15, warmth .05. Grade must always handle the final color-space conversion, even when aesthetic grading is disabled. **Found reference defect:** `enabled.grade` is toggled in `main.js`, but `Pipeline.render()` always runs the same grade shader without consulting it. Kyoto should neutralize the grade parameters when disabled, while retaining sRGB conversion.

Internal resolution modestly supersamples, bounded to 4.6 million pixels. DPR under 1.5 uses scale 1.5; otherwise scale is min(DPR,2). Screenshot capture forces scale 1 unless overridden. Line sample spacing is `1.05 + .55*scale` internal pixels. This is a quality control, not a cure for draw-call cost.

## Hero outlines

[`src/core/outline.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/core/outline.js) adds back-facing shells to selected silhouettes. A vertex shader pushes projected normal direction in clip XY, compensates aspect ratio, and multiplies by clip W so thickness is approximately constant on screen. Default normalized thickness `.0038` gives about two pixels at 1080p. No cast/receive shadow, no fog, depth write on, render order one less than the parent mesh. Instanced shells share their source instance matrix.

Geometry is cloned, welded through `mergeVertices(1e-4)`, normals recomputed, and extraneous attributes removed. A weak-map cache avoids repeated preparation. Caveat: welding includes existing normal/UV attributes, so it does not necessarily smooth across all original hard edges; a robust new implementation can delete normals/UVs before welding. Do not outline a huge subtree indiscriminately: each shell adds a draw call and interior seams can become too heavy. Kyoto's roof masses, gate pillars and a few lanterns are appropriate candidates.

## Light placement and blossom

[`src/main.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/main.js) uses warm key intensity 2.25 at `[-52,62,56]`, cool fill 1.08 at `[48,26,-44]`, under-bounce `#d8cbe8` intensity .34 at `[10,-18,40]`, hemisphere intensity 1.12. The strong fill is intentional: visible color survives in the dark side. Sun shadows use 2048², a 68-meter-wide camera, near 1, far 200, bias -.0004 and normal bias .035. The moving shadow region follows the walker rather than trying to cover the entire world.

[`trees.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/world/trees.js) centralizes collected tree placements, bakes wood and instances canopy blobs by pastel material. Cherry canopy uses the high-key ramp and **does not receive shadows**. It still casts selected ground shadows. Raising a toon ramp alone cannot rescue a canopy once a shadow map zeroes its sun contribution. This is a principal reason its blossoms remain painted masses rather than muddy clusters. Other types use their own grouped geometry and palette; the entire world is not a cherry orchard.

## Procedural typography

[`src/core/textures.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/core/textures.js) is approximately 4,400 lines of authored Canvas2D signage, notices, interiors and masks. Helpers create sRGB `CanvasTexture`s, default anisotropy 4, optional repeat wrapping and cached variants. Signs are low-frequency flat color and type, deliberately avoiding photographic noise. `fitText()` decreases font size until a label fits; `vertical()` places Unicode characters individually along a column. System stack includes Yu Gothic, Meiryo, MS Gothic and Hiragino. Linux CJK fallback is an explicit QA concern; tests must detect missing-glyph boxes or bundle an appropriate font.

Representative dimensions: fascia 1024×256, vertical blade 192×768, noren 512×256, menu 384×512, lantern 256×256, shrine plaque 256×768. Noren slits use Canvas compositing to remove actual alpha, and single characters are kept inside one panel so slits do not fragment the glyph. Mirrored sign backs clone and horizontally flip a texture view while sharing its canvas. Kyoto can improve atlas reuse where many independent Canvas maps would otherwise create one material/draw per sign.

Textures furnish writing, price labels and quiet interior backdrops; they do not replace architectural geometry. Shop shells stop about .9 meters short of the frontage. Piers, headers, soffits and floors bound actual recessed space. Glass, mullions, counters and merchandise sit in front of the backdrop.

## Player and interaction contract

[`src/core/player.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/core/player.js) uses eye height 1.62 meters, collision radius .34, step allowance .38, walk speed 2.55 m/s, run 5.1, mouse sensitivity .0022. Pointer lock controls yaw and pitch; pitch is bounded -1.15 to 1.05. Velocity exponentially approaches desired velocity with acceleration 13 and braking 16. Diagonal input is normalized. Movement is split into at most .18-meter steps to prevent tunneling; axis-separated AABB overlap is resolved by the smallest push-out. Collider top/bottom tests permit low kerbs and overhead structures. Terrain elevation comes from `world.heightAt`; feet height is smoothed at rate 18. Light head bob has amplitude .014 meters.

The current repository adds a spherical presentation layer and an e-bike; neither belongs in a geographically grounded Kyoto reconstruction. Keep its flat simulation concept and remove planet wrapping. Kyoto's visible surfaces, placement, collision tops and walker must share one authoritative height system. A collision height check must prevent a player traversing a large terrain step as if it were a kerb.

Interaction picking raycasts only an explicit list of small hitboxes, with range 3 meters, not every mesh. Hitboxes map back to semantic interactables. The app triggers actions and HUD feedback. E is ignored while pointer lock is off. A nearby-only prompt avoids world-space markers. Picking should use occlusion-aware ray tests if a simple interaction hitbox can be reached through a thin wall.

## Geometry and performance

[`src/core/util.js`](https://github.com/Kenton-GMI/sakura-crossing/blob/main/src/core/util.js) provides deterministic mulberry32 random generation and geometry `bake()`: clone part geometries, apply transform, convert mixed indexed/non-indexed batches to non-indexed, retain only mutually supported attributes, merge and dispose scratch geometries. Production version should handle an empty list explicitly. This matters when batches depend on optional district detail.

Static geometry is merged by material; repeated elements are instanced. The reference reports approximately 1.74 million triangles across 19,000 source meshes and explicitly identifies draw calls as its bottleneck. Halving internal render resolution did not solve performance. Unculled baked geometry cost about 8 ms, so baked meshes retain useful bounds and frustum culling. Planet-wide batches defeat culling even when enabled; Kyoto should merge into district/spatial cells, not one world-sized geometry for each material. Compute instanced bounds rather than inheriting source-geometry bounds. Cache geometries/materials, and distinguish triangles submitted per visible frame from total world triangles.

`shadowify()` excludes transparent and explicitly no-shadow meshes from casting. Otherwise a glass vending front casts an opaque rectangle over bottles. Shadow caster count and draw count matter separately from world mesh count.

## QA pattern and implementation risks

The reference provides a dev-only `POST /__shot` Vite middleware that sanitizes filenames and writes decoded canvas captures to `.shots`. `window.__shot(name,1600,900,{pos,yaw,pitch,ink,grade,scale})` sets a reproducible view, resynchronizes the camera even when requestAnimationFrame is throttled, resizes all targets, updates outline resolution and local lights, renders explicitly, copies to Canvas2D and POSTs JPEG data. It exposes `window.__scene` for tuning and a coordinate HUD with a copyable camera definition.

Kyoto should preserve reproducible camera definitions, explicit render-before-capture, paired ink/grade comparisons and narrow dev-only file writing. It should additionally restore prior viewport/camera state after capture, enforce payload limits and return measured capture metadata. A successful file save is not visual QA. Review street-level silhouettes, sloped paving for false ink, sign backs, blossom shadows, geometry scale, visible recess depth, geographic views and continuous walking separately.

The repository has four checked-in hero JPGs and substantial narrative design/performance notes. No comprehensive automated screenshot score suite was found. Its reported performance is reference context, not a measurement of Kyoto. Do not copy those numbers into the final report.

## License

Source and procedural artwork are MIT, copyright © 2026 Kenton Wang. Substantial source reuse requires preserving the copyright and permission notice. The audio file is explicitly outside the MIT license and is not part of this reconstruction. Three.js and Vite are MIT dependencies. The renderer study is sufficient to proceed to implementation, but the Kyoto build still requires independent real-place geography and screenshot review.

## Kyoto-specific painted foliage refinement

Screenshot review found that applying full depth-curvature ink to every small overlapping canopy lobe produced dark rings resembling separate padded stones. The Kyoto implementation adds an `inkWeight` option to the toon material factory. Opaque foliage writes that weight into scene-color alpha after Three.js's opaque fragment output; this channel is metadata in the intermediate RGBA16F target, not material transparency. Ordinary opaque geometry retains alpha 1. Pink uses weight .22 and green broadleaf foliage .52.

The ink shader scales internal curvature by this weight, then restores full line weight where neighboring linear depths differ by .35–1.10 meters. This preserves strong silhouettes against architecture/sky while making interior blossom masses quieter. No additional texture sample, render target or draw pass is introduced. `pipeline.ink.mat.uniforms.uPaintedSurfaces.value=0` provides a comparison mode; the default is 1. The post output always restores opaque alpha, including when ink or aesthetic grading is disabled. An explicit PNG-pixel check verifies this under both grade settings.

Pink canopy geometry uses a smoothed detail2 icosahedron; green canopies keep detail1 and cedars use narrow ragged cone tiers. `qa/foliage-compare.mjs` creates exact paired captures of the ink behavior with geometry and animation held fixed. The final report must distinguish this implementation self-check from independent visual review and measured performance.
