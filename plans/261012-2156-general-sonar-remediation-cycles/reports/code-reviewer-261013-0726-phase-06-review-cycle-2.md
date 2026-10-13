## Code Review Summary — Phase 06 cycle 2

### Scope
- Files: ext/sonarqube-test-quality/{lib/install.js (470), bin/install.js (109), package.json, README.md, tests/install.test.mjs (886)}
- Focus: post-fix re-review, explicit agents|claude|both transactional installer
- Plan updated: phase-06-transactional-two-skill-installer-and-package.md (status complete, todos checked)

### Score: 8.5/10

### Critical issues
None.

### Warnings
1. Stale lock = permanent block after crash/SIGKILL/SIGINT. No signal handler; no remediation hint in error. Legacy lock lives inside installed skill dir (stray `.install.lock` remains). Matches plan ("no stale auto-delete") + README documents it; add to error msg: "remove lock if no installer running".
2. `validateAncestors` rejects ANY symlinked ancestor of `--directory` (macOS `/var`,`/tmp`→`/private/*`, symlinked workspace dirs). Over-strict for user-chosen root; tests using `os.tmpdir()` will fail on macOS. Consider `realpath` of project root once, then guard only below it. [INFERENCE: macOS not run]
3. Installed mode = source mode (`lstat.mode` incl. type bits, no mask). Repo checkout has 0600 files -> installs 0600 from a git checkout (observed in smoke). Npm tarball normalises, so packed path OK. Mask `& 0o777` and consider normalising to 0644/0755.
4. Test seams in prod API/CLI (`_beforePublish`, `_afterStage`, `FORCE_TTY` env). Plan permits `_beforePublish`; `_afterStage`/`FORCE_TTY` additions are scope creep (low risk).

### Suggestions
- DRY: derive destination from `skills/<name>/<source>` / inventory grouping instead of 18 repeated full literals; `rootMap` agents/claude entries duplicate; source walk in planInstallation duplicates `inspectDestination` walk — extract shared `assertRegularFileChain`.
- Replace path rename is not atomic vs concurrent writer between recheck and rename (documented residual TOCTOU; acceptable).
- Empty `catch {}` in prune/release hide errors; fine for best-effort but comment.
- Final CLI message for single target prints `<root>/skills` ok.

### Positive
- Plan/exec split, dry-run creates nothing, O_EXCL locks, ordered acquisition + reverse release, only-owned lock unlink via ino/dev.
- Add path uses COPYFILE_EXCL; rollback verifies bytes before delete/restore, refuses symlinks, reports partial rollback with paths.
- Owned-directory-only pruning; pre-existing empty dirs preserved.
- Tests independent of production map (EXPECTED_ASSETS), fault injection for chmod/rename/staging/symlink races, packed-tarball smoke.
- package.json files allowlist covers all 18 inventory sources (verified via `npm pack --dry-run`: 23 files, none missing).

### Plan completeness
All 4 todo items done; success criteria met per tests+smoke. No TODO comments in changed files.

### Validation
- `npm test` (ext/sonarqube-test-quality): 99 tests/7 suites, 99 pass, 0 fail.
- `npm pack --dry-run`: 23 files, all 18 inventory sources included.
- CLI smoke in disposable dir: `-t both -n` no writes; install = 36 files; reinstall = 0 installed/36 unchanged; only `.agents`,`.claude` in project root (lock files cleaned).

### Metrics
- Type coverage n/a (JS). Lint not configured in package. Coverage not measured.

### Unresolved questions
- Should symlinked ancestors of project root be allowed (realpath) for macOS?
- Should lock error text document manual stale-lock removal?
- Should installed file modes be normalised?
