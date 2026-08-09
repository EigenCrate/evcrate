# Research — Native Pi Migration

**Date:** 2026-08-09  
**Status:** Complete  
**Scope:** Pi resource APIs, packages, provider/model behavior, hook compatibility, and EVCrate distribution seams.

## Repository baseline

- Canonical authoring: `.evcrate/source/.claude/`.
- Inventory at research time: 73 commands, 17 agents, 4 workflow documents, 10 top-level hook scripts, and 53 skills.
- Manifest staging already supports adapters, overlays, deterministic hashes, output ownership, HOME bindings, preservation, dry-run, rollback, and symlink rejection.
- Existing generated roots: `.codex`, `.agents`, `.gemini`, and `.antigravity`; no Pi target exists.
- `migrate_claude_to_codex.py` currently owns `.codex` and `.agents`; this plan does not disturb that contract.

## Native Pi findings

Pi 0.84.1 supports:

- Global resources under `~/.pi/agent/{extensions,skills,prompts,themes}`.
- Global Agent Skills under both `~/.pi/agent/skills` and `~/.agents/skills`.
- Project resources under `.pi/{extensions,skills,prompts}` after trust.
- Extension lifecycle events including `session_start`, `model_select`, mutable `tool_call`, `tool_result`, compaction, and shutdown.
- Local and npm packages in `settings.json`, including exact versions and resource filters.
- `PI_CODING_AGENT_DIR` as a config-root override; default is `~/.pi/agent` but the environment variable is not assumed to be set.

Pi's basic prompt templates are insufficient for EVCrate commands because they do not preserve the full recursive Claude command contract. A registered-command extension is required for namespaced commands, argument substitution, shell expansion, file references, and temporary tool restrictions.

### Skill coexistence

Pi discovers `.pi` skills before `.agents` skills and warns/keeps the first same-name skill. Settings resource exclusions are evaluated relative to each source root, so there is no portable global pattern that excludes only `~/.agents/skills` while keeping automatic `~/.pi/agent/skills` discovery across arbitrary HOME/config paths.

The reliable co-install command is:

```bash
pi --no-skills --skill "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills"
```

`--no-skills` disables normal discovery, while explicit `--skill` remains additive.

## Package evaluation

### Selected: `pi-subagents@0.44.0`

- MIT licensed.
- Loads user agents from `~/.pi/agent/agents/**/*.md` and project agents from `.pi/agents/**/*.md`.
- Version 0.44.0's public tool accepts execution only through `workflowScript`; legacy top-level direct, parallel, and chain inputs return an error.
- Its exported structured delegation event API accepts explicit agent/task/context/model/thinking/budget/result contracts without requiring EVCrate to parse JavaScript.
- It does not understand EVCrate semantic roles by itself.
- The clean seam is an EVCrate-owned structured `evcrate_subagent` tool: resolve roles, append child context, then emit package delegation requests. This preserves explicit user overrides and leaves arbitrary package `workflowScript` runs inherited/unmodified.

### Rejected after source review: `@hsingjui/pi-hooks@0.0.2`

- MIT licensed and useful for simple default-root installations.
- It hard-codes `~/.pi/agent/settings.json`, so it does not honor `PI_CODING_AGENT_DIR`.
- It maps shutdown only to SessionEnd `other`, reports compaction as `manual`, and has no `SubagentStart` seam.
- Using it plus native compatibility handlers would create two owners for the same lifecycle/tool events.

EVCrate already requires a payload adapter and child delegation wrapper. A focused native event dispatcher around that adapter is smaller and more correct than patching/duplicating the package runtime.

### Selected: `@juicesharp/rpiv-ask-user-question@2.4.0`

- MIT licensed and compatible with the Earendil Pi packages.
- Provides the structured question tool expected by privacy guidance and command workflows.
- Exact pin avoids tool-contract drift.

### Rejected: dynamic workflow packages

Available workflow packages execute JavaScript orchestration. EVCrate's `.claude/workflows/*.md` are static policy/context documents, not executable DAG definitions. A dynamic package would change semantics and add an unnecessary runtime dependency.

### Rejected: `pi-yaml-hooks`

Its YAML-native hook schema is useful for new Pi hooks but is not a direct payload-compatible migration path for existing canonical Claude scripts. Re-authoring every hook would create a second source of truth.

### Rejected as runtime dependency: `pi-code`

