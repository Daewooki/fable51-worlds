# Geographic review — Gion to Kiyomizu

Reviewed against the OSM data in `docs/osm-landmarks.json`, official route and precinct references in `docs/REFERENCES.md`, the source coordinate/terrain contract, and actual browser renders. The reviewer researched the route and built the hero structures; root independently placed the district street network and buildings. Hero form review also involved both other agents, so the structure builder was not the sole judge.

## Evidence and scope

The world uses a Gion-Shijo origin at approximately 35.0038 N, 135.77259 E, +X east and +Z south. Horizontal map distances are compressed to about 0.30 while doorways, street furniture and stairs retain human scale. This is an authored interpretation, not a measured replica or a map for real navigation.

The continuous controller regression uses the actual `Player.update(1/60)` implementation and WASD key state, with only the starting pose initialized. It follows the full main route, an Ishibe side loop and the pagoda detour without intermediate teleportation. The result in `qa/walkthrough/controller-full-route.json` covers 38 segments and about 946 world metres, and passed again after the garden colliders were added. This is deterministic movement verification, not an FPS benchmark. A separate native-GPU, wall-clock first-person walk is recorded in `qa/livewalk/result.json`, with one screenshot per segment in `qa/livewalk/`: root completed all 38 segments in about 151 seconds with no intermediate teleport. That result includes PNG capture pauses and should not substitute for the dedicated steady-state performance profile. Root added a final westward turn at the actual player location; consult the latest live-walk JSON and end image for that rerun.

## Spatial findings

| Check | Evidence | Finding |
|---|---|---|
| Gion → Hanamikoji | OSM named street center and north/south alignment | Southward Hanamikoji and an eastward side street form a connected loop back to Shijo. The exact loop is compressed and authored. |
| Yasaka western approach | Official west-gate photo and precinct plan | West-facing vermilion gate stands east of Shijo. Final correction added exact .16 m risers to the western approach. Roadside terraces and individual monuments remain simplified. |
| Shrine internal axis | Official Yasaka plan | The builder's local transform keeps Buden south of Honden, with the formal precinct axis approximately north/south. |
| Maruyama → Nene | Official Kyoto walking routes | The eastern transition bends south into the quiet temple-edge route. New pocket gardens improve pacing; they are authored garden composites, not specific surveyed Maruyama features. |
| Ishibe character | Connected side-loop source and street-level renders | Narrow west detour is continuous and receives stone/plaster walls, gates and gardens. Its exact dogleg and lot boundaries are not a reconstruction of every real Ishibe-kōji corner. |
| Hokanji position | OSM center and Yasaka-dori photograph | The pagoda lies west of Ninenzaka. A short westward detour permits a descending east-to-west reveal, then a return to the uphill route. Landmark origin moves 7 compressed metres south of the map centroid to keep the street on its north edge. |
| Ninenzaka | OSM steps: 17, width 4 m | Southward flight rises about 2.7 m through the narrow merchant lane. Its exact stone texture, storefront ordering and side footprints are authored. |
| Sannenzaka | OSM steps: 46, width 4 m | The stronger southward flight rises about 7.4 m before the eastward Kiyomizu approach. The slope and direction are coherent. |
| Kiyomizu approach | Official temple plan | Main approach turns east toward Nio Gate, then reaches the hall farther east. The precinct is substantially condensed. |
| Stage and overlook | Official hall/Okuno-in photos | Real timber supports descend below a horizontal south-projecting deck. The wooded ravine is visible. The final overlook camera was corrected to face west/southwest into the basin, away from the hall and pagoda. |

## Completed comparisons

This reviewer made **nine distinct reference comparisons** during the build and scene review: (1) whole-route OSM topology, (2) Yasaka official precinct plan, (3) Kiyomizu official precinct plan, (4) Hanamikoji photographed frontage versus machiya/full street, (5) Yasaka west gate photograph versus isolated/full gate, (6) Buden photograph versus lantern-stage render, (7) Yasaka-dori pagoda photograph versus isolated/full landmark, (8) official Nio Gate photograph versus entrance render, and (9) official main-hall photograph versus isolated/full stage render. Repeated captures of the same comparison are not counted again. The source ledger has 23 entries; that is a different number.

The architectural comparisons produced concrete corrections: narrower pagoda cores and deeper eaves; connected upper-tier cores; a distinct hipped Nio roof; increased gate bracket density; procedural cypress-bark roof courses; and stage supports correctly below the visible/navigable deck. The real structures still have far more irregular joinery, roof ornament, carving and material variation than the generated models.

## Captured defects and corrections

The first 34-image review found cameras inside or behind storefronts, a missing meaningful panorama, a camera below the Kiyomizu hillside, a flat-looking Yasaka approach, houses occupying intended garden courts, sparse quiet-area detail, a vending machine in the street, paving across the wooden stage and vegetation crossing the deck. These were reported to their owners. Original evidence is preserved in `qa/reviewed-batch-1`; replacement views must be assessed from `qa/final` and its capture manifest. Camera corrections are checked for terrain clearance, collider intersection and their actual rendered subject. The final 34-image batch at 2026-09-05 00:19:09 UTC contains 34 exact 1600 × 900 hardware renders, zero browser errors, positive terrain clearance and zero intersecting colliders at every camera. The panorama photo is elevated to 48.5 m for its composition; the final live-walk turn remains at normal player eye height.

## Remaining uncertainty

No authoritative DEM was acquired. All relative elevations are authored estimates from the photographed stairs and route sequence; they are not altitude above sea level. Google Earth and interactive Google Street View were not inspected. Exact building footprints, lot boundaries, current businesses, roof heights and calibrated reference camera positions are unverified. The Kyoto panorama uses simplified repeated city geometry. The reduced precincts, composited storefronts, abbreviated temple structure and simplified local street endings prevent a claim of survey-level geographic or architectural fidelity.

The implemented route topology and continuous uphill progression are credible. That conclusion does not certify the user's requested 9/10 geographic score or every 8/10 hero-image threshold. Consult the two independent visual reports for honest per-image judgments and the remaining art-direction discrepancies.
