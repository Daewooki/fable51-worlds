### Task 3: Studio integration + stage-1 previz (target cut)

**Files:**
- Modify: `studio/schemas/project.mjs` (`WORLDS` += `'pangyo-technovalley'`), `studio/app/src/main.ts` (`WORLD_PORTS` 5175), `studio/tools/up.mjs` (`WORLDS` map), `studio/server/prompt.mjs` (`anchorsFor`: if `<world>/public/data/tour.json` exists, use it as anchors — for all worlds — falling back to the hard-coded TOURS), `studio/README.md` (world list, ports), `README.md` root world table.
- Create: `studio/test/pangyo.test.mjs` (launch + 2 s previz 60 frames + export GLB parses), `pangyo-technovalley/README.md` (data sources + attribution, how to rebuild data, ports).

- [ ] **Step 1:** Tests first (`pangyo.test.mjs`, `prompt.test.mjs` case: `anchorsFor('pangyo-technovalley').length ≥ 6`).
- [ ] **Step 2:** Implement; `npm run up` starts three worlds; e2e `node tools/e2e.mjs --world pangyo-technovalley` PASS.
- [ ] **Step 3: Target cut** — via the studio API: project on pangyo, shot 8 s 1920×1080 sunset, keys from `tour.json` stops 1→3→4 (aerial → descend → dolly west), collision check clear (fix path if not), render previz → `studio/projects/…/previz.mp4` copied to `pangyo-technovalley/docs/stage1-target-cut.mp4` (≤ 15 MB) plus 3 frame PNGs. Record wall time in the README.
- [ ] **Step 4:** Commit `feat(studio): pangyo-technovalley world (stage 1)`.

