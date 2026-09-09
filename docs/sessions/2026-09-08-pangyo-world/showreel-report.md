# Showreel + README feature tour — report

Date: 2026-09-08 · Machine: RTX 3070, Windows 11, Node 22, ffmpeg/ffprobe 7.1
Commits: `7dc9a94` (tool + media), `89bf88b` (README). Not pushed.

---

## 1. How it was driven

`studio/tools/showreel.mjs` follows the `tools/stage1_targetcut.mjs` pattern: it starts **its
own** studio server (`STUDIO_PORT=5210`, `STUDIO_PROJECTS=%TMP%/mv-studio-showreel/projects`)
and uses `page.route` to rewrite the running Director UI's `/api` and `/files` calls to it.

**Chosen path for the Director capture (of the two the brief offered): the running :5180 UI +
my own private server, not a `showreel` project on :5190.** It is strictly simpler *and*
strictly cleaner — no project is ever created under `studio/projects/`, so there is nothing to
delete afterwards. Verified after the run: `studio/projects/` still holds exactly the six
pre-existing projects (`daewook-test` ×2, `Pangyo stage 1` ×3, `collision-check`) and nothing
of mine.

The one thing that cannot be re-routed is `/ws` (Playwright's `page.route` does not intercept
WebSocket upgrades), so the Director's relay is the real :5190 one. The phone beat therefore
reads :5190's phone token for its synthetic page. The token *shown on screen* in the Director's
QR panel is my private server's (the panel resolves it through `/api/config`, which **is**
routed), i.e. a token belonging to a process that lived ~90 s and is gone — see Concerns.

## 2. What was rendered

All three shots: authored keys → **Check path** → **Fix path** where needed → `path clear` →
**Render previz**, 1920×1080 @ 30 fps, through the live world in the Director iframe.

| Shot | World | Duration / frames | life | Path check | Fix | Previz | Iframe world load | previz.mp4 |
|---|---|---|---|---|---|---|---|---|
| pangyo | pangyo-technovalley | 20.0 s / 600 | on | **clear first time** | — | **254.8 s** (0.42 s/frame) | 6.8 s | 38.6 MB |
| union | union-square-sf | 12.0 s / 360 | on | 2 collisions (0.7 s) | 2 keys inserted → clear | **235.7 s** (0.65 s/frame) | 14.5 s | 42.4 MB |
| kyoto | kyoto-higashiyama | 12.0 s / 360 | off | 2 collisions (0.4 s) | 2 keys inserted → clear | **106.9 s** (0.30 s/frame) | 21.0 s | 11.4 MB |

Total render wall time **751 s (12.5 min)** for 1320 frames. No run fell back to software
rendering. Union and Pangyo are markedly slower per frame than the `e2e.mjs` baselines
(0.49 / 0.40 s/frame) because those shots run with `life=1`.

**Camera authoring.** Every eye position was pre-checked against the live world with the same
downward-ray probe the Director uses (`window.__twin.probePath`;
`blocked = y < ground + 0.3 || (structure && y < top + clearance)`), driven from a throwaway
Playwright page. That mattered: **Fix path lifts blocked *segments* but refuses by design to
move a key that is itself inside a structure**, so a shot whose keys are bad cannot be rescued.
Three first-draft mistakes were caught and corrected this way, and they are recorded as comments
in the script:

- **Kyoto** — the `TOURS` anchors for that world are written at `y: 1.7`, a walker's eye height,
  not a sea-level altitude; the Higashiyama ground is 39 m under Gion and 62 m under the pagoda,
  whose own top is 101 m. Two of my first keys were inside machiya, and Fix path (correctly)
  reported them and stopped. Altitudes are now read from `terrain.heightAt`.
- **Union Square** — the `Apple Union Square` anchor `[44, 0.5, -36]` is *inside* that building
  as far as the roof probe is concerned (surface 11.3 m). The last key now stops on the plaza
  side of the façade at `[40, 5, -22]`.
- **Pangyo** — a straight descent from the aerial arc to the south forecourt passes through the
  NC massing (surface 55 m at `[-35, 0]`), so the dive now swings around the tower's west side;
  and the southbound 판교역로 dolly climbs from z = 150 because the fitted straight street runs
  through 삼성화재 판교사옥 (58.3 m at z = 240) and 카카오 판교아지트 (49.0 m at z = 260) — the
  stage-1 approximation the world's own QA report records.

