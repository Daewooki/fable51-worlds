### Task 2: Generalized runtime (copy of union-square-sf, data-driven place content)

**Files:**
- Create: `pangyo-technovalley/{index.html, vite.config.ts, tsconfig.json, src/**}` copied from `union-square-sf` (excluding `src/data/recon/*` SF data, `public/data/*` SF data, `node_modules`), then edited; `pangyo-technovalley/public/assets/models/**` copied from union (the 206-GLB kit + manifests) — assets are MIT-licensed generated files; `src/data/recon/tour.json`, `routes.json` (stage 3 fills routes; stage 2 may leave `routes.json` absent).
- Modify (in the copy only): `src/world/World.ts` (street specs from `data/streets_spec.json`; Plaza only if `data/plaza.json` exists; hero ids from `data/hero.json` if present), `src/world/Props.ts` (no PLAZA constants; heart spots removed), `src/main.ts` (tour stops from `data/tour.json`; viewpoints optional; no storefront overlays unless `storefronts.json`), `src/life/Traffic.ts` (routes from `data/routes.json`; if absent, no vehicles but no crash), `src/life/NavGraph.ts` (must not reference street names), `src/world/Hero.ts`/`HeroContext.ts` (data-driven or removed), `package.json` dev script port 5175.

**Interfaces:**
- Consumes: Task 1 data. Produces: a world that boots at `http://localhost:5175/?qa=1&ui=0&studio=1&life=0&time=sunset` with `window.__twin.ready` resolving, the StudioBridge (`probePath` included) and the `world/props/vegetation` groups; `data/tour.json` shape `[{ title, subtitle?, pos:[x,y,z], look:[x,y,z], duration, hold, time? }]` (union's `TourStop`).

- [ ] **Step 1:** Copy, rename, `npm install`, `npx tsc --noEmit` clean (expect errors from removed SF data; fix by generalizing, not by re-adding SF data).
- [ ] **Step 2:** Grep gate: `grep -rniE "powell|geary|stockton|dewey|macy|westin|apple|nintendo|union square|maiden" src` → empty.
- [ ] **Step 3:** Author `tour.json` with 6 stops: NC R&D Center aerial (pos ≈ [40, 140, 220] look [0, 20, 0]), NC entrance street level, 유스페이스 corner, 판교역로 westbound dolly, 판교역 plaza, night skyline. Positions must be probe-clear (use the studio's collision check after Task 3, or `probePath` via Playwright here).
- [ ] **Step 4:** Boot check with Playwright (`studio/server/render/browser.mjs` `launchWorld` with `port: 5175` — add `'pangyo-technovalley': 5175` to `WORLD_PORTS` in that file as part of this task, additive): `__twin.ready`, `probePath` returns for 3 points, screenshot `pangyo-technovalley/docs/boot.png` shows terrain + massing + streets. Add `test/boot.test.mjs` (integration, 400 s) doing exactly this.
- [ ] **Step 5:** Commit `feat(pangyo): generalized runtime boots on OSM/SRTM data`.

