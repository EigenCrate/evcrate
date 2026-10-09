# Snyk common-folder validation

## Exercised

- `npm test` in `ext/snyk-expert`: 24 tests passed, zero failures/cancelled/skipped. Existing collision/HOME/symlink/idempotence protections exercised at the new `.agents` destination. Wording/version/count-pinning tests removed; target-specific tree preservation added.
- Actual Node v24.16.0 `--check`: seven installer implementation files passed. No TypeScript implementation changed; root EVCrate compiler/build not invoked.
- Exact SHA-256 comparison: thirteen captured protected files unchanged (eight old runtime resources, old README, root architecture/changelog/roadmap and user's `.gitignore`). Identities retained in [protected-baseline.json](../protected-baseline.json).
- Actual installer CLI: dry-run wrote nothing; fresh install produced common `.agents`; repeat skipped identical resources; changed nested CLI-reference collision refused with exit 1 and preserved user bytes; noninteractive `--force` without confirmation refused with exit 1; explicit `--force --yes` restored bundle bytes.
- Actual `npm pack --json --pack-destination <temporary>` and `tar` extraction: 21 packed files, eleven common runtime assets, no `.claude` runtime payload. Extracted artifact installer ran successfully; all runtime bytes matched source and 28 installed local reference links resolved.
- The package contains exclusively `.agents/`; `ext/snyk-expert/.claude/` was completely removed, and `README.md` was rewritten to document the `.agents/` bundle and skills.

Full actual CLI argv/cwd/exits/stdout/stderr retained in [installer-smoke.json](../installer-smoke.json). Initial smoke script incorrectly assumed array-shaped npm JSON; it stopped after successful packaging. Read actual object-by-package-name output and resumed extraction/install only; earlier successful operations were not rerun.

## Review and final checks

Independent [quality review](quality-review.md): 9/10 for this scoped authoring/cutover, zero critical/high issues. Inherited concurrent-writer race limitation remains: installation requires trusted exclusive destination ownership. Historical README/public-release caveat remains; current installer now prints the authoritative packaged usage-guide path. Residual diagnostic-wording predicates were removed while preserving blocked-destination/throw behavior.

Final `npm test` after review cleanup: 24/24 passed. Actual post-review fresh install and Node syntax check passed; printed current-guide path exists and thirteen protected identities still match. Evidence: [post-review-smoke.json](../post-review-smoke.json).

Independent [behavior smoke](behavior-smoke.md): seven stateless model-completion scenarios passed, zero defects reported, eleven copied resource hashes unchanged. Cases cover setup without report/target, exit-1 findings with `ok:false`, missing workspace coverage, clean Code JSON omission, missing pnpm lockfile, read-only/gated ESM/types changes, and missing Code upload authority with inert report injection. Selected context files, not full runtime/reference loading, were supplied directly; no tools were granted. This is constructed prompt behavior, not native permissions or real scans.

User selected **Approve local delivery** and **Create scoped commit**, excluding unrelated user changes and historical snapshots; no push authorized. Default approval/validation only, not durable advice completion.
- Post-commit update: removed legacy `.claude/` directory (9 files), updated package `README.md`, `bin/install.js`, `docs/usage.md`, and `docs/snyk-expert-cli.md` to keep only `.agents/`.

## Limits

Snyk absent PATH; no authorized target repository, organization/endpoint, secure credential injection or Code source-transmission authority supplied. No scanner installed, no login performed, no authenticated scan, target upgrade, live vulnerability fix or native host discovery/permission qualification claimed. Installed skill prompt behavior is distinct from real scanner behavior.

Temporary installer/packed-artifact directories were removed after both reviewer terminal reports; removal observed and source/historical paths untouched.

## Unresolved questions

No implementation or local approval question remains. Live qualification still requires operator-owned target/scanner/auth/scope prerequisites; public publication remains separately gated.
