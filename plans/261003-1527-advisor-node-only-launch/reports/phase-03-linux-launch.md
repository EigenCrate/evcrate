# Phase 03 — Linux launch verification receipt

**Date:** 2026-10-04  
**Evidence scope:** Interim Linux launch verification and portable test fixtures  
**Review:** 9.9/10; approved, with no critical findings or warnings

> Evidence receipt only. Parent owns Phase 03 reconciliation and durable completion status; this report does not seal or declare durable phase completion. This is interim Linux evidence, not final packaged-candidate, native Windows, or Darwin qualification.

## Scope delivered

- `tests/advisor-controller/fixtures/provider-fixture.cjs`: package-shaped Codex/OMP fakes; platform-appropriate `.cmd` or POSIX launchers; path-delimiter-aware, secret-filtered and recursion-marker-clean test environment.
- `tests/advisor-controller/fixtures/node-launch-helpers.cjs`: disposable HOME, two projects, bin and temp roots with spaces/Unicode; explicit `process.execPath` launch and cleanup.
- `tests/advisor-controller/node-launch.test.cjs`: installed private-HOME publication, v2 state/advice lifecycle, history operations, project isolation, non-executable script, launch and HOME failures, malformed/oversized input, decoy avoidance, and headless human-decision refusal.
- `tests/advisor-controller/interactive-console-verification.py`: real Linux PTY/`/dev/tty` confirmation scenarios, separate from automated no-TTY checks.
- `tests/cli/health.test.mjs`: diagnostic-boundary, malformed-output, working-directory, Unicode-path, non-executable script, and unlaunchable-Node regressions.

Fixtures and tests use isolated temporary roots and fake providers; no live vendor qualification is claimed.

## Validation receipts

Command results below are from the Phase 03 code-review validation record, not rerun for this documentation update.

| Gate | Command | Passed | Skipped | Failed |
|---|---|---:|---:|---:|
| CLI | `npm run test:cli` | 68 | 1 | 0 |
| Advisor controller | `npm run test:advisor-controller` | 243 | 24 | 0 |
| Phase 08 integration | `node --test tests/adapters/phase08-mentoring-integration.test.mjs` | 8 | 0 | 0 |
| Phase 10 integration | `node --test tests/distribution/phase10-controller-scenarios.test.mjs tests/distribution/phase10-human-gate.test.mjs` | 8 | 0 | 0 |
| 30-second smoke | `node tests/advisor-controller/smoke-30s.cjs` | 1 | 0 | 0 |
| Interactive Linux console | `python3 tests/advisor-controller/interactive-console-verification.py` | 3 | 0 | 0 |
| **Total** |  | **331** | **25** | **0** |

The aggregate is **68 + 243 + 16 + 1 + 3 = 331 passes**, plus **25 skips**, for 356 reported outcomes. The review record also contains a separate “339 executed” headline that does not reconcile with its command subtotals; this receipt uses the command-level totals above.

Additional checks reported by the reviewer, not rerun here: `npm run build` exited 0; `npm run distribute:check` returned `status: ok`.

### Why 25 tests were skipped

These are platform gates, not passing Windows evidence:

- **1 CLI skip:** `Windows native context and reparse contract suite` in `tests/context/windows-paths.test.mjs` requires a Windows host.
- **24 advisor-controller skips:** Windows-specific Job Object/supervision, native pinned-file/CAS, launch/environment, and console-observation cases; guarded by `!isWindows`. Suite breakdown: `supervision-console.test.cjs` 9, `verification-lifecycle.test.cjs` 8, `verification-regressions.test.cjs` 7.

No Windows or Darwin runtime claim follows from these skips or from Linux fixture preparation.

## Scenario receipts

- **Private-HOME install and path handling (N02–N04, N07):** Publication dry-run/apply placed the controller closure under the isolated HOME, preserved the routing policy, and left both project directories without controller binaries. HOME, projects, and temp/bin paths include spaces and non-ASCII characters.
- **Installed Node lifecycle (N02, N08):** Explicit Node launch completed init (revision 0→1), checkpoint (1→2), advice (2→4), get (revision 4), disposition (4→5), outcome (5→6), and complete (6→7, gate `completed`). The result was `ADVICE_READY`; the fake provider launched once; correlation/history identity persisted. The declared `node --version` validation probe exited successfully.
- **History CLI (N11):** List/show/metrics returned the generated consultation; export dry-run created no destination and apply created it; prune dry-run retained the recent record.
- **Project isolation (N03, N04, N07):** Distinct project hashes under one Unicode HOME stayed isolated; Project B saw no Project A history/state.
- **Execute-bit independence (N08):** A private installed controller with mode `0o644` completed state init/get through explicit Node. The CLI health regression also qualified a `0o644` script.
- **Fail-closed launch and HOME cases (N05–N07, N12–N13):** An unlaunchable Node produced a spawn failure; a missing installed script failed without running a project-local decoy; empty, relative, and absent HOME failed without project fallback writes. Malformed JSON and an input exceeding 32 KiB returned failure, not success.
- **Health diagnostic boundary:** Tests verified the diagnostic request shape and correlated failure, rejected malformed/counsel-shaped/extra-line/stderr/malformed-UTF-8 or exit-status-inconsistent output, and confirmed package-root cwd even when project-root differed.
- **Human-decision gate (N15):** Headless invocation returned `HUMAN_EVENT_REQUIRED`. The separately run Linux console scenarios rejected a wrong/replayed nonce, accepted the current exact challenge at revision 2 with source `local-terminal-confirmation`, and cancelled on abort. All three console scenarios passed.

## Evidence limits and handoff

- Results cover the interim Linux source/generated snapshot used for the recorded gates; they do not identify a final transfer bundle.
- Portable `.cmd` fixture generation prepares later Windows tests but does not execute or qualify them.
- Native Windows scenarios remain unrun; Darwin build/runtime and Phase 06 final-package qualification remain outside this receipt.
- Phase 03 durable completion/reconciliation remains parent-owned.

## Unresolved questions

None for the Linux scenarios recorded here. Windows and Darwin qualification remain later platform gates, not unresolved Linux test failures.
