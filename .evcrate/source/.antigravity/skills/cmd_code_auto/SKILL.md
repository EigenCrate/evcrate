---
name: cmd_code_auto
description: '[AUTO] Start coding & testing an existing plan ("trust me bro")'
---
# cmd_code_auto

Command Path: /code/auto

Description: [AUTO] Start coding & testing an existing plan ("trust me bro")

---
description: "[AUTO] Start coding & testing an existing plan (\"trust me bro\")"
argument-hint: "[plan] [all-phases-yes-or-no] [--advice] (default: yes)"
---
**MUST READ** `CLAUDE.md` then **THINK HARDER** to start working on the following plan follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install); this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before assigning positional arguments, read
`.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) and derive `WORK_ARGUMENTS` plus
explicit/default advice mode. Apply the shared default stuck-escalation
contract in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) unconditionally across
all modes (reaching a second matching blocker activates the named checkpoint /
advice lifecycle). The advice lifecycle is active when explicit `--advice`
is present, an applicable active run exists, or a named checkpoint is activated.
When the advice lifecycle is active, apply the canonical `## Caller lifecycle binding`
in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install):
- **Durable state ownership**: The parent command is the sole owner of the task-state lifecycle. Child subagents (`project-manager`, `ui-ux-designer`, `tester`, `debugger`, `code-reviewer`, `docs-manager`, `git-manager`) report terminal artifacts, evidence, and actual changed paths; they never operate controller state or stage/commit behind the parent.
- **Run identity & handoff**: If entering with an existing active run (from prior direction/decision/stuck run or router handoff), retain `task_run_id`, phase, root, current state revision, and prior counsel/disposition/outcome. Resume an already-active action without duplicating it: complete its authorized bounded work, execute actual declared validation, and record a truthful matching outcome advancing the baseline before the next review reservation. Before new authorized bounded writes, require `accept` with a registered correction action. For disputed counsel (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action, collect read-only evidence or an explicit resolution while preserving the captured baseline unchanged, and obtain fresh same-run counsel before corrective mutation or a resolved correction outcome.
- **Fresh first review**: If no prior active advice run exists, do NOT initialize state at command start just to track implementation. Implementation (Step 2), actual validation (Step 3), reviewer output (Step 4), and planned finalization artifacts settle first (writer barrier). Build `baseline_paths` as the union of authorized writable paths and selected read-only `evidence.files`/artifacts (`authorized_paths` contains only writable paths). Call `state init` immediately before reservation in Step 4, with no intervening file edits or git status/index changes.
- **Baseline stability**: Freeze all baseline paths (not only current citations) during reservation, inference, disposition, and from final outcome to completion.
- **Advice lifecycle & plan protection**: A prior completed advice run alone protects historical paths (sealed `plan.md`, historical reports, roadmap, captured git index/status identity) from mutation, but does NOT force fresh advice for a new default phase. Existing sealed paths stay strictly immutable even if the next invocation omits `--advice`.
- **Derived overview & immutable receipts**: `<plan-dir>/progress.md` is the derived current overview and is NEVER captured or cited as evidence or authorized substantive paths. Mutable progress is never captured; no retroactively removing captured paths. If already captured in the baseline, callers cannot overwrite progress either (surface blocker). New plans link before capture; old sealed plans remain untouched. Immutable phase completion receipts live outside the baseline.
- **Default operational branch (no active advice lifecycle)**: An untouched ordinary plan without advice history keeps normal `plan.md` tracking without controller state operations. A protected historical plan with a new default phase uses normal validation and approval without durable controller operations, updating `<plan-dir>/progress.md` and an uncaptured default completion receipt outside baseline.
## Arguments
- $PLAN: first positional token from `WORK_ARGUMENTS` (specific or auto-detected plan; default: latest plan)
- $ALL_PHASES: second positional token from `WORK_ARGUMENTS` (`Yes` to finish all phases in one run or `No` to implement phase-by-phase; default: `Yes`)

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
1. Apply `### Plan progress and phase reconciliation` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) to reconcile completed scope, verify execution prerequisites, and preserve any active advice run/action context.
2. An explicitly requested already-completed phase is a no-op: report completion, recommend the next incomplete phase, but do not auto-execute a different phase without user authorization.
3. Emit overview path (`<plan-dir>/progress.md` for advice/protected plans, or `plan.md` for ordinary default plans), reconciled actual scope, and any outstanding prerequisites/blockers. Auto-select next incomplete phase (prefer IN_PROGRESS or earliest Planned).

