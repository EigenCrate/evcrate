# Snyk common-folder validation

## Exercised (Current Head Verification)

- `npm test` in `ext/snyk-expert`: **35/35 tests passed** across 7 suites, 0 failures, 0 skipped. Covers:
  - Common `.agents` installation, collision detection, and `--force --yes` authorization.
  - Restored lightweight `--help` and `--version` CLI behavioral checks.
  - Non-destructive legacy `.claude` installation detection and migration warning output.
  - Hardened handling of `.claude` as a regular file, dangling symlinks, and non-directory ancestors without `ENOTDIR` crashes.
  - Cross-directory target resolution preserving pre-existing files.
- Actual Node v24.16.0 `--check`: all 10 implementation and test files passed syntax verification.
- Actual installer CLI: dry-run wrote nothing; fresh install produced common `.agents`; repeat skipped identical resources; legacy `.claude` migration warning emitted target-qualified absolute paths with safe manual review guidance (no raw `rm -rf`); non-directory `.claude` files install cleanly without errors.
- Actual `npm pack --json --pack-destination <temporary>`: 21 packed files, all 11 `.agents` runtime assets, package `README.md`, `docs/usage.md`, `bin`, and `lib`; zero `.claude/` files.
- Exact bundle cleanliness: `ext/snyk-expert/.claude/` (9 legacy files) completely removed; package contains exclusively `.agents/`.

Full actual CLI argv/cwd/exits/stdout/stderr retained in [installer-smoke.json](../installer-smoke.json). Initial smoke script incorrectly assumed array-shaped npm JSON; it stopped after successful packaging. Read actual object-by-package-name output and resumed extraction/install only; earlier successful operations were not rerun.

## Review and final checks

Independent [quality review](quality-review.md): 9/10 for this scoped authoring/cutover, zero critical/high issues. Inherited concurrent-writer race limitation remains: installation requires trusted exclusive destination ownership. Historical README/public-release caveat remains; current installer now prints the authoritative packaged usage-guide path. Residual diagnostic-wording predicates were removed while preserving blocked-destination/throw behavior.
Final `npm test` after all review cleanups and hardening: **35/35 passed**. Node syntax checks across all 10 files passed. Cross-directory smoke test verified target-scoped warning output without raw `rm -rf`.

## Superseding Amendment — Removal of Legacy `.claude/`

On 2026-10-10, the user explicitly directed the complete removal of `ext/snyk-expert/.claude/` and full alignment of all documentation to keep exclusively `.agents/`.
- Earlier authoring reports and notes mentioning retention of `.claude/` in the package source reflect the initial Phase 04 milestone and are explicitly superseded by this full removal.
- `ext/snyk-expert/.claude/` (9 files) has been deleted from version control.
- Package `README.md`, `docs/usage.md`, `bin/install.js`, and repository `docs/snyk-expert-cli.md` now describe exclusively the `.agents/` runtime layout.
- The legacy detection logic in `lib/install-planner.js` remains active solely to alert target projects that previously installed snyk-expert into `.claude/` during earlier releases, providing safe target-qualified manual migration instructions.
## Limits

Snyk absent PATH; no authorized target repository, organization/endpoint, secure credential injection or Code source-transmission authority supplied. No scanner installed, no login performed, no authenticated scan, target upgrade, live vulnerability fix or native host discovery/permission qualification claimed. Installed skill prompt behavior is distinct from real scanner behavior.

Temporary installer/packed-artifact directories were removed after both reviewer terminal reports; removal observed and source/historical paths untouched.

## Unresolved questions

No implementation or local approval question remains. Live qualification still requires operator-owned target/scanner/auth/scope prerequisites; public publication remains separately gated.
