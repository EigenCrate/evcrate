---
argument-hint: "[options] [--advice]"
description: "Fix type errors"
---

<raw-options>$ARGUMENTS</raw-options>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Native command execution validates and resolves advice activation prior to prompt admission, prepending the `evcrate_omp_command_context` header.
If `evcrate_omp_command_context` is missing or invalid, treat activation as failed and fail closed per the shared activation contract without making native authentication claims.
Consume the validated `result = evcrate_omp_command_context.activation_result`, validated `context`, `WORK_ARGUMENTS = result.work_arguments`, and `ADVICE_MODE = result.mode`. Do not re-invoke the HOME helper or skip required approvals; use the validated work input everywhere below.
Apply neutral `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.

## Workflow
1. Run `bun run typecheck` or `tsc` or `npx tsc` and identify type errors.
2. Implement fixes for all type errors:
   - Fix all type errors and repeat the process until there are no more type errors.
   - Do not use `any` just to pass the type check.
   - In `off` mode, a second consecutive matching terminal blocker escalates through ordinary debugger/user handling before another attempt.
3. Review and finalization:
   - **Under `off` advice mode**: Verify type check passes cleanly, report back to user with a summary of the fixes. If executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`; prior sealed paths remain immutable.
   - **Under `explicit` or `inherited` advice mode**:
     * Delegate to `code-reviewer` and wait for its terminal report. Enforce a writer barrier before checkpoint reservation.
     * Enter the canonical checkpoint dispatcher at `review:fix-types` under `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`.
     * Parent is sole durable-state owner (`init`, `checkpoint`, `disposition`, `outcome`, `complete`). Child agents report terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage files behind the parent.
     * Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.
     * For accepted corrections, record `state disposition` with `action: "accept"` and registered action before writes, implement fix, validate, and record truthful `outcome`. For disputed counsel, record supported disposition without action, collect evidence, obtain fresh same-run counsel.
     * Complete ONCE via `state complete`. Write immutable completion receipt outside captured baseline snapshot and update derived overview `<plan-dir>/progress.md` per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`.
