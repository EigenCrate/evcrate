---
description: Interview-first technical advice with optional Claude relay
argument-hint: [prompt-or-url] [--agent]
---

<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->
<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->

Use this command for a candid technical or architectural advice report. It is
separate from `--advice` checkpoint mentorship: `/advise` first makes sure the
problem is understood, then advises. The main session owns every user-facing
question and the final report.

## Step 0: Parse the raw input

Keep the raw `$ARGUMENTS` string until parsing is complete. Count exact,
case-sensitive, whitespace-delimited standalone `--agent` tokens. A token is
standalone only when whitespace or the input boundary surrounds it. Reject two
or more tokens before doing any work. With exactly one token, relay mode is
active only when it is final after trailing whitespace; remove only that token,
its separator, and trailing whitespace from the prompt. Preserve all other
bytes in `WORK_ARGUMENTS`.

Use the executable parser owned by the state helper before any analysis:

```bash
node .claude/scripts/advise-state.cjs '{"operation":"parse","raw":"<raw arguments>"}'
```

Treat `DUPLICATE_AGENT` as a terminal input error. Do not reproduce this parser
in command prose, split arguments in a shell, or forward the raw wrapper.

Required parse behavior:

| Input | Result |
| --- | --- |
| `design a cache --agent` | Claude relay, prompt `design a cache` |
| `design a cache --agent ` | Claude relay, prompt `design a cache` |
| `--agent` | Claude relay with empty prompt; apply normal empty-input handling |
| `a --agent --agent` | reject duplicate input |
| `a --agent later` | inline, unchanged |
| `"--agent"`, `path--agent`, `--Agent` | inline, unchanged |

Do not re-tokenize, normalize, or pass the raw wrapper to an advisor. For
non-relay input, `WORK_ARGUMENTS` is the complete original string.

## Inline mode (default)

Run in the main session. Do not invoke a subagent and do not create relay
state.

1. Analyze the prompt or URL. Read only bounded local context relevant to the
   question; scout when a concrete evidence gap blocks a useful answer.
2. Ask exactly one concise substantive question per turn. Never batch questions
   or infer an answer. Stop discovery after eight substantive questions.
3. Present one concise reframed problem statement. Ask the user explicitly to
   `confirm` or `correct`; a non-answer is not confirmation. Allow at most two
   reframe confirmation/correction cycles. If the cap is reached without
   confirmation, say `INTERVIEW_NOT_CONVERGED`, retain any user-visible
   conversation context, and write no advice report.
4. After explicit confirmation, write a candid report with these Markdown
   section headings: `## Reframed problem`, `## Recommendation`,
   `## Alternatives/tradeoffs`, `## Risks`, `## Assumptions/evidence gaps`,
   `## Success checks`, `## Next actions`, and `## Unresolved questions`.
5. Sanitize and write the report through the helper's `write-report` operation,
   then run `validate-report` before presenting it. Write the identical Markdown
   to the active `<plan>/reports` directory only when an explicitly active plan
   exists; otherwise write `plans/reports`. Use
   `advise-YYYYMMDD-HHMM-<uuid>.md` (a fresh UUID for inline mode) and link the
   repository-relative path in the response. Do not include fetched page
   bodies, credentials,
   environment values, tool traces, or model reasoning.

## Claude relay mode

The following capability block is authoritative for this canonical target:

```text
capability: advise-agent-relay/claude/v1
state-helper: .claude/scripts/advise-state.cjs
```

Only this Claude command may use `--agent` in Phase 03. Initialize the
invocation through `advise-state.cjs`; its helper owns the runtime path,
schema, sanitization, permissions, atomic writes, retention, and tombstone.
Do not implement a second state format in this command.

1. Run lazy cleanup, then initialize or read the invocation state. Resolve the
   project root and state path through the helper; never put the raw project
   path in prompts or state.
2. Delegate the existing `advisor` agent in explicit `interview-relay/v1`
   mode. Supply only bounded original input, state, the current evidence gap,
   and relevant prior answers. The advisor must not activate checkpoint mode
   implicitly, edit files, ask the user, delegate again, choose a provider, or
   keep hidden state.
3. Require exactly one terminal JSON envelope and no surrounding prose. Pass it
   to the helper's `validate-envelope` operation; reject protocol/version,
   invocation ID, state-path containment, schema, question, or report-field
   failures before any next action.
4. For `NEEDS_USER_INPUT`, require exactly one question with a unique ID and
   type `discovery` or `confirm_reframe`. If the validated envelope introduces
   a question while no question is pending, persist it with the helper's `ask`
   operation before asking the user. For `confirm_reframe`, supply the concise
   reframe from the bounded relay context to `ask`; the helper rejects a
   missing reframe. Ask that one question in the main session, pass only the
   answer to the helper, and start one fresh advisor turn. For a confirmation
   question, pass `phase: confirm_reframe` only when the user explicitly
   confirms; for a correction, pass `phase: discovery` and the corrected
   reframe. Discovery answers stay in `discovery`. Never send two answers or
   two questions in one turn.
5. For `ADVICE_READY`, require no pending question, an answered confirmation,
   a repository-relative
   report path, and a bounded summary. Run `validate-report` to verify the
   existing report, required headings, containment, ownership, and redaction.
   Before validation, the main session (the report writer) must assemble a
   bounded sanitized Markdown report from the persisted reframe, bounded
   interview answers, relevant evidence, and the advisor summary, using exactly
   the eight required `##` sections, and call `write-report` with the envelope
   path. The advisor cannot write the report. Then validate it, show/link it,
   and atomically complete the helper so it creates the 24-hour tombstone.
6. On cancellation, parent/advisor interruption, unavailable model, malformed
   or duplicate envelope, state mismatch, stale/replayed answer, invalid
   report, or incomplete terminal result, fail closed with the exact failure
   code, retain paused/failed state for seven days, and stop. Never silently
   downgrade to inline mode, fabricate an answer, or retry an unbounded relay.

Use the hard interview caps and report schema in
`.claude/workflows/advisory-interview.md`; it is the shared contract for this
command and the `advisor` agent.
