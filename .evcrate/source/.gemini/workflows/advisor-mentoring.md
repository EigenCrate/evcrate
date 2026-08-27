# Advisor Mentoring Contract

Use this contract in implementation commands that accept the optional trailing
`--advice` mode. It is the single semantics source for parsing, checkpoints,
fresh counsel, stuck escalation, and handoffs.

## Argument Mode

1. Inspect raw command arguments before plan, phase, task, or positional
   argument detection.
2. A standalone token is exactly `--advice` delimited by whitespace. Count all
   standalone tokens before deciding the mode. Two or more standalone tokens
   are a deterministic input error; do not continue with normal work.
3. With exactly one standalone token, explicit advice mode is active only when
   that token is final, allowing trailing whitespace. A single non-final token
   remains ordinary input.
4. In explicit mode, remove only the final token, its separator, and trailing
   whitespace. Preserve every other byte in the prefix as `WORK_ARGUMENTS`.
5. With no active mode, `WORK_ARGUMENTS` is the complete raw input unchanged.
   `--advice` alone produces empty `WORK_ARGUMENTS`; continue with the command's
   normal empty-input behavior.
6. The raw-input wrapper exists only for this local parse. Never forward it to a
   scout, researcher, planner, reviewer, advisor, or another command; downstream
   prompts receive `WORK_ARGUMENTS` only.

Deterministic parse shape:

```text
RAW = the unmodified argument string
TOKENS = standalone `--advice` matches with whitespace boundaries
if count(TOKENS) > 1: reject duplicate input and stop
if count(TOKENS) == 1 and match is final after trailing-whitespace removal:
    WORK_ARGUMENTS = RAW prefix before match, with only its separator removed
    ADVICE_MODE = explicit
else:
    WORK_ARGUMENTS = RAW
    ADVICE_MODE = default
```

Do not normalize, re-tokenize, trim internal whitespace, or rewrite any other
prefix/suffix bytes. A non-final standalone token is not a mode request.

Required matrix:

| Raw arguments | Result | `WORK_ARGUMENTS` |
|---|---|---|
| `plan/path --advice` | explicit | `plan/path` |
| `implement abc\n--advice` | explicit | `implement abc` |
| `--advice` | explicit, empty work | empty |
| `abc --advice --advice` | reject duplicate | not evaluated |
| `abc --advice extra` | default | unchanged |
| `abc --advice` + trailing whitespace | explicit | `abc` |
| `"--advice"` | default | unchanged |
| `path--advice` | default | unchanged |
| `--advice.txt` | default | unchanged |
| `--Advice` | default | unchanged |
| `task @advisor` | default | unchanged |
| `task @advisor continue` | default | unchanged |
| `before @advisor after` | default | unchanged |

The exact final `@advisor` token is ordinary work input. It never warns,
normalizes, aliases, or activates counsel.

## Named Counsel Checkpoints

Use only these checkpoint IDs; do not invent a consultation merely because the
flag is present:

- `review:<workflow-step>`: after a terminal `code-reviewer` result and before
  findings are displayed, fixes are made, approval is requested, auto-approval
  occurs, or a final decision uses that review evidence.
- `stuck:<blocker-signature>`: on the second consecutive matching terminal
  blocker with no relevant gate pass or workflow-step advance, before attempt
  three.
- `decision:<workflow-step>`: immediately before an already-existing
  irreversible, security-sensitive, or go/no-go decision when no review call
  covers the same evidence.

Implementation and bootstrap commands must inspect their existing decision
points. For example, before a bootstrap security, deployment, or go/no-go choice
that is irreversible and not covered by terminal review, call one advisor with
`decision:<workflow-step>` and wait for its terminal result. Routine tech-stack,
plan, and design approvals are excluded unless the workflow explicitly marks one
as irreversible, security-sensitive, or go/no-go; do not create extra counsel
calls for ordinary user preferences.

Each consultation is a fresh one-shot checkpoint dispatch. The caller supplies
the checkpoint ID, task or phase, one precise decision question, terminal review
or test evidence, changed paths, constraints, and relevant prior counsel plus
the owner's earlier disposition. Include at most four repository evidence
files; exclude secrets, credentials, broad dumps, and unrelated logs.

The terminal advice report contains: recommendation, must-fix items, cautions,
assumptions or evidence gaps, success checks, and unresolved questions. Advice
is non-binding; the main workflow records material acceptance or rejection.

Enter the dispatcher only after prerequisite evidence is terminal and wait for
its terminal result before any dependent mutation or decision. Reviewer,
native-advisor, and external-adapter calls are sequential, never parallel. A
missing, partial, interrupted, cancelled, timed-out, explicitly rejected model,
or failed delegation leaves the advice gate incomplete. Never silently
downgrade. If an adapter has an existing warned parent-inheritance policy for
an unavailable implicit semantic role, report that inheritance; continue after
an incomplete gate only with explicit workflow-owner acceptance recorded to the
user. This exception applies only to generic non-advisor Pi delegation;
checkpoint routing rejects inherited or unavailable advisor selectors before
child emission.

