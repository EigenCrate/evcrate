---
name: "evcrate-advisor-strategy"
description: "Provide fresh bounded strategy counsel for named implementation checkpoints without editing or delegating."
---


# Advisor strategy

Structure one current decision. This skill does not edit files, ask the user,
delegate, select a provider, invoke a CLI, access a network, or grant
permissions.

## Fresh checkpoint counsel

Every consultation is independent and one-shot. Name exactly one
`review:<workflow-step>`, `stuck:<blocker-signature>`, or
`decision:<workflow-step>` checkpoint. Forward relevant prior counsel and the
owner disposition explicitly; never rely on hidden conversation state.

The caller supplies one precise question, task or phase, terminal review or
test evidence, changed paths, constraints, and at most four relevant
repository-relative text files. Keep all values bounded. Exclude secrets,
credentials, policy contents, broad repository dumps, raw stderr, stacks,
and unrelated logs.

Use the exact ten-field `evcrate-advisor-checkpoint/v1` object from the shared
mentoring workflow. It contains no route, CLI, provider, model, effort,
executable, argv, or execution override. The installed central controller owns
policy validation, selection, process isolation, and terminal normalization.

The workflow sends this object directly to `~/.evcrate/bin/evcrate-advisor`; this skill itself does not invoke the controller.

Return a complete terminal report with a recommendation, must-fix items,
cautions, assumptions or evidence gaps, success checks, and unresolved
questions. Advice is non-binding. The main workflow owns edits, tests,
approvals, and decisions.

## Decision workflow

1. State the named checkpoint, decision, constraints, and precise question.
2. Select only the smallest relevant evidence set.
3. Compare viable actions and recommend the least complex safe option.
4. Record why a material recommendation is accepted or rejected and which
   observable checks validate the next action.

Do not implement, request credentials, perform nested counsel, infer hidden
state, or claim authority the caller did not provide.
