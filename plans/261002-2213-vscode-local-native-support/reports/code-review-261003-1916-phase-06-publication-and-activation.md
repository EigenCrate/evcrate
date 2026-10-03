# Code Review Report: Phase 06 — Publication and Explicit Activation

**Date:** 2026-10-03  
**Reviewer:** Senior Software Engineer / Phase06Reviewer  
**Target:** VS Code Local Native Support (`vscode`)  
**Status:** Completed & Approved  
**Score:** 9.3/10  

---

## Code Review Summary

### Scope
- **Files reviewed:**
  1. `.evcrate/targets/vscode/manifest.json`
  2. `src/distribution/local-build-staging.ts`
  3. `src/distribution/manifest.ts`
  4. `src/adapters/vscode/names.ts`
  5. `tests/distribution/publication-vscode-home.test.mjs`
  6. `tests/distribution/publication-vscode-project.test.mjs`
  7. `.evcrate/build-manifest-vscode.json`
  8. `.evcrate/build-manifest.json`
- **Lines of code analyzed:** ~1,850 LOC (plus related distribution modules and manifest payloads)
- **Review focus:** Phase 06 — Publication, target isolation, HOME/project scopes, CAS concurrency, collision rejection, build manifest generation, and recovery semantics
- **Updated plans:**
  - `plans/261002-2213-vscode-local-native-support/phase-06-publication-and-activation.md`
  - `plans/261002-2213-vscode-local-native-support/progress.md`

### Overall Assessment
Phase 06 implementation establishes clean, robust, and deterministic publication for the native `vscode` target (`.evcrate-vscode`). The solution preserves backward compatibility with legacy 7-target aggregate manifests and historical journals while adding the 8th target with promotion order 50. Project and HOME publications are strictly isolated: unmanaged files in `.evcrate-vscode` trigger conflict rejection, user configurations (`.evcrate.json`) are preserved verbatim, and CAS hooks detect post-plan concurrency conflicts. All 5 dedicated Phase 06 tests pass, the full 91-test publication suite passes, and the 99-test adapter suite passes with zero regressions.

---

## Critical Issues
*None.* Zero breaking issues, security flaws, or functional regressions identified.

---

## High Priority Findings
*None.*

---

## Medium Priority Improvements
1. **Unlisted Compiled Adapter Sources in Target Manifest:**
   - **Location:** `.evcrate/targets/vscode/manifest.json` (`adapter_sources: []`)
   - **Issue:** While `dist/adapters/vscode/index.js` is recorded in `adapter_hashes`, it functions as a barrel re-export (`export * from ...`). If individual implementation files (`adapter.js`, `hooks.js`, `policy.js`, etc.) are modified without modifying `index.js`, the manifest hash will not update.
   - **Impact:** Stale build detection will not automatically invalidate builds when internal vscode adapter files change.
   - **Recommendation:** Enumerate compiled adapter outputs in `adapter_sources` during Phase 07 (Automated release qualification) before generating release candidates, consistent with Copilot and Codex conventions.

2. **Residual Test Staging Directory in Workspace Root:**
   - **Location:** `.evcrate-project-result-limit-0HiiwK/`
   - **Issue:** An interrupted test run of `tests/distribution/publication-apply.test.mjs` left an untracked temporary folder in the package root.
   - **Recommendation:** Tests should register exit hooks (`process.once('exit')`) or prefer OS temporary directories (`tmpdir()`) to prevent dirty workspace residue.

---

## Low Priority Suggestions
1. **Unified Adapter Registry Path in Staging Post-Qualification:**
   - **Location:** `src/distribution/local-build-staging.ts:104` (`manifest.id === 'vscode' ? vscodeAdapter : getProjectionAdapter(manifest.id)`)
   - **Note:** Appropriate for Phase 06 while `vscode` remains unqualified in public registry. Once Phase 08 qualification lands, register `vscodeAdapter` in `src/adapters/index.ts` so `getProjectionAdapter` handles all targets uniformly.

2. **Temporary Directory Lifecycle in Large Test Matrices:**
   - **Observation:** Large test runs across the entire test suite accumulated thousands of temporary `evcrate-*` folders in `/tmp` (tmpfs), risking `EDQUOT` (quota exhaustion).
   - **Recommendation:** Ensure all test fixtures wrap execution in `try ... finally { rmSync(..., { recursive: true, force: true }); }`.

---

## Positive Observations
- **Strict Scope Isolation:** HOME and project publications operate completely independently. Recovering project publication does not alter HOME state, and recovering HOME leaves project untouched.
- **Fail-Closed Protection:** Unmanaged existing files in `.evcrate-vscode` trigger explicit conflicts (`CAS_CONFLICT` / `PUBLICATION_FAILED`) instead of silent overwrites.
- **Preserved User Configuration:** Pre-existing user-owned `.evcrate.json` files and unowned user documentation are preserved across dry-run, apply, and recovery passes.
- **Backward Compatibility:** `src/distribution/publication-plan.ts:assertAggregateBuild` explicitly accommodates legacy 7-target aggregate manifests (length 8) as well as the new 8-target aggregate manifest (length 9).
- **Truthful Cutover State:** `cutover.ts` explicitly flags `vscode` with `parityVerified: false` and `closureVerified: false` until Phase 08 qualification.

---

## Metrics
- **Phase 06 Tests Pass Rate:** 100% (5/5 passing)
- **Publication Suite Pass Rate:** 100% (91/91 passing)
- **Adapter Suite Pass Rate:** 100% (99/99 passing)
- **CLI Suite Pass Rate:** 100% executed (56/56 passing, 1 Windows-only suite skipped on Linux)
- **Build / Typecheck:** Clean (0 errors, `npm run build` succeeds)
- **Lint:** Clean

---

## Validation Commands & Results
```sh
# 1. TypeScript build & prebuild generation
npm run build
# Result: SUCCESS (0 errors)

# 2. Dedicated Phase 06 publication tests
node --test tests/distribution/publication-vscode-home.test.mjs tests/distribution/publication-vscode-project.test.mjs
# Result: 5/5 passed (6.14s)

# 3. Full publication suite
npm run test:publication
# Result: 91/91 passed (232.66s)

# 4. Adapter contract suite
npm run test:adapters
# Result: 99/99 passed (137.19s)

# 5. CLI & context suite
npm run test:cli
# Result: 56 passed, 1 skipped (33.16s)

# 6. Cutover & validation rollout suites
npm run test:cutover && npm run test:validation-rollout
# Result: 7/7 cutover passed, 6/6 rollout passed (247.75s)
```

---

## Unresolved Questions
1. Should `adapter_sources` in `.evcrate/targets/vscode/manifest.json` be populated by an automated build script in Phase 07, or enumerated statically as in Copilot/Codex manifests?
2. Does VS Code Local runtime require any unique platform-specific line ending or encoding normalization during packaging, or does standard UTF-8 CJS closure suffice (to be verified in Phase 08)?
