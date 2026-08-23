---
description: [AUTO] Start coding & testing an existing plan ("trust me bro")
argument-hint: [plan] [all-phases-yes-or-no] [--advice] (default: yes)
---

**MUST READ** `CLAUDE.md` then **THINK HARDER** to start working on the following plan follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-plan>$ARGUMENTS</raw-plan>

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before assigning positional arguments, read
`.claude/workflows/advisor-mentoring.md` and derive `WORK_ARGUMENTS` plus
explicit/default advice mode. Apply its default stuck-escalation contract
throughout this command.

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

**If `$PLAN` is empty:**
1. Find latest `plan.md` in `./plans` | `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-`
2. Parse plan for phases and status, auto-select next incomplete (prefer IN_PROGRESS or earliest Planned)

**If `$PLAN` provided:** Use that plan and detect which phase to work on (auto-detect or use argument like "phase-2").

**Output:** `✓ Step 0: [Plan Name] - [Phase Name]`

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

In explicit advice mode, every terminal reviewer result must be followed by
exactly one blocking `advisor` call at `review:<workflow-step>` before logging,
fixing, auto-approving, or escalating that review. Supply the bounded evidence,
relevant prior counsel, and owner disposition from the shared mentoring contract.
A missing, partial, interrupted, cancelled, or failed advisor result fails Step 4.

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
  4. IF explicit advice mode: run advisor → wait for its terminal mentorship report
  5. IF explicit advice mode and the advisor result is missing, partial,
     interrupted, cancelled, timed-out, or failed: STOP the gate; do not
     increment review_cycles.
  6. review_cycles++ only after every required reviewer/advisor result is terminal
  7. reviewer_must_fix = (critical_count > 0)
  8. advisor_must_fix = false
     → Explicit advice mode sets advisor_must_fix from the terminal advisor report.
     → Default mode does not invent advisor guidance; leave it false unless the
     shared stuck contract delivered a terminal advisor for this exact remediation.
  9. review_must_fix = reviewer_must_fix OR advisor_must_fix
  10. must_fix_count = reviewer critical count + advisor must-fix count
  11. LOG reviewer + advisor findings: "Review: [score]/10 | Must-fix: [N] | Warnings: [N] | Suggestions: [N]"
  12. IF score >= 9.5 AND NOT review_must_fix:
     → Output: "✓ Step 4: Code reviewed - [score]/10 - Auto-approved ([warnings] warnings logged)"
     → PROCEED to Step 5
  13. ELSE IF review_must_fix AND review_cycles < 3:
     → Output: "⚙ Step 4: Auto-fixing [must_fix_count] must-fix items (cycle [review_cycles]/3)"
     → Apply every advisor must-fix item before approval, plus reviewer critical issues.
     → Re-run tester to verify no regressions
     → GOTO LOOP
  14. ELSE IF review_must_fix AND review_cycles >= 3:
     → ESCALATE TO USER (hard cap reached)
     → DISPLAY all findings to user (critical, warnings, suggestions with file:line)
     → Use AskUserQuestion:
       - "Approve with noted issues" → proceed with explicit acknowledgement
       - "Abort workflow" → stop
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

1. **STATUS UPDATE - BOTH MANDATORY - PARALLEL EXECUTION:**
- **Call** `project-manager` sub-agent: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp. Update roadmap."
- **Call** `docs-manager` sub-agent: "Update docs for plan phase [phase-name]. Changed files: [list]."

2. **ONBOARDING CHECK:** Detect onboarding requirements (API keys, env vars, config) + generate summary report with next steps.
- If this is the last phase: use `AskUserQuestion` tool to ask if user wants to set up onboarding requirements.

3. **AUTO-COMMIT (after steps 1 and 2 completes):**
- **Call** `git-manager` subagent to handle git operation.
- Run only if: Steps 1 and 2 successful + Tests passed
- Auto-stage, commit with conventional commit message based on actual changes

**Validation:** Steps 1 and 2 must complete successfully. Step 3 (auto-commit) runs only if conditions met.

Mark Step 5 complete in `TodoWrite`.

**Important:**
If $ALL_PHASES is `Yes`, proceed to the next phase automatically.
If $ALL_PHASES is `No`, wait for user confirmation before proceeding to the next phase:
- Use `AskUserQuestion` tool to ask if user wants to proceed to the next phase: "**Phase workflow finished. Ready for next plan phase.**"

## Summary report
If this is the last phase, generate a concise summary report.
Use `AskUserQuestion` tool to ask these questions:
- If user wants to preview the report with `/preview` slash command.
- If user wants to archive the plan with `/plan:archive` slash command.

---

## Critical Enforcement Rules

**Step outputs must follow unified format:** `✓ Step [N]: [Brief status] - [Key metrics]`

**Examples:**
- Step 0: `✓ Step 0: [Plan Name] - [Phase Name]`
- Step 1: `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list]`
- Step 2: `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- Step 3: `✓ Step 3: Tests [X/X passed] - All requirements met`
- Step 4: `✓ Step 4: Code reviewed - [0] critical issues`
- Step 5: `✓ Step 5: Finalize - Status updated - Git committed`

**If any "✓ Step N:" output missing, that step is INCOMPLETE.**

**TodoWrite tracking required:** Initialize at Step 0, mark each step complete before next.

**Mandatory subagent calls:**
- Step 3: `tester`
- Step 4: `code-reviewer`
- Step 5: `project-manager` AND `docs-manager` AND `git-manager`

**Blocking gates:**
- Step 3: Tests must be 100% passing
- Step 4: Critical issues must be 0

**REMEMBER:**
- Do not skip steps. Do not proceed if validation fails.
- One plan phase per command run. Command focuses on single plan phase only.
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` or similar tools as needed.
