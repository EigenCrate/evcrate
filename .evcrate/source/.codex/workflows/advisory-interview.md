# Advisory Interview Contract

This is the single semantics source for `/advise`. It is separate from
`advisor-mentoring.md`: `--advice` is checkpoint counsel, while `/advise` is an
interview that must first converge on the user's problem.

## Capability

<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->
<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->
<!-- EVCRATE_CAPABILITY: advise-agent-relay/unsupported/codex/v1 -->
<!-- EVCRATE_CAPABILITY_ERROR: ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX -->
<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->

```text
EVCRATE_CAPABILITY=advise-inline/v1
EVCRATE_CAPABILITY=advise-agent-relay/unsupported/codex/v1
```

The second marker records this target's explicit `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` relay rejection.
Generated-file presence is never runtime proof.

## Input parsing

Inspect the raw argument string before analysis. Count exact, case-sensitive,
whitespace-delimited `--agent` tokens. More than one is a deterministic input
error. Exactly one activates relay mode only when it is the final token after
trailing whitespace is removed. Remove only that token and its separator from
the prompt. Preserve every other byte. Quoted, embedded, suffixed, non-final,
or differently cased forms remain ordinary prompt text.

Examples:

| Raw input | Mode | Prompt |
| --- | --- | --- |
| `design a cache --agent` | `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` | no inline interview |
| `design a cache --agent ` | `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` | no inline interview |
| `--agent` | `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` | no inline interview |
| `a --agent --agent` | reject | not evaluated |
| `a --agent later` | inline | unchanged |
| `"--agent"` | inline | unchanged |
| `path--agent` | inline | unchanged |
| `--Agent` | inline | unchanged |

## Interview state machine

```text
START -> DISCOVERY -> CONFIRM_REFRAME -> READY -> REPORT
                           \-> DISCOVERY (correction, at most twice)
any active phase -> FAILED/PAUSED (retain state)
```

Inline mode keeps the active conversation in the main session and asks exactly
one question per turn. No relay state is created on this target.

- Ask at most eight substantive `discovery` questions.
- Present one `reframe` and require explicit `confirm` or `correct`.
- Allow at most two `confirm_reframe` cycles. Do not infer confirmation.
- On the cap, return `INTERVIEW_NOT_CONVERGED`, retain state, and write no
  advice report.
- Cancellation, interruption, unavailable model, malformed envelope, stale
  state, replayed answer, or report-validation failure is fail-closed. A relay
  request never silently becomes inline.

Allowed transitions are strict:

| Current | Operation | Next |
| --- | --- | --- |
| discovery | ask discovery | discovery with one pending question |
| discovery | answer discovery | discovery |
| discovery | ask confirm_reframe | confirm_reframe only after answered discovery and a non-empty reframe |
| confirm_reframe | answer correction (`phase: discovery`) | discovery |
| confirm_reframe | explicit confirmation (`phase: confirm_reframe`) | complete through `complete` only |
| any active | fail/pause | failed |

Completion requires `confirm_reframe`, a non-empty persisted reframe, an
answered confirmation question, no pending question, a validated report, and
an atomic tombstone transition. Discovery answers cannot enter confirmation
directly. A first `confirm_reframe` question, a correction without returning to
discovery, or a completion without confirmation is rejected.

The state helper owns path containment, schema, redaction, bounds, atomicity,
permissions, retention, and tombstones. Command and agent prose must not
reimplement those rules.

## Unsupported relay

A final standalone `--agent` returns `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` before advisor delegation, state creation, or inline-interview work. Users can run `/advise <prompt>` for inline advice.

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