<!-- EVCRATE_ADVISOR_CHECKPOINT_DISPATCH_START -->
## Canonical checkpoint dispatcher

This is the only route/dispatch contract for named checkpoint mentoring. Scoped
commands reference this block and supply evidence; they do not select a
backend, model, effort, executable, argv, or execution mode.

### `evcrate-advisor-checkpoint/v1` request

After prerequisite evidence is terminal, construct exactly one bounded,
provider-neutral request. The request has exactly these semantic fields:

```json
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "active_host": "codex",
  "checkpoint": "review:step-4",
  "question": "Which safe action should follow this terminal review?",
  "kind": "review",
  "task_or_phase": "Phase 06 canonical checkpoint integration",
  "evidence": {
    "terminal": "bounded reviewer/test result",
    "files": ["path/to/relevant-file.md"]
  },
  "changed_paths": ["path/to/changed-file.md"],
  "prior_counsel": "none",
  "owner_disposition": "none"
}
```

`checkpoint` is exactly one named `review:<workflow-step>`,
`stuck:<blocker-signature>`, or `decision:<workflow-step>` value. `kind` is
exactly `architecture`, `debugging`, `security`, or `review`. `active_host` is
the current harness identity, not a route override. The serialized request is
at most 32 KiB UTF-8; `question` is at most 4 KiB, `task_or_phase` at most 8
KiB, terminal evidence at most 16 KiB, and each text field/path is bounded by
the same total envelope. `evidence.files` contains at most four
repository-relative text paths, and `changed_paths` contains at most sixteen
repository-relative paths. Exclude secrets, credentials, environment values,
policy contents, tool traces, broad dumps, raw stderr, and stacks.

The request contains no `backend`, `model`, `effort`, `execution`, `adapter`,
`executable`, `argv`, fallback, or provider-template field. Route selection is
owned only by the dispatcher and the validated global active-host policy.
The dispatcher entry point receives this envelope as its structured
`checkpoint` value (or its canonical JSON brief). Clearly non-JSON prose remains
available only to the adapter-level compatibility API; malformed or
wrong-protocol JSON-like briefs fail with a typed protocol error before lookup.

The `codex` value in the dispatcher-level example above is illustrative; it is
not a value to copy into another harness. The executable bridge below binds the
actual host from its installed directory.

### Executable harness bridge

Do not satisfy this gate by writing that an advisor was consulted. Invoke the
bridge installed beside the current harness runtime exactly once, from the
repository root:

```bash
node .gemini/scripts/advisor-bridge.cjs <<'JSON'
{
  "operation": "dispatch",
  "checkpoint": {
    "protocol": "evcrate-advisor-checkpoint",
    "version": 1,
    "checkpoint": "review:step-4",
    "question": "Which safe action should follow this terminal review?",
    "kind": "review",
    "task_or_phase": "Current workflow checkpoint",
    "evidence": {"terminal": "Terminal reviewer completed successfully.", "files": []},
    "changed_paths": [],
    "prior_counsel": "none",
    "owner_disposition": "none"
  }
}
JSON
```

If the project does not contain a local harness runtime, use the published
bridge for the active harness instead:

- Claude: `node ~/.claude/scripts/advisor-bridge.cjs`
- Codex: `node ~/.codex/scripts/advisor-bridge.cjs`
- Gemini: `node ~/.gemini/scripts/advisor-bridge.cjs`
- Antigravity: `node ~/.gemini/config/scripts/advisor-bridge.cjs`
- Pi: `node ~/.pi/agent/evcrate/scripts/advisor-bridge.cjs`

