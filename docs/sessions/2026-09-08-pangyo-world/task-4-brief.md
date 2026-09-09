### Task 4: Stage 2 — hero modules (NC R&D Center, 판교역 canopy, 알파돔 massing)

**Files:**
- Create: `pangyo-technovalley/tools/bpl/gen_pangyo.py` (bpy; runs only if `tools/bpl/.venv` with bpy exists), `pangyo-technovalley/src/world/PangyoHero.ts` (procedural fallback + placement), `src/data/recon/hero.json` (`[{ osmId, module, yaw, footprintFit:true }]`), `public/assets/models/pangyo/*.glb` + `manifest_pangyo.json` (via the studio's `inject_asset.mjs` normalization), facade spec `src/data/facades/pangyo.json` for the NC building (glass curtain wall, 12 floors × 4.4 m, dark mullions, rooftop sign "NCSOFT" as a text plane 24 m wide).
- Reference: `union-square-sf/tools/bpl/bpl_lib.py`, `gen_arch.py`; `src/world/Hero.ts`, `src/world/facade/AutoSpec.ts`, `src/data/facades/*.json`.

- [ ] **Step 1:** Try `py -3.10 -m venv tools/bpl/.venv && .venv/Scripts/pip install bpy==3.6.0` (≈ 300 MB). If it installs: generate `nc_rnd_center.glb` (curtain-wall slab on the OSM footprint with the podium), `pangyo_station_canopy.glb`, `alphadome_tower.glb` (two tapered towers); tris ≤ 20k each. If it does not: build the same three as Three.js procedural geometry in `PangyoHero.ts` and say so in the report.
- [ ] **Step 2:** Placement by footprint: hero modules replace the massing for their `osmId` (`heroIds`), scaled to the footprint's oriented bbox, yaw from the footprint's longest edge.
- [ ] **Step 3:** Verification: Playwright screenshot from tour stop 2 (NC entrance) shows the sign; `probePath` at the NC roof + 2 m is clear and at floor 6 inside is blocked; previz of the target cut re-rendered → `docs/stage2-target-cut.mp4`.
- [ ] **Step 4:** Commit `feat(pangyo): hero modules (stage 2)`.

