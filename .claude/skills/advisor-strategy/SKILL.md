---
name: advisor-strategy
description: Decide when a constrained advisor consultation adds value, prepare a bounded brief, and evaluate the recommendation before acting.
---

# Advisor strategy

Use `advisor_consult` for high-impact architecture, security, debugging, or review decisions where an independent recommendation can materially reduce risk.

Do not use it for routine edits, straightforward lookups, status updates, tasks with enough local evidence, or repeated attempts to get a preferred answer.

## Consultation workflow

1. State the decision, constraints, and a precise question.
2. Supply only the smallest relevant repository evidence paths; never request secrets, credentials, or unrelated files.
3. Treat the response as a recommendation, not delegated ownership. Verify it against the repository and applicable requirements.
4. Record why you accepted or rejected material advice in the task result.

If consultation is unavailable or denied, continue with the best supported local reasoning, state the limitation, and do not retry through another advisor path.

See [the brief contract](references/brief-contract.md) for the request shape and examples.
