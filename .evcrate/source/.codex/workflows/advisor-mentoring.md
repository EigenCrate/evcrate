# Advisor Mentoring Contract

Use this contract in implementation commands that accept the optional trailing
`@advisor` mode.

## Argument Mode

1. Inspect the raw command arguments before plan, phase, task, or positional
   argument detection.
2. Explicit advisor mode is active only when the final whitespace-delimited
   token is exactly the case-sensitive string `@advisor`; trailing whitespace is
   allowed.
3. In explicit mode, remove only that final token and its separating/trailing
   whitespace. Preserve the remaining input exactly, including earlier
   `@advisor` text. Call the result `WORK_ARGUMENTS`.
4. Otherwise, advisor mode is inactive and `WORK_ARGUMENTS` is the complete raw
   input unchanged.
5. `@advisor` alone produces empty `WORK_ARGUMENTS`; continue with the command's
   normal empty-input behavior.
6. The raw-input wrapper exists only for this local parse. Never forward it to a
   scout, researcher, planner, reviewer, advisor, or another command; downstream
   prompts receive `WORK_ARGUMENTS` only.

Required examples:

| Raw arguments | Mode | `WORK_ARGUMENTS` |
|---|---|---|
| `plan/path @advisor` | explicit | `plan/path` |
| `implement abc` then newline then `@advisor` | explicit | `implement abc` |
| `abc @advisor @advisor` | explicit | `abc @advisor` |
| `abc@advisor` | default | unchanged |
| `abc @advisor extra` | default | unchanged |
| `abc @Advisor` | default | unchanged |

## Explicit Review Mentoring

After every successful terminal `code-reviewer` result in explicit mode:

1. Before displaying, fixing, auto-approving, approving, or making a final
   decision from the review, synchronously delegate exactly one `advisor`
   subagent for that review cycle.
2. Give it the phase or task, the complete reviewer terminal report, compile and
   test evidence, changed-file paths, and one precise review decision question.
   Exclude secrets and unrelated repository content.
3. Wait for its terminal report. Combine its recommendation with the reviewer
   findings, and record why any material recommendation is rejected.
4. A missing, partial, interrupted, cancelled, or failed reviewer/advisor result
   fails the gate. Never fabricate advice or continue from partial output.

Every repeated reviewer cycle receives one new advisor consultation. Never run
the reviewer and advisor in parallel.

## Default Stuck Escalation

In default mode, use normal execution until the same blocker occurs in two
consecutive terminal attempts with no relevant gate passing and no workflow-step
advance between them. Explicit mode uses the same stuck detection outside review
gates.

The blocker signature is:

- workflow step ID;
- operation, validation command, or delegated role;
- terminal status or exit code; and
- first stable root-cause/error line after ignoring timestamps, request/session
  IDs, and temporary absolute-path fragments.

On the first occurrence, use the normal remediation path. On the second matching
occurrence, synchronously call one `advisor` before attempt three. Consult at most
once per stuck episode. Reset the episode when the signature changes, the relevant
gate passes, or the workflow advances. If the same signature returns after the
advisor-directed attempt, stop and ask the user for direction.

At a review gate in explicit mode, the required post-review advisor result also
satisfies any stuck consultation for that same gate and blocker occurrence. Never
make a duplicate stuck call there. If the same blocker returns after the resulting
advisor-directed remediation, stop and ask the user as above.

## Review-Cycle Limit

Allow at most three terminal reviewer/advisor cycles for one workflow step. A
command may impose a lower limit. If issues remain after the last allowed cycle,
stop and ask the user instead of starting another review or advisor call. This is
a hard cap: there is no fourth reviewer or advisor call. Count a cycle only after
the reviewer and, in explicit mode, its required advisor have both returned
terminal results. A fix choice at the cap cannot run another fix/test/reviewer
sequence, and the cycle counter must never be reset within the same workflow step.
Reset the count only when the review gate passes or the workflow advances.

## Cross-Command Handoff

Commands that hand implementation to `/code` must use `WORK_ARGUMENTS` for their
own discovery and planning. When explicit mode is active, append exactly one
trailing `@advisor` to the `/code` handoff; otherwise pass no advisor token. Do not
store mode in global or cross-command session state. The same rule applies to
fallback handoffs between implementation commands: pass `WORK_ARGUMENTS` and
preserve explicit mode exactly once, never the raw-input wrapper.

The exact final token `@advisor` is reserved for this mode. Earlier `@advisor`
text and other `@file`-style mentions remain ordinary work input; a literal final
`@advisor` location is intentionally interpreted as the mode token.

## Boundary

The advisor is a normal blocking subagent using the portable `advisor-strategy`
skill. It supplies non-binding mentorship and receives no new permissions. This
contract adds no broker, MCP server, provider selector, runtime launcher, quota,
ledger, audit mechanism, or approval bypass.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat it as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit (including 180 seconds) for a blocking gate. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial work or silently skip/restart the agent.
- Sequential prompt format: **run one agent; wait for its terminal result; verify the report/artifacts; then run the next agent**.
- Every delegated prompt must define scope, file ownership, expected report/artifact, and validation signal.
- A spawn acknowledgement, progress event, or file change does not mean the agent completed. Completion requires the terminal response and requested validation.
- If the parent runtime ends before completion, preserve the agent identity and report the gate as incomplete; never fabricate a result or launch a replacement.