The bridge binds `active_host` from its physical harness directory, so the
checkpoint above intentionally omits that field. A caller-supplied host must
match the directory or the bridge fails closed. Generated projections replace
`.gemini/scripts/advisor-bridge.cjs` with their local path (`.codex`, `.gemini`,
`.antigravity`, or Pi's `{{evcrate:scripts/...}}` resource path). The bridge
then maps the protocol's `active_host` to the dispatcher's `activeHost` field
and invokes the projected shared runtime.

For an external-run diagnosis, the coordinator request may add the optional
boolean `debug: true`. The bridge then returns a bounded
`evcrate-advisor-debug/v1` sibling with one fixed record per phase containing
only status, PID, elapsed milliseconds, and termination-wait milliseconds;
normal requests omit it, and native requests cannot enable it.

An external route returns one terminal `result` with `status` equal to
`ADVICE_READY`. An in-process native route invokes the host-owned callback and
returns the same terminal result. The standalone CLI has no callback transport;
it fails closed with `NATIVE_DISPATCH_UNSUPPORTED` before creating a handoff.
The CLI intentionally does not accept a caller-supplied result for resume:
doing so would let the main agent attest its own advice. A library caller that
explicitly enables the two-phase handoff receives
`status: "NATIVE_HANDOFF_PENDING"` and a short-lived token. The handoff record
is owner-only and carries a runtime-keyed integrity tag; changing its
checkpoint or descriptor invalidates the token. A host integration must import
the local bridge and provide the harness-owned callback:

```javascript
const { main, resumeNative } = require('./.gemini/scripts/advisor-bridge.cjs');
const result = await main(requestJson, {
  nativeAdvisor: async ({ checkpoint, descriptor }) => {
    return hostNativeAdvisor({ checkpoint, descriptor });
  }
});
```

`hostNativeAdvisor` must be the current harness's ordinary native subagent
mechanism and must return its terminal structured result; it is not a callback
that the main agent may implement with prose. `resumeNative(token,
hostNativeAdvisor)` is reserved for a real host-owned two-phase integration.
Only an `ADVICE_READY` result completes the gate. Missing JSON, bridge errors,
standalone `NATIVE_DISPATCH_UNSUPPORTED`, a pending handoff without a host
callback, or a result invented by the main agent leaves the gate incomplete.
Never call `advisor-dispatch.cjs` directly for a named checkpoint; it has no
host-native callback boundary.

### Resolve once and choose one branch

Resolve the active host exactly once after the terminal prerequisite exists. A
missing global policy or active-host entry uses the built-in same-host default;
a present malformed or unsupported policy fails closed. Do not merge hosts or
fields, retry resolution, substitute a model/effort, or fall back between
branches.

- **Native descriptor:** require an exact same-backend capability for the
  active host. The host-native coordinator invokes exactly one fresh ordinary
  host-native `advisor` subagent, waits for its terminal result under the
  subagent completion contract, and starts zero CLI processes and zero
  external-adapter processes. The native advisor receives the checkpoint metadata and remains
  read-only, non-binding, and non-recursive.
- **External descriptor:** require an exact cross-host route. Invoke the
  bounded dispatcher/selected built-in adapter exactly once with the validated
  descriptor and request as its brief, then use exactly one validated terminal
  result. The final external process has a shared 15-minute wall-clock limit
  across all five adapters; preflight probes remain adapter-bounded. Do not invoke a native advisor in this branch.

Before either child action, reject recursion and invalid exact capability. Any
resolver, adapter, native, timeout, cancellation, process, protocol, or output
failure returns one stable typed actionable error, leaves the advice gate
incomplete, and starts no alternate route. Raw stderr, HOME, policy text,
credentials, and stacks never enter the result.

### `evcrate-advisor-result/v1` terminal normalization

The external adapter must return a legacy `{ "response": "..." }` result or a
complete `evcrate-advisor-result/v1` object. The dispatcher rejects malformed
results and adds the original checkpoint to legacy results before returning.
Normalize either branch to one terminal result with `protocol` set to
`evcrate-advisor-result`, `version` set to `1`, the original `checkpoint`, and
these fields: `status`, `recommendation`, `must_fix`, `cautions`, `assumptions`,
`success_checks`, and `unresolved_questions`. A compatibility `response`
property may be read by existing callers but is not serialized as a second
protocol. Preserve the existing owner
disposition and human approval gates. Advice is guidance only: it cannot edit,
ask the user, approve, relax policy, grant permissions, dispatch another
advisor, or change the normal workflow order.

Inline `/advise`, its Claude-only interview relay, ordinary `@advisor` input,
and default-mode work that has not reached a named checkpoint do not enter this
dispatcher.
<!-- EVCRATE_ADVISOR_CHECKPOINT_DISPATCH_END -->

## Stuck and Cycle Limits

The blocker signature is workflow step ID; operation, validation command, or
delegated role; terminal status or exit code; and the first stable root-cause
line after ignoring timestamps, request/session IDs, and temporary absolute-path
fragments.

On the first occurrence use normal remediation. On the second matching
occurrence call one `stuck:<blocker-signature>` advisor, apply one bounded
advisor-directed remediation, and retry once. Consult at most once per stuck
episode. Reset when the signature changes, the relevant gate passes, or the
workflow advances. If the same signature returns after that advised retry, stop
and ask the user for direction.

In explicit advice mode, the required `review:` result also satisfies any stuck
consultation for the same gate and blocker occurrence. Never make a duplicate
stuck call there. Allow at most three terminal reviewer/advisor cycles for one
workflow step; a command may impose a lower limit. At the cap, stop and ask the
user instead of starting another reviewer, advisor, fix, or test sequence. Never
reset the cycle counter within the same workflow step. There is no fourth
reviewer or advisor call.

## Cross-Command Handoff

Commands that hand implementation to `/code` or another implementation command
use `WORK_ARGUMENTS`. Append exactly one final `--advice` only when explicit
advice mode is active; otherwise pass no mode token. Never store mode globally or
forward the raw-input wrapper.

## Boundary

The advisor is a normal blocking subagent using the portable `advisor-strategy`
skill. It supplies read-only, non-binding mentorship and receives no new
permissions. The dispatcher owns validated route selection and the single
adapter exception. This contract adds no broker, MCP server, arbitrary
launcher, quota, ledger, audit mechanism, or approval bypass.
