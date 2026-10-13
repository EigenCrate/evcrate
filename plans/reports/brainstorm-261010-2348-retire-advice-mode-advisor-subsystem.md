# Brainstorm Summary: Retirement of "--advice" Mode & Advisor Subsystem

- Date: 2026-10-10
- Status: Agreed Decision Gate
- Artifact: `plans/reports/brainstorm-261010-2348-retire-advice-mode-advisor-subsystem.md`
- Decision: Option 3 (Complete Advisor Subsystem Retirement) with Option A (Pure Inline Main-Session execution for `/advise`)

---

## 1. Problem Statement & Historical Context

The user requested:
1. Scan and identify the checkpoint (commit hash) that introduced `--advice` mode into the prompt system of EVCrate.
2. Completely remove `--advice` mode in prompts and all related files across the codebase.
3. Keep the `/advise` command (`/evc-cmd-advise`) operational, but retire the `evc-advisor` agent/actor.

### Checkpoints Discovered in Git History

1. **Origin of `--advice` in Prompts**:
   - **Commit**: `dde7be7e15b7c390b85d73f3490c0fc6cf8a986f` (`41632914efafada83429a4ccc1ea0f41dfd55e33` pre-rebase)
   - **Date**: Sun Aug 23 22:37:09 2026 +0700
   - **Message**: `feat(advisor): replace advisor mode with advice checkpoints`
   - **Details**: Replaced experimental `[@advisor]` argument token (from commit `3cdeca56`) with `--advice`. Added `argument-hint: [plan] [--advice]` and `## Advice Mode` sections across 16 canonical Claude commands and workflows (`code.md`, `cook.md`, `bootstrap.md`, `fix.md`, `advisor-mentoring.md`).

