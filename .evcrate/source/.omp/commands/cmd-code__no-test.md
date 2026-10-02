---
argument-hint: "[plan] [--advice]"
description: "Start coding an existing plan (no testing)"
---

**MUST READ** `CLAUDE.md` then **THINK HARDER** to start working on the following plan follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before interpreting the plan, read `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and
derive `WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS`
as the plan input everywhere below. Apply the shared default stuck-escalation
contract in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` unconditionally across all
modes (reaching a second matching blocker activates the named checkpoint / advice
lifecycle). The advice lifecycle is active when explicit `--advice` is present,
an applicable active run exists, or a named checkpoint is activated. When the
advice lifecycle is active, apply the canonical `## Caller lifecycle binding` in
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`:
- **Durable state ownership**: The parent command is the sole owner of the task-state lifecycle. Child subagents (`code-reviewer`, `project-manager`, `docs-manager`, `ui-ux-designer`) report terminal artifacts, evidence, and actual changed paths; they never operate controller state or stage/commit behind the parent.
- **Run identity & handoff**: If entering with an existing active run (from prior direction/decision/stuck run or router handoff), retain `task_run_id`, phase, root, current state revision, and prior counsel/disposition/outcome. Resume an already-active action without duplicating it: complete its authorized bounded work, execute applicable actual declared validation (e.g., type check / compile; never fabricate tests passed), and record a truthful matching outcome advancing the baseline before the next review reservation. Before new authorized bounded writes, require `accept` with a registered correction action. For disputed counsel (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action, an evidence-only inherited handoff may consult within its one available cycle if no prior local cycle, without requiring an invented outcome.
- **Fresh first review**: If no prior active advice run exists, do NOT initialize state at command start just to track implementation. Implementation (Step 2), actual validation (Step 2 type check / compile), reviewer output (Step 3), and planned finalization artifacts settle first (writer barrier). Build `baseline_paths` as the union of authorized writable paths and selected read-only `evidence.files`/artifacts (`authorized_paths` contains only writable paths). Call `state init` immediately before reservation in Step 3, with no intervening file edits or git status/index changes.
- **Single-cycle preservation & registered action**: Preserve exactly ONE review/advisor cycle. Accepted fixes plus planned finalization (docs, status, summary reports, selected Git commit transitions) must be registered in ONE disposition/action before the first write. Applicable actual validation (type check / compile; never fabricate tests passed) executes after all work and index transitions settle; defer the single matching outcome until Step 4 finalization is settled. Never record a second disposition on the same consumed consultation. If disputing current review requires new counsel or another review is necessary, stop and hand off under the SAME active run context; never internally start another review.
- **Baseline stability**: Freeze all baseline paths (not only current citations) during reservation, inference, disposition, and from final outcome to completion.
- **Advice lifecycle & plan protection**: A prior completed advice run alone protects historical paths (sealed `plan.md`, historical reports, roadmap, captured git index/status identity) from mutation, but does NOT force fresh advice for a new default phase. Existing sealed paths stay strictly immutable even if the next invocation omits `--advice`.
- **Derived overview & immutable receipts**: `<plan-dir>/progress.md` is the derived current overview and is NEVER captured or cited as evidence or authorized substantive paths. Mutable progress is never captured; no retroactively removing captured paths. If already captured in the baseline, callers cannot overwrite progress either (surface blocker). New plans link before capture; old sealed plans remain untouched. Immutable phase completion receipts live outside the baseline.
- **Default operational branch (no active advice lifecycle)**: An untouched ordinary plan without advice history keeps normal `plan.md` tracking without controller state operations. A protected historical plan with a new default phase uses normal validation and approval without durable controller operations, updating `<plan-dir>/progress.md` and an uncaptured default completion receipt outside baseline.

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
- **If `WORK_ARGUMENTS` is empty:** Find latest `plan.md` in `./plans` | `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-`
- **If `WORK_ARGUMENTS` provided:** Use that plan and detect which phase to work on (auto-detect or use argument like "phase-2").

**Mandatory shared Plan progress and phase reconciliation:**
Before selecting or confirming any phase (including explicit requested phases):
1. Apply `### Plan progress and phase reconciliation` in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` to reconcile completed scope, verify execution prerequisites, and preserve any active advice run/action context.
2. An explicitly requested already-completed phase is a no-op: report completion, recommend the next incomplete phase, but do not auto-execute a different phase without user authorization.
3. Emit overview path (`<plan-dir>/progress.md` for advice/protected plans, or `plan.md` for ordinary default plans), reconciled actual scope, and any outstanding prerequisites/blockers. Auto-select next incomplete phase (prefer IN_PROGRESS or earliest Planned).

