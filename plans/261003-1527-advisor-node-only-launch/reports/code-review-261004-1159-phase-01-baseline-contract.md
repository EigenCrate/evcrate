# Code Review: Phase 01 — Baseline and Contract

**Date:** 2026-10-04  
**Reviewer:** Phase01Reviewer  
**Target:** Phase 01 — Baseline and launch contract  
**Plan:** `plans/261003-1527-advisor-node-only-launch/plan.md`  
**Score:** 9.5/10  

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `docs/system-architecture.md` (Sections 1, 4, 5.6, 6, 7)
  - `docs/code-standards.md` (Enforceable architectural bans, explicit Node caller launch invariant)
  - `plans/261003-1527-advisor-node-only-launch/reports/phase-01-baseline.md`
  - `plans/261003-1527-advisor-node-only-launch/phase-01-baseline-contract.md`
- **Lines of code analyzed:** ~350 diff / baseline lines across documentation, standards, and plan contracts; 460 underlying test suite executions evaluated.
- **Review focus:** Baseline integrity, explicit Node invocation contract, platform support boundaries (Linux/Windows/macOS), YAGNI/KISS/DRY adherence, security invariants, error handling.
- **Updated plans:**
  - `plans/261003-1527-advisor-node-only-launch/phase-01-baseline-contract.md` (updated Todo checkboxes 1–4 to complete, status to complete / pending parent approval)
  - `plans/261003-1527-advisor-node-only-launch/plan.md` (updated Phase 01 status to Review ready / 100%)

---

### Overall Assessment
Phase 01 changes establish a robust, mathematically precise architectural boundary for standardizing `evcrate-advisor` invocation on Node (`>=22.19.0`) across all supported platforms. The contract strictly eliminates ambiguous direct POSIX execution fallbacks, shebang retries, and shell shims, while defining strict security invariants for executable resolution, absolute HOME validation, and cwd isolation.

Platform qualification boundaries are explicitly partitioned: Linux x64 as primary qualified host; Native Windows x64 qualified using the exact same candidate; macOS (Darwin) clearly demarcated as build-only native packaging and internal runtime integration, strictly labeled **untested/unqualified** with runtime testing explicitly forbidden.

The baseline report correctly accounts for all 8 targets in `.evcrate/targets/manifest.json`, inventories all maintained callers across canonical workflows, consult scripts, test harnesses, and checkpoint commands, and successfully reconciles the 20 untracked Snyk files to ensure 100% test pass parity (460/460 executed tests).

---

### Critical Issues
None. Zero breaking bugs, security holes, or architectural contradictions found.

---

### Warnings
1. **Dirty Source / Untracked Files Parity:**
   The worktree has 20 untracked files (`snyk-expert` agent and associated skills across target output directories) synced into `.evcrate/source/`. These files are required to satisfy the 19-agent assertion in `tests/adapters/vscode-resource-projection.test.mjs` and the tree hash validation in `src/distribution/manifest.ts:128` (`build-manifest*.json`). While this restores 100% test pass rate locally, any fresh checkout from Git lacking these 20 untracked files will fail tests. These files should be committed or build manifests regenerated without Snyk prior to release qualification.

2. **Heading Placement in Architecture Document:**
   In `docs/system-architecture.md`, the new subsection `### Approved proposed cross-platform advisor support boundary (Phase 01)` is placed under Section 7 at lines 717–721. Adjacent lines (712–713) describe historical Phase 01–04 Windows readiness repairs. Ensure downstream readers do not confuse the historical Phase 01–04 repair notes with the current Phase 01 launch contract.

---

### Suggestions
1. **Phase 02 Runtime Brief Coordination:**
   Migrating `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md` (line 25) will directly alter inputs to `scripts/generate-runtime-brief.mjs`. Phase 02 implementers must be reminded to run `npm run generate:brief` and update generated outputs alongside canonical edits.

2. **Explicit Verification of Non-Symlinked Controller in Shell Callers:**
   In addition to programmatic callers verifying real file status via `src/cli/health.ts:controllerPath()`, documentation for shell/harness callers should emphasize resolving symlinks to verify the canonical `<home>/.evcrate/bin/evcrate-advisor` path.

---

### Positive Observations
- **KISS & DRY:** Replaced diverging per-OS execution ladders with a single cross-platform invocation tuple: `node <absolute HOME-owned evcrate-advisor> [args]` with UTF-8 request JSON on stdin and EOF.
- **YAGNI:** Avoided unnecessary wrapper layers, daemon processes, or abstract multi-runtime indirection.
- **Security & Defensive Design:** Prohibits shell execution (`shell: false`), string interpolation (`node -e`), and invalid explicit `HOME` fallback (`HOME || os.homedir()`). Mandates terminal transport failure without synthesizing fabricated controller counsel.
- **Truthful Platform Boundaries:** Explicitly disallows claiming macOS test qualification while enabling necessary internal runtime code.

---

### Recommended Actions
1. **Approve Phase 01:** Parent orchestrator can safely approve Phase 01 baseline and contract.
2. **Proceed to Phase 02:** Hand off caller inventory to Phase 02 for sequential migration of workflow, skills, consult scripts, and direct test callers.
3. **Upstream Git Reconciliation:** Coordinate with repo maintainers to commit the 20 untracked Snyk files or regenerate manifests cleanly.

---

### Metrics
- **Type Coverage:** 100% clean TypeScript build (`npm run build` completed with zero diagnostic errors).
- **Test Pass Rate:** 100% (460/460 executed tests passed across `test:protocol`, `test:cli`, `test:adapters`, and `test:advisor-controller`; 25 skips are platform/vendor-specific).
- **Linting:** Clean.

---

### Validation Commands and Results
- `npm run build`: Exit 0 (prebuild generators and `tsc` succeeded).
- `npm run test:protocol`: Exit 0 (53/53 tests passed).
- `npm run test:cli`: Exit 0 (64/64 passed, 1 skipped for Windows).
- `npm run test:adapters`: Exit 0 (109/109 passed).
- `npm run test:advisor-controller`: Exit 0 (234/234 passed, 24 skipped for Windows/vendor).

---

### Unresolved Questions
1. When will the 20 untracked Snyk files be committed to the upstream repository or the build manifests regenerated without them to ensure fresh clone reproducibility?
