# Journal Entry: Safety Hooks CWD and Path Normalization Fix

**Date:** June 27, 2026  
**Context:** Fixing tool blocking issues in multi-workspace setups (e.g., `dam-hopper`) caused by safety hooks.

---

## 1. Summary of Changes
We made critical updates to both the distribution script ([distribute.sh](file:///mnt/data/ws/sharing/devkit/distribute.sh)) and the migration script ([migrate_claude_to_gemini.py](file:///mnt/data/ws/sharing/devkit/migrate_claude_to_gemini.py)) to fix safety hooks (like `scout-block` and `privacy-block`) from incorrectly blocking tools or crashing the execution environment.

### The Problem
* The safety hooks rely on the `ignore` Node.js library to scan paths against exclude patterns.
* The `ignore` library expects paths relative to the project root directory. When given absolute paths (such as `/mnt/data/ws/sharing/dam-hopper/node_modules`), it throws a `RangeError: path should be a path.relative()d string`.
* In the Antigravity (Gemini) environment, tools specify targets using absolute paths (e.g., `AbsolutePath` in `view_file` or `TargetFile` in `replace_file_content`). This mismatched format caused the hooks to crash (returning exit code `1`).
* Additionally, when operating across multiple workspaces, relying on `process.cwd()` or default environment variables led to incorrect project root resolutions, producing incorrect relative path conversions.

### The Fixes
1. **Workspace and CWD-Aware Project Root Resolution (`findProjectRoot` / `resolveHookSource`)**:
   We modified the hook wrapper templates to parse the incoming JSON payload from standard input. The wrapper now dynamically extracts execution context from `data.workspacePaths` and `data.cwd` to determine the correct project root directory, falling back to environment variables or directory traversal only if these are unavailable.
2. **Recursive Argument Mapping and Path Normalization (`mapKeys`)**:
   A new `mapKeys` utility was added to recursively traverse the tool execution arguments.
   * Any string starting with the normalized project root directory is stripped of its prefix to create a relative path.
   * Parameter keys are standardized to match the names expected by legacy Claude Code hooks (e.g., `AbsolutePath`, `TargetFile`, `SearchPath`, and `DirectoryPath` are mapped to `path`, while `CommandLine` is mapped to `command`).
3. **Hardened Error Handling and Global Hook Fallback**:
   * Wrappers now check if the hook execution returned a status of `2` or `1` (which signals either a block decision or a crash) and treat both as a `deny` outcome.
   * In [migrate_claude_to_gemini.py](file:///mnt/data/ws/sharing/devkit/migrate_claude_to_gemini.py), we added fallback logic: if a local workspace hook crashes or fails (status `1` or `error`), the wrapper attempts to run the global fallback hook located in `~/.gemini/config/hooks/`.

---

## 2. Impact of the Fix
* **Cross-Workspace Support**: Tools now execute successfully across multiple workspaces (like `dam-hopper`) because paths are correctly converted relative to the active workspace's root.
* **No More RangeErrors**: The `ignore` library receives relative paths in all scenarios, preventing crashes.
* **Fail-Closed Security**: If a local hook crashes or fails, it defaults to a `deny` status and attempts to fall back to the global safety hook, ensuring the development environment remains secure and consistent.

---

## 3. Workarounds and Hardcoded Implementation Details
The following workarounds and hardcoded elements were implemented to ensure bridge compatibility:
* **Key Mappings**: The mapping of Antigravity's parameter names (`AbsolutePath`, `TargetFile`, `SearchPath`, `DirectoryPath` $\rightarrow$ `path`, and `CommandLine` $\rightarrow$ `command`) is hardcoded in the wrappers.
* **Fallback Priority**: The directory lookup sequence (`data.workspacePaths[0]` $\rightarrow$ `data.cwd` $\dots$) is hardcoded inside the `findProjectRoot` / `resolveHookSource` implementations.
* **Status Hardcoding**: Both exit status `1` (general error/crash) and `2` (deny) from the underlying hook process are mapped to `decision: 'deny'` to enforce fail-closed security.
* **Global Path Resolution**: The path `os.homedir() + "/.gemini/config/hooks/"` is hardcoded as the global hooks fallback directory.