**Output:** `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for advice/protected plans)

**Subagent Pattern (use throughout):**
```
Task(subagent_type="[type]", prompt="[task description]", description="[brief]")
```

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
  - Phase Code Review tasks → Step 3.X (Step 3.1, Step 3.2, etc.)
- Ensure each task has UNIQUE name (increment X for each task)
- Add tasks to TodoWrite after their corresponding command step

**Output:** `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list or "none"]`

Mark Step 1 complete in TodoWrite, mark Step 2 in_progress.

---

## Step 2: Implementation

Implement selected plan phase step-by-step following extracted tasks (Step 2.1, Step 2.2, etc.). Mark tasks complete as done. For UI work, call `ui-ux-designer` subagent: "Implement [feature] UI per ./docs/design-guidelines.md". Use `ai-multimodal` skill for image assets, `imagemagick` for editing. Run type checking and compile to verify no syntax errors.

**Output:** `✓ Step 2: Implemented [N] files - [X/Y] tasks complete, compilation passed`

Mark Step 2 complete in TodoWrite, mark Step 3 in_progress.

---

## Step 3: Code Review & Approval ⏸ BLOCKING GATE

Call `code-reviewer` subagent: "Review changes for plan phase [phase-name]. Check security, performance, architecture, YAGNI/KISS/DRY. Return score (X/10), critical issues list, warnings list, suggestions list."

**Advice gate & lifecycle placement:** When advice lifecycle is active (explicit `--advice` or applicable active/named-checkpoint run):
- **Cycle 1 reservation**: After reviewer terminal output arrives and before displaying findings or asking for approval:
  - If a fresh review run: initialize task state immediately before reservation (`baseline_paths` = authorized writable paths UNION selected read-only `evidence.files`/artifacts, with read-only files omitted from `authorized_paths`).
  - If an active run has a registered action, finish its bounded work, applicable actual declared validation (type check / compile), and matching truthful outcome before reservation without duplicating the action. An evidence-only inherited handoff without an active action preserves the captured baseline and may consult within its one available cycle if no prior local cycle, without requiring an invented outcome.
  - Enter the canonical checkpoint dispatcher exactly once at `review:step-3`. Supply bounded evidence, applicable actual declared validation commands/output (syntax/typecheck; do NOT fabricate tests passed), relevant prior counsel, and owner disposition per `## Caller lifecycle binding`.
  - Freeze all baseline paths during reservation, inference, and disposition.
  - A dispatcher failure or non-`ADVICE_READY` result fails Step 3. Include advisor must-fix guidance in the findings.

This no-test variant imposes a strict one-cycle limit to preserve speed intent. The
shared cap allows at most three terminal reviewer/advisor cycles, but no-test
restricts execution to one cycle. If this gate is not approved, stop and do not
start another review or advisor call. If another review is necessary after fixes or
if disputing current review requires new counsel, stop and hand off with the SAME
active context rather than internally starting another review/advisor cycle.

**Display + Approve Flow (optimized for speed):**

```
1. Run code-reviewer → get score, critical_count, warnings, suggestions

2. IF advice lifecycle is active: enter the canonical dispatcher → get its terminal result

3. DISPLAY FULL REVIEWER + ADVISOR FINDINGS AND SUMMARY TO USER:
   ┌─────────────────────────────────────────┐
   │ Code Review Results: [score]/10         │
   ├─────────────────────────────────────────┤
   │ Summary: [what implemented]             │
   │ (Tests skipped per user request;        │
   │  actual validation: typecheck/compile)  │
   ├─────────────────────────────────────────┤
   │ Critical Issues ([N]): MUST FIX         │
   │  - [issue] at [file:line]               │
   │ Warnings ([N]): SHOULD FIX              │
   │  - [issue] at [file:line]               │
   │ Suggestions ([N]): NICE TO HAVE         │
   │  - [suggestion]                         │
   └─────────────────────────────────────────┘

4. Use ask the user (header: "Review & Approve"):
   IF critical_count > 0 OR advisor has must-fix items:
     - "Fix critical and advisor must-fix items + approve" →
       - When advice lifecycle is active: parent records ONE canonical `state disposition` (`action: "accept"`, causal rationale, `correction: { action_id, episode_id, validation_command }`) registering accepted fixes PLUS planned finalization (docs, status, summary report, and selected auto-commit index transition) with applicable actual declared validation (syntax/typecheck; do NOT fabricate tests passed) BEFORE the first write.
       - Implement required fixes within `task.authorized_paths`.
       - Do NOT record an outcome or a second disposition here. Compile/typecheck prerequisite checks are permitted; final declared validation still runs after all finalization and selected Git transitions.
       - PROCEED to Step 4 to complete planned finalization.
     - "Dispute advisor findings with evidence" →
       - When advice lifecycle is active: parent records canonical `state disposition` (`action: "reject-with-evidence" | "need-evidence" | "reconcile"`, causal rationale, `correction: null`) without correction metadata, and collects read-only evidence or an explicit resolution while preserving the captured baseline.
       - Stop and hand off with the SAME active context (`task_run_id`, revisions, baseline, prior counsel/disposition) to `/cmd-code` for fresh consultation; do NOT internally start another review cycle.
     - "Approve anyway" → PROCEED to Step 4
     - "Abort" → stop workflow
   ELSE:
     - "Approve" → PROCEED to Step 4
     - "Abort" → stop workflow
```

