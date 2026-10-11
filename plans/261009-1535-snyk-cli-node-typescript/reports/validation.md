# Snyk common-folder validation

## Exercised (Current Head Verification)

- `npm test` in `ext/snyk-expert`: **26/26 tests passed** across 6 suites, 0 failures, 0 skipped. Covers:
  - Common `.agents` installation, collision detection, and `--force --yes` authorization.
  - Restored lightweight `--help` and `--version` CLI behavioral checks.
  - Cross-directory target resolution preserving pre-existing files.
- Actual Node v24.16.0 `--check`: all 7 implementation files passed syntax verification.
- Actual installer CLI: dry-run wrote nothing; fresh install produced common `.agents`; repeat skipped identical resources; non-interactive `--force` without confirmation refused with exit 1; explicit `--force --yes` restored bundle bytes.
- Actual `npm pack --json --pack-destination <temporary>`: 21 packed files, all 11 `.agents` runtime assets, package `README.md`, `docs/usage.md`, `bin`, and `lib`.
- Exact bundle cleanliness: package contains exclusively `.agents/`.

Full actual CLI argv/cwd/exits/stdout/stderr retained in [installer-smoke.json](../installer-smoke.json). Initial smoke script incorrectly assumed array-shaped npm JSON; it stopped after successful packaging. Read actual object-by-package-name output and resumed extraction/install only; earlier successful operations were not rerun.

## Review and final checks

Final `npm test`: **26/26 passed**. Node syntax checks across all 7 implementation files passed.

## Superseding Amendment — Exclusively `.agents/` Distribution

On 2026-10-10, the user explicitly directed that all legacy resources be fully retired, keeping exclusively `.agents/` across the package, installer, tests, and documentation.
- Package `README.md`, `docs/usage.md`, `bin/install.js`, and repository `docs/snyk-expert-cli.md` describe exclusively the `.agents/` runtime layout.
- All installer planning, formatting, and tests operate cleanly on the `.agents/` destination.
## Limits

Snyk absent PATH; no authorized target repository, organization/endpoint, secure credential injection or Code source-transmission authority supplied. No scanner installed, no login performed, no authenticated scan, target upgrade, live vulnerability fix or native host discovery/permission qualification claimed. Installed skill prompt behavior is distinct from real scanner behavior.

Temporary installer/packed-artifact directories were removed after both reviewer terminal reports; removal observed and source/historical paths untouched.

## Unresolved questions

No implementation or local approval question remains. Live qualification still requires operator-owned target/scanner/auth/scope prerequisites; public publication remains separately gated.
