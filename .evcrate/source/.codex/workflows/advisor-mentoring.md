# Advisor Mentoring Contract

Use this contract only when an implementation workflow reaches a named
checkpoint. It defines argument parsing, bounded evidence, one controller call,
and the owner disposition gate.

## Argument mode

1. Inspect raw command arguments before interpreting plan, phase, task, or
   positional input.
2. A standalone token is exactly `--advice` delimited by whitespace. Count all
   standalone tokens first. Two or more tokens are a deterministic input error;
   stop normal work.
3. With exactly one token, explicit advice mode is active only when the token is
   final after trailing whitespace. A non-final token is ordinary input.
4. In explicit mode remove only the final token, its separator, and trailing
   whitespace. Preserve every other byte as `WORK_ARGUMENTS`.
5. With no active mode, `WORK_ARGUMENTS` is the complete raw input unchanged.
   `--advice` alone produces empty work input and follows normal empty-input
   handling.
6. The raw wrapper is local parsing only. Downstream prompts receive
   `WORK_ARGUMENTS`; never forward the wrapper itself.

```text
RAW = the unmodified argument string
TOKENS = standalone `--advice` matches with whitespace boundaries
if count(TOKENS) > 1: reject and stop
if count(TOKENS) == 1 and the match is final after trailing-whitespace removal:
    WORK_ARGUMENTS = RAW prefix before the match, with only its separator removed
    ADVICE_MODE = explicit
else:
    WORK_ARGUMENTS = RAW
    ADVICE_MODE = default
```

Do not normalize, re-tokenize, trim internal whitespace, or rewrite any other
prefix or suffix bytes. The exact final `@advisor` token is ordinary work input.

## Named checkpoints

Use only these checkpoint IDs:

- `review:<workflow-step>`: after terminal reviewer evidence and before the
  findings are displayed, fixes are made, approval is requested, or a final
  decision uses that evidence.
- `stuck:<blocker-signature>`: on the second consecutive matching terminal
  blocker with no relevant gate pass or workflow-step advance, before attempt
  three.
- `decision:<workflow-step>`: immediately before an existing irreversible,
  security-sensitive, or go/no-go decision not already covered by review.

Routine planning, implementation, and preference choices do not create a
checkpoint. The caller supplies one precise question, terminal evidence,
changed paths, relevant prior counsel, and the owner's earlier disposition.
Include at most four repository-relative evidence files and sixteen changed
paths. Exclude secrets, credentials, policy contents, raw stderr, stacks,
traces, broad dumps, and unrelated logs.

## Central controller call

After prerequisite evidence is terminal, construct exactly one JSON object with
exactly these ten fields. Do not add an operation wrapper, host, backend, model,
effort, executable, argv, adapter, or execution field.

```json
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "checkpoint": "review:step-4",
  "question": "Which safe action should follow this terminal review?",
  "kind": "review",
  "task_or_phase": "Phase 06 checkpoint integration",
  "evidence": {
    "terminal": "Bounded reviewer and test result.",
    "files": ["path/to/relevant-file.md"]
  },
  "changed_paths": ["path/to/changed-file.md"],
  "prior_counsel": "none",
  "owner_disposition": "none"
}
```

Invoke the installed controller exactly once from the repository root:

```bash
~/.evcrate/bin/evcrate-advisor <<'JSON'
{
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
JSON
```

The controller reads the required global policy from
`~/.evcrate/advisor-routing.json`, creates one empty owner-only workspace, runs
one selected qualified CLI, and emits one controller envelope. The caller does
not choose or infer the selected CLI. The controller owns process bounds,
credential-safe environment, cancellation, and cleanup.

Only a successful terminal envelope completes the advice gate. Its outer
`status` is `ADVICE_READY`; its `receipt` records the selected backend, model,
effort, controller version, adapter version, and elapsed time; its `result` has
protocol `evcrate-advisor-result`, version `1`, the original checkpoint ID,
and recommendation, must-fix items, cautions, assumptions, success checks, and
unresolved questions. Any `FAILED` envelope, missing output, malformed output,
interruption, cancellation, timeout, invalid policy, unavailable CLI, or
nonzero controller exit leaves the gate incomplete. Never invent a result or
continue as if counsel was received.

Advice is non-binding. The main workflow records material acceptance or
rejection in `owner_disposition`, performs all edits and tests, and retains
approval authority. The controller and advisor cannot edit files, ask the user,
approve changes, grant permissions, dispatch another advisor, or alter workflow
order.

## Stuck and cycle limits

The blocker signature is workflow step ID, operation or validation command,
delegated role, terminal status or exit code, and the first stable root-cause
line after removing timestamps, request IDs, and temporary absolute paths.

On the first occurrence use normal remediation. On the second matching
occurrence call one `stuck:<blocker-signature>` checkpoint, apply one bounded
remediation, and retry once. Consult at most once per episode. Reset when the
signature changes, the relevant gate passes, or the workflow advances. If the
same signature returns after that retry, stop and ask the user for direction.