**Note:** No fix loop to respect speed intent. If user wants iterative fixes, use `/cmd-code` instead. If another review is necessary after fixes or if disputing current review requires new counsel, stop and hand off with the SAME active context rather than internally adding another cycle.

**Critical issues:** Security vulnerabilities (XSS, SQL injection, OWASP), performance bottlenecks, architectural violations, principle violations.

**Output formats:**
- Waiting: `⏸ Step 3: Code reviewed - [score]/10 - WAITING for user approval`
- Approved: `✓ Step 3: Code reviewed - [score]/10 - User approved`

**Validation:** Step 3 INCOMPLETE until user explicitly approves.

Mark Step 3 complete in TodoWrite, mark Step 4 in_progress.

---

## Step 4: Finalize

**Prerequisites:** User approved in Step 3 (verified above).

- When advice lifecycle is active (explicit `--advice` or applicable active/named-checkpoint run): follow the substantive finalization lifecycle in `## Caller lifecycle binding`. Planned docs, status, and onboarding paths are authorized writable paths.
  - If a disposition was already registered in Step 3 (covering accepted fixes + planned finalization), do NOT record a second disposition on the same consumed consultation.
  - If no disposition was registered in Step 3 (user approved without code fixes):
    * If substantive finalization writes or Git transitions are planned: parent records ONE canonical `state disposition` (`action: "accept"`, causal rationale, `correction: { action_id, episode_id, validation_command }`) BEFORE executing any finalization writes or Git index transitions.
    * Only if zero actual files or selected index/status identities changed across the whole phase and no finalization writes remain: parent records `state disposition` (`action: "accept"`, causal rationale, `correction: null`).
  - **Genuine no-change exit:** After `correction: null`, skip Steps 1–3 entirely: no project-manager, docs-manager, status/roadmap update, onboarding/report writer, staging, or commit. Go directly to Step 4 for actual declared validation, the null-ID/empty-path outcome, and ONE completion; do not fall through to the writers below. This exit requires counsel with no must-fix items or unresolved questions.
- When advice lifecycle is not active (default operational branch): preserve ordinary approved/validated completed status without durable controller dependencies or controller state operations.

1. **STATUS UPDATE - BOTH MANDATORY - PARALLEL EXECUTION (default operational branch or registered-action path only):**
- **Pre-update validation check**: If code fixes were applied in Step 3, execute fresh compile/typecheck validation immediately on the fixed tree before allowing `project-manager` to write status or mark DONE; do not write status or mark DONE on unvalidated fixes.
- **Call** `project-manager` sub-agent:
  - When advice lifecycle is active: "Do NOT write to sealed plan.md or roadmap. Report terminal project status and documentation updates to parent without claiming durable completion."
  - In default operational branch on an untouched ordinary plan: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp only after verifying fresh compile/typecheck passed. Update roadmap."
  - In default operational branch on a protected historical advice plan: "Do NOT mutate captured plan.md, roadmap, or prior sealed paths. Report phase completion and validation evidence to parent for progress.md and default completion receipt update."
- **Call** `docs-manager` sub-agent:
  - Supply parent protected path set (prior sealed paths) and authorized destinations: "Update docs for plan phase [phase-name]. Authorized doc paths: [authorized destinations]. Do not touch prior sealed paths: [protected path set]. Changed files: [list]."

2. **ONBOARDING CHECK:** Detect onboarding requirements (API keys, env vars, config) + generate substantive summary report with next steps before the final outcome (authorized in baseline manifest and registered action).

