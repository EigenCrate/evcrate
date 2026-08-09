# Phase 03 — Native Commands, Structured Delegation, and Model Roles

## Context

- [Plan](./plan.md)
- [Phase 02](./phase-02-resource-migration.md)
- Pi extension docs and pinned `pi-subagents` delegation API listed in the research report.

## Overview

- **Priority:** P1
- **Status:** DONE (260809; user-approved with unresolved criticals)
- **Goal:** load generated resources with native Pi APIs, support nested command composition, and route child agents through the package's structured delegation transport.

## Completion record

- **Completed:** 260809
- **Accepted defects (unresolved criticals):**
  - XML closing-tag marker corruption
  - shell descendant timeout/process-tree leak
- **Effort:** 14–20h

## Dependency contract

`pi-subagents@0.44.0` rejects legacy public `{agent, task}`, parallel, and chain tool inputs; its public execution tool requires `workflowScript`. EVCrate must not parse/rewrite arbitrary JavaScript. Instead, an EVCrate-owned `evcrate_subagent` tool emits the package's documented structured delegation request/response events. Package `workflowScript` remains available for users but is outside EVCrate role guarantees and inherits unless explicitly configured.

## Approved Phase 03/04 seam

- Phase 03 will extract a reusable child-start hook runner for EVCrate structured
  delegation. Phase 04 reuses that runner; it must not duplicate child-start hook event subscription,
  dispatch, or output parsing. One lifecycle owner handles each child-start event.

## Related files

### Create in `.evcrate/targets/pi/files/agent/extensions/evcrate/`

- `index.js` — extension composition, event ownership, and session diagnostics.
- `command-files.js` — recursive discovery/frontmatter/argument parsing.
- `commands.js` — user command registration, dynamic expansion, resource resolution, and restriction lifecycle.
- `command-tool.js` — bounded `evcrate_command` model dispatcher with cycle/depth tracking.
- `model-roles.js` — settings validation, provider route resolution, and available-model checks.
- `delegation-tool.js` — direct/parallel/sequential schema, structured request correlation, cancellation, and aggregation.
- `child-context.js` — parsed `SubagentStart` context and resource-root enrichment.
- `paths.js` — exact `PI_CODING_AGENT_DIR ?? $HOME/.pi/agent` and containment helpers.
- `ATTRIBUTION.md` — MIT design provenance for adapted `pi-code` command-loader behavior.

Every created overlay file must be added to `.evcrate/targets/pi/manifest.json` as `files/...` in the same phase.

### Create tests

- `.evcrate/targets/pi/tests/command-files.test.mjs`
- `.evcrate/targets/pi/tests/command-tool.test.mjs`
- `.evcrate/targets/pi/tests/model-roles.test.mjs`
- `.evcrate/targets/pi/tests/delegation-tool.test.mjs`
- `.evcrate/targets/pi/tests/extension-smoke.test.mjs`

### Modify

- `.evcrate/targets/pi/manifest.json` — exact overlay inventory.
- `package.json` — add `test:pi` and aggregate it with Python tests; align the distributable runtime baseline with Pi's Node `>=22.19` requirement.

## Command behavior

- Register every generated Markdown path recursively; `foo/bar.md` becomes `/foo:bar`.
- Support quoted arguments, `$ARGUMENTS`, `$@`, `$1..$n`, `${n:-default}`, and `${ARGUMENTS:-default}`.
- Identify/execute authored `` !`command` `` spans before argument substitution so user arguments cannot become shell syntax. Skip fenced blocks and enforce a 30-second/output bound.
- Inline authored `@file` only after realpath containment under the current workspace; leave missing/escaping/symlink-escaping references literal. User arguments cannot create new file-reference expansions.
- Resolve logical workflow/script/skill markers to the exact active Pi agent root at invocation.
- `evcrate_command` accepts only discovered command names, respects `disable-model-invocation`, returns expanded prompt content as a tool result, and enforces per-run maximum depth/invocation count plus repeated-command cycle detection.
- Apply `allowed-tools` to the complete command-driven agent run. Normalize Claude tools to installed Pi tools, including `ask_user_question`, `evcrate_command`, and `evcrate_subagent`; reject unsupported tools explicitly.
- Treat active-tools narrowing as prompt/UI state, not the security boundary. Register an early EVCrate `tool_call` gate that checks every call against the current operation-policy stack, so later extensions cannot re-enable a disallowed tool. Inspect the already-recorded assistant message during preflight; reject any parallel tool-call batch that mixes `evcrate_command` with siblings and require the model to retry the dispatcher alone, preventing a sibling from being preflighted under the parent policy.
- Restore the exact prior tool set on `agent_settled`, `session_shutdown`, reload, dispatch failure, or abort. A nested `evcrate_command` inherits the parent operation token and pushes/intersects its tool policy; only independent concurrent restricted operations are rejected. Pop nested policies without restoring past the parent policy.

