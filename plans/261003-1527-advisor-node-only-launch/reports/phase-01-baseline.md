# Phase 01 Baseline and Launch Contract Report

**Date:** 2026-10-04  
**Status:** Approved baseline and contract freeze  
**Phase:** Phase 01 — Baseline and launch contract  
**Plan:** `plans/261003-1527-advisor-node-only-launch/plan.md`  
**Overview:** `plans/261003-1527-advisor-node-only-launch/progress.md`  

---

## 1. Source Provenance & Worktree Identity

- **Branch:** `feat/advisor-node-only-launch`
- **Head Commit:** `9d4b799eada6c07e758f90d8d2b1cb8f7d15c269`
- **Repository Root:** `/home/loidinh/WS/worktrees/evcrate-advisor-node-only-launch`
- **Upstream Sync:** Matches `origin/feat/advisor-node-only-launch` and `main` (`9d4b799e`).
- **Dirty Provenance Reconciliation:**
  - The worktree is clean with respect to tracked files.
  - Historical dirty baseline noted in planning (48 modified / 32 untracked) reflected uncommitted VS Code Local target integration work in earlier worktrees. That work was completely committed in commits `2590d976` and `9d4b799e` (including VS Code target manifest, projections, adapters, and release qualification).
  - Main repository untracked files: 20 untracked files (`snyk-expert` agent and `dependency-upgrade-review` / `snyk-fix` skills) were present in the main repository when `build-manifest*.json` and 19-agent adapter tests were generated. These 20 files are synced into `.evcrate/source/` to maintain exact tree-hash parity and allow all test suites to pass 100% without mutating or staging them.
  - The approved source candidate for Phase 01 incorporates commit `9d4b799eada6c07e758f90d8d2b1cb8f7d15c269`, the 20 synced source assets, and the plan directory.

---

## 2. Target Manifest & Package Engine Verification

- **Target Manifest:** `.evcrate/targets/manifest.json` (schema version 2)
  - Exactly **eight** registered targets:
    1. `antigravity`: `antigravity/manifest.json`
    2. `claude`: `claude/manifest.json`
    3. `codex`: `codex/manifest.json`
    4. `copilot`: `copilot/manifest.json`
    5. `gemini`: `gemini/manifest.json`
    6. `omp`: `omp/manifest.json`
    7. `pi`: `pi/manifest.json`
    8. `vscode`: `vscode/manifest.json`
  - Historical references to "seven targets" are superseded by the eight-target manifest.
- **Package Metadata (`package.json`):**
  - Package Engine: `"node": ">=22.19.0"`
  - Package Binaries:
    - `"evcrate"`: `"dist/cli/evcrate.js"` (TypeScript control-plane CLI)
    - `"evcrate-advisor"`: `".evcrate/source/.evcrate/bin/evcrate-advisor"` (CommonJS controller)
  - Package Shebang & Execute Bits: Kept strictly as packaging and distribution metadata.

---

## 3. Exact Maintained Caller Migration Inventory

### 3.1 Canonical Workflows & Skills (Phase 02 Migration Scope)
1. `.evcrate/source/.claude/workflows/advisor-mentoring.md`:
   - Platform dispatch rules (lines 80–108) and runnable bash examples (lines 371, 400, 476, 547, 574, 601, 627, 657, 691, 722) currently specify direct POSIX execution (`~/.evcrate/bin/evcrate-advisor`).
   - Must migrate to explicit Node invocation: `node <absolute HOME-owned evcrate-advisor> [args]`.
2. `.evcrate/source/.claude/skills/advisor-strategy/SKILL.md`:
   - Line 31 prescribes direct POSIX execution. Must migrate to explicit Node invocation across all platforms while preserving tool-less counsel boundary.
3. `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md`:
   - Line 25 prescribes direct POSIX execution. Must migrate to explicit Node invocation.
   - Note: Feeds `scripts/generate-runtime-brief.mjs`, which updates generated runtime brief and build identity in Phase 02.

### 3.2 Runnable Consult Scripts (Phase 02 Migration Scope)
1. `scripts/consult-advisor-phase-e02.mjs`:
   - Four direct execution calls: `init` (line 76), `checkpoint` (line 194), `inference` (line 207), `state-get` (line 222).
   - Must migrate to `spawnSync(process.execPath, [bin, ...args])` under explicit Node parent.
2. `scripts/consult-advisor-phase-e03.mjs`:
   - Four direct execution calls: `init` (line 76), `checkpoint` (line 207), `inference` (line 220), `state-get` (line 235).
   - Must migrate to `spawnSync(process.execPath, [bin, ...args])` under explicit Node parent.

### 3.3 Test Suite Callers (Phase 02 Migration Scope)
1. `tests/advisor-controller/controller.test.cjs`:
   - `spawnController` and `run` branch to direct controller on non-Windows (lines 76–86). Must switch to Node + script argv on all platforms.
