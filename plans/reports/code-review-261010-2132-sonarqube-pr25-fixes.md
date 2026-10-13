# Code Review Report: SonarQube Common Skill PR #25 Fixes

**Date:** 2026-10-10  
**Target Worktree:** `/home/loidinh/WS/worktrees/evcrate-sonarqube-report-worktree`  
**Package:** `ext/sonarqube-test-quality`  
**Branch:** `feat/sonarqube-report-worktree`  

## Code Review Summary

### Scope
- Files reviewed:
  - `ext/sonarqube-test-quality/lib/install.js`
  - `ext/sonarqube-test-quality/bin/install.js`
  - `ext/sonarqube-test-quality/package.json`
  - `ext/sonarqube-test-quality/README.md`
  - `ext/sonarqube-test-quality/tests/install.test.mjs`
- Lines of code analyzed: ~814 lines
- Review focus: Verification of four PR #25 code review fixes (overwrite prevention, transactional rollback, Node.js compatibility, interactive exit code) and six new regression unit tests
- Updated plans: None (`Plan: none`)

### Overall Assessment
Code quality high. Fail-closed, pure ESM, dependency-free architecture adhered to. All four PR #25 review findings verified:
1. Destination overwrite prevention: Exclusive lock (`.install.lock`) with atomic `O_CREAT | O_EXCL`, publication via `COPYFILE_EXCL`, pre-publish revalidation under lock.
2. Transactional rollback: Staged files in `.tmp-${uuid}` with `flag: 'wx'`, replaced file backup in memory, full rollback removing additions and restoring replaced files on error.
3. Node compatibility: `engines.node >=18.11.0` in `package.json`, runtime `isSupportedNodeVersion()` check before `parseArgs()`, documented in `README.md`.
4. Interactive cancellation: `process.exitCode = 1` set when user declines prompt.
5. Unit tests: 6 regression tests added, total 28 tests pass with 0 failures.

Identified 1 Medium-priority directory pruning edge case during rollback and 2 Low-priority recommendations.

---

### Critical Issues
None. Zero data loss, corruption, or security risks identified.

---

### High Priority Findings
None. Race conditions and locking mechanisms properly mitigated.

---

### Medium Priority Improvements

#### 1. Incomplete directory pruning during rollback when publication fails mid-flight
- **Location:** `ext/sonarqube-test-quality/lib/install.js:244-246`
- **Problem:**
  Staging creates directory paths (`references/`, `scripts/`) for all actions. If failure occurs during publish before any file in a subdirectory is committed (e.g., failure on file 3), `createdFiles` only contains files from preceding directories. The rollback catch block calls `pruneEmptyDirectories` only on `createdFiles`:
  ```javascript
  for (const createdPath of createdFiles) {
    pruneEmptyDirectories(path.dirname(createdPath), plan.installationRoot);
  }
  ```
  Temporary files in `temporaryPaths` are deleted, but uncommitted subdirectories (`scripts/`) remain empty on disk. Because `sonarqube-test-quality` still contains an empty `scripts/` directory, `finally` cannot prune `path.dirname(lockPath)`. Empty directory skeletons remain after aborted install.
- **Remedy:**
  Prune directories using both `temporaryPaths` and `createdFiles`:
  ```javascript
  for (const filePath of [...temporaryPaths, ...createdFiles]) {
    pruneEmptyDirectories(path.dirname(filePath), plan.installationRoot);
  }
  ```

---

### Low Priority Suggestions

#### 1. Test 6 does not exercise active `backups` restoration loop
- **Location:** `ext/sonarqube-test-quality/tests/install.test.mjs:307-334`
- **Observation:**
  Test 6 simulates failure at `index === 0` in `_beforePublish`. Because index 0 throws before `fs.renameSync` executes, `backups` is empty when the catch block executes. The restore path `fs.writeFileSync(destinationPath, existingBytes)` is not exercised by this test.
- **Remedy:**
  Add or update a test with two replacement actions where `index === 1` throws, asserting file 0 is actively restored from `backups`.

#### 2. Node.js prerelease version tag parsing
- **Location:** `ext/sonarqube-test-quality/lib/install.js:10-14`
- **Observation:**
  `version.replace(/^v/, '').split('.').map(Number)` turns prerelease tags (e.g. `18.11.0-rc1`) into `NaN` for `patch`. `NaN >= 0` evaluates to `false`.
- **Remedy:**
  Strip prerelease suffixes prior to split: `version.replace(/^v/, '').split('-')[0].split('.').map(Number)`.

---

### Positive Observations
- **Atomic lock isolation:** `acquireLock` invoked prior to `try` block; foreign locks never unlinked in `finally`.
- **Fail-closed addition:** `COPYFILE_EXCL` prevents silent overwrite of concurrently added files.
- **In-flight verification:** Re-inspects destination status and byte identity under lock immediately before publication.
- **Post-install verification:** Every file re-read and verified for byte equivalence post-commit.
- **Testable TTY simulation:** `FORCE_TTY=1` enables deterministic automated testing of interactive prompt flows.

---

### Recommended Actions
1. Update `lib/install.js` rollback cleanup loop to prune directory paths from `temporaryPaths` as well as `createdFiles`.
2. Add multi-file replacement rollback test to cover `fs.writeFileSync` backup restoration path.
3. Sanitize prerelease tags in `isSupportedNodeVersion`.

---

### Metrics
- Type Coverage: N/A (Standard JS / Pure ESM)
- Test Coverage: 28/28 tests passing (100% pass rate)
- Linting Issues: 0

---

### Unresolved Questions
None.
