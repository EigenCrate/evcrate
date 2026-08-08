# Journal Entry: Safety Hooks Fail-Safe and Fail-Open Refinements

**Date:** 2026-06-29  
**Context:** Hardening safety hook wrappers (`pretool-privacy-block.cjs`, `pretool-scout-block.cjs`) and migration scripts (`migrate_claude_to_codex.py`, `migrate_claude_to_gemini.py`, `distribute.sh`) for robust execution across multiple workspaces and environment setups.

---

## 1. Overview of Improvements
Following the CWD and path normalization fixes introduced on June 27, we identified several edge cases in the safety hook wrappers and migration builders that could lead to crashes, incorrect blocking, or broken fallbacks. We have refactored these wrappers to prioritize stability, fail-safe operation, and clearer debugging info.

---

## 2. Key Refinements

### A. Fail-Open Behavior on Missing Hooks
* **Issue:** If a local hook file (such as `.claude/hooks/privacy-block.cjs`) did not exist, the wrapper would attempt to execute it anyway or throw a module-not-found/spawn-error, resulting in a false-positive deny (blocking tool execution).
* **Fix:** The wrappers now verify hook existence with `fs.existsSync(sourceHook)`. If the target hook does not exist locally (and, for Gemini, is also missing globally), the wrapper logs an allow response (`decision: "allow"` or `{}`) and exits with `0`. This guarantees the tool-use hook does not crash the environment if the hook codebase is partially migrated or deleted.

### B. Fail-Closed on Any Spawn/Execution Error
* **Issue:** Previously, wrappers only blocked tool-use if the underlying hook process exited with status `1` or `2`. Any other exit status or runtime crash (e.g. Node not found, execution timeout, or permission error) could bypass the check.
* **Fix:** The wrapper now uses a strict white-list for allow: the child process must exit with code `0` and have no error (`result.status === 0 && !result.error`). Any non-zero status, process crash, or system spawn error is treated as a `deny` outcome (fail-closed security).

### C. Detailed Deny Reasons & Error Capturing
* **Issue:** When a hook block occurred, the permission decision reason was often a generic "Blocked by migrated Claude hook", making debugging difficult if the block was actually a Node crash.
* **Fix:** The wraps now capture and propagate the exact error message (`result.error.message` or `result.error`) as well as the standard error output:
  `reason: reason || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.'`

### D. Corrected Global Fallback Lookup in Gemini Migration
* **Issue:** The Python migration script for Gemini (`migrate_claude_to_gemini.py`) previously constructed the fallback path using the source hook file name (e.g. `scout-block.cjs`), which resulted in lookups for `~/.gemini/config/hooks/scout-block.cjs` instead of the actual wrapper name `~/.gemini/config/hooks/before-tool-scout-block.cjs`.
* **Fix:** We updated the `create_block_bridge` generator to accept a `wrapper_name` parameter, ensuring that global hook resolution searches for the correct wrapper filename.

### E. Performance Optimization in Distribute Script
* **Issue:** The wrapper injected during `distribute.sh` execution repeatedly called `findProjectRoot()`, leading to redundant filesystem traversals.
* **Fix:** We cached the project root in a local variable `const projectRoot = findProjectRoot();` during the initial module load.

---

## 3. Implementation Matrix

| File | Change Type | Description |
|---|---|---|
| `.codex/hooks/pretool-privacy-block.cjs` | Logic Refinement | Fail-open if source hook missing. Only allow on status `0` and `!error`. Capture `result.error`. |
| `.codex/hooks/pretool-scout-block.cjs` | Logic Refinement | Fail-open if source hook missing. Only allow on status `0` and `!error`. Capture `result.error`. |
| `distribute.sh` | Wrapper Template Refinement | Cache project root. Fail-open if hook file missing. Only allow on status `0` and `!error`. |
| `migrate_claude_to_codex.py` | Generator Refinement | Sync wrapper templates with the refined `pretool-*.cjs` behavior. |
| `migrate_claude_to_gemini.py` | Generator Refinement | Pass `wrapper_name` to `create_block_bridge` for correct fallback lookup. Sync with refined allow/deny status checking. |

---

## 4. Verification & Testing
* **Allow/Deny Validation**: Verified that successful hooks (exit status `0`) let tools pass, while blocked hooks (exit status `2`) and crashed hooks (exit status `1`) correctly block tools and return appropriate JSON decision output.
* **Missing Hook Fallback**: Verified that deleting the local hook triggers fail-open behavior rather than crashing the tool-use cycle.
