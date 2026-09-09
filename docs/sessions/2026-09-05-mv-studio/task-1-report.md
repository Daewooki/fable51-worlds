# Task 1 Report: studio package + shared key sampler (TDD)

## Implementation Summary

Successfully implemented the MV Studio package scaffold and shared key sampler module following TDD methodology.

### Files Created

1. **studio/package.json** - Package manifest with ESM type, 5 dependencies, and 8 dev dependencies
2. **studio/tsconfig.json** - TypeScript configuration for ES2022 with strict mode
3. **studio/vitest.config.ts** - Vitest test runner config including .mjs and .ts tests
4. **studio/.gitignore** - Ignores node_modules, projects/*, and .certs/ (while keeping projects/.gitkeep)
5. **studio/projects/.gitkeep** - Directory marker
6. **studio/schemas/keys.mjs** - Pure functions for camera keyframe sampling
7. **studio/test/keys.test.mjs** - Complete test suite with 6 test cases

### Implementation Details

#### studio/schemas/keys.mjs

Exports three pure functions:

- **ease(a, b, k)** - Smooth interpolation using an easing function that applies quadratic-in for k<0.5 and quadratic-out for k>=0.5
- **duration(keys)** - Returns the last key's time value (or 0 if no keys)
- **sample(keys, t, fps=30)** - Main sampler that:
  - Finds the segment containing time t
  - Interpolates between two keys (A and B)
  - Returns object with: air (boolean), eye/pos (coordinates), look (camera look direction), cap (caption), cut (transition flag), fov (field of view), and moving (walk mode flag)

The sample function handles transitions between air and walk modes, interpolates camera parameters, and manages cut flags within a 1.6-frame window.

**Implementation Notes:**
- Single key case handled specially (no interpolation needed)
- Segment finder uses while loop with boundary condition `i < keys.length - 2` to safely access keys[i+1]
- Air/walk mode detection automatically determines default FOV (60 for air, 66 for walk) unless explicitly set
- Cut flag checks if we're within first 1.6 frames (at 30fps ≈ 0.053s) after a cut key

#### Bug Fix During Implementation

Found and fixed discrepancy in brief: the cut detection logic initially used `!!B.cut` but should use `!!A.cut` to correctly identify when a segment begins with a cut flag. This was discovered during TDD verification when tests revealed the logic mismatch. The test spec (as the source of truth in TDD) guided the correction.

## TDD Process Verification

### Step 1: RED - Failing Test
```bash
cd studio && npx vitest run test/keys.test.mjs
```
**Output:** Failed with "Cannot find module '../schemas/keys.mjs'"
- This is expected - module doesn't exist yet

### Step 2: GREEN - Passing Tests
```bash
cd studio && npx vitest run test/keys.test.mjs
```
**Output:** 6/6 tests passed (after fixing cut logic)
```
✓ ease is 0 at 0, 1 at 1, 0.5 at 0.5
✓ duration is the last key time
✓ interpolates air eye positions
✓ walk keys give pos and moving flag
✓ cut is true only within the first frame after a cut key
✓ caption switches at the midpoint of a segment
```

### Step 3: Full Test Suite
```bash
cd studio && npx vitest run
```
**Output:** Test Files: 1 passed | Tests: 6 passed
- Duration: 3.53s
- No warnings or failures

## Commit

```bash
git add studio && git commit -m "feat(studio): package scaffold and shared key sampler"
```

**Commit Details:**
- SHA: 8b65969
- Author: daewook <<author-email>>
- 8 files changed, 3959 insertions
- Trailers included: Co-Authored-By and Claude-Session

## Self-Review Findings

### Completeness
- All files specified in brief created
- All test cases implemented correctly
- All functions exported and working
- Package can be installed without issues

### Code Quality
- Pure functions with no side effects
- Clear variable names (ease, sample, duration, finish)
- Proper error handling (throws on empty keys)
- Boundary conditions handled correctly (Math.max/min clamps)
- Default values correctly apply FOV based on mode

### Discipline (YAGNI)
- Only implemented what was requested
- No extra utilities or dependencies
- Minimal pure function implementations
- Test file matches exact spec

### Testing
- TDD followed: RED → implement → GREEN
- 6 tests covering:
  - Basic easing function behavior
  - Duration calculation
  - Air mode eye position interpolation
  - Walk mode position and moving flag
  - Cut flag timing window
  - Caption midpoint switching
- All tests pass with no warnings
- Test output is clean

### Concerns / None Found

The implementation is complete, correct, and follows the TDD methodology strictly. The one discrepancy discovered (cut logic) was resolved by trusting the test spec over the brief's code snippet, which is the correct TDD approach.

## Files Changed

- studio/.gitignore (4 lines)
- studio/package.json (28 lines)
- studio/tsconfig.json (1 line)
- studio/vitest.config.ts (1 line)
- studio/schemas/keys.mjs (25 lines)
- studio/test/keys.test.mjs (31 lines)
- studio/projects/.gitkeep (0 lines)
- studio/package-lock.json (3869 lines - npm install output)

Total: 8 files, 3959 additions

---

## Fix Round 1: Review Findings

### Changes Made

1. **Implement hold-before-cut semantics** (Important)
   - Added check: if `B.cut && t < B.t`, return `pose(A, A, 0, t, fps)` to hold A's pose without interpolation
   - This ensures the camera holds its position until reaching the cut key at B.t
   - Renamed `finish()` to `pose()` for clarity

2. **Always include moving flag** (Minor)
   - Added `moving: false` to all air samples (both air-to-air and walk-to-air transitions)
   - Walk samples already computed moving, now always present

3. **Add edge case tests** (Minor)
   - Added test: `sample(KEYS, 2.2)` holds air pose from key[1] with cut === false
   - Added test: `sample([], 0)` throws "sample: no keys"
   - Added test: `sample([key], t)` returns that key's pose with cut === false (no throw)

4. **Add Node engine constraint** (Minor)
   - Added `"engines": { "node": ">=22" }` to package.json

### Test Results After Fix

```bash
cd studio && npx vitest run test/keys.test.mjs
```

**Output:** 9/9 tests passed
```
✓ ease is 0 at 0, 1 at 1, 0.5 at 0.5
✓ duration is the last key time
✓ interpolates air eye positions
✓ walk keys give pos and moving flag
✓ cut is true only within the first frame after a cut key
✓ caption switches at the midpoint of a segment
✓ holds air pose before a cut key (NEW)
✓ empty keys array throws (NEW)
✓ single key returns that key pose with cut false (NEW)
```

Full suite: Test Files: 1 passed | Tests: 9 passed | Duration: 3.78s

### Commit

```bash
git add studio && git commit -m "fix(studio): implement hold-before-cut semantics and add edge case tests"
```

**Commit Details:**
- SHA: dc21f9d
- Author: daewook <<author-email>>
- 3 files changed, 21 insertions
- Trailers included: Co-Authored-By and Claude-Session

### Logic Verification

**Hold-before-cut behavior:**
- At t=2.2 (before cut key at t=2.5):
  - Segment [keys[1]=2, keys[2]=2.5)
  - A = keys[1] (eye: [100,100,0], look: [0,0,0])
  - B = keys[2] (cut: true)
  - B.cut && t < B.t → true, return pose(A, A, 0, ...) 
  - Result: air pose from A with cut=false ✓

**Cut flag at landing:**
- At t=2.5 (at cut key):
  - Segment [keys[2]=2.5, keys[3]=4.5)
  - A = keys[2] (cut: true)
  - B = keys[3] (cut: undefined)
  - B.cut && t < B.t → false, normal interpolation with k=0
  - cut = !!A.cut && (2.5-2.5) < 1.6/30 = true && true = true ✓

**Cut flag expires:**
- At t=2.8 (0.3s after landing):
  - A = keys[2], B = keys[3]
  - cut = !!A.cut && (2.8-2.5) < 1.6/30 = true && (0.3 < 0.0533) = false ✓

### No Concerns

All findings addressed. Implementation now correctly reflects the hold-before-cut semantics and includes comprehensive edge case coverage.
