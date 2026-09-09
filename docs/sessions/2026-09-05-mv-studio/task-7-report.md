# Task 7 report: Seedance finalize driver

## What was built

- `studio/server/finalize/seedance.mjs` — replaced the one-line stub (`runSeedance` threw `not implemented`) with:
  - `buildArgv(job, files)` — pure argv builder for `higgsfield generate create seedance_2_5 ...`.
  - `jobCardMarkdown(job, files)` — manual-path job card writer.
  - `detectCli()` — runs `higgsfield model list --json`, maps ENOENT / no-workspace / not-logged-in / non-zero exit to `{ ok:false, reason }`.
  - `runSeedance({ project, shotId, mode, prompt, duration, resolution, aspect, generateAudio, useArtist, useStyle, useAudio, driver, log })` — resolves shot/ref file paths via `projectDir(project.id)`, requires previz to exist for non-t2v modes, always writes the job card, then either runs the CLI (via `spawn`) and downloads the resulting mp4, or falls back to `{ driver:'manual', jobCard, reason }`.
- `studio/test/seedance.test.mjs` — the brief's 3 tests verbatim, plus a 4th test per ruling 2 (`video_extension` keeps `--duration`/`--extension_mode`, drops `--aspect_ratio`).

### Controller rulings applied
1. **Ruling 1** (argv per-mode skip list): implemented as two independent conditions — `--duration` pushed for every mode except `video_edit`; `--aspect_ratio` pushed for every mode except `video_edit` and `video_extension`. `video_extension` now gets `--duration` + `--extension_mode` but no `--aspect_ratio`.
2. **Ruling 2**: added the `video_extension` test described above; the other three test cases needed no change (none use `video_extension`).
3. **Ruling 3**: verified directly against the real CLI on this machine — `higgsfield.cmd model list --json` exits with status 4 and stderr `Error: No workspace selected.\nHint: Run: hf workspace set <workspace_id>\n`. The existing regex (`/No workspace selected|.../i`) matches, so `detectCli()` returns `{ ok:false, reason:'higgsfield CLI needs login: run `higgsfield auth login` then `higgsfield workspace set <id>`' }`. Did not run `higgsfield auth login` or `workspace set`.
4. **Ruling 4**: added `extractMp4Url(out)` / `findUrlField(node)` — parses `{...}` blocks out of the CLI's combined stdout (searched last-object-first), recursively looks for any key ending in `url` (case-insensitive) whose string value points at a `.mp4` (optionally with a query string), and prefers that over the old loose regex fallback (`https?:\/\/\S+\.mp4\S*`). `mp4` is only set on the return object in the branch where the file was actually written via `fs.writeFileSync`; the "no url found" branch returns `{ driver, jobCard, raw }` without `mp4`, unchanged from the brief.
5. **Ruling 5**: `store.mjs` already uses `fileURLToPath(new URL(...))` for `PROJECTS_DIR`; `seedance.mjs` itself derives no paths from `import.meta.url`, so nothing to change there.

## TDD sequence
1. Wrote `studio/test/seedance.test.mjs` (4 tests) against the still-stubbed module.
2. `npx vitest run test/seedance.test.mjs` → FAIL, 4/4 failing (`buildArgv`/`jobCardMarkdown` not a function) — confirms the test exercises real code, not the stub.
3. Implemented `seedance.mjs` per the brief + rulings.
4. `npx vitest run test/seedance.test.mjs` → **4 passed**.

## detectCli() output (recorded)

```
$ node -e "import('./server/finalize/seedance.mjs').then(m=>console.log(JSON.stringify(m.detectCli())))"
{"ok":false,"reason":"higgsfield CLI needs login: run `higgsfield auth login` then `higgsfield workspace set <id>`"}
```