**Output:** `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for advice/protected plans)

**Subagent Pattern (use throughout):**
```
Task(subagent_type="[type]", prompt="[task description]", description="[brief]")
```

---

## Workflow Sequence

**Rules:** Follow steps 1-5 in order. Each step requires output marker starting with "✓ Step N:". Mark each complete in `TodoWrite` before proceeding. Do not skip steps.

---

## Step 1: Analysis & Task Extraction
Use `project-manager` agent to read plan file completely. Map dependencies between tasks. List ambiguities or blockers. Identify required skills/tools and activate from catalog. Parse phase file and extract actionable tasks.

**TodoWrite Initialization & Task Extraction:**
`project-manager` agent must respond back with:
- Initialize `TodoWrite` with `Step 0: [Plan Name] - [Phase Name]` and all command steps (Step 1 through Step 5)
- Read phase file (e.g., phase-01-preparation.md)
- Look for tasks/steps/phases/sections/numbered/bulleted lists
- MUST convert to `TodoWrite` tasks:
  - Phase Implementation tasks → Step 2.X (Step 2.1, Step 2.2, etc.)
  - Phase Testing tasks → Step 3.X (Step 3.1, Step 3.2, etc.)
  - Phase Code Review tasks → Step 4.X (Step 4.1, Step 4.2, etc.)
- Ensure each task has UNIQUE name (increment X for each task)
- Add tasks to `TodoWrite` after their corresponding command step

**Output:** `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list or "none"]`

Mark Step 1 complete in `TodoWrite`, mark Step 2 in_progress.

---

## Step 2: Implementation

Implement selected plan phase step-by-step following extracted tasks (Step 2.1, Step 2.2, etc.). Mark tasks complete as done. For UI work, call `ui-ux-designer` subagent: "Implement [feature] UI per ./docs/design-guidelines.md". Use `ai-multimodal` skill for image assets, imagemagick in `media-processing` skill for editing. Run type checking and compile to verify no syntax errors.

**Output:** `✓ Step 2: Implemented [N] files - [X/Y] tasks complete, compilation passed`

Mark Step 2 complete in `TodoWrite`, mark Step 3 in_progress.

---

## Step 3: Testing

Write tests covering happy path, edge cases, and error cases. Call `tester` subagent: "Run test suite for plan phase [phase-name]". If ANY tests fail: STOP, call `debugger` subagent: "Analyze failures: [details]", fix all issues, re-run `tester`. Repeat until 100% pass.

**Testing standards:** Unit tests may use mocks for external dependencies (APIs, DB). Integration tests use test environment. E2E tests use real but isolated data. Forbidden: commenting out tests, changing assertions to pass, TODO/FIXME to defer fixes.

**Output:** `✓ Step 3: Tests [X/X passed] - All requirements met`

**Validation:** If X ≠ total, Step 3 INCOMPLETE - do not proceed.

Mark Step 3 complete in `TodoWrite`, mark Step 4 in_progress.

---

## Step 4: Code Review (Smart Auto-Handling)

Call `code-reviewer` subagent: "Review code changes in **Step 2** of plan phase [phase-name]. Check security, performance, architecture, YAGNI/KISS/DRY. Return score (X/10), critical issues list, warnings list, suggestions list."

**Advice gate & lifecycle placement:** When advice lifecycle is active (explicit `--advice` or applicable active/named-checkpoint run):
- **Cycle 1 reservation**: After reviewer terminal output arrives and before logging, fixing, auto-approving, or escalating:
  - If a fresh review run: initialize task state immediately before reservation (`baseline_paths` = authorized writable paths UNION selected read-only `evidence.files`/artifacts, with read-only files omitted from `authorized_paths`).
  - If an active run has a registered action, finish its bounded work, actual validation, and matching truthful outcome before reservation without duplicating the action. Disputed counsel without an active action uses read-only evidence/resolution and fresh same-run consultation before writes or a resolved correction outcome; do not invent an outcome to reserve that consultation.
  - Enter the canonical checkpoint dispatcher exactly once at `review:step-4` for this review cycle. Supply bounded evidence, declared validation commands/output, relevant prior counsel, and owner disposition per `## Caller lifecycle binding`.
  - Freeze all baseline paths during reservation, inference, and disposition.
  - A dispatcher failure or non-`ADVICE_READY` result fails Step 4. Include advisor must-fix guidance in the findings.