2. **Deterministic Activation Helper Cutover**:
   - **Commit**: `deb9344b6d1a5f156bc51bff454d9673913ae561` (PR #19)
   - **Date**: Wed Oct 7 07:56:45 2026 +0700
   - **Message**: `feat(advisor): implement deterministic advice activation helper and workflow cutover (#19)`
   - **Details**: Created `.evcrate/bin/evcrate-advice-mode`, quote-span parser `lib/advisor/activation.cjs`, `advice-activation.md`, OMP native activation adapter `src/adapters/omp/activation.ts`, and spread `[--advice]` across all 21 core commands.

3. **Unified Naming Cutover**:
   - **Commit**: `36c68bb4226d7bb85c69d80d75b31f795a94489a` (PR #24, Oct 8 2026)
   - Renamed commands to `evc-cmd-*` and agents to `evc-*`.

---

## 2. Evaluated Approaches

### Option 1: Full Purge of `--advice` Mode & Helper (Controller Preserved)
- Strip `--advice` from all 21 command prompts and workflows.
- Delete `evcrate-advice-mode` binary, quote parser, and OMP activation adapter.
- Retain `evcrate-advisor` controller and `evc-advisor` agent solely for `/evc-cmd-advise --agent` relay and CLI policy.
- *Pros*: Targeted; preserves advisor CLI and relay mode.
- *Cons*: Keeps controller overhead and extra subagent when advice mode is gone from prompt system.

### Option 2: Surface-Only Removal (Prompt Stubs)
- Strip `[--advice]` hints from prompt markdown only; leave binary and adapters dormant.
- *Rejected*: Violates KISS/YAGNI; leaves dead code and dormant execution overhead.

### Option 3: Complete Advisor Subsystem Retirement (Selected)
- Demolish the entire advisor checkpoint subsystem:
  - Remove all `--advice` command hints, prompt sections, and review gates.
  - Delete `evcrate-advice-mode` and `evcrate-advisor` binaries, plus entire `lib/advisor/` controller tree.
  - Delete `evc-advisor` agent across canonical source and all 7 projection targets.
  - Delete `advice-activation.md` and `advisor-mentoring.md`.
  - Retain `/evc-cmd-advise` command under **Option A (Pure Inline Main-Session execution)**.

---

## 3. Actor Architecture for `/advise` Command

With the `evc-advisor` agent retired, `/advise` operates under:

### Chosen Actor: The Active Main Session (Option A - Pure Inline)
- **Actor**: The primary active AI assistant turn (no subagent delegation).
- **Execution Flow**:
  1. Main session receives `/evc-cmd-advise <prompt-or-url>`.
  2. Main session asks discovery questions directly (max 8 questions, 1 per turn).
  3. Main session formulates and presents a concise reframed problem statement for explicit user confirmation (`confirm` or `correct`, max 2 cycles).
  4. Upon confirmation, main session synthesizes the standard 8-section Markdown report (`## Reframed problem`, `## Recommendation`, `## Alternatives/tradeoffs`, `## Risks`, `## Assumptions/evidence gaps`, `## Success checks`, `## Next actions`, `## Unresolved questions`).
  5. Report written to `plans/reports/advise-YYYYMMDD-HHMM-<uuid>.md` (or `<plan>/reports/`).
- **Cleanup**:
  - Retire `--agent` relay token.
  - Delete relay state helper `.claude/scripts/advise-state.cjs` and `/tmp/evcrate/advice/` state management.
- **Rationale**:
  - Eliminates JSON serialization, temporary file system state, and subagent invocation latency.
  - Simplest, most reliable, adheres to KISS and YAGNI.
  - Future path: Can easily add delegation to `evc-brainstormer` later if offloading is required.

---

## 4. Scope Boundary & Touchpoints

### In Scope
1. **Canonical Commands (`.evcrate/source/.claude/commands/`)**:
   - Strip `[--advice]` argument hint and `## Advice Mode` sections from 21 commands (`bootstrap*`, `code*`, `cook*`, `fix*`).
   - Refactor `evc-cmd-advise.md`: Remove `--agent` relay mode, keep pure inline interview, remove `--advice` disclaimers.
   - Update `commands_data.yaml` and `ev-help.py`.
2. **Canonical Agents & Workflows (`.evcrate/source/.claude/`)**:
   - Delete `agents/evc-advisor.md`.
   - Delete `workflows/advice-activation.md` and `workflows/advisor-mentoring.md`.
   - Refactor `workflows/advisory-interview.md`: Keep interview logic, strip relay envelope and state storage specifications.
   - Clean up `plan-progress.md`, `primary-workflow.md`, `development-rules.md`.
3. **Binaries & Controller Libs (`.evcrate/source/.evcrate/bin/`)**:
   - Delete `evcrate-advice-mode` and `evcrate-advisor`.
   - Delete entire directory `lib/advisor/`.
   - Remove entries from `scripts/release/pack-inventory.cjs`, `scripts/generate-controller-inventory.mjs`, `install.sh`, `install.ps1`.
4. **TypeScript Control Plane & Adapters (`src/`)**:
   - Delete `src/adapters/omp/activation.ts`.
   - Remove activation preflight from `src/adapters/omp/commands.ts`.
   - Clean up adapter prompt transforms: `src/adapters/advisory.ts`, `src/adapters/antigravity.ts`, `src/adapters/codex/transforms.ts`.
   - Remove advisor controller validation from `src/manifests/controller.ts`, `src/manifests/controller-inventory.generated.ts`.
   - Update `src/distribution/local-build-staging.ts`.
   - Clean up CLI router (`src/cli/`) if `evcrate advisor` subcommand is wired there.
5. **Distribution & Target Projection Trees**:
   - Run `npm run distribute:build` and `npm run generate:all` to regenerate all 7 projection targets (`antigravity`, `claude`, `codex`, `copilot`, `omp`, `pi`, `vscode`), build manifests, and registry.
6. **Tests to Purge**:
   - Delete `tests/advisor-controller/` (activation, cli, omp-adapter tests).
   - Delete `tests/advisor-settings/` and `tests/advisor-metrics/` (if retiring full CLI advisor).
   - Delete `tests/adapters/omp-native-activation.test.mjs`.
   - Delete `tests/distribution/advice-helper-launchability.test.mjs`.
   - Delete `tests/integration/advice-activation-installed*.test.mjs`.
7. **Documentation**:
   - Remove `--advice` and Advisor checkpoint sections from `README.md`.
   - Update `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/project-overview-pdr.md`.

### Out of Scope
- Modifying core implementation workflows of `evc-cmd-code`, `evc-cmd-cook`, `evc-cmd-bootstrap`, or `evc-cmd-fix` beyond removing advisor checkpoint gates.
- Touching unrelated custom agents (`evc-planner`, `evc-brainstormer`, `evc-debugger`, etc.).
- Modifying unstaged changes on working branch `fix/vscode-subagent-tool-references`.

---

## 5. Implementation Considerations & Risks

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Manifest validation failure** | High | Update `controller-inventory.generated.ts` and manifest generators before running `distribute:check`. |
| **Orphaned test failures** | High | Audit `package.json` test scripts (`npm test`); remove test scripts pointing to deleted `tests/advisor-*` suites. |
| **Target projection drift** | Medium | Author changes in `.evcrate/source/.claude/` exclusively; use `npm run distribute:build` and `npm run generate:all` to synchronize all 7 targets. |
| **Accidental disruption of `/advise`** | Medium | Verify `/evc-cmd-advise` inline interview runs seamlessly in `.claude` and all projected targets without relay dependency. |

---

## 6. Success Metrics & Validation Criteria

1. **Grep Validation**: Zero matches for `--advice` across all `.evcrate/source/.claude/commands/`, `workflows/`, and `src/adapters/` (excluding historical changelogs).
2. **Controller Packaging**: `npm run generate:all` passes without referencing `evcrate-advisor` or `evcrate-advice-mode`.
3. **Distribution Integrity**: `npm run distribute:build && npm run distribute:check` passes across all 7 targets with zero orphaned projection artifacts.
4. **Target Parity**: All 7 target command directories reflect clean `argument-hint` without `[--advice]`.
5. **Command `/advise`**: `/evc-cmd-advise` executes cleanly in inline mode, producing compliant 8-section report in `plans/reports/`.
6. **Test Suite**: `npm test` passes cleanly with deleted activation/advisor test suites removed from execution scripts.

---

## 7. Next Steps

1. Launch implementation planning (`/evc-cmd-plan-x-hard` or `/evc-cmd-plan-x-fast`).
2. Phase 1: Canonical source modifications (`.claude/commands/`, `.claude/agents/`, `.claude/workflows/`).
3. Phase 2: Controller binaries, libs, and installer script purges.
4. Phase 3: TypeScript adapters, manifests, and CLI cleanups.
5. Phase 4: Target projection rebuild (`distribute:build`, `generate:all`).
6. Phase 5: Test suite adjustments and full verification pass (`distribute:check`, `npm test`).

---

## 8. Unresolved Questions

None. Decision settled on Option 3 with Option A for `/advise`.
