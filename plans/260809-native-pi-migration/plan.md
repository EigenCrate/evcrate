---
title: "Native provider-aware Pi migration"
description: "Generate and safely publish native Pi commands, workflows, agents, hooks, and skills from canonical Claude source without pi-code emulation."
status: pending
priority: P1
branch: main
created: 2026-08-09
---

# Native Provider-Aware Pi Migration

## Goal

Add a manifest-backed Pi target whose only authored content source is `.evcrate/source/.claude/`. Generate native `.pi` resources, preserve Pi user settings through entry-level merges, and resolve agent model roles against the active Pi provider at runtime. Do not depend on `pi-code`, dynamic Markdown workflow emulators, or Claude model IDs embedded in Pi commands/workflows.

## Scope

- Generate `.evcrate/source/.pi/` with Pi-native global resources under `agent/`.
- Migrate 73 recursive commands, 17 agents, 4 static workflows, canonical hook entrypoints plus dependency closure, and all 53 uppercase `SKILL.md` packages without hand-maintained content forks.
- Install required Pi packages by managed merge into `~/.pi/agent/settings.json`.
- Route canonical model intent through semantic roles: `strong`, `standard`, `fast`, and `parent`.
- Preserve Codex's existing `.agents` ownership; Pi gets an independent `.pi/agent/skills` projection.
- Keep build/check/publish deterministic, symlink-safe, recoverable, and non-destructive.

## Non-goals

- Do not alter provider credentials, Pi's default provider/model/thinking level, sessions, themes, or unrelated packages.
- Do not convert static workflow Markdown into executable JavaScript workflow orchestration.
- Do not refactor Codex `.agents` ownership in this slice.
- Do not silently remove `npm:pi-code`; publication must fail with cutover instructions until the user removes it manually.
- Do not add default model routes for providers that have not been explicitly validated.

## Architecture decisions

1. **Canonical source remains Claude.** Commands, workflows, agents, hooks, scripts, and skills are derived from `.evcrate/source/.claude/`; Pi-only runtime glue lives in the Pi target overlay.
2. **Pi is a first-class manifest target.** `.evcrate/targets/pi/manifest.json` owns only `.pi`; normal staging, hashing, promotion, verification, and HOME rollback apply.
3. **Native resource layout.** Publish skills to `~/.pi/agent/skills`, agents to `~/.pi/agent/agents`, and EVCrate resources to `~/.pi/agent/evcrate/{commands,workflows,scripts,hooks}`. Auto-load the local extension from `~/.pi/agent/extensions/evcrate/`.
4. **Commands are registered, not emulated.** A small EVCrate extension recursively registers `dir/file.md` as `/dir:file`, applies argument/default substitution, safe file references, bounded shell expansion, and temporary `allowed-tools` restrictions.
5. **Workflows stay static.** Commands and agents reference the generated workflow document root. No dynamic-workflow package is required.
6. **Nested commands are structured.** A bounded `evcrate_command` tool lets the model dispatch generated commands named in command prose. It returns expanded command content and enforces allowlisting, cycle/depth limits, safe dynamic expansion, and the same temporary tool policy as user-invoked commands.
7. **Agents use the structured `pi-subagents` API.** Version 0.44.0 removed public direct/parallel/chain tool inputs in favor of `workflowScript`. EVCrate therefore registers an `evcrate_subagent` tool that emits the package's documented structured delegation events for direct, parallel, and sequential plans. Generated agents omit concrete model pins and preserve a sidecar `model-roles.json`.
8. **Provider safety is strict.** The delegation tool validates and preserves explicit per-run overrides; invalid explicit values fail the node rather than silently inheriting. Without an explicit model it resolves the agent role immediately before delegation. Built-in OpenAI Codex routes are `strong → gpt-5.6-sol/high`, `standard → gpt-5.6-terra/high`, and `fast → gpt-5.6-luna/low`. `parent` and unknown providers omit implicit model overrides and inherit the active parent. Missing configured implicit models warn once per session; no cross-provider fallback occurs.
9. **Hooks have one native owner.** The EVCrate extension maps Pi lifecycle/tool events directly to a generated hook map and canonical payload adapter. It parses decisions/context itself and runs `SubagentStart`-equivalent context before each structured delegation. No second hook package dispatches the same events.
10. **Settings are shared, not owned wholesale.** Merge only required package identities. Preserve all unknown keys/list entries and never mark `agent/settings.json` as a managed file. The typed shared-JSON transaction contract is implemented before the Pi target relies on it. Publication remains `EVCRATE_HOME/.pi → EVCRATE_HOME/.pi`; `PI_CODING_AGENT_DIR` is runtime-only. Live Pi must be quiescent, and a pre-promotion HOME hash recheck aborts on concurrent session/package/settings changes.
11. **Codex skill coexistence is explicit.** Pi normally sees `.pi` and `.agents`; same-name `.pi` skills win with Pi's normal collision warning. To suppress Codex skills, use `pi --no-skills --skill "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills"`; settings cannot portably exclude only `.agents` while retaining automatic `.pi` discovery.
12. **Cutover is manual.** The user will remove `npm:pi-code` after implementation. Until then, actual Pi HOME publication fails preflight; isolated build/check and temporary-HOME tests remain available.
13. **Third-party code is not vendored.** Adapt the MIT `pi-code` command-loader behavior with attribution, tests, and EVCrate-specific trust/path decisions rather than copying its Claude emulation package.