**Auto-Handling Logic (max 3 cycles):**

**Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.**

```
review_cycles = 0
LOOP:
  1. IF review_cycles >= 3:
     → ESCALATE TO USER; do not start another review or advisor call
     → DISPLAY all findings and ask "Approve with noted issues" / "Abort workflow"
     → STOP
  2. Run code-reviewer → wait for its terminal result; get score, critical_count, warnings, suggestions
  3. IF the reviewer result is missing, partial, interrupted, cancelled,
     timed-out, or failed: STOP the gate; do not increment review_cycles.
  4. IF advice lifecycle is active: enter the canonical dispatcher → wait for its terminal result
  5. IF advice lifecycle is active and the advisor result is missing, partial,
     interrupted, cancelled, timed-out, or failed: STOP the gate; do not
     increment review_cycles.
  6. review_cycles++ only after every required reviewer/advisor result is terminal
  7. reviewer_must_fix = (critical_count > 0)
  8. advisor_must_fix = false
     → When advice lifecycle is active, set advisor_must_fix from the terminal advisor report.
     → In default operational branch, leave it false unless the shared stuck contract delivered a terminal advisor for this exact remediation.
  9. review_must_fix = reviewer_must_fix OR advisor_must_fix
  10. must_fix_count = reviewer critical count + advisor must-fix count
  11. LOG reviewer + advisor findings: "Review: [score]/10 | Must-fix: [N] | Warnings: [N] | Suggestions: [N]"
  12. IF score >= 9.5 AND NOT review_must_fix:
     → Output: "✓ Step 4: Code reviewed - [score]/10 - Auto-approved ([warnings] warnings logged)"
     → PROCEED to Step 5
  13. ELSE IF review_must_fix AND review_cycles < 3:
     → Output: "⚙ Step 4: Evaluating [must_fix_count] must-fix items (cycle [review_cycles]/3)"
     → Executor evaluates each reviewer critical issue and advisor must-fix item.
     → Record causal executor decisions for individual findings; only accepted, authorized corrections may be applied.
     → IF advice lifecycle is active AND counsel is disputed:
       - Record reject-with-evidence, need-evidence, or reconcile without correction metadata.
       - Collect read-only evidence or an explicit resolution, preserving captured state; obtain fresh same-run counsel before any corrective mutation or resolved correction outcome.
       - GOTO LOOP within the review cap; do not register invented work or record a corrective outcome for this evidence-only branch.
     → ELSE (accepted corrections, or default operational branch without active advice lifecycle):
       - When advice lifecycle is active, record accept with one bounded action and declared validation command before writes; resume an already-active action rather than registering it twice.
       - Apply only accepted corrections within authorized scope that preserve the user baseline. Never auto-apply out-of-scope refactorings or unverified guidance.
       - Passing self-tests do not override an evidence-backed concern; re-run actual declared validation with tester.
       - When advice lifecycle is active, record the matching truthful state outcome with actual changed paths and validation status before the next reservation.
       - Default operational branch retains its correction/test/review loop without controller operations.
       - GOTO LOOP
  14. ELSE IF review_must_fix AND review_cycles >= 3:
     → ESCALATE TO USER (review cap reached)
     → DISPLAY all findings to user (critical, warnings, suggestions with file:line)
     → IF durable state is needs_human (correction_count === 3):
       - Conversational approval cannot complete the state gate; invoke state human-decision with fresh revision or abort.
     → ELSE (review cap without durable correction exhaustion):
       - Use AskUserQuestion: "Approve with noted issues" / "Abort workflow"
       - On approve: proceed with explicit acknowledgement; STOP further review cycles.
     → STOP; do not run another fix/test/reviewer/advisor sequence
  15. ELSE (no must-fix item, but score < 9.5):
     → Output: "✓ Step 4: Code reviewed - [score]/10 - Approved ([warnings] warnings, [suggestions] suggestions logged)"
     → PROCEED to Step 5
```

