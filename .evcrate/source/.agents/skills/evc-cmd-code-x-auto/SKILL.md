---
name: "evc-cmd-code-x-auto"
description: "[AUTO] Start coding & testing an existing plan (\\\"trust me bro\\\")"
---

# evc-cmd-code-x-auto

Command Path: $evc-cmd-code-x-auto

Description: [AUTO] Start coding & testing an existing plan (\"trust me bro\")

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
**MUST READ** `AGENTS.md` if present; otherwise read `~/.codex/AGENTS.md` (the published install; respect native overrides and custom CODEX_HOME) then **THINK HARDER** to start working on the following plan follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-plan>{{args}}</raw-plan>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
## Arguments
- $PLAN: first positional token from invocation arguments (specific or auto-detected plan; default: latest plan)
- $ALL_PHASES: second positional token from invocation arguments (`Yes` to finish all phases in one run or `No` to implement phase-by-phase; default: `Yes`)

---

## Role Responsibilities
- You are a senior software engineer who must study the provided implementation plan end-to-end before writing code.
- Validate the plan's assumptions, surface blockers, and confirm priorities with the user prior to execution.
- Drive the implementation from start to finish, reporting progress and adjusting the plan responsibly while honoring **YAGNI**, **KISS**, and **DRY** principles.

**IMPORTANT:** Remind these rules with subagents communication:
- Sacrifice grammar for the sake of concision when writing reports.
- In reports, list any unresolved questions at the end, if any.
- Ensure token efficiency while maintaining high quality.

---

## Step 0: Plan Detection & Phase Selection

**Plan resolution:**
- **If `$PLAN` is empty:** Find latest `plan.md` in `./plans` | `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-`
- **If `$PLAN` provided:** Use that plan and detect which phase to work on (auto-detect or use argument like "phase-2").

**Mandatory shared Plan progress and phase reconciliation:**
Before selecting or confirming any phase (including explicit requested phases and loop continuations):
1. Apply neutral plan progress and phase reconciliation per `.codex/workflows/plan-progress.md` to reconcile completed scope, verify execution prerequisites, and preserve protected historical paths.
2. An explicitly requested already-completed phase is a no-op: report completion, recommend the next incomplete phase, but do not auto-execute a different phase without user authorization.
3. Emit overview path (`<plan-dir>/progress.md` for protected historical plans, or `plan.md` for ordinary unprotected plans), reconciled actual scope, and any outstanding prerequisites/blockers. Auto-select next incomplete phase (prefer IN_PROGRESS or earliest Planned).
**Output:** `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for protected historical plans)

**Subagent Pattern (use throughout):**
```
Ask Codex to spawn a subagent with type="[type]", prompt="[task description]", description="[brief]")
```

---

## Workflow Sequence

**Rules:** Follow steps 1-5 in order. Each step requires output marker starting with "✓ Step N:". Mark each complete in `update_plan` before proceeding. Do not skip steps.

---

## Step 1: Analysis & Task Extraction
Use `evc-project-manager` agent to read plan file completely. Map dependencies between tasks. List ambiguities or blockers. Identify required skills/tools and activate from catalog. Parse phase file and extract actionable tasks.

**update_plan Initialization & Task Extraction:**
`evc-project-manager` agent must respond back with:
- Initialize `update_plan` with `Step 0: [Plan Name] - [Phase Name]` and all command steps (Step 1 through Step 5)
- Read phase file (e.g., phase-01-preparation.md)
- Look for tasks/steps/phases/sections/numbered/bulleted lists
- MUST convert to `update_plan` tasks:
  - Phase Implementation tasks → Step 2.X (Step 2.1, Step 2.2, etc.)
  - Phase Testing tasks → Step 3.X (Step 3.1, Step 3.2, etc.)
  - Phase Code Review tasks → Step 4.X (Step 4.1, Step 4.2, etc.)
- Ensure each task has UNIQUE name (increment X for each task)
- Add tasks to `update_plan` after their corresponding command step

**Output:** `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list or "none"]`

Mark Step 1 complete in `update_plan`, mark Step 2 in_progress.

---

## Step 2: Implementation

Implement selected plan phase step-by-step following extracted tasks (Step 2.1, Step 2.2, etc.). Mark tasks complete as done. For UI work, call `evc-ui-ux-designer` subagent: "Implement [feature] UI per ./docs/design-guidelines.md". Use `ai-multimodal` skill for image assets, imagemagick in `media-processing` skill for editing. Run type checking and compile to verify no syntax errors.

**Output:** `✓ Step 2: Implemented [N] files - [X/Y] tasks complete, compilation passed`

Mark Step 2 complete in `update_plan`, mark Step 3 in_progress.

---

## Step 3: Testing

Write tests covering happy path, edge cases, and error cases. Call `evc-tester` subagent: "Run test suite for plan phase [phase-name]". If ANY tests fail: STOP, call `evc-debugger` subagent: "Analyze failures: [details]", fix all issues, re-run `evc-tester`. Repeat until 100% pass.

**Testing standards:** Unit tests may use mocks for external dependencies (APIs, DB). Integration tests use test environment. E2E tests use real but isolated data. Forbidden: commenting out tests, changing assertions to pass, TODO/FIXME to defer fixes.

**Output:** `✓ Step 3: Tests [X/X passed] - All requirements met`

**Validation:** If X ≠ total, Step 3 INCOMPLETE - do not proceed.

Mark Step 3 complete in `update_plan`, mark Step 4 in_progress.

---

## Step 4: Code Review (Smart Auto-Handling)

Settle implementation/test writers, then call exactly one `evc-code-reviewer`
per cycle and wait for its complete terminal report: score, critical issues,
warnings, suggestions, actual validation and unresolved questions. Missing,
partial, interrupted or failed review leaves the gate incomplete.

**Smart auto-handling — maximum three terminal reviews:**
1. Log full findings. Increment the counter only on a complete terminal review.
2. With no critical issues: auto-approve at score >=9.5; otherwise approve with
   warnings/suggestions recorded, preserving this command's automatic behavior.
3. With critical issues before the cap: evaluate each finding with evidence,
   apply only accepted corrections within authorized scope, revalidate with
   `evc-tester`, and repeat review. No out-of-scope refactoring, suppressed tests,
   or assumption that passing self-tests defeats an evidence-backed concern.
4. With critical issues at the cap: present all findings with file/line and use
   `request_user_input` for Approve with noted issues / Abort. No further
   fix/test/review cycle or reset. Explicit user acknowledgement is required
   to continue with critical issues.
5. On a second consecutive matching terminal blocker without progress, use
   ordinary debugger/user escalation before another attempt.

**Validation:** No outstanding critical issue unless explicitly user-approved.

Mark Step 4 complete in update_plan only when its gate passes.

---

## Step 5: Finalize

**Prerequisite:** Step 4 approval and tests passed.
If last phase, ask whether to configure onboarding requirements.

1. **STATUS AND DOCS — BOTH REQUIRED, DISJOINT PARALLEL OWNERS:**
   - `evc-project-manager`: for ordinary unprotected plans, update only the
     executed and validated phase status with timestamp and authorized roadmap.
     For protected historical plans, return status/validation evidence only;
     never mutate captured plan/phase/roadmap or progress.
   - `evc-docs-manager`: update only exact authorized docs, with the parent
     protected-path set and actual changed-file list. Never touch sealed paths.
   - Wait for both terminal results; partial results leave finalization incomplete.
2. **ONBOARDING AND REPORT:** Identify API-key/env/config setup requirements and
   prepare a concise summary with next steps. Keep secrets out of reports and
   chat; guide local configuration rather than requesting secret values.
3. **SCOPED AUTO-COMMIT:** Only after steps 1–2 settle, required approval and
   actual validation pass, use `evc-git-manager` for the authorized deliverables.
   Never stage protected historical paths, alter their selected-index identities,
   or stage receipts/progress. Do not push without separate user authorization.
4. **COMPLETION:** Settle and validate all finalized work. Report actual changed
   paths, scope and checks. Parent alone applies
   `.codex/workflows/plan-progress.md`: ordinary plans use `plan.md`; protected
   plans use immutable ordinary approval/validation receipts and uncaptured
   `progress.md`, preserving sealed paths/index identities. Publication failure
   does not reopen successful implementation. Never mark unexecuted phases DONE.

**Validation:** Both status/docs results and applicable actual validation must
succeed; auto-commit is conditional, not proof of completion.

Mark Step 5 complete in `update_plan`.

**Important:**
If $ALL_PHASES is `Yes`, run neutral reconciliation per `.codex/workflows/plan-progress.md` before advancing to determine the next incomplete phase automatically. If all phases complete per reconciled receipts, finish workflow.
If $ALL_PHASES is `No`, wait for user confirmation before proceeding to the next phase:
- Use `request_user_input` tool to ask if user wants to proceed to the next phase: "**Phase workflow finished. Ready for next plan phase.**"
- On user confirmation, run neutral reconciliation per `.codex/workflows/plan-progress.md` before selecting the next phase.
## Summary report
Prepare substantive summary files during authorized finalization. For protected
historical plans, final output is read-only with links to the verified report and
uncaptured overview; never invoke archive/preview operations that mutate sealed
paths. For ordinary unprotected plans at the last phase, ask whether to preview
the report or archive the plan through `$evc-cmd-plan-x-archive`, retaining its
confirmation and destructive-action gates.

---
## Critical Enforcement Rules

**Step outputs must follow unified format:** `✓ Step [N]: [Brief status] - [Key metrics]`

**Examples:**
- Step 0: `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for protected historical plans)
- Step 1: `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list]`
- Step 2: `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- Step 3: `✓ Step 3: Tests [X/X passed] - All requirements met`
- Step 4: `✓ Step 4: Code reviewed - [0] critical issues`
- Step 5: `✓ Step 5: Finalize - Status updated - Git committed` (include `- Overview: [plan-dir]/progress.md` for protected historical plans)

**If any "✓ Step N:" output missing, that step is INCOMPLETE.**

**update_plan tracking required:** Initialize at Step 0, mark each step complete before next.

**Mandatory subagent calls:**
- Step 3: `evc-tester`
- Step 4: `evc-code-reviewer`
- Step 5: `evc-project-manager` AND `evc-docs-manager` AND `evc-git-manager`

**Blocking gates:**
- Step 3: Tests must be 100% passing
- Step 4: Critical issues must be 0 (or user approved on escalation)
- Step 5: Both status/docs terminal results and actual applicable validation must pass; parent owns neutral receipt/overview publication.


**REMEMBER:**
- Do not skip steps. Do not proceed if validation fails.
- One plan phase per command run. Command focuses on single plan phase only.
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` or similar tools as needed.