3. **AUTO-COMMIT (after steps 1 and 2 complete):**
- In both modes: after fixes and substantive finalization settle, run fresh compile/typecheck validation on the current snapshot before deciding whether auto-commit is eligible (pre-commit check; does not add a review cycle or outcome and does not replace final post-transition validation in advice mode; never fabricate tests passed).
- Run auto-commit only if: Steps 1 and 2 successful + User approved + fresh compile/typecheck validation passed.
- Pass parent protected paths and authorized destinations to `git-manager`: stage only authorized current-run deliverables; never stage prior sealed paths, alter their selected index identities, or stage receipts/progress.
- When advice lifecycle is active: authorized staging and commit transitions settle pre-seal before recording final outcome. After sealing, only shared-contract administrative publication is permitted.
- In default operational branch: retain standard scoped commit behavior without durable controller operations and with the same protected-path/index restrictions.
4. **CONTROLLER OUTCOME & COMPLETION:**
- When advice lifecycle is active:
  - After all work and index transitions (fixes from Step 3, status/docs updates, onboarding report, and auto-commit staging/commit) are complete, run final post-index applicable actual declared validation (e.g., type check / compile; do NOT fabricate tests passed).
  - Defer the single matching outcome until all Step 4 finalization work and final post-index validation have settled. Parent records ONE truthful `state outcome` reporting all actual changed paths and declared validation status matching exact schemas:
    - Path A (changes made): `action_id`, `episode_id`, `result: "resolved"`, declared validation status, `actual_changed_paths`.
    - Path B (no changes across whole phase): `action_id: null`, `episode_id: null`, `result: "resolved"`, declared validation status, `actual_changed_paths: []`.
  - If another review is necessary, STOP and hand off with the SAME active context (`task_run_id`, baseline, outcome, revisions); do NOT silently start another review/advisor cycle (strictly preserve the ONE-cycle limit).
  - Otherwise, parent executes `state complete` to seal the task run. The durable completion receipt is authoritative; only then is the phase durably DONE.
  - At complete, parent publishes mandatory immutable phase completion receipt (outside baseline) AND updates mutable overview `<plan-dir>/progress.md` per `### Plan progress and phase reconciliation`. Publication failure does not reopen successful phase.
  - Preserve all sealed file/index identities; only the bounded receipt/overview publication above is allowed after sealing. Summary and archive branches cannot modify sealed paths. Output identifies `<plan-dir>/progress.md`.
- When advice lifecycle is not active (default operational branch):
  - No controller state operations (`state disposition`, `state outcome`, `state complete`).
  - Require fresh applicable compile/typecheck validation to pass across accepted fixes and substantive deliverables before completion (never fabricate tests passed).
  - On untouched ordinary plans: phase is completed upon approval and validation, and marked DONE with timestamp in Step 1. Output identifies `plan.md`.
  - On protected historical advice plans: phase completion is explicitly non-durable; never modify captured `plan.md`, status, roadmap, or prior sealed paths. Parent records uncaptured default completion receipt (with approval/validation evidence) and updates `<plan-dir>/progress.md` per shared contract. Output identifies `<plan-dir>/progress.md`.

**Validation:** Steps 1 and 2 must complete successfully on the default/registered-action path, with fresh compile/typecheck validation passed; Step 3 (auto-commit) runs only if conditions met. The explicit genuine no-change path skips all three, validates the unchanged snapshot, and records only its null-ID/empty-path outcome. When advice lifecycle is active, `state complete` must succeed before phase completion.
Mark Step 4 complete in TodoWrite.

**Phase workflow finished. Ready for next plan phase.**

---

## Critical Enforcement Rules

**Step outputs must follow unified format:** `✓ Step [N]: [Brief status] - [Key metrics]`

**Examples:**
- Step 0: `✓ Step 0: [Plan Name] - [Phase Name]` (include `- Overview: [plan-dir]/progress.md` for advice/protected plans)
- Step 1: `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list]`
- Step 2: `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- Step 3: `✓ Step 3: Code reviewed - [score]/10 - User approved`
- Step 4: `✓ Step 4: Finalize - Status updated - Git committed` (include `- Overview: [plan-dir]/progress.md` for advice/protected plans)

**If any "✓ Step N:" output missing, that step is INCOMPLETE.**

**TodoWrite tracking required:** Initialize at Step 0, mark each step complete before next.

**Mandatory subagent calls:**
- Step 3: `code-reviewer`
- Step 4: `project-manager` AND `docs-manager` on default or registered-action paths (genuine no-change exit skips both writers)

**Blocking gates:**
- Step 3: User must explicitly approve (via ask the user)
- Step 4: On default or registered-action paths, both `project-manager` and `docs-manager` must complete successfully (genuine no-change exit skips both writers); when advice lifecycle is active, `state complete` must succeed before phase completion and parent publishes immutable receipt + mutable overview


**REMEMBER:**
- Do not skip steps. Do not proceed if validation fails. Do not assume approval without user response.
- One plan phase per command run. Command focuses on single plan phase only.
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `media-processing` skill or similar tools as needed.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
