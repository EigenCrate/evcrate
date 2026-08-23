# Advisory Interview Contract

This is the single semantics source for `/advise`. It is separate from
`advisor-mentoring.md`: `--advice` is checkpoint counsel, while `/advise` is an
interview that must first converge on the user's problem.

## Capability

<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->
<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->
<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->
<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->

```text
EVCRATE_CAPABILITY=advise-inline/v1
EVCRATE_CAPABILITY=advise-agent-relay/claude/v1
```

The second marker is a Claude-only capability claim. Generated targets must
replace it with their tested capability or an explicit unsupported result;
presence of a generated file is never runtime proof.

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
| `design a cache --agent` | Claude relay | `design a cache` |
| `design a cache --agent ` | Claude relay | `design a cache` |
| `--agent` | Claude relay, empty prompt | empty; normal empty-input handling |
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

Inline mode keeps the active conversation in the main session. Relay mode
persists only the bounded, sanitized invocation state through
`scripts/advise-state.cjs`. Both modes ask exactly one question per turn.

The helper exposes the executable `parse`, `validate-envelope`, `write-report`,
and `validate-report` operations in addition to state lifecycle operations.
Commands must call those operations; prose is not a substitute for validation.

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

## Relay turn envelope

Every relay advisor turn returns exactly one JSON object and no prose:

```json
{
  "protocol": "evcrate-advise-relay",
  "version": 1,
  "status": "NEEDS_USER_INPUT",
  "invocationId": "uuid",
  "statePath": "/tmp/ck/advice/v1/<project-key>/<invocation-id>/state.json",
  "question": {
    "id": "q-01",
    "type": "discovery",
    "text": "What constraint matters most?"
  }
}
```

`NEEDS_USER_INPUT` has one question only. The main session validates protocol,
version, status, invocation ID, state containment, question ID/type, and exact
one-question shape; when no question is pending it persists that validated
question with `ask`; then it asks the user, sanitizes/persists one answer, and
starts a fresh advisor turn.

The terminal ready envelope is:

```json
{
  "protocol": "evcrate-advise-relay",
  "version": 1,
  "status": "ADVICE_READY",
  "invocationId": "uuid",
  "reportPath": "plans/reports/advise-YYYYMMDD-HHMM-<invocation>.md",
  "summary": "bounded summary"
}
```

No pending question may coexist with `ADVICE_READY`. The main session is the
report writer: it assembles the bounded report from persisted interview context,
relevant evidence, and the advisor summary, calls `write-report`, then validates
the report path, schema, and existence before showing or linking it.
Malformed, duplicated, partial, cancelled, or terminally failed relay output
stops the command and retains state.

## State schema and retention

The helper creates `${TMPDIR:-/tmp}/ck/advice/v1/<project-key>/<invocation-id>/`.
The project key is the sanitized project basename plus `-` and the first 12
hex characters of SHA-256(realpath(project root)); raw paths never enter state.
The invocation ID is a UUID. The directory is `0700`, `state.json` is `0600`,
and writes use an owner-only temporary file followed by an atomic rename.

Schema is `evcrate-advise-state/v1`; serialized state is at most 64 KiB. It
contains only schema/version, project and invocation IDs, timestamps, phase,
status, sanitized original input, ordered question/answer entries, optional
reframe, one optional pending question, repository-relative report path, and
the last failure code. Reject symlinks, traversal, unknown fields, malformed or
stale state, cross-project resumes, replayed answers, and multiple pending
questions. Never persist fetched bodies, credentials, environment values, tool
traces, or model reasoning.

Paused/failed state is retained seven days and lazily cleaned at relay start.
`ADVICE_READY` replaces `state.json` with a minimal `tombstone.json` containing
IDs, completion time, and report path (no answers), retained 24 hours. There is
no cleanup daemon and cleanup never escapes the validated invocation root.

## Final report

Write the same sanitized Markdown to the active `<plan>/reports` directory when
an explicitly active plan exists; otherwise use `plans/reports`. The helper
accepts only `plans/reports` or a `plans/<plan>/reports` directory, anchored to
the resolved repository root. The filename is `advise-YYYYMMDD-HHMM-<invocation>.md`.
The report contains exactly these
sections: reframed problem, recommendation, alternatives/tradeoffs, risks,
assumptions/evidence gaps, success checks, next actions, and unresolved
questions. The inline response links the repository-relative report path.
