---
name: cmd-fix-x-types
description: Fix type errors
user-invocable: true
disable-model-invocation: true
argument-hint: "[options]"
---

<raw-options>$ARGUMENTS</raw-options>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
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
   `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install); sealed paths remain immutable.