`pi-code@1.0.2` proves recursive command registration is viable, but it loads `.claude` directly and emulates a Claude environment. The target requirement is generated native Pi resources. Only its MIT command-loader behavior is used as design provenance; EVCrate ships focused native glue.

## Model-role decision

Canonical model intent becomes:

| Claude source | Semantic role |
|---|---|
| `opus` | `strong` |
| `sonnet` | `standard` |
| `haiku` | `fast` |
| `inherit` | `parent` |
| absent | `standard` |

Validated built-in OpenAI Codex route:

| Role | Model | Thinking |
|---|---|---|
| `strong` | `openai-codex/gpt-5.6-sol` | `high` |
| `standard` | `openai-codex/gpt-5.6-terra` | `high` |
| `fast` | `openai-codex/gpt-5.6-luna` | `low` |
| `parent` | omitted | omitted |

All three models are present in Pi 0.84.1's active model registry. Unknown providers and unavailable configured routes inherit the parent's active model and emit a warning; crossing providers silently is forbidden. User settings may add provider role tables under an EVCrate namespace, but generated managed settings do not overwrite those tables.

## Command/resource translation

Generated runtime path translations must be centralized and tested:

- `.claude/workflows` → Pi EVCrate workflow resource root.
- executable `.claude/scripts` → Pi EVCrate script resource root.
- global `~/.claude/skills` → `~/.pi/agent/skills` for Pi-native generated content.
- project `.claude/skills` authoring → `.pi/skills`.
- `.claude/.evcrate.json` → `.pi/.evcrate.json`.

Commands are transformed at invocation so `PI_CODING_AGENT_DIR` overrides work without embedding HOME paths. Generated agents receive the resolved workflow/resource root through subagent task context.

## Settings/publication decision

Use a generated settings fragment as build input, not as the user's settings file. During `.pi` candidate creation:

1. Parse existing `agent/settings.json`; reject malformed JSON or symlinks.
2. Reject a loaded `npm:pi-code` identity with manual cutover instructions.
3. Replace only the two managed package identities with exact current pins.
4. Preserve every unrelated key, array item, and user model/provider value.
5. Write the merged candidate and atomically promote the whole `.pi` root under existing rollback handling.
6. Keep `settings.json` out of file-level `managed_paths`; dry-run reports it as a shared merge.

Shared JSON must be a typed manifest/publication transaction: the same pure merge plan drives dry-run and candidate construction, adapter helper sources are hashed, no-op/rollback preserve exact bytes, and managed updates preserve unknown values semantically.

The user chose to remove `pi-code` manually after implementation; no automatic uninstall or disabling is planned.

## Plan-review corrections

- Canonical commands such as `/plan` instruct the model to invoke nested slash commands. Pi does not execute slash text emitted by the model, so the native extension needs a bounded `evcrate_command` tool rather than relying on prose.
- Current target overlays must live under `.evcrate/targets/pi/files/`, and every file must appear as `files/...` in `owned_paths`. Staging order is adapter → overlay → runtime → patch.
- `distribution/staging.py` must explicitly provide `PI_OUTPUT_DIR`; helper modules under `pi_adapter/` need a typed `adapter_sources` hash contract so publication detects stale builds after helper changes.
- Canonical skill policy is explicit: publish all 53 uppercase `SKILL.md` packages, including `template-skill` for source parity; exclude the legacy lowercase `skills/claude-code/skill.md` because it is not a Pi `SKILL.md` package. Hook inventory is derived from canonical settings entrypoints plus recursive dependencies, not a hard-coded script count.
- Pi extension auto-discovery order, not package array order, ensures the EVCrate global extension is loaded before package extensions. Structured delegation uses the extension event bus after all listeners are registered.

## Primary references

- Pi README and docs: `README.md`, `docs/extensions.md`, `docs/packages.md`, `docs/settings.md`, `docs/skills.md`, `docs/models.md`, `docs/environment-variables.md` in the installed `@earendil-works/pi-coding-agent` package.
- Pi examples: permission gate, protected paths, question, plan mode, and subagent extension examples.
- Package source/tarballs inspected under `/tmp/evcrate-pi-research/` for `pi-code@1.0.2`, `pi-subagents@0.44.0`, `@hsingjui/pi-hooks@0.0.2` (rejected), and `@juicesharp/rpiv-ask-user-question@2.4.0`.
