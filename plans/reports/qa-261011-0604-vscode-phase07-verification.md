# QA Report — Phase 07 Broad Verification (`vscode-subagent-tool-references`)

**Date:** 2026-10-11
**Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md` (Phase 07 Step 8)
**Branch:** `fix/vscode-subagent-tool-references`

---

## 1. Command Execution Summary

| # | Command | Exit Code | Total | Passed | Failed | Skipped | Duration | Status |
|---|---------|-----------|-------|--------|--------|---------|----------|--------|
| 1 | `npm test` (build + 16 suites) | `0` | 1,071 | 1,046 | 0 | 25 | ~847.6s | PASS |
| 2 | `node --test tests/qualification/vscode-local-qualification.test.mjs tests/qualification/vscode-local-phase08-qualification.test.mjs` | `0` | 13 | 13 | 0 | 0 | 1.05s | PASS |
| 3 | `npm run distribute:check` | `0` | — | — | — | — | 13.84s | PASS |
| 4 | `npm run release:check` | `0` | — | — | — | — | 0.58s | PASS |
| 5 | `node .evcrate/source/.claude/scripts/validate-docs.cjs` | `0` | 14 files | 520 refs/links | 0 fatal | — | 10.91s | PASS (warnings) |
| 6a | `docs/*.md` LOC audit (`< 800` lines) | `0` | 14 files | 14 | 0 | 0 | — | PASS |
| 6b | `README.md` LOC audit (`< 300` lines) | — | 1 file | 0 | 1 (`408` LOC) | 0 | — | **FAIL** |

- **Combined Test Totals (Steps 1 + 2):** **1,084 total tests — 1,059 passed, 0 failed, 25 skipped** (all 25 skipped are Windows-specific or non-POSIX host tests on Linux x64).
- **Sealed Artifacts Integrity:** `plans/261010-1552-vscode-subagent-tool-references/reports/{native-qualification.md,native-qualification-events.jsonl,docs-workflow-qualification.md,docs-workflow-events.jsonl}` untouched.

---

## 2. Test Results Overview (`npm test` + Qualification Suites)

| Suite | Total | Passed | Failed | Skipped | Duration (ms) |
|-------|-------|--------|--------|---------|---------------|
| `test:protocol` | 53 | 53 | 0 | 0 | 199.41 |
| `test:advisor-metrics` | 6 | 6 | 0 | 0 | 127.89 |
| `test:cli` | 69 | 68 | 0 | 1 | 32,339.30 |
| `test:primitives` | 38 | 38 | 0 | 0 | 2,428.24 |
| `test:adapters` | 232 | 232 | 0 | 0 | 33,438.99 |
| `test:registry` | 32 | 32 | 0 | 0 | 651.12 |
| `test:scopes` | 24 | 24 | 0 | 0 | 477.09 |
| `test:publication` | 114 | 114 | 0 | 0 | 270,461.69 |
| `test:build-generation` (22 sub-suites) | 76 | 76 | 0 | 0 | 227,448.05 |
| `test:integration` | 37 | 37 | 0 | 0 | 116,039.23 |
| `test:cutover` | 7 | 7 | 0 | 0 | 47,627.62 |
| `test:validation-rollout` | 6 | 6 | 0 | 0 | 27,747.00 |
| `test:advisor-controller` | 332 | 308 | 0 | 24 | 14,274.76 |
| `test:release` | 23 | 23 | 0 | 0 | 13,507.84 |
| `test:installer:linux` | 17 | 17 | 0 | 0 | 1,402.06 |
| `test:distribution:rollout` | 5 | 5 | 0 | 0 | 53,758.47 |
| **Subtotal (`npm test`)** | **1,071** | **1,046** | **0** | **25** | **841,928.76** |
| `vscode-local-qualification` + `phase08-qualification` | 13 | 13 | 0 | 0 | 1,046.25 |
| **Grand Total** | **1,084** | **1,059** | **0** | **25** | **842,975.01** |

---

## 3. Coverage Metrics

- **Functional & Contract Coverage:** 100% of 16 repository suites + 2 offline VS Code qualification suites exercised (`C01`–`C50` capability matrix verified in `phase08-qualification`).
- **VS Code Subagent & Tool Reference Coverage:**
  - `test:adapters` (232/232): `mapAgentTools`, `vscode-projection`, `vscode-names`, `references`, `policy`, `tool-inputs`, `vscode-hooks`, `vscode-behavior`, `session-context`, `session-state`.
  - `test:build-generation` (76/76): Phase 09 golden/contract regressions (`evc-*` agent prefixing, no hardcoded `evcrate-local:` qualifier, 9-manifest serial/parallel byte parity).
  - `test:integration` (37/37): `vscode-installed-runtime` live bridge smoke across all 8 hook events from foreign CWD and spaces in `PLUGIN_ROOT`.
  - `vscode-local-qualification` & `vscode-local-phase08-qualification` (13/13): candidate digest parity, `linux-x64-project` and `linux-x64-home` lifecycle/policy checks, multi-root workspace isolation, untrusted workspace boundary, wrong-harness relay rejection, diagnostic protocol probes, and 50-capability index coverage.

---

## 4. Failed Tests & Non-Passing Checks

### 4.1 Test Suites
- **0 failing unit/integration/qualification tests** in final clean run.

### 4.2 Documentation Line Count Gate (`README.md`)
- **Check:** Verify `README.md` is strictly `< 300` lines.
- **Actual:** `README.md` is **408 lines** (exceeds `< 300` limit by 109 lines).
- **All `docs/*.md` files:** Strictly `< 800` lines (max: `docs/system-architecture.md` at `793` lines).

### 4.3 Environmental / Harness Observations During Initial Run
1. **`/tmp` tmpfs `usrquota` exhaustion (`EDQUOT`, errno `-122`):** Several suites (`tests/cli/package-smoke.test.mjs`, `tests/distribution/publication-*.test.mjs`) leave `/tmp/evcrate-*` temp directories behind (~166 MB per `package-smoke` run). When `/tmp` (`tmpfs` with `usrquota`) was near its 9.0 GB user quota (8.7 GB used), `tests/distribution/publication-apply.test.mjs:417` (`project apply rejects an oversized result before transaction mutation`) hit `EDQUOT`. Cleaning stale `/tmp/evcrate-*` and `/tmp/.evcrate-*` directories freed ~755 MB and resolved the issue completely.
2. **Stale `dist/release` cache in `test:validation-rollout`:** `tests/distribution/validation-and-rollout.test.mjs:84` checks `if (!existsSync(installSh))` before running `prepare-release-assets.cjs`. Because `test:validation-rollout` runs before `test:release` in `npm test`, a pre-existing `dist/release/` from `v2.10.0` (Oct 7) was reused until `dist/release/` was cleared and regenerated for `v2.11.0`.

---

## 5. Build, Distribution, Release & Docs Validation Status

1. **`npm run build:all` (via `npm test`):** `0` — `generate-runtime-brief.mjs`, `generate:advisor-runtime`, `generate-controller-inventory.mjs`, and `build-typescript.mjs` succeeded with zero warnings/errors.
2. **`npm run distribute:check`:** `0` — `{"operation":"distribute.check","payload":{"action":"check","engine":"typescript"},"protocol":"evcrate-resource-control","protocolVersion":1,"status":"ok"}`.
3. **`npm run release:check`:** `0` — `validateRuntimeClosure(process.cwd())` passed.
4. **`node .evcrate/source/.claude/scripts/validate-docs.cjs`:** `0` — Checked 14 files; 24 code references and 496 internal links verified OK; non-blocking heuristic warnings reported (115 prose/historical code symbols, 5 archived plan report links, 134 config tokens not in `.env.example`).
5. **Line Count Audit (`wc -l docs/*.md README.md`):**

| File | Lines | Limit | Status |
|------|-------|-------|--------|
| `docs/all-project-advisor-history.md` | 192 | `< 800` | PASS |
| `docs/code-standards.md` | 786 | `< 800` | PASS |
| `docs/codebase-summary.md` | 746 | `< 800` | PASS |
| `docs/design-guidelines.md` | 205 | `< 800` | PASS |
| `docs/pi-native-migration.md` | 161 | `< 800` | PASS |
| `docs/project-changelog-archive.md` | 772 | `< 800` | PASS |
| `docs/project-changelog.md` | 767 | `< 800` | PASS |
| `docs/project-overview-pdr.md` | 641 | `< 800` | PASS |
| `docs/project-roadmap.md` | 259 | `< 800` | PASS |
| `docs/snyk-expert-cli.md` | 32 | `< 800` | PASS |
| `docs/system-architecture.md` | 793 | `< 800` | PASS |
| `docs/upgrade-backup-and-leftover-guidance.md` | 113 | `< 800` | PASS |
| `docs/workspace-advisor-host-contract.md` | 145 | `< 800` | PASS |
| `docs/workspace-advisor-pdr.md` | 181 | `< 800` | PASS |
| `README.md` | **408** | `< 300` | **FAIL** |

---

## 6. Performance Metrics

- **Total `npm test` wall time:** ~847.6s (~14.1m).
- **Slowest suites:**
  - `test:publication`: 270.46s (`mixed publication owns native leaves` 24.1s, `current publication consumes predecessor ownership` 20.8s, `OMP publication` 13.1s).
  - `test:build-generation`: 227.45s (`Gate 1: Full Projected Output Tree & Manifest Byte Parity` 51.2s, `Phase 02: Single-Projection Manifest Reuse` 46.8s, `Phase 03: Bounded Worker Staging` 32.0s).
  - `test:integration`: 116.04s (7 multi-scope HOME/project fixture builds ~9–19s each + `dam-hopper consumer` 16.2s).
  - `test:distribution:rollout`: 53.76s (`Linux release verification script passes with unshare network isolation` 22.0s).
- **Fastest suites:** `test:advisor-metrics` (0.13s), `test:protocol` (0.20s), `test:scopes` (0.48s), `test:registry` (0.65s), `vscode-local-*` qualification (1.05s).

---

## 7. Critical Issues & Recommendations

### Critical Issues
- **`README.md` line count (`408` lines vs `< 300` requirement):** `README.md` currently has 408 lines (sections on Unified Naming, Canonical `AGENTS.md`, and Migration Contract occupy lines 280–408). Per QA read-only rules, `README.md` was not modified.

### Recommendations & Next Steps
1. **Trim `README.md` to `< 300` lines** (if strict `< 300` LOC is enforced for Phase 07 sign-off) by condensing the v3.0.0 migration tables/examples and linking to `docs/system-architecture.md` and `docs/upgrade-backup-and-leftover-guidance.md`.
2. **Ensure `test:validation-rollout` validates version-matched `dist/release` assets:** Check `evcrate-v${pkg.version}.release.json` in addition to `install.sh` existence in `tests/distribution/validation-and-rollout.test.mjs:84` so stale build artifacts from older versions do not cause false negatives.
3. **Ensure temp dir cleanup in `tests/cli/package-smoke.test.mjs`:** Add `rmSync(root, { recursive: true, force: true })` in `finally` to prevent 166 MB `/tmp/evcrate-package-smoke-*` leaks on `tmpfs`.

---

## 8. Unresolved Questions

1. Should `README.md` (currently 408 lines, unchanged in working tree) be condensed below 300 lines as part of Phase 07, or is the `< 300` line threshold waived given the v3.0.0 migration contract tables?