## 3. Director capture

Playwright `recordVideo` at 1920×1080 against the running :5180 UI. Beats, in order: type a
Korean/English prompt into **Prompt → path** → **Generate** (provider `none`) → `path clear` →
re-block the shot as a four-key street-level dolly down 판교역로 → **2 collisions** → **Fix
path** → `path clear — no collisions` → scrub the timeline in 4 steps → **Render previz** →
open the **Phone camera** panel (QR + LAN URL visible) → a second Playwright page on
`/phone/?projectId=…&token=…` sends 70 synthetic `cam` messages over `window.__ws`, and the
viewport camera pans to street level (`eye (2.09, 1.70, -10.29)`).

A collision check on a 1080p world is tens of seconds of *waiting*, so the segment is not a
time-lapse of the session: each beat contributes one short, non-overlapping window of the
recording (the seconds either side of the moment something changes on screen), cut together and
nudged to length — 6 clips, 24.4 s of real time at 1.62× = 15.03 s, and one 15.3 s phone clip at
2.55× = 6.00 s.

Two bugs found and fixed while iterating on this, both now handled in the script:

1. **Stale `#status-line`.** `Generate` runs Fix path automatically and leaves
   `path fixed — …` in the status line. Waiting on that text without clearing it first matches
   the *previous* run instantly and reads the pre-fix collision report back as the result — so
   the first capture showed "Fix path" apparently doing nothing. `clickFixPath()` now clears the
   line before clicking.
2. **The demo's own collisions were unfixable.** The first version re-blocked the shot by
   dropping every generated key to `y = 8`, which put two anchor keys *inside* the NC tower —
   exactly the case Fix path refuses. Replaced with four individually-clear street-level keys
   whose long last segment crosses 삼성화재, which is precisely what Fix path exists for.

## 4. The reel

`docs/media/mv-studio-showreel.mp4` — ffprobe: **h264, 1920×1080, yuv420p, 30/1 fps,
2071 frames, 69.00 s, 47,943,800 bytes (47.9 MB), one stream (video only, silent)**.

| # | Segment | Duration | Caption |
|---|---|---|---|
| 0 | title card | 3.00 s | "MV Studio" / "film AI-built cities" |
| 1 | pangyo | 20.00 s | Pangyo Techno Valley — built from OpenStreetMap + SRTM in a day |
| 2 | union | 12.00 s | Union Square — the upstream world, filmed by MV Studio |
| 3 | kyoto | 12.00 s | Kyoto Higashiyama — same timeline, different engine |
| 4 | director-ui | 15.03 s | Prompt → camera path → collisions found and fixed → previz |
| 5 | director-phone | 6.00 s | Your phone is the camera |
| 6 | end card | 4.00 s | github.com/Daewooki/fable51-worlds · fork/Claude Code/OSM line · 판교테크노밸리 · 유니언스퀘어 · 히가시야마 |

0.5 s `xfade` between every pair (6 transitions), lower-third captions with a 0.45 s alpha fade
in/out over the first ~7 s of each segment, 42 px Arial Bold in a box at 62 % alpha, Malgun
Gothic for the Korean end-card line. 72 s of material − 6 × 0.5 s = 69 s.

**CRF.** The brief asked for CRF 20 *and* ≤ 60 MB; for this content those conflict — CRF 20 is
**73.4 MB**. The script encodes at CRF 20, ffprobes it, and re-encodes once at CRF 23 if it is
over 60 MB, which lands at 47.9 MB. That fallback is in the tool, not a one-off.

## 5. Other outputs

| File | Size | Notes |
|---|---|---|
| `docs/media/showreel.gif` | **7.51 MB** | 720 px, 12 s (reel 9.7–21.7 s: the Pangyo dive, the cut to 판교역로 at night, the climb to 판교역), 10 fps, 64 colours, own caption |
| `docs/media/showreel-poster.jpg` | **208 KB** | reel t = 5.5 s — the NCSOFT R&D Center with its rooftop sign over the whole valley |
| `docs/media/director-prompt.png` | **160 KB** | reel t = 64.0 s — prompt panel, generated keys, phone QR + URL, phone-driven viewport, `previz running 13 %` |