Raw probe (for the record, not part of the driver's own output):
```
status 4
stdout: ""
stderr: "Error: No workspace selected.\nHint: Run: hf workspace set <workspace_id>\n"
```

## Full studio suite

```
$ npx vitest run
 ✓ test/keys.test.mjs (9 tests)
 ✓ test/project.test.mjs (6 tests)
 ✓ test/seedance.test.mjs (4 tests)
 ✓ test/store.test.mjs (2 tests)
 ✓ test/jobs.test.mjs (2 tests)
 ✓ test/ws.test.mjs (1 test)
 ✓ test/api.test.mjs (2 tests)
 ✓ test/browser.test.mjs (3 tests)  31986ms
 ✓ test/previz.test.mjs (1 test)  38173ms

 Test Files  9 passed (9)
      Tests  30 passed (30)
 Duration  43.04s
```

All 30 tests pass (dev server on :5173 was already up for the browser tests, per the assignment).

## Spawn-quoting observation — a real bug found and fixed, deviating from the brief's literal code

The brief's Step 3 code does `spawn(BIN, argv, { shell: process.platform === 'win32' })` with `BIN = 'higgsfield.cmd'` and unquoted `argv` elements (in particular the free-text `prompt`, which will contain spaces in virtually every real job).

I verified two things empirically on this machine (Node v22.14.0, Windows):

1. **`shell:true` is mandatory for `.cmd` targets on this Node version.** Calling `spawn('some.cmd', argv)` *without* `shell:true` throws synchronously: `Error: spawn EINVAL` (errno -4071). Node's automatic "detect `.bat`/`.cmd` and shell out for you" fallback was removed after CVE-2024-27980, so the brief's `shell: process.platform === 'win32'` is in fact required, not optional.
2. **With `shell:true`, Node does *not* quote array args — it just `argv.join(' ')`s them.** I spawned a tiny probe script (`node argv_probe.mjs --prompt "neon rain, a \"glowing\" sign" --mode video_edit`) via `spawn('node', [probe, ...argv], { shell:true })` and the child's `process.argv` came back as 10 separate tokens — `"neon rain, a "glowing" sign"` was split on every space and the embedded `"` characters were silently dropped:
   ```
   ["generate","create","seedance_2_5","--prompt","neon","rain,","a","glowing","sign","--mode","video_edit"]
   ```
   i.e. the brief's code as written would send Seedance a mangled/truncated prompt and possibly misparsed flags for *any* prompt containing a space or quote — which is the normal case, not an edge case.

**Fix applied:** added `winCmdQuote(arg)` (wraps an arg in `"..."` when it contains whitespace or a cmd.exe metacharacter, escaping embedded `"` and any backslashes immediately preceding a `"` per the CommandLineToArgvW/cmd.exe convention) and `quoteForShell(argv)` (applies it only on win32; identity elsewhere). `runSeedance` now calls `spawn(BIN, quoteForShell(argv), { shell: ... })` instead of the raw `argv`. Re-ran the probe with the fix in place and confirmed the child now receives the exact original string:
```
quoted argv: ["--prompt","\"neon rain, a \\\"glowing\\\" sign\"","--mode","video_edit"]
captured (child saw process.argv): ["--prompt","neon rain, a \"glowing\" sign","--mode","video_edit"]
```
`buildArgv` itself stays pure/unquoted (it's unit-tested against exact token values and is also what the job-card markdown prints for manual copy-paste, where raw values read better than escaped ones); only the actual `spawn` call quotes. `detectCli()`'s `spawnSync` call was left unquoted since its args (`'model'`, `'list'`, `'--json'`) are fixed literals with no spaces.

**Residual risk (noted, not fully solved):** `winCmdQuote` handles the common cases (spaces, embedded double quotes, trailing backslashes before a quote) that a prompt or Windows file path will realistically hit. It does not exhaustively handle every cmd.exe metacharacter inside every context (e.g. a literal `%VAR%`-shaped substring in a prompt could still be expanded by cmd.exe's percent-expansion even inside quotes — quoting suppresses `&|<>^` but not `%`). Given prompts are free English text this is a low-probability edge case; flagging it rather than over-engineering a full cmd.exe parser.

## Self-review checklist

- **No `undefined`/`'undefined'` strings in argv for optional fields**: checked every conditional push — `files.previz`, `files.audio`, `job.useArtist/useStyle/useAudio` are all truthiness-guarded before use; `job.duration`, `job.resolution`, `job.aspect`, `job.extensionMode`, `job.prompt` all have `|| <default>` fallbacks before `String(...)`/interpolation. No path pushes a raw possibly-undefined value.
- **`runSeedance` never throws for a missing CLI**: `driver === 'manual' ? {...} : detectCli()` always produces a `{ok, reason}`; when `!cli.ok` it returns `{ driver:'manual', jobCard, reason }` rather than throwing. (It does throw for `'render the previz first'` when the previz file is missing for non-t2v modes — that's an input-validation error from the brief, not a CLI-availability error, and is unchanged from the brief.)
- **Spawn quoting**: see the dedicated section above — this was the one real deviation/fix beyond the ruling changes.

## Deviations from the brief's literal Step 3 code

1. Ruling 1's argv condition change (as specified).
2. Ruling 4's `extractMp4Url`/`findUrlField` JSON-first URL extraction (as specified).
3. **Added `winCmdQuote`/`quoteForShell` and applied it to the `spawn(...)` call in `runSeedance`** — not requested verbatim in the brief's Step 3 code, but required by the brief's own self-review instruction ("make sure the prompt argument is quoted safely") once I observed the brief's literal code would mangle any prompt with a space. This is the only line of the runner's control flow changed beyond the two rulings.

Everything else (job-card format, file layout under `projects/<id>/shots/<shotId>/`, `detectCli` regex, the `driver`/`mp4`/`jobCard` return shape, `RUNNERS.finalize` call shape in `index.mjs`) matches the brief exactly; `index.mjs` was not touched.

## Concerns

- The quoting fix is a judgment call beyond the brief's literal code, though squarely inside the brief's own self-review mandate. Flagging for controller review in case a different quoting strategy (e.g., building the whole command as one pre-joined string, or switching off `shell:true` via a different invocation strategy) is preferred.
- Could not test the live CLI happy path (successful generate + JSON output + mp4 download) since the workspace isn't logged in on this machine (expected — that's the creator's account, per ruling 3). The `extractMp4Url`/`findUrlField` logic was verified only via the unit tests' `files` fixture and manual reasoning, not against a real Seedance JSON response shape.

## Fix round 1 (post-review)

Addressed all four review findings in `studio/server/finalize/seedance.mjs` and `studio/test/seedance.test.mjs`.

**F1 — `extractMp4Url` greedy-regex bug.** Replaced the `/\{[\s\S]*\}/` single-match scan with `findJsonObjects(text)`: a brace-depth walk over the whole stdout that respects quoted strings and escapes (so `{`/`}` inside a JSON string value don't perturb depth), extracts each *balanced* top-level `{...}` object (handles multiple sibling objects — e.g. one progress object per `--wait-interval` tick followed by a final result object — and multi-line pretty-printed objects), and `JSON.parse`s each candidate, discarding ones that don't parse. `extractMp4Url` walks the objects in stream order and keeps updating `found` whenever `findUrlField` matches, so the *last* matching object wins (the final result, not an earlier progress object). Guarded the brace counter (`if (depth > 0) depth--`) so a stray unmatched `}` in surrounding log text can't drive it negative. The loose-regex fallback (used only when no JSON object carries a `*url` field) was tightened to `/https?:\/\/[^\s"'<>}\]]+\.mp4[^\s"'<>}\]]*/`, which stops at the first quote/space/bracket instead of running to the end of the string.

**F2 — download must not silently write a failed response.** `runSeedance` now does `const res = await fetch(url); if (!res.ok) throw new Error(\`download failed ${res.status} ${url}\`);` before reading the body and writing `final.mp4` — a failed download now throws instead of writing a garbage/empty file and returning `{ mp4: ... }` as if it succeeded.

**F3 — job-card quoting + no-URL logging.**
- `jobCardMarkdown` now builds its printed `higgsfield ...` command via `quoteForShell(buildArgv(job, files)).join(' ')` (the same helper `runSeedance` uses for the actual `spawn` call) instead of a raw unquoted join, so the command shown for manual copy-paste is actually pasteable when the prompt contains spaces.
- The "no URL found" branch in `runSeedance` now calls `log('no mp4 url found in higgsfield output; stdout tail:', tail)` before returning `{ driver: 'higgsfield-cli', jobCard: card, raw: tail }`, so the reason a `finalize` job produced no `mp4` shows up in the job log stream, not just in the silently-returned `raw` field.

**F4 — new tests**, all in `studio/test/seedance.test.mjs`:
- `extractMp4Url` and `winCmdQuote` are now exported from `seedance.mjs` (`findUrlField` was also exported, since it's a small standalone piece of the same logic) so the tests can call them directly.
- `describe('extractMp4Url', ...)`: (a) single pretty-printed JSON object with `result_url`; (b) two progress objects on separate lines followed by a final object with nested `output.video_url` ending `.mp4?sig=abc` — asserts the nested/last URL wins; (c) plain-text output with a bare URL followed by `"}"` — asserts the garbage is stripped; (d) no URL present — asserts a falsy return.
- `describe('winCmdQuote', ...)`: `'a b'` → `'"a b"'`; `'say "hi"'` → contains `\"hi\"`; `'C:\\dir\\'` → matches `/\\\\"$/` (ends in two backslashes then the closing quote, i.e. the trailing backslash is doubled so it doesn't escape the closing quote). These call `winCmdQuote` directly (unconditional, not gated on `process.platform`), per the review note that it's a pure function.
- Also widened the quoting trigger in `winCmdQuote` itself: it now quotes whenever the string has whitespace/`"&|<>^%`, **or ends with a backslash** (`s.endsWith('\\')`) — previously a bare trailing-backslash string with no other special character wouldn't be quoted at all, which is the exact case F4's third test exercises and which matters for Windows directory-shaped arguments.

### Verification after fix round 1

```
$ npx vitest run test/seedance.test.mjs
 ✓ test/seedance.test.mjs (11 tests)
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

```
$ npx vitest run
 ✓ test/keys.test.mjs (9 tests)
 ✓ test/project.test.mjs (6 tests)
 ✓ test/store.test.mjs (2 tests)
 ✓ test/jobs.test.mjs (2 tests)
 ✓ test/seedance.test.mjs (11 tests)
 ✓ test/ws.test.mjs (1 test)
 ✓ test/api.test.mjs (2 tests)
 ✓ test/browser.test.mjs (3 tests)  29504ms
 ✓ test/previz.test.mjs (1 test)  33593ms
 Test Files  9 passed (9)
      Tests  37 passed (37)
```

Re-ran `detectCli()` after the changes; unchanged output:
```
{"ok":false,"reason":"higgsfield CLI needs login: run `higgsfield auth login` then `higgsfield workspace set <id>`"}
```

### Concerns carried forward / new

- Same as before: the live CLI happy path (real `--json` streaming output → `extractMp4Url` → download) is still untested against an actual Seedance response, since the workspace isn't logged in on this machine. The new `extractMp4Url` tests use synthetic stdout shaped like what the CLI is documented/expected to emit (progress objects + a final result object with a `*_url` field), not a captured real transcript.
- `winCmdQuote`'s widened trigger (quote on trailing backslash) is a minor behavior change beyond what F4 literally asked for the test to assert; documented above and covered by the new test.
