# VS Code Tool Parity & Diagnostics Tracking Note

- **Date:** 2026-10-11
- **Target:** VS Code Local (`vscode`) Agent Plugins 1.0
- **Pinned Host:** VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) / GitHub Copilot Chat `0.68.0`
- **Branch:** `fix/vscode-subagent-tool-references`
- **Reference Research:** Closing EvCrate's three VS Code tool gaps (`WebFetch`, `NotebookEdit`, `WebSearch`)

---

## 1. Capability Status & Implementation Matrix

| Source Tool Intent | Host Tool Reference | Internal / Model Name | Normalization Kind | Audit Status | Implementation Summary |
|---|---|---|---|---|---|
| **`WebFetch`** | `web/fetch` | `copilot_fetchWebPage`, `fetchWebPage`, `web_fetch`, `webfetch` | `kind: 'web'` | **Mapped (Active)** | Requires non-empty `query` string and non-empty `urls` array of valid `http:` or `https:` URLs. Remote URLs are exempted from workspace `.evcrateignore` and local file privacy matching; non-HTTP(S) schemes (e.g. `file://`) and relative paths fail closed as `unqualified`. |
| **`NotebookEdit`** | `edit/editNotebook` | `copilot_editNotebook`, `editNotebook` | `kind: 'edit'` | **Mapped (Active)** | Requires non-empty `filePath`, present valid `editType` (`insert`, `edit`, `delete`), and non-empty `cellId`. Enforces Scout directory isolation and Privacy rules. |
| **`NotebookSummary`** (supporting) | `read/getNotebookSummary` | `copilot_getNotebookSummary`, `getNotebookSummary` | `kind: 'read'` | **Runtime Supported** | Normalizes notebook summary reads with `filePath`. Enforces Scout directory isolation and Privacy rules. |
| **`WebSearch`** | *(none)* | *(none)* | `unqualified` if invoked | **Dropped (Unsupported)** | VS Code Copilot Chat `0.68.0` manifest `web` tool set includes only `fetch`, `githubRepo`, and `githubTextSearch`. No generic search tool exists. Kept intentionally dropped to prevent false aliasing. |

---

## 2. Agent Impact Audit

- **`evc-scout`:** Frontmatter now includes `web/fetch` (restored from source `WebFetch`). `WebSearch` remains dropped.
- **`evc-scout-external`:** Frontmatter now includes `web/fetch` (restored from source `WebFetch`). `WebSearch` remains dropped.
- **`evc-project-manager`:** Frontmatter now includes `web/fetch` and `edit/editNotebook` (restored from source `WebFetch` and `NotebookEdit`). `WebSearch` remains dropped.
- **Agents without explicit `tools:`:** Continue inheriting default VS Code workspace tool grants via omitted frontmatter.

---

## 3. Diagnostic & Error Troubleshooting Guide

If users report errors or unexpected behavior during subagent tool use:

### Error 1: PreToolUse denies `web/fetch` as unqualified
- **Messages:**
  - `Web fetch tool requires a non-empty query string`
  - `Web fetch tool requires a non-empty urls array`
  - `Web fetch only permits http: or https: protocols; rejected "file:"`
  - `Web fetch requires valid HTTP(S) URLs; invalid URL "..."`
- **Root Cause:** Model invoked `web/fetch` without the required `query` field, passed a scalar `url` instead of a `urls` array, or supplied a local path / `file://` URI instead of an `http(s)://` URL.
- **Resolution:** Ensure tool invocations match the native Copilot Chat schema: `{ urls: ["https://..."], query: "..." }`.

### Error 2: PreToolUse denies `edit/editNotebook` due to missing/invalid `filePath`, `editType`, or `cellId`
- **Messages:**
  - `Notebook edit tool requires a non-empty filePath string`
  - `Notebook edit tool requires editType to be "insert", "edit", or "delete"`
  - `Notebook edit tool requires a non-empty cellId string`
- **Root Cause:** Model omitted a required native field (`filePath`, `editType`, or `cellId`) or supplied an unsupported `editType` (such as `"replace"`).
- **Resolution:** Pinned Copilot Chat `0.68.0` requires `{ filePath: "...", editType: "insert" | "edit" | "delete", cellId: "..." }`.

### Error 3: PreToolUse blocks `edit/editNotebook` or `read/getNotebookSummary` on Scout directory
- **Message:** `Scout policy blocked access to directory operand "...": matching .evcrateignore pattern "..."`
- **Root Cause:** Notebook `filePath` targets a canonical blocked directory (`node_modules/`, `.git/`, `dist/`, `.venv/`, etc.).
- **Resolution:** Expected behavior under EVCrate workspace isolation policy. Remote `http(s)://` URLs in `web/fetch` (such as `https://nodejs.org/dist/v20.0.0/`) are exempted from workspace directory matching.

### Error 4: User expects `WebSearch` capability in VS Code subagents
- **Symptom:** Agent unable to perform internet keyword searches, or reports search tool unavailable.
- **Root Cause:** VS Code Copilot Chat `0.68.0` does not provide an open-web search tool. EVCrate intentionally refuses to alias `WebSearch` to `web/fetch` (which requires exact URLs) or `githubTextSearch` (which searches GitHub only).
- **Resolution:**
  1. Direct agents to fetch known documentation URLs using `web/fetch`.
  2. For external web searching, connect an MCP search provider (e.g. Brave Search, Google Search) via user MCP configuration in VS Code settings.

---

## 4. Verification Evidence

- `tests/adapters/vscode-metadata-permissions.test.mjs`: Verified `WebFetch -> web/fetch` and `NotebookEdit -> edit/editNotebook` mapping, `WebSearch` dropped, and capability fixture parity.
- `tests/adapters/vscode-policy.test.mjs`: Verified `web/fetch` HTTP(S) schema validation, remote URL exemption from `/dist/` and `/.env` local blocks, `file://` rejection, `edit/editNotebook` required `filePath` + `editType` + `cellId` enforcement, and TS/CJS nullish-coalescing parity.
- `tests/adapters/vscode-behavior.test.mjs`: Verified positive and negative hook bridge execution for `web/fetch` and `edit/editNotebook`.
- Total adapter tests: **242 passed, 0 failed**.
- Qualification tests: **17 passed, 0 failed**.
- Target build manifests: **8 generated and verified across 7 targets**.
