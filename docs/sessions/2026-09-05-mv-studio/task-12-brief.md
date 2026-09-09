### Task 12: kyoto world patches, README, end-to-end check

**Files:**
- Modify: `kyoto-higashiyama/src/main.ts`, `kyoto-higashiyama/src/assets/Assets.ts` (same patches as Task 3; copy `StudioBridge.ts`; check the kyoto `Assets.ts` `load()` has the same shape — if the file differs, apply the override to whatever function builds the GLB path), set kyoto dev port to 5174 in its `package.json` `dev` script.
- Create: `studio/README.md`
- Modify: root `README.md` (one "MV Studio" section linking to `studio/README.md`)

- [ ] **Step 1: Apply the kyoto patches** exactly as Task 3 Steps 2–4; run its `studio_bridge_test.mjs` copy against port 5174 → PASS.
- [ ] **Step 2: Write `studio/README.md`** — setup (`npm install` in each world + studio; `npx playwright install chromium`; ffmpeg on PATH; `npm i -g @higgsfield/cli && higgsfield auth login`), running (three terminals: world `npm run dev`, `studio npm run dev`, `studio npm run dev:ui`), the one-shot walkthrough (create project → keys → Render → Finalize → Export), VARCO flow (`varco_fetch` / manual export → `inject_asset` → restart world), phone camera (mkcert), env vars (`STUDIO_PORT, STUDIO_PROJECTS, STUDIO_LLM, ANTHROPIC_API_KEY, OPENAI_API_KEY, VARCO_API_KEY, VARCO_API_BASE`), troubleshooting (GPU → software fallback flag in job artifacts, `world load timeout` → check the world terminal).
- [ ] **Step 3: End-to-end** — full flow on union-square-sf: prompt (provider none) → scrub → Render (60 frames at 640×360 test shot, then a 10 s 1080p shot) → Finalize with `driver: 'manual'` (job card written) → Export (GLB parses). Record the timings in the README.
- [ ] **Step 4: Commit** — `git add . && git commit -m "feat: MV Studio on two worlds, docs and e2e"`

---

## Self-review (done while writing)

- **Spec coverage:** project/shot model (T2), bridge + override (T3, T12), previz (T4–T5), server/jobs/WS (T6), Seedance driver incl. manual fallback (T7), export GLB + Blender (T8), VARCO injector + fetch (T9), Director UI timeline/scrubber/jobs (T10), prompt→path + phone camera (T11), second world + docs + e2e (T12). Error handling per spec is inside T4 (GPU fallback/timeout), T5 (ffmpeg), T7 (CLI/login → manual), T9 (validation), T11 (permission/WS). Testing per spec: unit in T1/T2/T7/T9/T10/T11, integration in T4/T5/T6/T8/T9, manual e2e in T12.
- **Placeholders:** none; the VARCO API endpoint shape in T9 is explicitly marked as to-be-confirmed and gated behind `VARCO_API_KEY` with a working manual path.
- **Type consistency:** `Key` shape identical in T1/T2/T10/T11; `launchWorld` signature used the same way in T5/T8; `projectDir/readProject/writeProject` names consistent T6–T8; `buildArgv/jobCardMarkdown/detectCli/runSeedance` consistent T6/T7; `injectAsset` options consistent T9 test/impl.
