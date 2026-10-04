# Code Review: Phase 05 Darwin Runtime Integration

**Date:** 2026-10-04  
**Plan:** `plans/261003-1527-advisor-node-only-launch/phase-05-darwin-runtime-integration.md`  
**Reviewer:** Senior Software Engineer (Code Quality & Security)  
**Score:** 6.5 / 10  
**Status:** Remediation Required (3 Critical Issues, 3 Warnings, 2 Suggestions)

---

## Scope
- **Files reviewed:**
  - `.evcrate/source/.evcrate/bin/lib/advisor/state-io.cjs` (+245, -4)
  - `.evcrate/source/.evcrate/bin/lib/advisor/darwin-platform.cjs` (+30, -7)
  - `.evcrate/source/.evcrate/bin/lib/advisor/state-baseline.cjs` (+171, -10)
  - `.evcrate/source/.evcrate/bin/lib/advisor/history-store.cjs` (+352, -11)
  - `.evcrate/source/.evcrate/bin/lib/advisor/history-query.cjs` (+32, -13)
  - `.evcrate/source/.evcrate/bin/lib/advisor/history-prune.cjs` (+69, -0)
  - `.evcrate/source/.evcrate/bin/lib/advisor/isolated-workspace.cjs` (+159, -0)
  - `.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs` (+19, -0)
  - `tests/advisor-controller/state-io.test.cjs` (+44, -0)
  - Supporting bridge C files: `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/{advisor-native.c,storage.c,process.c,advisor-native.h}`
- **Lines of code analyzed:** ~1,120 modified lines; ~3,800 surrounding/bridge lines.
- **Review focus:** Acceptance criteria D03, D04, D05, D06; security, resource leaks, error mapping, CAS/lock safety, host isolation, YAGNI/KISS/DRY.
- **Updated plans:**
  - `plans/261003-1527-advisor-node-only-launch/phase-05-darwin-runtime-integration.md`
  - `plans/261003-1527-advisor-node-only-launch/progress.md`

---

## Overall Assessment
Solid architectural boundaries achieved: Darwin execution branch completely gated (`process.platform === 'darwin'`), zero overhead or addon loading on Linux/Windows (D06 preserved; 244/244 Linux tests pass cleanly). Strict canonical path and SHA-256 derivation shared uniformly across `state-io.cjs`, `history-store.cjs`, and `controller.cjs`. Capability chains (`verifyChain`) prevent symlink/ancestor swaps (D03, D05). Required process self-token verification precedes lock/pending writes (D04).

However, static analysis identified **3 Critical Issues** that break runtime execution on Darwin:
1. `darwin.list()` returns `Array<string>`, but `history-store.cjs` and `isolated-workspace.cjs` treat elements as `{ name, type }` objects (`entry.name`, `entry.type` evaluate to `undefined`), completely breaking history scans and workspace cleanup on macOS.
2. `writeExclusive` native code throws `STATE_IO_FAILED` on `EEXIST`, but JS catches expect `EEXIST` or `STATE_CONFLICT`, permanently blocking stale lock recovery.
3. `export_openRoot` in `storage.c` allocates intermediate capabilities for each path component without exposing them to JS or releasing them in `close`/`finalize_capability`, causing permanent file descriptor and heap memory leaks.

---

## Critical Issues

### 1. [CRITICAL] `darwin.list(dirCap)` Return Type Mismatch in `history-store.cjs` and `isolated-workspace.cjs`
- **Location:**
  - `.evcrate/source/.evcrate/bin/lib/advisor/history-store.cjs:551-578`
  - `.evcrate/source/.evcrate/bin/lib/advisor/isolated-workspace.cjs:117-124`
- **Mechanism:**
  - In `storage.c:export_list` (lines 799–801), the native addon constructs an array of plain strings (`napi_create_string_utf8(env, dp->d_name, ...)`).
  - In `history-store.cjs:552`, code accesses `const tName = tEntry.name` and checks `tEntry.type !== 'directory'`. Because `tEntry` is a string, `tEntry.name` and `tEntry.type` are `undefined`. `tEntry.type !== 'directory'` evaluates to `true`, causing every task directory to be skipped. Same bug at lines 561 (`cEntry.name`) and 577 (`ent.name`, `ent.type`).
  - In `isolated-workspace.cjs:118`, `const leaf = entry.name;` sets `leaf` to `undefined`. `darwin.statEntry(dirCap, undefined)` fails or stats `"undefined"`, immediately throwing `CLEANUP_UNCONFIRMED`.
- **Impact:**
  - `scanProjectRecords` returns `[]` on Darwin, rendering history listing, metrics, pruning, and export completely inoperative.
  - Non-empty workspace cleanup consistently fails on Darwin.
