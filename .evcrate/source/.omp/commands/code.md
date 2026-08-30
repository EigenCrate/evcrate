---
argument-hint: "[plan] [--advice]"
description: "⚡⚡⚡ Start coding & testing an existing plan"
---


**MUST READ** `CLAUDE.md` then **THINK HARDER** to start working on the following plan follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

Named checkpoints use the `evcrate-advisor-checkpoint/v1` dispatcher block in
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before interpreting the plan, read `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and
derive `WORK_ARGUMENTS` plus explicit/default advice mode from the raw arguments.
Use `WORK_ARGUMENTS` as the plan input everywhere below. Apply the shared default
stuck-escalation contract throughout this command.

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

**If `WORK_ARGUMENTS` is empty:**
1. Find latest `plan.md` in `./plans` | `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-`
2. Parse plan for phases and status, auto-select next incomplete (prefer IN_PROGRESS or earliest Planned)

**If `WORK_ARGUMENTS` provided:** Use that plan and detect which phase to work on (auto-detect or use argument like "phase-2").

**Output:** `✓ Step 0: [Plan Name] - [Phase Name]`

**Subagent Pattern (use throughout):**
```
Task(subagent_type="[type]", prompt="[task description]", description="[brief]")
```

**Blocking delegation rule:** Every Task/subagent call is synchronous. The parent must wait for the terminal response, verify the requested report/artifact and validation status, and only then continue. For parallel calls, explicitly say **wait for all agents**, collect one terminal result per call, and stop on any interrupted, timed-out, missing, or partial result.

**Wait-loop protocol:** After each Task call, record the returned agent identity and use the native wait operation for that same agent. A response such as **"No agents completed yet"** is expected polling feedback, not a timeout: immediately wait again. Do not use shell `sleep`, start another task, ask for approval, synthesize a score, restart, or interrupt the agent while it is active. Polling intervals and the three-review-cycle limit do not end the gate; the cycle counter advances only after every required reviewer/advisor result is terminal, and a user fix decision is required before beginning another cycle. If the parent runtime terminates first, report the review gate incomplete with the agent identity and no fabricated result.

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

Implement selected plan phase step-by-step following extracted tasks (Step 2.1, Step 2.2, etc.). Mark tasks complete as done. For UI work, call `ui-ux-designer` subagent: "Implement [feature] UI per ./docs/design-guidelines.md". Use `ai-multimodal` skill for image assets, `imagemagick` for editing. Run type checking and compile to verify no syntax errors.

**Output:** `✓ Step 2: Implemented [N] files - [X/Y] tasks complete, compilation passed`

Mark Step 2 complete in TodoWrite, mark Step 3 in_progress.

---

## Step 3: Testing

Write tests covering happy path, edge cases, and error cases. Call `tester` subagent: "Run test suite for plan phase [phase-name]". If ANY tests fail: STOP, call `debugger` subagent: "Analyze failures: [details]", fix all issues, re-run `tester`. Repeat until 100% pass.

**Testing standards:** Unit tests may use mocks for external dependencies (APIs, DB). Integration tests use test environment. E2E tests use real but isolated data. Forbidden: commenting out tests, changing assertions to pass, TODO/FIXME to defer fixes.

**Output:** `✓ Step 3: Tests [X/X passed] - All requirements met`

**Validation:** If X ≠ total, Step 3 INCOMPLETE - do not proceed.

Mark Step 3 complete in TodoWrite, mark Step 4 in_progress.

---

## Step 4: Code Review & Approval ⏸ BLOCKING GATE

Call exactly one `code-reviewer` subagent per review cycle: "Review changes for plan phase [phase-name]. Check security, performance, architecture, YAGNI/KISS/DRY. Return a terminal report with score (X/10), critical issues list, warnings list, suggestions list, reviewed files, validation commands/results, and unresolved questions. Do not return a progress-only response."

**Review completion gate:** Stay in the wait loop for the same reviewer until its terminal result arrives. Only then display findings and request approval. A terminal failure, interruption, cancellation, or parent-runtime termination fails the gate; do not invent a score or silently launch a replacement. If the user says to keep waiting, continue polling the same reviewer identity.

**Advice gate:** In explicit advice mode, after the reviewer terminal result and
before displaying findings, fixing issues, or requesting approval, enter the
canonical checkpoint dispatcher exactly once at `review:<workflow-step>` for
this review cycle. Supply the bounded evidence, relevant prior counsel, and
owner disposition required by the shared mentoring contract. Wait for its
terminal result and include its must-fix guidance in the findings. A dispatcher
failure leaves Step 4 incomplete.

**Interactive Review-Fix Cycle (max 3 cycles):**

**Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.**

```
review_cycles = 0
LOOP:
  1. IF review_cycles >= 3:
     → Output: "⚠ 3 review cycles completed. Final decision required."
     → ask the user: "Approve with noted issues" / "Abort workflow"
     → STOP; do not start another review or advisor call
  2. Run code-reviewer → wait for its terminal result; get score, critical_count, warnings, suggestions

  3. IF the reviewer result is missing, partial, interrupted, cancelled,
     timed-out, or failed: STOP the gate; do not increment review_cycles.

  4. IF explicit advice mode: enter the canonical dispatcher → wait for its terminal result

  5. IF explicit advice mode and the advisor result is missing, partial,
     interrupted, cancelled, timed-out, or failed: STOP the gate; do not
     increment review_cycles.

  6. review_cycles++ only after every required reviewer/advisor result is terminal

  7. DISPLAY FULL REVIEWER + ADVISOR FINDINGS AND SUMMARY TO USER:
     ┌─────────────────────────────────────────┐
     │ Code Review Results: [score]/10         │
     ├─────────────────────────────────────────┤
     │ Summary: [what implemented], tests      │
     │ [X/X passed]                            │
     ├─────────────────────────────────────────┤
     │ Critical Issues ([N]): MUST FIX         │
     │  - [issue] at [file:line]               │
     │ Warnings ([N]): SHOULD FIX              │
     │  - [issue] at [file:line]               │
     │ Suggestions ([N]): NICE TO HAVE         │
     │  - [suggestion]                         │
     └─────────────────────────────────────────┘

  8. Use ask the user (header: "Review & Approve"):
     IF critical_count > 0 OR advisor has must-fix items:
       - "Fix critical issues" → implement fixes, re-run tester, GOTO LOOP
       - "Fix all issues" → implement all fixes, re-run tester, GOTO LOOP
       - "Approve anyway" → PROCEED to Step 5
       - "Abort" → stop workflow
     ELSE:
       - "Approve" → PROCEED to Step 5
       - "Fix warnings/suggestions" → implement fixes, re-run tester, GOTO LOOP
       - "Abort" → stop workflow

  9. IF user selects any fix option:
     IF review_cycles >= 3:
       → Output: "⚠ 3 review cycles completed. Final decision required."
       → ask the user: "Approve with noted issues" / "Abort workflow"
       → STOP; do not run another fix/test/reviewer/advisor sequence
     ELSE:
       → implement fixes, re-run tester, GOTO LOOP
