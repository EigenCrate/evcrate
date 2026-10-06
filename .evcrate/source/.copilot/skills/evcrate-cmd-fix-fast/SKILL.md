---
name: "evcrate-cmd-fix-fast"
description: "Analyze and fix small issues [FAST]"
argument-hint: "[issues] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-fix-fast`. Do not split, normalize, or discard it before the canonical command parses it.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions and activation-first ordering; load full mentoring only after resolved explicit or inherited mode.

## Available workflow assets

- `@evcrate/workflows/advice-activation.md`
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
**Think hard** to analyze and fix these issues:
<raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.copilot/evcrate/workflows/advisor-mentoring.md` only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.copilot/evcrate/workflows/advice-activation.md` with original `$ARGUMENTS`, canonical `context.command: "fix/fast"`, the current root and any direct caller handoff.
Preserve known direct-caller selections; use `work_target: "fix/fast"` only when no caller target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.
Apply neutral `.copilot/evcrate/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.copilot/evcrate/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.

## Workflow
1. If the user provides a screenshots or videos, use `evcrate-ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.
2. Use `evcrate-debugger` subagent to find the root cause of the issues and report back to main agent.
3. Activate `evcrate-debugging` skills and `evcrate-problem-solving` skills to tackle the issues.
4. Start implementing the fix based the reports and solutions.
5. Use `evcrate-tester` agent to test the fix and make sure it works, then report back to main agent.
6. If there are issues or failed tests, repeat from step 4. In `off` mode, a second consecutive matching terminal blocker escalates through ordinary debugger/user handling before another attempt.
7. Review and finalization:
   - **Under `off` advice mode**: Respond back to user with a summary of the changes and explain everything briefly, ask user for approval, guide user to get started, and suggest next steps. If executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.copilot/evcrate/workflows/plan-progress.md`; prior sealed paths remain immutable.
   - **Under `explicit` or `inherited` advice mode**:
     * Delegate to `evcrate-code-reviewer` and wait for its terminal report. Enforce a writer barrier before checkpoint reservation.
     * Enter the canonical checkpoint dispatcher at `review:fix-fast` under `.copilot/evcrate/workflows/advisor-mentoring.md`.
     * Parent is sole durable-state owner (`init`, `checkpoint`, `disposition`, `outcome`, `complete`). Child agents (`evcrate-debugger`, `evcrate-tester`, `evcrate-code-reviewer`) report terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage files behind the parent.
     * Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.
     * For accepted corrections, record `state disposition` with `action: "accept"` and registered action before writes, implement fix, validate, and record truthful `outcome`. For disputed counsel, record supported disposition without action, collect evidence, obtain fresh same-run counsel.
     * Complete ONCE via `state complete`. Write immutable completion receipt outside captured baseline snapshot and update derived overview `<plan-dir>/progress.md` per `.copilot/evcrate/workflows/plan-progress.md`.
