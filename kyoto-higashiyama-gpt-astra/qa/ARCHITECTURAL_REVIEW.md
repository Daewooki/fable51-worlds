# Independent architectural review

Reviewer: reference-world / machiya builder. This reviewer did **not** build the shrine, pagoda or Kiyomizu hero assets. Images inspected: `qa/hero-selftests/{pagoda,shrine,gate,temple}.png` at 1600 × 900, alongside `docs/reference-images/{pagoda-street,yasaka-west,kiyomizu-main}.jpg`. These isolated captures evaluate forms, not the final world's ink, atmosphere, planting, geographic placement or performance.

## First independent review

| Hero | Observed strengths | Required corrections |
|---|---|---|
| Hōkan-ji / Yasaka Pagoda | Correct five-level taper, finial with rings, bracket geometry, dark timber and plaster at base. Silhouette is clean. | Current occupied tier width is too large relative to roof projection. The reference photo reads as narrow dark bodies sheltered by very deep eaves; generated base roof/body ratio is only 9.6/6.7. Preserve roof width while narrowing body roughly 20–25%; reconsider exposed wall height after a new comparison. |
| Yasaka Shrine | Vermilion/cream gate, green shutters, side wings and precinct forms give a recognizable identity. Multiple roof masses prevent a single generic torii reading. | Reference west gate has denser eave rafters and deeper brackets beneath its balcony. Add structure there before adding more ornamental surface detail. Spatial QA needs the west staircase and correctly aligned precinct passage. |
| Kiyomizu Nio-mon | Strong vermilion palette and two-floor roofed gate organization, modeled balcony and lattice bays. | Verify the gate's exposed upper-floor height in a straight-on photo; isolated oblique view is insufficient to claim an exact reconstruction. Guardian forms are deliberately simplified silhouettes. |
| Kiyomizu main hall/stage | Real stage planks and tall timber grid, massive roof, side gables and open veranda make the primary organization recognizable. | The isolated rectangular support grid reads like equal-height scaffolding. In-world terrain and tree masses must bury/obscure rear and lower rows. Cypress-bark roof needs quiet horizontal layer bands; front gables should be more prominent and integrated into the main roof. |

These are actionable observations, **not final quality certification**. The user-requested final 8/10 minimum cannot be assessed from neutral isolated images. Full-world landmark sightlines, pedestrian-scale approach, terrain contact and final rendered frames must be reviewed separately. Feedback was sent directly to the hero builder for correction.

## Architecture generator self-verification (separate from independent review)

The machiya author captured `qa/machiya-selftests/{gion,hill,street,details}.png` at 1600 × 900. Two faults were found from images and corrected before recapture:

1. One-sided main roof surfaces left overhanging rear tile rows visible without a roof underside. Added sloping solid roof plates and a plaster gable closure.
2. Pottery shelves at 0.72 m placed bowls below the 0.85 m facade counter. Raised the shop display shelf to 0.96 m; vessels now sit visibly above the counter.

Measured sample bounds: Gion roof peak 5.51 m; hill-street roof peak 5.64 m. Browser page errors: zero. Final sample geometric cost before world spatial batching: Gion 18,560 rendered triangles / 39 calls; hill house 17,466 / 35; five-house frontal street 69,550 / 150. These neutral-preview numbers are **not** final whole-world performance numbers. Typography, recessed door depth, inuyarai curves and display objects were visually inspected.

## Independent machiya review and second correction pass

The geography/hero builder independently compared the four machiya frames against the photographs and found the basic Gion scale, ridge direction, inuyarai and sudare correct. Three actionable deficiencies were returned: too-empty dark shop bays, bright flat-looking panels inside door recesses, and insufficient plaster margins around upstairs windows.

All three were corrected and the four frames recaptured:

- Actual back shelving now carries 8–16 category-specific objects across two visible levels behind each open counter bay, in addition to the front display.
- Full-depth timber side and ceiling reveals close the parallax gap through which the otherwise hidden plaster building mass was visible.
- Four of six hill-street facade variants now have smaller grouped upper windows and visible plaster margins; Gion retains denser lattice/blind treatment.

The correction adds roughly 4,000 triangles to the sample pottery shop while adding only one draw call before spatial merging. The independent reviewer re-inspected both hill and pedestrian street captures and confirmed that all three returned issues were addressed. Remaining row gaps and street-end voids are world-placement/context issues, not shell geometry. No final quality certification is inferred from these local improvements.

