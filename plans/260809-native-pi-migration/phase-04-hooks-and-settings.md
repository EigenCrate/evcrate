# Phase 04 — Native Hooks and Finalized Managed Settings

## Context

- [Plan](./plan.md)
- [Research](./reports/research-260809-pi-native-migration.md)
- [Phase 03](./phase-03-native-runtime-extension.md)

## Overview

- **Priority:** P1
- **Status:** DONE (260809; isolated validation)
- **Goal:** make the EVCrate extension the single Pi hook owner, preserve canonical hook behavior, and finalize the two-package managed settings fragment.
- **Effort:** 10–14h

## Related files

### Create under `.evcrate/targets/pi/files/agent/extensions/evcrate/`

- `hook-adapter.cjs` — bounded payload/output adapter and allowlisted canonical script dispatcher.
- `hooks.js` — Pi lifecycle/tool event registration, matcher evaluation, output parsing, context injection, blocking, and result updates.

### Create tests

- `.evcrate/targets/pi/tests/hook-adapter.test.mjs`
- `.evcrate/targets/pi/tests/hooks.test.mjs`
- Additional package-merge fixtures in `tests/test_distribution_pi_settings.py`.

### Modify

- `.evcrate/targets/pi/manifest.json` — add every hook overlay file to exact `files/...` ownership.
- `pi_adapter/resources.py` — finalize generated `hook-map.json`, script/dependency closure, and managed settings fragment.
- `distribution/pi_settings.py` — finalize the two managed package identities and `pi-code` conflict forms on top of Phase 01's shared transaction.

## Managed settings contract

- Destination: `~/.pi/agent/settings.json` inside the candidate `.pi` root.
- Reject if the file/ancestor is a symlink, JSON is malformed, or root is not an object.
- Preserve exact bytes on no-op, dry-run, and rollback. When managed entries change, preserve unmanaged values by semantic deep equality and serialize deterministically.
- Own package identities only for:
  - `npm:pi-subagents@0.44.0`
  - `npm:@juicesharp/rpiv-ask-user-question@2.4.0`
