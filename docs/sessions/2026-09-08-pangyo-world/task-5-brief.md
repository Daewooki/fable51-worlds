### Task 5: Stage 3 — life, routes, QA report

**Files:**
- Create: `src/data/recon/routes.json` (대왕판교로 N↔S, 판교역로 E↔W, 판교로; lane counts from streets_spec), `src/data/recon/viewpoints.json` (4 viewpoints as camera definitions; photo paths optional and git-ignored under `photos/`), `pangyo-technovalley/tools/qa/qa_report.mjs` (screenshots at the 4 viewpoints + traffic/pedestrian smoke: after 30 s of simulated time ≥ 20 agents, no NaN), `pangyo-technovalley/FINAL_QA_REPORT.md`.
- Modify: `src/life/*` only where names/routes were hard-coded (should be none after Task 2).

- [ ] **Step 1:** Routes + signals from OSM `signals` bin; pedestrians spawn on sidewalks of fitted streets; `life=1` boot shows moving agents (screenshot pair 0 s / 10 s differs).
- [ ] **Step 2:** QA script + report with the defects list (what is approximated: diagonal streets, generic facades, no interiors).
- [ ] **Step 3:** Commit `feat(pangyo): life systems and QA report (stage 3)`.

