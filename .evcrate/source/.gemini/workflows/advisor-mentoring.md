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

Each consultation is a fresh one-shot `advisor` call. The caller supplies the
checkpoint ID, task or phase, one precise decision question, terminal review or
test evidence, changed paths, constraints, and relevant prior counsel plus the
owner's earlier disposition. Include at most four repository evidence files;
exclude secrets, credentials, broad dumps, and unrelated logs.

The terminal advice report contains: recommendation, must-fix items, cautions,
assumptions or evidence gaps, success checks, and unresolved questions. Advice
is non-binding; the main workflow records material acceptance or rejection.

Call the advisor only after its prerequisite evidence is terminal and wait for
the terminal result before any dependent mutation or decision. Reviewer and
advisor calls are sequential, never parallel. A missing, partial, interrupted,
cancelled, timed-out, explicitly rejected model, or failed delegation leaves
the advice gate incomplete. Never silently downgrade. If an adapter has an
existing warned parent-inheritance policy for an unavailable implicit semantic
role, report that inheritance; continue after an incomplete gate only with
explicit workflow-owner acceptance recorded to the user.

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
permissions. This contract adds no broker, MCP server, provider selector,
runtime launcher, quota, ledger, audit mechanism, or approval bypass.