## Managed package pins

| Package | Pin | Purpose |
|---|---:|---|
| `pi-subagents` | `0.44.0` | Native global/project agent discovery and child execution |
| `@juicesharp/rpiv-ask-user-question` | `2.4.0` | Structured native question tool used by migrated prompts/hooks |

Pins are exact in the generated settings fragment. Package upgrades require contract-test review, not automatic drift.

## Runtime flow

```text
.evcrate/source/.claude
  -> migrate_claude_to_pi.py
  -> staged .pi + Pi overlay
  -> manifest verification
  -> HOME .pi candidate copy
  -> entry-level settings merge
  -> atomic promotion / rollback

Pi session
  -> EVCrate extension loads generated commands and native hook map
  -> evcrate_command dispatches nested command composition
  -> evcrate_subagent resolves roles and emits structured delegation events
  -> pi-subagents executes generated agents
  -> EVCrate lifecycle handlers invoke adapted canonical hook scripts
```

## Phases

1. [Pi target and distribution contract](./phase-01-pi-target-contract.md)
2. [Deterministic resource migration](./phase-02-resource-migration.md)
3. [Native commands, agents, and model roles](./phase-03-native-runtime-extension.md) — DONE (260809; user-approved with unresolved criticals)
4. [Hooks and managed settings publication](./phase-04-hooks-and-settings.md)
5. [Integration, safety, and release gates](./phase-05-integration-validation.md) — DONE (isolated validation 260809; live cutover excluded)
6. [Documentation and manual cutover](./phase-06-documentation-cutover.md)

## Success criteria

- Build/check generate a stable `.evcrate/source/.pi` tree from canonical source and detect any manual drift.
- Generated inventories match canonical commands, workflows, agents, hooks, scripts, and skills; no Pi content file requires hand-sync.
- Nested slash commands and all documented substitutions/expansions pass unit tests; unsafe `@` references cannot escape the working tree, shell expansions time out, and an authoritative operation-policy gate prevents later extensions or parallel sibling batches from bypassing `allowed-tools`.
- Generated agent files contain no Claude or OpenAI model pin. OpenAI Codex role injection uses only available models; unknown providers inherit the parent and warn.
- Hook contract tests prove blocking for privacy/scout fixtures, parsed additional context for session/prompt/child hooks, reason mapping, alternate Pi config roots, and post-write modularization behavior.
- Publishing into a populated temporary HOME preserves unmanaged settings subtrees by semantic deep equality after a managed update; no-op, dry-run, and rollback preserve exact bytes. Changed documents serialize deterministically, dry-run is accurate, and injected failures restore.
- Actual HOME publication refuses to coexist with `npm:pi-code` or a concurrently writing Pi process; after manual removal and quiescent publication, native Pi starts without duplicate EVCrate commands/tools.
- Structured child terminal responses prove execution completion, not automatic acceptance; requested result inspection/tests/review remain explicit parent gates.
- Python tests, Node extension tests, build, check, temporary-HOME dry-run/publish, and a native Pi smoke session all pass.

## Principal risks

- **Shared settings corruption:** parser-backed merge, stable identities, symlink rejection, candidate-root writes, rollback, and fixture tests.
- **Hook semantic mismatch:** one native event owner, explicit reason/tool maps, payload/output contract fixtures, and documented unavoidable Pi event differences.
- **Provider drift:** validate routes against `ctx.modelRegistry`; inherit rather than guessing.
- **Command path drift:** central path translation matrix and source/output inventory tests.
- **Skill duplication with Codex:** document Pi precedence and the explicit `--no-skills --skill "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills"` launch form; do not mutate Codex.
- **Package API drift:** exact pins and package-level contract tests before upgrades.

## Research

See [research report](./reports/research-260809-pi-native-migration.md).