- Preserve `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, auth/provider configuration, custom packages, resources, UI/theme, compaction, hooks authored by the user, and `evcrate.modelRoles`.
- Detect `pi-code`, `npm:pi-code`, versioned strings, and object-form sources. Non-dry publication aborts with manual removal instructions; dry-run reports `conflict` without mutation.
- Keep `agent/settings.json` out of file-level `managed_paths`; Phase 01's shared operation reports `merge-create/update/noop/conflict`.

## Single-owner hook architecture

Do not install or invoke `@hsingjui/pi-hooks`. The EVCrate extension alone maps generated canonical hook entries to Pi:

- `session_start`: map `new/startup`, `resume`, `fork`, and `reload` explicitly; run SessionStart context once per session/reason.
- `session_before_compact`: map Pi's actual manual/threshold/overflow reason to canonical `manual|auto` and run PreCompact.
- `session_compact`: run any PostCompact entries, then SessionStart `compact` context.
- `session_shutdown`: run canonical cleanup with a documented Pi shutdown mapping; do not pretend Pi exposes Claude's `clear` reason.
- `before_agent_start`: run UserPromptSubmit after a real prompt dispatch and return a persistent hidden context message; do not fire for unrelated raw TUI input transformations.
- `tool_call`: run matching PreToolUse hooks before delegation/other tools; explicit exit 2 or deny blocks.
- `tool_result`: run matching PostToolUse/PostToolUseFailure and apply supported context/result updates.
- stop/settled lifecycle: map only if canonical Stop hooks exist.
- `evcrate_subagent`: run child-start context before structured delegation because Pi has no SubagentStart event.

Derive event/script entries from generated `hook-map.json`; do not duplicate the canonical settings map in JavaScript.

## Adapter contract

1. Parse bounded JSON stdin and reject unexpected script identifiers.
2. Map Pi tools deliberately: `find → Glob`, `ls → Glob`-compatible directory input, and other built-ins to canonical PascalCase.
3. Add `file_path` aliases where canonical hooks require them while retaining original input.
4. Set `CLAUDE_PROJECT_DIR`, `EVCRATE_CONFIG_DIR=.pi`, `EVCRATE_RESOURCE_ROOT=<agentDir>/evcrate`, `EVCRATE_GLOBAL_CONFIG_ROOT=<parent of agentDir>`, and `EVCRATE_SESSION_ID` from the event payload. Here `agentDir = PI_CODING_AGENT_DIR ?? $HOME/.pi/agent`. Alternate agent directories are runtime-only; distribution still publishes to `EVCRATE_HOME/.pi`.
5. Preserve exit code 2/stderr for privacy/scout denials.
6. Parse JSON output, including nested `hookSpecificOutput.additionalContext`; never inject raw JSON.
7. Convert successful plain UserPromptSubmit output to additional context; preserve SessionStart plain text.
8. For SessionStart, create an owner-only temporary `CLAUDE_ENV_FILE`, let canonical `session-init.cjs` write it, strictly parse bounded `CK_[A-Z0-9_]+` dotenv assignments, and apply them as session-scoped extension/process environment used by command shell expansions and child hooks. Record previous values, delete the temporary file immediately, and restore/remove keys on shutdown/reload.
9. Mark privacy/scout (and any future safety-class PreToolUse entries) explicitly in generated `hook-map.json`. For safety-class hooks, timeout, spawn error, malformed adapter payload/output, unexpected nonzero exit, or explicit deny/exit 2 all block the tool with a diagnostic. Only optional context/post hooks may notify and fail open. Empty successful output from canonical safety scripts remains a valid allow.
10. Apply bounded execution/output limits and never shell user-controlled script paths; dispatch only generated allowlisted IDs.

## Implementation steps

1. Finalize `hook-map.json` from canonical settings and add native reason/tool matcher normalization.
2. Implement adapter environment/payload mapping and safe canonical process execution.
3. Implement native lifecycle/tool handlers as the only hook owner.
4. Run generated canonical hooks against fixtures: safe/blocked read, `ls`/broad find, approved privacy path, safety-hook timeout/spawn/malformed-output/unexpected-exit failures, new/resume/fork/reload, manual/automatic compaction, shutdown, prompt reminder, child start, post-write, and strict SessionStart env-file parsing/cleanup.
5. Verify prompt/session/child JSON is parsed to context and safety exit 2 blocks the actual Pi tool call.
6. Finalize the managed settings fragment with only two exact package pins; assert no hook groups or hook package entry are emitted.
7. Re-run Phase 01 package merge/conflict/idempotence/recovery tests with final package identities.
8. Build after adding each overlay file so exact manifest inventory cannot drift.

## Success criteria

- Exactly one EVCrate handler owns each Pi hook event; duplicate-owner tests fail.
- Default and runtime-only alternate `PI_CODING_AGENT_DIR` roots discover hooks/resources/config correctly; publication remains bound to `EVCRATE_HOME/.pi`.
- Privacy/scout explicit denials and runtime/adapter failures fail closed with useful reasons; `ls` cannot bypass scout policy. Optional context-hook failures remain fail open with notification.
- Session/prompt/child context is parsed and injected, not displayed/raw; bounded `EVCRATE_*` session values reach command/child processes and are cleaned up on reload/shutdown.
- User settings gain only two managed package identities and lose no unmanaged values.
- `pi-code` coexistence fails before HOME mutation and is never auto-removed.

## Risks and controls

- **Hook semantic/safety mismatch:** explicit event/safety classification plus fixtures for every Pi reason and safety failure mode used by 0.84.1.
- **Shell injection:** fixed generated commands, allowlisted script IDs, bounded stdin/stdout/timeout.
- **Alternate-root drift:** derive agent/resource/config paths once and test default plus override roots.
- **Settings data loss:** candidate-only shared transaction from Phase 01; exact no-op/rollback evidence.