2. `tests/advisor-controller/mentor-brief.test.cjs`:
   - Real-entrypoint launches branch on platform (lines 752–783). Must use explicit Node + script argv.
3. `tests/advisor-controller/retry-orchestration.test.cjs`:
   - Smoke launch branches at lines 920–922. Must use explicit Node + script argv.
4. `tests/advisor-controller/smoke-30s.cjs`:
   - Direct `spawn(CONTROLLER, [])` at line 49. Must migrate to explicit Node + script argv.

### 3.4 Verify-Only Existing Node Callers
- `src/cli/health.ts`: Already launches `runtime.execPath ?? process.execPath` with script argv, `cwd: context.packageRoot`, and JSON stdin. Retain as verify-only.
- `tests/cli/health.test.mjs`, `tests/advisor-controller/history-cli.test.cjs`, `tests/advisor-controller/state-cli.test.cjs`, `tests/advisor-metrics/history-metrics.test.mjs`, `tests/adapters/phase08-mentoring-integration.test.mjs`, `tests/advisor-controller/verification-lifecycle.test.cjs`: Already launch via `process.execPath`. Retain as verify-only.

### 3.5 Checkpoint Consumers & Agents
- 16 canonical slash-command checkpoint consumers under `.evcrate/source/.claude/commands/` (`bootstrap.md`, `code.md`, `cook.md`, `fix.md`, and their subcommands) dispatch checkpoints via canonical workflow.
- Counsel agent (`.evcrate/source/.claude/agents/advisor.md`) remains strictly tool-less (`tools: none`).

---

## 4. Maintained Documentation & Syntax Distinctions

- `README.md` was audited: Lines 243–246 and 325 document advisor mentoring policy, `--advice` flag semantics, and VS Code Local direct HOME advisor path. No direct shell execution examples (e.g., `~/.evcrate/bin/evcrate-advisor <<'JSON'`) exist in `README.md`.
- Maintenance rule: Policy descriptions must not be confused with direct launcher syntax. Maintained executable examples in workflows and skills must all specify explicit Node invocation.

---

## 5. Architectural Contracts & Decisions

- **Invocation Tuple:**
  ```text
  executable = supported Node executable (engine >=22.19.0)
  argv       = [absolute HOME-owned evcrate-advisor path, ...operation arguments]
  stdin      = exact request JSON encoded as UTF-8, then EOF
  cwd        = canonical caller project directory (packageRoot for health diagnostics)
  ```
- **Error & Failure Semantics:** Launch failure is terminal transport failure, never an implicit fallback to direct execution or alternative interpreter.
- **Migration status:** Phase 01 freezes the no-direct-execution contract; baseline direct-exec call sites in Sections 3.1–3.3 are pending Phase 02 migration. Their presence is not evidence the migration is complete.
- **Home Resolution Authority:**
  - Explicit `HOME` must be non-empty, absolute, and safe. Empty or invalid explicit `HOME` fails closed. Never use `HOME || os.homedir()`.
  - Windows native-profile fallback (`USERPROFILE` / `UserProfile`) applies only when `HOME` is absent.
- **Platform Boundaries:**
  - **Linux x64:** Primary implementation platform; qualified with real local smoke verification, focused regressions, and full package/projection gates.
  - **Native Windows x64:** Dedicated same-candidate transfer and native tests on PowerShell 5.1/7 with supported Node versions; no WSL substitution.
  - **macOS (Darwin):** Actual runtime behavior for durable state, baseline, history, and process identity remains untested/unqualified. Controlled build-only packaging of native helper binaries (`arm64` and `x64`) is approved. No macOS runtime execution, advisor test, or qualification was performed in this baseline; execution and testing remain forbidden.

---

## 6. Generated Output Ownership & Integrity

- **Generators:**
  - `scripts/generate-runtime-brief.mjs` → `.evcrate/source/.evcrate/bin/lib/advisor/runtime-brief.generated.cjs`
  - `scripts/generate-controller-inventory.mjs` → `src/manifests/controller-inventory.generated.ts`
  - `scripts/generate-resource-registry.mjs` → `.evcrate/registry.json`
  - `scripts/build-manifests.mjs` → `.evcrate/build-manifest*.json`
- **Rule:** Hand editing of generated outputs is strictly forbidden. Any changes to brief content or inventory must occur in source inputs followed by script regeneration.

---

## 7. Next Steps & Handoff to Phase 02

- Phase 01 baseline, target manifest, caller inventory, and architecture contracts are frozen.
- Phase 02 scope:
  - Migrate canonical workflow `.evcrate/source/.claude/workflows/advisor-mentoring.md` and skills to explicit Node invocation.
  - Migrate `scripts/consult-advisor-phase-e02.mjs` and `scripts/consult-advisor-phase-e03.mjs` (8 direct calls).
  - Migrate direct-test launchers in `tests/advisor-controller/` (4 test files).
  - Regenerate runtime brief and build identity via `scripts/generate-runtime-brief.mjs`.
  - Re-verify 8-target projections via build scripts.
