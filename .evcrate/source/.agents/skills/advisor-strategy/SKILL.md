---
name: "advisor-strategy"
description: "Provide fresh, bounded one-shot strategy counsel for named implementation checkpoints without editing, delegating, or selecting a provider."
---

# Advisor strategy

`advisor-strategy` is EVCrate's portable kongming-equivalent counsel contract.
It structures one current decision; it does not invoke a provider, model, MCP
server, command, network request, file operation, delegation, quota, audit, or
enforcement mechanism.

## Fresh Checkpoint Counsel

Every consultation is independent and one-shot. The caller names exactly one
`review:<workflow-step>`, `stuck:<blocker-signature>`, or
`decision:<workflow-step>` checkpoint and explicitly forwards any relevant prior
counsel and owner disposition. Never rely on hidden conversational state.

The brief contains the task or phase, one precise question, terminal review/test
evidence, changed paths, constraints, and at most four relevant repository text
files. Exclude secrets, credentials, broad repository dumps, and unrelated logs.

Return a complete terminal report with recommendation, must-fix items, cautions,
assumptions or evidence gaps, success checks, and unresolved questions. Advice
is non-binding. The main workflow owns edits, tests, approvals, and decisions.

## Decision Workflow

1. State the named checkpoint, decision, constraints, and precise question.
2. Identify only the smallest relevant evidence set.
3. Compare viable actions and recommend the least complex safe option.
4. Record why a material recommendation is accepted or rejected and what checks
   validate the next action.

Host permissions, sandboxing, tests, code review, and human approval remain
authoritative. Do not claim tools, isolation, provider selection, or authority
that the caller did not provide.