## Structured delegation behavior

- Register `evcrate_subagent` with direct, parallel, and sequential-chain input shapes; use no arbitrary workflow JavaScript.
- Generate unique request/owner/node IDs and emit `prompt-template:subagent:request` only after all extensions are loaded.
- Subscribe/correlate started/update/terminal/cancel events; treat missing/duplicate/partial responses as failed gates.
- Validate and preserve explicit per-run model/thinking values. An explicit model that is unavailable/malformed, or an explicit invalid thinking level, fails that node/tool call; it never silently inherits. An explicit model with no thinking leaves thinking unspecified. Explicit thinking with no model applies to the implicit routed model, or to the inherited parent when no implicit route exists.
- When model is not explicit, lookup the generated agent role, resolve the active provider route, verify the model exists, and include model/thinking.
- For `parent`, unknown provider, missing agent, malformed configured route, or unavailable implicit role model: omit the implicit model and inherit; notify once per unique warning/session. Preserve any separately valid explicit thinking override.
- Run the generated child-start hook before each request and append only parsed `hookSpecificOutput.additionalContext`, never raw JSON.
- Validate each request with the package's documented preflight/contract where available; enforce timeout, cancellation, and aggregate failure behavior.
- A terminal `completed` response proves transport/execution completion only. `pi-subagents` structured delegation disables package acceptance; the parent command/workflow must inspect the returned artifact/result and run any requested tests/review gate before calling work accepted or verified.
- Scope role/context guarantees to `evcrate_subagent`; arbitrary direct use of the package's `subagent` `workflowScript` tool is not intercepted or rewritten.

## User route schema

Read but do not manage:

```json
{
  "evcrate": {
    "modelRoles": {
      "providers": {
        "provider-id": {
          "strong": {"model": "provider-id/model", "thinking": "high"}
        }
      }
    }
  }
}
```

Reject malformed entries locally, warn, and retain parent inheritance. Never rewrite this user-owned object.

## Implementation steps

1. Implement/test pure discovery, parsing, substitution, fenced-range, and containment helpers.
2. Register commands from the managed global resource root and re-read bodies at invocation.
3. Implement `evcrate_command`; prove `/plan` can dispatch exactly one selected `/plan:fast` or `/plan:hard` body without slash-text emulation.
4. Implement operation-scoped tool restrictions, the authoritative `tool_call` gate, mixed-batch rejection, nested token/policy stacks, and all terminal cleanup paths.
5. Implement exact provider-role parsing and model-registry validation.
6. Implement structured delegation request/response correlation for direct, parallel, and sequential shapes.
7. Parse/append child-hook context and active workflow/config/resource roots without exposing settings values or secrets.
8. Add mocked ExtensionAPI/event-bus smoke tests proving resolved extension order, command count, delegation, warnings, cancellation, and restoration.
9. Add a dependency-contract test proving legacy top-level direct package execution fails and EVCrate structured delegation succeeds against pin 0.44.0.

## Success criteria

- All nested commands register once; model-initiated command composition executes via `evcrate_command` with cycle/depth protection.
- Expansion/restriction tests cover timeout, malicious arguments, missing files, path/symlink traversal, fences, later-extension tool re-enable attempts, mixed parallel dispatcher batches, abort, reload, independent overlap, nested policy intersection, and settled restoration.
- Direct, parallel, and sequential EVCrate children reach terminal structured package events; tests distinguish execution completion from parent-owned acceptance/verification.
- OpenAI Codex roles inject Sol/high, Terra/high, and Luna/low only when no explicit model override exists; unknown providers never receive an implicit OpenAI model. Invalid explicit overrides fail, while valid partial override behavior is deterministic.
- Child tasks contain parsed native resource/hook context, not raw hook JSON.

## Risks and controls

- **Package event drift:** exact pin, tarball/integrity fixture, documented event constants, and contract tests.
- **Tool ambiguity:** generated prompts name `evcrate_subagent`; docs state package `workflowScript` runs are outside EVCrate role guarantees.
- **Tool restore leak:** inherited nested operation tokens, policy intersection/stacking, rejection of only independent overlap, and cleanup on every settled/shutdown/reload/error path.
- **Nested-command loops:** allowlist plus depth/count/cycle guards.
