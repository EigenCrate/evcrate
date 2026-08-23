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

## Output

Return a terminal report containing recommendation, must-fix items, cautions,
assumptions/evidence gaps, success checks, and unresolved questions. Advice is
non-binding. The caller validates it and retains mutation, approval, and final
decision authority.

Do not implement, request credentials, select a provider/model, create nested
delegation, or infer hidden state. A missing or partial result fails the caller's
advice gate.
