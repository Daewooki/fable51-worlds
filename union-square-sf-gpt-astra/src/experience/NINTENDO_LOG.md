# Nintendo authoring and verification log

2026-09-04. Author `/root/research`, inherited requested Astra 6 model, no override, no external AI asset service. Authoring source `src/experience/nintendo.ts`; research `references/SUPPLEMENT_NINTENDO.md`. No runtime photograph, game footage, downloaded mesh, or prior generated-world implementation used.

Parent assignment:

> Proceed to original Nintendo interior builder in src/experience/nintendo.ts using src/experience/types.ts (don'teditcontracts/architecture/runtime/world). Export buildNintendoInterior():Interior. Working eraJuly–August2025. Coordinateframe {x:-85,z:32,y:streetHeight(-85,32)+.12,yaw:Math.PI/2}; publicenvelope localx[-12,12],z[-22,0] =>worldx[-107,-85],worldz[20,44]. Architectureagent owns matchinghotelportal/collider cuts. PublicentryPowelllocal(0,0,0), ground0 andlower−3.6m, centralstraightdescendingstairs withovalglazedvoid/rail, originalredlitceilingring, originalwhitecabinets/herringbonefloor, franchisezones and legiblelocalgenerateddemo displays. Provide actualfloorWalkSurface callbacks withhole/stairs matchinggeometry, heightboundedcolliders, interactive targets3+: screen/demo change, inspect/rotateproduct/displayanimation, souvenir optional; reset andupdate. RootwillgenerateoriginalNintendo displayfigurines throughBlenderMCP and supplyGLB separately; leave slots/groupanchors named displayMario/displayLink/displayPikmin ratherthanfinalprimitivecharacters. No downloadedartpixels orgamefootage inruntime. Don'tchangeexistingunrelatedscenequality. Shareframe/stair/door datawitharchitectureagent promptly. Logauthoredscopeandapproximations; rootintegratesandbrowserQA later.

Architecture subsequently confirmed it would remove the hotel ground arcade/backing in the storefront envelope and leave the historic cornice; this builder supplies the matching lower storefront and sliding door. No architecture/runtime/world/contracts edits by this child.

Original geometry includes brass framed glazing, dark portal, red fascia, white/red retail fixtures, shelves with varied boxes/bottles/shirts, generated herringbone floor, oval opening/guard, 24 descending treads, matching floor callbacks, red ceiling ring, upper and lower store shells, cash wrap, handheld model and locally drawn animated display content. Eight interaction targets cover screen mode changes, rotating handheld, display turntable, souvenir and door. Dynamic canvases animate at eight redraws per second. Repeated shelving is merged by material. Clear center entrance and lower routes are preserved.

Frame: world[-85,1.151,32], yawπ/2. Main floor0, lower−3.6 relative. Ellipse center local(0,−10.8), radii3.5/5.2; landing X±1.35,Z−6.8..−5.6; stair Z−6.8→−14, width2.6,24×.15 risers. Foot route to lower side aisles goes(0,−3.6,−14.3)→(5.25,−3.6,−14.3), then westward deeper along localZ. Root must select the nearby/reachable height among overlapping floors and exclude external terrain beneath the basement.

Named display anchors, feet origin, localY up, facing local+Z:

- displayMario(-7.05,.77,-8.9), intended figure1.55m high.
- displayLink(-7,-2.83,-10), intended1.75m.
- displayPikmin(7,-2.83,-10), trio intended~1m including stems.
- displayAnimalCrossing(7,.77,-8.9), optional~1.35m.
- displayPikachu(-7,-2.83,-17.8), optional~1.4m.

Root authors/imports the actual Blender figures. Empty slots are integration points and are not final accepted stand-in characters. Store footprint, height separation and aisle arrangement remain explicit inferred approximations; geographic location, downstairs topology, oval stairwell, major product-zone categories and material language come from real photographs. Demonstration content is an original installation, not an emulation or recording of a Nintendo game. Closed Geary emergency-exit detail and measured accessibility routing remain limitations.

Verification performed without GPU while parent profiles/integrates:

`npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --strict --skipLibCheck src/experience/nintendo.ts` passes. An earlier whole-project check encountered concurrent incomplete runtime function names, with no Nintendo diagnostic; first isolated invocation required adding TypeScript7's `--ignoreConfig` flag.

A CPU-only Node harness reads this project's art/types/site/Nintendo source, strips TypeScript using Node25 `stripTypeScriptTypes`, supplies a no-op canvas context, constructs real Three.js geometries and raycasts all24 tread centers plus3lower-aisle samples. It invokes every action/description, update and reset. Results:59meshes,58,293vertices,0nonfinitevalues,8targets,3floors,150colliders;27route samples yielded0collider overlaps at22cm radius and0surface-height errors beyond3cm. Bounds[-107.2,-2.699,19.85]..[-84.15,5.271,44.15]. An initial attempted TypeScript transpileModule harness failed because installed TS7 exposes no old compiler API; corrected harness uses Node's built-in type stripper. No browser visual fidelity or integrated collision pass is claimed yet.


Integration follow-up from parent: souvenir target referenced its own disappearing token, making return action unavailable under runtime visibility filtering. Removed only target.object from nintendo-souvenir; its stable world position remains focusable while token visibility toggles. No geometry changed. Runtime and parent notified. GPU testing remains parent-owned.

Parent authorized fixing two floating invented wayfinding signs after independent review of qa/supplement-views-1 Nintendo PNGs. Removed ground-entry header and red first-tread sign; also removed the matching unsupported lower-floor header found in the same source audit. Display-zone labels attached to plinths and counters remain. No floor, collider, figure or activity changed. The prior59mesh count predates these three label removals.
