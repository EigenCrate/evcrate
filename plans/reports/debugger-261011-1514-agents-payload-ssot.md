# Diagnostic Report: `Required EVCrate AGENTS payload is unsafe or unavailable` & `AGENTS.md` SSOT

**Date**: 2026-10-11
**Scope**: Prompt lifecycle error (`Required EVCrate AGENTS payload is unsafe or unavailable`) and `AGENTS.md` single source of truth (SSOT) across all 7 targets (`claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, `vscode`).

---

## 1. Executive Summary

- **Symptom**: Prompts abort mid-session or pre-prompt with `Required EVCrate AGENTS payload is unsafe or unavailable` (`stopReason: "aborted"`) even when `.omp/evcrate/AGENTS.md` and `~/.omp/agent/evcrate/AGENTS.md` exist and pass all byte/symlink/inode checks.
- **Primary Root Cause (OMP Compaction & Mid-Run Lifecycle State Bug)**: `OMP_PRE_MODULE` (`src/adapters/omp/templates.ts:103-106`, `.evcrate/source/.omp/hooks/pre/evcrate-context.ts:38-41`) sets `startupContext = undefined; startupDelivered = false;` inside `session_before_compact` without rebuilding `startupContext` or listening to `session_compact`. When OMP triggers mid-run compaction (`Mid-run compaction ran between provider calls`), pre-prompt context maintenance (`Pre-prompt context maintenance triggered by pending prompt size`), or `agent.continue` retries, OMP fires `before_provider_request` **before** `before_agent_start` runs again. Because `before_provider_request` (`templates.ts:71-76`) checks `if (startupContext !== undefined) return; ctx.abort();`, it falsely aborts the active provider request and logs `"Required EVCrate AGENTS payload is unsafe or unavailable"`.
- **Secondary Root Cause (`AGENTS.md` SSOT & Delivery Drift)**:
  1. **4x Duplicated Runtime Payload Readers**: `AGENTS.md` validation/reading logic is copy-pasted across 4 runtime files (OMP `templates.ts`, Pi `paths.js`, Pi `hook-adapter.cjs`, Antigravity `antigravity.ts`) with subtle behavioral divergence (`paths.js` resolves `{{evcrate:...}}` markers; `hook-adapter.cjs` does not).
  2. **OMP Prompt Duplication**: `translatePrompt` (`src/adapters/omp/commands.ts:77-92`) appends `NO_SKILLS` (`**OMP skill loading (runtime):** ...`) to both `evcrate/AGENTS.md` and every command/agent markdown file containing skill markers (e.g., `evc-cmd-debug.md`, `evc-debugger.md`), injecting the block multiple times in the same turn. Furthermore, OMP's hook bridge (`evcrate-context`) injects `evcrate/AGENTS.md` unconditionally without checking if OMP's native context loader already loaded a root `AGENTS.md` (from Codex projection) or `~/.omp/agent/AGENTS.md`.
  3. **Documentation vs Adapter Mismatch**: `README.md:300` documents `omp: Bridge payload AGENTS.md, native HOME ~/.omp/agent/AGENTS.md`, whereas `src/adapters/omp/index.ts:29` and `docs/system-architecture.md:92` publish `~/.omp/agent/evcrate/AGENTS.md`.
  4. **Selective HOME Publication Drift**: `/home/loidinh/.evcrate/publication/release-marker.json` shows selective `--target` publications updated `omp`, `claude`, `codex`, and `antigravity` to the `AGENTS.md` + `evc-cmd-*` cutover, but left `~/.pi` (last published Oct 7), `~/.copilot`, and `~/.evcrate-vscode` on pre-cutover state (`~/.pi/agent/evcrate/AGENTS.md` missing on disk).

---

## 2. Exact Error & Message Origins

All occurrences of `"Required EVCrate AGENTS payload is unsafe or unavailable"` in repository:

| Location | Function / Handler | Trigger Condition |
|---|---|---|
| `src/adapters/omp/templates.ts:15-36`<br>`.evcrate/source/.omp/evcrate/omp-hook-runtime.ts:15-36`<br>`~/.omp/agent/evcrate/omp-hook-runtime.ts:15-36` | `requiredAgentsContext()` | Throws `new Error("Required EVCrate AGENTS payload is unsafe or unavailable")` if `<RESOURCE_ROOT>/AGENTS.md` is missing, symlinked, has symlinked ancestors, size `<= 0` or `> 256 KiB`, mutates dev/ino/size during read, has invalid UTF-8, or contains `\0`. |
| `src/adapters/omp/templates.ts:71-76`<br>`.evcrate/source/.omp/hooks/pre/evcrate-context.ts:6-11`<br>`~/.omp/agent/hooks/pre/evcrate-context.ts:6-11` | `pi.on("before_provider_request", ...)` | **Unconditionally aborts (`ctx.abort()`)** and prints `"Required EVCrate AGENTS payload is unsafe or unavailable"` whenever `startupContext === undefined`—**without calling `requiredAgentsContext()` or attempting rebuild**. |
| `src/adapters/omp/templates.ts:86-94`<br>`.evcrate/source/.omp/hooks/pre/evcrate-context.ts:21-29` | `pi.on("input", ...)` | Calls `rebuildStartupContext(ctx)` when `startupContext === undefined`; catches error, prints message, returns `{ handled: true }`. |
| `.evcrate/source/.pi/agent/extensions/evcrate/paths.js:71-113`<br>`.evcrate/targets/pi/files/agent/extensions/evcrate/paths.js:71-113` | `readInstalledAgentsDocument()` | Throws `new Error("Required EVCrate AGENTS payload is unsafe or unavailable")` on missing/unsafe `.pi/agent/evcrate/AGENTS.md` or failed `resolveEvcrateMarkers()`. |
| `.evcrate/source/.pi/agent/extensions/evcrate/hook-adapter.cjs:193-232`<br>`.evcrate/targets/pi/files/agent/extensions/evcrate/hook-adapter.cjs:193-232` | `readRequiredAgentsDocument()` | Throws `new Error("Required EVCrate AGENTS payload is unsafe or unavailable")` during `childStartRunner` (`SubagentStart`) if `<resourceRoot>/AGENTS.md` is missing/unsafe. |
| `.evcrate/source/.pi/agent/extensions/evcrate/hooks.js:46-57`<br>`.evcrate/targets/pi/files/agent/extensions/evcrate/hooks.js:46-57` | `pi.on("input", ...)` | Catches `rebuildStartupContext` failure, prints message, notifies UI, returns `{ action: "handled" }`. |

---

## 3. Root Cause 1: OMP Compaction & Mid-Run Lifecycle State Bug

### Mechanism (`src/adapters/omp/templates.ts:66-107`)
In `OMP_PRE_MODULE`:
```ts
pi.on("before_provider_request", (_event: unknown, ctx) => {
  if (startupContext !== undefined) return;
  ctx.abort();
  const message = "Required EVCrate AGENTS payload is unsafe or unavailable";
  console.error(message); ctx.ui?.notify?.(message, "error");
});
...
pi.on("session_before_compact", async (_event: any, ctx: any) => {
  startupContext = undefined; startupDelivered = false;
  await runCanonicalHook("write-compact-marker.cjs", { source: "compact", session_id: sessionId(ctx), trigger: "omp", context_window: {} }, ctx);
});
```

1. When compaction starts (`session_before_compact`), `startupContext` is wiped to `undefined`.
2. OMP performs compaction **mid-turn between provider tool calls** (`Mid-run compaction ran between provider calls`) or **during pre-prompt context maintenance** (`Pre-prompt context maintenance triggered by pending prompt size`), and also makes remote compaction provider requests (`OpenAI V2 remote compaction`).
3. Neither `input` nor `before_agent_start` fires between `session_before_compact` and the next provider call in a mid-run compaction or remote compaction request.
4. When the next `before_provider_request` fires, `startupContext` is still `undefined`. `before_provider_request` does **not** lazily rebuild `startupContext`; it immediately calls `ctx.abort()` and logs `"Required EVCrate AGENTS payload is unsafe or unavailable"`, terminating the agent turn with `stopReason: "aborted"`.

### Live Log Evidence (`/home/loidinh/.omp/logs/omp.2026-10-11.*.log`)
- **`omp.2026-10-11.996651.log:477-486`**:
  - `14:46:44.555` — `OpenAI V2 remote compaction failed` (`gpt-6-astra`, `304005 tokens > 272000`)
  - `14:46:44.869` — `Required EVCrate AGENTS payload is unsafe or unavailable`
  - `14:46:44.877` — `Mid-run compaction ran between provider calls` (`messagesBefore: 216, messagesAfter: 13`)
  - `14:46:45.459` — `agent_end maintenance routing` (`stopReason: "aborted"`)
- **`omp.2026-10-11.1269482.log:185-189, 339-343`**:
  - `07:16:54.108` & `07:34:43.944` — `Automatic compaction method failed; trying next preference` -> `Required EVCrate AGENTS payload is unsafe or unavailable` -> `Mid-run compaction ran between provider calls` -> `stopReason: "aborted"`.
- **`omp.2026-10-11.1661547.log:318-322`**:
  - `01:58:37.160` — `Required EVCrate AGENTS payload is unsafe or unavailable` -> `Mid-run compaction ran between provider calls` (`messagesBefore: 634, messagesAfter: 31`) -> `stopReason: "aborted"`.
- **`omp.2026-10-11.884620.log:351-355`**:
  - `06:35:48.388` — `Mid-run compaction ran between provider calls` (`messagesBefore: 227, messagesAfter: 22`) -> `Required EVCrate AGENTS payload is unsafe or unavailable` -> `stopReason: "aborted"`.
- **`omp.2026-10-11.2888088.log:300-302`**:
  - `10:42:48.290` — `Required EVCrate AGENTS payload is unsafe or unavailable` -> `Mid-run compaction ran between provider calls` (`messagesBefore: 787, messagesAfter: 24`) -> `stopReason: "aborted"`.
- **`omp.2026-10-11.4141562.log:47-53`**:
  - `11:42:57.243` — `Pre-prompt context maintenance triggered by pending prompt size` (`contextTokens: 428889`) -> `Required EVCrate AGENTS payload is unsafe or unavailable` -> `stopReason: "aborted"`.

### Contrast with Pi (`hooks.js:59-112`)
- Pi's `session_before_compact` (`hooks.js:59-61`) only runs `PreCompact` and **does not clear `startupContext`**.
- Pi's `session_compact` (`hooks.js:63-68`) clears `startupContext`, runs `PostCompact`, and **immediately awaits `rebuildStartupContext({ reason: "compact" }, context)`**.
- Pi also registers `pi.on("context", ...)` (`hooks.js:93-112`) using `details: { evcrateStartup: true, reminder }` to strip older retained startup payloads after compaction while keeping reminders. OMP lacks `session_compact` rebuild and `context` deduplication.

---

## 4. Root Cause 2: `AGENTS.md` SSOT & Prompt Delivery / Duplication / Drift

### 4a. Canonical SSOT vs Target Projection Matrix
Canonical authoring file: `.evcrate/source/.claude/AGENTS.md` (`docs/system-architecture.md:80-95`).

| Target | Project Output | HOME Output | Delivery Mechanism |
|---|---|---|---|
| `claude` | `.claude/rules/AGENTS.md` | `~/.claude/rules/AGENTS.md` | Native Claude rules loader (`src/adapters/claude.ts:51`) |
| `codex` | `AGENTS.md` | `~/.codex/AGENTS.md` | Native Codex instruction chain (`src/adapters/codex/index.ts:121-126`) |
| `copilot` | `.github/copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | Native CLI instructions (`src/adapters/copilot/instructions.ts:15-18`) |
| `vscode` | `.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md` | Same under HOME | Native VS Code local plugin (`src/adapters/vscode/instructions.ts:24-28`) |
| `antigravity` | `.antigravity/AGENTS.md` + `.agents/rules/evcrate-antigravity.md` | `~/.gemini/config/AGENTS.md` | Native `always_on` `@[...]` rule + `PreInvocation` verification (`src/adapters/antigravity.ts:408-424,551-558,607`) |
| `omp` | `.omp/evcrate/AGENTS.md` | `~/.omp/agent/evcrate/AGENTS.md` | Hook bridge (`evcrate-context.ts` `before_agent_start`) (`src/adapters/omp/index.ts:29`) |
| `pi` | `.pi/agent/evcrate/AGENTS.md` | `~/.pi/agent/evcrate/AGENTS.md` | Extension hook (`hooks.js` `before_agent_start`) + subagent bridge (`hook-adapter.cjs`) (`src/adapters/pi/resources.ts:50-53`) |

### 4b. Four-Way Duplication of Runtime Payload Validation Logic
Instead of a single shared helper or consistent generator, bounded `AGENTS.md` verification (`256 KiB` cap, `lstatSync` symlink walk, `O_NOFOLLOW`, `fstatSync` dev/ino/size TOCTOU check, fatal UTF-8 decode, null-byte check) is duplicated in 4 places with divergences:
1. **OMP `requiredAgentsContext()`** (`src/adapters/omp/templates.ts:15-36`): Reads `<RESOURCE_ROOT>/AGENTS.md`, returns raw trimmed text.
2. **Pi `readInstalledAgentsDocument()`** (`.evcrate/targets/pi/files/agent/extensions/evcrate/paths.js:71-113`): Reads `<agentRoot>/evcrate/AGENTS.md` **and calls `resolveEvcrateMarkers(content, agentRoot)`** (`paths.js:107`) to expand `{{evcrate:...}}` placeholders.
3. **Pi `readRequiredAgentsDocument()`** (`.evcrate/targets/pi/files/agent/extensions/evcrate/hook-adapter.cjs:193-232`): Used by `childStartRunner` for Pi subagents (`hook-adapter.cjs:330`). Reads `<resourceRoot>/AGENTS.md` and returns raw `content` **without calling `resolveEvcrateMarkers()`**—leaving unresolved `{{evcrate:workflows/...}}` and `{{evcrate:AGENTS.md}}` markers in Pi subagent prompts!
4. **Antigravity `installedInstructions()`** (`src/adapters/antigravity.ts:408-424`): Reads `../AGENTS.md` in `pre-invocation.cjs` to gate execution (`EVCREATE_CONTEXT_REJECTED`), does not check `final.size !== stat.size` after `readBounded`.

### 4c. Prompt Duplication & Native Loader Overlap in OMP
1. **`NO_SKILLS` Runtime Block Injected Multiple Times per Turn**:
   - `src/adapters/omp/commands.ts:77-92` (`addRuntimeGuidance` inside `translatePrompt`) appends `NO_SKILLS` (`**OMP skill loading (runtime):** ...`) to **any** file containing skill markers (`activate the skills`, `skills catalog`, etc.).
   - Because `.claude/AGENTS.md:33`, command files (e.g., `.omp/evcrate/commands/evc-cmd-debug.md:12,15`), and agent prompts (`evc-debugger.md`) all contain `"Analyze the skills catalog and activate the skills"`, `NO_SKILLS` is baked into `evcrate/AGENTS.md`, every command template, and every agent prompt—duplicating the 550-character paragraph 2–3x in a single prompt turn.
2. **Native Context File Co-Loading vs Bridge Injection**:
   - When Codex is projected in a workspace, root `AGENTS.md` exists on disk. OMP's native context loader automatically loads workspace `AGENTS.md` (and `~/.omp/agent/AGENTS.md` if present), while `.omp/hooks/pre/evcrate-context.ts` also injects `.omp/evcrate/AGENTS.md` as a custom message (`customType: "evcrate-context"`), delivering the entire `AGENTS.md` body twice unless foreign context files are disabled.
   - `README.md:300` erroneously states `omp: Bridge payload AGENTS.md, native HOME ~/.omp/agent/AGENTS.md`, contradicting `docs/system-architecture.md:92` and `src/adapters/omp/index.ts:29` (`~/.omp/agent/evcrate/AGENTS.md`).

### 4d. Installed HOME Target Drift (`~/.pi`, `~/.copilot`, `~/.evcrate-vscode`, `~/.omp`)
Inspection of `/home/loidinh/.evcrate/publication/release-marker.json` (`records.harness.managed_paths`) and HOME directories shows:
- Only selective targets (`--target omp`, `--target antigravity`, `--target claude`, `--target codex`) were republished to HOME after the `AGENTS.md` / `evc-cmd-*` migration.
- `~/.pi/agent/evcrate/` was last published Oct 7 (3 days ago) and **lacks `~/.pi/agent/evcrate/AGENTS.md`**; its installed `hooks.js`/`paths.js` are pre-cutover, while `copilot` and `vscode` in `release-marker.json` still reference legacy `evcrate-cmd-*` / `cmd-bootstrap-auto-fast`.
- In `~/.omp/agent/commands/`, deleting prior `cmd-*/index.ts` files during publication left ~70 empty legacy `cmd-*` directories (`cmd-worktree/`, `cmd-watzup/`, etc.) alongside the new `evc-cmd-*` directories.

---

## 5. Actionable Recommendations

1. **Fix OMP Compaction & `before_provider_request` Lifecycle (`src/adapters/omp/templates.ts:68-107`) [P0 - Immediate]**:
   - Do **not** clear `startupContext = undefined` inside `session_before_compact` before compaction provider calls finish (or make `before_provider_request` `async` and lazily call `await rebuildStartupContext(ctx)` before aborting).
   - Register `pi.on("session_compact", async (_event, ctx) => { await rebuildStartupContext(ctx); })` so post-compaction state is rebuilt deterministically, matching Pi's `hooks.js:63-68`.
   - Only call `ctx.abort()` in `before_provider_request` if `rebuildStartupContext(ctx)` actually throws (i.e., `requiredAgentsContext()` fails validation).
   - Add `pi.on("context", ...)` startup message deduplication in `OMP_PRE_MODULE` (matching Pi's `hooks.js:93-112`) so retained pre-compaction `evcrate-context` messages do not duplicate `AGENTS.md` after compaction.
2. **Fix Pi Subagent `AGENTS.md` Marker Resolution (`.evcrate/source/.pi/agent/extensions/evcrate/hook-adapter.cjs:193-232, 330`) [P1 - High]**:
   - Unify Pi's `AGENTS.md` reader or apply `resolveEvcrateMarkers` in `hook-adapter.cjs` (`readRequiredAgentsDocument`) so `SubagentStart` does not inject raw `{{evcrate:...}}` placeholders into Pi subagents.
3. **Eliminate OMP `NO_SKILLS` Prompt Duplication & Doc Drift (`src/adapters/omp/commands.ts:77-92`, `README.md:300`) [P2 - Medium]**:
   - Inject `NO_SKILLS` once via `evcrate/AGENTS.md` (or startup context) rather than appending it to every translated command and workflow file, or deduplicate when building command prompts.
   - Update `README.md:300` from `~/.omp/agent/AGENTS.md` to `~/.omp/agent/evcrate/AGENTS.md` to match `docs/system-architecture.md:92`.
4. **Republish All HOME Targets & Prune Empty Legacy Directories [P2 - Medium]**:
   - Run full `evcrate publish --apply --scope home` (across all persisted targets) so `~/.pi`, `~/.copilot`, and `~/.evcrate-vscode` receive `AGENTS.md` and `evc-cmd-*` artifacts, and prune empty legacy `~/.omp/agent/commands/cmd-*` directories during file deletion in `src/distribution/publication.ts`.

---

## 6. Unresolved Questions

1. Does OMP's hook runner support `async` handlers on `before_provider_request` (allowing `await rebuildStartupContext(ctx)`), or should `before_provider_request` validate synchronously via `requiredAgentsContext()` while keeping `startupContext` populated across `session_before_compact`?
2. In mixed Codex + OMP workspaces where root `AGENTS.md` is projected for Codex, should OMP's `evcrate-context` hook suppress injecting `evcrate/AGENTS.md` when root `AGENTS.md` is already loaded natively by OMP, or is OMP expected to run with foreign context files disabled?