**Critical issues:** Security vulnerabilities (XSS, SQL injection, OWASP), performance bottlenecks, architectural violations, principle violations.

**Output formats:**
- Auto-approved: `✓ Step 4: Code reviewed - 9.8/10 - Auto-approved (2 warnings logged)`
- After auto-fix: `✓ Step 4: Code reviewed - 7.2/10 → Auto-fixed 2 critical → 9.5/10 - Approved`
- Escalation: `⚠ Step 4: 3 fix cycles exhausted, [N] critical remain - User input required`

**Validation:** Step 4 INCOMPLETE if critical issues > 0 AND user hasn't approved.

Mark Step 4 complete in TodoWrite, mark Step 5 in_progress.

---

## Step 5: Finalize

- When advice lifecycle is active (explicit `--advice` or applicable active/named-checkpoint run): follow the substantive finalization lifecycle in `## Caller lifecycle binding`. Planned docs, status, and onboarding paths are authorized writable paths. Parent records `state disposition` for finalization (registering the bounded action and declared validation command) BEFORE executing any finalization writes or Git index transitions. All substantive finalization changes (docs, status, summary reports, and auto-commit staging/commit) are executed under this registered action.
- When advice lifecycle is not active (default operational branch): preserve ordinary approved/validated completed status without durable controller dependencies or controller state operations.

1. **STATUS UPDATE - BOTH MANDATORY - PARALLEL EXECUTION:**
- **Call** `project-manager` sub-agent:
  - Advice finalization must NOT assign sealed plan writes to child status writer.
  - When advice lifecycle is active: "Do NOT write to sealed plan.md or roadmap. Report terminal project status and documentation updates to parent without claiming durable completion."
  - In default operational branch on an untouched ordinary plan: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp. Update roadmap."
  - In default operational branch on a protected historical advice plan: "Do NOT mutate captured plan.md, roadmap, or prior sealed paths. Report phase completion and validation evidence to parent for progress.md and default completion receipt update."
- **Call** `docs-manager` sub-agent:
  - Supply parent protected path set (prior sealed paths) and authorized destinations: "Update docs for plan phase [phase-name]. Authorized doc paths: [authorized destinations]. Do not touch prior sealed paths: [protected path set]. Changed files: [list]."

2. **ONBOARDING CHECK & SUBSTANTIVE REPORTS:** Detect onboarding requirements (API keys, env vars, config) + generate any substantive summary report or onboarding files with next steps before the final outcome (authorized in baseline manifest and registered under finalization disposition).
- If this is the last phase: use `AskUserQuestion` tool to ask if user wants to set up onboarding requirements.

3. **AUTO-COMMIT (after steps 1 and 2 complete):**
- **Call** `git-manager` subagent to handle git operation.
- Run only if: Steps 1 and 2 successful + Tests passed
- Pass parent protected paths and authorized destinations to `git-manager`: stage only authorized current-run deliverables; never stage prior sealed paths, alter their selected index identities, or stage receipts/progress.
- When advice lifecycle is active: authorized staging and commit transitions settle pre-seal before recording final outcome. After sealing, only shared-contract administrative publication is permitted.
- In default operational branch: retain standard scoped commit behavior without durable controller operations and with the same protected-path/index restrictions.
4. **CONTROLLER OUTCOME & COMPLETION:**
- When advice lifecycle is active:
  - Enforce writer barrier: all documentation/roadmap writes, substantive summary reports, onboarding configuration, and auto-commit staging/commit settle before recording final outcome.
  - Run declared validation across all finalized deliverables.
  - Parent records ONE truthful `state outcome` matching the registered finalization action, reporting actual changed paths and declared validation status. (A no-change outcome is valid ONLY if zero actual files were changed, declared validation passed, disposition was accept, and no must-fix/unresolved-question items remain).
  - Parent executes `state complete` to seal the task run. The durable completion receipt is authoritative; only then is the phase durably DONE.
  - At complete, parent publishes mandatory immutable phase completion receipt (outside baseline) AND updates mutable overview `<plan-dir>/progress.md` per `### Plan progress and phase reconciliation`. Publication failure does not reopen successful phase.
  - Preserve all sealed file/index identities; only the bounded receipt/overview publication above is allowed after sealing. Summary and archive branches cannot modify sealed paths. Output identifies `<plan-dir>/progress.md`.
