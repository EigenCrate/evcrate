# Phase 02 — Deterministic Resource Migration

## Context

- [Plan](./plan.md)
- [Phase 01](./phase-01-pi-target-contract.md)

## Overview

- **Priority:** P1
- **Status:** DONE (260809)
- **Goal:** generate complete native Pi resource data from canonical Claude content with deterministic, tested transformations.
- **Effort:** 8–12h

## Output layout

```text
.pi/
├── .evcrate.json
├── .evcrateignore
└── agent/
    ├── agents/*.md
    ├── skills/**
    ├── evcrate/
    │   ├── commands/**/*.md
    │   ├── workflows/*.md
    │   ├── scripts/**
    │   ├── hooks/**
    │   ├── model-roles.json
    │   └── managed-settings.json
    └── extensions/evcrate/**      # `.evcrate/targets/pi/files/` overlay
```

## Requirements

- Source inventory and output inventory must match by logical name; no silent skip. Publish all 53 uppercase `SKILL.md` packages (including `template-skill`) and explicitly exclude the legacy lowercase `skills/claude-code/skill.md`.
- Copy workflows and skills content-preservingly except exact native path/frontmatter compatibility changes.
- Transform agents into `pi-subagents` frontmatter, normalize tool names, remove concrete model fields, and write role intent to `model-roles.json`.
- Copy required scripts/hooks plus dependencies; keep executable modes where relevant.
- Centralize token-aware semantic compatibility translation for executable paths/tool names/command composition. Broad product-name replacement is forbidden.
- Generated files must have stable ordering, LF policy, JSON formatting, and timestamps independent of the environment.

## Related files

### Create

- `pi_adapter/__init__.py`
- `pi_adapter/frontmatter.py` — parser/serializer and field validation.
- `pi_adapter/resources.py` — inventory, dependency closure, semantic translation, and deterministic writes.
- `pi_adapter/agents.py` — tool/model-role/frontmatter conversion.
- `tests/fixtures/pi/` — focused source and expected-output fixtures.

### Modify

- `migrate_claude_to_pi.py` — orchestrate the modules and enforce contained paths.
- `.evcrate/source/.claude/hooks/lib/evcrate-config-utils.cjs` — permit `.pi` as an explicit `EVCRATE_CONFIG_DIR` and an explicit absolute Pi config/resource-root override; preserve Claude/Codex defaults.
- `.evcrate/source/.claude/hooks/dev-rules-reminder.cjs` — resolve workflow/script/skill locations through the shared root helper rather than hard-coded `.claude` paths.
- Existing config-utils tests — add `.pi` path resolution cases.

## Translation contract

- Canonical global skills become `.pi/agent/skills`.
- Canonical project skill authoring references become `.pi/skills`.
- Workflow/script references use logical EVCrate resource markers resolved by the runtime extension; generated artifacts never embed the build machine's HOME.
- Pi config references use `.pi/.evcrate.json`. The adapter sets `EVCRATE_CONFIG_DIR=.pi`, `EVCRATE_GLOBAL_CONFIG_ROOT=<absolute directory containing .evcrate.json>`, and `EVCRATE_RESOURCE_ROOT=<absolute agentDir>/evcrate`, derived from `PI_CODING_AGENT_DIR ?? $HOME/.pi/agent`; explicit absolute roots take precedence in shared hook helpers.
- `AskUserQuestion` becomes `ask_user_question`; `Task`/subagent execution becomes `evcrate_subagent`; model-initiated `/...` composition becomes `evcrate_command`; unsupported Skill/Web tool prose is translated or fails the residual-token audit.
- Canonical user-facing command names and nested relative paths do not change.
- Claude agent models map only to roles: `opus/sonnet/haiku/inherit → strong/standard/fast/parent`; absent model → `standard`.

## Implementation steps

1. Add a safe inventory walker that rejects symlinks, unsupported file types, duplicate logical names, malformed frontmatter, and source escapes.
2. Implement deterministic frontmatter parsing/serialization without lossy body rewriting.
3. Copy commands/workflows and translate only recognized runtime path/tool/dispatcher tokens, including executable nested command instructions.
4. Copy all 53 uppercase skill packages recursively, preserving references/assets/scripts and validating Pi's `SKILL.md` name/description limits; assert the lowercase legacy file is excluded for a recorded reason.
5. Derive hook entrypoints from canonical settings plus `subagent-init.cjs`, compute/copy their recursive dependencies, and generate a provider-neutral native `hook-map.json`; do not use a hard-coded top-level hook count.
6. Copy the canonical script closure; duplicate `.evcrateignore` only where scout-hook path resolution requires it.
7. Convert agents, preserving name/description/body/tools while dropping unsupported Claude-only presentation fields and concrete models.
8. Generate sorted `model-roles.json` with source-model provenance for audit, but no provider/model IDs.
9. Generate a sorted managed-settings fragment containing only the two exact package pins and EVCrate metadata; native hook ownership requires no settings hook groups.
10. Add residual-token, inventory, dependency, path, frontmatter, line-ending, and idempotence tests; assert a second migration produces no diff.

## Success criteria

- Every source command, workflow, agent, and each of the 53 uppercase skill packages has exactly one expected Pi output; the lowercase legacy skill is explicitly absent.
- Generated agents contain no `opus`, `sonnet`, `haiku`, `claude-*`, `gpt-*`, or provider field.
- `model-roles.json` contains all 17 agent names and only allowed semantic roles.
- No generated prompt embeds `/home/...`, build staging paths, or source-only `.evcrate/source` paths.
- Existing canonical sources remain untouched except the shared `.pi` config-dir compatibility enum and its tests.

## Risks and controls

- **Over-broad path replacement:** token-aware translation fixtures include URLs, prose, and external `claudekit-cli` provenance.
- **Missing script dependency:** resolve imports/requires recursively or copy the bounded canonical script/hook trees, then test execution from generated paths.
- **Skill description violations:** fail build with the offending source path rather than truncating silently.