- **Fix:**
  In `history-store.cjs`:
  ```javascript
  for (const tEntry of tasks) {
    const tName = typeof tEntry === 'string' ? tEntry : tEntry.name;
    if (!UUID.test(tName)) continue;
    const tCap = darwin.openDirectory(pCap, tName, false);
    if (!tCap) continue;
  ```
  In `isolated-workspace.cjs`:
  ```javascript
  for (const entry of entries) {
    const leaf = typeof entry === 'string' ? entry : entry.name;
    let st;
    try { st = darwin.statEntry(dirCap, leaf); }
  ```

---

### 2. [CRITICAL] Native `writeExclusive` Throws `STATE_IO_FAILED` on `EEXIST`, Bypassing Stale Lock Recovery
- **Location:**
  - `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/storage.c:609-613`
  - `.evcrate/source/.evcrate/bin/lib/advisor/state-io.cjs:481-484`
  - `.evcrate/source/.evcrate/bin/lib/advisor/history-store.cjs:250-253`
- **Mechanism:**
  - In `storage.c:610`, when `openat(..., O_CREAT | O_EXCL, ...)` fails due to file existence (`EEXIST`), the C code throws `throw_advisor_error(env, "STATE_IO_FAILED", "openat exclusive create failed")`.
  - In `state-io.cjs:483` and `history-store.cjs:252`:
    ```javascript
    try { stat = darwinWriteExclusive(task.dirCap, file, bytes); }
    catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'STATE_CONFLICT') throw error;
      const old = darwinLockRecord(task.dirCap, file);
      if (processStatus(old.value.process) !== 'dead') fail('STATE_LOCKED');
    ```
    Because `error.code === 'STATE_IO_FAILED'`, it is immediately re-thrown. The reaper recovery branch is never entered.
- **Impact:** Stale locks left by crashed or terminated processes can never be reaped on Darwin, leading to permanent `STATE_IO_FAILED` / `AUDIT_DEGRADED` lockout.
- **Fix:**
  Map the error in `darwin-platform.cjs:writeExclusive`:
  ```javascript
  function writeExclusive(directory, leaf, bytes) {
    const native = getNativeAddon();
    try {
      const raw = native.writeExclusive(directory, leaf, bytes);
      return wrapStat(raw);
    } catch (error) {
      if (error?.code === 'STATE_IO_FAILED' && error?.message?.includes('openat exclusive create failed')) {
        error.code = 'STATE_CONFLICT';
      }
      throw error;
    }
  }
  ```
  Alternatively/additionally, update `storage.c:610` to check `if (darwin_errno == DARWIN_EEXIST) throw_advisor_error(env, "STATE_CONFLICT", "File already exists");` if native C sources are rebuilt.

---

### 3. [CRITICAL] Unbounded File Descriptor and Heap Memory Leak in `openRoot`
- **Location:**
  - `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/storage.c:100-286`
  - `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/advisor-native.c:36-51`
- **Mechanism:**
  - `export_openRoot` splits an absolute path into components and iteratively opens each with `openat`, allocating an `AdvisorCap` struct and setting `next_cap->parent = current_cap`.
  - Only the final leaf `current_cap` is returned to JS and wrapped via `napi_wrap` with `finalize_capability`.
  - When `darwin.close(res.directory)` is called, `export_close` only closes the leaf capability `cap->fd`. It never walks `cap->parent`.
  - Neither `export_close` nor `finalize_capability` closes the parent descriptors or frees the parent `AdvisorCap` structs.
- **Impact:** Every invocation of `darwin.openRoot` leaks $N-1$ open file descriptors and heap structs. With frequent calls across baseline capture, history queries, and controller state operations, the process rapidly exhausts file descriptors (`EMFILE`).
- **Fix:**
  In `storage.c:export_close` (and `finalize_capability`), recursively close unmanaged parent descriptors and free structs:
  ```c
  AdvisorCap *p = cap->parent;
  while (p) {
      AdvisorCap *next_p = p->parent;
      if (!p->closed && p->fd >= 0) close(p->fd);
      if (p->leaf_name) free(p->leaf_name);
      free(p);
      p = next_p;
  }
  cap->parent = NULL;
  ```

---

## High Priority Findings (Warnings)

### 1. [WARNING] `removeEmptyDirectory` Native Signature Enforces Unused 3rd Argument
- **Location:** `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/storage.c:815`
- **Mechanism:** `export_removeEmptyDirectory` checks `if (... || argc < 3) throw_advisor_error(...)` but never references `argv[2]` in its body.
- **Impact:** Any call with 2 arguments fails with `STATE_IO_FAILED`. While `darwin-platform.cjs:removeEmptyDirectory(parent, leaf, expectedIdentity)` masks this by passing `undefined` as 3rd parameter, callers bypassing the wrapper or refactorings will fail unexpectedly.
- **Fix:** Allow `argc >= 2` in `export_removeEmptyDirectory`.