```

**Critical issues:** Security vulnerabilities (XSS, SQL injection, OWASP), performance bottlenecks, architectural violations, principle violations.

**Output formats:**
- Waiting: `⏸ Step 4: Code reviewed - [score]/10 - WAITING for user approval`
- After fix: `✓ Step 4: [old]/10 → Fixed [N] issues → [new]/10 - User approved`
- Approved: `✓ Step 4: Code reviewed - [score]/10 - User approved`

**Validation:** Step 4 INCOMPLETE until user explicitly approves.

Mark Step 4 complete in TodoWrite, mark Step 5 in_progress.

---

## Step 5: Finalize

**Prerequisites:** User approved in Step 4 (verified above).

1. **STATUS UPDATE - BOTH MANDATORY - PARALLEL EXECUTION:**
- **Call** `project-manager` sub-agent: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp. Update roadmap."
- **Call** `docs-manager` sub-agent: "Update docs for plan phase [phase-name]. Changed files: [list]."

2. **ONBOARDING CHECK:** Detect onboarding requirements (API keys, env vars, config) + generate summary report with next steps.

3. **AUTO-COMMIT (after steps 1 and 2 completes):**
- Run only if: Steps 1 and 2 successful + User approved + Tests passed
- Auto-stage, commit with conventional commit message based on actual changes

**Validation:** Steps 1 and 2 must complete successfully. Step 3 (auto-commit) runs only if conditions met.

Mark Step 5 complete in TodoWrite.

**Phase workflow finished. Ready for next plan phase.**

---

## Critical Enforcement Rules

**Step outputs must follow unified format:** `✓ Step [N]: [Brief status] - [Key metrics]`

**Examples:**
- Step 0: `✓ Step 0: [Plan Name] - [Phase Name]`
- Step 1: `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list]`
- Step 2: `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- Step 3: `✓ Step 3: Tests [X/X passed] - All requirements met`
- Step 4: `✓ Step 4: Code reviewed - [score]/10 - User approved`
- Step 5: `✓ Step 5: Finalize - Status updated - Git committed`

**If any "✓ Step N:" output missing, that step is INCOMPLETE.**

**TodoWrite tracking required:** Initialize at Step 0, mark each step complete before next.

**Mandatory subagent calls:**
- Step 3: `tester`
- Step 4: `code-reviewer`
- Step 5: `project-manager` AND `docs-manager` (when user approves)

**Blocking gates:**
- Step 3: Tests must be 100% passing
- Step 4: User must explicitly approve (via ask the user)
- Step 5: Both `project-manager` and `docs-manager` must complete successfully

**REMEMBER:**
- Do not skip steps. Do not proceed if validation fails. Do not assume approval without user response.
- One plan phase per command run. Command focuses on single plan phase only.
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` or similar tools as needed.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
