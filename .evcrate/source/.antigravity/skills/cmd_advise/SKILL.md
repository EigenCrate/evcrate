---
name: cmd_advise
description: Interview-first technical advice with native inline questioning and explicit relay rejection
---
# cmd_advise

Command Path: /advise

Description: Interview-first technical advice with native inline questioning and explicit relay rejection

<!-- generated target: antigravity -->
<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->
<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->
<!-- EVCRATE_CAPABILITY: advise-agent-relay/unsupported/antigravity/v1 -->
<!-- EVCRATE_CAPABILITY_ERROR: ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY -->
<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->

Use this command for candid technical or architectural advice. `/advise` is
separate from `--advice` checkpoint mentorship: it first converges on the
problem, then provides advice.

## Parse input

Count exact, case-sensitive, whitespace-delimited standalone `--agent` tokens.
Reject two or more tokens. One token requests relay only when it is final after
trailing whitespace; quoted, embedded, suffixed, non-final, and differently
cased text remains ordinary input. If a final token requests relay, return
`ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` and say: `Run /advise <prompt> without --agent for inline
advice.` Do not invoke an advisor, create relay
state, or silently continue in inline mode.

## Inline interview

Run in the main session. Do not invoke a subagent or create persistent state.

1. Analyze only bounded local context relevant to the prompt or URL.
2. Ask exactly one concise substantive question per turn using `ask_user`.
   Never batch questions or infer an answer. Stop after eight discovery questions.
3. Present one `reframe` and require explicit `confirm` or `correct`. Permit
   at most two confirmation/correction cycles. On exhaustion, return
   `INTERVIEW_NOT_CONVERGED` and write no report.
4. After confirmation, write a concise Markdown report with exactly these
   headings: `## Reframed problem`, `## Recommendation`,
   `## Alternatives/tradeoffs`, `## Risks`, `## Assumptions/evidence gaps`,
   `## Success checks`, `## Next actions`, and `## Unresolved questions`.
5. Write the sanitized report to the active `<plan>/reports` directory, or
   `plans/reports` when there is no active plan. Never include credentials,
   environment values, tool traces, fetched page bodies, or model reasoning.
