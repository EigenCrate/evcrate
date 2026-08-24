---
title: "Advisor Supervision and Interview Workflows"
description: "Replace @advisor with one-shot --advice checkpoints, add /advise interviews, and release capability-accurate Claude, Codex, Pi, Gemini, and Antigravity projections."
status: completed
priority: P1
effort: 32h
branch: main
tags: [feature, agents, commands, distribution, advisory-supervision]
created: 2026-08-23
---

# Advisor Supervision and Interview Workflows

## Overview

Preserve the completed `@advisor` implementation as Phase 01 history, then replace its active syntax and architecture. Exact final `--advice` requests fresh one-shot `advisor-strategy` counsel at named implementation checkpoints. Separate `/advise` performs an inline-first interview; only Claude supports the v1 `--agent` relay. Canonical edits stay in `.evcrate/source/.claude`; adapters generate every other target.

Phase 02 implementation and review completed on 2026-08-23 22:27:03 +0700; its two approved non-blocking follow-ups were closed on 2026-08-23 23:00:08 +0700. The duplicate step numbering in `.evcrate/source/.claude/commands/fix/test.md` was corrected, and the Codex distribution assertion now runs the Gemini migrator into a fresh temporary output root before checking generated commands. Reviewer-reported validation: focused 50/50; `npm test`: 146 Python + 46 Node. Phase 03 implementation and review completed on 2026-08-24. Phase 04 implementation and review completed on 2026-08-24 03:27:24 +0700; Phase 05 implementation, release gates, and review completed on 2026-08-24 07:01:11 +0700. Generated Codex, Pi, Gemini, and Antigravity target trees now include capability-accurate checkpoint and inline-advisory surfaces with explicit relay rejection. Focused Python validation passed (122 tests), full project validation reported by review passed (155 Python + 46 Node), Pi runtime tests passed (21/21), generated help checks passed for all four targets, and deterministic build/check plus `git diff --check` passed.

## Phases

| # | Phase | Status | Effort | Progress | Link |
|---|---|---|---:|---:|---|
| 1 | Historical `@advisor` command mode | Completed | 8h | 100% | [phase-01](./phase-01-implement-advisor-command-mode.md) |
| 2 | Canonical one-shot `--advice` supervision | Completed | 7h | 100% | [phase-02](./phase-02-replace-advisor-mode-with-advice-checkpoints.md) |
| 3 | `/advise` interview and Claude relay | Completed | 7h | 100% | [phase-03](./phase-03-add-advise-interview-and-claude-agent-relay.md) |
| 4 | Codex, Pi, Gemini, and Antigravity rollout | Completed | 7h | 100% | [phase-04](./phase-04-roll-out-advisory-capabilities-to-generated-targets.md) |
| 5 | Migration docs and release gates | Completed | 3h | 100% | [phase-05](./phase-05-document-migration-and-run-release-gates.md) |

## Dependencies

- Phase 01 remains immutable historical baseline; Phases 02-05 supersede its active syntax.
- Phase 02 precedes Phase 03; both precede adapter regeneration in Phase 04; Phase 05 validates the completed tree.
- Canonical source: `.evcrate/source/.claude`; generated `.codex`, `.agents`, `.pi`, `.gemini`, and `.antigravity` files are never hand-edited.
- Existing normal high-tier `advisor` delegation, `advisor-strategy`, blocking completion contract, distribution manifests, and Pi structured delegation remain foundations.

## Architecture Decisions

- Accept only one exact case-sensitive final standalone `--advice`; duplicate standalone flags reject. `@advisor` has no active alias and remains ordinary work input, including when final.
- `advisor-strategy` is EVCrate's kongming-equivalent one-shot contract. Each consultation is fresh; callers forward relevant prior counsel. Main workflow alone edits, tests, approves, and decides.
- Keep hard review-cycle cap, deterministic blocker signature/stuck dedup, bounded evidence, fail-closed model/delegation handling, and no duplicate consultation at one checkpoint.
- `/advise` is separate: inline by default, one question at a time, explicit problem-reframe confirmation, then candid final advice/report.
- Claude-only `--agent` uses versioned invocation state and exact `NEEDS_USER_INPUT`/`ADVICE_READY` envelopes. Codex, Pi, Gemini, and Antigravity reject `--agent` until a tested relay exists; never silently downgrade.
- Runtime state resolves to `${TMPDIR:-/tmp}/evcrate/advice/v1/<project-key>/<invocation-id>/`; it is sanitized, bounded, retained seven days on pause/failure, and replaced by a 24-hour tombstone after readiness.

## Compatibility Boundary

- Breaking input change: `@advisor` no longer enables supervision; release notes and help show `--advice` migration.
- Codex is first-class: frontier/high advisor agent, native inline `cmd_advise` skill, explicit relay rejection. Pi uses `evcrate_subagent`/`strong`; Antigravity must project and smoke-test its advisor agent; both provide inline `/advise` and reject relay.
- No broker, MCP advisor service, launcher, provider selector, quota, ledger, audit transport, approval bypass, hidden fallback, or persistent tracked interview state.

## Unresolved Questions

None. Phases 01-05 completed; release/publish/commit remains a separate user-authorized workflow.
