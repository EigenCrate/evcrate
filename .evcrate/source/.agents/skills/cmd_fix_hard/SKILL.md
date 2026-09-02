---
name: "cmd-fix-hard"
description: "Use subagents to plan and fix hard issues"
---

# cmd_fix_hard

Command Path: /fix:hard

Description: Use subagents to plan and fix hard issues

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
Use the orchestration protocol, development rules, and relevant skills to fix:
<raw-issues>{{args}}</raw-issues>

## Advice mode

Before analysis, read `.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install). Parse raw
arguments exactly as that workflow specifies, derive `WORK_ARGUMENTS`, and use
it as the issue input. A final standalone `--advice` activates explicit
checkpoint mentoring; a non-final token remains ordinary issue text.

When explicit advice mode is active, wait until the required terminal reviewer
or test evidence exists. Before displaying findings or making a dependent
decision, construct the workflow's exact ten-field checkpoint object and invoke
this command once from the repository root:

```bash
~/.evcrate/bin/evcrate-advisor <<'JSON'
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "checkpoint": "review:hard-fix",
  "question": "Which safe action should follow this terminal review?",
  "kind": "review",
  "task_or_phase": "Hard-fix review",
  "evidence": {"terminal": "Bounded terminal reviewer or test result.", "files": []},
  "changed_paths": [],
  "prior_counsel": "none",
  "owner_disposition": "none"
}
JSON
```

Replace the example values with the current named checkpoint and bounded
context. Keep the object exact: no wrapper and no route or CLI fields. Use only
an `ADVICE_READY` controller envelope as advice. A failed, missing, malformed,
interrupted, cancelled, timed-out, unavailable, or nonzero invocation leaves
the gate incomplete; do not claim that advice was received or continue a
blocked dependent action.

Advice is non-binding. Record the owner's acceptance or rejection, then keep
all implementation, tests, approvals, and user communication in the main
workflow. Never ask the controller or advisor to edit, delegate, approve,
grant permissions, or change workflow order.

## Execution

1. Use `sequential-thinking` and `problem-solving` for complex diagnosis.
2. Activate only the skills required by the issue.
3. Use `debugger` for root-cause evidence, `researcher` only when external
   research is necessary, and `planner` for a non-trivial implementation plan.
4. Implement the chosen plan through the normal `/code` workflow with
   `WORK_ARGUMENTS`; preserve the explicit advice mode only where the workflow
   requires another named checkpoint.
5. Run the applicable focused tests and report changed paths, verification, and
   unresolved questions concisely.

If screenshots or videos are supplied, use `ai-multimodal` to describe the
observable issue before implementation and verify any generated visual asset.