- When advice lifecycle is not active (default operational branch):
  - No controller state operations (`state disposition`, `state outcome`, `state complete`).
  - On untouched ordinary plans: phase is completed upon successful validation, and marked DONE with timestamp in `plan.md`. Output identifies `plan.md`.
  - On protected historical advice plans: phase completion is explicitly non-durable; never modify captured `plan.md`, status, roadmap, or prior sealed paths. Parent records uncaptured default completion receipt (with approval/validation evidence) and updates `<plan-dir>/progress.md` per shared contract. Output identifies `<plan-dir>/progress.md`.

**Validation:** Steps 1 and 2 must complete successfully. Step 3 (auto-commit) runs only if conditions met. When advice lifecycle is active, `state complete` must succeed before phase completion.

Mark Step 5 complete in `TodoWrite`.

**Important:**
If $ALL_PHASES is `Yes`, run mandatory shared `### Plan progress and phase reconciliation` before advancing to determine the next incomplete phase automatically. If all phases complete per reconciled receipts, finish workflow.
If $ALL_PHASES is `No`, wait for user confirmation before proceeding to the next phase:
- Use `AskUserQuestion` tool to ask if user wants to proceed to the next phase: "**Phase workflow finished. Ready for next plan phase.**"
- On user confirmation, run mandatory shared Plan progress and phase reconciliation before selecting the next phase.
## Summary report
All substantive summary-report files must be produced before the final outcome (during Step 5 finalization, authorized in the baseline manifest).
When the advice lifecycle was active or when operating on a protected historical advice plan:
- After sealing via `state complete` (or default completion on a protected plan), summary output is strictly read-only terminal output or an uncaptured administrative receipt outside the captured baseline snapshot identifying the sealed snapshot without claiming later unreviewed edits.
- If this is the last phase: offer only read-only viewing of the sealed report and `<plan-dir>/progress.md`. Do not invoke `/plan:archive` or any preview operation that mutates prior sealed files; prior sealed paths remain unchanged.
When operating on an untouched ordinary default plan:
- Ordinary default behavior is unchanged. If this is the last phase, use `AskUserQuestion` tool to ask:
  - If user wants to preview the report with `/preview` slash command.
  - If user wants to archive the plan with `/plan:archive` slash command.
---
## Critical Enforcement Rules

**Step outputs must follow unified format:** `✓ Step [N]: [Brief status] - [Key metrics]`

**Examples:**
- Step 0: `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for advice/protected plans)
- Step 1: `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list]`
- Step 2: `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- Step 3: `✓ Step 3: Tests [X/X passed] - All requirements met`
- Step 4: `✓ Step 4: Code reviewed - [0] critical issues`
- Step 5: `✓ Step 5: Finalize - Status updated - Git committed` (include `- Overview: [plan-dir]/progress.md` for advice/protected plans)

**If any "✓ Step N:" output missing, that step is INCOMPLETE.**

**TodoWrite tracking required:** Initialize at Step 0, mark each step complete before next.

**Mandatory subagent calls:**
- Step 3: `tester`
- Step 4: `code-reviewer`
- Step 5: `project-manager` AND `docs-manager` AND `git-manager`

**Blocking gates:**
- Step 3: Tests must be 100% passing
- Step 4: Critical issues must be 0 (or user approved on escalation)
- Step 5: Both `project-manager` and `docs-manager` must complete successfully; when advice lifecycle is active, `state complete` must succeed before phase completion and parent publishes immutable receipt + mutable overview


**REMEMBER:**
- Do not skip steps. Do not proceed if validation fails.
- One plan phase per command run. Command focuses on single plan phase only.
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` or similar tools as needed.
