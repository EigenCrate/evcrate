# Code Review: Phase 02 — Node-only Callers

**Date:** 2026-10-04  
**Reviewer:** Phase02Reviewer  
**Target:** Phase 02 — Migrate all maintained callers to explicit Node  
**Plan:** `plans/261003-1527-advisor-node-only-launch/plan.md`  
**Score:** 9.8/10  

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - Canonical instructions:
    - `.evcrate/source/.claude/workflows/advisor-mentoring.md`
    - `.evcrate/source/.claude/skills/advisor-strategy/SKILL.md`
    - `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md`
    - `README.md`
  - Retained consult scripts:
    - `scripts/consult-advisor-phase-e02.mjs`
    - `scripts/consult-advisor-phase-e03.mjs`
  - Test launch helpers:
    - `tests/advisor-controller/controller.test.cjs`
    - `tests/advisor-controller/mentor-brief.test.cjs`
    - `tests/advisor-controller/retry-orchestration.test.cjs`
    - `tests/advisor-controller/smoke-30s.cjs`
  - Projections and manifests:
    - 24 projection files under `.evcrate/source/` across 8 targets (`.agents`, `.antigravity`, `.claude`, `.codex`, `.copilot`, `.evcrate-vscode`, `.gemini`, `.omp`, `.pi`)
    - 9 build manifests (`.evcrate/build-manifest*.json`)
- **Lines of code analyzed:** 42 files modified (+320, -273 lines across diff); 460 underlying test suite executions evaluated.
- **Review focus:** Explicit Node invocation migration, removal of direct POSIX execution fallbacks, elimination of platform branching in test spawners, security validation (HOME resolution, no shell interpolation, UTF-8 stdin), adherence to YAGNI/KISS/DRY, and target projection synchronization.
- **Updated plans:**
  - `plans/261003-1527-advisor-node-only-launch/phase-02-node-only-callers.md` (all 5 todos checked, status complete)
  - `plans/261003-1527-advisor-node-only-launch/plan.md` (Phase 02 status marked Complete / 100%)

---

## Overall Assessment
Phase 02 implementation is clean, disciplined, and strictly adheres to the architectural contract established in Phase 01:
1. **Canonical instructions:** Completely migrated from direct execution to `node "$HOME/.evcrate/bin/evcrate-advisor"`. All 10 Bash examples in `advisor-mentoring.md`, the platform dispatch rules, syntax table, and PowerShell 5.1/7 snippet reflect explicit Node launch with strict HOME validation. Skills (`SKILL.md:31` and `brief-contract.md:25`) properly mandate Node on all supported hosts while maintaining the tool-less counsel agent boundary.
2. **Retained consult scripts:** All 8 calls across `scripts/consult-advisor-phase-e02.mjs` and `scripts/consult-advisor-phase-e03.mjs` migrated to `spawnSync(process.execPath, [bin, ...args])` with fail-closed absolute `$HOME` checks. Historical payloads, replay guards, and snapshots remain untouched; scripts were correctly not executed.
3. **Test launch helpers:** Eliminated obsolete `process.platform === 'win32'` branching across `controller.test.cjs`, `mentor-brief.test.cjs`, `retry-orchestration.test.cjs`, and `smoke-30s.cjs`. Spawns standardized on `process.execPath` and array `[CONTROLLER, ...]`. Valid OS internals (signals, detached processes, watchdogs) are preserved.
4. **Projections & manifests:** Generated projections across all 8 target closures (`distribute:build`) and all 9 build manifest tree hashes are fully synchronized and verified via `npm run distribute:check` (status ok).

---

## Critical Issues (MUST FIX)
None. Zero breaking changes, security vulnerabilities, or protocol regressions.

---

## Warnings (SHOULD FIX)
1. **Persistent Untracked Snyk Files in Worktree:**
   - 20 untracked files (`snyk-expert` agents and skills) remain in `.evcrate/source/` carried over from the baseline. While they allow local `distribute:check` and tests to pass, upstream git reconciliation is required before Phase 06/07 qualification.
2. **Historical Consult Scripts Must Never Run:**
   - `scripts/consult-advisor-phase-e02.mjs` and `scripts/consult-advisor-phase-e03.mjs` were updated for transport conformance. They must never be run as live verification tests as they interact with historical replay guards and non-isolated environments.

---

## Suggestions (NICE TO HAVE)
1. **Brief Invariance Note:**
   - `scripts/generate-runtime-brief.mjs` parses only the block `## Canonical Runtime Mentor Instructions` (line 92+ of `brief-contract.md`). The edit to line 25 of `brief-contract.md` legitimately left the generated brief digest and build identity unchanged. Documenting this will prevent confusion during future audits.
2. **Programmatic HOME Validation Test Fixture:**
   - In Phase 03 launch verification, consider adding an explicit test fixture verifying that a programmatic caller passing relative or empty `HOME` fails closed rather than falling back.

---

## Positive Observations
- **KISS & DRY:** Replaced duplicate, diverging execution logic and platform ternary checks with a single uniform launch pattern: `process.execPath` + `[bin, ...args]`.
- **YAGNI:** No unnecessary wrapper scripts, daemon processes, or abstract multi-runtime indirection layers created.
- **Defensive Security:** Shell execution disabled (`shell: false`); stdin streaming preserves exact UTF-8 JSON without shell interpolation; invalid or relative `HOME` fails immediately with exit code 1.
- **Truthful Projections:** All 8 targets updated via generator-owned distribution outputs without manual projection editing.

---

## Recommended Actions
1. **Approve Phase 02:** Mark Phase 02 complete and proceed to Phase 03.
2. **Proceed to Phase 03:** Execute [Phase 03 — Linux launch verification](./phase-03-linux-launch-verification.md) to implement real isolated lifecycle smoke, error regressions, and Windows-safe fixtures.

---

## Metrics
- **Type Coverage:** 100% clean TypeScript build (`tsc` succeeded via `npm run build`).
- **Test Pass Rate:** 100% (460/460 executed tests passed across `test:protocol`, `test:cli`, `test:adapters`, `test:advisor-controller`; 25 skips are platform/vendor-specific).
- **Distribution Parity:** `npm run distribute:check` status ok across all 8 targets.
- **Linting:** Clean.

---

## Validation Commands and Results
- `npm run test:protocol`: Exit 0 (53/53 passed)
- `npm run test:advisor-controller`: Exit 0 (234/234 passed, 24 skipped)
- `npm run test:adapters`: Exit 0 (109/109 passed)
- `npm run test:cli`: Exit 0 (64/64 passed, 1 skipped)
- `npm run distribute:check`: Exit 0 (`{"status":"ok"}`)
- Total: 460/460 passed, 0 failed, 25 skipped.

---

## Unresolved Questions
1. When will upstream commit the 20 untracked Snyk files or regenerate manifests without them to ensure fresh clone reproducibility?
