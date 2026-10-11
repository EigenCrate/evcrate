---
name: "evc-cmd-fix-x-types"
description: "Fix type errors"
argument-hint: "[options]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-fix-x-types`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

<raw-options>$ARGUMENTS</raw-options>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.copilot/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Preserve sealed history; completed requested scope is a no-op. Children receive
exact ownership and writable/protected paths, return terminal artifacts, and
never stage/commit behind the parent. Risky/destructive actions require approval.

## Workflow
1. Run `bun run typecheck` or `tsc` or `npx tsc` and identify type errors.
2. Implement fixes for all type errors:
   - Fix all type errors and repeat the process until there are no more type errors.
   - Do not use `any` just to pass the type check.
   - On a second consecutive matching terminal blocker without progress, use ordinary debugger/user escalation before another attempt.
3. Settle writers, use `evc-code-reviewer`, wait for its terminal report, and ask
   the user for approval. Apply authorized fixes and revalidate the type check;
   cap terminal reviews at three, then stop and ask for direction without
   resetting counters. Never use `any` or suppress an error to manufacture a pass.
4. Report actual fixes and validation. Parent owns finalization and neutral
   receipt/uncaptured progress publication under
   `.copilot/evcrate/workflows/plan-progress.md`; sealed paths remain immutable.