### 2. [WARNING] Double-Close Error Swallowing Pattern in `history-prune.cjs`
- **Location:** `.evcrate/source/.evcrate/bin/lib/advisor/history-prune.cjs:87-99`
- **Mechanism:** `history-prune.cjs` explicitly calls `darwin.close(cDir.dirCap)` at line 87, and then line 99 executes `finally { try { cDir.close(); } catch {} }`.
- **Impact:** Because `unwrap_capability` throws `STATE_IO_FAILED` ("Capability is closed"), the second close throws and relies on empty `catch {}` suppression. While safe at runtime, relying on swallowed exceptions for planned control flow is brittle.
- **Fix:** Remove already-closed capabilities from `cDir.caps` before directory removal or make `darwin.close()` an idempotent no-op in JS/C.

### 3. [WARNING] Missing Test for Null Self-Token Before Lock Acquisition
- **Location:** `tests/advisor-controller/state-io.test.cjs:435-477`
- **Mechanism:** The test suite verifies `evaluateDarwinProcessSnapshot` host-independently, but does not assert that `acquire` or `acquireHistoryLock` rejects with `STATE_IO_FAILED` / `AUDIT_DEGRADED` when `processIdentity().start === null`.
- **Impact:** D04 acceptance criterion specifies: "Required Darwin process self-token precedes lock/pending writes." Verifying the tri-state decision alone leaves the caller integration untested.

---

## Medium Priority Improvements
1. **Defensive Array Reversal in Capability Cleanup:**
   - In `state-io.cjs:openTask`, `history-store.cjs:openConsultationDir`, and `stateLocation`, `caps.reverse()` mutates the array in place. If `close()` is ever invoked more than once, subsequent invocations iterate in the original order. Prefer `while (caps.length) darwin.close(caps.pop())` or non-mutating `caps.slice().reverse()`.
2. **Explicit Typings / JSDoc for `darwin-platform.cjs:list`:**
   - Clearly document whether `list()` returns `string[]` of entry names or entry descriptor objects to prevent caller confusion.

---

## Low Priority Suggestions
1. **Remove Unused Imports:** Ensure `darwinLockRecord` and `darwinRemoveOwned` in `state-io.cjs` exports are cleanly documented if only internal to `history-store.cjs`.
2. **Standardize Sync Checks:** In `storage.c:export_sync`, `fsync` is used; consider `fcntl(fd, F_FULLFSYNC)` for Apple durability requirements where high integrity is required.

---

## Positive Observations
- **Host Isolation (D06):** Complete isolation maintained. Zero platform leaks or runtime addon imports on Linux/Windows.
- **Verification Chains (D03, D05):** `darwin.verifyChain` traversal up to root provides robust protection against directory swap attacks.
- **System Aliases (D05):** Exact handling of `/var` -> `/private/var` and `/tmp` -> `/private/tmp` with immediate symlink rejection on other paths.
- **Shared Canonical Identity:** Exact SHA-256 project ID convergence across controller, state, and history.
- **Deterministic Cleanup:** Capabilities consistently closed in `finally` blocks across baseline, history, state, and isolated workspace operations.

---

## Recommended Actions
1. **Fix `list` consumer parsing in `history-store.cjs` and `isolated-workspace.cjs`:**
   - Adapt `tEntry`, `cEntry`, and `ent` to handle string results directly.
   - Use `openDirectory` or `statEntry` to verify directory/file types.
2. **Map `writeExclusive` error code in `darwin-platform.cjs`:**
   - Convert `STATE_IO_FAILED` on exclusive create collision to `STATE_CONFLICT` so stale lock recovery can execute.
3. **Patch `storage.c` / `advisor-native.c` to prevent ancestor leaks in `openRoot`:**
   - Ensure `export_close` or `finalize_capability` recursively frees unmanaged parent capabilities.
4. **Add Unit Test for Null Self-Token Guard in `tests/advisor-controller/state-io.test.cjs`:**
   - Test that lock acquisition rejects before file writes when `processIdentity().start === null`.

---

## Metrics
- **Review Score:** 6.5 / 10
- **Linux Tests Passed:** 244 / 244 (`test:advisor-controller`), 109 / 109 (`test:adapters`)
- **Critical Issues:** 3
- **Warnings:** 3
- **Suggestions:** 2

---

## Unresolved Questions
1. Should `storage.c` C sources be updated and rebuilt through Phase 04 compile-only authority for the `openRoot` parent leak, or can an initial JS workaround manage top-level roots? (Recommendation: update C source and rebuild both binaries).
2. Should `export_list` in native C be updated to return `{ name, type }` objects, or should JavaScript consumers standardize on receiving `string[]`? (Recommendation: standardizing JS consumers on `string[]` matches existing Linux `fs.readdirSync` behavior and keeps native C zero-copy).
