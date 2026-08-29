# Advisor brief contract

Prepare one concise, decision-oriented brief for one fresh consultation.

## Input

- `checkpoint`: exactly one `review:<workflow-step>`,
  `stuck:<blocker-signature>`, or `decision:<workflow-step>`.
- `question`: one answerable decision question with relevant constraints.
- `kind`: one of `architecture`, `debugging`, `security`, or `review`.
- `task_or_phase`: the current work context.
- `evidence`: terminal reviewer/test evidence and at most four repository-relative
  text files; exclude secrets, credentials, broad dumps, and unrelated logs.
- `changed_paths`: files changed by the current workflow step.
- `prior_counsel`: relevant earlier advice and the owner's acceptance/rejection,
  copied explicitly; use `none` when there is none.

## Checkpoint/v1 envelope

The workflow wraps the brief as one `evcrate-advisor-checkpoint/v1` envelope:

```json
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "active_host": "codex",
  "checkpoint": "review:step-4",
  "question": "one precise question",
  "kind": "review",
  "task_or_phase": "current phase",
  "evidence": {"terminal": "bounded result", "files": []},
  "changed_paths": [],
  "prior_counsel": "none",
  "owner_disposition": "none"
}
```

The envelope is at most 32 KiB UTF-8. It allows at most four
repository-relative evidence files and sixteen changed paths. Question,
task/phase, terminal evidence, counsel, and path values are bounded by the
total envelope. It contains no backend, model, effort, execution, adapter,
executable, argv, fallback, or provider-template field; the dispatcher owns
route selection. Do not include secrets, credentials, environment values,
policy contents, tool traces, broad dumps, raw stderr, or stacks.
Pass the envelope through the dispatcher's structured checkpoint input (or its
canonical JSON brief). Clearly non-JSON prose is retained only for the
adapter-level compatibility API; malformed or wrong-protocol JSON-like briefs
fail closed before adapter lookup.

## Output

Return a terminal report containing recommendation, must-fix items, cautions,
assumptions/evidence gaps, success checks, and unresolved questions. Advice is
non-binding. The caller validates it and retains mutation, approval, and final
decision authority.

The dispatcher normalizes native and external terminal reports to
`evcrate-advisor-result/v1` with `status`, `recommendation`, `must_fix`,
`cautions`, `assumptions`, `success_checks`, and `unresolved_questions`.
Normalization does not add a retry, fallback, route substitution, permission,
or approval capability.

Do not implement, request credentials, select a provider/model, create nested
delegation, or infer hidden state. A missing or partial result fails the caller's
advice gate.
