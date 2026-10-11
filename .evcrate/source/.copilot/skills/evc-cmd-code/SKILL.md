---
name: "evc-cmd-code"
description: "Start coding & testing an existing plan"
argument-hint: "[plan]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-code`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

**MUST READ** `.github/copilot-instructions.md` if present; otherwise read `~/.copilot/copilot-instructions.md` (the published install) then **THINK HARDER** to start working on the following plan follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-plan>$ARGUMENTS</raw-plan>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.copilot/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
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
- **If invocation arguments is empty:** Find latest `plan.md` in `./plans` | `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-`
- **If invocation arguments provided:** Use that plan (or auto-detect plan and requested phase like "phase-2").

**Mandatory shared Plan progress and phase reconciliation:**
Before selecting or confirming any phase (including explicit requested phases):
1. Apply neutral plan progress and phase reconciliation per `.copilot/evcrate/workflows/plan-progress.md` to reconcile completed scope, verify execution prerequisites, and preserve protected historical paths.
2. An explicitly requested already-completed phase is a no-op: report completion, recommend the next incomplete phase, but do not auto-execute a different phase without user authorization.
3. Emit overview path (`<plan-dir>/progress.md` for protected historical plans, or `plan.md` for ordinary unprotected plans), reconciled actual scope, and any outstanding prerequisites/blockers. Auto-select next incomplete phase (prefer IN_PROGRESS or earliest Planned).
**Output:** `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for protected historical plans)
**Subagent Pattern (use throughout):**
```
Task(subagent_type="[type]", prompt="[task description]", description="[brief]")
```

**Blocking delegation rule:** Every Task/subagent call is synchronous. The parent must wait for the terminal response, verify the requested report/artifact and validation status, and only then continue. For parallel calls, explicitly say **wait for all agents**, collect one terminal result per call, and stop on any interrupted, timed-out, missing, or partial result.

**Wait-loop protocol:** After each Task call, record the returned agent identity and use the native wait operation for that same agent. A response such as **"No agents completed yet"** is expected polling feedback, not a timeout: immediately wait again. Do not use shell `sleep`, start another task, ask for approval, synthesize a score, restart, or interrupt the agent while it is active. Polling intervals and the three-review-cycle limit do not end the gate; the cycle counter advances only after every required reviewer result is terminal, and a user fix decision is required before beginning another cycle. If the parent runtime terminates first, report the review gate incomplete with the agent identity and no fabricated result.

---

## Workflow Sequence

**Rules:** Follow steps 1-6 in order. Each step requires output marker starting with "✓ Step N:". Mark each complete in TodoWrite before proceeding. Do not skip steps.

---

## Step 1: Analysis & Task Extraction

Read plan file completely. Map dependencies between tasks. List ambiguities or blockers. Identify required skills/tools and activate from catalog. Parse phase file and extract actionable tasks.

**TodoWrite Initialization & Task Extraction:**
- Initialize TodoWrite with `Step 0: [Plan Name] - [Phase Name]` and all command steps (Step 1 through Step 6)
- Read phase file (e.g., phase-01-preparation.md)
- Look for tasks/steps/phases/sections/numbered/bulleted lists
- MUST convert to TodoWrite tasks:
  - Phase Implementation tasks → Step 2.X (Step 2.1, Step 2.2, etc.)
  - Phase Testing tasks → Step 3.X (Step 3.1, Step 3.2, etc.)
  - Phase Code Review tasks → Step 4.X (Step 4.1, Step 4.2, etc.)
- Ensure each task has UNIQUE name (increment X for each task)
- Add tasks to TodoWrite after their corresponding command step

**Output:** `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list or "none"]`

Mark Step 1 complete in TodoWrite, mark Step 2 in_progress.

---

## Step 2: Implementation

Implement selected plan phase step-by-step following extracted tasks (Step 2.1, Step 2.2, etc.). Mark tasks complete as done. For UI work, call `evc-ui-ux-designer` subagent: "Implement [feature] UI per ./docs/design-guidelines.md". Use `evc-ai-multimodal` skill for image assets, `imagemagick` for editing. Run type checking and compile to verify no syntax errors.

**Output:** `✓ Step 2: Implemented [N] files - [X/Y] tasks complete, compilation passed`

Mark Step 2 complete in TodoWrite, mark Step 3 in_progress.

---

## Step 3: Testing

Write tests covering happy path, edge cases, and error cases. Call `evc-tester` subagent: "Run test suite for plan phase [phase-name]". If ANY tests fail: STOP, call `evc-debugger` subagent: "Analyze failures: [details]", fix all issues, re-run `evc-tester`. Repeat until 100% pass.

**Testing standards:** Unit tests may use mocks for external dependencies (APIs, DB). Integration tests use test environment. E2E tests use real but isolated data. Forbidden: commenting out tests, changing assertions to pass, TODO/FIXME to defer fixes.

**Output:** `✓ Step 3: Tests [X/X passed] - All requirements met`

**Validation:** If X ≠ total, Step 3 INCOMPLETE - do not proceed.

Mark Step 3 complete in TodoWrite, mark Step 4 in_progress.

---

## Step 4: Code Review & Approval — BLOCKING GATE

Settle all implementation/test writers before review. Call exactly one
`evc-code-reviewer` per cycle and wait for its terminal report: score (X/10),
critical issues, warnings, suggestions, reviewed files, actual validation and
unresolved questions. Missing, interrupted or partial output fails the gate.

**Interactive review/fix cycle — maximum three terminal reviews:**
1. Present the full reviewer findings and implementation/testing summary.
2. Use `user input` to request approval or authorized fixes:
   - Critical issues: Fix critical / Fix all / Approve with noted issues / Abort.
   - Otherwise: Approve / Fix warnings or suggestions / Abort.
3. If fixes are requested before the cap, apply only authorized corrections,
   validate with `evc-tester`, and obtain the next terminal review. Evidence-backed
   concerns are not disproved merely by passing self-tests.
4. Increment the cycle count only after a complete terminal review. At three,
   stop and request Approve with noted issues / Abort; no further fix/test/review
   cycle or counter reset. On a second matching terminal blocker without progress,
   use ordinary debugger/user escalation before another attempt.
5. Continue only on explicit user approval. Never infer approval or claim a
   missing reviewer score. Risky/destructive actions keep their own approval gate.

**Critical issues:** Security, performance, architecture and principle violations.

Mark Step 4 complete in TodoWrite only when its gate passes.

---

## Step 5: Finalize

**Prerequisite:** Explicit user approval in Step 4 and tests passed.

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
   `.copilot/evcrate/workflows/plan-progress.md`: ordinary plans use `plan.md`; protected
   plans use immutable ordinary approval/validation receipts and uncaptured
   `progress.md`, preserving sealed paths/index identities. Publication failure
   does not reopen successful implementation. Never mark unexecuted phases DONE.

**Validation:** Both status/docs results and applicable actual validation must
succeed; auto-commit is conditional, not proof of completion.

Mark Step 5 complete in TodoWrite.

**Phase workflow finished. Ready for next plan phase.**

---

## Critical Enforcement Rules

**Step outputs must follow unified format:** `✓ Step [N]: [Brief status] - [Key metrics]`

**Examples:**
- Step 0: `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for protected historical plans)
- Step 1: `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list]`
- Step 2: `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- Step 3: `✓ Step 3: Tests [X/X passed] - All requirements met`
- Step 4: `✓ Step 4: Code reviewed - [score]/10 - User approved`
- Step 5: `✓ Step 5: Finalize - Status updated - Git committed` (include `- Overview: [plan-dir]/progress.md` for protected historical plans)

**If any "✓ Step N:" output missing, that step is INCOMPLETE.**

**TodoWrite tracking required:** Initialize at Step 0, mark each step complete before next.

**Mandatory subagent calls:**
- Step 3: `evc-tester`
- Step 4: `evc-code-reviewer`
- Step 5: `evc-project-manager` AND `evc-docs-manager` (when user approves)

**Blocking gates:**
- Step 3: Tests must be 100% passing
- Step 4: User must explicitly approve (via user input)
- Step 5: Both status/docs terminal results and actual applicable validation must pass; parent owns neutral receipt/overview publication.


**REMEMBER:**
- Do not skip steps. Do not proceed if validation fails. Do not assume approval without user response.
- One plan phase per command run. Command focuses on single plan phase only.
- You can always generate images with `evc-ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `evc-ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` or similar tools as needed.