The GIF encoder walks a ladder (720/13/200 → 720/10/96+denoise → 720/10/64+denoise, then
640 px) and stops at the first rung under 8 MB; 12 s of a lit city with the crowd running costs
19.4 MB at the top rung, and the temporal denoise is what actually buys the LZW its compression
back. The Director still is quantised to 64 colours — a flat-coloured UI loses nothing visible
and goes from 756 KB to 160 KB.

**Verification.** ffprobe as above, plus four sampled frames written to
`docs/media/showreel-f1..f4.png`, viewed, and deleted before committing: (1) the Pangyo swoop
past the NC curtain wall, (2) Union Square's plaza and the Dewey Monument with the crowd and the
caption, (3) Kyoto over the machiya roofs toward the Yasaka Pagoda at sunset, (4) the Director
mid-scrub showing `path clear — no collisions` and `path fixed — 2 keys inserted`.

**Repo additions: 55.8 MB** (47.9 + 7.5 + 0.21 + 0.16), against the 70 MB budget.

## 6. README

Root `README.md`, above the untouched upstream divider:

- Hero GIF swapped from `pangyo-target-cut.gif` to `showreel.gif`, with the full reel, the
  poster and the rebuild command linked immediately under it.
- A **Numbers** line, each figure with the command or source that produced it:
  `git rev-list --count upstream/main..HEAD` → **51**; `git diff --shortstat upstream/main..HEAD`
  → **378 files, +31,034 lines**; **189 tests** — re-run green at this commit: studio
  `npx vitest run` **115/115** in 78.3 s (20 files), pangyo **74/74** in 16.6 s (6 files) —
  plus one postMessage-bridge script per world; **3 worlds**; e2e **196.4 / 159.3 / 149.2 s**.
- The existing summary table kept as it was.
- A new **feature tour**, one subsection each with one image and 2–3 concrete sentences:
  Director & timeline (`director.png`), collision check & Fix path (`path-fix.png`),
  prompt→path & phone camera (`director-prompt.png`), Pangyo from public GIS
  (`pangyo-nc-aerial.png` + the three stage cuts), hero modules in headless Blender
  (`pangyo-nc-entrance.png`), Seedance finalize + GLB/Blender export (no image, links into
  `studio/README.md`), the VARCO/GLB injector (no image — see Concerns), and security &
  local-first as a bullet list.
- Quick start / How it was built / Credits kept verbatim below the tour.

`studio/README.md` gains a short **The showreel** subsection under Tests documenting the tool,
its ports and its work dir.

## 7. Skipped / not done

- **The VARCO before/after pair.** The brief allowed skipping it if it risked leaving a world
  dirty. `inject_asset.mjs --replace` rewrites `union-square-sf`'s asset kit and manifest, and
  `union-square-sf/` is explicitly off limits for this task; a botched restore would be a much
  worse outcome than a missing image. That subsection is text-only and links to
  `studio/README.md#varco-3d-assets`.
- **A Seedance job-card screenshot.** Would need a finalize job in a project in the Director;
  cheap in principle, but nothing to show that the linked README section does not already say in
  words. Text-only, with the measured export figures instead.
- **`docs/media/pangyo-target-cut.gif` (3.1 MB) is now unreferenced** by any README, since the
  hero GIF was replaced. Left in place rather than deleted — it is a prior task's committed
  deliverable and removing it was not asked for.

## 8. Concerns

1. **The Director still and the phone segment show a QR code and a phone URL containing a LAN
   IP and a phone token.** The token is my *private* server's per-process secret
   (`randomBytes(16)`, minted at start-up, invalidated when the process exits) and that process
   has been dead since the run finished; the address is RFC1918. So it is inert. It is still a
   token in a public README image, and if that reads wrong it is a one-line change: mask the URL
   text with a `drawtext` box, or re-run with `STUDIO_TOKEN` pinned to something obviously fake.
2. **CRF 23, not 20** — see §4. The brief's two constraints could not both be met.
3. **The reel is silent with no audio track at all** (not a silent AAC track), as permitted.
4. The Pangyo sample frame at reel t ≈ 13.8 s is a close pass along the NC curtain wall that
   fills the frame; it reads as a deliberate swoop in motion but is a dull still.
5. The two auto-inserted Fix-path keys in the Union Square and Kyoto shots produce a visible
   lift over the obstruction. That is the feature working, not a defect, but it is a small
   bump in an otherwise smooth move.
