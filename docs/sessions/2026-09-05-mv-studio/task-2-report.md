# Task 2: Project & Shot Schema Helpers (TDD) — Report

## Task Summary
Implemented project and shot schema helpers with validators using test-driven development (TDD). This task follows Task 1 (package scaffold with vitest and keys.mjs) and adds a pure module `studio/schemas/project.mjs` with comprehensive test coverage.

## Implementation

### Files Created
1. **`studio/schemas/project.mjs`** (39 lines)
   - Exports: `createProject`, `createShot`, `validateKey`, `validateShot`, `validateProject`, `WORLDS`, `newId`
   - Pure ESM module with no external dependencies (uses node:crypto)
   - Helper function `isVec` for vector validation

2. **`studio/test/project.test.mjs`** (28 lines)
   - 6 test cases covering all functionality
   - Uses vitest describe/it/expect API
   - Tests span creation, validation, defaults, error handling, and aggregation

### Implementation Details

#### Exports
- **`WORLDS`** (const): List of valid world names: `['union-square-sf', 'kyoto-higashiyama']`
- **`newId()`**: Generates short UUIDs (13 chars) via `randomUUID().slice(0, 13)`
- **`createProject({ name, world })`**: Creates project object with:
  - Auto-generated id (via newId)
  - createdAt (ISO timestamp)
  - refs: { artist: [], style: [] }
  - shots: []
  - finalize: []
  - Throws if world not in WORLDS
- **`createShot({ name, fps?, width?, height?, timeOfDay? })`**: Creates shot with defaults:
  - fps: 30
  - width: 1920
  - height: 1080
  - timeOfDay: 'sunset'
  - keys: []
- **`validateKey(k)`**: Returns error array for key frame validation:
  - t must be >= 0
  - m must be 'air' or 'walk'
  - air mode: needs eye [x,y,z]
  - walk mode: needs pos [x,z]
  - look must be [x,y,z] (always required)
  - fov (optional): must be in (10, 150)
  - time (optional): must be 'day', 'sunset', or 'night'
- **`validateShot(s)`**: Returns error array for shot validation:
  - Validates name presence
  - Validates fps/width/height are positive
  - Validates timeOfDay is valid
  - Aggregates key validation errors with index prefix
  - Checks key times are monotonic (sorted by t)
- **`validateProject(p)`**: Returns error array for project validation:
  - Validates id and name presence
  - Validates world is known
  - Aggregates shot validation errors with index prefix

#### Design Decisions
- Validator functions return error arrays (not throw) for composable error handling
- Helper `isVec(v, n)` uses `Array.isArray()`, length check, and `v.every(Number.isFinite)`
- Key validation includes optional fields (fov, time) with proper range checking
- Shot validation checks key time monotonicity with early exit after first violation
- Project validation delegates to shot validators and aggregates errors

## TDD Process

### Step 1: Failing Test (RED)
Created `studio/test/project.test.mjs` with 6 test cases.

**Run command:** `cd studio && npx vitest run test/project.test.mjs`

**Result:**
```
Error: Cannot find module '../schemas/project.mjs' imported from
'C:/Users/daewook/Desktop/Personal Project/nc_work_automation/fable51-worlds/studio/test/project.test.mjs'
```
Status: Test file fails to load — module missing (expected).

### Step 2: Implementation (GREEN)
Created `studio/schemas/project.mjs` with complete implementation from brief.

**Run command:** `cd studio && npx vitest run test/project.test.mjs`

**Result:**
```
✓ test/project.test.mjs (6 tests) 11ms

Test Files  1 passed (1)
Tests       6 passed (6)
Duration    3.61s
```

### Step 3: Full Suite Validation
Verified no regressions in existing tests.

**Run command:** `cd studio && npx vitest run`

**Result:**
```
✓ test/keys.test.mjs (9 tests) 8ms
✓ test/project.test.mjs (6 tests) 10ms

Test Files  2 passed (2)
Tests       15 passed (15)
Duration    4.08s
```

## Test Coverage Details

All 6 tests pass:
1. **"creates a project with defaults"** — Validates createProject structure and id regex `/^[a-z0-9-]{8,}$/`
2. **"rejects unknown worlds"** — Verifies throw on invalid world parameter
3. **"shot defaults: 30fps 1920x1080 sunset"** — Validates all shot defaults and empty keys array
4. **"validateKey flags bad keys"** — Tests valid key acceptance and three error cases (walk without pos, negative t)
5. **"validateShot requires monotonic key times"** — Verifies detection of unsorted key times
6. **"validateProject aggregates"** — Confirms empty error array for valid project with shot

## Commit

**Hash:** `c1a89d5`
**Message:** `feat(studio): project/shot schema helpers (TDD)`
**Files changed:** 2 (project.mjs, project.test.mjs)
**Lines added:** 67

Commit includes:
- Claude Fable 5.1 co-author trailer
- Session URL trailer
- Detailed commit body explaining functionality and test coverage

## Self-Review

### Correctness
- Implementation matches brief code exactly (verbatim copy for maximum fidelity)
- All 6 tests pass, all assertions match expected behavior
- No test skips; no brittle assertions
- Error messages match test expectations

### YAGNI (You Aren't Gonna Need It)
- No unnecessary exports; no extra helper functions
- Vector validator `isVec` is internal-only, not exported
- All parameters and returns are specified in brief

### Test Quality
- Tests verify behavior, not implementation details (e.g., newId returns 13-char string, not UUID internals)
- Tests cover happy path, error cases, defaults, aggregation, and data constraints
- Assertions are specific: `.toMatch()` for regex, `.toContain()` for error array membership, `.toEqual()` for structure

### Code Style
- Follows ESM conventions (import/export)
- Consistent with keys.mjs in same package
- Compact but readable; function bodies under 10 lines
- No console logs, no side effects outside of creation

### Integration
- Module imports only node:crypto (built-in)
- No server imports (as stated in brief: "Nothing in the server imports it yet")
- Works with existing vitest config and test harness

## Concerns
None. Implementation is complete and verified.

## Files Changed
- `studio/schemas/project.mjs` (new, 39 lines)
- `studio/test/project.test.mjs` (new, 28 lines)

## Test Results Summary
- Project tests: 6/6 passed
- Full suite: 15/15 passed (including 9 from Task 1 keys.test.mjs)
- No regressions
- No test warnings or errors
