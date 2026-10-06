---
description: "Fix type errors"
argument-hint: "[options] [--advice]"
---
<raw-options>$ARGUMENTS</raw-options>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md` only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.claude/workflows/advice-activation.md` with original `$ARGUMENTS`, canonical `context.command: "fix/types"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "fix/types"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.claude/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.claude/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.

## Workflow
1. Run `bun run typecheck` or `tsc` or `npx tsc` and identify type errors.
2. Implement fixes for all type errors:
   - Fix all type errors and repeat the process until there are no more type errors.
   - Do not use `any` just to pass the type check.
   - In `off` mode, a second consecutive matching terminal blocker escalates through ordinary debugger/user handling before another attempt.
3. Review and finalization:
   - **Under `off` advice mode**: Verify type check passes cleanly, report back to user with a summary of the fixes. If executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.claude/workflows/plan-progress.md`; prior sealed paths remain immutable.
   - **Under `explicit` or `inherited` advice mode**:
     * Delegate to `code-reviewer` and wait for its terminal report. Enforce a writer barrier before checkpoint reservation.
     * Enter the canonical checkpoint dispatcher at `review:fix-types` under `.claude/workflows/advisor-mentoring.md`.
     * Parent is sole durable-state owner (`init`, `checkpoint`, `disposition`, `outcome`, `complete`). Child agents report terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage files behind the parent.
     * Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.
     * For accepted corrections, record `state disposition` with `action: "accept"` and registered action before writes, implement fix, validate, and record truthful `outcome`. For disputed counsel, record supported disposition without action, collect evidence, obtain fresh same-run counsel.
     * Complete ONCE via `state complete`. Write immutable completion receipt outside captured baseline snapshot and update derived overview `<plan-dir>/progress.md` per `.claude/workflows/plan-progress.md`.