# Procedural Kyoto architecture

`src/world/machiya.js` builds a machiya at local ground zero with its facade facing +Z. Geographic placement, terrace height and collision belong to the world builder.

```js
const house = makeMachiya({
  width: 5.8, depth: 7, floors: 2, seed: 23,
  district: 'hanamikoji', shopType: 'tea', variant: 2,
});
house.position.set(x, heightAt(x, z), z);
house.rotation.y = streetFacing;
```

Default two-storey roof peak is approximately 5.65 m. Gion upper floors are slightly lower. Width and depth are footprint dimensions, excluding projecting eaves. `shopType: false` creates a closed residential frontage. Optional `timberTone`, `plasterTone`, `recess`, `h1`, `h2`, and `roofRise` adjust proportions without changing the construction language. `width`/`depth` also accept the `w`/`d` aliases.

The ground-floor solid stops 0.94 m short of the facade. Posts, header, sill and side piers frame a real entry. Display counters, shelves, bowls, tea tins and food samples occupy this depth. Ground-floor lattices and upstairs windows have backing, frames and individual bars. Main roofs run parallel to the street; their tile profile, overlapping row edges, eave caps, ridge caps and rafters are geometry. Secondary street eaves are separate sloping roofs. Gutters, downpipes, occasional rain chains, meters and AC units retain the overlap of old and new Kyoto.

Gion variants use dark/reddish timber and plaster, tighter lattice spacing, upstairs bamboo blinds, restrained signs and the curved bamboo **inuyarai** splashboard visible in the Hanamikoji photographic reference. Hill-street variants have warmer timber and pale plaster, open displays, occasional upstairs balustrades and modest projecting blade signs. Buildings remain level; stepped streets require each footprint to sit on its own terrace.

## Runtime metadata

- `group.userData.shop`: boolean; `shopType`: one of the 14 tenancy keys.
- `width`, `depth`, `height`, `front`, `footprint`: measured local dimensions.
- `recess`: `{depth, doorX, width}` for a collision implementation that preserves the visible doorway recess.
- `interactions`: `{position: [x,y,z], label, text, kind, object?}` in the returned group's local coordinates. Transform these positions only after placing the group. Referenced animated objects retain local pivots.
- `animated`: `{object, type: 'noren'|'lantern', phase, amount}`. All moving pivots have `object.userData.dynamic = true`.

Static untextured meshes are merged per material locally to limit startup memory. A later world merge can regroup them per spatial cell. Mapped sign panels and dynamic rigs retain their material and UV identity. No binary textures or external 3D assets are used.

## Detail generators

`details.js` exports `makeLantern`, `makeBicycle`, `makeMenuBoard`, `makePotDisplay`, `makeShopApron`, `makeVendingMachine`, `makeBench`, `makeCat`, and `makePlanter`. Each returns a `THREE.Group`, accepts optional `x/y/z/ry`, and uses cached materials.

- Lantern origin is its suspension point. `size: 1` means approximately 0.8 m paper height. Its body and rib geometry are cached; its inner swing pivot is dynamic.
- Bicycle wheels, spokes, frame, handlebar, basket and carrier are geometry. Length is approximately 1.8 m.
- Shop displays accept `type`, `width`, `height`, `seed`. Pottery is hollow lathe geometry; tea/incense have cans, food has trays, fans have ribs.
- `makeShopApron({type,seed})` provides a small business-specific work display: pottery crates, tea tins, folded cloth/fans or a low food table. Its shallow footprint fits the existing shop apron; placement avoids the Gion bamboo splashboard and existing benches.
- Vending body has a real retrieval cavity. Its initially hidden bottle is retained under a dynamic group for the interaction.
- Bench, bicycle, vending machine and cat expose their own local `userData.interactions` arrays. Do not collect child arrays a second time if a machiya has already promoted that interaction.

## Canvas2D typography

`signage.js` exports the 14 `SHOP_TYPES`, `shopType()` lookup, `makeVerticalShopSign`, `makeNorenTexture`, `makeLanternTexture`, `makeMenuBoard`, `makeTemplePlaque`, `makePriceStrip`, `makeWoodenSign`, `makeOmikujiNotice`, `makeVendingTexture`, and `textureStats`. Texture methods return cached `THREE.CanvasTexture` objects tagged sRGB.

Japanese serif typography uses Yu Mincho / Hiragino Mincho / Noto Serif CJK fallbacks. Prices use the companion Japanese sans-serif stack. Procedural wood grain is low-frequency and subordinate to the text. Cloth panel UVs sample one continuous noren artwork across three physically separated panels.

## Reference basis and limits

The generator was visually cross-checked against `docs/reference-images/hanamikoji.jpg` and `docs/reference-images/pagoda-street.jpg`. These support facade rhythm, upper/lower eave relationship, lattice, bamboo splashboard and plaster/wood distribution. Architecture is procedurally authored, not a survey of individual businesses. Tenants are fictional to avoid presenting an invented facade as a mapped real shop.

Architectural references: [Hachise's machiya exterior feature guide](https://www.hachise.com/kyomachiya/features/featuresExterior.html), [JAANUS definition of mushikomado](https://www.aisf.or.jp/~jaanus/deta/m/mushikomado.htm), and [Sakura Crossing implementation study](REFERENCE_WORLD.md). The Kyoto photo references and geographic measurements are documented separately by the geography team.

Verification performed during construction: JavaScript syntax checks of all three modules, four 1600 × 900 browser captures, image-driven corrections and an independent architecture review with a second correction pass. See `qa/ARCHITECTURAL_REVIEW.md`. Full spatial placement, geographic continuity and final art direction remain separate whole-world checks.

## Garden and alley dressing

`buildDressing(ctx, heightAt)` adds three authored transitions: a tiled garden screen at the south end of Hanamikoji, a Maruyama pocket court, and perimeter/side-garden walls around the Ishibe-like loop. These are interpretive compositions, not claims to reproduce a particular private garden. Gates have open passageways, tiled caps and procedural plaques; basins have stone bowls, bamboo spouts and water interactions. Stepping stones query the same height function as the player instead of introducing floating platforms.

The context supplies `add(group)`, `register(group)`, `collide(x0,z0,x1,z1,top,bottom)`, `plant(x,z,type,scale)` and `stats`. Wall and prop colliders are only added when their full radius clears the nearest walking-path ribbon. Plantings are registered before the centralized vegetation batch. Added detail objects increment `stats.props`; the return value includes the created groups and three area labels. Review these gardens at pedestrian height after changing terrain or path geometry.
