# Advisor brief contract

Prepare one concise, decision-oriented brief for one fresh consultation.

## Input

- `checkpoint`: exactly one `review:<workflow-step>`,
  `stuck:<blocker-signature>`, or `decision:<workflow-step>` value.
- `question`: one answerable decision question with relevant constraints.
- `kind`: exactly `architecture`, `debugging`, `security`, or `review`.
- `task_or_phase`: the current work context.
- `evidence`: terminal reviewer or test evidence and at most four
  repository-relative text files.
- `changed_paths`: at most sixteen repository-relative paths.
- `prior_counsel`: relevant earlier advice and the owner's disposition, or
  `none`.

Exclude secrets, credentials, policy contents, environment values, broad
dumps, raw stderr, tool traces, and stacks. Keep the complete JSON object at or
below 32 KiB UTF-8; question is at most 4 KiB, task or phase 8 KiB, and terminal
evidence 16 KiB.

## Checkpoint object

Pass the object directly to `~/.evcrate/bin/evcrate-advisor`. It has exactly
ten fields and no outer operation object:

```json
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "checkpoint": "review:step-4",
  "question": "Which safe action should follow this terminal review?",
  "kind": "review",
  "task_or_phase": "Current phase",
  "evidence": {"terminal": "Bounded terminal result.", "files": []},
  "changed_paths": [],
  "prior_counsel": "none",
  "owner_disposition": "none"
}
```

The controller reads the required global policy, selects one qualified backend,
creates one empty owner-only workspace, runs one final process, and emits one
terminal envelope. Callers do not select or infer a backend, model, effort,
executable, argv, or execution mode.

## Output

A successful outer envelope has `status: "ADVICE_READY"` and a nested
`evcrate-advisor-result/v1` object with the original checkpoint ID,
`recommendation`, `must_fix`, `cautions`, `assumptions`, `success_checks`, and
`unresolved_questions`. The receipt records backend, model, effort, controller
version, adapter version, and elapsed milliseconds.

A failed, partial, malformed, interrupted, cancelled, timed-out, unavailable,
or nonzero invocation leaves the advice gate incomplete. Never invent a result
or continue a dependent mutation as if counsel was received. Advice is
non-binding; the caller retains mutation, approval, and final decision
authority.