## Hero correction re-review

Latest isolated pagoda and temple captures were inspected after the hero builder narrowed the pagoda bodies, enlarged relative eave projection and added horizontal cypress-bark courses to the main hall roof. Both corrections improve their reference resemblance. One resulting detail was returned: extend upper pagoda core bodies below their current nominal floor start so they physically intersect the previous roof at the tier perimeter; otherwise a thin sky gap is visible beneath upper bodies at some angles. This does not require changing the refined roof silhouette.

## First assembled-world observations

Reviewed `qa/preview.png` and the first five `qa/first-scene/` views independently. Priority context defects were communicated to root:

- Several Gion/alley axes terminate in an unpopulated tan horizon, exposing the constructed corridor's edge. Add background roof masses, wall/trees, or a deliberately framed corner turn.
- Repeated large exposed side walls suggest skipped frontage plots. Sequential center placement must account for the next plot's frontage width; rows should remain continuous where the reference shows continuous machiya.
- Main hero cherry masses read as oversize rounded lumps; use smaller irregular canopy clusters and reduce internal ink.
- Paving ink competes with facade details in the pagoda hero; curb and architectural edges should command more attention than every paving-stone joint.

These observations are recorded before the full final-view capture batch and are not final pass/fail scores.

## Garden correction pass — builder and independent review

After the first whole-world review, the architecture builder added a Hanamikoji garden screen, a Maruyama pocket court and walls/gardens around the Ishibe-like loop in `src/world/dressing.js`. These deliberately replace exposed ground and unframed street endings with gates, stone/plaster walls, bamboo, lanterns, basins, benches and authored vegetation.

The builder inspected all three 1600 × 900 frames in `qa/garden-fixes/`. A visible construction fault was found: stepping stones duplicated at polyline corners, producing overlapping slabs. The next revision removes duplicate joint stones and introduces terrain-following moss beds around selected garden trees and basins. Reinspection of `qa/garden-fixes-2/` confirms the corrected corner sequence and visible garden focal points.

The geography/hero agent independently inspected all three replacement images and reported no floating surfaces or obstructed paths. It also verified 1.68 m camera ground clearance, no camera/collider intersections and a passing 38-segment full-route check after the dressing colliders were introduced. This is an independent review of the garden builder's work. It is not an independent claim that the gardens match surveyed private properties.

Remaining discrepancy: the moss-bed edges are visibly polygonal, and the garden ground and wall surfaces retain a simplified illustrative treatment. These are authored Kyoto-inspired pocket gardens rather than a reconstruction of a documented individual Maruyama garden. Source was frozen after the independent review for the next full screenshot batch.

## Bounded facade correction — actual before/after and independent acceptance

The next complete capture still showed large plain machiya ends dominating several hero views and an overly uniform menu/plant apron sequence. The root authorized a correction limited to `machiya.js` and `details.js`, without changing building dimensions, route geometry or controller collision bounds.

The implementation adds small upper privacy casements with plaster margins, lower timber rain cladding, closed service doors or electric meters, and tenancy-specific shallow work displays. Hill-shop displays now alternate between pottery crates, tea tins, folded cloth/fans and low food tables. Menu placement is more common at food businesses; planter occurrence and plant shape vary. Gion display additions avoid its curved bamboo splashboard, and new work displays avoid pre-existing benches.

Before images and their capture manifest are preserved in `qa/facade-before/`. The builder inspected all six 1600 × 900 comparison images in `qa/facade-after/`: Hanamikoji lattice, Gion alley, Nene north, Kodaiji edge, pagoda glimpse and Ninenzaka lower. The window/cladding changes are visible at the same poses, the pagoda remains unobstructed, and no visible new facade gap was found. The Honden roof fascia correction was separately rechecked in `qa/hero-confirmation/02-yasaka-honden.png`; the previously reported sky gap is gone.

The geography/hero agent independently inspected all six facade comparisons and accepted the additions as restrained and useful. It found no new facade hole or passage obstruction. Both reviewers still identify the long Nene/Kodaiji garden walls as overly simple. This acceptance verifies the bounded correction; it does not certify every frame at 8/10 or treat the procedural end-wall details as a property-by-property survey.
